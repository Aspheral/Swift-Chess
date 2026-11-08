import { describe, expect, it } from "vitest";
import { Board } from "../src";
import { avoidImmediateMajorBlunder, immediateMaterialLoss } from "../src/chess/blunder-guard";

const find = (board: Board, uci: string) => {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  expect(move, `Expected legal move ${uci}`).toBeDefined();
  return move!;
};

describe("net material safety guard", () => {
  it("does not reject a profitable rook-for-queen exchange just because the rook can be recaptured", () => {
    // 1. Rxe8 Rxe8 wins a queen for a rook. A gross-loss-only guard
    // incorrectly scored the reply as a 500cp rook blunder.
    const board = Board.fromFEN("4qr1k/8/8/8/8/8/8/K3R3 w - - 0 1");
    const capture = find(board, "e1e8");
    expect(board.makeMove(capture).legalMoves().some((reply) => reply.uci() === "f8e8")).toBe(true);
    expect(immediateMaterialLoss(board, capture)).toBe(0);
    expect(avoidImmediateMajorBlunder(board, capture)).toBeNull();
  });

  it("catches a hanging bishop even when no rook or queen is exposed", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/K7/4B3/4r3 w - - 0 1");
    const ignoreThreat = find(board, "a3b3");
    const saveBishop = find(board, "e2d3");
    expect(immediateMaterialLoss(board, ignoreThreat)).toBeGreaterThanOrEqual(300);
    const correction = avoidImmediateMajorBlunder(board, ignoreThreat, [saveBishop]);
    expect(correction?.move.uci()).toBe("e2d3");
    expect(correction?.remainingLoss).toBeLessThan(160);
  });

  it("still rejects a losing rook-for-knight trade after accounting for the captured knight", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/3p4/4n3/4R2K w - - 0 1");
    const capture = find(board, "e1e2");
    expect(board.makeMove(capture).legalMoves().some((reply) => reply.uci() === "d3e2")).toBe(true);
    expect(immediateMaterialLoss(board, capture)).toBeGreaterThanOrEqual(160);
    expect(immediateMaterialLoss(board, capture)).toBeLessThan(250);
  });

  it("credits promotion material when assessing a capture and recapture", () => {
    const board = Board.fromFEN("k5rr/5P2/8/8/8/8/8/K7 w - - 0 1");
    const promote = find(board, "f7g8q");
    expect(board.makeMove(promote).legalMoves().some((reply) => reply.uci() === "h8g8")).toBe(true);
    expect(immediateMaterialLoss(board, promote)).toBe(0);
    expect(avoidImmediateMajorBlunder(board, promote)).toBeNull();
  });
});
