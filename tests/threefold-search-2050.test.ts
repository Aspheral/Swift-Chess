import { describe, expect, it } from "vitest";
import { Board, Game, HumanSwiftEngine, SwiftEngine } from "../src";

function move(board: Board, uci: string) {
  const found = board.legalMoves().find((m) => m.uci() === uci);
  expect(found, `Expected legal ${uci} in ${board.toFEN()}`).toBeDefined();
  return found!;
}

function historyFor(board: Board, uci: string): string[] {
  const repeatedPosition = Game.positionKey(board.makeMove(move(board, uci)));
  return [repeatedPosition, Game.positionKey(board), repeatedPosition, Game.positionKey(board)];
}

describe("defensive threefold awareness", () => {
  it("recognizes a guaranteed draw in a materially lost king-and-queen ending", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/5q2/K7 w - - 0 1");
    const history = historyFor(board, "a1b1");
    const engine = new SwiftEngine();

    const unrecognized = engine.search(board, { depth: 3 });
    expect(unrecognized.score).toBeLessThan(-400);
    const recognized = engine.search(board, { depth: 3, positionHistoryKeys: history });
    expect(recognized.move?.uci()).toBe("a1b1");
    expect(Math.abs(recognized.score)).toBe(0);
    expect(recognized.depth).toBe(3);
    expect(recognized.pv?.map((m) => m.uci())).toEqual(["a1b1"]);

    // Game is the actual arbiter; the engine's choice must agree with it.
    const game = Game.fromFEN(board.toFEN());
    // A synthetic game history establishes previous occurrences only. The
    // position key used above must match the actual post-move position.
    expect(Game.positionKey(game.board().makeMove(move(board, "a1b1")))).toBe(history[0]);
  });

  it("does not retain a stale root draw after a later search without matching history", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/5q2/K7 w - - 0 1");
    const engine = new SwiftEngine();
    expect(Math.abs(engine.search(board, { depth: 2, positionHistoryKeys: historyFor(board, "a1b1") }).score)).toBe(0);
    expect(engine.search(board, { depth: 2 }).score).toBeLessThan(-400);
  });

  it("prefers a winning continuation rather than an optional repetition", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/8/KQ6 w - - 0 1");
    const knownDraw = "b1b8";
    const result = new SwiftEngine().search(board, {
      depth: 3, positionHistoryKeys: historyFor(board, knownDraw),
    });
    expect(result.score).toBeGreaterThan(400);
    expect(result.move?.uci()).not.toBe(knownDraw);
  });

  it("preserves a direct mate even if a malformed history calls it a repetition", () => {
    const board = Board.fromFEN("7k/8/5KQ1/8/8/8/8/8 w - - 99 1");
    const mate = "g6g7";
    expect(board.makeMove(move(board, mate)).isCheckmate()).toBe(true);
    const result = new SwiftEngine().search(board, {
      depth: 2, positionHistoryKeys: historyFor(board, mate),
    });
    expect(result.move?.uci()).toBe(mate);
    expect(result.score).toBeGreaterThan(90_000);
  });

  it("human-profile Swift keeps an earned drawing move rather than vetoing repetition", () => {
    const board = Board.fromFEN("7k/8/8/8/8/8/5q2/K7 w - - 0 1");
    const result = new HumanSwiftEngine().search(board, {
      depth: 2,
      randomness: 0,
      errorBudget: 0,
      strictBestPlay: false,
      adaptiveThinking: false,
      tacticalSearchDepth: 0,
      positionHistoryKeys: historyFor(board, "a1b1"),
      moveHistory: ["g1f3", "g8f6"],
    });
    expect(result.move?.uci()).toBe("a1b1");
    expect(Math.abs(result.score)).toBe(0);
    expect(result.decision?.reasons[0]).toContain("threefold");
  });
});
