import { describe, expect, it } from "vitest";
import { articles } from "@/knowledge/articles";
import type { EmbeddingProvider } from "@/knowledge/embeddings";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { createSearchKnowledgeBaseTool } from "@/tools/searchKnowledgeBase";

const ctx = { signal: new AbortController().signal };

// Wraps the fake provider to count how often the full article set is embedded.
class CountingEmbeddingProvider implements EmbeddingProvider {
  indexCalls = 0;
  failNextIndex = false;
  private readonly inner = new FakeEmbeddingProvider();

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === articles.length) {
      this.indexCalls++;
      if (this.failNextIndex) {
        this.failNextIndex = false;
        throw new Error("embedding service unavailable");
      }
    }
    return this.inner.embed(texts);
  }
}

function createTool(embeddings: EmbeddingProvider, minScore = 0.1) {
  return createSearchKnowledgeBaseTool({ embeddings, articles, defaultTopK: 3, minScore });
}

describe("search_knowledge_base", () => {
  it("returns the most relevant article first with the expected shape", async () => {
    const tool = createTool(new FakeEmbeddingProvider());
    const output = await tool.execute({ query: "printer toner cartridge" }, ctx);

    expect(output.note).toBeUndefined();
    expect(output.results[0]).toEqual({
      id: "kb-printer-blank-pages",
      title: "Printer output is empty or faded",
      content: expect.any(String),
      score: expect.any(Number),
    });
  });

  it("uses topK from the input and falls back to the configured default", async () => {
    const tool = createTool(new FakeEmbeddingProvider(), 0);

    const limited = await tool.execute({ query: "printer toner cartridge", topK: 2 }, ctx);
    const byDefault = await tool.execute({ query: "printer toner cartridge" }, ctx);

    expect(limited.results).toHaveLength(2);
    expect(byDefault.results).toHaveLength(3);
  });

  it("returns an explicit note when nothing is relevant enough", async () => {
    const tool = createTool(new FakeEmbeddingProvider());
    const output = await tool.execute({ query: "zzz qqq xyzzy" }, ctx);

    expect(output).toEqual({ results: [], note: "No relevant articles found." });
  });

  it("embeds the articles only once, also for concurrent first calls", async () => {
    const embeddings = new CountingEmbeddingProvider();
    const tool = createTool(embeddings);

    await Promise.all([
      tool.execute({ query: "printer" }, ctx),
      tool.execute({ query: "vpn" }, ctx),
    ]);
    await tool.execute({ query: "password" }, ctx);

    expect(embeddings.indexCalls).toBe(1);
  });

  it("retries indexing after a failed first attempt", async () => {
    const embeddings = new CountingEmbeddingProvider();
    embeddings.failNextIndex = true;
    const tool = createTool(embeddings);

    await expect(tool.execute({ query: "printer" }, ctx)).rejects.toThrow(/unavailable/);
    const output = await tool.execute({ query: "printer toner cartridge" }, ctx);

    expect(output.results.length).toBeGreaterThan(0);
    expect(embeddings.indexCalls).toBe(2);
  });

  it("rejects invalid input", () => {
    const { inputSchema } = createTool(new FakeEmbeddingProvider());

    expect(inputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(inputSchema.safeParse({ query: "   " }).success).toBe(false);
    expect(inputSchema.safeParse({ query: "a".repeat(501) }).success).toBe(false);
    expect(inputSchema.safeParse({ query: "vpn", topK: 6 }).success).toBe(false);
    expect(inputSchema.safeParse({ query: "vpn", topK: 2 }).success).toBe(true);
  });
});
