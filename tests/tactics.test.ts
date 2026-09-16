import { describe, expect, it } from "vitest";
import { Board, canDeltaPrune, staticExchange, tacticalMoveScore } from "../src";

describe("tactical search helpers", () => {
  it("separates sound and poisoned captures", () => {
    const sound = Board.fromFEN("4k3/8/8/4p3/4Q3/8/8/4K3 w - - 0 1");
    const poisoned = Board.fromFEN("4r1k1/8/8/4p3/4Q3/8/8/4K3 w - - 0 1");
    const soundMove = sound.legalMoves().find((move) => move.uci() === "e4e5")!;
    const poisonedMove = poisoned.legalMoves().find((move) => move.uci() === "e4e5")!;
    expect(staticExchange(sound, soundMove)).toBe(100);
    expect(staticExchange(poisoned, poisonedMove)).toBe(-800);
    expect(tacticalMoveScore(sound, soundMove)).toBeGreaterThan(tacticalMoveScore(poisoned, poisonedMove));
  });

  it("never delta-prunes promotions", () => {
    const board = Board.fromFEN("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const move = board.legalMoves().find((candidate) => candidate.uci() === "a7a8q")!;
    expect(canDeltaPrune(board, move, -500, 500)).toBe(false);
  });
});
