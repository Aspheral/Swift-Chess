import { describe, expect, it } from "vitest";
import { Board, humanErrorProfile, swiftPlayProfile, understandPosition } from "../src";

// White's pawns give it apparently intact shelter, but Black's queen on g5
// can take on g2 with check. The threat is present *before* the king is checked.
const THREAT = "6k1/6r1/8/6q1/8/8/5PPP/6K1 w - - 0 1";

describe("defensive time and opponent checks", () => {
  it("does not invent incoming checking threats from the initial setup", () => {
    const understanding = understandPosition(Board.start());
    expect(understanding.tactics.incomingChecks).toBe(0);
    expect(swiftPlayProfile(Board.start(), []).kind).toBe("opening");
  });

  it("sees checks the opponent could give on its next turn", () => {
    const board = Board.fromFEN(THREAT);
    expect(board.isInCheck("w")).toBe(false);
    const understanding = understandPosition(board);
    expect(understanding.tactics.incomingChecks).toBeGreaterThan(0);
    expect(understanding.tactics.checks).toBe(0);
  });

  it("allocates tactical rather than calm time before a direct check lands", () => {
    const board = Board.fromFEN(THREAT);
    const profile = humanErrorProfile(board, 0.05);
    expect(profile.tacticalPressure).toBeGreaterThanOrEqual(0.12);
    const choice = swiftPlayProfile(board, ["e2e4", "e7e5", "d2d4", "d7d5"]);
    expect(choice.kind).toBe("tactical");
    expect(choice.options.depth).toBe(7);
    expect(choice.options.timeMs).toBeGreaterThanOrEqual(1000);
  });

  it("preserves White and Black threat symmetry", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/6Q1/8/6R1/6K1 b - - 0 1");
    expect(board.isInCheck("b")).toBe(false);
    expect(understandPosition(board).tactics.incomingChecks).toBeGreaterThan(0);
    expect(humanErrorProfile(board, 0.05).tacticalPressure).toBeGreaterThanOrEqual(0.12);
  });
});
