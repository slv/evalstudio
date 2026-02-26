import { useState } from "react";
import { EntityRedirect } from "../components/EntityRedirect";
import { ConnectorForm } from "../components/ConnectorForm";
import { useConnectors } from "../hooks/useConnectors";

export function AgentsPage() {
  const { data: connectors, isLoading } = useConnectors();
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <EntityRedirect
      entityType="agent"
      items={connectors}
      isLoading={isLoading}
      fallback={
        <div className="page">
          <div className="page-header">
            <h1>Agents</h1>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateForm(true)}
            >
              + New Agent
            </button>
          </div>
          <div className="empty-state">
            <p>No agents yet. Add an agent to start chatting with your AI endpoints.</p>
          </div>
          {showCreateForm && (
            <ConnectorForm
              connectorId={null}
              onClose={() => setShowCreateForm(false)}
            />
          )}
        </div>
      }
    />
  );
}
