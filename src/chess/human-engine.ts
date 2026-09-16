import { Board, Move } from "./board";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { HumanErrorProfile, selectHumanMove, HumanSelectionOptions } from "./human";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  /** Maximum search score loss, in centipawns, allowed from the engine move. */
  safetyMargin?: number;
  /** Shallow reply-search depth used to reject tactical blunders. */
  safetyDepth?: number;
}

export interface HumanSearchResult extends SearchResult {
  humanCandidates: CandidateScore[];
  humanProfile?: HumanErrorProfile;
}

/** Adds bounded human-style choice without allowing shallow tactical blunders. */
export class HumanSwiftEngine {
  private readonly engine: SwiftEngine;
  private readonly safetyEngine: SwiftEngine;

  constructor(engine = new SwiftEngine()) {
    this.engine = engine;
    this.safetyEngine = new SwiftEngine();
  }

  search(board: Board, options: HumanEngineOptions = {}): HumanSearchResult {
    const result = this.engine.search(board, options);
    if (!result.move) return { ...result, humanCandidates: [] };

    const safetyMargin = Math.max(0, options.safetyMargin ?? 60);
    const safetyDepth = Math.max(1, Math.min(3, Math.floor(options.safetyDepth ?? 2)));
    const generated = scoreCandidates(board);
    const baseline = this.childSearchScore(board, result.move, safetyDepth);
    const safe = generated.scores.filter((candidate) =>
      this.isSafeCandidate(board, candidate.move, baseline, safetyMargin, safetyDepth),
    );

    if (!safe.length) {
      return { ...result, humanCandidates: generated.scores.slice(0, options.candidateLimit ?? 6) };
    }

    const selected = selectHumanMove(board, {
      candidateLimit: Math.min(options.candidateLimit ?? 6, safe.length),
      randomness: options.randomness,
      riskTolerance: options.riskTolerance,
      errorBudget: options.errorBudget,
      seed: options.seed,
      initiative: options.initiative,
      simplification: options.simplification,
      development: options.development,
      pawnBreaks: options.pawnBreaks,
      candidates: safe,
    });
    const selectedMove = selected.move;
    const safeKeys = new Set(safe.map((candidate) => candidate.move.uci()));
    if (!selectedMove || !safeKeys.has(selectedMove.uci())) {
      return { ...result, humanCandidates: safe, humanProfile: selected.profile };
    }

    const pv = result.pv ?? [];
    return {
      ...result,
      move: selectedMove,
      pv: pv.length ? [selectedMove, ...pv.slice(1)] : [selectedMove],
      humanCandidates: safe,
      humanProfile: selected.profile,
    };
  }

  evaluate(board: Board): number {
    return this.engine.evaluate(board);
  }

  private childSearchScore(board: Board, move: Move, depth: number): number {
    const child = board.makeMove(move);
    return -this.safetyEngine.search(child, { depth }).score;
  }

  private isSafeCandidate(board: Board, move: Move, baseline: number, margin: number, depth: number): boolean {
    return this.childSearchScore(board, move, depth) >= baseline - margin;
  }
}
