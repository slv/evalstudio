import { useState, useRef, useEffect, useCallback } from "react";
import { Connector, Message, Run } from "../lib/api";
import { useCreateChatRun, useChatRunsByConnector, useSendChatMessage } from "../hooks/useRuns";
import { MessagesDisplay, SimulatedMessage, SimulationError } from "./MessagesDisplay";

interface AgentChatProps {
  connector: Connector;
}

function ChatHistoryItem({
  run,
  isActive,
  onClick,
}: {
  run: Run;
  isActive: boolean;
  onClick: () => void;
}) {
  const firstUserMsg = run.messages.find((m) => m.role === "user");
  const text = firstUserMsg?.content ?? "";
  const preview = text
    ? text.slice(0, 60) + (text.length > 60 ? "..." : "")
    : "Empty chat";
  const msgCount = run.messages.filter((m) => m.role === "user" || m.role === "assistant").length;
  const date = new Date(run.updatedAt);
  const timeStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <button
      className={`agent-chat-history-item ${isActive ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="agent-chat-history-preview">{preview}</div>
      <div className="agent-chat-history-meta">
        <span>{timeStr}</span>
        <span>{msgCount} msgs</span>
      </div>
    </button>
  );
}

export function AgentChat({ connector }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const createChatRun = useCreateChatRun();
  const sendChatMessage = useSendChatMessage();
  const { data: chatRuns = [], refetch: refetchChatRuns } = useChatRunsByConnector(connector.id);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isSending = sendChatMessage.isPending;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const loadChat = useCallback((run: Run) => {
    setMessages(run.messages);
    setRunId(run.id);
    setThreadId(run.threadId);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setError(null);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }

    // Optimistically add user message
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Create a chat run on first message
      let currentRunId = runId;
      if (!currentRunId) {
        const run = await createChatRun.mutateAsync({ connectorId: connector.id });
        currentRunId = run.id;
        setRunId(run.id);
      }

      const result = await sendChatMessage.mutateAsync({
        runId: currentRunId,
        content: text,
      });

      // Server is source of truth for messages
      setMessages(result.run.messages);
      setThreadId(result.run.threadId);

      if (result.error) {
        setError(result.error);
      }

      refetchChatRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  }, [input, isSending, runId, connector.id, createChatRun, sendChatMessage, refetchChatRuns]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    setRunId(null);
    setThreadId(undefined);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  };

  const loadingIndicator = isSending ? (
    <SimulatedMessage isLoading loadingText="Thinking..." />
  ) : null;

  const errorDisplay = error ? (
    <SimulationError error={error} />
  ) : null;

  return (
    <div className="agent-chat">
      {chatRuns.length > 0 && (
        <div className="agent-chat-sidebar">
          <div className="agent-chat-sidebar-header">
            <span>History</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleNewChat}
              disabled={isSending}
            >
              + New
            </button>
          </div>
          <div className="agent-chat-sidebar-list">
            {chatRuns.map((run) => (
              <ChatHistoryItem
                key={run.id}
                run={run}
                isActive={run.id === runId}
                onClick={() => loadChat(run)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="agent-chat-main">
        <div className="agent-chat-header">
          <span className="agent-chat-status">
            {runId ? "Recording" : "New conversation"}
            {threadId && <span className="agent-chat-thread"> (thread: {threadId.slice(0, 8)}...)</span>}
          </span>
          {chatRuns.length === 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleNewChat}
              disabled={isSending || (!runId && messages.length === 0)}
            >
              New Chat
            </button>
          )}
        </div>

        <div className="agent-chat-messages" ref={scrollRef}>
          <MessagesDisplay
            messages={messages}
            additionalContent={<>{loadingIndicator}{errorDisplay}</>}
            emptyMessage={`Send a message to start chatting with ${connector.name}`}
          />
        </div>

        <div className="agent-chat-input-area">
          <textarea
            ref={inputRef}
            className="agent-chat-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={isSending}
          />
          <button
            className="btn btn-primary agent-chat-send"
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
