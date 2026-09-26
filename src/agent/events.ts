import type { GuardrailNotice } from "../guardrails/types";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Everything the agent reports while it runs. Both HTTP transports (JSON and SSE) are built
// from this one stream of events.
export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "tool-result"; id: string; name: string; result: unknown; isError: boolean }
  | ({ type: "guardrail" } & GuardrailNotice)
  | { type: "done"; finishReason: "stop" | "max-steps"; usage?: TokenUsage }
  | { type: "error"; message: string };
