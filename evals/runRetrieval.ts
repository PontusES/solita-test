import { articleEmbeddingText, type Article } from "../src/knowledge/articles";
import type { EmbeddingProvider } from "../src/knowledge/embeddings";
import { VectorStore } from "../src/knowledge/vectorStore";
import type { RetrievalCase } from "./retrievalCases";
import {
  summarizeRetrieval,
  type RetrievalCaseResult,
  type RetrievalSummary,
} from "./retrievalMetrics";

export interface RetrievalEvalOptions {
  cases: RetrievalCase[];
  articles: Article[];
  embeddings: EmbeddingProvider;
  topK: number;
  minScore: number;
}

export interface RetrievalReport {
  cases: RetrievalCaseResult[];
  summary: RetrievalSummary;
}

// Measures retrieval on its own, without the model: bad retrieval and bad generation are
// different failures. It indexes the articles exactly like the search tool does, but ranks
// every article, so the metrics can see how far down a relevant article ended up.
export async function runRetrievalEval(options: RetrievalEvalOptions): Promise<RetrievalReport> {
  const { cases, articles, embeddings, topK, minScore } = options;
  const articleVectors = await embeddings.embed(articles.map(articleEmbeddingText));
  const store = new VectorStore<Article>();
  store.add(articles.map((article, i) => ({ item: article, vector: articleVectors[i] ?? [] })));

  const queryVectors = await embeddings.embed(cases.map((retrievalCase) => retrievalCase.query));
  const results = cases.map((retrievalCase, i): RetrievalCaseResult => {
    const ranking = store
      .search(queryVectors[i] ?? [], articles.length, -Infinity)
      .map((hit) => ({ id: hit.item.id, score: Math.round(hit.score * 1000) / 1000 }));
    return {
      id: retrievalCase.id,
      query: retrievalCase.query,
      relevant: retrievalCase.relevant,
      ranking,
      // The same call the search tool makes, with its top k and minimum score.
      returned: store.search(queryVectors[i] ?? [], topK, minScore).map((hit) => hit.item.id),
    };
  });

  return { cases: results, summary: summarizeRetrieval(results) };
}
