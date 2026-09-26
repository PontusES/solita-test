import { describe, expect, it } from "vitest";
import {
  CRITICAL_ESCALATION_TEXT,
  getEscalationContactTool,
  NORMAL_ESCALATION_TEXT,
} from "@/tools/getEscalationContact";
import { evalCases } from "../../evals/cases";

const toolNames = ["search_knowledge_base", getEscalationContactTool.name];

describe("evalCases", () => {
  it("has unique ids and both splits", () => {
    expect(new Set(evalCases.map((evalCase) => evalCase.id)).size).toBe(evalCases.length);
    expect(evalCases.some((evalCase) => evalCase.split === "train")).toBe(true);
    expect(evalCases.some((evalCase) => evalCase.split === "holdout")).toBe(true);
  });

  it.each(evalCases)("$id has a rubric and only names real tools", (evalCase) => {
    expect(evalCase.rubric.trim()).not.toBe("");
    const named = [
      ...(evalCase.expect.toolsCalled ?? []),
      ...(evalCase.expect.toolsNotCalled ?? []),
    ];
    for (const name of named) {
      expect(toolNames).toContain(name);
    }
  });

  it("checks escalation answers against the exact tool texts", () => {
    const required = evalCases.flatMap((evalCase) => evalCase.expect.mustContain ?? []);
    expect(required.length).toBeGreaterThan(0);
    for (const text of required) {
      expect([CRITICAL_ESCALATION_TEXT, NORMAL_ESCALATION_TEXT]).toContain(text);
    }
  });
});
