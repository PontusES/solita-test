import { describe, expect, it } from "vitest";
import {
  recallAtK,
  reciprocalRank,
  summarizeRetrieval,
  type RetrievalCaseResult,
} from "../../evals/retrievalMetrics";

describe("recallAtK", () => {
  it("counts the share of relevant ids in the first k", () => {
    expect(recallAtK(["a", "b", "c"], ["b"], 1)).toBe(0);
    expect(recallAtK(["a", "b", "c"], ["b"], 2)).toBe(1);
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 2)).toBe(0.5);
  });

  it("is 0 when there is nothing relevant", () => {
    expect(recallAtK(["a"], [], 1)).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("uses the first relevant id", () => {
    expect(reciprocalRank(["a", "b", "c"], ["a"])).toBe(1);
    expect(reciprocalRank(["a", "b", "c"], ["c", "b"])).toBe(0.5);
  });

  it("is 0 when no relevant id is ranked", () => {
    expect(reciprocalRank(["a", "b"], ["z"])).toBe(0);
  });
});

function result(relevant: string[], ranking: [string, number][], returned: string[]) {
  return {
    id: relevant.join("+") || "oos",
    query: "q",
    relevant,
    ranking: ranking.map(([id, score]) => ({ id, score })),
    returned,
  } satisfies RetrievalCaseResult;
}

describe("summarizeRetrieval", () => {
  const results = [
    // Ranked first and returned.
    result(
      ["a"],
      [
        ["a", 0.7],
        ["b", 0.3],
      ],
      ["a"],
    ),
    // Ranked second and cut by the minimum score.
    result(
      ["b"],
      [
        ["a", 0.45],
        ["b", 0.4],
      ],
      [],
    ),
    // Out of scope, and correctly returns nothing.
    result(
      [],
      [
        ["a", 0.2],
        ["b", 0.1],
      ],
      [],
    ),
    // Out of scope, but still clears the minimum score.
    result(
      [],
      [
        ["b", 0.55],
        ["a", 0.1],
      ],
      ["b"],
    ),
  ];

  it("keeps ranking quality and what the tool returns apart", () => {
    const { answerable } = summarizeRetrieval(results);
    expect(answerable.cases).toBe(2);
    expect(answerable.recallAt1).toBe(0.5);
    expect(answerable.recallAt3).toBe(1);
    expect(answerable.mrr).toBe(0.75);
    expect(answerable.returnedRecall).toBe(0.5);
    expect(answerable.lowestRelevantScore).toBe(0.4);
  });

  it("counts out of scope questions that still return something", () => {
    const { outOfScope } = summarizeRetrieval(results);
    expect(outOfScope).toEqual({ cases: 2, falseAccepts: 1, highestScore: 0.55 });
  });

  it("reports n/a scores when a group is empty", () => {
    const summary = summarizeRetrieval([]);
    expect(summary.answerable.lowestRelevantScore).toBeNull();
    expect(summary.outOfScope.highestScore).toBeNull();
  });
});
