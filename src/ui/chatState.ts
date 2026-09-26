import type { FinishReason, TokenUsage } from "../agent/events";
import {
  MAX_ASSISTANT_TURN_LENGTH,
  MAX_HISTORY_MESSAGES,
  type ConversationTurn,
} from "../agent/messages";
import type { GuardrailNotice } from "../guardrails/types";
import type { ParsedSseEvent } from "../http/sseParser";

// One step of an answer, in the order the events arrived.
export type TimelineItem =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: unknown;
      // Missing until the tool result event arrives.
      result?: unknown;
      isError?: boolean;
    }
  | ({ kind: "guardrail" } & GuardrailNotice);

export interface Exchange {
  id: number;
  question: string;
  items: TimelineItem[];
  status: "streaming" | "done" | "error" | "stopped";
  finishReason?: FinishReason;
  usage?: TokenUsage;
  error?: { message: string; requestId?: string };
}

// Pure, so the page's behaviour for every event can be tested without a browser.
export function applyStreamEvent(exchange: Exchange, { event, data }: ParsedSseEvent): Exchange {
  switch (event) {
    case "text-delta": {
      const text = String(data.text ?? "");
      const last = exchange.items.at(-1);
      // Consecutive deltas grow one paragraph instead of adding an item per token.
      if (last?.kind === "text") {
        return {
          ...exchange,
          items: [...exchange.items.slice(0, -1), { kind: "text", text: last.text + text }],
        };
      }
      return { ...exchange, items: [...exchange.items, { kind: "text", text }] };
    }
    case "tool-call":
      return {
        ...exchange,
        items: [
          ...exchange.items,
          { kind: "tool", id: String(data.id), name: String(data.name), args: data.args },
        ],
      };
    case "tool-result":
      return {
        ...exchange,
        items: exchange.items.map((item) =>
          item.kind === "tool" && item.id === data.id
            ? { ...item, result: data.result, isError: data.isError === true }
            : item,
        ),
      };
    case "guardrail":
      return {
        ...exchange,
        items: [
          ...exchange.items,
          {
            kind: "guardrail",
            stage: data.stage as GuardrailNotice["stage"],
            rule: data.rule as GuardrailNotice["rule"],
            action: data.action as GuardrailNotice["action"],
          },
        ],
      };
    case "done":
      return {
        ...exchange,
        status: "done",
        finishReason: data.finishReason as FinishReason,
        usage: data.usage as TokenUsage | undefined,
      };
    case "error":
      return {
        ...exchange,
        status: "error",
        error: {
          message: String(data.message ?? "Something went wrong."),
          requestId: typeof data.requestId === "string" ? data.requestId : undefined,
        },
      };
    default:
      // Unknown events are ignored, so the server can add new ones without breaking the page.
      return exchange;
  }
}

// Search results are shown as title and score; anything else as formatted JSON.
export function describeSearchResult(result: unknown): { title: string; score: number }[] | null {
  if (typeof result !== "object" || result === null || !("results" in result)) return null;
  const { results } = result as { results: unknown };
  if (!Array.isArray(results)) return null;
  return results.map((hit: { title?: unknown; score?: unknown }) => ({
    title: String(hit.title ?? ""),
    score: Number(hit.score ?? 0),
  }));
}

export function answerText(exchange: Exchange): string {
  return exchange.items
    .flatMap((item) => (item.kind === "text" ? [item.text] : []))
    .join("")
    .trim();
}

// The earlier turns to send with the next message. The server keeps no state, so the page
// holds the conversation. Only finished exchanges with an answer count, and blocked ones are
// left out, so a refused attack is not replayed to the model on every later message.
export function toHistory(exchanges: Exchange[]): ConversationTurn[] {
  const turns = exchanges.flatMap((exchange): ConversationTurn[] => {
    const answer = answerText(exchange);
    if (exchange.status !== "done" || exchange.finishReason === "blocked" || !answer) return [];
    return [
      { role: "user", content: exchange.question },
      { role: "assistant", content: answer.slice(0, MAX_ASSISTANT_TURN_LENGTH) },
    ];
  });
  // Keep the most recent turns within the server's limit.
  return turns.slice(-MAX_HISTORY_MESSAGES);
}
