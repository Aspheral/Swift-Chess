import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";

function perft(board: Board, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of board.legalMoves()) {
    nodes += perft(board.makeMove(move), depth - 1);
  }
  return nodes;
}

describe("Swift perft", () => {
  it("matches the standard starting-position node counts", () => {
    const board = Board.start();
    expect(perft(board, 1)).toBe(20);
    expect(perft(board, 2)).toBe(400);
    expect(perft(board, 3)).toBe(8902);
    expect(perft(board, 4)).toBe(197281);
  });

  it("matches the canonical Kiwipete position", () => {
    const board = Board.fromFEN(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );
    expect(perft(board, 1)).toBe(48);
    expect(perft(board, 2)).toBe(2039);
    expect(perft(board, 3)).toBe(97862);
  });
});
