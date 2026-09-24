import { describe, expect, it } from "vitest";
import { Board, swiftPlayProfile } from "../src";
import { candidateDecisionUncertainty, quietDecisionUncertainty } from "../src/chess/play-profile";

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

  it("still lets practical pressure force a second look", () => {
    const narrow = Board.fromFEN("7k/8/8/8/8/8/6P1/6K1 w - - 0 1");
    expect(quietDecisionUncertainty(narrow, 0.36)).toBeGreaterThan(0.7);
  });
});
