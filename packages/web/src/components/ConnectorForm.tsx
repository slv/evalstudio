import { useState } from "react";
import { useCreateConnector } from "../hooks/useConnectors";
import type { ConnectorType, LangGraphConnectorConfig } from "../lib/api";

interface ConnectorFormProps {
  connectorId: null;
  onClose: () => void;
}

export function ConnectorForm({ onClose }: ConnectorFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("langgraph");
  const [baseUrl, setBaseUrl] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createConnector = useCreateConnector();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!baseUrl.trim()) {
      setError("Base URL is required");
      return;
    }

    if (!assistantId.trim()) {
      setError("Assistant ID is required");
      return;
    }

    let config: LangGraphConnectorConfig | undefined;
    if (type === "langgraph") {
      config = { assistantId: assistantId.trim() };
    }

    try {
      await createConnector.mutateAsync({
        name,
        type,
        baseUrl,
        config,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Agent</h3>

        <form onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="connector-name">Name</label>
            <input
              id="connector-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My LangGraph Agent"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="connector-type">Type</label>
            <select
              id="connector-type"
              value={type}
              onChange={(e) => setType(e.target.value as ConnectorType)}
            >
              <option value="langgraph">LangGraph (LangGraph Dev API)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="connector-base-url">Base URL</label>
            <input
              id="connector-base-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:8123"
            />
            <span className="form-hint">
              The URL of your LangGraph Dev API server
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="connector-assistant-id">Assistant ID</label>
            <input
              id="connector-assistant-id"
              type="text"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              placeholder="my-assistant"
            />
            <span className="form-hint">
              The assistant ID to use when invoking the LangGraph agent
            </span>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createConnector.isPending}
            >
              {createConnector.isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
