import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, CreateConnectorInput, UpdateConnectorInput } from "../lib/api";
import { useProjectId } from "./useProjectId";

export function useConnectors() {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["connectors", projectId],
    queryFn: () => api.connectors.list(projectId),
  });
}

export function useConnector(id: string | null) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["connectors", projectId, "detail", id],
    queryFn: () => api.connectors.get(projectId, id!),
    enabled: !!id,
  });
}

export function useConnectorTypes() {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["connectors", projectId, "types"],
    queryFn: () => api.connectors.getTypes(projectId),
    staleTime: Infinity,
  });
}

export function useCreateConnector() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateConnectorInput) => api.connectors.create(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors", projectId] });
    },
  });
}

export function useUpdateConnector() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConnectorInput }) =>
      api.connectors.update(projectId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors", projectId] });
    },
  });
}

export function useDeleteConnector() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.connectors.delete(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors", projectId] });
    },
  });
}

export function useTestConnector() {
  const projectId = useProjectId();

  return useMutation({
    mutationFn: (id: string) => api.connectors.test(projectId, id),
  });
}

export function useConnectorStatus(id: string | null) {
  const projectId = useProjectId();

  return useQuery({
    queryKey: ["connectors", projectId, "status", id],
    queryFn: () => api.connectors.test(projectId, id!),
    enabled: !!id,
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });
}
