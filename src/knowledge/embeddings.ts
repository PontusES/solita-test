import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, type EmbeddingModel } from "ai";

export interface EmbeddingProvider {
  // One batch method serves both indexing (many texts) and a query (one text).
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

export interface OpenAiEmbeddingOptions {
  apiKey: string;
  modelId: string;
  // Only set by tests, to stub HTTP instead of calling OpenAI.
  fetch?: typeof globalThis.fetch;
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly model: EmbeddingModel;

  constructor(options: OpenAiEmbeddingOptions) {
    const openai = createOpenAI({ apiKey: options.apiKey, fetch: options.fetch });
    this.model = openai.embedding(options.modelId);
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts,
      abortSignal: signal,
    });
    return embeddings;
  }
}
