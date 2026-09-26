import { z } from "zod";
import { articleEmbeddingText, type Article } from "../knowledge/articles";
import type { EmbeddingProvider } from "../knowledge/embeddings";
import { VectorStore } from "../knowledge/vectorStore";
import type { Tool } from "./tool";

export interface SearchKnowledgeBaseDeps {
  embeddings: EmbeddingProvider;
  articles: Article[];
  defaultTopK: number;
  minScore: number;
}

const inputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  topK: z.number().int().min(1).max(5).optional(),
});

type SearchInput = z.infer<typeof inputSchema>;

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
}

export interface SearchOutput {
  results: SearchResult[];
  note?: string;
}

export function createSearchKnowledgeBaseTool(
  deps: SearchKnowledgeBaseDeps,
): Tool<SearchInput, SearchOutput> {
  let indexPromise: Promise<VectorStore<Article>> | undefined;

  async function buildIndex(): Promise<VectorStore<Article>> {
    // No abort signal here: the index is shared, so one disconnected client must not break it.
    const vectors = await deps.embeddings.embed(deps.articles.map(articleEmbeddingText));
    const store = new VectorStore<Article>();
    store.add(deps.articles.map((article, i) => ({ item: article, vector: vectors[i] ?? [] })));
    return store;
  }

  // Caching the promise, not the result, means concurrent first requests share one indexing run.
  function getIndex(): Promise<VectorStore<Article>> {
    indexPromise ??= buildIndex().catch((error: unknown) => {
      // Do not cache a failure forever; let the next request try again.
      indexPromise = undefined;
      throw error;
    });
    return indexPromise;
  }

  return {
    name: "search_knowledge_base",
    description:
      "Searches the IT department's internal knowledge base of troubleshooting guides and procedures. Use for any question about technical problems, accounts, hardware, software or how to do something. Returns the most relevant articles with similarity scores.",
    inputSchema,
    async execute(input, ctx) {
      const index = await getIndex();
      const [queryVector] = await deps.embeddings.embed([input.query], ctx.signal);
      const hits = index.search(queryVector ?? [], input.topK ?? deps.defaultTopK, deps.minScore);

      if (hits.length === 0) {
        return { results: [], note: "No relevant articles found." };
      }
      return {
        results: hits.map((hit) => ({
          id: hit.item.id,
          title: hit.item.title,
          content: hit.item.content,
          // Three decimals is plenty for the model and keeps noise out of its context.
          score: Math.round(hit.score * 1000) / 1000,
        })),
      };
    },
  };
}
