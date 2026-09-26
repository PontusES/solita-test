import { describe, expect, it } from "vitest";
import type { ParsedSseEvent } from "@/http/sseParser";
import { applyStreamEvent, describeSearchResult, type Exchange } from "@/ui/chatState";

const start: Exchange = { id: 1, question: "VPN?", items: [], status: "streaming" };

function run(events: ParsedSseEvent[]): Exchange {
  return events.reduce(applyStreamEvent, start);
}

const event = (data: Record<string, unknown>): ParsedSseEvent => ({
  event: String(data.type),
  data,
});

describe("applyStreamEvent", () => {
  it("merges consecutive text deltas and keeps the order of tool calls", () => {
    const exchange = run([
      event({ type: "text-delta", text: "Let me " }),
      event({ type: "text-delta", text: "check." }),
      event({ type: "tool-call", id: "c1", name: "search_knowledge_base", args: { query: "vpn" } }),
      event({ type: "text-delta", text: "Try this." }),
    ]);
    expect(exchange.items).toEqual([
      { kind: "text", text: "Let me check." },
      { kind: "tool", id: "c1", name: "search_knowledge_base", args: { query: "vpn" } },
      { kind: "text", text: "Try this." },
    ]);
  });

  it("attaches a tool result to its call", () => {
    const exchange = run([
      event({ type: "tool-call", id: "c1", name: "get_escalation_contact", args: {} }),
      event({ type: "tool-call", id: "c2", name: "search_knowledge_base", args: {} }),
      event({ type: "tool-result", id: "c1", name: "x", result: { ok: 1 }, isError: false }),
    ]);
    expect(exchange.items[0]).toMatchObject({ id: "c1", result: { ok: 1 }, isError: false });
    expect(exchange.items[1]).not.toHaveProperty("result");
  });

  it("shows guardrails and finishes with the reason and usage", () => {
    const exchange = run([
      event({ type: "guardrail", stage: "input", rule: "prompt_injection", action: "blocked" }),
      event({ type: "done", finishReason: "blocked", usage: { totalTokens: 5 } }),
    ]);
    expect(exchange.items).toEqual([
      { kind: "guardrail", stage: "input", rule: "prompt_injection", action: "blocked" },
    ]);
    expect(exchange).toMatchObject({ status: "done", finishReason: "blocked" });
    expect(exchange.usage?.totalTokens).toBe(5);
  });

  it("keeps the public error message and request id", () => {
    const exchange = run([
      event({ type: "error", code: "agent_failed", message: "Failed.", requestId: "req-1" }),
    ]);
    expect(exchange).toMatchObject({
      status: "error",
      error: { message: "Failed.", requestId: "req-1" },
    });
  });

  it("ignores unknown events", () => {
    expect(run([event({ type: "something-new" })])).toEqual(start);
  });
});

describe("describeSearchResult", () => {
  it("lists titles and scores", () => {
    expect(
      describeSearchResult({ results: [{ id: "kb", title: "VPN", content: "...", score: 0.6 }] }),
    ).toEqual([{ title: "VPN", score: 0.6 }]);
  });

  it("returns null for anything that is not a search result", () => {
    expect(describeSearchResult("text")).toBeNull();
    expect(describeSearchResult({ error: "x" })).toBeNull();
  });
});
