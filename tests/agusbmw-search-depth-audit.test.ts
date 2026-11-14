import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import { replayAgusbmwGame } from "./fixtures/agusbmw";

/** Test-only calculation diagnostic, not an Elo or causal strength claim. */
describe("Opening knight/rook errors at equal completed search depths", () => {
  const game = replayAgusbmwGame();
  it("tracks whether extra depth corrects the early development decisions", () => {
    for (const ply of [14, 16, 18, 20]) {
      const board: Board = game.positions[ply];
      for (const depth of [3, 4, 5, 6]) {
        const engine = new SwiftEngine();
        const start = Date.now();
        const result = engine.search(board, { depth });
        expect(result.depth).toBe(depth);
        expect(result.move).not.toBeNull();
        console.log("AGUSBMW_DEPTH " + JSON.stringify({
          ply, depth, actual: game.moves[ply], move: result.move?.uci(),
          score: result.score, nodes: result.nodes, timeMs: Date.now() - start,
          fen: board.toFEN(),
        }));
      }
    }
  }, 120_000);
});
