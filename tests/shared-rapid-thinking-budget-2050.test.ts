import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import { allowsMateInOne } from "../src/chess/blunder-guard";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

class BusyButTimedEngine extends SwiftEngine {
  calls: SearchOptions[] = [];
  override search(board: Board, options: SearchOptions = {}): SearchResult {
    this.calls.push(options);
    // Simulate time already spent by a timed root search. Follow-up human
    // probes must not each demand their OWN independent whole-game budget.
    const until = Date.now() + 8;
    while (Date.now() < until) { /* bounded fixture */ }
    const move = board.legalMoves().find((m) => m.uci() === "e2e4")
      ?? board.legalMoves()[0] ?? null;
    return { move, score: 15, depth: 6, nodes: 1000, pv: move ? [move] : [] };
  }
}

class NoAuxiliarySearch extends SwiftEngine {
  override search(_board: Board, _options: SearchOptions = {}): SearchResult {
    throw new Error("Extra candidate search exceeded its shared blitz allowance");
  }
}

describe("shared rapid clock budget", () => {
  it("keeps a completed principal move when the decision budget is already spent", () => {
    const main = new BusyButTimedEngine();
    const answer = new HumanSwiftEngine(main, new NoAuxiliarySearch()).search(
      Board.start(), {
        depth: 9, timeMs: 1500, totalTimeMs: 3,
        adaptiveThinking: false, tacticalSearchDepth: 0,
        randomness: 0, errorBudget: 0, seed: 5,
      });
    expect(answer.move?.uci()).toBe("e2e4");
    expect(answer.decision?.source).toBe("engine-fallback");
    expect(answer.decision?.reasons[0]).toContain("clock budget expired");
    expect(main.calls).toHaveLength(1);
    expect(main.calls[0].timeMs).toBeLessThanOrEqual(3);
  });

  it("still vetoes an immediate checkmate when Swift has nearly no time left", () => {
    const threatened = Board.fromFEN("1k4r1/8/8/6q1/8/8/5PPP/R6K w - - 0 1");
    class FastButWrong extends SwiftEngine {
      override search(board: Board, _options: SearchOptions = {}): SearchResult {
        const bad = board.legalMoves().find((m) => m.uci() === "a1a2")!;
        return { move: bad, depth: 7, score: 100, nodes: 1, pv: [bad] };
      }
    }
    const result = new HumanSwiftEngine(new FastButWrong()).search(threatened, {
      depth: 9, timeMs: 1500, totalTimeMs: 1,
      adaptiveThinking: false, strictBestPlay: true, tacticalSearchDepth: 0,
    });
    expect(result.move).not.toBeNull();
    expect(result.move?.uci()).not.toBe("a1a2");
    expect(allowsMateInOne(threatened, result.move!)).toBe(false);
    expect(result.decision?.source).toBe("engine-fallback");
  });

  it("clamps root search time even when the individual search requests more", () => {
    const main = new BusyButTimedEngine();
    new HumanSwiftEngine(main).search(Board.start(), {
      depth: 8, timeMs: 5000, totalTimeMs: 25, adaptiveThinking: false,
      tacticalSearchDepth: 0, strictBestPlay: true,
    });
    expect(main.calls[0].timeMs).toBeLessThanOrEqual(25);
    expect(main.calls[0].timeMs).toBeGreaterThan(0);
  });
});
