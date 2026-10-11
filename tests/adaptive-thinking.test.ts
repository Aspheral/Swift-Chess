import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine } from "../src";
import type { SearchOptions, SearchResult } from "../src/chess/engine";
import {
  planAdaptiveSecondLook, strategicDisagreement,
  type SecondLookEvidence,
  type SwiftSecondLookReason,
} from "../src/chess/adaptive-thinking";

const base: SecondLookEvidence = {
  legalMoves: 26,
  historyLength: 22,
  inCheck: false,
  searchDepth: 6,
  baseTimeMs: 850,
  result: { depth: 6, score: 30, stability: { scoreSwingCp: 9, moveChanged: false, interrupted: false } },
  profile: { tacticalPressure: 0.02, practicalPressure: 0.12 },
  mind: {
    setbacks: 0,
    opponent: { aggression: 0.1, exchangeSeeking: 0, pawnActivity: 0.4, observedMoves: 4 },
  },
  candidates: [
    { score: 16, ideaKinds: ["develop"] },
    { score: 4, ideaKinds: ["develop"] },
  ],
};

describe("Adaptive serious thinking", () => {
  const config = { maxExtraMs: 1600, extraDepth: 2 };

  it("keeps familiar, settled positions quick and never extends without permission", () => {
    expect(planAdaptiveSecondLook(base, config)).toBeNull();
    expect(planAdaptiveSecondLook({ ...base, historyLength: 0 }, config)).toBeNull();
    expect(planAdaptiveSecondLook({ ...base, result: {
      ...base.result, stability: { scoreSwingCp: 120, moveChanged: true, interrupted: false },
    } }, false)).toBeNull();
  });

  it("recognizes when completed search iterations disagree", () => {
    const change = { ...base, result: {
      ...base.result,
      stability: { scoreSwingCp: 90, moveChanged: true, interrupted: false },
    } };
    const plan = planAdaptiveSecondLook(change, config);
    expect(plan?.reason).toBe("search-shift");
    expect(plan?.depth).toBe(8);
    expect(plan?.timeMs).toBeGreaterThan(400);
    expect(plan?.timeMs).toBeLessThanOrEqual(1600);
  });

  it("treats real king danger and practical pressure as serious", () => {
    const danger = planAdaptiveSecondLook({
      ...base, inCheck: true, profile: { tacticalPressure: 0.25, practicalPressure: 0.3 },
    }, config);
    expect(danger?.reason).toBe("king-danger");
    const pressure = planAdaptiveSecondLook({
      ...base, profile: { tacticalPressure: 0.05, practicalPressure: 0.76 },
    }, config);
    expect(pressure?.reason).toBe("serious-position");
  });

  it("allocates time to close moves with incompatible strategic ideas", () => {
    const candidates: SecondLookEvidence["candidates"] = [
      { score: 16, ideaKinds: ["pawn-break"] },
      { score: 15, ideaKinds: ["defend"] },
    ];
    expect(strategicDisagreement(candidates)).toBeGreaterThan(0.78);
    expect(strategicDisagreement([
      { score: 16, ideaKinds: ["pawn-break"] },
      { score: 15, ideaKinds: ["pawn-break"] },
    ])).toBe(0);
    const plan = planAdaptiveSecondLook({ ...base, candidates }, config);
    expect(plan?.reason).toBe("competing-plans");
    expect(plan?.depth).toBe(7);
  });

  it("never stalls a forced move, a confirmed mate or an analysis with no budget", () => {
    const danger = { ...base, inCheck: true };
    expect(planAdaptiveSecondLook({ ...danger, legalMoves: 1 }, config)).toBeNull();
    expect(planAdaptiveSecondLook({ ...danger, result: { ...base.result, score: 99_990 } }, config)).toBeNull();
    expect(planAdaptiveSecondLook(danger, { maxExtraMs: 0 })).toBeNull();
  });

  it("re-searches without losing the first complete answer if deeper work times out", () => {
    class InterruptedSecondSearch extends SwiftEngine {
      requested: number[] = [];
      override search(board: Board, options: SearchOptions = {}): SearchResult {
        this.requested.push(options.depth ?? 4);
        if (this.requested.length > 1) {
          const shallow = super.search(board, { depth: 1 });
          return { ...shallow, depth: 0, score: -5000 };
        }
        const initial = super.search(board, { depth: 2 });
        return { ...initial, stability: { scoreSwingCp: 80, moveChanged: true, interrupted: false } };
      }
    }
    const underlying = new InterruptedSecondSearch();
    const reasons: SwiftSecondLookReason[] = [];
    const result = new HumanSwiftEngine(underlying).search(Board.start(), {
      depth: 2,
      safetyDepth: 2,
      ponderDepth: 2,
      tacticalSearchDepth: 0,
      safetyCandidateLimit: 2,
      concreteCandidateLimit: 4,
      randomness: 0,
      errorBudget: 0.02,
      adaptiveThinking: { maxExtraMs: 450, extraDepth: 2 },
      onSecondLook: (reason) => reasons.push(reason),
    });
    expect(underlying.requested).toEqual([2, 4]);
    expect(reasons).toEqual(["search-shift"]);
    expect(result.depth).toBe(2);
    expect(result.secondLook?.improvedDepth).toBe(false);
    expect(result.move).not.toBeNull();
    expect(Board.start().legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
  });
});
