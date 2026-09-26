import { describe, expect, it } from "vitest";
import type { AgentResult } from "@/agent/collect";
import { buildJudgePrompt } from "../../evals/judge";
import type { EvalCase } from "../../evals/cases";

const result: AgentResult = {
  answer: "Here is the contact.",
  toolCalls: [],
  guardrails: [],
  finishReason: "stop",
};

const evalCase: EvalCase = {
  id: "x",
  input: "Yes please",
  split: "train",
  expect: {},
  rubric: "Gives the contact.",
};

describe("buildJudgePrompt", () => {
  it("shows the earlier turns of a follow up before the user message", () => {
    const prompt = buildJudgePrompt({
      evalCase: {
        ...evalCase,
        history: [
          { role: "user", content: "Windows update is stuck" },
          { role: "assistant", content: "Would you like the contact?" },
        ],
      },
      result,
    });
    expect(prompt).toContain(
      "<earlier_turns>\nuser: Windows update is stuck\nassistant: Would you like the contact?\n</earlier_turns>\n<user_message>Yes please</user_message>",
    );
  });

  it("leaves the block out for a first message", () => {
    expect(buildJudgePrompt({ evalCase, result })).not.toContain("earlier_turns");
  });
});
