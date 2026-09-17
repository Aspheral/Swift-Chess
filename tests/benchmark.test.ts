import { describe, expect, it } from "vitest";
import { Board, SWIFT_BENCHMARKS, SwiftEnginePVS, runSwiftBenchmarks } from "../src";

describe("Swift benchmark suite", () => {
  it("contains deterministic regression positions", () => {
    expect(SWIFT_BENCHMARKS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SWIFT_BENCHMARKS.map((position) => position.name)).size).toBe(SWIFT_BENCHMARKS.length);
  });

  it("searches every benchmark to its requested depth", () => {
    for (const position of SWIFT_BENCHMARKS) {
      const board = Board.fromFEN(position.fen);
      const result = new SwiftEnginePVS().search(board, { depth: position.depth });
      expect(result.depth, position.name).toBe(position.depth);
      expect(result.move, position.name).not.toBeNull();
      expect(board.legalMoves().some((move) => move.uci() === result.move?.uci()), position.name).toBe(true);
    }
  }, 30_000);

  it("preserves the known tactical answer", () => {
    const tactical = SWIFT_BENCHMARKS.find((position) => position.expectedMove);
    expect(tactical).toBeDefined();
    const result = new SwiftEnginePVS().search(Board.fromFEN(tactical!.fen), { depth: tactical!.depth });
    expect(result.move?.uci()).toBe(tactical!.expectedMove);
  });

  it("produces repeatable benchmark output", () => {
    const first = runSwiftBenchmarks();
    const second = runSwiftBenchmarks();
    expect(second.map(({ name, result }) => [name, result.depth, result.move?.uci(), result.score]))
      .toEqual(first.map(({ name, result }) => [name, result.depth, result.move?.uci(), result.score]));
  }, 30_000);
});
