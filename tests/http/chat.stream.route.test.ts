import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/chat/stream/route";
import { setContainerForTests } from "@/container";
import { parseSse } from "./parseSse";
import { searchThenAnswer, useFakeContainer } from "./testContainer";

function postStream(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

afterEach(() => {
  setContainerForTests(undefined);
  vi.unstubAllEnvs();
});

describe("POST /api/agent/chat/stream", () => {
  it("streams the agent's events as SSE", async () => {
    useFakeContainer(searchThenAnswer);

    const response = await postStream(JSON.stringify({ message: "printer prints blank pages" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

    const events = parseSse(await response.text());
    expect(events.map((event) => event.event)).toEqual([
      "tool-call",
      "tool-result",
      "text-delta",
      "done",
    ]);
    expect(events[1]?.data).toMatchObject({
      name: "search_knowledge_base",
      isError: false,
      result: { results: [{ id: "kb-printer-blank-pages" }] },
    });
    expect(events[3]?.data).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("rejects an invalid body with 400 before any stream starts", async () => {
    useFakeContainer([]);

    const response = await postStream(JSON.stringify({ message: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });

  it("rejects malformed JSON with 400", async () => {
    useFakeContainer([]);

    const response = await postStream("{oops");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ title: "Invalid JSON body" });
  });

  it("ends the stream with a public error event when the run fails", async () => {
    // No scripted steps: the fake LLM throws on the first call, after the stream has started.
    useFakeContainer([]);

    const response = await postStream(JSON.stringify({ message: "hello" }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(parseSse(body)).toEqual([
      {
        event: "error",
        data: {
          type: "error",
          code: "agent_failed",
          message: "The agent could not answer the request.",
          requestId: response.headers.get("x-request-id"),
        },
      },
    ]);
    expect(body).not.toContain("FakeLlmClient");
  });

  it("returns a 500 problem, not a stream, when setup fails", async () => {
    // No test container and no API key: building the real container fails before streaming.
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await postStream(JSON.stringify({ message: "hello" }));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({
      code: "agent_failed",
      requestId: response.headers.get("x-request-id"),
    });
  });
});
