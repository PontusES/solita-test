import { describe, expect, it } from "vitest";
import { improvePrompt } from "../../evals/improvePrompt";
import type { PromptSet } from "@/agent/systemPrompt";
import type { Optimizer, OptimizerInput, Proposal } from "../../evals/optimizer";
import type { EvalReport } from "../../evals/runEvals";
import { caseResult, report } from "./reportFixtures";

const VALID_RULES = `Use search_knowledge_base and get_escalation_contact.
1. a
2. b
3. c
4. d
5. e`;

const GUARDRAIL = 'Label as "safe", "prompt_injection" or "misuse".';

// Each candidate varies the system prompt; the guardrail prompt stays valid.
const set = (system: string): PromptSet => ({ system, guardrail: GUARDRAIL });

const prompts = {
  base: set(`${VALID_RULES}\nbase`),
  better: set(`${VALID_RULES}\nbetter`),
  worse: set(`${VALID_RULES}\nworse`),
  best: set(`${VALID_RULES}\nbest`),
  invalid: set("forgot everything"),
};

const reports: Record<string, EvalReport> = {
  [prompts.base.system]: report([caseResult("t1", "train", 0.6), caseResult("h1", "holdout", 0.9)]),
  [prompts.better.system]: report([
    caseResult("t1", "train", 0.8),
    caseResult("h1", "holdout", 0.9),
  ]),
  [prompts.worse.system]: report([
    caseResult("t1", "train", 0.9),
    caseResult("h1", "holdout", 0.5),
  ]),
  [prompts.best.system]: report([caseResult("t1", "train", 1), caseResult("h1", "holdout", 1)]),
};

class ScriptedOptimizer implements Optimizer {
  readonly inputs: OptimizerInput[] = [];
  constructor(private readonly proposals: PromptSet[]) {}
  async propose(input: OptimizerInput): Promise<Proposal> {
    this.inputs.push(input);
    const revised = this.proposals[this.inputs.length - 1] ?? prompts.base;
    return { revised, rationale: "because", changes: ["changed something"] };
  }
}

function createEvaluate() {
  const evaluated: PromptSet[] = [];
  const evaluate = async (candidate: PromptSet) => {
    evaluated.push(candidate);
    const result = reports[candidate.system];
    if (!result) throw new Error(`no fake report for prompt: ${candidate.system}`);
    return result;
  };
  return { evaluate, evaluated };
}

describe("improvePrompt", () => {
  it("keeps accepted candidates as the new baseline and ignores rejected ones", async () => {
    const optimizer = new ScriptedOptimizer([prompts.better, prompts.worse, prompts.invalid]);
    const { evaluate, evaluated } = createEvaluate();

    const result = await improvePrompt({
      base: prompts.base,
      rounds: 3,
      evaluate,
      optimizer,
    });

    expect(result.rounds.map((round) => round.decision.accepted)).toEqual([true, false, false]);
    expect(result.best.prompts).toBe(prompts.better);
    // Round 2 and 3 were proposed from the accepted round 1 prompt, not from the original.
    expect(optimizer.inputs.map((input) => input.current)).toEqual([
      prompts.base,
      prompts.better,
      prompts.better,
    ]);
    // The invalid candidate was rejected without being evaluated.
    expect(evaluated).toEqual([prompts.base, prompts.better, prompts.worse]);
    expect(result.rounds[2]?.decision.reasons).toContain(
      "system prompt is missing tool name search_knowledge_base",
    );
    expect(result.rounds[1]?.decision.reasons).toEqual(["holdout mean dropped: 0.900 to 0.500"]);
  });

  it("only ever shows train cases to the optimizer", async () => {
    const optimizer = new ScriptedOptimizer([prompts.better]);
    const { evaluate } = createEvaluate();

    await improvePrompt({ base: prompts.base, rounds: 1, evaluate, optimizer });

    expect(optimizer.inputs[0]?.weaknesses.map((weakness) => weakness.id)).toEqual(["t1"]);
  });

  it("stops early when every train case is already perfect", async () => {
    const optimizer = new ScriptedOptimizer([prompts.best, prompts.better]);
    const { evaluate } = createEvaluate();

    const result = await improvePrompt({
      base: prompts.base,
      rounds: 3,
      evaluate,
      optimizer,
    });

    expect(result.rounds).toHaveLength(1);
    expect(result.best.prompts).toBe(prompts.best);
    expect(result.stoppedEarly).toMatch(/nothing to improve/);
  });
});
