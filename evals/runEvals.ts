import { collect } from "../src/agent/collect";
import { runAgent, type AgentDeps } from "../src/agent/runAgent";
import type { EvalCase } from "./cases";
import type { Judge } from "./judge";
import {
  checkExpectations,
  scoreRun,
  searchScores,
  summarize,
  summarizeCase,
  type CaseResult,
  type EvalRun,
  type EvalSummary,
} from "./scoring";

export interface EvalOptions {
  cases: EvalCase[];
  deps: AgentDeps;
  judge: Judge;
  runs: number;
  concurrency: number;
  onProgress?: (caseId: string, run: EvalRun) => void;
}

export interface EvalReport {
  cases: CaseResult[];
  summary: EvalSummary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runOnce(evalCase: EvalCase, deps: AgentDeps, judge: Judge): Promise<EvalRun> {
  const startedAt = Date.now();
  let result;
  try {
    result = await collect(
      runAgent({ message: evalCase.input }, deps, new AbortController().signal),
    );
  } catch (error) {
    // One failing case must not abort the whole eval; it simply scores 0.
    return {
      answer: "",
      toolCalls: [],
      checks: [],
      score: 0,
      searchScores: [],
      usage: {},
      durationMs: Date.now() - startedAt,
      error: `agent: ${errorMessage(error)}`,
    };
  }

  const checks = checkExpectations(evalCase.expect, result);
  const base = {
    answer: result.answer,
    toolCalls: result.toolCalls,
    checks,
    searchScores: searchScores(result.toolCalls),
  };

  // A failed check scores 0 regardless of the judge, so asking the judge would only cost money.
  if (checks.some((check) => !check.passed)) {
    return {
      ...base,
      score: 0,
      usage: { agent: result.usage },
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const verdict = await judge.judge({ evalCase, result });
    return {
      ...base,
      judge: { score: verdict.score, reasoning: verdict.reasoning },
      score: scoreRun(checks, verdict.score),
      usage: { agent: result.usage, judge: verdict.usage },
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...base,
      score: 0,
      usage: { agent: result.usage },
      durationMs: Date.now() - startedAt,
      error: `judge: ${errorMessage(error)}`,
    };
  }
}

// Runs the tasks with at most `limit` in flight: a few parallel API calls keep an eval run
// fast without tripping rate limits.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      // Safe without locks: JavaScript runs this line to completion before any other worker.
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runEvals(options: EvalOptions): Promise<EvalReport> {
  const jobs = options.cases.flatMap((evalCase) =>
    Array.from({ length: options.runs }, () => evalCase),
  );

  const runs = await mapWithConcurrency(jobs, options.concurrency, async (evalCase) => {
    const run = await runOnce(evalCase, options.deps, options.judge);
    options.onProgress?.(evalCase.id, run);
    return { caseId: evalCase.id, run };
  });

  const cases = options.cases.map((evalCase) =>
    summarizeCase(
      evalCase,
      runs.filter((job) => job.caseId === evalCase.id).map((job) => job.run),
    ),
  );
  return { cases, summary: summarize(cases) };
}
