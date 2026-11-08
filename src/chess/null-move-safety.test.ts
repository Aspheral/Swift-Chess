import { describe, expect, it } from "vitest";
import { Board } from "./board";
import { SwiftEngine } from "./engine";

// Exercise the material precondition directly so that later search changes
// cannot accidentally re-enable unsafe null moves in asymmetric endgames.
function allowsNullMove(fen: string): boolean {
  const engine = new SwiftEngine();
  return (engine as unknown as { canNullMove(board: Board): boolean })
    .canNullMove(Board.fromFEN(fen));
}

describe("null-move pruning endgame safety", () => {
  it("does not count the opponent's pieces as material for the side to move", () => {
    // Black has only king and pawns, but White has three rooks.
    expect(allowsNullMove("4k3/4p3/8/8/8/8/8/R2RK2R b - - 0 1")).toBe(false);
  });

  it("does not null-prune a side with only one minor piece", () => {
    // The opponent's two rooks must not make Black's lone knight eligible.
    expect(allowsNullMove("4k3/8/8/8/8/8/4n3/R3K2R b - - 0 1")).toBe(false);
  });

  it("does not null-prune a side with two major pieces", () => {
    expect(allowsNullMove("r2rk3/8/8/8/8/8/8/4K3 b - - 0 1")).toBe(false);
  });

  it("still permits null pruning with sufficient own material", () => {
    expect(allowsNullMove("r2qk2r/8/8/8/8/8/8/4K3 b - - 0 1")).toBe(true);
  });
});
