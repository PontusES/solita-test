import type { GuardrailNotice } from "../../guardrails/types";
import type { ToolDefinition } from "../../tools/tool";
import type { TokenUsage } from "../events";
import type { AgentMessage } from "../messages";

export type LlmStepEvent =
  | { type: "text-delta"; text: string }
  // Replaces all text of this step so far, after an output guardrail corrected it.
  | { type: "text-replace"; text: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | ({ type: "guardrail" } & GuardrailNotice)
  | { type: "finish"; usage?: TokenUsage };

export interface LlmStepRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  signal: AbortSignal;
}

// One model call, streamed. The client never runs tools; that is the agent loop's job.
// Failures are thrown, not yielded, so the loop has a single error path.
export interface LlmClient {
  streamStep(req: LlmStepRequest): AsyncIterable<LlmStepEvent>;
}
