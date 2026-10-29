import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

interface QuiescenceProbe {
  quiescence(board: Board, alpha: number, beta: number, ply: number, qPly?: number): number;
}

const root = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
const mateInOne = "g3b8";

describe("2250 quiet-check quiescence extensions", () => {
  it("keeps default move generation capture/promotion only for fast callers", () => {
    const defaultMoves = root.legalTactics().moves.map((move) => move.uci());
    expect(defaultMoves).not.toContain(mateInOne);
    expect(root.legalTactics(true).moves.map((move) => move.uci())).toContain(mateInOne);
  });

  it("exactly matches legal captures, promotions and quiet checks", () => {
    const boards = [
      root,
      Board.start(),
      Board.fromFEN("4r1k1/8/8/8/8/8/2p1R3/4K3 w - - 0 1"),
      Board.fromFEN("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"),
    ];
    for (const board of boards) {
      const expected = board.legalMoves().filter((move) => {
        const child = board.makeMove(move);
        return move.enPassant || !!move.promotion ||
          board.pieceAt(move.to) !== null || child.isInCheck(child.turn());
      }).map((move) => move.uci()).sort();
      const got = board.legalTactics(true).moves.map((move) => move.uci()).sort();
      expect(got, board.toFEN()).toEqual(expected);
    }
  });

  it("sees a quiet checkmate beyond the normal capture-only search horizon", () => {
    const probe = new SwiftEngine() as unknown as QuiescenceProbe;
    const score = probe.quiescence(root, -1_000_000, 1_000_000, 0);
    expect(score).toBeGreaterThan(99_000);
  });

  it("does not recurse quiet checks indefinitely after the first quiescence ply", () => {
    const probe = new SwiftEngine() as unknown as QuiescenceProbe;
    // At subsequent quiescence plies, a quiet mate is NOT introduced anew.
    const leaf = probe.quiescence(root, -1_000_000, 1_000_000, 0, 1);
    expect(leaf).toBeLessThan(99_000);
    expect(probe.quiescence(root, -1_000_000, 1_000_000, 0, 24))
      .toBeLessThan(99_000);
  });

  it("preserves terminal checkmate and stalemate evaluation at recursion cap", () => {
    const probe = new SwiftEngine() as unknown as QuiescenceProbe;
    const mate = Board.fromFEN("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
    const stale = Board.fromFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(probe.quiescence(mate,-1_000_000,1_000_000,9,24)).toBe(-99_991);
    expect(probe.quiescence(stale,-1_000_000,1_000_000,9,24)).toBe(0);
  });
});
