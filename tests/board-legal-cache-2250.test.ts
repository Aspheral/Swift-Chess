import { describe, expect, it, vi } from "vitest";
import { Board } from "../src";

const uci = (board: Board) => board.legalMoves().map((move) => move.uci()).sort();

describe("2250 per-board legal move cache", () => {
  it("generates the same legal list once per immutable board snapshot", () => {
    const board = Board.start();
    const witness = vi.spyOn(board as unknown as { pseudoLegalMoves: () => unknown[] }, "pseudoLegalMoves");
    const first = board.legalMoves();
    const again = board.legalMoves();
    expect(witness).toHaveBeenCalledTimes(1);
    expect(again.map((m) => m.uci())).toEqual(first.map((m) => m.uci()));
    expect(again).not.toBe(first);
    expect(again).toHaveLength(20);
  });

  it("does not allow array mutation to poison future searches", () => {
    const board = Board.start();
    const externallyMutated = board.legalMoves();
    externallyMutated.length = 0;
    expect(board.legalMoves()).toHaveLength(20);
    expect(board.legalTactics().hasLegalMove).toBe(true);
  });

  it("does not reuse parent cached moves after playing a move", () => {
    const board = Board.start();
    board.legalMoves();
    const next = board.makeMove(board.legalMoves().find((m) => m.uci() === "e2e4")!);
    expect(next.turn()).toBe("b");
    expect(next.legalMoves().length).toBe(20);
    expect(board.legalMoves().length).toBe(20);
    expect(uci(next)).not.toEqual(uci(board));
  });

  it("cached and uncached tactical generation agree, with and without quiet checks", () => {
    const positions = [
      "6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1",
      "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
      "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1",
      "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
    ];
    for (const fen of positions) for (const checks of [false, true]) {
      const fresh = Board.fromFEN(fen);
      const expected = fresh.legalTactics(checks);
      fresh.legalMoves();
      const cached = fresh.legalTactics(checks);
      expect(cached.hasLegalMove, fen).toBe(expected.hasLegalMove);
      expect(cached.moves.map((m)=>m.uci()).sort(), fen)
        .toEqual(expected.moves.map((m)=>m.uci()).sort());
    }
  });
});
