// Pure retrieval metrics. `ranking` is article ids ordered best first.

// Share of the relevant articles that appear in the first k results.
export function recallAtK(ranking: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 0;
  const top = new Set(ranking.slice(0, k));
  return relevant.filter((id) => top.has(id)).length / relevant.length;
}

// 1 / rank of the first relevant article, or 0 if none is ranked at all.
export function reciprocalRank(ranking: string[], relevant: string[]): number {
  const index = ranking.findIndex((id) => relevant.includes(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export interface RankedArticle {
  id: string;
  score: number;
}

export interface RetrievalCaseResult {
  id: string;
  query: string;
  relevant: string[];
  // Every article, best first, with its cosine similarity.
  ranking: RankedArticle[];
  // What the search tool would actually return with the configured top k and minimum score.
  returned: string[];
}

export interface RetrievalSummary {
  answerable: {
    cases: number;
    recallAt1: number;
    recallAt3: number;
    recallAt5: number;
    mrr: number;
    // Recall over what the tool returns, so it includes the effect of the minimum score.
    returnedRecall: number;
    // The weakest best relevant hit. Above the minimum score means no relevant article is cut.
    lowestRelevantScore: number | null;
  };
  outOfScope: {
    cases: number;
    // Out of scope questions where the tool still returns something.
    falseAccepts: number;
    // The strongest hit for an out of scope question. Below the minimum score is what we want.
    highestScore: number | null;
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeRetrieval(results: RetrievalCaseResult[]): RetrievalSummary {
  const answerable = results.filter((result) => result.relevant.length > 0);
  const outOfScope = results.filter((result) => result.relevant.length === 0);
  const ids = (result: RetrievalCaseResult) => result.ranking.map((article) => article.id);
  const recall = (k: number) =>
    mean(answerable.map((result) => recallAtK(ids(result), result.relevant, k)));

  const bestRelevantScores = answerable.flatMap((result) => {
    const hit = result.ranking.find((article) => result.relevant.includes(article.id));
    return hit ? [hit.score] : [];
  });
  const topOutOfScopeScores = outOfScope.flatMap((result) =>
    result.ranking[0] ? [result.ranking[0].score] : [],
  );

  return {
    answerable: {
      cases: answerable.length,
      recallAt1: recall(1),
      recallAt3: recall(3),
      recallAt5: recall(5),
      mrr: mean(answerable.map((result) => reciprocalRank(ids(result), result.relevant))),
      returnedRecall: mean(
        answerable.map((result) =>
          recallAtK(result.returned, result.relevant, result.returned.length),
        ),
      ),
      lowestRelevantScore: bestRelevantScores.length ? Math.min(...bestRelevantScores) : null,
    },
    outOfScope: {
      cases: outOfScope.length,
      falseAccepts: outOfScope.filter((result) => result.returned.length > 0).length,
      highestScore: topOutOfScopeScores.length ? Math.max(...topOutOfScopeScores) : null,
    },
  };
}
