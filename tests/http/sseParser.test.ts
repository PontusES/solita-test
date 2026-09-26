import { describe, expect, it } from "vitest";
import { encodeSseEvent } from "@/http/sse";
import { createSseParser, parseSse } from "@/http/sseParser";

describe("createSseParser", () => {
  const body =
    encodeSseEvent({ type: "text-delta", text: "Hello" }) +
    encodeSseEvent({ type: "done", finishReason: "stop" });

  it("reads what encodeSseEvent writes", () => {
    expect(parseSse(body)).toEqual([
      { event: "text-delta", data: { type: "text-delta", text: "Hello" } },
      { event: "done", data: { type: "done", finishReason: "stop" } },
    ]);
  });

  it("keeps an incomplete block until the rest arrives, wherever a chunk ends", () => {
    for (let cut = 1; cut < body.length; cut++) {
      const parser = createSseParser();
      const events = [...parser.push(body.slice(0, cut)), ...parser.push(body.slice(cut))];
      expect(events.map((event) => event.event)).toEqual(["text-delta", "done"]);
    }
  });

  it("accepts CRLF line endings, also when split between chunks", () => {
    const crlf = body.replace(/\n/g, "\r\n");
    const parser = createSseParser();
    const cut = crlf.indexOf("\r\n") + 1;
    const events = [...parser.push(crlf.slice(0, cut)), ...parser.push(crlf.slice(cut))];
    expect(events).toHaveLength(2);
  });

  it("rejects a block without event or data", () => {
    expect(() => parseSse("data: {}\n\n")).toThrow("Malformed SSE block");
  });
});
