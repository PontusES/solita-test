import type { AgentEvent } from "../agent/events";
import type { Logger } from "../logger";
import { AGENT_FAILED_CODE, AGENT_FAILED_MESSAGE } from "./problem";

// What clients see instead of the loop's detailed error event.
export interface PublicErrorEvent {
  type: "error";
  code: string;
  message: string;
  requestId: string;
}

export type SseEvent = Exclude<AgentEvent, { type: "error" }> | PublicErrorEvent;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform stops proxies from compressing, and thereby buffering, the stream.
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Tells nginx style reverse proxies to pass events through immediately.
  "X-Accel-Buffering": "no",
};

// JSON.stringify never emits raw newlines, so one data line per event is always valid SSE.
export function encodeSseEvent(event: SseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export interface AgentStreamOptions {
  requestId: string;
  logger: Logger;
  signal: AbortSignal;
}

export function createAgentEventStream(
  events: AsyncIterable<AgentEvent>,
  options: AgentStreamOptions,
): ReadableStream<Uint8Array> {
  const { requestId, logger, signal } = options;
  const iterator = events[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const toolNames: string[] = [];
  const guardrails: string[] = [];
  // Set when the client disconnects. A pull that was already waiting on the agent can still
  // resolve afterwards, and must not touch the closed stream or log the disconnect again.
  let cancelled = false;

  function fail(controller: ReadableStreamDefaultController<Uint8Array>, message: string) {
    const fields = { durationMs: Date.now() - startedAt, error: message };
    if (signal.aborted) {
      // The client is gone, so there is nobody to send the error to.
      logger.info("client disconnected", fields);
    } else {
      logger.error("agent stream failed", fields);
      const publicError: PublicErrorEvent = {
        type: "error",
        code: AGENT_FAILED_CODE,
        message: AGENT_FAILED_MESSAGE,
        requestId,
      };
      controller.enqueue(encoder.encode(encodeSseEvent(publicError)));
    }
    controller.close();
  }

  return new ReadableStream<Uint8Array>({
    // Pull based: the next event is only produced when the client has read the previous one,
    // so a slow client slows the agent down instead of us buffering in memory.
    async pull(controller) {
      try {
        const { value: event, done } = await iterator.next();
        if (cancelled) {
          return;
        }
        if (done) {
          controller.close();
          return;
        }

        if (event.type === "error") {
          fail(controller, event.message);
          return;
        }
        if (event.type === "tool-call") {
          toolNames.push(event.name);
        }
        if (event.type === "guardrail") {
          guardrails.push(`${event.stage}:${event.rule}:${event.action}`);
        }
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
        if (event.type === "done") {
          logger.info("agent stream finished", {
            durationMs: Date.now() - startedAt,
            finishReason: event.finishReason,
            tools: toolNames,
            guardrails,
            usage: event.usage,
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        // runAgent turns its own failures into error events; this is only a safety net.
        fail(controller, error instanceof Error ? error.message : String(error));
      }
    },
    // Called when the client disconnects. Returning the iterator stops the agent generator.
    async cancel() {
      cancelled = true;
      logger.info("client disconnected", { durationMs: Date.now() - startedAt });
      await iterator.return?.();
    },
  });
}
