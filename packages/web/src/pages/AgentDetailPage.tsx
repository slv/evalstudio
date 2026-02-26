import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useConnector,
  useConnectors,
  useUpdateConnector,
  useDeleteConnector,
  useConnectorStatus,
} from "../hooks/useConnectors";
import { useLastVisited } from "../hooks/useLastVisited";
import { EntitySwitcher } from "../components/EntitySwitcher";
import { ConnectorForm } from "../components/ConnectorForm";
import { AgentChat } from "../components/AgentChat";
import { HeadersEditor } from "../components/HeadersEditor";
import type { ConnectorType, LangGraphConnectorConfig } from "../lib/api";

type AgentTab = "chat" | "settings";

export function AgentDetailPage() {
  const navigate = useNavigate();
  const { agentId } = useParams<{ agentId: string }>();
  const { data: connector, isLoading, error } = useConnector(agentId ?? null);
  const { data: allConnectors = [] } = useConnectors();
  const lastVisited = useLastVisited("agent");
  const updateConnector = useUpdateConnector();
  const deleteConnector = useDeleteConnector();
  const { data: statusResult, isLoading: statusLoading } = useConnectorStatus(agentId ?? null);
  const [showMenu, setShowMenu] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTabState] = useState<AgentTab>(
    () => (localStorage.getItem("agentTab") as AgentTab) || "chat"
  );

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("langgraph");
  const [baseUrl, setBaseUrl] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [configurableJson, setConfigurableJson] = useState("");
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setActiveTab = (tab: AgentTab) => {
    setActiveTabState(tab);
    localStorage.setItem("agentTab", tab);
  };

  // Persist last visited agent
  useEffect(() => {
    if (agentId) lastVisited.set(agentId);
  }, [agentId, lastVisited]);

  // Load connector data into form
  useEffect(() => {
    if (connector) {
      setName(connector.name);
      setType(connector.type);
      setBaseUrl(connector.baseUrl);

      if (connector.headers && Object.keys(connector.headers).length > 0) {
        setCustomHeaders(
          Object.entries(connector.headers).map(([key, value]) => ({ key, value }))
        );
      } else {
        setCustomHeaders([]);
      }

      if (connector.type === "langgraph" && connector.config) {
        const lgConfig = connector.config as LangGraphConnectorConfig;
        setAssistantId(lgConfig.assistantId || "");
        if (lgConfig.configurable && Object.keys(lgConfig.configurable).length > 0) {
          setConfigurableJson(JSON.stringify(lgConfig.configurable, null, 2));
        } else {
          setConfigurableJson("");
        }
      }

      setHasChanges(false);
    }
  }, [connector]);

  // Track changes
  const handleChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: T) => {
      setter(value);
      setHasChanges(true);
    };
  };

  if (isLoading) {
    return <div className="loading">Loading agent...</div>;
  }

  if (error || !connector) {
    return (
      <div className="page">
        <div className="error">
          {error instanceof Error ? error.message : "Agent not found"}
        </div>
        <button onClick={() => navigate("..", { relative: "path" })} className="btn btn-secondary">
          Back to Agents
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    setShowMenu(false);
    if (confirm(`Delete agent "${connector.name}"?`)) {
      await deleteConnector.mutateAsync(connector.id);
      lastVisited.clear();
      const remaining = allConnectors.filter((c) => c.id !== connector.id);
      if (remaining.length > 0) {
        navigate(`../${remaining[0].id}`, { relative: "path" });
      } else {
        navigate("..", { relative: "path" });
      }
    }
  };

  const handleSave = async () => {
    setSaveError(null);

    if (!name.trim()) {
      setSaveError("Name is required");
      return;
    }
    if (!baseUrl.trim()) {
      setSaveError("Base URL is required");
      return;
    }
    if (!assistantId.trim()) {
      setSaveError("Assistant ID is required");
      return;
    }

    // Build headers
    const headersWithValues = customHeaders.filter((h) => h.key.trim());
    const headers: Record<string, string> | undefined =
      headersWithValues.length > 0
        ? Object.fromEntries(headersWithValues.map((h) => [h.key.trim(), h.value]))
        : undefined;

    // Build config
    let config: LangGraphConnectorConfig | undefined;
    if (type === "langgraph") {
      config = { assistantId: assistantId.trim() };
      if (configurableJson.trim()) {
        try {
          const configurable = JSON.parse(configurableJson);
          config = { ...config, configurable };
        } catch {
          setSaveError("Invalid JSON in configurable");
          return;
        }
      }
    }

    try {
      await updateConnector.mutateAsync({
        id: connector.id,
        input: { name, type, baseUrl, headers, config },
      });
      setHasChanges(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handleCancel = () => {
    setName(connector.name);
    setType(connector.type);
    setBaseUrl(connector.baseUrl);

    if (connector.headers && Object.keys(connector.headers).length > 0) {
      setCustomHeaders(
        Object.entries(connector.headers).map(([key, value]) => ({ key, value }))
      );
    } else {
      setCustomHeaders([]);
    }

    if (connector.type === "langgraph" && connector.config) {
      const lgConfig = connector.config as LangGraphConnectorConfig;
      setAssistantId(lgConfig.assistantId || "");
      if (lgConfig.configurable && Object.keys(lgConfig.configurable).length > 0) {
        setConfigurableJson(JSON.stringify(lgConfig.configurable, null, 2));
      } else {
        setConfigurableJson("");
      }
    } else {
      setAssistantId("");
      setConfigurableJson("");
    }

    setSaveError(null);
    setHasChanges(false);
  };

  const switcherItems = allConnectors.map((c) => ({
    id: c.id,
    name: c.name || c.id,
  }));

  return (
    <div className="page page-detail agent-detail-page">
      <div className="page-header">
        <div className="page-header-nav">
          <EntitySwitcher
            items={switcherItems}
            activeId={connector.id}
            onSelect={(id) => navigate(`../${id}`, { relative: "path" })}
            onCreate={() => setShowCreateForm(true)}
            entityLabel="agent"
          />
        </div>
        <div className="page-header-actions">
          {hasChanges && (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={updateConnector.isPending}
              >
                {updateConnector.isPending ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <div className="menu-container">
            <button
              className="menu-btn"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Agent actions"
            >
              <span className="dots-icon">...</span>
            </button>
            {showMenu && (
              <>
                <div className="menu-backdrop" onClick={() => setShowMenu(false)} />
                <div className="menu-dropdown">
                  <button
                    className="menu-item menu-item-danger"
                    onClick={handleDelete}
                    disabled={deleteConnector.isPending}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {saveError && <div className="form-error">{saveError}</div>}

        <div className="agent-detail-tabs">
          <div className="agent-tabs-header">
            <div className="agent-tabs-nav">
              <button
                className={`agent-tab ${activeTab === "chat" ? "active" : ""}`}
                onClick={() => setActiveTab("chat")}
              >
                Live Chat
              </button>
              <button
                className={`agent-tab ${activeTab === "settings" ? "active" : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                Settings
              </button>
            </div>
            <span className={`agent-status-badge ${statusLoading ? "checking" : statusResult?.success ? "online" : "offline"}`}>
              <span className="agent-status-dot" />
              {statusLoading ? "Checking..." : statusResult?.success ? "Online" : "Offline"}
            </span>
          </div>

          {activeTab === "chat" && (
            <AgentChat connector={connector} />
          )}

          {activeTab === "settings" && (
            <>
              <div className="dashboard-card">
                <div className="form-group">
                  <label htmlFor="agent-name">Name</label>
                  <input
                    type="text"
                    id="agent-name"
                    value={name}
                    onChange={(e) => handleChange(setName)(e.target.value)}
                    placeholder="My LangGraph Agent"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="agent-type">Type</label>
                  <select
                    id="agent-type"
                    value={type}
                    onChange={(e) => handleChange(setType)(e.target.value as ConnectorType)}
                  >
                    <option value="langgraph">LangGraph (LangGraph Dev API)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="agent-base-url">Base URL</label>
                  <input
                    type="url"
                    id="agent-base-url"
                    value={baseUrl}
                    onChange={(e) => handleChange(setBaseUrl)(e.target.value)}
                    placeholder="http://localhost:8123"
                  />
                  <span className="form-hint">The URL of your LangGraph Dev API server</span>
                </div>

                <div className="form-group">
                  <label htmlFor="agent-assistant-id">Assistant ID</label>
                  <input
                    type="text"
                    id="agent-assistant-id"
                    value={assistantId}
                    onChange={(e) => handleChange(setAssistantId)(e.target.value)}
                    placeholder="my-assistant"
                  />
                  <span className="form-hint">The assistant ID to use when invoking the LangGraph agent</span>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="form-group">
                  <label htmlFor="agent-configurable">Configurable (JSON)</label>
                  <textarea
                    id="agent-configurable"
                    value={configurableJson}
                    onChange={(e) => handleChange(setConfigurableJson)(e.target.value)}
                    placeholder={`{\n  "key": "value"\n}`}
                    rows={3}
                  />
                  <span className="form-hint">Optional values sent as config.configurable in invoke requests</span>
                </div>

                <HeadersEditor
                  headers={customHeaders}
                  onChange={handleChange(setCustomHeaders)}
                  hint="Custom headers sent with every request (e.g. Authorization, API keys)"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateForm && (
        <ConnectorForm
          connectorId={null}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
