import { Board, Move } from "./board";
import { Game } from "./game";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { HumanErrorProfile, humanErrorProfile, selectHumanMove, HumanSelectionOptions } from "./human";
import { SwiftOpening, openingBookMove } from "./openings";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  safetyMargin?: number;
  safetyDepth?: number;
  moveHistory?: string[];
  positionHistoryKeys?: string[];
}

export interface HumanSearchResult extends SearchResult {
  humanCandidates: CandidateScore[];
  humanProfile?: HumanErrorProfile;
  opening?: SwiftOpening;
}

export class HumanSwiftEngine {
  private readonly engine: SwiftEngine;
  private readonly safetyEngine: SwiftEngine;

  constructor(engine = new SwiftEngine()) {
    this.engine = engine;
    this.safetyEngine = new SwiftEngine();
  }

  search(board: Board, options: HumanEngineOptions = {}): HumanSearchResult {
    const technicalEndgame = this.isTechnicalEndgame(board);
    const searchDepth = this.positionSearchDepth(board, options.depth ?? 4);
    const result = this.engine.search(board, { ...options, depth: searchDepth });
    if (!result.move) return { ...result, humanCandidates: [] };

    const history = options.moveHistory ?? options.history ?? [];
    const safetyMargin = Math.max(0, options.safetyMargin ?? (technicalEndgame ? 25 : 60));
    const safetyDepth = Math.max(1, Math.min(4, Math.floor(options.safetyDepth ?? (technicalEndgame ? 4 : 2))));
    const generated = scoreCandidates(board);
    const baseErrorBudget = technicalEndgame ? Math.min(options.errorBudget ?? 0.35, 0.08) : (options.errorBudget ?? 0.35);
    const profile = humanErrorProfile(board, baseErrorBudget);
    const baseline = this.childSearchScore(board, result.move, safetyDepth);
    const tacticalMargin = this.positionSafetyMargin(safetyMargin, profile);

    const book = openingBookMove(board, options.seed ?? Date.now(), history);
    if (book && !this.wouldRepeatPosition(board, book.move, options.positionHistoryKeys ?? [])) {
      const bookSafe = this.isSafeCandidate(board, book.move, baseline, tacticalMargin, safetyDepth);
      if (bookSafe) {
        return {
          ...result,
          move: book.move,
          pv: result.pv?.length ? [book.move, ...result.pv.slice(1)] : [book.move],
          humanCandidates: generated.scores.filter((candidate) => candidate.move.uci() === book.move.uci()),
          humanProfile: profile,
          opening: book.opening,
        };
      }
    }

    const safe = generated.scores.filter((candidate) =>
      this.isSafeCandidate(board, candidate.move, baseline, tacticalMargin, safetyDepth),
    );

    if (!safe.length) {
      return { ...result, humanCandidates: generated.scores.slice(0, options.candidateLimit ?? 6), humanProfile: profile };
    }

    const historyKeys = options.positionHistoryKeys ?? [];
    const nonRepeatingSafe = safe.filter((candidate) => !this.wouldRepeatPosition(board, candidate.move, historyKeys));
    const allNonRepeating = generated.scores.filter((candidate) => !this.wouldRepeatPosition(board, candidate.move, historyKeys));
    const repetitionSafe = nonRepeatingSafe.length ? nonRepeatingSafe : allNonRepeating;
    const movementPool = repetitionSafe.length ? repetitionSafe : safe;
    const nonBacktracking = movementPool.filter((candidate) => !this.isMechanicalBacktrack(board, candidate.move, history));
    const movementSafe = nonBacktracking.length ? nonBacktracking : movementPool;

    const selected = selectHumanMove(board, {
      candidateLimit: Math.min(options.candidateLimit ?? 6, movementSafe.length),
      randomness: technicalEndgame ? 0 : options.randomness,
      riskTolerance: technicalEndgame ? 0.2 : options.riskTolerance,
      errorBudget: baseErrorBudget,
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

  private positionSearchDepth(board: Board, requested: number): number {
    const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "").length;
    if (pieces <= 6) return Math.max(5, Math.floor(requested));
    if (board.isInCheck(board.toFEN().split(/\s+/)[1] as "w" | "b")) return Math.max(4, Math.floor(requested));
    return Math.max(1, Math.floor(requested));
  }

  private isTechnicalEndgame(board: Board): boolean {
    const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "");
    const nonKings = pieces.replace(/[kK]/g, "");
    const queens = (nonKings.match(/[qQ]/g) ?? []).length;
    const rooks = (nonKings.match(/[rR]/g) ?? []).length;
    return pieces.length <= 6 || (queens + rooks > 0 && pieces.length <= 8 && !/[pP]/.test(nonKings));
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

  private isMechanicalBacktrack(board: Board, move: Move, history: string[]): boolean {
    if (move.castle || move.enPassant || board.pieceAt(move.to)) return false;
    const piece = board.pieceAt(move.from);
    if (!piece || piece[1] === "p") return false;
    const from = move.uci().slice(0, 2);
    for (let index = history.length - 3; index >= Math.max(0, history.length - 12); index -= 2) {
      const previous = history[index];
      if (!previous) continue;
      if (previous.slice(2, 4) === from) return true;
    }
    return false;
  }
}
