import { describe, expect, it } from "vitest";
import { summarizeHumanity } from "../src";

describe("Swift humanity telemetry", () => {
  it("summarizes engine independence and plan continuity", () => {
    const summary = summarizeHumanity([
      {
        decision: {
          source: "human-plan",
          engineMove: "e2e4",
          selectedMove: "d2d4",
          engineAgreement: false,
          reasons: ["Continue the queenside plan."],
        },
        mind: {
          plan: "pawn-break",
          planAge: 2,
          confidence: 0.7,
          setbacks: 0,
          concern: "No urgent defect dominates the position.",
          opponent: { aggression: 0.2, exchangeSeeking: 0.1, pawnActivity: 0.5, observedMoves: 3 },
          observedHistoryLength: 8,
        },
      },
      {
        decision: {
          source: "human-plan",
          engineMove: "g8f6",
          selectedMove: "c7c5",
          engineAgreement: false,
          reasons: ["Keep pressure on the center."],
        },
        mind: {
          plan: "pawn-break",
          planAge: 3,
          confidence: 0.78,
          setbacks: 0,
          concern: "No urgent defect dominates the position.",
          opponent: { aggression: 0.2, exchangeSeeking: 0.1, pawnActivity: 0.4, observedMoves: 4 },
          observedHistoryLength: 10,
        },
      },
      {
        decision: {
          source: "tactical",
          engineMove: "c5d4",
          selectedMove: "c5d4",
          engineAgreement: true,
          reasons: ["A forcing tactic takes priority."],
        },
        mind: {
          plan: "pawn-break",
          planAge: 4,
          confidence: 0.82,
          setbacks: 0,
          concern: "Immediate king safety and forcing moves need attention.",
          opponent: { aggression: 0.4, exchangeSeeking: 0.2, pawnActivity: 0.4, observedMoves: 5 },
          observedHistoryLength: 12,
        },
      },
    ]);

    expect(summary.decisions).toBe(3);
    expect(summary.engineAgreementRate).toBeCloseTo(1 / 3);
    expect(summary.humanPlanRate).toBeCloseTo(2 / 3);
    expect(summary.humanPlanDivergenceRate).toBeCloseTo(2 / 3);
    expect(summary.planContinuationRate).toBe(1);
    expect(summary.averagePlanAge).toBe(3);
    expect(summary.averagePlanConfidence).toBeCloseTo((0.7 + 0.78 + 0.82) / 3);
    expect(summary.setbackRate).toBe(0);
    expect(summary.distinctPlans).toEqual(["pawn-break"]);
    expect(summary.reasonCoverage).toBe(1);
  });
});
