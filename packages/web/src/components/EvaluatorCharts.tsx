import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Run, EvaluatorResultEntry, EvaluatorChartType, EvaluatorTypeInfo } from "../lib/api";
import { useEvaluatorTypes } from "../hooks/useEvaluatorTypes";

interface EvaluatorChartsProps {
  runs: Run[];
}

interface EvaluatorInfo {
  type: string;
  label: string;
  kind: "assertion" | "metric";
  chartType: EvaluatorChartType;
}

interface EvaluatorDataPoint {
  label: string;
  value: number;
}

interface ScatterRunPoint {
  x: number;
  value: number;
}

function formatExecutionId(executionId: number): string {
  return `#${executionId}`;
}

/**
 * Collect all unique evaluator types from completed runs, excluding token-usage
 * (already shown in the PerformanceChart as Output Tokens).
 * Reads chartType from the registered evaluator type info.
 */
function collectEvaluatorTypes(
  runs: Run[],
  evaluatorTypeInfos: EvaluatorTypeInfo[]
): EvaluatorInfo[] {
  const seen = new Map<string, EvaluatorInfo>();
  const typeInfoMap = new Map<string, EvaluatorTypeInfo>();
  for (const t of evaluatorTypeInfos) typeInfoMap.set(t.type, t);

  for (const run of runs) {
    const output = run.output as Record<string, unknown> | undefined;
    const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
    if (!evaluatorResults) continue;

    for (const r of evaluatorResults) {
      if (r.type === "token-usage") continue;
      if (seen.has(r.type)) continue;
      const info = typeInfoMap.get(r.type);
      seen.set(r.type, {
        type: r.type,
        label: r.label,
        kind: r.kind,
        chartType: info?.chartType ?? (r.kind === "assertion" ? "bar" : "scatter"),
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Build chart data for a single evaluator type, grouped by executionId.
 * - Metrics: average value across runs in each execution
 * - Assertions: pass rate (%) across runs in each execution
 */
function buildChartData(
  runs: Run[],
  evaluatorType: string,
  kind: "assertion" | "metric"
): EvaluatorDataPoint[] {
  const byExecution = new Map<number, { values: number[]; passes: number; total: number }>();

  for (const run of runs) {
    if (run.executionId == null) continue;

    const output = run.output as Record<string, unknown> | undefined;
    const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
    if (!evaluatorResults) continue;

    const result = evaluatorResults.find((r) => r.type === evaluatorType);
    if (!result) continue;

    const group = byExecution.get(run.executionId) ?? { values: [], passes: 0, total: 0 };
    group.total++;

    if (kind === "metric" && result.value != null) {
      group.values.push(result.value);
    } else if (kind === "assertion") {
      if (result.success) group.passes++;
    }

    byExecution.set(run.executionId, group);
  }

  const sorted = Array.from(byExecution.entries()).sort((a, b) => a[0] - b[0]);

  return sorted.map(([executionId, group]) => ({
    label: formatExecutionId(executionId),
    value:
      kind === "metric"
        ? group.values.length > 0
          ? Math.round((group.values.reduce((s, v) => s + v, 0) / group.values.length) * 10) / 10
          : 0
        : group.total > 0
          ? Math.round((group.passes / group.total) * 1000) / 10
          : 0,
  }));
}

/**
 * Build per-run scatter points for a metric evaluator, aligned to the
 * execution indices of the aggregated chart data.
 */
function buildScatterData(
  runs: Run[],
  evaluatorType: string,
  chartData: EvaluatorDataPoint[]
): ScatterRunPoint[] {
  const labelToIndex = new Map(chartData.map((d, i) => [d.label, i]));
  const points: ScatterRunPoint[] = [];

  for (const run of runs) {
    if (run.executionId == null) continue;
    const label = formatExecutionId(run.executionId);
    const idx = labelToIndex.get(label);
    if (idx === undefined) continue;

    const output = run.output as Record<string, unknown> | undefined;
    const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
    if (!evaluatorResults) continue;

    const result = evaluatorResults.find((r) => r.type === evaluatorType);
    if (!result || result.value == null) continue;

    points.push({ x: idx, value: result.value });
  }

  return points;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "12px",
};

const AXIS_TICK = { fontSize: 11, fill: "#64748b" };
const AXIS_LINE = { stroke: "#e2e8f0" };
const GRID_DASH = "3 3";
const GRID_COLOR = "#e2e8f0";

function ChartContent({
  data,
  scatterPoints,
  isAssertion,
  chartType,
  color,
}: {
  data: EvaluatorDataPoint[];
  scatterPoints?: ScatterRunPoint[];
  isAssertion: boolean;
  chartType: EvaluatorChartType;
  color: string;
}) {
  const tooltipFormatter = (value: unknown) => {
    const v = typeof value === "number" ? value : 0;
    return [isAssertion ? `${v}%` : v, isAssertion ? "Pass Rate" : "Value"];
  };
  const labelFormatter = (label: unknown) => `Execution: ${label}`;

  if (chartType === "bar") {
    return (
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={AXIS_LINE} axisLine={AXIS_LINE} />
        <YAxis
          domain={isAssertion ? [0, 100] : undefined}
          tick={AXIS_TICK}
          tickLine={AXIS_LINE}
          axisLine={AXIS_LINE}
          tickFormatter={isAssertion ? (v) => `${v}%` : undefined}
          width={45}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={labelFormatter} />
        <Bar dataKey="value" name={isAssertion ? "Pass Rate" : "Value"} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    );
  }

  if (chartType === "scatter") {
    const avgLineData = data.map((d, i) => ({ x: i, avg: d.value }));
    return (
      <ComposedChart
        data={avgLineData}
        margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID_COLOR} />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, Math.max(data.length - 1, 0)]}
          ticks={data.map((_, i) => i)}
          tickFormatter={(i) => data[i]?.label ?? ""}
          tick={AXIS_TICK}
          tickLine={AXIS_LINE}
          axisLine={AXIS_LINE}
        />
        <YAxis
          domain={isAssertion ? [0, 100] : undefined}
          tick={AXIS_TICK}
          tickLine={AXIS_LINE}
          axisLine={AXIS_LINE}
          tickFormatter={isAssertion ? (v) => `${v}%` : undefined}
          width={45}
        />
        <Tooltip content={() => null} cursor={false} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: "12px", paddingBottom: "8px" }} />
        <Scatter
          data={scatterPoints ?? []}
          dataKey="value"
          name={isAssertion ? "Pass Rate" : "Value"}
          fill={color}
        />
        <Line
          type="monotone"
          dataKey="avg"
          name="Avg"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          activeDot={false}
        />
      </ComposedChart>
    );
  }

  // Default: line chart
  return (
    <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID_COLOR} />
      <XAxis dataKey="label" tick={AXIS_TICK} tickLine={AXIS_LINE} axisLine={AXIS_LINE} />
      <YAxis
        domain={isAssertion ? [0, 100] : undefined}
        tick={AXIS_TICK}
        tickLine={AXIS_LINE}
        axisLine={AXIS_LINE}
        tickFormatter={isAssertion ? (v) => `${v}%` : undefined}
        width={45}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} labelFormatter={labelFormatter} />
      <Line
        type="monotone"
        dataKey="value"
        name={isAssertion ? "Pass Rate" : "Value"}
        stroke={color}
        strokeWidth={2}
        dot={{ fill: color, strokeWidth: 0, r: 3 }}
        activeDot={{ r: 5 }}
      />
    </LineChart>
  );
}

export function EvaluatorCharts({ runs }: EvaluatorChartsProps) {
  const { data: evaluatorTypeInfos = [] } = useEvaluatorTypes();

  const completedRuns = useMemo(
    () => runs.filter((r) => r.status === "completed" && r.result !== undefined),
    [runs]
  );

  const evaluatorTypes = useMemo(
    () => collectEvaluatorTypes(completedRuns, evaluatorTypeInfos),
    [completedRuns, evaluatorTypeInfos]
  );

  const chartDataMap = useMemo(() => {
    const map = new Map<string, EvaluatorDataPoint[]>();
    for (const ev of evaluatorTypes) {
      const data = buildChartData(completedRuns, ev.type, ev.kind).slice(-20);
      if (data.length > 0) {
        map.set(ev.type, data);
      }
    }
    return map;
  }, [completedRuns, evaluatorTypes]);

  const scatterDataMap = useMemo(() => {
    const map = new Map<string, ScatterRunPoint[]>();
    for (const ev of evaluatorTypes) {
      if (ev.chartType !== "scatter") continue;
      const aggData = chartDataMap.get(ev.type);
      if (!aggData) continue;
      map.set(ev.type, buildScatterData(completedRuns, ev.type, aggData));
    }
    return map;
  }, [completedRuns, evaluatorTypes, chartDataMap]);

  // Only show evaluators that have data
  const evaluatorsWithData = evaluatorTypes.filter((ev) => chartDataMap.has(ev.type));

  if (evaluatorsWithData.length === 0) {
    return null;
  }

  return (
    <>
      <h3 className="section-label">Evaluators</h3>
      <div className="evaluator-charts">
        {evaluatorsWithData.map((ev) => {
          const data = chartDataMap.get(ev.type)!;
          const isAssertion = ev.kind === "assertion";
          const color = isAssertion ? "#22c55e" : "#3b82f6";

          return (
            <div key={ev.type} className="evaluator-chart">
              <h3 className="performance-chart-title">{ev.label}</h3>
              <ResponsiveContainer width="100%" height={160}>
                <ChartContent
                  data={data}
                  scatterPoints={scatterDataMap.get(ev.type)}
                  isAssertion={isAssertion}
                  chartType={ev.chartType}
                  color={color}
                />
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </>
  );
}
