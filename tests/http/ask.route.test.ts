import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/agent/ask/route";
import { setContainerForTests } from "@/container";
import { searchThenAnswer, useFakeContainer } from "./testContainer";

afterEach(() => setContainerForTests(undefined));

describe("GET /api/agent/ask", () => {
  it("answers the question in q with the same JSON as /chat", async () => {
    const llm = useFakeContainer(searchThenAnswer);

    const response = await GET(
      new Request("http://localhost/api/agent/ask?q=printer%20prints%20blank%20pages"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      answer: "Replace the toner cartridge.",
      finishReason: "stop",
      toolCalls: [{ name: "search_knowledge_base", isError: false }],
    });
    expect(llm.requests[0]?.messages[0]).toEqual({
      role: "user",
      content: "printer prints blank pages",
    });
  });

  it.each([
    ["a missing q", "http://localhost/api/agent/ask"],
    ["an empty q", "http://localhost/api/agent/ask?q="],
  ])("rejects %s with 400", async (_, url) => {
    useFakeContainer([]);

    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 400, errors: [{ path: "q" }] });
  });
});
