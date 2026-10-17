import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import type { Move } from "../src/chess/board";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

type PlanInspector = {
  verifyPlanOverride(
    board: Board, principal: Move, candidate: Move,
    mainDepth: number, margin: number, rootTimeMs?: number,
  ): boolean;
};

function legal(board: Board, uci: string): Move {
  const result = board.legalMoves().find((move) => move.uci() === uci);
  if (!result) throw new Error(`Missing ${uci} from ${board.toFEN()}`);
  return result;
}

class ControlledSafety extends SwiftEngine {
  readonly calls: Array<{ depth: number; timeMs?: number }> = [];
  selectedCentipawns = 40;
  completedDepthOffset = 0;

  override search(board: Board, options: SearchOptions = {}): SearchResult {
    const depth = options.depth ?? 1;
    this.calls.push({ depth, timeMs: options.timeMs });
    // At this child node the opponent is to move. A negative score means
    // a favorable evaluation for Swift's original side of the board.
    const score = board.pieceAt("e4") === "wp" ? -80
      : board.pieceAt("d4") === "wp" ? -this.selectedCentipawns : 0;
    return { move: board.legalMoves()[0] ?? null, depth: depth - this.completedDepthOffset, score, nodes: 40, pv: [] };
  }
}

function setup() {
  const board = Board.start();
  const safety = new ControlledSafety();
  const human = new HumanSwiftEngine(new SwiftEngine(), safety) as unknown as PlanInspector;
  const principal = legal(board, "e2e4");
  const alternative = legal(board, "d2d4");
  return { board, safety, human, principal, alternative };
}

describe("deep human-plan move verification", () => {
  it("rejects a superficially plausible move when matched deeper scores are inferior", () => {
    const { board, human, safety, principal, alternative } = setup();
    expect(human.verifyPlanOverride(board, principal, alternative, 8, 30, 1250)).toBe(false);
    expect(safety.calls).toEqual([
      { depth: 5, timeMs: 500 },
      { depth: 5, timeMs: 500 },
    ]);
  });

  it("permits different human plans when the deeper calculation agrees", () => {
    const { board, human, safety, principal, alternative } = setup();
    safety.selectedCentipawns = 70;
    expect(human.verifyPlanOverride(board, principal, alternative, 8, 30, 1250)).toBe(true);
  });

  it("keeps the principal move whenever either comparison is interrupted", () => {
    const { board, human, safety, principal, alternative } = setup();
    safety.completedDepthOffset = 1;
    expect(human.verifyPlanOverride(board, principal, alternative, 7, 30, 800)).toBe(false);
    expect(safety.calls).toHaveLength(1);
  });

  it("does not spend extra time when the human plan already agrees or root search is shallow", () => {
    const { board, human, safety, principal, alternative } = setup();
    expect(human.verifyPlanOverride(board, principal, principal, 8, 24, 900)).toBe(true);
    expect(human.verifyPlanOverride(board, principal, alternative, 3, 24, 900)).toBe(false);
    expect(safety.calls).toHaveLength(0);
  });
});
