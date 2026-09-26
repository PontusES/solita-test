import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { PromptSet } from "../src/agent/systemPrompt";
import { getConfig } from "../src/config";
import { createAgentDeps } from "../src/container";
import { evalCases } from "../evals/cases";
import { improvePrompt } from "../evals/improvePrompt";
import { createOpenAiJudge } from "../evals/judge";
import { createOpenAiOptimizer } from "../evals/optimizer";
import { runEvals } from "../evals/runEvals";
import type { EvalSummary } from "../evals/scoring";

// Usage: npm run improve-prompt -- [--prompt prompts/system.md] [--guardrail-prompt prompts/guardrail.md]
//                                  [--rounds 3] [--runs 3] [--apply]
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string", default: "prompts/system.md" },
      "guardrail-prompt": { type: "string", default: "prompts/guardrail.md" },
      rounds: { type: "string", default: "3" },
      // More than one run per case, because single runs are too noisy to compare prompts.
      runs: { type: "string", default: "3" },
      concurrency: { type: "string", default: "6" },
      apply: { type: "boolean", default: false },
    },
  });

  const rounds = Number(values.rounds);
  const runs = Number(values.runs);
  const concurrency = Number(values.concurrency);
  for (const [name, value] of Object.entries({ rounds, runs, concurrency })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`--${name} must be a positive integer`);
    }
  }

  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const config = getConfig();
  const paths = { system: values.prompt, guardrail: values["guardrail-prompt"] };
  const base: PromptSet = {
    system: (await readFile(paths.system, "utf8")).trim(),
    guardrail: (await readFile(paths.guardrail, "utf8")).trim(),
  };
  const judge = createOpenAiJudge({
    apiKey: config.OPENAI_API_KEY,
    modelId: config.EVAL_JUDGE_MODEL,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const candidatesDir = join("prompts", "candidates");
  await mkdir(candidatesDir, { recursive: true });
  const candidatePath = (round: number, kind: keyof PromptSet) =>
    join(candidatesDir, `${stamp}-r${round}.${kind}.md`);

  console.log(
    `Improving ${paths.system} and ${paths.guardrail}: ${rounds} round(s), ${evalCases.length} cases x ${runs} run(s) per evaluation, optimizer ${config.EVAL_OPTIMIZER_MODEL}`,
  );

  const result = await improvePrompt({
    base,
    rounds,
    // Every evaluation, baseline and candidates, runs all cases so holdout is always measured.
    evaluate: (prompts) =>
      runEvals({
        cases: evalCases,
        deps: createAgentDeps(config, prompts),
        judge,
        runs,
        concurrency,
      }),
    optimizer: createOpenAiOptimizer({
      apiKey: config.OPENAI_API_KEY,
      modelId: config.EVAL_OPTIMIZER_MODEL,
    }),
    onLog: (message) => console.log(message),
    onRound: async (round) => {
      // Every candidate is kept, accepted or not: both prompts (usable with --prompt and
      // --guardrail-prompt) and their scores and reasoning next to them.
      await writeFile(candidatePath(round.round, "system"), `${round.prompts.system}\n`);
      await writeFile(candidatePath(round.round, "guardrail"), `${round.prompts.guardrail}\n`);
      await writeFile(
        join(candidatesDir, `${stamp}-r${round.round}.json`),
        JSON.stringify(
          {
            round: round.round,
            accepted: round.decision.accepted,
            reasons: round.decision.reasons,
            rationale: round.rationale,
            changes: round.changes,
            changedPrompts: (["system", "guardrail"] as const).filter(
              (kind) => round.prompts[kind] !== base[kind],
            ),
            weaknesses: round.weaknessIds,
            summary: round.summary,
          },
          null,
          2,
        ),
      );
      console.log(
        `Round ${round.round}: ${round.decision.accepted ? "ACCEPTED" : "rejected"}${round.decision.reasons.length ? ` (${round.decision.reasons.join("; ")})` : ""}`,
      );
      console.log(`  written to ${join(candidatesDir, `${stamp}-r${round.round}.*`)}`);
    },
  });

  const format = (value: number | null) => (value === null ? "n/a" : value.toFixed(3));
  const line = (label: string, summary: EvalSummary) =>
    `${label}: train ${format(summary.train.meanScore)}, holdout ${format(summary.holdout.meanScore)}, all ${format(summary.all.meanScore)}`;

  console.log("");
  console.log(line("Baseline", result.baseline));
  console.log(line("Best    ", result.best.summary));
  if (result.stoppedEarly) {
    console.log(`Stopped early: ${result.stoppedEarly}`);
  }
  const accepted = result.rounds.filter((round) => round.decision.accepted);
  console.log(`Accepted rounds: ${accepted.length} of ${result.rounds.length}`);
  for (const round of accepted) {
    for (const change of round.changes) {
      console.log(`  r${round.round}: ${change}`);
    }
  }

  const last = accepted.at(-1);
  if (!last) {
    console.log("The prompts are unchanged: no candidate was measurably better.");
  } else if (values.apply) {
    await writeFile(paths.system, `${result.best.prompts.system}\n`);
    await writeFile(paths.guardrail, `${result.best.prompts.guardrail}\n`);
    console.log(
      `Applied the best candidate to ${paths.system} and ${paths.guardrail}. Review with git diff.`,
    );
  } else {
    console.log(`Review with: diff ${paths.system} ${candidatePath(last.round, "system")}`);
    console.log(`        and: diff ${paths.guardrail} ${candidatePath(last.round, "guardrail")}`);
    console.log("Then rerun with --apply to write them, or copy them by hand.");
  }
}

// A main function instead of top-level await, which tsx does not support in CommonJS mode.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
