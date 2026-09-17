import { Board, Move } from "./board";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { HumanErrorProfile, humanErrorProfile, selectHumanMove, HumanSelectionOptions } from "./human";
import { SwiftOpening, openingBookMove } from "./openings";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  /** Maximum search score loss, in centipawns, allowed from the engine move. */
  safetyMargin?: number;
  /** Shallow reply-search depth used to reject tactical blunders. */
  safetyDepth?: number;
}

export interface HumanSearchResult extends SearchResult {
  humanCandidates: CandidateScore[];
  humanProfile?: HumanErrorProfile;
  opening?: SwiftOpening;
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

    const book = openingBookMove(board, options.seed ?? Date.now());
    if (book) {
      return {
        ...result,
        move: book.move,
        pv: result.pv?.length ? [book.move, ...result.pv.slice(1)] : [book.move],
        humanCandidates: [],
        opening: book.opening,
      };
    }

    const safetyMargin = Math.max(0, options.safetyMargin ?? 60);
    const safetyDepth = Math.max(1, Math.min(3, Math.floor(options.safetyDepth ?? 2)));
    const generated = scoreCandidates(board);
    const profile = humanErrorProfile(board, options.errorBudget ?? 0.35);
    const baseline = this.childSearchScore(board, result.move, safetyDepth);
    const tacticalMargin = this.positionSafetyMargin(safetyMargin, profile);
    const safe = generated.scores.filter((candidate) =>
      this.isSafeCandidate(board, candidate.move, baseline, tacticalMargin, safetyDepth),
    );

    if (!safe.length) {
      return {
        ...result,
        humanCandidates: generated.scores.slice(0, options.candidateLimit ?? 6),
        humanProfile: profile,
      };
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
      return { ...result, humanCandidates: safe, humanProfile: selected.profile ?? profile };
    }

    const pv = result.pv ?? [];
    return {
      ...result,
      move: selectedMove,
      pv: pv.length ? [selectedMove, ...pv.slice(1)] : [selectedMove],
      humanCandidates: safe,
      humanProfile: selected.profile ?? profile,
    };
  }

  evaluate(board: Board): number {
    return this.engine.evaluate(board);
  }

  private childSearchScore(board: Board, move: Move, depth: number): number {
    const child = board.makeMove(move);
    return -this.safetyEngine.search(child, { depth }).score;
  }

  private positionSafetyMargin(baseMargin: number, profile: HumanErrorProfile): number {
    const pressure = profile.tacticalPressure * 0.65 + profile.practicalPressure * 0.35;
    return Math.max(0, baseMargin * (1 - pressure));
  }

  private isSafeCandidate(board: Board, move: Move, baseline: number, margin: number, depth: number): boolean {
    const child = board.makeMove(move);
    if (!child.isCheckmate()) {
      const opponent = child.toFEN().split(/\s+/)[1] as "w" | "b";
      if (child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate())) return false;
      if (child.isInCheck(opponent) && child.legalMoves().length === 0) return false;
    }
    return -this.safetyEngine.search(child, { depth }).score >= baseline - margin;
  }
}
