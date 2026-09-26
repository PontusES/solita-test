import type { AgentEvent, TokenUsage } from "./events";

export interface ToolCallTrace {
  name: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentResult {
  answer: string;
  toolCalls: ToolCallTrace[];
  finishReason: "stop" | "max-steps";
  usage?: TokenUsage;
}

export class AgentRunError extends Error {}

// Turns the event stream into one JSON result. The JSON endpoints use this and the SSE
// endpoint forwards the same events, so there is one agent implementation for both.
export async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentResult> {
  let answer = "";
  const toolCalls = new Map<string, ToolCallTrace>();

  for await (const event of events) {
    switch (event.type) {
      case "text-delta":
        answer += event.text;
        break;
      case "tool-call":
        toolCalls.set(event.id, {
          name: event.name,
          args: event.args,
          result: undefined,
          isError: false,
        });
        break;
      case "tool-result": {
        const trace = toolCalls.get(event.id);
        if (trace) {
          trace.result = event.result;
          trace.isError = event.isError;
        }
        break;
      }
      case "done":
        return {
          answer,
          toolCalls: [...toolCalls.values()],
          finishReason: event.finishReason,
          usage: event.usage,
        };
      case "error":
        throw new AgentRunError(event.message);
    }
  }

  throw new AgentRunError("Agent ended without a result");
}
