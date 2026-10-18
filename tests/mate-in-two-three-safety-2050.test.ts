import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import type { SearchOptions, SearchResult } from "../src/chess/engine";
import { allowsCheckingMate, avoidShortCheckingMate, proveCheckingMate } from "../src/chess/mate-threat";

const mateTwo = Board.fromFEN("5r1k/p5pp/8/3Q2N1/2B5/8/8/K7 b - - 0 1");
// White's exact forced mate: 1.Qg8+ Rxg8 2.Nf7#.
const mateThree = Board.fromFEN("8/7p/8/2N5/8/2k1N3/Q3r2q/K7 b - - 0 1");
// White's checking mate in three after ...h6:
// 1.Qc4+ Kd2 2.Qc1+ Kxc1 3.Nb3#.
// Position based on Chessonomy's published mate-in-three composition.

function move(board: Board, uci: string) {
  const found = board.legalMoves().find((m) => m.uci() === uci);
  if (!found) throw new Error(`Missing legal move ${uci} in ${board.toFEN()}`);
  return found;
}

describe("independent mate-in-two and mate-in-three protection", () => {
  it("proves a two-move checking mate through every legal reply", () => {
    const bad = move(mateTwo, "a7a6");
    const after = mateTwo.makeMove(bad);
    const first = move(after, "d5g8");
    const second = after.makeMove(first);
    expect(second.isInCheck("b")).toBe(true);
    const capture = move(second, "f8g8");
    expect(second.makeMove(capture).makeMove(move(second.makeMove(capture), "g5f7")).isCheckmate()).toBe(true);
    const proof = allowsCheckingMate(mateTwo, bad, 2, { maxNodes: 10000, timeMs: 2000 });
    expect(proof.complete).toBe(true);
    expect(proof.found).toBe(true);
  });

  it("finds a genuine three-move mate which is not already forced in two", () => {
    const bad = move(mateThree, "h7h6");
    const after = mateThree.makeMove(bad);
    const check1 = move(after, "a2c4");
    const afterCheck1 = after.makeMove(check1);
    expect(afterCheck1.isInCheck("b")).toBe(true);
    const king = move(afterCheck1, "c3d2");
    const second = afterCheck1.makeMove(king);
    const check2 = move(second, "c4c1");
    const afterCheck2 = second.makeMove(check2);
    expect(afterCheck2.isInCheck("b")).toBe(true);
    const kingTakes = move(afterCheck2, "d2c1");
    const beforeMate = afterCheck2.makeMove(kingTakes);
    expect(beforeMate.makeMove(move(beforeMate, "c5b3")).isCheckmate()).toBe(true);
    expect(allowsCheckingMate(mateThree, bad, 2, { maxNodes: 14000, timeMs: 2000 }).found).toBe(false);
    const proof = allowsCheckingMate(mateThree, bad, 3, { maxNodes: 20000, timeMs: 2000 });
    expect(proof.complete).toBe(true);
    expect(proof.found).toBe(true);
  });

  it("rejects a proposed move only if an alternative survives the same check", () => {
    const bad = move(mateThree, "h7h6");
    const saved = avoidShortCheckingMate(mateThree, bad, [move(mateThree, "e2e3")]);
    expect(saved?.move.uci()).not.toBe(bad.uci());
    if (saved) {
      const verification = allowsCheckingMate(mateThree, saved.move, 3, { maxNodes: 10000, timeMs: 1000 });
      expect(verification.complete).toBe(true);
      expect(verification.found).toBe(false);
    }
  });

  it("never presents an interrupted proof as an established mate", () => {
    const proposed = move(mateThree, "h7h6");
    const limited = allowsCheckingMate(mateThree, proposed, 3, {
      maxNodes: 1, timeMs: 2000,
    });
    expect(limited.complete).toBe(false);
    expect(limited.found).toBe(false);
  });

  it("requires an actual defender-side attack, not just a misleading score", () => {
    const initial = Board.start();
    const wrongSide = proveCheckingMate(initial, "b", 3);
    expect(wrongSide).toEqual({ found: false, complete: true, nodes: 0 });
  });

  it("does not invent mate in a normal opening", () => {
    const board = Board.start();
    const proof = allowsCheckingMate(board, move(board, "e2e4"), 3, { maxNodes: 5000, timeMs: 1000 });
    expect(proof.found).toBe(false);
  });

  it("vetoes a forced mate despite a confidently incorrect deep root search", () => {
    class WrongDeepEngine extends SwiftEngine {
      override search(board: Board, _options: SearchOptions = {}): SearchResult {
        const bad = move(board, "h7h6");
        return { move: bad, score: 150, depth: 8, nodes: 20000, pv: [bad] };
      }
    }
    const result = new HumanSwiftEngine(new WrongDeepEngine()).search(mateThree, {
      depth: 8, adaptiveThinking: false, strictBestPlay: true,
      tacticalSearchDepth: 0, randomness: 0, errorBudget: 0,
    });
    expect(result.move?.uci()).not.toBe("h7h6");
    expect(result.decision?.reasons.some((reason) => reason.includes("checking mate in 3"))).toBe(true);
  }, 15000);
});
