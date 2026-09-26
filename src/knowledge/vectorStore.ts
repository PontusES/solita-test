export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  // A zero vector has no direction, so it is treated as similar to nothing.
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface VectorEntry<T> {
  item: T;
  vector: number[];
}

export interface SearchHit<T> {
  item: T;
  score: number;
}

// Generic over the stored item so the store knows nothing about articles or any other domain.
export class VectorStore<T extends { id: string }> {
  private readonly entries: VectorEntry<T>[] = [];

  add(entries: VectorEntry<T>[]): void {
    this.entries.push(...entries);
  }

  // A linear scan over every entry. Fine for a handful of documents, see SHORTCUTS.md.
  search(queryVector: number[], topK: number, minScore: number): SearchHit<T>[] {
    return this.entries
      .map((entry) => ({ item: entry.item, score: cosineSimilarity(queryVector, entry.vector) }))
      .filter((hit) => hit.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
