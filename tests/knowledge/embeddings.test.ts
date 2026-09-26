import { describe, expect, it } from "vitest";
import { OpenAiEmbeddingProvider } from "@/knowledge/embeddings";

interface RecordedRequest {
  url: string;
  body: { model: string; input: string[] };
}

// Stands in for the OpenAI HTTP API, so the adapter is tested without the network.
function createFetchStub(vectors: number[][]) {
  const requests: RecordedRequest[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const responseBody = {
      object: "list",
      data: vectors.map((embedding, index) => ({ object: "embedding", index, embedding })),
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 4, total_tokens: 4 },
    };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchStub, requests };
}

describe("OpenAiEmbeddingProvider", () => {
  it("sends the texts to the embeddings endpoint and returns vectors in order", async () => {
    const { fetchStub, requests } = createFetchStub([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const provider = new OpenAiEmbeddingProvider({
      apiKey: "sk-test",
      modelId: "text-embedding-3-small",
      fetch: fetchStub,
    });

    const vectors = await provider.embed(["first", "second"]);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/\/embeddings$/);
    expect(requests[0]?.body.model).toBe("text-embedding-3-small");
    expect(requests[0]?.body.input).toEqual(["first", "second"]);
  });
});
