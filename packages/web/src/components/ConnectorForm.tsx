import { useState } from "react";
import { useCreateConnector, useConnectorTypes } from "../hooks/useConnectors";
import { ConnectorConfigFields, validateConfigFields, buildConfigFromValues } from "./ConnectorConfigFields";
import type { ConnectorType } from "../lib/api";

interface ConnectorFormProps {
  connectorId: null;
  onClose: () => void;
}

/** Custom content rendered inside built-in connector type cards (step 1). */
const builtinTypeContent: Record<string, React.ReactNode> = {
  langgraph: (
    <p className="connector-type-card-detail">
      Connect to a LangGraph agent running on a local dev server or deployed
      endpoint.{" "}
      <a
        href="https://slv.github.io/evalstudio/guides/langgraph-setup"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        Setup guide &rarr;
      </a>
    </p>
  ),
};

export function ConnectorForm({ onClose }: ConnectorFormProps) {
  const { data: connectorTypes = [] } = useConnectorTypes();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("");
  const [baseUrl, setBaseUrl] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const createConnector = useCreateConnector();

  const builtinTypes = connectorTypes.filter((t) => t.builtin);
  const customTypes = connectorTypes.filter((t) => !t.builtin);

  const selectedTypeDef = connectorTypes.find((t) => t.type === type);

  const handleSelectType = (selectedType: ConnectorType) => {
    if (selectedType !== type) {
      setType(selectedType);
      setConfigValues({});
    }
  };

  const handleNext = () => {
    if (!type) return;
    setError(null);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setError(null);
  };

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

    const validationError = validateConfigFields(selectedTypeDef, configValues);
    if (validationError) {
      setError(validationError);
      return;
    }

    const { config, error: buildError } = buildConfigFromValues(selectedTypeDef, configValues);
    if (buildError) {
      setError(buildError);
      return;
    }

    try {
      await createConnector.mutateAsync({
        name,
        type,
        baseUrl,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-connector-wizard" onClick={(e) => e.stopPropagation()}>

        {/* Step 1: Type selection */}
        {step === 1 && (
          <>
            <h3>Add Agent</h3>

            {builtinTypes.length > 0 && (
              <div className="connector-type-section">
                <div className="connector-type-section-label">Built-in</div>
                <div className="connector-type-cards">
                  {builtinTypes.map((t) => (
                    <label
                      key={t.type}
                      className={`connector-type-card${type === t.type ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="connector-type"
                        value={t.type}
                        checked={type === t.type}
                        onChange={() => handleSelectType(t.type)}
                        className="connector-type-radio"
                      />
                      <div className="connector-type-card-body">
                        <div className="connector-type-card-header">
                          <span className="connector-type-card-label">{t.label}</span>
                        </div>
                        {t.description && (
                          <p className="connector-type-card-desc">{t.description}</p>
                        )}
                        {builtinTypeContent[t.type]}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="connector-type-section">
              <div className="connector-type-section-label">Custom</div>
              {customTypes.length > 0 ? (
                <div className="connector-type-cards">
                  {customTypes.map((t) => (
                    <label
                      key={t.type}
                      className={`connector-type-card${type === t.type ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="connector-type"
                        value={t.type}
                        checked={type === t.type}
                        onChange={() => handleSelectType(t.type)}
                        className="connector-type-radio"
                      />
                      <div className="connector-type-card-body">
                        <div className="connector-type-card-header">
                          <span className="connector-type-card-label">{t.label}</span>
                        </div>
                        {t.description && (
                          <p className="connector-type-card-desc">{t.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="connector-type-empty">No custom connectors installed.</p>
              )}
              <span className="form-hint">
                <a href="#">Learn how to create a custom connector</a>
              </span>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
                disabled={!type}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div className="connector-wizard-step2-header">
              <button
                type="button"
                className="btn-back"
                onClick={handleBack}
                aria-label="Back to type selection"
              >
                &larr;
              </button>
              <h3>{selectedTypeDef?.label ?? "Configure"}</h3>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="connector-name">Name</label>
              <input
                id="connector-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
                autoFocus
              />
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
            </div>

            <ConnectorConfigFields
              typeDef={selectedTypeDef}
              values={configValues}
              onChange={setConfigValues}
            />

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
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
        )}
      </div>
    </div>
  );
}
