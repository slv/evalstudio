import { useState, useMemo } from "react";
import { Message, ToolCall, getMessageContent } from "../lib/api";

/** Map of tool_call_id -> ToolCall (input/args) from assistant messages */
type ToolCallsMap = Map<string, ToolCall>;

/** Build a map of tool_call_id -> ToolCall from all assistant messages' tool_calls */
function buildToolCallsMap(messages: Message[]): ToolCallsMap {
  const map = new Map<string, ToolCall>();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const call of msg.tool_calls) {
        if (call.id) {
          map.set(call.id, call);
        }
      }
    }
  }
  return map;
}

/** Check if an assistant message has only tool calls (no text content) */
function isToolCallOnlyMessage(message: Message): boolean {
  if (message.role !== "assistant") return false;
  const content = getMessageContent(message);
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  return (!content || content.trim() === "") && !!hasToolCalls;
}

/** Format tool result content (try JSON pretty print) */
function formatToolResult(message: Message): string {
  const content = getMessageContent(message);
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

/** Format a value for display (handles objects, arrays, primitives) */
function formatArgValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Renders a tool message as a collapsible box with input (from tool_calls lookup) and output */
/** Parse tool call arguments from JSON string to entries */
function parseToolCallArgs(toolCall?: ToolCall): Array<[string, unknown]> {
  if (!toolCall?.function?.arguments) return [];
  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return typeof parsed === "object" && parsed !== null ? Object.entries(parsed) : [];
  } catch {
    return [];
  }
}

function ToolMessageDisplay({ message, toolCall }: { message: Message; toolCall?: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = toolCall?.function?.name || message.name || "unknown";
  const argEntries = parseToolCallArgs(toolCall);

  return (
    <div className={`run-preview-tool-call ${expanded ? "expanded" : "collapsed"}`}>
      <div
        className="run-preview-tool-call-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="run-preview-tool-call-title">
          <span className="run-preview-role">tool - <span className="run-preview-tool-name">{toolName}</span></span>
        </div>
        <button className="run-preview-expand-btn">
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && (
        <div className="run-preview-tool-call-body">
          {argEntries.length > 0 && (
            <div className="run-preview-tool-section">
              <span className="run-preview-tool-section-label">Input</span>
              <div className="run-preview-tool-args-list">
                {argEntries.map(([key, value]) => (
                  <div key={key} className="run-preview-tool-arg">
                    <span className="run-preview-tool-arg-key">{key}</span>
                    <span className="run-preview-tool-arg-value">{formatArgValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="run-preview-tool-section run-preview-tool-section-result">
            <span className="run-preview-tool-section-label">Output</span>
            <pre className="run-preview-tool-result-content">
              {formatToolResult(message)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

interface MessagesDisplayProps {
  messages: Message[];
  /** Additional messages to show after the main messages (e.g., simulated responses) */
  additionalContent?: React.ReactNode;
  /** Additional content rendered after messages (e.g., EvaluatorResults) */
  footer?: React.ReactNode;
  /** Error message to display */
  error?: string | null;
  /** Empty state message */
  emptyMessage?: string;
}

export function MessagesDisplay({
  messages,
  additionalContent,
  footer,
  error,
  emptyMessage = "No messages.",
}: MessagesDisplayProps) {
  const [systemExpanded, setSystemExpanded] = useState(false);

  // Build tool_call_id -> ToolCall map from assistant messages (for input lookup)
  const toolCallsMap = useMemo(() => buildToolCallsMap(messages), [messages]);

  // Separate system messages from conversation messages
  // Filter out assistant messages that only contain tool calls (no text) - the tool
  // interaction will be shown when the corresponding role=tool message renders
  const systemMessages = messages.filter((m) => m.role === "system");
  const conversationMessages = messages.filter(
    (m) => m.role !== "system" && !isToolCallOnlyMessage(m)
  );

  const hasContent = systemMessages.length > 0 || conversationMessages.length > 0 || additionalContent;

  return (
    <div className="run-preview-content">
      {systemMessages.length > 0 && (
        <div className="run-preview-system-section">
          <div
            className="run-preview-system-header"
            onClick={() => setSystemExpanded(!systemExpanded)}
          >
            <span className="run-preview-role">system</span>
            <button className="run-preview-expand-btn">
              {systemExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          <div
            className={`run-preview-system-content ${systemExpanded ? "expanded" : ""}`}
          >
            {systemMessages.map((message, index) => (
              <div key={index} className="run-preview-content-text">
                {getMessageContent(message)}
              </div>
            ))}
          </div>
        </div>
      )}

      {conversationMessages.length > 0 || additionalContent ? (
        <div className="run-preview-messages">
          {conversationMessages.map((message, index) =>
            message.role === "tool" ? (
              // Tool messages drive the tool UI - look up input from toolCallsMap
              <div key={index} className="run-preview-tool-calls">
                <ToolMessageDisplay
                  message={message}
                  toolCall={message.tool_call_id ? toolCallsMap.get(message.tool_call_id) : undefined}
                />
              </div>
            ) : (
              <div
                key={index}
                className={`run-preview-message run-preview-message-${message.role}`}
              >
                <span className="run-preview-role">{message.role}</span>
                <div className="run-preview-content-text">{getMessageContent(message)}</div>
              </div>
            )
          )}
          {additionalContent}
        </div>
      ) : (
        !hasContent && (
          <div className="run-preview-empty">
            {emptyMessage}
          </div>
        )
      )}

      {footer}

      {error && (
        <div className="run-error-panel">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

/** Helper component for displaying simulated/loading responses */
export function SimulatedMessage({
  messages,
  latencyMs,
  isLoading,
  loadingText = "Sending to agent...",
}: {
  messages?: Message[] | null;
  latencyMs?: number;
  isLoading?: boolean;
  loadingText?: string;
}) {
  if (isLoading) {
    return (
      <div className="run-preview-message run-preview-message-assistant run-preview-simulated">
        <span className="run-preview-role">assistant</span>
        <div className="run-preview-content-text run-preview-loading">
          {loadingText}
        </div>
      </div>
    );
  }

  if (!messages || messages.length === 0) return null;

  // Build tool_call_id -> ToolCall map from assistant messages (for input lookup)
  const toolCallsMap = buildToolCallsMap(messages);

  // Filter out assistant messages that only contain tool calls (no text)
  const visibleMessages = messages.filter((m) => !isToolCallOnlyMessage(m));

  return (
    <>
      {visibleMessages.map((message, index) =>
        message.role === "tool" ? (
          // Tool messages drive the tool UI
          <div key={index} className="run-preview-tool-calls">
            <ToolMessageDisplay
              message={message}
              toolCall={message.tool_call_id ? toolCallsMap.get(message.tool_call_id) : undefined}
            />
          </div>
        ) : (
          <div
            key={index}
            className={`run-preview-message run-preview-message-${message.role} run-preview-simulated`}
          >
            <span className="run-preview-role">{message.role} (response)</span>
            <div className="run-preview-content-text">{getMessageContent(message)}</div>
            {index === visibleMessages.length - 1 && latencyMs && (
              <span className="run-preview-latency">{latencyMs}ms</span>
            )}
          </div>
        )
      )}
    </>
  );
}

export function SimulationError({
  error,
  rawResponse,
}: {
  error: string;
  rawResponse?: string;
}) {
  return (
    <div className="run-preview-simulation-error">
      <div>{error}</div>
      {rawResponse && (
        <pre className="run-preview-raw-response">rawResponse<br />{rawResponse}</pre>
      )}
    </div>
  );
}
