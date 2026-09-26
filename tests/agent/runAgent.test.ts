import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AgentEvent } from "@/agent/events";
import { FakeLlmClient } from "@/agent/llm/fakeLlmClient";
import type { LlmStepEvent } from "@/agent/llm/llmClient";
import { runAgent, type AgentDeps } from "@/agent/runAgent";
import { articles } from "@/knowledge/articles";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { CRITICAL_ESCALATION_TEXT, getEscalationContactTool } from "@/tools/getEscalationContact";
import { ToolRegistry } from "@/tools/registry";
import { createSearchKnowledgeBaseTool } from "@/tools/searchKnowledgeBase";
import type { Tool } from "@/tools/tool";

const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

function text(value: string): LlmStepEvent {
  return { type: "text-delta", text: value };
}

function call(id: string, name: string, args: unknown): LlmStepEvent {
  return { type: "tool-call", id, name, args };
}

const finish: LlmStepEvent = { type: "finish", usage };

const searchTool = createSearchKnowledgeBaseTool({
  embeddings: new FakeEmbeddingProvider(),
  articles,
  defaultTopK: 3,
  minScore: 0.1,
});

const throwingTool: Tool<{ value: string }, string> = {
  name: "always_fails",
  description: "Test tool that always throws.",
  inputSchema: z.object({ value: z.string() }),
  async execute() {
    throw new Error("backend exploded");
  },
};

// Ignores its abort signal on purpose, to prove the loop's own timeout still fires.
const hangingTool: Tool<Record<string, never>, string> = {
  name: "hangs",
  description: "Test tool that never finishes.",
  inputSchema: z.object({}),
  execute: () => new Promise<string>(() => {}),
};

function createDeps(llm: FakeLlmClient, overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    llm,
    tools: new ToolRegistry([searchTool, getEscalationContactTool, throwingTool, hangingTool]),
    systemPrompt: "You are a test assistant.",
    maxSteps: 5,
    toolTimeoutMs: 1_000,
    ...overrides,
  };
}

async function run(
  llm: FakeLlmClient,
  overrides: Partial<AgentDeps> = {},
  signal = new AbortController().signal,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of runAgent({ message: "help" }, createDeps(llm, overrides), signal)) {
    events.push(event);
  }
  return events;
}

function toolResults(events: AgentEvent[]) {
  return events.filter((event) => event.type === "tool-result");
}

describe("runAgent", () => {
  it("streams a plain answer and finishes with stop when no tool is called", async () => {
    const llm = new FakeLlmClient([[text("Hello"), text(" there"), finish]]);

    const events = await run(llm);

    expect(events).toEqual([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " there" },
      { type: "done", finishReason: "stop", usage },
    ]);
    expect(llm.requests[0]?.system).toBe("You are a test assistant.");
    expect(llm.requests[0]?.tools.map((tool) => tool.name)).toContain("search_knowledge_base");
  });

  it("searches, sends the result back to the model and then answers", async () => {
    const llm = new FakeLlmClient([
      [call("c1", "search_knowledge_base", { query: "printer toner cartridge" }), finish],
      [text("Check the toner."), finish],
    ]);

    const events = await run(llm);

    expect(events.map((event) => event.type)).toEqual([
      "tool-call",
      "tool-result",
      "text-delta",
      "done",
    ]);
    const [result] = toolResults(events);
    expect(result?.isError).toBe(false);
    expect(result?.result).toMatchObject({ results: [{ id: "kb-printer-blank-pages" }] });

    // The second model call sees its own tool call and the tool's result.
    expect(llm.requests[1]?.messages).toEqual([
      { role: "user", content: "help" },
      {
        role: "assistant",
        text: "",
        toolCalls: [
          { id: "c1", name: "search_knowledge_base", args: { query: "printer toner cartridge" } },
        ],
      },
      {
        role: "tool",
        results: [
          { id: "c1", name: "search_knowledge_base", result: result?.result, isError: false },
        ],
      },
    ]);
    // Usage is summed over both steps.
    expect(events.at(-1)).toEqual({
      type: "done",
      finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });
  });

  it("can use both tools in one run", async () => {
    const llm = new FakeLlmClient([
      [call("c1", "search_knowledge_base", { query: "vpn tunnel" }), finish],
      [call("c2", "get_escalation_contact", { severity: "critical" }), finish],
      [text(CRITICAL_ESCALATION_TEXT), finish],
    ]);

    const events = await run(llm);

    expect(toolResults(events).map((event) => event.name)).toEqual([
      "search_knowledge_base",
      "get_escalation_contact",
    ]);
    expect(toolResults(events)[1]?.result).toBe(CRITICAL_ESCALATION_TEXT);
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("turns a throwing tool into an error result and keeps going", async () => {
    const llm = new FakeLlmClient([
      [call("c1", "always_fails", { value: "x" }), finish],
      [text("Sorry, that failed."), finish],
    ]);

    const events = await run(llm);

    expect(toolResults(events)[0]).toMatchObject({
      isError: true,
      result: { error: "backend exploded" },
    });
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("reports unknown tools and invalid arguments back to the model", async () => {
    const llm = new FakeLlmClient([
      [
        call("c1", "delete_everything", {}),
        call("c2", "get_escalation_contact", { severity: "urgent" }),
        finish,
      ],
      [text("Let me try again."), finish],
    ]);

    const events = await run(llm);
    const [unknown, invalid] = toolResults(events);

    expect(unknown).toMatchObject({
      isError: true,
      result: { error: "Unknown tool: delete_everything" },
    });
    expect(invalid?.isError).toBe(true);
    expect(invalid?.result).toMatchObject({ error: expect.stringMatching(/^Invalid arguments/) });
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("stops with max-steps when the model keeps calling tools", async () => {
    const step = [call("c", "get_escalation_contact", { severity: "normal" }), finish];
    const llm = new FakeLlmClient([step, step, step]);

    const events = await run(llm, { maxSteps: 2 });

    expect(llm.requests).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "max-steps" });
  });

  it("does not call the model when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const llm = new FakeLlmClient([[text("never"), finish]]);

    const events = await run(llm, {}, controller.signal);

    expect(llm.requests).toHaveLength(0);
    expect(events).toEqual([{ type: "error", message: "Request aborted" }]);
  });

  it("times out a tool that never finishes", async () => {
    const llm = new FakeLlmClient([
      [call("c1", "hangs", {}), finish],
      [text("That took too long."), finish],
    ]);

    const events = await run(llm, { toolTimeoutMs: 20 });

    expect(toolResults(events)[0]).toMatchObject({
      isError: true,
      result: { error: "Tool timed out after 20 ms" },
    });
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("forwards guardrail notices once per run, even if several steps report them", async () => {
    const secret: LlmStepEvent = {
      type: "guardrail",
      stage: "input",
      rule: "secret",
      action: "redacted",
    };
    const llm = new FakeLlmClient([
      [secret, call("c1", "get_escalation_contact", { severity: "normal" }), finish],
      [secret, text("Here is the contact."), finish],
    ]);

    const events = await run(llm);

    expect(events.filter((event) => event.type === "guardrail")).toEqual([
      { type: "guardrail", stage: "input", rule: "secret", action: "redacted" },
    ]);
  });

  it("emits an error event when the model call fails", async () => {
    const llm = new FakeLlmClient([]);

    const events = await run(llm);

    expect(events).toEqual([{ type: "error", message: "FakeLlmClient: no scripted step 1" }]);
  });
});
