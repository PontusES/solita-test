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

// An earlier turn of the conversation as the client sends it: text only. Tool calls and their
// results from earlier turns are not accepted from clients, so they cannot fake tool output.
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// Enough for a helpdesk conversation, and it bounds the tokens a single request can cost.
export const MAX_HISTORY_MESSAGES = 20;
// Answers can be longer than questions, but still bounded.
export const MAX_ASSISTANT_TURN_LENGTH = 8000;

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };
