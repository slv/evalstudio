import type { JsonSchema, ConnectorTypeInfo } from "../lib/api";

interface ConnectorConfigFieldsProps {
  /** The resolved connector type definition (from useConnectorTypes). */
  typeDef: ConnectorTypeInfo | undefined;
  /** Current config values keyed by property name (string representations). */
  values: Record<string, string>;
  /** Called with the full updated values object on any change. */
  onChange: (values: Record<string, string>) => void;
  /** HTML id prefix for input elements (e.g. "connector-config" or "agent-config"). */
  idPrefix?: string;
}

/**
 * Renders form fields for a connector type's configSchema.
 * Shared between ConnectorForm (create) and AgentDetailPage (edit).
 */
export function ConnectorConfigFields({
  typeDef,
  values,
  onChange,
  idPrefix = "connector-config",
}: ConnectorConfigFieldsProps) {
  const schema = typeDef?.configSchema;
  const schemaProperties = (schema?.properties ?? {}) as Record<
    string,
    JsonSchema & { description?: string }
  >;
  const requiredFields = schema?.required ?? [];

  return (
    <>
      {Object.entries(schemaProperties).map(([key, prop]) => (
        <div className="form-group" key={key}>
          <label htmlFor={`${idPrefix}-${key}`}>
            {key}{requiredFields.includes(key) ? "" : " (optional)"}
          </label>
          {prop.type === "object" ? (
            <textarea
              id={`${idPrefix}-${key}`}
              value={values[key] ?? ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={`{\n  "key": "value"\n}`}
              rows={3}
            />
          ) : (
            <input
              id={`${idPrefix}-${key}`}
              type="text"
              value={values[key] ?? ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            />
          )}
          {prop.description && (
            <span className="form-hint">{prop.description}</span>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Validate required config fields against the schema.
 * Returns an error message string if validation fails, or null if valid.
 */
export function validateConfigFields(
  typeDef: ConnectorTypeInfo | undefined,
  values: Record<string, string>,
): string | null {
  const schema = typeDef?.configSchema;
  const schemaProperties = (schema?.properties ?? {}) as Record<
    string,
    JsonSchema & { description?: string }
  >;
  const requiredFields = schema?.required ?? [];

  for (const field of requiredFields) {
    if (!values[field]?.trim()) {
      const label = schemaProperties[field]?.description ?? field;
      return `${label} is required`;
    }
  }
  return null;
}

/**
 * Build a ConnectorConfig object from string form values and schema.
 * Returns { config, error } — error is non-null if JSON parsing fails.
 */
export function buildConfigFromValues(
  typeDef: ConnectorTypeInfo | undefined,
  values: Record<string, string>,
): { config: Record<string, unknown>; error: string | null } {
  const schema = typeDef?.configSchema;
  const schemaProperties = (schema?.properties ?? {}) as Record<
    string,
    JsonSchema & { description?: string }
  >;

  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value.trim()) {
      const propSchema = schemaProperties[key];
      if (propSchema?.type === "object") {
        try {
          config[key] = JSON.parse(value);
        } catch {
          return { config: {}, error: `Invalid JSON for ${key}` };
        }
      } else {
        config[key] = value.trim();
      }
    }
  }
  return { config, error: null };
}
