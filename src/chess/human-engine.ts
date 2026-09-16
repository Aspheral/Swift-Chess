import { Board, Move } from "./board";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { selectHumanMove, HumanSelectionOptions } from "./human";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  /** Maximum static-evaluation loss, in centipawns, allowed from the engine move. */
  safetyMargin?: number;
}

export interface HumanSearchResult extends SearchResult {
  humanCandidates: CandidateScore[];
}

/**
 * Adds human-style choice to Swift without replacing tactical search.
 * The search engine establishes a safe principal move first; human selection
 * may choose another scored candidate only when its static evaluation stays
 * within the configured safety margin.
 */
export class HumanSwiftEngine {
  private readonly engine: SwiftEngine;

  constructor(engine = new SwiftEngine()) {
    this.engine = engine;
  }

  search(board: Board, options: HumanEngineOptions = {}): HumanSearchResult {
    const result = this.engine.search(board, options);
    if (!result.move) return { ...result, humanCandidates: [] };

    const safetyMargin = Math.max(0, options.safetyMargin ?? 60);
    const generated = scoreCandidates(board);
    const baseline = this.childScore(board, result.move);
    const safe = generated.scores.filter((candidate) =>
      this.isSafeCandidate(board, candidate.move, baseline, safetyMargin),
    );

    if (!safe.length) {
      return {
        ...result,
        humanCandidates: generated.scores.slice(0, options.candidateLimit ?? 6),
      };
    }

    const selected = selectHumanMove(board, {
      candidateLimit: Math.min(options.candidateLimit ?? 6, safe.length),
      randomness: options.randomness,
      riskTolerance: options.riskTolerance,
    });
    const selectedMove = selected.move;
    const safeKeys = new Set(safe.map((candidate) => candidate.move.uci()));
    if (!selectedMove || !safeKeys.has(selectedMove.uci())) {
      return { ...result, humanCandidates: safe };
    }

    const pv = result.pv ?? [];
    return {
      ...result,
      move: selectedMove,
      pv: pv.length ? [selectedMove, ...pv.slice(1)] : [selectedMove],
      humanCandidates: safe,
    };
  }

  evaluate(board: Board): number {
    return this.engine.evaluate(board);
  }

  private childScore(board: Board, move: Move): number {
    return -this.engine.evaluate(board.makeMove(move));
  }

  private isSafeCandidate(board: Board, move: Move, baseline: number, margin: number): boolean {
    const score = this.childScore(board, move);
    return score >= baseline - margin;
  }
}
