import { describe, expect, it } from "vitest";
import type { AgentResult } from "@/agent/collect";
import type { EvalCase } from "../../evals/cases";
import {
  checkExpectations,
  scoreRun,
  searchScores,
  summarize,
  summarizeCase,
  type EvalRun,
} from "../../evals/scoring";

function agentResult(answer: string, toolNames: string[]): AgentResult {
  return {
    answer,
    toolCalls: toolNames.map((name) => ({ name, args: {}, result: "ok", isError: false })),
    guardrails: [],
    finishReason: "stop",
  };
}

function evalCase(id: string, split: EvalCase["split"]): EvalCase {
  return { id, split, input: id, expect: {}, rubric: "r" };
}

function run(score: number, passed = true): EvalRun {
  return {
    answer: "",
    toolCalls: [],
    checks: [{ check: "x", passed }],
    score,
    searchScores: [],
    usage: { agent: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
    durationMs: 1,
  };
}

describe("checkExpectations", () => {
  const result = agentResult("Call +1 555 0100 now", ["get_escalation_contact"]);

  it("passes when every expectation holds", () => {
    const checks = checkExpectations(
      {
        toolsCalled: ["get_escalation_contact"],
        toolsNotCalled: ["search_knowledge_base"],
        mustContain: ["+1 555 0100"],
        mustNotContain: ["servicedesk@example.com"],
      },
      result,
    );
    expect(checks.map((check) => check.passed)).toEqual([true, true, true, true]);
  });

  it("fails each kind of expectation independently", () => {
    const checks = checkExpectations(
      {
        toolsCalled: ["search_knowledge_base"],
        toolsNotCalled: ["get_escalation_contact"],
        mustContain: ["servicedesk@example.com"],
        mustNotContain: ["555 0100"],
      },
      result,
    );
    expect(checks.map((check) => check.passed)).toEqual([false, false, false, false]);
    expect(checks[0]?.check).toBe("calls search_knowledge_base");
  });

  it("matches text exactly, including case", () => {
    const [check] = checkExpectations({ mustContain: ["call +1 555 0100"] }, result);
    expect(check?.passed).toBe(false);
  });
});

describe("scoreRun", () => {
  it("uses the judge score when all checks pass", () => {
    expect(scoreRun([{ check: "a", passed: true }], 0.8)).toBe(0.8);
  });

  it("forces 0 when any check fails, whatever the judge says", () => {
    expect(
      scoreRun(
        [
          { check: "a", passed: true },
          { check: "b", passed: false },
        ],
        1,
      ),
    ).toBe(0);
  });
});

describe("searchScores", () => {
  it("extracts the scores of every successful search", () => {
    const scores = searchScores([
      {
        name: "search_knowledge_base",
        args: {},
        result: { results: [{ score: 0.7 }, { score: 0.4 }] },
        isError: false,
      },
      {
        name: "search_knowledge_base",
        args: {},
        result: { results: [], note: "none" },
        isError: false,
      },
      { name: "search_knowledge_base", args: {}, result: { error: "timeout" }, isError: true },
      { name: "get_escalation_contact", args: {}, result: "text", isError: false },
    ]);
    expect(scores).toEqual([[0.7, 0.4], []]);
  });
});

describe("summarize", () => {
  it("averages per split and adds up token usage", () => {
    const cases = [
      summarizeCase(evalCase("a", "train"), [run(1), run(0.5)]),
      summarizeCase(evalCase("b", "train"), [run(0, false)]),
      summarizeCase(evalCase("c", "holdout"), [run(0.6)]),
    ];

    const summary = summarize(cases);

    expect(cases[0]?.meanScore).toBe(0.75);
    expect(summary.train).toEqual({ cases: 2, meanScore: 0.375, passRate: 0.5 });
    expect(summary.holdout).toEqual({ cases: 1, meanScore: 0.6, passRate: 1 });
    expect(summary.all.cases).toBe(3);
    expect(summary.tokens.agent).toEqual({ inputTokens: 40, outputTokens: 8, totalTokens: 48 });
  });

  it("reports null means for an empty split", () => {
    const summary = summarize([summarizeCase(evalCase("a", "train"), [run(1)])]);
    expect(summary.holdout).toEqual({ cases: 0, meanScore: null, passRate: null });
  });
});
