import { describe, expect, it } from "vitest";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { cosineSimilarity, VectorStore } from "@/knowledge/vectorStore";

describe("cosineSimilarity", () => {
  it("is 1 for vectors pointing the same way, regardless of length", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("is 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws when the lengths differ", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });
});

describe("VectorStore", () => {
  // The example strings from the assignment. The store is domain agnostic, so any text works.
  const docs = [
    { id: "france", text: "It's warmer in France than Sweden" },
    { id: "korea", text: "It's warmer in Korea than Finland" },
    { id: "printer", text: "The office printer needs new toner" },
  ];
  const embeddings = new FakeEmbeddingProvider();

  async function buildStore() {
    const vectors = await embeddings.embed(docs.map((doc) => doc.text));
    const store = new VectorStore<{ id: string; text: string }>();
    store.add(docs.map((doc, i) => ({ item: doc, vector: vectors[i] ?? [] })));
    return store;
  }

  async function embedQuery(text: string) {
    const [vector] = await embeddings.embed([text]);
    return vector ?? [];
  }

  it("ranks the most similar document first", async () => {
    const store = await buildStore();
    const hits = store.search(await embedQuery("Is France warmer than Sweden?"), 3, 0);

    expect(hits.map((hit) => hit.item.id)).toEqual(["france", "korea", "printer"]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);
  });

  it("returns at most topK results", async () => {
    const store = await buildStore();
    const hits = store.search(await embedQuery("warmer in Korea"), 1, 0);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.item.id).toBe("korea");
  });

  it("drops results below minScore", async () => {
    const store = await buildStore();
    const hits = store.search(await embedQuery("warmer in Finland"), 3, 0.3);

    expect(hits.map((hit) => hit.item.id)).toEqual(["korea", "france"]);
  });

  it("returns nothing when no document is similar enough", async () => {
    const store = await buildStore();
    const hits = store.search(await embedQuery("vacation policy"), 3, 0.3);

    expect(hits).toEqual([]);
  });
});
