import { describe, expect, it } from "vitest";
import { AgentRunError, collect } from "@/agent/collect";
import type { AgentEvent } from "@/agent/events";

async function* emit(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  yield* events;
}

describe("collect", () => {
  it("builds the JSON result from the event stream", async () => {
    const usage = { inputTokens: 3, outputTokens: 4, totalTokens: 7 };
    const result = await collect(
      emit([
        { type: "tool-call", id: "c1", name: "search_knowledge_base", args: { query: "vpn" } },
        {
          type: "tool-result",
          id: "c1",
          name: "search_knowledge_base",
          result: { results: [] },
          isError: false,
        },
        { type: "text-delta", text: "Not " },
        { type: "text-delta", text: "covered." },
        { type: "done", finishReason: "stop", usage },
      ]),
    );

    expect(result).toEqual({
      answer: "Not covered.",
      toolCalls: [
        {
          name: "search_knowledge_base",
          args: { query: "vpn" },
          result: { results: [] },
          isError: false,
        },
      ],
      guardrails: [],
      finishReason: "stop",
      usage,
    });
  });

  it("applies a text-replace to the text since the last tool event only", async () => {
    const result = await collect(
      emit([
        { type: "text-delta", text: "Let me check. " },
        { type: "tool-call", id: "c1", name: "get_escalation_contact", args: {} },
        {
          type: "tool-result",
          id: "c1",
          name: "get_escalation_contact",
          result: "x",
          isError: false,
        },
        { type: "text-delta", text: "Call +1 555 0199 22." },
        { type: "text-replace", text: "Call [contact removed]." },
        { type: "done", finishReason: "stop" },
      ]),
    );

    expect(result.answer).toBe("Let me check. Call [contact removed].");
  });

  it("throws on an error event", async () => {
    await expect(collect(emit([{ type: "error", message: "boom" }]))).rejects.toThrow(
      AgentRunError,
    );
  });

  it("throws when the stream ends without done", async () => {
    await expect(collect(emit([{ type: "text-delta", text: "hi" }]))).rejects.toThrow(
      /without a result/,
    );
  });
});
