import { describe, expect, it } from "vitest";
import { decideAcceptance } from "../../evals/acceptance";
import { caseResult, report } from "./reportFixtures";

const baseline = report([
  caseResult("a", "train", 0.8),
  caseResult("b", "train", 1),
  caseResult("h", "holdout", 0.9),
]);

describe("decideAcceptance", () => {
  it("accepts a better train mean with equal holdout and no regressions", () => {
    const candidate = report([
      caseResult("a", "train", 1),
      caseResult("b", "train", 1),
      caseResult("h", "holdout", 0.9),
    ]);

    expect(decideAcceptance(baseline, candidate)).toEqual({ accepted: true, reasons: [] });
  });

  it("rejects an equal train mean, since the change must be measurably better", () => {
    const decision = decideAcceptance(baseline, baseline);

    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual(["train mean did not improve: 0.900 to 0.900"]);
  });

  it("rejects a holdout drop even when train improves", () => {
    const candidate = report([
      caseResult("a", "train", 1),
      caseResult("b", "train", 1),
      caseResult("h", "holdout", 0.7),
    ]);

    const decision = decideAcceptance(baseline, candidate);

    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual(["holdout mean dropped: 0.900 to 0.700"]);
  });

  it("rejects a regression of a previously passing case even when both means improve", () => {
    const candidate = report([
      caseResult("a", "train", 1),
      caseResult("b", "train", 0.95, 0.67),
      caseResult("h", "holdout", 1),
    ]);

    const decision = decideAcceptance(baseline, candidate);

    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual([
      "regression: b passed its checks in every run before, now 0.670",
    ]);
  });

  it("lists every rule that failed", () => {
    const candidate = report([
      caseResult("a", "train", 0.5, 0.5),
      caseResult("b", "train", 0.5, 0.5),
      caseResult("h", "holdout", 0.5, 0.5),
    ]);

    expect(decideAcceptance(baseline, candidate).reasons).toHaveLength(5);
  });
});
