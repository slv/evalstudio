import { useEffect, useMemo, useState } from "react";
import { usePersonas } from "../hooks/usePersonas";
import { useRuns, useRunsByEval, useRunsByScenario, useRunsByPersona, useDeleteRun, useRetryRun } from "../hooks/useRuns";
import { useScenarios } from "../hooks/useScenarios";
import { useEvals } from "../hooks/useEvals";
import type { Run, EvaluatorResultEntry } from "../lib/api";
import { RunMessagesModal } from "./RunMessagesModal";

interface RunListBaseProps {
  limit?: number;
}

interface RunListByEvalProps extends RunListBaseProps {
  evalId: string;
  scenarioId?: never;
  personaId?: never;
  mode?: never;
}

interface RunListByScenarioProps extends RunListBaseProps {
  evalId?: never;
  scenarioId: string;
  personaId?: never;
  mode?: never;
}

interface RunListByPersonaProps extends RunListBaseProps {
  evalId?: never;
  scenarioId?: never;
  personaId: string;
  mode?: never;
}

interface RunListByProjectProps extends RunListBaseProps {
  evalId?: never;
  scenarioId?: never;
  personaId?: never;
  mode: "project";
}

type RunListProps = RunListByEvalProps | RunListByScenarioProps | RunListByPersonaProps | RunListByProjectProps;

const POLLING_INTERVAL = 2000; // 2 seconds

export function RunList({ evalId, scenarioId, personaId, limit, mode }: RunListProps) {
  const [hasRunningItems, setHasRunningItems] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Determine polling interval based on running status
  const refetchInterval = hasRunningItems ? POLLING_INTERVAL : false;

  // Update current time every second when there are running items (for elapsed time display)
  useEffect(() => {
    if (!hasRunningItems) return;
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningItems]);

  // Determine which mode we're in
  const isByEval = !!evalId;
  const isByScenario = !!scenarioId;
  const isByPersona = !!personaId;
  const isByProject = mode === "project";

  const { data: runsByEval, isLoading: loadingByEval, error: errorByEval } = useRunsByEval(
    evalId ?? "",
    { refetchInterval: isByEval ? refetchInterval : false }
  );
  const { data: runsByScenario, isLoading: loadingByScenario, error: errorByScenario } = useRunsByScenario(
    scenarioId ?? "",
    { refetchInterval: isByScenario ? refetchInterval : false }
  );
  const { data: runsByPersona, isLoading: loadingByPersona, error: errorByPersona } = useRunsByPersona(
    personaId ?? "",
    { refetchInterval: isByPersona ? refetchInterval : false }
  );
  const { data: runsByProject, isLoading: loadingByProject, error: errorByProject } = useRuns();

  const { data: personas = [] } = usePersonas();
  const { data: scenarios = [] } = useScenarios();
  const { data: evals = [] } = useEvals();

  const deleteRun = useDeleteRun();
  const retryRun = useRetryRun();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Determine which data source to use
  const allRuns = isByEval ? runsByEval : isByScenario ? runsByScenario : isByPersona ? runsByPersona : runsByProject;
  const isLoading = isByEval ? loadingByEval : isByScenario ? loadingByScenario : isByPersona ? loadingByPersona : loadingByProject;
  const error = isByEval ? errorByEval : isByScenario ? errorByScenario : isByPersona ? errorByPersona : errorByProject;

  // Filter out chat runs and apply limit, sorting by createdAt descending
  const runs = useMemo(() => {
    if (!allRuns) return undefined;
    const filtered = allRuns.filter((r) => r.status !== "chat");
    const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }, [allRuns, limit]);

  // Update hasRunningItems when runs data changes (poll for running or queued)
  useEffect(() => {
    const hasActive = runs?.some((run) => run.status === "running" || run.status === "queued") ?? false;
    setHasRunningItems(hasActive);
  }, [runs]);

  // Create lookup maps
  const personaMap = useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas]
  );
  const scenarioMap = useMemo(
    () => new Map(scenarios.map((s) => [s.id, s])),
    [scenarios]
  );
  const evalMap = useMemo(
    () => new Map(evals.map((e) => [e.id, e])),
    [evals]
  );

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (run: Run) => {
    const { startedAt, completedAt, status } = run;
    if (!startedAt) return "—";

    // For running items, show elapsed time
    const start = new Date(startedAt).getTime();
    const end = status === "running" ? currentTime : (completedAt ? new Date(completedAt).getTime() : null);
    if (!end) return "—";

    const durationMs = end - start;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  const formatTokensUsage = (run: Run) => {
    const output = run.output as Record<string, unknown> | undefined;
    const evaluatorResults = output?.evaluatorResults as EvaluatorResultEntry[] | undefined;
    const tokenEval = evaluatorResults?.find((r) => r.type === "token-usage");
    const usage = tokenEval?.metadata as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
    if (!usage?.total_tokens) return "—";
    return `${usage.input_tokens ?? 0} → ${usage.output_tokens ?? 0} (∑ ${usage.total_tokens})`;
  };

  const getStatusClass = (run: Run) => {
    if (run.status === "completed" && run.result) {
      return run.result.success ? "status-success" : "status-failed";
    }
    return `status-${run.status}`;
  };

  const getStatusLabel = (run: Run) => {
    if (run.status === "completed" && run.result) {
      return run.result.success ? "Passed" : "Failed";
    }
    return run.status.charAt(0).toUpperCase() + run.status.slice(1);
  };

  if (isLoading) {
    return <div className="loading">Loading runs...</div>;
  }

  if (error) {
    return (
      <div className="error">
        Failed to load runs. Make sure the API server is running.
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    const emptyMessage = isByEval
      ? "No runs yet. Click \"New Run\" to create one."
      : isByPersona
        ? "No runs yet for this persona."
        : isByProject
          ? "No runs yet."
          : "No runs yet for this scenario.";
    return (
      <div className="empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const handleDelete = async (run: Run) => {
    setOpenMenuId(null);
    if (confirm("Delete this run?")) {
      deleteRun.mutate(run.id);
    }
  };

  const handleRetry = (run: Run) => {
    setOpenMenuId(null);
    retryRun.mutate({ id: run.id });
  };

  const canRetry = (run: Run) => {
    // Only allow retry on system errors, not evaluation failures
    return run.status === "error";
  };

  const toggleMenu = (runId: string) => {
    setOpenMenuId(openMenuId === runId ? null : runId);
  };

  return (
    <div className="run-list">
      {runs.map((run) => {
        const persona = run.personaId ? personaMap.get(run.personaId) : null;
        const scenario = run.scenarioId ? scenarioMap.get(run.scenarioId) : undefined;
        const evalItem = run.evalId ? evalMap.get(run.evalId) : undefined;

        // First column: show scenario (when viewing by eval/persona/project) or eval (when viewing by scenario)
        const firstColumnName = isByScenario ? evalItem?.name : scenario?.name;
        const firstColumnTitle = isByScenario ? evalItem?.name : scenario?.name;

        return (
          <div
            key={run.id}
            className="run-item run-item-clickable"
            onClick={() => setSelectedRunId(run.id)}
          >
            <div className="run-row">
              <span className="run-execution" title={run.executionId?.toString()}>
                {run.executionId ? `#${run.executionId}` : "—"}
              </span>

              <span className={`run-status ${getStatusClass(run)}`}>
                {getStatusLabel(run)}
              </span>

              <span className="run-duration">
                {formatDuration(run)}
              </span>

              <span className="run-context" title={firstColumnTitle}>
                {firstColumnName || "—"}
                {persona && <span className="run-persona">({persona.name})</span>}
              </span>

              <span className="run-tokens">
                {formatTokensUsage(run)}
              </span>

              <span className="run-started">
                {formatDateTime(run.startedAt)}
              </span>

              <div
                className="run-menu-container"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="run-menu-btn"
                  onClick={() => toggleMenu(run.id)}
                  aria-label="Run actions"
                >
                  <span className="dots-icon">...</span>
                </button>
                {openMenuId === run.id && (
                  <>
                    <div
                      className="run-menu-backdrop"
                      onClick={() => setOpenMenuId(null)}
                    />
                    <div className="run-menu-dropdown">
                      {canRetry(run) && (
                        <button
                          className="run-menu-item"
                          onClick={() => handleRetry(run)}
                          disabled={retryRun.isPending}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        className="run-menu-item run-menu-item-danger"
                        onClick={() => handleDelete(run)}
                        disabled={deleteRun.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {selectedRunId && (
        <RunMessagesModal
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}
