import { Board } from "./board";
import { PvsSwiftEngine } from "./pvs";
import type { SearchResult } from "./engine";

export interface BenchmarkPosition {
  name: string;
  fen: string;
  depth: number;
  expectedMove?: string;
}

export interface BenchmarkResult extends BenchmarkPosition {
  result: SearchResult;
  elapsedMs: number;
}

/** Small deterministic search suite for regression tracking.
 *
 * The suite deliberately records engine output instead of assigning an Elo
 * score. Node counts and timings are useful for comparing builds, while the
 * expected move is only used where the position has an unambiguous tactical
 * answer covered by the existing regression suite.
 */
export const SWIFT_BENCHMARKS: BenchmarkPosition[] = [
  {
    name: "start-depth-3",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    depth: 3,
  },
  {
    name: "mate-in-one",
    fen: "6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1",
    depth: 2,
    expectedMove: "g3b8",
  },
  {
    name: "kiwipete-depth-3",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    depth: 3,
  },
];

export function runSwiftBenchmarks(): BenchmarkResult[] {
  return SWIFT_BENCHMARKS.map((position) => {
    const board = Board.fromFEN(position.fen);
    const engine = new PvsSwiftEngine();
    const started = Date.now();
    const result = engine.search(board, { depth: position.depth });
    return { ...position, result, elapsedMs: Date.now() - started };
  });
}
