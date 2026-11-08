import { describe, expect, it } from "vitest";
import { Board, SwiftEngine, findTacticalPriority } from "../src";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

const active = Board.fromFEN("r3k2r/ppp2ppp/2n5/3q4/4P3/2N5/PPP2PPP/R2QK2R w KQkq - 0 10");

class TimingWitness extends SwiftEngine {
  readonly requests: SearchOptions[] = [];
  override search(board: Board, options: SearchOptions = {}): SearchResult {
    this.requests.push(options);
    return { move: board.legalMoves()[0] ?? null, depth: 0, score: 0, nodes: 1 };
  }
}

describe("timed tactical backup search", () => {
  it("gives an interrupted root search a bounded follow-up budget", () => {
    const witness = new TimingWitness();
    findTacticalPriority(active, witness, undefined, 4, 120);
    expect(witness.requests).toHaveLength(1);
    expect(witness.requests[0]).toMatchObject({ depth: 4, timeMs: 120 });
  });

  it("does not repeat a tactical search after a completed adequate root search", () => {
    const witness = new TimingWitness();
    const principal = active.legalMoves()[0];
    findTacticalPriority(active, witness,
      { move: principal, depth: 6, score: 0, nodes: 2500 }, 4, 120);
    expect(witness.requests).toHaveLength(0);
  });

  it("uses a positive budget even when only a few milliseconds are supplied", () => {
    const witness = new TimingWitness();
    findTacticalPriority(active, witness, undefined, 3, 0);
    expect(witness.requests[0].timeMs).toBe(1);
  });
});
