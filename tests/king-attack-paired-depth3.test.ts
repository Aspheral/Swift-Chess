import { describe, expect, it } from "vitest";
import { Game, SwiftEngine } from "../src";
import { FrozenSwiftEngine } from "./fixtures/frozen-swift-20261109";

/**
 * Paired, equal-depth color-reversed exploratory games. This is a diagnostic
 * for gross regressions, not an Elo calibration or a replacement for Stockfish.
 */
describe("2100 path: fixed-depth color-reversed candidate vs released Swift", () => {
  it("plays four distinct opening pairs with exactly the same search depth", () => {
    const openingLines = [
      { name: "Reti", moves: ["g1f3","d7d5","c2c4","e7e6"] },
      { name: "QGD", moves: ["d2d4","d7d5","c2c4","e7e6","b1c3","g8f6"] },
      { name: "Italian", moves: ["e2e4","e7e5","g1f3","b8c6","f1c4","f8c5"] },
      { name: "Slav", moves: ["d2d4","d7d5","c2c4","c7c6","g1f3","g8f6"] },
    ];
    let wins = 0, losses = 0, draws = 0, unfinished = 0;
    const games = [];
    for (const opening of openingLines) for (const candidateColor of ["w","b"] as const) {
      const game = Game.start();
      for (const move of opening.moves) game.playUci(move);
      const newEngine = new SwiftEngine();
      const oldEngine = new FrozenSwiftEngine();
      let moves = 0, newTime = 0, oldTime = 0, newNodes = 0, oldNodes = 0;
      while (game.result() === "ongoing" && moves < 64) {
        const board = game.board();
        const isCandidate = board.turn() === candidateColor;
        const start = Date.now();
        const answer = (isCandidate ? newEngine : oldEngine).search(board, {
          depth: 3, positionHistoryKeys: game.positionHistoryKeys(),
        });
        if (isCandidate) { newTime += Date.now() - start; newNodes += answer.nodes; }
        else { oldTime += Date.now() - start; oldNodes += answer.nodes; }
        expect(answer.depth).toBe(3);
        expect(answer.move).not.toBeNull();
        game.play(answer.move!);
        moves++;
      }
      const outcome = game.result();
      let result = "unresolved";
      if (outcome === "checkmate") {
        const candidateWon = game.turn() !== candidateColor;
        result = candidateWon ? "win" : "loss";
        if (candidateWon) wins++; else losses++;
      } else if (outcome !== "ongoing") {
        result = "draw"; draws++;
      } else unfinished++;
      const advantage = game.board().material() * (candidateColor === "w" ? 1 : -1);
      games.push({
        opening: opening.name, color: candidateColor, result, plies: moves,
        materialAtCap: advantage,
        newNodes, oldNodes, newTime, oldTime,
        finalFen: game.fen(),
      });
    }
    console.log("SWIFT_KING_HUNT_PAIRED_DEPTH3 " + JSON.stringify({
      games: games.length, wins, losses, draws, unfinished,
      completed: wins + losses + draws, scoreOnCompleted: wins + draws * 0.5,
      records: games,
    }));
    expect(games).toHaveLength(8);
    expect(wins + losses + draws + unfinished).toBe(8);
    // Do not silently claim an unfinished game as a draw.
    expect(games.every((game) => game.plies >= 15)).toBe(true);
  }, 240_000);
});
