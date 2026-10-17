import { describe, expect, it } from "vitest";
import { Board } from "../src";
import { understandPosition } from "../src/chess/understanding";

const WHITE_DEFENDED = "7k/8/5n2/8/4R3/3P4/8/4K3 w - - 0 1";
const WHITE_HANGING = "7k/8/5n2/8/4R3/8/8/4K3 w - - 0 1";
const BLACK_DEFENDED = "7k/8/3p4/4r3/8/5N2/8/K7 b - - 0 1";
const BLACK_HANGING = "7k/8/8/4r3/8/5N2/8/K7 b - - 0 1";

describe("piece protection and realistic tactical vulnerability", () => {
  it("recognizes a white rook attacked by a knight but defended by a pawn", () => {
    const board = Board.fromFEN(WHITE_DEFENDED);
    // No legal move may capture an occupied friendly square; the old
    // understanding layer incorrectly used legalMoves for defense.
    expect(board.legalMoves().some((move) => move.to === 28)).toBe(false);
    expect(board.isSquareAttacked("e4", "w")).toBe(true);
    expect(board.isSquareAttacked("e4", "b")).toBe(true);
    const rook = understandPosition(board).pieces.w.find((piece) => piece.square === "e4");
    expect(rook).toMatchObject({ type: "r", defended: true, vulnerable: false });
  });

  it("identifies the same white rook as hanging when the pawn defender is gone", () => {
    const board = Board.fromFEN(WHITE_HANGING);
    const rook = understandPosition(board).pieces.w.find((piece) => piece.square === "e4");
    expect(rook).toMatchObject({ type: "r", defended: false, vulnerable: true });
  });

  it("handles black protection symmetrically", () => {
    const defended = Board.fromFEN(BLACK_DEFENDED);
    const hanging = Board.fromFEN(BLACK_HANGING);
    expect(understandPosition(defended).pieces.b.find((piece) => piece.square === "e5"))
      .toMatchObject({ type: "r", defended: true, vulnerable: false });
    expect(understandPosition(hanging).pieces.b.find((piece) => piece.square === "e5"))
      .toMatchObject({ type: "r", defended: false, vulnerable: true });
  });

  it("does not count a piece as defending itself or mark an unattacked piece vulnerable", () => {
    const alone = Board.fromFEN("7k/8/8/8/4R3/8/8/K7 w - - 0 1");
    const rook = understandPosition(alone).pieces.w.find((piece) => piece.square === "e4");
    expect(rook).toMatchObject({ type: "r", defended: false, vulnerable: false });
  });
});
