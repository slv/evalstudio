import type { Run, EvaluatorResultEntry } from "../lib/api";

interface LLMCriteriaResult {
  successMet?: boolean;
  failureMet?: boolean;
  confidence?: number;
  reasoning?: string;
  messageCount?: number;
  avgLatencyMs?: number;
  maxMessagesReached?: boolean;
}

interface EvaluatorResultsProps {
  run: Run;
}

/** Extract LLM criteria result from run output */
function getCriteriaResult(run: Run): LLMCriteriaResult | null {
  const output = run.output as Record<string, unknown> | undefined;
  if (!output) return null;

  const evaluation = output.evaluation as Record<string, unknown> | undefined;
  if (!evaluation) return null;

  return {
    successMet: evaluation.successMet as boolean | undefined,
    failureMet: evaluation.failureMet as boolean | undefined,
    confidence: evaluation.confidence as number | undefined,
    reasoning: evaluation.reasoning as string | undefined,
    messageCount: output.messageCount as number | undefined,
    avgLatencyMs: output.avgLatencyMs as number | undefined,
    maxMessagesReached: output.maxMessagesReached as boolean | undefined,
  };
}

function EvaluatorResultRow({
  label,
  value,
  valueClassName,
  reason,
  rowClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
  reason?: string;
  rowClassName?: string;
}) {
  return (
    <div className={`evaluator-result-row ${rowClassName ?? ""}`}>
      <span className="evaluator-result-label">{label}</span>
      <span className={`evaluator-result-value ${valueClassName ?? ""}`}>{value}</span>
      <span className="evaluator-result-reason">{reason}</span>
    </div>
  );
}

export function EvaluatorResults({ run }: EvaluatorResultsProps) {
  if (run.status !== "completed") return null;

  const result = run.result;
  const output = run.output as Record<string, unknown> | undefined;
  const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
  const metrics = output?.metrics as Record<string, number> | undefined;
  const criteria = getCriteriaResult(run);

  const assertions = evaluatorResults?.filter((r) => r.kind === "assertion") ?? [];
  const metricResults = evaluatorResults?.filter((r) => r.kind === "metric") ?? [];
  const hasCriteria = criteria && (criteria.successMet !== undefined || criteria.failureMet !== undefined);
  const hasEvaluators = assertions.length > 0 || metricResults.length > 0;

  if (!result && !hasCriteria && !hasEvaluators) return null;

  return (
    <>
      {result && (
        <div className={`run-result-panel ${result.success ? "success" : "failed"}`}>
          <div className="run-result-header">
            <strong>{result.success ? "Passed" : "Failed"}</strong>
            {result.score !== undefined && (
              <span className="run-result-score">
                Confidence: {Math.round(result.score * 100)}%
              </span>
            )}
          </div>
          {result.reason && <p>{result.reason}</p>}
        </div>
      )}

      {(hasCriteria || hasEvaluators) && (
      <div className="evaluator-results">
      {hasCriteria && (
        <div className="evaluator-results-section">
          <div className="run-evaluation-header">Evaluation Details</div>
          <div className="run-evaluation-grid">
            {criteria.messageCount !== undefined && (
              <div className="run-evaluation-item">
                <span className="run-evaluation-label">Messages</span>
                <span className="run-evaluation-value">{criteria.messageCount}</span>
              </div>
            )}
            {criteria.avgLatencyMs !== undefined && (
              <div className="run-evaluation-item">
                <span className="run-evaluation-label">Avg Latency</span>
                <span className="run-evaluation-value">
                  {criteria.avgLatencyMs >= 1000
                    ? `${(criteria.avgLatencyMs / 1000).toFixed(1)}s`
                    : `${criteria.avgLatencyMs}ms`}
                </span>
              </div>
            )}
            {criteria.successMet !== undefined && (
              <div className="run-evaluation-item">
                <span className="run-evaluation-label">Success Criteria</span>
                <span className={`run-evaluation-value ${criteria.successMet ? "met" : "not-met"}`}>
                  {criteria.successMet ? "Met" : "Not Met"}
                </span>
              </div>
            )}
            {criteria.failureMet !== undefined && (
              <div className="run-evaluation-item">
                <span className="run-evaluation-label">Failure Criteria</span>
                <span className={`run-evaluation-value ${criteria.failureMet ? "triggered" : "not-triggered"}`}>
                  {criteria.failureMet ? "Triggered" : "Not Triggered"}
                </span>
              </div>
            )}
            {criteria.maxMessagesReached && (
              <div className="run-evaluation-item full-width">
                <span className="run-evaluation-warning">Max messages limit reached</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasEvaluators && (
        <>
          <div className="evaluator-results-divider" />
          <div className="evaluator-results-table">
            {assertions.map((r) => (
              <EvaluatorResultRow
                key={r.type}
                label={r.label}
                value={r.success ? "Pass" : "Fail"}
                valueClassName={r.success ? "passed" : "failed"}
                reason={r.reason}
                rowClassName={r.success ? "passed" : "failed"}
              />
            ))}
            {metricResults.map((r) => (
              <EvaluatorResultRow
                key={r.type}
                label={r.label}
                value={metrics?.[r.type] ?? r.value ?? "—"}
                reason={r.reason}
                rowClassName="metric"
              />
            ))}
          </div>
        </>
      )}
      </div>
      )}
    </>
  );
}
