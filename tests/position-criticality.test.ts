import { describe, expect, it } from "vitest";
import { Board } from "../src";
import { criticalityCornerSide, positionCriticality } from "../src/chess/position-criticality";

describe("side-specific board criticality, not win probability", () => {
  it("gives sensible bounded quiet-opening percentages", () => {
    const result = positionCriticality(Board.start());
    expect(result.w).toBeGreaterThanOrEqual(0);
    expect(result.b).toBeGreaterThanOrEqual(0);
    expect(result.w).toBeLessThan(30);
    expect(result.b).toBeLessThan(30);
  });

  it("elevates the side in check rather than its attacker", () => {
    const whiteChecked = Board.fromFEN("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
    const blackChecked = Board.fromFEN("4k3/4R3/8/8/8/8/8/4K3 b - - 0 1");
    expect(positionCriticality(whiteChecked).w).toBeGreaterThanOrEqual(86);
    expect(positionCriticality(blackChecked).b).toBeGreaterThanOrEqual(86);
  });

  it("reports a terminal mated king at 100 and a stalemate at 0", () => {
    expect(positionCriticality(Board.fromFEN("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"))).toEqual({ w: 0, b: 100 });
    expect(positionCriticality(Board.fromFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toEqual({ w: 0, b: 0 });
  });

  it("detects a dangerous enemy pawn closer to promotion", () => {
    const near = Board.fromFEN("4k3/8/8/8/8/8/p7/4K3 w - - 0 1");
    const far = Board.fromFEN("4k3/8/8/8/8/p7/8/4K3 w - - 0 1");
    expect(positionCriticality(near).w).toBeGreaterThan(positionCriticality(far).w);
  });

  it("follows Black/White when the board flips", () => {
    expect(criticalityCornerSide(false, "top-right")).toBe("b");
    expect(criticalityCornerSide(false, "bottom-left")).toBe("w");
    expect(criticalityCornerSide(true, "top-right")).toBe("w");
    expect(criticalityCornerSide(true, "bottom-left")).toBe("b");
  });
});
