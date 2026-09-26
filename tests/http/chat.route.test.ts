import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/agent/chat/route";
import { setContainerForTests } from "@/container";
import { chatResponseSchema } from "@/http/schemas";
import { searchThenAnswer, useFakeContainer } from "./testContainer";

function postChat(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

afterEach(() => setContainerForTests(undefined));

describe("POST /api/agent/chat", () => {
  it("returns the answer with the tool trace", async () => {
    const llm = useFakeContainer(searchThenAnswer);

    const response = await postChat(
      JSON.stringify({ message: "  The printer prints blank pages  " }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(chatResponseSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      answer: "Replace the toner cartridge.",
      finishReason: "stop",
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      toolCalls: [
        {
          name: "search_knowledge_base",
          isError: false,
          result: { results: [{ id: "kb-printer-blank-pages" }] },
        },
      ],
    });
    // The message is trimmed before it reaches the agent.
    expect(llm.requests[0]?.messages[0]).toEqual({
      role: "user",
      content: "The printer prints blank pages",
    });
  });

  it.each([
    ["a missing message", "{}"],
    ["an empty message", JSON.stringify({ message: "   " })],
    ["a message that is too long", JSON.stringify({ message: "a".repeat(2001) })],
    ["a message that is not a string", JSON.stringify({ message: 42 })],
  ])("rejects %s with 400", async (_, body) => {
    const llm = useFakeContainer([]);

    const response = await postChat(body);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({
      title: "Invalid request",
      status: 400,
      errors: [{ path: "message" }],
    });
    expect(llm.requests).toHaveLength(0);
  });

  it("rejects malformed JSON with 400", async () => {
    useFakeContainer([]);

    const response = await postChat("{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ title: "Invalid JSON body", status: 400 });
  });

  it("returns a generic 500 without leaking internal errors", async () => {
    // No scripted steps: the fake LLM throws on the first call.
    useFakeContainer([]);

    const response = await postChat(JSON.stringify({ message: "hello" }));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
      title: "Internal Server Error",
      detail: "The agent could not answer the request.",
      requestId: response.headers.get("x-request-id"),
    });
    expect(text).not.toContain("FakeLlmClient");
  });
});
