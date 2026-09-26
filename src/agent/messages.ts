// Our own conversation format. Only the LLM adapter converts it to a provider's format,
// so the loop and its tests do not depend on any SDK.

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  result: unknown;
  isError: boolean;
}

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };
