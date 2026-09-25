import { describe, expect, it } from "vitest";
import { personalizedCandidateConflict, selectiveCandidateDepths, selectiveConflictCandidateIndexes, selectiveConsequenceDepth } from "../src/chess/selective-calculation";

describe("Swift selective calculation", () => {
  const noBias = () => 0;

  it("looks one ply deeper when close candidates represent competing plans", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 11, ideaKinds: ["pawn-break"] },
      { score: 4, ideaKinds: ["improve-piece"] },
    ];
    expect(personalizedCandidateConflict(candidates, noBias)).toBeGreaterThan(0.8);
    expect(selectiveConsequenceDepth(3, candidates, noBias)).toBe(4);
  });

  it("focuses the extra look on the two candidates creating the conflict", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 11, ideaKinds: ["pawn-break"] },
      { score: 10.5, ideaKinds: ["improve-piece"] },
      { score: 4, ideaKinds: ["defend"] },
    ];
    expect(selectiveConflictCandidateIndexes(candidates, noBias)).toEqual([0, 1]);
  });

  it("does not focus extra calculation on unrelated candidates", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 11, ideaKinds: ["pawn-break"] },
      { score: 10.5, ideaKinds: ["improve-piece"] },
    ];
    const focused = selectiveConflictCandidateIndexes(candidates, noBias);
    expect(focused).toContain(0);
    expect(focused).toContain(1);
    expect(focused).not.toContain(2);
  });

  it("does not deepen for two executions of the same idea", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 11, ideaKinds: ["develop"] },
    ];
    expect(personalizedCandidateConflict(candidates, noBias)).toBeLessThan(0.4);
    expect(selectiveConflictCandidateIndexes(candidates, noBias)).toEqual([]);
    expect(selectiveConsequenceDepth(3, candidates, noBias)).toBe(3);
  });

  it("lets an established plan resolve an apparent raw-score tie", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 12, ideaKinds: ["pawn-break"] },
    ];
    const preferDevelopment = (ideas: string[]) => ideas.includes("develop") ? 10 : 0;
    expect(personalizedCandidateConflict(candidates, noBias)).toBe(1);
    expect(personalizedCandidateConflict(candidates, preferDevelopment)).toBe(0);
    expect(selectiveConflictCandidateIndexes(candidates, preferDevelopment)).toEqual([]);
    expect(selectiveConsequenceDepth(3, candidates, preferDevelopment)).toBe(3);
  });


  it("spends the extra ply only on the conflicting pair", () => {
    const candidates = [
      { score: 12, ideaKinds: ["develop"] },
      { score: 11, ideaKinds: ["pawn-break"] },
      { score: 4, ideaKinds: ["improve-piece"] },
    ];
    expect(selectiveCandidateDepths(3, candidates, noBias)).toEqual([4, 4, 3]);
  });

  it("keeps focused attention inside the depth-five ceiling", () => {
    const candidates = [
      { score: 20, ideaKinds: ["attack"] },
      { score: 20, ideaKinds: ["defend"] },
    ];
    expect(selectiveCandidateDepths(5, candidates, noBias)).toEqual([5, 5]);
  });

  it("never adds more than one consequence ply", () => {
    const candidates = [
      { score: 20, ideaKinds: ["attack"] },
      { score: 20, ideaKinds: ["defend"] },
    ];
    expect(selectiveConsequenceDepth(4, candidates, noBias)).toBe(5);
  });
});
