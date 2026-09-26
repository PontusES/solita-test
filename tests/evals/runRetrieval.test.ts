import { describe, expect, it } from "vitest";
import { articles } from "@/knowledge/articles";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { retrievalCases } from "../../evals/retrievalCases";
import { runRetrievalEval } from "../../evals/runRetrieval";

const testArticles = [
  { id: "vpn", title: "VPN", content: "vpn tunnel gateway remote access" },
  { id: "printer", title: "Printer", content: "printer toner blank pages" },
  { id: "wifi", title: "Wifi", content: "wireless network office certificate" },
];

describe("runRetrievalEval", () => {
  it("ranks every article and applies top k and the minimum score to what is returned", async () => {
    const report = await runRetrievalEval({
      cases: [
        { id: "vpn", query: "vpn tunnel broken", relevant: ["vpn"] },
        { id: "oos", query: "canteen lunch menu", relevant: [] },
      ],
      articles: testArticles,
      embeddings: new FakeEmbeddingProvider(),
      topK: 1,
      minScore: 0.1,
    });

    const [vpn, oos] = report.cases;
    expect(vpn?.ranking).toHaveLength(3);
    expect(vpn?.ranking[0]?.id).toBe("vpn");
    expect(vpn?.returned).toEqual(["vpn"]);
    expect(oos?.ranking).toHaveLength(3);
    expect(oos?.returned).toEqual([]);
    expect(report.summary.answerable.mrr).toBe(1);
    expect(report.summary.outOfScope.falseAccepts).toBe(0);
  });

  it("embeds articles and queries in one batch each", async () => {
    const calls: number[] = [];
    const embeddings = new FakeEmbeddingProvider();
    await runRetrievalEval({
      cases: retrievalCases,
      articles,
      embeddings: {
        embed: (texts) => {
          calls.push(texts.length);
          return embeddings.embed(texts);
        },
      },
      topK: 3,
      minScore: 0.5,
    });
    expect(calls).toEqual([articles.length, retrievalCases.length]);
  });
});

describe("retrievalCases", () => {
  const articleIds = new Set(articles.map((article) => article.id));

  it("has unique ids and only names real articles", () => {
    expect(new Set(retrievalCases.map((c) => c.id)).size).toBe(retrievalCases.length);
    for (const retrievalCase of retrievalCases) {
      for (const id of retrievalCase.relevant) {
        expect(articleIds).toContain(id);
      }
    }
  });

  it("covers every article and includes out of scope questions", () => {
    const covered = new Set(retrievalCases.flatMap((c) => c.relevant));
    expect(covered).toEqual(articleIds);
    expect(retrievalCases.some((c) => c.relevant.length === 0)).toBe(true);
  });

  it("never copies an article title as the question", () => {
    const titles = new Set(articles.map((article) => article.title.toLowerCase()));
    for (const retrievalCase of retrievalCases) {
      expect(titles).not.toContain(retrievalCase.query.toLowerCase());
    }
  });
});
