import { z } from "zod";
import type { AgentResult, ToolCallTrace } from "../src/agent/collect";
import type { TokenUsage } from "../src/agent/events";
import type { EvalCase } from "./cases";

export interface CheckResult {
  check: string;
  passed: boolean;
}

export interface JudgeVerdict {
  score: number;
  reasoning: string;
}

export interface EvalRun {
  answer: string;
  toolCalls: ToolCallTrace[];
  checks: CheckResult[];
  judge?: JudgeVerdict;
  score: number;
  // Retrieval scores of every search in the run, used to calibrate KB_MIN_SCORE.
  searchScores: number[][];
  usage: { agent?: TokenUsage; judge?: TokenUsage };
  durationMs: number;
  error?: string;
}

export interface CaseResult {
  id: string;
  split: EvalCase["split"];
  input: string;
  runs: EvalRun[];
  meanScore: number;
  // Share of runs where every deterministic check passed.
  passRate: number;
}

export interface SplitSummary {
  cases: number;
  meanScore: number | null;
  passRate: number | null;
}

export interface EvalSummary {
  train: SplitSummary;
  holdout: SplitSummary;
  all: SplitSummary;
  tokens: { agent: TokenUsage; judge: TokenUsage };
}

function preview(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}...` : firstLine;
}

export function checkExpectations(expect: EvalCase["expect"], result: AgentResult): CheckResult[] {
  const called = new Set(result.toolCalls.map((call) => call.name));
  return [
    ...(expect.toolsCalled ?? []).map((name) => ({
      check: `calls ${name}`,
      passed: called.has(name),
    })),
    ...(expect.toolsNotCalled ?? []).map((name) => ({
      check: `does not call ${name}`,
      passed: !called.has(name),
    })),
    ...(expect.mustContain ?? []).map((text) => ({
      check: `contains "${preview(text)}"`,
      passed: result.answer.includes(text),
    })),
    ...(expect.mustNotContain ?? []).map((text) => ({
      check: `does not contain "${preview(text)}"`,
      passed: !result.answer.includes(text),
    })),
  ];
}

// Deterministic checks are hard requirements: failing one makes the judge's opinion irrelevant.
export function scoreRun(checks: CheckResult[], judgeScore: number | undefined): number {
  if (checks.some((check) => !check.passed)) {
    return 0;
  }
  return judgeScore ?? 0;
}

const searchResultSchema = z.object({ results: z.array(z.object({ score: z.number() })) });

export function searchScores(toolCalls: ToolCallTrace[]): number[][] {
  return toolCalls
    .filter((call) => call.name === "search_knowledge_base" && !call.isError)
    .map((call) => {
      const parsed = searchResultSchema.safeParse(call.result);
      return parsed.success ? parsed.data.results.map((result) => result.score) : [];
    });
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeCase(evalCase: EvalCase, runs: EvalRun[]): CaseResult {
  return {
    id: evalCase.id,
    split: evalCase.split,
    input: evalCase.input,
    runs,
    meanScore: mean(runs.map((run) => run.score)) ?? 0,
    passRate:
      mean(runs.map((run) => (!run.error && run.checks.every((check) => check.passed) ? 1 : 0))) ??
      0,
  };
}

function summarizeSplit(cases: CaseResult[]): SplitSummary {
  return {
    cases: cases.length,
    meanScore: mean(cases.map((result) => result.meanScore)),
    passRate: mean(cases.map((result) => result.passRate)),
  };
}

function addUsage(total: TokenUsage, usage: TokenUsage | undefined): TokenUsage {
  if (!usage) return total;
  return {
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  };
}

export function summarize(cases: CaseResult[]): EvalSummary {
  const zero: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const runs = cases.flatMap((result) => result.runs);
  return {
    train: summarizeSplit(cases.filter((result) => result.split === "train")),
    holdout: summarizeSplit(cases.filter((result) => result.split === "holdout")),
    all: summarizeSplit(cases),
    tokens: {
      agent: runs.reduce((total, run) => addUsage(total, run.usage.agent), zero),
      judge: runs.reduce((total, run) => addUsage(total, run.usage.judge), zero),
    },
  };
}
