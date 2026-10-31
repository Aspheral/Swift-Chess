import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";
import { isDarkSquare, squareAtVisualIndex, visualIndexForSquare } from "../src/chess/board-view";

describe("board orientation", () => {
  it("has light bottom-right and dark bottom-left corners from both perspectives", () => {
    // White faces h1 (light) at bottom-right and a1 (dark) at bottom-left.
    expect(squareAtVisualIndex(63, false)).toBe(7);  // h1
    expect(squareAtVisualIndex(56, false)).toBe(0);  // a1
    expect(isDarkSquare(squareAtVisualIndex(63, false))).toBe(false);
    expect(isDarkSquare(squareAtVisualIndex(56, false))).toBe(true);

    // Black faces a8 (light) at bottom-right and h8 (dark) at bottom-left.
    expect(squareAtVisualIndex(63, true)).toBe(56); // a8
    expect(squareAtVisualIndex(56, true)).toBe(63); // h8
    expect(isDarkSquare(squareAtVisualIndex(63, true))).toBe(false);
    expect(isDarkSquare(squareAtVisualIndex(56, true))).toBe(true);
  });

  it("rotates actual squares and pieces by 180 degrees", () => {
    const board = Board.start();
    expect(board.pieceAt(squareAtVisualIndex(0, false))).toBe("br"); // a8
    expect(board.pieceAt(squareAtVisualIndex(0, true))).toBe("wr"); // h1
    expect(board.pieceAt(squareAtVisualIndex(63, false))).toBe("wr"); // h1
    expect(board.pieceAt(squareAtVisualIndex(63, true))).toBe("br"); // a8
  });

  it("keeps all 64 squares and analysis-arrow positions aligned through a flip", () => {
    const standard = Array.from({ length: 64 }, (_, i) => squareAtVisualIndex(i, false));
    const flipped = Array.from({ length: 64 }, (_, i) => squareAtVisualIndex(i, true));
    expect(new Set(standard).size).toBe(64);
    expect(new Set(flipped).size).toBe(64);

    for (let visualIndex = 0; visualIndex < 64; visualIndex++) {
      const square = standard[visualIndex];
      expect(flipped[63 - visualIndex]).toBe(square);
      expect(visualIndexForSquare(square, false)).toBe(visualIndex);
      expect(visualIndexForSquare(square, true)).toBe(63 - visualIndex);
      expect(isDarkSquare(square)).toBe((Math.floor(visualIndex / 8) + visualIndex % 8) % 2 === 1);
    }
  });
});
