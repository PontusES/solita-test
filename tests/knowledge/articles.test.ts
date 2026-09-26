import { describe, expect, it } from "vitest";
import { articleEmbeddingText, articles } from "@/knowledge/articles";

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe("articles", () => {
  it("has 12 articles with unique ids", () => {
    expect(articles).toHaveLength(12);
    expect(new Set(articles.map((article) => article.id)).size).toBe(12);
  });

  it.each(articles)("$id is between 60 and 120 words", (article) => {
    const words = wordCount(article.content);
    expect(words).toBeGreaterThanOrEqual(60);
    expect(words).toBeLessThanOrEqual(120);
  });

  it("embeds the title and the content", () => {
    const article = { id: "x", title: "Title", content: "Body text" };
    expect(articleEmbeddingText(article)).toBe("Title\nBody text");
  });
});
