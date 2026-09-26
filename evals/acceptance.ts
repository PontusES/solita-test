import type { EvalReport } from "./runEvals";

export interface AcceptanceDecision {
  accepted: boolean;
  reasons: string[];
}

// Tiny tolerance so that floating point noise in the means never flips a decision.
const EPSILON = 1e-9;

const format = (value: number) => value.toFixed(3);

// A candidate prompt replaces the baseline only if it is measurably better where the optimizer
// could see (train), no worse where it could not (holdout), and breaks nothing that worked.
export function decideAcceptance(baseline: EvalReport, candidate: EvalReport): AcceptanceDecision {
  const reasons: string[] = [];

  const baseTrain = baseline.summary.train.meanScore;
  const candTrain = candidate.summary.train.meanScore;
  if (baseTrain === null || candTrain === null) {
    reasons.push("no train cases to compare");
  } else if (candTrain <= baseTrain + EPSILON) {
    reasons.push(`train mean did not improve: ${format(baseTrain)} to ${format(candTrain)}`);
  }

  const baseHoldout = baseline.summary.holdout.meanScore;
  const candHoldout = candidate.summary.holdout.meanScore;
  if (baseHoldout !== null && candHoldout !== null && candHoldout < baseHoldout - EPSILON) {
    reasons.push(`holdout mean dropped: ${format(baseHoldout)} to ${format(candHoldout)}`);
  }

  for (const before of baseline.cases) {
    const after = candidate.cases.find((result) => result.id === before.id);
    if (before.passRate === 1 && after && after.passRate < 1) {
      reasons.push(
        `regression: ${before.id} passed its checks in every run before, now ${format(after.passRate)}`,
      );
    }
  }

  return { accepted: reasons.length === 0, reasons };
}
