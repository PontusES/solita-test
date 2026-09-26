import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_PROMPT_LENGTH, selectTrainWeaknesses, validateCandidate } from "../../evals/optimizer";
import { caseResult, report, run } from "./reportFixtures";

const current = {
  system: readFileSync("prompts/system.md", "utf8"),
  guardrail: readFileSync("prompts/guardrail.md", "utf8"),
};

describe("selectTrainWeaknesses", () => {
  const evalReport = report([
    caseResult("vpn-still-broken", "train", 0.9, 1, [run(0.9), run(0.8, { answer: "worst" })]),
    caseResult("greeting-hi", "train", 0.2, 0.2, [run(0)]),
    caseResult("printer-blank-pages", "train", 1),
    caseResult("teams-mic-holdout", "holdout", 0.5),
  ]);

  it("returns only imperfect train cases, weakest first", () => {
    const weaknesses = selectTrainWeaknesses(evalReport);

    expect(weaknesses.map((weakness) => weakness.id)).toEqual(["greeting-hi", "vpn-still-broken"]);
  });

  it("never exposes holdout cases to the optimizer", () => {
    const onlyHoldout = report([caseResult("teams-mic-holdout", "holdout", 0.1)]);

    expect(selectTrainWeaknesses(onlyHoldout)).toEqual([]);
  });

  it("carries what the optimizer needs to understand the weakness", () => {
    const [, vpn] = selectTrainWeaknesses(evalReport);

    expect(vpn).toMatchObject({
      input: "input of vpn-still-broken",
      judgeReasoning: ["judged 0.9", "judged 0.8"],
      exampleAnswer: "worst",
    });
    expect(vpn?.rubric).toContain("VPN");
  });

  it("respects the limit", () => {
    expect(selectTrainWeaknesses(evalReport, 1)).toHaveLength(1);
  });
});

describe("validateCandidate", () => {
  it("accepts the current prompts", () => {
    expect(validateCandidate(current)).toEqual([]);
  });

  it("rejects a system prompt that drops a tool name", () => {
    const system = current.system.replaceAll("get_escalation_contact", "escalate");
    expect(validateCandidate({ ...current, system })).toEqual([
      "system prompt is missing tool name get_escalation_contact",
    ]);
  });

  it("rejects a system prompt that drops a core rule", () => {
    const system = current.system.replace("\n4. ", "\n");
    expect(validateCandidate({ ...current, system })).toEqual([
      "system prompt is missing core rule 4",
    ]);
  });

  it("rejects a guardrail prompt that drops a category the classifier can return", () => {
    const guardrail = current.guardrail.replaceAll('"misuse"', "abuse");
    expect(validateCandidate({ ...current, guardrail })).toEqual([
      'guardrail prompt is missing category "misuse"',
    ]);
  });

  it("rejects prompts over the length limit", () => {
    const problems = validateCandidate({
      system: current.system + "x".repeat(MAX_PROMPT_LENGTH),
      guardrail: current.guardrail + "x".repeat(MAX_PROMPT_LENGTH),
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^system prompt too long/);
    expect(problems[1]).toMatch(/^guardrail prompt too long/);
  });
});

describe("selectTrainWeaknesses guardrail context", () => {
  it("tells the optimizer when a case was blocked and which guardrails acted", () => {
    const blockedRun = run(0, {
      finishReason: "blocked",
      guardrails: [{ stage: "input", rule: "misuse", action: "blocked" }],
    });
    const [weakness] = selectTrainWeaknesses(
      report([caseResult("guard-benign-phishing-question", "train", 0, 0, [blockedRun])]),
    );

    expect(weakness).toMatchObject({
      finishReasons: ["blocked"],
      guardrails: ["input:misuse:blocked"],
    });
  });
});
