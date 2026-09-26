import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/agent/events";
import { createAgentEventStream, encodeSseEvent } from "@/http/sse";
import { silentLogger, type Logger } from "@/logger";
import { parseSse } from "@/http/sseParser";

async function* emit(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  yield* events;
}

function streamOf(events: AsyncIterable<AgentEvent>, signal = new AbortController().signal) {
  return createAgentEventStream(events, { requestId: "req-1", logger: silentLogger, signal });
}

describe("encodeSseEvent", () => {
  it("writes one event with a single JSON data line", () => {
    expect(encodeSseEvent({ type: "text-delta", text: "Hi\nthere" })).toBe(
      'event: text-delta\ndata: {"type":"text-delta","text":"Hi\\nthere"}\n\n',
    );
  });
});

describe("createAgentEventStream", () => {
  it("forwards every event in order and closes after done", async () => {
    const body = await new Response(
      streamOf(
        emit([
          {
            type: "tool-call",
            id: "c1",
            name: "get_escalation_contact",
            args: { severity: "normal" },
          },
          {
            type: "tool-result",
            id: "c1",
            name: "get_escalation_contact",
            result: "Email us",
            isError: false,
          },
          { type: "text-delta", text: "Email us" },
          { type: "done", finishReason: "stop" },
        ]),
      ),
    ).text();

    expect(parseSse(body).map((event) => event.event)).toEqual([
      "tool-call",
      "tool-result",
      "text-delta",
      "done",
    ]);
  });

  it("replaces the internal error with a public error event and closes", async () => {
    const body = await new Response(
      streamOf(
        emit([
          { type: "text-delta", text: "Partial" },
          { type: "error", message: "OpenAI 429: rate limit for org-secret" },
          { type: "text-delta", text: "never sent" },
        ]),
      ),
    ).text();

    expect(parseSse(body)).toEqual([
      { event: "text-delta", data: { type: "text-delta", text: "Partial" } },
      {
        event: "error",
        data: {
          type: "error",
          code: "agent_failed",
          message: "The agent could not answer the request.",
          requestId: "req-1",
        },
      },
    ]);
    expect(body).not.toContain("org-secret");
  });

  it("sends nothing for an error caused by the client disconnecting", async () => {
    const controller = new AbortController();
    controller.abort();

    const body = await new Response(
      streamOf(emit([{ type: "error", message: "Request aborted" }]), controller.signal),
    ).text();

    expect(body).toBe("");
  });

  it("stops the agent generator when the client cancels the stream", async () => {
    let finished = false;
    async function* agent(): AsyncGenerator<AgentEvent> {
      try {
        yield { type: "text-delta", text: "one" };
        yield { type: "text-delta", text: "two" };
      } finally {
        finished = true;
      }
    }

    const reader = streamOf(agent()).getReader();
    await reader.read();
    await reader.cancel();

    expect(finished).toBe(true);
  });

  it("logs a disconnect once when a pending event arrives after the client cancelled", async () => {
    // Like a real disconnect: the agent is still working when the client goes away, and then
    // yields the abort error into a stream that is already cancelled.
    const abort = new AbortController();
    let release = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    async function* agent(): AsyncGenerator<AgentEvent> {
      await pending;
      yield { type: "error", message: "Request aborted" };
    }
    const logs: { level: string; message: string }[] = [];
    const record = (level: string) => (message: string) => logs.push({ level, message });
    const logger: Logger = {
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      child: () => logger,
    };

    const reader = createAgentEventStream(agent(), {
      requestId: "req-1",
      logger,
      signal: abort.signal,
    }).getReader();
    const read = reader.read();
    abort.abort();
    const cancelled = reader.cancel();
    release();
    await Promise.all([read, cancelled]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logs).toEqual([{ level: "info", message: "client disconnected" }]);
  });
});
