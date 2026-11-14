import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import { staticExchange } from "../src/chess/see";
import { replayAfLinggaGame } from "./fixtures/af-lingga";

type MoveScorer = {
  moveScore(board: Board, move: ReturnType<Board["legalMoves"]>[number], hash?: never, ply?: number): number;
};
const move = (board: Board, uci: string) => {
  const found = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!found) throw Error("Not legal: " + uci + " from " + board.toFEN());
  return found;
};

describe("Credible capture-first search under king pressure", () => {
  const game = replayAfLinggaGame();
  const queenTrapped = game.positions[54]; // After 27...Nxe4+; rook on h2, queen f4.

  it("demotes the known losing queen-for-rook attempt, without outlawing it", () => {
    expect(staticExchange(queenTrapped, move(queenTrapped, "g1h2"))).toBe(-400);
    const engine = new SwiftEngine() as unknown as MoveScorer;
    const risky = engine.moveScore(queenTrapped, move(queenTrapped, "g1h2"));
    const kingRetreat = engine.moveScore(queenTrapped, move(queenTrapped, "e2d1"));
    expect(risky).toBeLessThan(kingRetreat);
    // Despite ordering the capture later, an actual legal search must still
    // find it: every other legal move loses the queen or permits mate in one.
    const answer = new SwiftEngine().search(queenTrapped, { depth: 4 });
    expect(answer.depth).toBe(4);
    expect(answer.move?.uci()).toBe("g1h2");
  }, 25_000);

  it("preserves fast ordering for profitable heavy-piece captures", () => {
    const rookWins = Board.fromFEN("4k3/p7/8/8/8/8/8/R5K1 w - - 0 1");
    const rookLost = Board.fromFEN("4k3/p7/1q6/8/8/8/8/R5K1 w - - 0 1");
    const engine = new SwiftEngine() as unknown as MoveScorer;
    expect(staticExchange(rookWins, move(rookWins, "a1a7"))).toBeGreaterThan(0);
    expect(staticExchange(rookLost, move(rookLost, "a1a7"))).toBeLessThan(0);
    const safeCapture = engine.moveScore(rookWins, move(rookWins, "a1a7"));
    const unsoundCapture = engine.moveScore(rookLost, move(rookLost, "a1a7"));
    expect(safeCapture).toBeGreaterThan(500_000);
    expect(unsoundCapture).toBeLessThan(0);
  });

  it("does not demote winning queen captures or remove legal moves", () => {
    const queenWins = Board.fromFEN("4k3/8/8/8/8/8/4q3/4Q1K1 w - - 0 1");
    const engine = new SwiftEngine() as unknown as MoveScorer;
    const capture = move(queenWins, "e1e2");
    expect(staticExchange(queenWins, capture)).toBeGreaterThan(0);
    expect(engine.moveScore(queenWins, capture)).toBeGreaterThan(1_000_000);
    expect(queenWins.legalMoves().some((m) => m.uci() === capture.uci())).toBe(true);
  });
});
