import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_PROMPT_LENGTH, selectTrainWeaknesses, validateCandidate } from "../../evals/optimizer";
import { caseResult, report, run } from "./reportFixtures";

const currentPrompt = readFileSync("prompts/system.md", "utf8");

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
  it("accepts the current system prompt", () => {
    expect(validateCandidate(currentPrompt)).toEqual([]);
  });

  it("rejects a prompt that drops a tool name", () => {
    expect(
      validateCandidate(currentPrompt.replaceAll("get_escalation_contact", "escalate")),
    ).toEqual(["missing tool name get_escalation_contact"]);
  });

  it("rejects a prompt that drops a core rule", () => {
    expect(validateCandidate(currentPrompt.replace("\n4. ", "\n"))).toEqual([
      "missing core rule 4",
    ]);
  });

  it("rejects a prompt over the length limit", () => {
    const problems = validateCandidate(currentPrompt + "x".repeat(MAX_PROMPT_LENGTH));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^too long/);
  });
});
