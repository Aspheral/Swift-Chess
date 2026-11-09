import { describe, expect, it } from "vitest";
import { Board, swiftPlayProfile } from "../src";
import type { CandidateScore } from "../src/chess/scoring";
import { candidateDecisionUncertainty, candidateIdeaUncertainty, decisionThinkPaceMs, defensiveThinkingNeed, ideaConflict, quietDecisionUncertainty, verifiedChoiceTension } from "../src/chess/play-profile";
import { humanErrorProfile } from "../src/chess/human";
import { replayAfLinggaGame } from "./fixtures/af-lingga";

describe("Swift browser play timing", () => {
  it("plays familiar opening positions quickly", () => {
    const profile = swiftPlayProfile(Board.start(), []);
    expect(profile.kind).toBe("opening");
    expect(profile.options.timeMs).toBeGreaterThanOrEqual(600);
    expect(profile.options.timeMs).toBeLessThanOrEqual(850);
    expect(profile.options.depth).toBe(7);
    expect(profile.minimumThinkMs).toBeLessThan(250);
  });

  it("thinks progressively longer as an opening becomes a real decision", () => {
    const firstMove = swiftPlayProfile(Board.start(), []);
    const laterOpening = swiftPlayProfile(Board.start(), Array(6).fill("fixture"));
    expect(laterOpening.kind).toBe("opening");
    expect(laterOpening.minimumThinkMs).toBeGreaterThan(firstMove.minimumThinkMs);
    expect(laterOpening.options.timeMs ?? 0).toBeGreaterThan(firstMove.options.timeMs ?? 0);
  });

  it("thinks longer BEFORE and during the AfLingga rook-and-queen king hunt", () => {
    const game = replayAfLinggaGame();
    const beforeDiscovery = game.positions[52]; // After 26...Rh2, before White's 27th move
    const afterDiscovery = game.positions[54]; // After 27...Nxe4+, 4 legal defenses
    expect(beforeDiscovery.isInCheck("w")).toBe(false);
    expect(afterDiscovery.isInCheck("w")).toBe(true);
    expect(afterDiscovery.legalMoves()).toHaveLength(4);

    const beforeProfile = swiftPlayProfile(beforeDiscovery, game.moves.slice(0, 52));
    const afterProfile = swiftPlayProfile(afterDiscovery, game.moves.slice(0, 54));
    const beforeNeed = defensiveThinkingNeed(beforeDiscovery, humanErrorProfile(beforeDiscovery, 0.05));
    const afterNeed = defensiveThinkingNeed(afterDiscovery, humanErrorProfile(afterDiscovery, 0.05));

    expect(beforeNeed).toBeGreaterThanOrEqual(0.6);
    expect(afterNeed).toBeGreaterThanOrEqual(0.6);
    expect(beforeProfile.kind).toBe("tactical");
    expect(afterProfile.kind).toBe("tactical");
    expect(beforeProfile.options.timeMs ?? 0).toBeGreaterThan(1850);
    expect(afterProfile.options.timeMs ?? 0).toBeGreaterThan(1850);
    expect(beforeProfile.options.timeMs ?? 0).toBeLessThanOrEqual(2370);
    expect(afterProfile.options.timeMs ?? 0).toBeLessThanOrEqual(2370);

    console.log("SWIFT_PRESSURE_THINKING " + JSON.stringify({
      before: { need: beforeNeed, firstPassMs: beforeProfile.options.timeMs },
      checked: { need: afterNeed, firstPassMs: afterProfile.options.timeMs },
    }));
  });

  it("does not overthink an opening or a forced single legal response", () => {
    const opening = Board.start();
    const forced = Board.fromFEN("r7/8/8/8/8/2k5/8/K7 w - - 0 1");
    expect(forced.legalMoves().map((move) => move.uci())).toEqual(["a1b1"]);
    expect(defensiveThinkingNeed(forced, humanErrorProfile(forced, 0.05))).toBe(0);
    expect(defensiveThinkingNeed(opening, humanErrorProfile(opening, 0.05))).toBe(0);
    expect(swiftPlayProfile(opening, []).options.timeMs ?? 0).toBeLessThanOrEqual(850);
  });

  it("spends more time when the king is under tactical pressure", () => {
    const calm = swiftPlayProfile(Board.start(), []);
    const tacticalBoard = Board.fromFEN("k3r3/8/8/8/8/8/8/4K3 w - - 0 1");
    const tactical = swiftPlayProfile(tacticalBoard, Array(16).fill("a2a3"));
    expect(tactical.kind).toBe("tactical");
    expect(tactical.options.timeMs ?? 0).toBeGreaterThan(calm.options.timeMs ?? 0);
    expect(tactical.minimumThinkMs).toBeGreaterThan(calm.minimumThinkMs);
    expect(tactical.options.depth).toBe(9);
    expect(tactical.options.adaptiveThinking).toEqual({ maxExtraMs: 2600, extraDepth: 2 });
  });

  it("uses an endgame budget instead of the full tactical budget in quiet endings", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/8/K7 w - - 0 1");
    const profile = swiftPlayProfile(board, Array(30).fill("h1h2"));
    expect(profile.kind).toBe("endgame");
    expect(profile.options.timeMs).toBeGreaterThanOrEqual(1300);
    expect(profile.options.depth).toBe(9);
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