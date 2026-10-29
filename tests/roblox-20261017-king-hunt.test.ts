import { describe, expect, it } from "vitest";
import { Game, HumanSwiftEngine, SwiftEngine } from "../src";
import type { Board, Move } from "../src/chess/board";
import type { SearchOptions, SearchResult } from "../src/chess/engine";
import { allowsMateInOne } from "../src/chess/blunder-guard";

/**
 * Roblox Chess Club, rated 600+5, 2026-10-17.
 * Black played 13...Nxe6?? 14.Qxe6# after a sequence of greedy knight moves.
 * Keep the original game as a legal UCI replay, not a fabricated FEN.
 */
const gameBeforeBlackMove13 = [
  "e2e4", "b8c6", "g1f3", "g8f6", "e4e5", "f6d5",
  "c2c4", "d5b6", "c4c5", "b6d5", "d2d4", "d7d6",
  "c1f4", "d5f4", "f1c4", "d6e5", "d1b3", "e5d4",
  "c4f7", "e8d7", "f3g5", "f4g2", "e1f1", "g2f4",
  "g5e6",
];

function replay() {
  const game = Game.start();
  for (const uci of gameBeforeBlackMove13) game.playUci(uci);
  return game;
}

function forcedMove(board: Board, uci: string): Move {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!move) throw new Error(`Expected ${uci} to be legal in ${board.toFEN()}`);
  return move;
}

describe("Roblox Oct 17 early king hunt regression", () => {
  it("replays the actual 13...Nxe6?? and recognizes Qxe6 checkmate", () => {
    const game = replay();
    expect(game.turn()).toBe("b");
    const doomedKnight = forcedMove(game.board(), "f4e6");
    const child = game.board().makeMove(doomedKnight);
    expect(forcedMove(child, "b3e6").uci()).toBe("b3e6");
    expect(child.makeMove(forcedMove(child, "b3e6")).isCheckmate()).toBe(true);
    expect(allowsMateInOne(game.board(), doomedKnight)).toBe(true);
    game.playUci("f4e6");
    game.playUci("b3e6");
    expect(game.result()).toBe("checkmate");
  });

  it("vetoes 13...Nxe6 even when an engine falsely reports a completed seven-ply principal search", () => {
    class ConfidentButWrong extends SwiftEngine {
      override search(board: Board, _options: SearchOptions = {}): SearchResult {
        const bad = forcedMove(board, "f4e6");
        return {
          move: bad, score: 40, depth: 7, nodes: 20000, pv: [bad],
          stability: { scoreSwingCp: 0, moveChanged: false, interrupted: false },
        };
      }
    }
    const game = replay();
    const result = new HumanSwiftEngine(new ConfidentButWrong()).search(game.board(), {
      depth: 7, adaptiveThinking: false, strictBestPlay: true,
      tacticalSearchDepth: 0, randomness: 0, errorBudget: 0,
      moveHistory: game.moveHistory(), positionHistoryKeys: game.positionHistoryKeys(),
    });
    expect(result.move).not.toBeNull();
    expect(result.move!.uci()).not.toBe("f4e6");
    expect(allowsMateInOne(game.board(), result.move!)).toBe(false);
    expect(result.decision?.source).toBe("engine-fallback");
    expect(result.decision?.reasons[0]).toContain("mate in one");
  });
  it("rejects the same mating blunder even if a wrong search claims a forced mate", () => {
    class BogusMateClaim extends SwiftEngine {
      override search(board: Board, _options: SearchOptions = {}): SearchResult {
        const bad = forcedMove(board, "f4e6");
        return {
          move: bad, score: 99_500, depth: 8, nodes: 30_000, pv: [bad],
          stability: { scoreSwingCp: 0, moveChanged: false, interrupted: false },
        };
      }
    }
    const game = replay();
    const answer = new HumanSwiftEngine(new BogusMateClaim()).search(game.board(), {
      depth: 8, adaptiveThinking: false, strictBestPlay: true,
      tacticalSearchDepth: 0, randomness: 0, errorBudget: 0,
      moveHistory: game.moveHistory(), positionHistoryKeys: game.positionHistoryKeys(),
    });
    expect(answer.move).not.toBeNull();
    expect(answer.move!.uci()).not.toBe("f4e6");
    expect(allowsMateInOne(game.board(), answer.move!)).toBe(false);
  });
});
