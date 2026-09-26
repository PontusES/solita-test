import type { GuardrailNotice } from "../guardrails/types";
import type { AgentEvent, FinishReason, TokenUsage } from "./events";

export interface ToolCallTrace {
  name: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentResult {
  answer: string;
  toolCalls: ToolCallTrace[];
  guardrails: GuardrailNotice[];
  finishReason: FinishReason;
  usage?: TokenUsage;
}

export class AgentRunError extends Error {}

// Turns the event stream into one JSON result. The JSON endpoints use this and the SSE
// endpoint forwards the same events, so there is one agent implementation for both.
export async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentResult> {
  let answer = "";
  // Where the current run of text starts, which is what a text-replace event replaces.
  let textRunStart = 0;
  const toolCalls = new Map<string, ToolCallTrace>();
  const guardrails: GuardrailNotice[] = [];

  for await (const event of events) {
    switch (event.type) {
      case "text-delta":
        answer += event.text;
        break;
      case "text-replace":
        answer = answer.slice(0, textRunStart) + event.text;
        break;
      case "tool-call":
        textRunStart = answer.length;
        toolCalls.set(event.id, {
          name: event.name,
          args: event.args,
          result: undefined,
          isError: false,
        });
        break;
      case "tool-result": {
        textRunStart = answer.length;
        const trace = toolCalls.get(event.id);
        if (trace) {
          trace.result = event.result;
          trace.isError = event.isError;
        }
        break;
      }
      case "guardrail":
        guardrails.push({ stage: event.stage, rule: event.rule, action: event.action });
        break;
      case "done":
        return {
          answer,
          toolCalls: [...toolCalls.values()],
          guardrails,
          finishReason: event.finishReason,
          usage: event.usage,
        };
      case "error":
        throw new AgentRunError(event.message);
    }
  }

  throw new AgentRunError("Agent ended without a result");
}
