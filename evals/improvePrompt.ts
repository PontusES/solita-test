import type { PromptSet } from "../src/agent/systemPrompt";
import { decideAcceptance, type AcceptanceDecision } from "./acceptance";
import { selectTrainWeaknesses, validateCandidate, type Optimizer } from "./optimizer";
import type { EvalReport } from "./runEvals";
import type { EvalSummary } from "./scoring";

export interface RoundResult {
  round: number;
  prompts: PromptSet;
  rationale: string;
  changes: string[];
  weaknessIds: string[];
  // Missing when the candidate was rejected before evaluation (invalid structure).
  summary?: EvalSummary;
  decision: AcceptanceDecision;
}

export interface ImproveOptions {
  base: PromptSet;
  rounds: number;
  // Injected so the loop can be unit tested without calling any model.
  evaluate: (prompts: PromptSet) => Promise<EvalReport>;
  optimizer: Optimizer;
  onRound?: (result: RoundResult) => void | Promise<void>;
  onLog?: (message: string) => void;
}

export interface ImproveResult {
  baseline: EvalSummary;
  best: { prompts: PromptSet; summary: EvalSummary };
  rounds: RoundResult[];
  stoppedEarly?: string;
}

export async function improvePrompt(options: ImproveOptions): Promise<ImproveResult> {
  const log = options.onLog ?? (() => {});

  log("Evaluating the baseline prompts");
  const baselineReport = await options.evaluate(options.base);
  let best = { prompts: options.base, report: baselineReport };
  const rounds: RoundResult[] = [];
  let stoppedEarly: string | undefined;

  for (let round = 1; round <= options.rounds; round++) {
    const weaknesses = selectTrainWeaknesses(best.report);
    if (weaknesses.length === 0) {
      stoppedEarly = "every train case already scores 1.0, nothing to improve";
      break;
    }

    log(`Round ${round}: asking the optimizer about ${weaknesses.map((w) => w.id).join(", ")}`);
    const proposal = await options.optimizer.propose({ current: best.prompts, weaknesses });
    const base = {
      round,
      prompts: proposal.revised,
      rationale: proposal.rationale,
      changes: proposal.changes,
      weaknessIds: weaknesses.map((weakness) => weakness.id),
    };

    // A structurally broken prompt is rejected before spending an eval run on it.
    const problems = validateCandidate(proposal.revised);
    let result: RoundResult;
    if (problems.length > 0) {
      result = { ...base, decision: { accepted: false, reasons: problems } };
    } else {
      log(`Round ${round}: evaluating the candidate`);
      const report = await options.evaluate(proposal.revised);
      const decision = decideAcceptance(best.report, report);
      result = { ...base, summary: report.summary, decision };
      if (decision.accepted) {
        // The accepted candidate is what the next round tries to beat.
        best = { prompts: proposal.revised, report };
      }
    }

    rounds.push(result);
    await options.onRound?.(result);
  }

  return {
    baseline: baselineReport.summary,
    best: { prompts: best.prompts, summary: best.report.summary },
    rounds,
    stoppedEarly,
  };
}
