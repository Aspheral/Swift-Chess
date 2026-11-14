import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { Board, Game, SwiftEngine } from "../src";
import { FrozenSwiftEngine } from "./fixtures/frozen-swift-20261109";
import { replayAfLinggaGame } from "./fixtures/af-lingga";

/**
 * A/B baseline = exact Swift main engine at commit 398bec37 from Nov 9.
 * This is an experimental diagnostic, NOT an Elo rating from two games.
 */
describe("Capture ordering A/B against the frozen released engine", () => {
  const userGame = replayAfLinggaGame();

  it("compares identical completed-depth positions with work and time instrumentation", () => {
    const samples = [
      { label: "Opening, balanced", board: Board.start(), depth: 3 },
      { label: "Kiwipete, tactical", board: Board.fromFEN("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), depth: 3 },
      { label: "AfLingga, rook preparation", board: userGame.positions[48], depth: 3 },
      { label: "AfLingga, queen and rook converge", board: userGame.positions[52], depth: 3 },
    ];
    for (const sample of samples) {
      const baselineEngine = new FrozenSwiftEngine();
      const startedBase = performance.now();
      const baseline = baselineEngine.search(sample.board, { depth: sample.depth });
      const baseTime = performance.now() - startedBase;
      const candidateEngine = new SwiftEngine();
      const startedNew = performance.now();
      const candidate = candidateEngine.search(sample.board, { depth: sample.depth });
      const newTime = performance.now() - startedNew;
      expect(baseline.depth, sample.label).toBe(sample.depth);
      expect(candidate.depth, sample.label).toBe(sample.depth);
      expect(sample.board.legalMoves().some((m) => m.uci() === candidate.move?.uci()), sample.label).toBe(true);
      console.log("SWIFT_CAPTURE_ORDER_AB " + JSON.stringify({
        label: sample.label, fen: sample.board.toFEN(),
        frozen: { move: baseline.move?.uci(), score: baseline.score, nodes: baseline.nodes, ms: Math.round(baseTime) },
        proposed: { move: candidate.move?.uci(), score: candidate.score, nodes: candidate.nodes, ms: Math.round(newTime) },
      }));
    }
  }, 70_000);

  it("runs a paired-opening mini-match in both colors with exactly equal depth", () => {
    const opening = ["g1f3", "d7d5", "c2c4", "e7e6", "d2d4", "g8f6"];
    const results: { variant: "white" | "black"; result: string; plies: number; fen: string; diff: number }[] = [];
    for (const candidateColor of ["w", "b"] as const) {
      const game = Game.start();
      for (const move of opening) game.playUci(move);
      const fresh = new SwiftEngine();
      const frozen = new FrozenSwiftEngine();
      let extraPlies = 0;
      while (game.result() === "ongoing" && extraPlies < 56) {
        const board = game.board();
        const ai = game.turn() === candidateColor ? fresh : frozen;
        const answer = ai.search(board, { depth: 2, positionHistoryKeys: game.positionHistoryKeys() });
        expect(answer.depth).toBe(2);
        expect(answer.move).not.toBeNull();
        game.play(answer.move!);
        extraPlies++;
      }
      const material = game.board().material();
      const advantage = candidateColor === "w" ? material : -material;
      results.push({
        variant: candidateColor === "w" ? "white" : "black",
        result: game.result(), plies: extraPlies, fen: game.fen(), diff: advantage,
      });
    }
    console.log("SWIFT_CAPTURE_ORDER_PAIRED_GAMES " + JSON.stringify(results));
    expect(results).toHaveLength(2);
    expect(results.every((game) => game.plies > 10)).toBe(true);
  }, 180_000);
});
