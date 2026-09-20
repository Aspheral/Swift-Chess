import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";
import { openingBookMove } from "../src/chess/openings";
import { createSeededRandom, deriveSeed } from "../src/chess/random";

describe("Swift seeded randomness", () => {
  it("decorrelates neighboring seeds used by calibration batches", () => {
    const values = Array.from({ length: 20 }, (_, index) => createSeededRandom(10_000 + index)());
    const rounded = new Set(values.map((value) => value.toFixed(3)));

    expect(rounded.size).toBeGreaterThanOrEqual(16);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.75);
  });

  it("gives neighboring game seeds genuine opening diversity", () => {
    const board = Board.start();
    const moves = Array.from({ length: 20 }, (_, index) =>
      openingBookMove(board, 10_000 + index, [])?.move.uci(),
    );

    expect(new Set(moves).size).toBe(3);
    expect(new Set(moves)).toEqual(new Set(["g1f3", "d2d4", "e2e4"]));
  });

  it("derives reproducible but different seeds for successive plies", () => {
    const first = Array.from({ length: 8 }, (_, ply) => deriveSeed(123456, ply));
    const second = Array.from({ length: 8 }, (_, ply) => deriveSeed(123456, ply));

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});
