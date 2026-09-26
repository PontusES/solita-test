import type { EvalReport } from "../../evals/runEvals";
import { summarize, type CaseResult, type EvalRun } from "../../evals/scoring";

export function run(score: number, options: Partial<EvalRun> = {}): EvalRun {
  return {
    answer: "an answer",
    toolCalls: [],
    finishReason: "stop",
    guardrails: [],
    checks: [{ check: "calls search_knowledge_base", passed: score > 0 }],
    judge: score > 0 ? { score, reasoning: `judged ${score}` } : undefined,
    score,
    searchScores: [],
    usage: {},
    durationMs: 1,
    ...options,
  };
}

export function caseResult(
  id: string,
  split: CaseResult["split"],
  meanScore: number,
  passRate = 1,
  runs: EvalRun[] = [run(meanScore)],
): CaseResult {
  return { id, split, input: `input of ${id}`, runs, meanScore, passRate };
}

export function report(cases: CaseResult[]): EvalReport {
  return { cases, summary: summarize(cases) };
}
