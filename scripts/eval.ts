import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getConfig } from "../src/config";
import { createAgentDeps } from "../src/container";
import { evalCases } from "../evals/cases";
import { createOpenAiJudge } from "../evals/judge";
import { runEvals } from "../evals/runEvals";

// Usage: npm run eval -- [--prompt prompts/system.md] [--guardrail-prompt prompts/guardrail.md]
//                        [--runs 1] [--split all] [--concurrency 4]
// A main function instead of top-level await, which tsx does not support in CommonJS mode.
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string", default: "prompts/system.md" },
      "guardrail-prompt": { type: "string", default: "prompts/guardrail.md" },
      runs: { type: "string", default: "1" },
      split: { type: "string", default: "all" },
      concurrency: { type: "string", default: "4" },
    },
  });

  const runs = Number(values.runs);
  const concurrency = Number(values.concurrency);
  const split = values.split;
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("--runs and --concurrency must be positive integers");
  }
  if (split !== "train" && split !== "holdout" && split !== "all") {
    throw new Error("--split must be train, holdout or all");
  }

  // Next.js loads .env.local for the app; a plain script has to do it itself.
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const config = getConfig();
  const prompts = {
    system: (await readFile(values.prompt, "utf8")).trim(),
    guardrail: (await readFile(values["guardrail-prompt"], "utf8")).trim(),
  };
  const cases = evalCases.filter((evalCase) => split === "all" || evalCase.split === split);

  console.log(
    `Running ${cases.length} cases x ${runs} run(s) with ${config.OPENAI_CHAT_MODEL}, judged by ${config.EVAL_JUDGE_MODEL}, prompt ${values.prompt}`,
  );

  const report = await runEvals({
    cases,
    deps: createAgentDeps(config, prompts),
    judge: createOpenAiJudge({ apiKey: config.OPENAI_API_KEY, modelId: config.EVAL_JUDGE_MODEL }),
    runs,
    concurrency,
    onProgress: (caseId, run) =>
      console.log(`  ${caseId}: ${run.score.toFixed(2)}${run.error ? ` (${run.error})` : ""}`),
  });

  console.table(
    report.cases.map((result) => ({
      case: result.id,
      split: result.split,
      passRate: result.passRate.toFixed(2),
      score: result.meanScore.toFixed(2),
      tools: [
        ...new Set(result.runs.flatMap((run) => run.toolCalls.map((call) => call.name))),
      ].join(", "),
      failed: result.runs
        .flatMap((run) => run.checks.filter((check) => !check.passed).map((check) => check.check))
        .join("; "),
    })),
  );

  const format = (value: number | null) => (value === null ? "n/a" : value.toFixed(3));
  const { summary } = report;
  console.log(
    `Mean score: train ${format(summary.train.meanScore)}, holdout ${format(summary.holdout.meanScore)}, all ${format(summary.all.meanScore)}`,
  );
  console.log(
    `Tokens: agent ${summary.tokens.agent.inputTokens} in / ${summary.tokens.agent.outputTokens} out (${config.OPENAI_CHAT_MODEL}), judge ${summary.tokens.judge.inputTokens} in / ${summary.tokens.judge.outputTokens} out (${config.EVAL_JUDGE_MODEL})`,
  );

  const createdAt = new Date().toISOString();
  const outputPath = join("evals", "results", `${createdAt.replace(/[:.]/g, "-")}.json`);
  await mkdir(join("evals", "results"), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        meta: {
          createdAt,
          prompt: values.prompt,
          guardrailPrompt: values["guardrail-prompt"],
          guardrailModel: config.GUARDRAIL_MODEL,
          chatModel: config.OPENAI_CHAT_MODEL,
          judgeModel: config.EVAL_JUDGE_MODEL,
          embeddingModel: config.OPENAI_EMBEDDING_MODEL,
          kbMinScore: config.KB_MIN_SCORE,
          runs,
          split,
        },
        ...report,
      },
      null,
      2,
    ),
  );
  console.log(`Report written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
