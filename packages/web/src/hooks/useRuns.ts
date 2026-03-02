import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ChatMessageResult, CreateChatRunInput, CreatePlaygroundRunInput, CreateRunInput, Run } from "../lib/api";
import { useProjectId } from "./useProjectId";

export function useRuns(evalId?: string) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, { evalId }],
    queryFn: () => api.runs.list(projectId, evalId),
  });
}

export function useRunsByEval(evalId: string, options?: { refetchInterval?: number | false }) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "byEval", evalId],
    queryFn: () => api.runs.list(projectId, evalId),
    enabled: !!evalId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRunsByScenario(scenarioId: string, options?: { refetchInterval?: number | false }) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "byScenario", scenarioId],
    queryFn: () => api.runs.list(projectId, undefined, scenarioId),
    enabled: !!scenarioId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRunsByPersona(personaId: string, options?: { refetchInterval?: number | false }) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "byPersona", personaId],
    queryFn: () => api.runs.list(projectId, undefined, undefined, personaId),
    enabled: !!personaId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useRunsByConnector(connectorId: string, options?: { refetchInterval?: number | false }) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "byConnector", connectorId],
    queryFn: () => api.runs.list(projectId, undefined, undefined, undefined, connectorId),
    enabled: !!connectorId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useChatRunsByConnector(connectorId: string) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "byConnector", connectorId, "chat"],
    queryFn: () => api.runs.list(projectId, undefined, undefined, undefined, connectorId, "chat"),
    enabled: !!connectorId,
  });
}

export function useRun(id: string | null) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["runs", projectId, "detail", id],
    queryFn: () => api.runs.get(projectId, id!),
    enabled: !!id,
  });
}

export function useCreateRun() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRunInput) => api.runs.create(projectId, input),
    onSuccess: (runs) => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
      const evalIds = new Set(runs.map((r) => r.evalId).filter(Boolean));
      for (const evalId of evalIds) {
        queryClient.invalidateQueries({
          queryKey: ["runs", projectId, "byEval", evalId],
        });
      }
    },
  });
}

export function useCreatePlaygroundRun() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlaygroundRunInput) => api.runs.createPlayground(projectId, input),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
      queryClient.invalidateQueries({
        queryKey: ["runs", projectId, "byScenario", run.scenarioId],
      });
      if (run.personaId) {
        queryClient.invalidateQueries({
          queryKey: ["runs", projectId, "byPersona", run.personaId],
        });
      }
    },
  });
}

export function useCreateChatRun() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateChatRunInput) => api.runs.createChat(projectId, input),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
      if (run.connectorId) {
        queryClient.invalidateQueries({
          queryKey: ["runs", projectId, "byConnector", run.connectorId],
        });
      }
    },
  });
}

export function useSendChatMessage() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, content }: { runId: string; content: string }) =>
      api.runs.sendChatMessage(projectId, runId, content),
    onSuccess: (result: ChatMessageResult) => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
      if (result.run.connectorId) {
        queryClient.invalidateQueries({
          queryKey: ["runs", projectId, "byConnector", result.run.connectorId],
        });
      }
    },
  });
}

export function useDeleteRun() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.runs.delete(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
    },
  });
}

export function useRetryRun() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, clearMessages }: { id: string; clearMessages?: boolean }) =>
      api.runs.retry(projectId, id, { clearMessages }),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
      queryClient.invalidateQueries({
        queryKey: ["runs", projectId, "detail", run.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["runs", projectId, "byEval", run.evalId],
      });
    },
  });
}

const POLLING_INTERVAL = 1000;

export function usePollingRun(runId: string | null): {
  run: Run | undefined;
  isLoading: boolean;
} {
  const { data: run, isLoading, refetch } = useRun(runId);

  const shouldPoll = run && (run.status === "queued" || run.status === "running");

  useEffect(() => {
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      refetch();
    }, POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [shouldPoll, refetch]);

  return { run, isLoading };
}
