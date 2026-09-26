import type { EmbeddingProvider } from "./embeddings";

const DIMENSIONS = 256;

// FNV-1a: a tiny, well known string hash. Good enough to spread words over buckets.
function hashWord(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fakeEmbed(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const word of words) {
    const bucket = hashWord(word) % DIMENSIONS;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  return vector;
}

// Tests only. It matches shared words, not meaning, which would defeat the point of
// semantic search in production. It is deterministic and needs no network.
export class FakeEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(fakeEmbed);
  }
}
