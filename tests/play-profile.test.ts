import { describe, expect, it } from "vitest";
import { Board, swiftPlayProfile } from "../src";
import type { CandidateScore } from "../src/chess/scoring";
import { candidateDecisionUncertainty, candidateIdeaUncertainty, decisionThinkPaceMs, ideaConflict, quietDecisionUncertainty, verifiedChoiceTension } from "../src/chess/play-profile";

describe("Swift browser play timing", () => {
  it("plays familiar opening positions quickly", () => {
    const profile = swiftPlayProfile(Board.start(), []);
    expect(profile.kind).toBe("opening");
    expect(profile.options.timeMs).toBeLessThan(400);
    expect(profile.minimumThinkMs).toBeLessThan(250);
  });

  it("thinks progressively longer as an opening becomes a real decision", () => {
    const firstMove = swiftPlayProfile(Board.start(), []);
    const laterOpening = swiftPlayProfile(Board.start(), Array(6).fill("fixture"));
    expect(laterOpening.kind).toBe("opening");
    expect(laterOpening.minimumThinkMs).toBeGreaterThan(firstMove.minimumThinkMs);
    expect(laterOpening.options.timeMs ?? 0).toBeGreaterThan(firstMove.options.timeMs ?? 0);
  });

  it("spends more time when the king is under tactical pressure", () => {
    const calm = swiftPlayProfile(Board.start(), []);
    const tacticalBoard = Board.fromFEN("k3r3/8/8/8/8/8/8/4K3 w - - 0 1");
    const tactical = swiftPlayProfile(tacticalBoard, Array(16).fill("a2a3"));
    expect(tactical.kind).toBe("tactical");
    expect(tactical.options.timeMs ?? 0).toBeGreaterThan(calm.options.timeMs ?? 0);
    expect(tactical.minimumThinkMs).toBeGreaterThan(calm.minimumThinkMs);
  });

  it("uses an endgame budget instead of the full tactical budget in quiet endings", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/8/K7 w - - 0 1");
    const profile = swiftPlayProfile(board, Array(30).fill("h1h2"));
    expect(profile.kind).toBe("endgame");
    expect(profile.options.timeMs).toBeLessThan(760);
    expect(profile.options.safetyDepth).toBe(4);
  });

  it("treats close strategic candidates as more uncertain than a clear leader", () => {
    expect(candidateDecisionUncertainty([12, 11.5, 4])).toBeGreaterThan(0.9);
    expect(candidateDecisionUncertainty([12, 8, 3])).toBeCloseTo(0.5);
    expect(candidateDecisionUncertainty([12, 3, 2])).toBe(0);
    expect(candidateDecisionUncertainty([12])).toBe(0);
  });

  it("scales hesitation smoothly with partial strategic disagreement", () => {
    expect(ideaConflict(["develop"], ["develop"])).toBe(0);
    expect(ideaConflict(["develop"], ["pawn-break"])).toBe(1);
    expect(ideaConflict(["develop", "improve-piece"], ["develop", "pawn-break"])).toBeCloseTo(2 / 3);

    const samePlan = candidateIdeaUncertainty([
      { score: 12, ideaKinds: ["develop"] },
      { score: 11.5, ideaKinds: ["develop"] },
    ]);
    const partialConflict = candidateIdeaUncertainty([
      { score: 12, ideaKinds: ["develop", "improve-piece"] },
      { score: 11.5, ideaKinds: ["develop", "pawn-break"] },
    ]);
    const competingPlans = candidateIdeaUncertainty([
      { score: 12, ideaKinds: ["develop"] },
      { score: 11.5, ideaKinds: ["pawn-break"] },
    ]);

    expect(samePlan).toBeLessThan(partialConflict);
    expect(partialConflict).toBeLessThan(competingPlans);
    expect(competingPlans).toBeGreaterThan(0.9);
  });

  it("still lets practical pressure force a second look", () => {
    const narrow = Board.fromFEN("7k/8/8/8/8/8/6P1/6K1 w - - 0 1");
    expect(quietDecisionUncertainty(narrow, 0.36)).toBeGreaterThan(0.7);
  });

  it("gives close competing plans more time than a settled choice", () => {
    const profile = swiftPlayProfile(Board.start(), []);
    const choices = (gap: number, rival: "develop" | "pawn-break"): Array<Pick<CandidateScore, "score" | "ideaKinds">> => [
      { score: 55, ideaKinds: ["develop"] },
      { score: 55 - gap, ideaKinds: [rival] },
    ];
    expect(verifiedChoiceTension(choices(1, "pawn-break"))).toBeGreaterThan(verifiedChoiceTension(choices(1, "develop")));
    const close = decisionThinkPaceMs(profile, { legalMoves: 25, candidates: choices(1, "pawn-break") });
    const clear = decisionThinkPaceMs(profile, { legalMoves: 25, candidates: choices(90, "pawn-break") });
    expect(close).toBeGreaterThan(clear);
    expect(decisionThinkPaceMs(profile, { legalMoves: 1, candidates: choices(1, "pawn-break") })).toBeLessThan(clear);
  });

  it("thinks faster when a mature plan still fits the chosen move", () => {
    const profile = swiftPlayProfile(Board.start(), []);
    const evidence = {
      legalMoves: 20, decisionSource: "human-plan" as const,
      candidates: [{ score: 10, ideaKinds: ["develop" as const] }, { score: 8, ideaKinds: ["pawn-break" as const] }],
      planAge: 5, planConfidence: 0.8,
    };
    expect(decisionThinkPaceMs(profile, { ...evidence, followsPlan: true })).toBeLessThan(
      decisionThinkPaceMs(profile, { ...evidence, followsPlan: false }),
    );
  });

});