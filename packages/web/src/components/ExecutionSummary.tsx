import { useCallback, useMemo, useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { Persona, EvaluatorResultEntry, Run } from "../lib/api";
import { projectImageUrl } from "../lib/api";
import { useConnectors } from "../hooks/useConnectors";
import { usePersonas } from "../hooks/usePersonas";
import { useRunsByEval } from "../hooks/useRuns";
import { useScenarios } from "../hooks/useScenarios";
import { useProjectId } from "../hooks/useProjectId";
import { RunMessagesModal } from "./RunMessagesModal";

interface ExecutionSummaryProps {
  evalId: string;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  passed: number;
  failed: number;
  error: number;
  total: number;
  avgLatency: number;
}

interface FailureInfo {
  runId: string;
  scenarioName: string;
  personaId?: string;
  personaName?: string;
  reason: string;
  isError: boolean;
}

export interface ExecutionData {
  executionId: number;
  passed: number;
  failed: number;
  errors: number;
  running: number;
  total: number;
  avgLatency: number;
  totalTokens: number;
  maxLatency: number;
  maxLatencyRunId: string | null;
  avgMessages: number;
  maxTokens: number;
  maxTokensRunId: string | null;
  connectorName: string | null;
  executionPersonas: Persona[];
  scenarioResults: ScenarioResult[];
  failures: FailureInfo[];
  executionStart: number | null;
  executionEnd: number | null;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens)}`;
}

function getTokenUsage(run: Run): { input: number; output: number; total: number } | null {
  const output = run.output as Record<string, unknown> | undefined;
  const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
  const tokenEval = evaluatorResults?.find((r) => r.type === "token-usage");
  const usage = tokenEval?.metadata as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | undefined;
  if (!usage?.total_tokens) return null;
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    total: usage.total_tokens,
  };
}

function getRunLatency(run: Run): number {
  const lat = (run.output as Record<string, unknown>)?.avgLatencyMs as number | undefined;
  return typeof lat === "number" && lat > 0 ? lat : 0;
}

function getRunMessageCount(run: Run): number {
  const count = (run.output as Record<string, unknown>)?.messageCount as number | undefined;
  return typeof count === "number" ? count : 0;
}

function buildExecutionData(
  executionId: number,
  allRuns: Run[],
  personas: Persona[],
  scenarioNames: Map<string, string>,
  connectorNames: Map<string, string>,
): ExecutionData | null {
  const executionRuns = allRuns.filter((r) => r.executionId === executionId);

  const finishedRuns = executionRuns.filter(
    (r) => r.status === "completed" || r.status === "error"
  );
  if (finishedRuns.length === 0) return null;

  const passed = finishedRuns.filter((r) => r.result?.success).length;
  const failed = finishedRuns.filter((r) => r.status === "completed" && !r.result?.success).length;
  const errors = finishedRuns.filter((r) => r.status === "error").length;
  const running = executionRuns.filter((r) => r.status === "running" || r.status === "queued").length;
  const total = executionRuns.length;

  // Latency
  const latencies = finishedRuns
    .map((r) => ({ latency: getRunLatency(r), id: r.id }))
    .filter((l) => l.latency > 0);
  const avgLatency = latencies.length > 0
    ? latencies.reduce((sum, l) => sum + l.latency, 0) / latencies.length
    : 0;

  // Max latency (with run ID for linking)
  let maxLatency = 0;
  let maxLatencyRunId: string | null = null;
  for (const l of latencies) {
    if (l.latency > maxLatency) {
      maxLatency = l.latency;
      maxLatencyRunId = l.id;
    }
  }

  // Tokens (total + max per run with run ID for linking)
  const tokenUsages = finishedRuns
    .map((r) => ({ usage: getTokenUsage(r), id: r.id }))
    .filter((t): t is { usage: NonNullable<ReturnType<typeof getTokenUsage>>; id: string } => t.usage !== null);
  const totalTokens = tokenUsages.reduce((sum, t) => sum + t.usage.total, 0);
  let maxTokens = 0;
  let maxTokensRunId: string | null = null;
  for (const t of tokenUsages) {
    if (t.usage.total > maxTokens) {
      maxTokens = t.usage.total;
      maxTokensRunId = t.id;
    }
  }

  // Message counts
  const messageCounts = finishedRuns
    .map((r) => ({ count: getRunMessageCount(r), id: r.id }))
    .filter((m) => m.count > 0);
  const avgMessages = messageCounts.length > 0
    ? messageCounts.reduce((sum, m) => sum + m.count, 0) / messageCounts.length
    : 0;

  // Connector name (from first run that has one)
  const firstConnectorId = executionRuns.find((r) => r.connectorId)?.connectorId;
  const connectorName = firstConnectorId ? (connectorNames.get(firstConnectorId) ?? null) : null;

  // Unique personas
  const personaIds = [...new Set(executionRuns.map((r) => r.personaId).filter(Boolean))] as string[];
  const personaLookup = new Map(personas.map((p) => [p.id, p]));
  const executionPersonas = personaIds
    .map((id) => personaLookup.get(id))
    .filter((p): p is Persona => p !== undefined);

  // Per-scenario breakdown
  const scenarioMap = new Map<string, ScenarioResult>();
  for (const run of finishedRuns) {
    const sid = run.scenarioId ?? "";
    const existing = scenarioMap.get(sid) ?? {
      scenarioId: sid,
      scenarioName: scenarioNames.get(sid) ?? sid,
      passed: 0,
      failed: 0,
      error: 0,
      total: 0,
      avgLatency: 0,
    };

    existing.total++;
    if (run.status === "error") existing.error++;
    else if (run.result?.success) existing.passed++;
    else existing.failed++;

    const lat = getRunLatency(run);
    if (lat > 0) {
      existing.avgLatency = (existing.avgLatency * (existing.total - 1) + lat) / existing.total;
    }

    scenarioMap.set(sid, existing);
  }

  const scenarioResults = Array.from(scenarioMap.values());

  // Failure reasons
  const personaMap = new Map(personas.map((p) => [p.id, p]));
  const failures: FailureInfo[] = [];
  for (const run of finishedRuns) {
    const rsid = run.scenarioId ?? "";
    if (run.status === "error" && run.error) {
      failures.push({
        runId: run.id,
        scenarioName: scenarioNames.get(rsid) ?? rsid,
        personaId: run.personaId ?? undefined,
        personaName: run.personaId ? personaMap.get(run.personaId)?.name : undefined,
        reason: run.error,
        isError: true,
      });
    } else if (run.status === "completed" && !run.result?.success && run.result?.reason) {
      failures.push({
        runId: run.id,
        scenarioName: scenarioNames.get(rsid) ?? rsid,
        personaId: run.personaId ?? undefined,
        personaName: run.personaId ? personaMap.get(run.personaId)?.name : undefined,
        reason: run.result.reason,
        isError: false,
      });
    }
  }

  // Timing
  const startTimes = executionRuns
    .map((r) => r.startedAt ? new Date(r.startedAt).getTime() : null)
    .filter((t): t is number => t !== null);
  const endTimes = executionRuns
    .map((r) => r.completedAt ? new Date(r.completedAt).getTime() : null)
    .filter((t): t is number => t !== null);

  const executionStart = startTimes.length > 0 ? Math.min(...startTimes) : null;
  const executionEnd = endTimes.length > 0 ? Math.max(...endTimes) : null;

  return {
    executionId,
    passed,
    failed,
    errors,
    running,
    total,
    avgLatency,
    totalTokens,
    maxLatency,
    maxLatencyRunId,
    avgMessages,
    maxTokens,
    maxTokensRunId,
    connectorName,
    executionPersonas,
    scenarioResults,
    failures,
    executionStart,
    executionEnd,
  };
}

/**
 * Hook that encapsulates persona/scenario/connector fetching and returns
 * a stable builder function: (executionId, runs) => ExecutionData | null
 */
export function useExecutionDataBuilder() {
  const { data: personas = [] } = usePersonas();
  const { data: scenarios = [] } = useScenarios();
  const { data: connectors = [] } = useConnectors();

  const scenarioNames = useMemo(
    () => new Map(scenarios.map((s) => [s.id, s.name])),
    [scenarios]
  );
  const connectorNames = useMemo(
    () => new Map(connectors.map((c) => [c.id, c.name])),
    [connectors]
  );

  return useCallback(
    (executionId: number, runs: Run[]) =>
      buildExecutionData(executionId, runs, personas, scenarioNames, connectorNames),
    [personas, scenarioNames, connectorNames]
  );
}

/* ── Shared donut + stats (used by ExecutionSummary and RecentEvalCards) ── */

export interface ExecutionMetricsProps {
  summary: ExecutionData;
  onViewRun?: (runId: string) => void;
}

const viewRunIcon = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3H3v10h10V9" />
    <path d="M10 2h4v4" />
    <path d="M8 8l6-6" />
  </svg>
);

export function ExecutionMetrics({ summary, onViewRun }: ExecutionMetricsProps) {
  const passRate = summary.total > 0
    ? Math.round((summary.passed / (summary.passed + summary.failed + summary.errors)) * 100)
    : 0;

  const pieData = [
    { name: "Passed", value: summary.passed, color: "#22c55e" },
    { name: "Failed", value: summary.failed, color: "#ef4444" },
    ...(summary.errors > 0 ? [{ name: "Error", value: summary.errors, color: "#f59e0b" }] : []),
    ...(summary.running > 0 ? [{ name: "Running", value: summary.running, color: "#94a3b8" }] : []),
  ].filter((d) => d.value > 0);

  return (
    <>
      {/* Pass Rate Donut */}
      <div className="execution-summary-donut">
        <div className="execution-summary-donut-chart">
          <ResponsiveContainer width={100} height={100}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={45}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="execution-summary-donut-label">
            <span className="execution-summary-donut-value">{passRate}%</span>
          </div>
        </div>
        <div className="execution-summary-donut-legend">
          <span className="execution-summary-legend-pill passed">{summary.passed} passed</span>
          <span className="execution-summary-legend-pill failed">{summary.failed} failed</span>
          {summary.errors > 0 && (
            <span className="execution-summary-legend-pill error">{summary.errors} error</span>
          )}
        </div>
      </div>

      {/* Stats — 2 columns */}
      <div className="execution-summary-stats">
        <div className="execution-summary-stat">
          <span className="execution-summary-stat-value">{summary.total}</span>
          <span className="execution-summary-stat-label">Runs</span>
        </div>
        <div className="execution-summary-stat">
          <span className="execution-summary-stat-value">
            {summary.avgMessages > 0 ? summary.avgMessages.toFixed(1) : "—"}
          </span>
          <span className="execution-summary-stat-label">Avg Messages</span>
        </div>
        <div className="execution-summary-stat">
          <span className="execution-summary-stat-value">
            {summary.avgLatency > 0 ? formatLatency(summary.avgLatency) : "—"}
          </span>
          <span className="execution-summary-stat-label">Avg Latency</span>
        </div>
        <div className="execution-summary-stat">
          {onViewRun && summary.maxLatencyRunId ? (
            <div className="execution-summary-stat-row">
              <span className="execution-summary-stat-value">
                {summary.maxLatency > 0 ? formatLatency(summary.maxLatency) : "—"}
              </span>
              <button
                className="execution-summary-stat-icon"
                onClick={() => onViewRun(summary.maxLatencyRunId!)}
                title="View run"
              >
                {viewRunIcon}
              </button>
            </div>
          ) : (
            <span className="execution-summary-stat-value">
              {summary.maxLatency > 0 ? formatLatency(summary.maxLatency) : "—"}
            </span>
          )}
          <span className="execution-summary-stat-label">Max Latency</span>
        </div>
        <div className="execution-summary-stat">
          <span className="execution-summary-stat-value">
            {summary.totalTokens > 0 ? formatTokens(summary.totalTokens) : "—"}
          </span>
          <span className="execution-summary-stat-label">Total Tokens</span>
        </div>
        <div className="execution-summary-stat">
          {onViewRun && summary.maxTokensRunId ? (
            <div className="execution-summary-stat-row">
              <span className="execution-summary-stat-value">
                {summary.maxTokens > 0 ? formatTokens(summary.maxTokens) : "—"}
              </span>
              <button
                className="execution-summary-stat-icon"
                onClick={() => onViewRun(summary.maxTokensRunId!)}
                title="View run"
              >
                {viewRunIcon}
              </button>
            </div>
          ) : (
            <span className="execution-summary-stat-value">
              {summary.maxTokens > 0 ? formatTokens(summary.maxTokens) : "—"}
            </span>
          )}
          <span className="execution-summary-stat-label">Max Tokens</span>
        </div>
      </div>
    </>
  );
}

/* ── Full ExecutionSummary (used on eval detail page) ── */

export function ExecutionSummary({ evalId }: ExecutionSummaryProps) {
  const projectId = useProjectId();
  const { data: runs = [] } = useRunsByEval(evalId);
  const { data: personas = [] } = usePersonas();
  const buildExec = useExecutionDataBuilder();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Get sorted list of execution IDs that have at least some finished runs
  const executionIds = useMemo(() => {
    const runsWithExecution = runs.filter((r) => r.executionId != null);
    const ids = [...new Set(runsWithExecution.map((r) => r.executionId!))].sort((a, b) => a - b);
    return ids.filter((id) =>
      runsWithExecution.some(
        (r) => r.executionId === id && (r.status === "completed" || r.status === "error")
      )
    );
  }, [runs]);

  // Index into executionIds — default to the last (latest)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Reset to latest when executionIds change (new execution added)
  useEffect(() => {
    setSelectedIndex(executionIds.length - 1);
  }, [executionIds.length]);

  const currentIndex = selectedIndex >= 0 && selectedIndex < executionIds.length
    ? selectedIndex
    : executionIds.length - 1;

  const summary = useMemo(() => {
    if (executionIds.length === 0 || currentIndex < 0) return null;
    return buildExec(executionIds[currentIndex], runs);
  }, [executionIds, currentIndex, runs, buildExec]);

  // Build persona lookup for failure avatars
  const personaMap = useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas]
  );

  if (!summary) return null;

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < executionIds.length - 1;
  const isLatest = !canNext;

  const scenarioBarData = summary.scenarioResults.map((s) => ({
    name: s.scenarioName.length > 50 ? s.scenarioName.slice(0, 48) + "..." : s.scenarioName,
    fullName: s.scenarioName,
    Passed: s.passed,
    Failed: s.failed,
    Error: s.error,
  }));

  const formatTime = (ts: number | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="execution-summary">
      <div className="execution-summary-header">
        <div className="execution-summary-title">
          <h3>{isLatest ? `Last Evaluation (#${summary.executionId})` : `Evaluation #${summary.executionId}`}{summary.connectorName ? ` — ${summary.connectorName}` : ""}</h3>
          <span className="execution-summary-time">
            {formatTime(summary.executionStart)}
          </span>
        </div>
        <div className="execution-summary-header-right">
          {summary.running > 0 && (
            <span className="execution-summary-badge running">
              {summary.running} running
            </span>
          )}
          {executionIds.length > 1 && (
            <div className="execution-summary-pager">
              <button
                className="execution-summary-pager-btn"
                disabled={!canPrev}
                onClick={() => setSelectedIndex(currentIndex - 1)}
                aria-label="Previous evaluation"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 12L6 8l4-4" />
                </svg>
              </button>
              <span className="execution-summary-pager-label">
                {currentIndex + 1} / {executionIds.length}
              </span>
              <button
                className="execution-summary-pager-btn"
                disabled={!canNext}
                onClick={() => setSelectedIndex(currentIndex + 1)}
                aria-label="Next evaluation"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="execution-summary-body">
        <ExecutionMetrics summary={summary} onViewRun={setSelectedRunId} />

        {/* Scenario Breakdown Chart */}
        {scenarioBarData.length > 0 && (
          <div className="execution-summary-scenarios">
            <ResponsiveContainer width="100%" height={Math.max(scenarioBarData.length * 24 + 16, 60)}>
              <BarChart
                data={scenarioBarData}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                barSize={14}
                barGap={2}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={250}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullName ?? "";
                  }}
                />
                <Bar dataKey="Passed" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Failed" stackId="a" fill="#ef4444" />
                <Bar dataKey="Error" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Failure Reasons — full width below, with persona avatars */}
      {summary.failures.length > 0 && (
        <div className="execution-summary-failures">
          <h4>Issues</h4>
          <div className="execution-summary-failure-list">
            {summary.failures.map((f, i) => {
              const persona = f.personaId ? personaMap.get(f.personaId) : null;
              return (
                <div key={i} className={`execution-summary-failure ${f.isError ? "is-error" : "is-failed"}`}>
                  {persona && (
                    <div className="execution-summary-failure-avatar" title={persona.name}>
                      {persona.imageUrl ? (
                        <img
                          src={`${projectImageUrl(projectId, persona.imageUrl)}?t=${persona.updatedAt}`}
                          alt={persona.name}
                        />
                      ) : (
                        <span>{persona.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  )}
                  <div className="execution-summary-failure-content">
                    <span className="execution-summary-failure-context">
                      {f.scenarioName}{f.personaName ? ` / ${f.personaName}` : ""}{summary.connectorName ? ` · ${summary.connectorName}` : ""}
                    </span>
                    <span className="execution-summary-failure-reason">{f.reason}</span>
                  </div>
                  <button
                    className="execution-summary-stat-icon"
                    onClick={() => setSelectedRunId(f.runId)}
                    title="View run"
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 3H3v10h10V9" />
                      <path d="M10 2h4v4" />
                      <path d="M8 8l6-6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedRunId && (
        <RunMessagesModal
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}
