import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

/**
 * Regression: incomplete timed searches must not authorize a human-plan move.
 * A score from depth 0 is the static board evaluation, not proof of safety.
 */
describe("Incomplete safety search regression", () => {
  class SafetyNeverCompletes extends SwiftEngine {
    calls = 0;
    override search(board: Board, options: SearchOptions = {}): SearchResult {
      this.calls += 1;
      const result = super.search(board, { depth: 1 });
      return { ...result, score: -9999, depth: 0 };
    }
  }

  class SafetyCandidatesTimeOut extends SwiftEngine {
    calls = 0;
    override search(board: Board, options: SearchOptions = {}): SearchResult {
      this.calls += 1;
      const result = super.search(board, { depth: Math.min(2, options.depth ?? 2) });
      return this.calls === 1 ? result : { ...result, score: -9999, depth: 0 };
    }
  }

  const options = {
    depth: 2, ponderDepth: 2, safetyDepth: 2, tacticalSearchDepth: 0,
    safetyCandidateLimit: 3, concreteCandidateLimit: 6,
    errorBudget: 0.03, randomness: 0, moveHistory: Array(22).fill("fixture"),
  };

  it("does not call static evaluation a verified plan when baseline times out", () => {
    const safety = new SafetyNeverCompletes();
    const root = new SwiftEngine().search(Board.start(), { depth: 2 });
    const result = new HumanSwiftEngine(new SwiftEngine(), safety).search(Board.start(), options);
    expect(safety.calls).toBe(1);
    expect(result.move?.uci()).toBe(root.move?.uci());
    expect(result.decision?.source).toBe("engine-fallback");
    expect(result.decision?.reasons.join(" ")).toMatch(/incomplete/i);
    expect(result.humanCandidates).toHaveLength(0);
  });

  it("rejects candidates whose safety score never reaches baseline depth", () => {
    const safety = new SafetyCandidatesTimeOut();
    const root = new SwiftEngine().search(Board.start(), { depth: 2 });
    const result = new HumanSwiftEngine(new SwiftEngine(), safety).search(Board.start(), options);
    expect(safety.calls).toBeGreaterThan(1);
    expect(result.move?.uci()).toBe(root.move?.uci());
    expect(result.decision?.source).toBe("engine-fallback");
  });
});
