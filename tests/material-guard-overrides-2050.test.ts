import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import type { Move } from "../src/chess/board";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

interface GuardInspector {
  verifyMaterialOverride(
    board: Board, principal: Move, alternative: Move,
    rootDepth: number, rootTimeMs?: number,
  ): boolean;
}

class ControlledIndependentSearch extends SwiftEngine {
  alternativeScore = 40;
  completedDepth = 5;
  calls: Array<{ depth: number; timeMs?: number }> = [];

  override search(board: Board, options: SearchOptions = {}): SearchResult {
    const depth = options.depth ?? 1;
    this.calls.push({ depth, timeMs: options.timeMs });
    const score = board.pieceAt("e4") === "wp" ? -80
      : board.pieceAt("d4") === "wp" ? -this.alternativeScore : 0;
    return { move: board.legalMoves()[0] ?? null, depth: this.completedDepth, score, nodes: 100 };
  }
}

function fixture() {
  const board = Board.start();
  const independent = new ControlledIndependentSearch();
  const engine = new HumanSwiftEngine(new SwiftEngine(), independent) as unknown as GuardInspector;
  const legal = board.legalMoves();
  const principal = legal.find((move) => move.uci() === "e2e4")!;
  const alternative = legal.find((move) => move.uci() === "d2d4")!;
  return { board, independent, engine, principal, alternative };
}

describe("material fallback must not discard sound deep principal moves", () => {
  it("rejects an allegedly safer but substantially weaker alternative", () => {
    const { board, independent, engine, principal, alternative } = fixture();
    expect(engine.verifyMaterialOverride(board, principal, alternative, 8, 1500)).toBe(false);
    expect(independent.calls).toEqual([
      { depth: 5, timeMs: 600 }, { depth: 5, timeMs: 600 },
    ]);
  });

  it("still replaces principal when the material-saving alternative is verified better", () => {
    const { board, independent, engine, principal, alternative } = fixture();
    independent.alternativeScore = 125;
    expect(engine.verifyMaterialOverride(board, principal, alternative, 8, 1500)).toBe(true);
  });

  it("does not use interrupted re-searches as proof the alternative is safer", () => {
    const { board, independent, engine, principal, alternative } = fixture();
    independent.completedDepth = 3;
    expect(engine.verifyMaterialOverride(board, principal, alternative, 8, 1200)).toBe(false);
    expect(independent.calls).toHaveLength(1);
  });

  it("retains emergency material protection for genuinely shallow searches", () => {
    const { board, independent, engine, principal, alternative } = fixture();
    expect(engine.verifyMaterialOverride(board, principal, alternative, 2, 100)).toBe(true);
    expect(independent.calls).toHaveLength(0);
  });
});
