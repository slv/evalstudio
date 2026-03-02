import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessagesDisplay } from "../components/MessagesDisplay";
import { Message, ToolCall } from "../lib/api";

/** Helper to build a well-formed ToolCall */
function makeToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {},
): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

describe("MessagesDisplay – tool call formats", () => {
  // ── correct / well-formed tool calls ──────────────────────────────

  it("renders a well-formed tool call with name and arguments", () => {
    const tc = makeToolCall("tc-1", "search", { query: "hello" });
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [tc] },
      { role: "tool", content: '{"results":[]}', tool_call_id: "tc-1", name: "search" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("search")).toBeInTheDocument();

    // expand to verify args & output render
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.getByText("query")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders multiple tool calls in the same assistant turn", () => {
    const tc1 = makeToolCall("tc-a", "get_weather", { city: "London" });
    const tc2 = makeToolCall("tc-b", "get_time", { timezone: "UTC" });
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [tc1, tc2] },
      { role: "tool", content: "sunny", tool_call_id: "tc-a", name: "get_weather" },
      { role: "tool", content: "12:00", tool_call_id: "tc-b", name: "get_time" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("get_weather")).toBeInTheDocument();
    expect(screen.getByText("get_time")).toBeInTheDocument();
  });

  it("renders tool call with empty arguments object", () => {
    const tc = makeToolCall("tc-2", "list_items", {});
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [tc] },
      { role: "tool", content: "item1, item2", tool_call_id: "tc-2", name: "list_items" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("list_items")).toBeInTheDocument();

    // expand – should show output but no Input section
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  // ── malformed / missing tool call data ────────────────────────────

  it("handles tool message with no matching tool_call_id (undefined toolCall)", () => {
    const messages: Message[] = [
      { role: "tool", content: "some output", tool_call_id: "missing-id", name: "my_tool" },
    ];

    render(<MessagesDisplay messages={messages} />);
    // should fall back to message.name
    expect(screen.getByText("my_tool")).toBeInTheDocument();
  });

  it("handles tool message with no name and no toolCall – falls back to 'unknown'", () => {
    const messages: Message[] = [
      { role: "tool", content: "output", tool_call_id: "orphan" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("handles toolCall with missing function property", () => {
    // Simulate malformed data where function is undefined
    const badToolCall = { id: "tc-bad", type: "function" } as unknown as ToolCall;
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [badToolCall] },
      { role: "tool", content: "result", tool_call_id: "tc-bad", name: "fallback_name" },
    ];

    // Should NOT throw – the fix uses optional chaining on .function
    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("fallback_name")).toBeInTheDocument();
  });

  it("handles toolCall with function but missing name", () => {
    const badToolCall = {
      id: "tc-noname",
      type: "function",
      function: { arguments: '{"a":1}' },
    } as unknown as ToolCall;
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [badToolCall] },
      { role: "tool", content: "ok", tool_call_id: "tc-noname", name: "msg_name" },
    ];

    render(<MessagesDisplay messages={messages} />);
    // function.name is undefined, should fall back to message.name
    expect(screen.getByText("msg_name")).toBeInTheDocument();
  });

  it("handles toolCall with function but missing arguments", () => {
    const badToolCall = {
      id: "tc-noargs",
      type: "function",
      function: { name: "no_args_tool" },
    } as unknown as ToolCall;
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [badToolCall] },
      { role: "tool", content: "done", tool_call_id: "tc-noargs" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("no_args_tool")).toBeInTheDocument();

    // expand – no Input section since arguments is missing
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("handles toolCall with invalid JSON in arguments", () => {
    const badToolCall: ToolCall = {
      id: "tc-badjson",
      type: "function",
      function: { name: "broken_args", arguments: "not-json{{{" },
    };
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [badToolCall] },
      { role: "tool", content: "result", tool_call_id: "tc-badjson" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("broken_args")).toBeInTheDocument();

    // expand – parseToolCallArgs returns [] on invalid JSON, so no Input
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("handles toolCall with non-object JSON arguments (e.g. a string)", () => {
    const tc: ToolCall = {
      id: "tc-str",
      type: "function",
      function: { name: "string_arg", arguments: '"just a string"' },
    };
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [tc] },
      { role: "tool", content: "ok", tool_call_id: "tc-str" },
    ];

    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("string_arg")).toBeInTheDocument();

    // parseToolCallArgs returns [] for non-object parsed values
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });

  it("handles toolCall where function is null", () => {
    const badToolCall = {
      id: "tc-null-fn",
      type: "function",
      function: null,
    } as unknown as ToolCall;
    const messages: Message[] = [
      { role: "assistant", content: null, tool_calls: [badToolCall] },
      { role: "tool", content: "output", tool_call_id: "tc-null-fn" },
    ];

    // Should NOT throw
    render(<MessagesDisplay messages={messages} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
