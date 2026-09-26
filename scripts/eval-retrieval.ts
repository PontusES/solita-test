import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "../src/config";
import { articles } from "../src/knowledge/articles";
import { OpenAiEmbeddingProvider } from "../src/knowledge/embeddings";
import { retrievalCases } from "../evals/retrievalCases";
import { runRetrievalEval } from "../evals/runRetrieval";

// Usage: npm run eval:retrieval -- [--top-k 3] [--min-score 0.5]
// Defaults come from KB_TOP_K and KB_MIN_SCORE, so a run measures the configured search.
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "top-k": { type: "string" },
      "min-score": { type: "string" },
    },
  });

  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const config = getConfig();
  const topK = values["top-k"] === undefined ? config.KB_TOP_K : Number(values["top-k"]);
  const minScore =
    values["min-score"] === undefined ? config.KB_MIN_SCORE : Number(values["min-score"]);
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("--top-k must be a positive integer");
  }
  if (!Number.isFinite(minScore) || minScore < -1 || minScore > 1) {
    throw new Error("--min-score must be a number between -1 and 1");
  }

  console.log(
    `Retrieval eval: ${retrievalCases.length} questions against ${articles.length} articles with ${config.OPENAI_EMBEDDING_MODEL}, top ${topK}, min score ${minScore}`,
  );

  const report = await runRetrievalEval({
    cases: retrievalCases,
    articles,
    embeddings: new OpenAiEmbeddingProvider({
      apiKey: config.OPENAI_API_KEY,
      modelId: config.OPENAI_EMBEDDING_MODEL,
    }),
    topK,
    minScore,
  });

  console.table(
    report.cases.map((result) => {
      const rank = result.ranking.findIndex((article) => result.relevant.includes(article.id));
      return {
        case: result.id,
        expected: result.relevant.join(", ") || "(nothing)",
        rank: result.relevant.length === 0 ? "" : rank === -1 ? "none" : rank + 1,
        top: `${result.ranking[0]?.id ?? ""} ${result.ranking[0]?.score ?? ""}`,
        returned: result.returned.join(", "),
      };
    }),
  );

  const format = (value: number | null) => (value === null ? "n/a" : value.toFixed(3));
  const { answerable, outOfScope } = report.summary;
  console.log(
    `Answerable (${answerable.cases}): recall@1 ${format(answerable.recallAt1)}, recall@3 ${format(answerable.recallAt3)}, recall@5 ${format(answerable.recallAt5)}, MRR ${format(answerable.mrr)}`,
  );
  console.log(
    `  returned by the tool: recall ${format(answerable.returnedRecall)}, lowest best relevant score ${format(answerable.lowestRelevantScore)}`,
  );
  console.log(
    `Out of scope (${outOfScope.cases}): ${outOfScope.falseAccepts} returned something, highest score ${format(outOfScope.highestScore)}`,
  );

  const createdAt = new Date().toISOString();
  const outputPath = join("evals", "results", `retrieval-${createdAt.replace(/[:.]/g, "-")}.json`);
  await mkdir(join("evals", "results"), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        meta: { createdAt, embeddingModel: config.OPENAI_EMBEDDING_MODEL, topK, minScore },
        ...report,
      },
      null,
      2,
    ),
  );
  console.log(`Report written to ${outputPath}`);
}

// A main function instead of top-level await, which tsx does not support in CommonJS mode.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
