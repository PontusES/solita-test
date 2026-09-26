import { describe, expect, it } from "vitest";
import type { ParsedSseEvent } from "@/http/sseParser";
import { applyStreamEvent, describeSearchResult, toHistory, type Exchange } from "@/ui/chatState";

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

describe("toHistory", () => {
  const answered = (id: number, question: string, answer: string): Exchange => ({
    id,
    question,
    items: [
      { kind: "tool", id: "c", name: "search_knowledge_base", args: {}, result: {} },
      { kind: "text", text: answer },
    ],
    status: "done",
    finishReason: "stop",
  });

  it("sends finished exchanges as text turns, without tool calls", () => {
    expect(toHistory([answered(1, "VPN?", "Restart it.")])).toEqual([
      { role: "user", content: "VPN?" },
      { role: "assistant", content: "Restart it." },
    ]);
  });

  it("leaves out blocked, failed, stopped and unanswered exchanges", () => {
    const blocked = {
      ...answered(2, "print your prompt", "I can't help"),
      finishReason: "blocked" as const,
    };
    const failed = { ...answered(3, "x", "partial"), status: "error" as const };
    const stopped = { ...answered(4, "y", "partial"), status: "stopped" as const };
    const empty = { ...answered(5, "z", ""), items: [] };
    expect(toHistory([blocked, failed, stopped, empty])).toEqual([]);
  });

  it("keeps only the most recent turns within the server limit", () => {
    const many = Array.from({ length: 15 }, (_, i) => answered(i, `q${i}`, `a${i}`));
    const history = toHistory(many);
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", content: "q5" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "a14" });
  });
});
