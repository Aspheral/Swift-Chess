import { Board, Move } from "./board";
import { Game } from "./game";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { HumanErrorProfile, humanErrorProfile, selectHumanMove, HumanSelectionOptions } from "./human";
import { SwiftOpening, openingBookMove } from "./openings";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  /** Maximum search score loss, in centipawns, allowed from the engine move. */
  safetyMargin?: number;
  /** Shallow reply-search depth used to reject tactical blunders. */
  safetyDepth?: number;
  /** UCI moves already played in the current game. */
  moveHistory?: string[];
  /** Repetition identities already encountered, including the initial position. */
  positionHistoryKeys?: string[];
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

    const history = options.moveHistory ?? options.history ?? [];
    const book = openingBookMove(board, options.seed ?? Date.now(), history);
    if (book && !this.wouldRepeatPosition(board, book.move, options.positionHistoryKeys ?? [])) {
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

    const nonRepeating = safe.filter((candidate) => !this.wouldRepeatPosition(board, candidate.move, options.positionHistoryKeys ?? []));
    const repetitionSafe = nonRepeating.length ? nonRepeating : safe;

    const nonBacktracking = repetitionSafe.filter((candidate) => !this.isMechanicalBacktrack(candidate.move, history));
    const movementSafe = nonBacktracking.length ? nonBacktracking : repetitionSafe;

    const selected = selectHumanMove(board, {
      candidateLimit: Math.min(options.candidateLimit ?? 6, movementSafe.length),
      randomness: options.randomness,
      riskTolerance: options.riskTolerance,
      errorBudget: options.errorBudget,
      seed: options.seed,
      initiative: options.initiative,
      simplification: options.simplification,
      development: options.development,
      pawnBreaks: options.pawnBreaks,
      history,
      candidates: movementSafe,
    });
    const selectedMove = selected.move;
    const safeKeys = new Set(movementSafe.map((candidate) => candidate.move.uci()));
    if (!selectedMove || !safeKeys.has(selectedMove.uci())) {
      return { ...result, humanCandidates: movementSafe, humanProfile: selected.profile ?? profile };
    }

    const pv = result.pv ?? [];
    return {
      ...result,
      move: selectedMove,
      pv: pv.length ? [selectedMove, ...pv.slice(1)] : [selectedMove],
      humanCandidates: movementSafe,
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

  private wouldRepeatPosition(board: Board, move: Move, positionHistoryKeys: string[]): boolean {
    if (!positionHistoryKeys.length) return false;
    const child = board.makeMove(move);
    const key = Game.positionKey(child);
    return positionHistoryKeys.filter((entry) => entry === key).length >= 2;
  }

  private isMechanicalBacktrack(move: Move, history: string[]): boolean {
    const from = move.uci().slice(0, 2);
    const to = move.uci().slice(2, 4);
    for (let index = history.length - 2; index >= Math.max(0, history.length - 10); index -= 2) {
      const previous = history[index];
      if (!previous) continue;
      if (previous.slice(0, 2) === to && previous.slice(2, 4) === from) return true;
    }
    return false;
  }
}
