import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { LlmStepEvent } from "@/agent/llm/llmClient";
import { OpenAiLlmClient } from "@/agent/llm/openAiClient";
import type { AgentMessage } from "@/agent/messages";
import { getEscalationContactTool } from "@/tools/getEscalationContact";
import { ToolRegistry } from "@/tools/registry";

// The chunk type lives in @ai-sdk/provider, which we do not depend on directly, so derive it
// from the mock model instead.
type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

const finishPart: MockStreamPart = {
  type: "finish",
  finishReason: { unified: "tool-calls", raw: undefined },
  usage: {
    inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 8, text: 8, reasoning: undefined },
  },
};

function mockModel(chunks: MockStreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
  });
}

async function collectStep(client: OpenAiLlmClient, messages: AgentMessage[]) {
  const events: LlmStepEvent[] = [];
  for await (const event of client.streamStep({
    system: "system prompt",
    messages,
    tools: new ToolRegistry([getEscalationContactTool]).definitions(),
    signal: new AbortController().signal,
  })) {
    events.push(event);
  }
  return events;
}

describe("OpenAiLlmClient", () => {
  it("maps text and tool call chunks to step events with usage", async () => {
    const model = mockModel([
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Escalating." },
      { type: "text-end", id: "t1" },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "get_escalation_contact",
        input: JSON.stringify({ severity: "critical" }),
      },
      finishPart,
    ]);

    const events = await collectStep(new OpenAiLlmClient(model), [
      { role: "user", content: "Mail is down for everyone" },
    ]);

    expect(events).toEqual([
      { type: "text-delta", text: "Escalating." },
      {
        type: "tool-call",
        id: "call-1",
        name: "get_escalation_contact",
        args: { severity: "critical" },
      },
      { type: "finish", usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 } },
    ]);
  });

  it("converts our messages and tools into the SDK prompt", async () => {
    const model = mockModel([finishPart]);

    await collectStep(new OpenAiLlmClient(model), [
      { role: "user", content: "Mail is down" },
      {
        role: "assistant",
        text: "",
        toolCalls: [{ id: "c1", name: "get_escalation_contact", args: { severity: "critical" } }],
      },
      {
        role: "tool",
        results: [{ id: "c1", name: "get_escalation_contact", result: "Call now", isError: false }],
      },
    ]);

    const [options] = model.doStreamCalls;
    expect(options?.reasoning).toBe("none");
    expect(options?.prompt).toMatchObject([
      { role: "system", content: "system prompt" },
      { role: "user", content: [{ type: "text", text: "Mail is down" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "get_escalation_contact",
            input: { severity: "critical" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", output: { type: "json", value: "Call now" } },
        ],
      },
    ]);
    expect(options?.tools).toMatchObject([
      {
        type: "function",
        name: "get_escalation_contact",
        inputSchema: { properties: { severity: { enum: ["critical", "normal"] } } },
      },
    ]);
  });

  it("rejects when the stream reports an error", async () => {
    const model = mockModel([{ type: "error", error: new Error("rate limited") }]);

    await expect(
      collectStep(new OpenAiLlmClient(model), [{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/rate limited/);
  });
});
