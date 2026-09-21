import { Board, Move } from "./board";
import { Game } from "./game";
import { SearchOptions, SearchResult, SwiftEngine } from "./engine";
import { CandidateScore, scoreCandidates } from "./scoring";
import { generateIdeas } from "./ideas";
import { HumanErrorProfile, humanErrorProfile, selectHumanMove, HumanSelectionOptions } from "./human";
import { SwiftOpening, openingBookMove } from "./openings";
import { findTacticalPriority, isOwnQueenUnderAttack } from "./fast-tactics";
import { deriveSeed } from "./random";
import { SwiftMind, SwiftMindSnapshot } from "./mind";

export interface HumanEngineOptions extends SearchOptions, HumanSelectionOptions {
  safetyMargin?: number;
  safetyDepth?: number;
  /** Extra consequence search after a candidate move, before Swift commits. */
  ponderDepth?: number;
  /** Maximum number of generated candidates to consequence-check. */
  safetyCandidateLimit?: number;
  /** Maximum number of strategically-prioritized candidates to concretely score. */
  concreteCandidateLimit?: number;
  /** Cap the tactical mate search; 0 keeps immediate/SEE priorities only. */
  tacticalSearchDepth?: number;
  /** Optional time budget for the consequence-search safety checks. */
  safetyTimeMs?: number;
  /** Optional time budget for the baseline ponder search. */
  ponderTimeMs?: number;
  moveHistory?: string[];
  positionHistoryKeys?: string[];
}

export type SwiftDecisionSource = "tactical" | "opening-book" | "human-plan" | "engine-fallback" | "strict";

export interface SwiftDecisionTrace {
  source: SwiftDecisionSource;
  engineMove: string | null;
  selectedMove: string | null;
  engineAgreement: boolean;
  reasons: string[];
}

export interface HumanSearchResult extends SearchResult {
  humanCandidates: CandidateScore[];
  humanProfile?: HumanErrorProfile;
  opening?: SwiftOpening;
  mind?: SwiftMindSnapshot;
  decision?: SwiftDecisionTrace;
}

export class HumanSwiftEngine {
  private readonly engine: SwiftEngine;
  private readonly safetyEngine: SwiftEngine;
  private readonly mind: SwiftMind;

  constructor(engine = new SwiftEngine()) {
    this.engine = engine;
    this.safetyEngine = new SwiftEngine();
    this.mind = new SwiftMind();
  }

  search(board: Board, options: HumanEngineOptions = {}): HumanSearchResult {
    const history = options.moveHistory ?? options.history ?? [];
    const technicalEndgame = this.isTechnicalEndgame(board);
    const queenUnderAttack = isOwnQueenUnderAttack(board);
    const baseErrorBudget = technicalEndgame
      ? Math.min(options.errorBudget ?? 0.35, 0.08)
      : (options.errorBudget ?? 0.35);
    const profile = humanErrorProfile(board, baseErrorBudget);

    // Swift forms a position-level view and a continuing plan before concrete
    // search gets to veto unsafe ideas. This is the core human-first ordering.
    const ideaGeneration = generateIdeas(board);
    const observedMind = this.mind.observe(board, ideaGeneration, profile, history);
    const generated = scoreCandidates(board, options.concreteCandidateLimit, ideaGeneration);

    const searchDepth = this.positionSearchDepth(board, options.depth ?? 4, queenUnderAttack);
    const result = this.engine.search(board, { ...options, depth: searchDepth });
    if (!result.move) {
      return {
        ...result,
        humanCandidates: [],
        humanProfile: profile,
        mind: observedMind,
        decision: {
          source: "engine-fallback",
          engineMove: null,
          selectedMove: null,
          engineAgreement: true,
          reasons: ["No legal move was available."],
        },
      };
    }

    const engineMoveUci = result.move.uci();
    const decision = (
      move: Move,
      source: SwiftDecisionSource,
      reasons: string[],
      humanCandidates: CandidateScore[],
      extra: Partial<HumanSearchResult> = {},
    ): HumanSearchResult => {
      const mind = this.mind.recordDecision(
        move.uci(),
        reasons[0] ?? `Continue the plan to ${this.mind.planDescription()}.`,
      );
      const pv = result.pv ?? [];
      return {
        ...result,
        ...extra,
        move,
        pv: pv.length ? [move, ...pv.slice(1)] : [move],
        humanCandidates,
        humanProfile: profile,
        mind,
        decision: {
          source,
          engineMove: engineMoveUci,
          selectedMove: move.uci(),
          engineAgreement: move.uci() === engineMoveUci,
          reasons,
        },
      };
    };

    const tacticalPriority = findTacticalPriority(
      board,
      this.engine,
      result,
      options.tacticalSearchDepth ?? 5,
    );
    if (tacticalPriority) {
      return decision(
        tacticalPriority.move,
        "tactical",
        ["A forcing tactical priority overrides the longer-term plan."],
        [],
      );
    }

    if (options.strictBestPlay) {
      const strictBook = openingBookMove(board, options.seed ?? Date.now(), history);
      if (
        strictBook &&
        history.length <= 5 &&
        !this.wouldRepeatPosition(board, strictBook.move, options.positionHistoryKeys ?? [])
      ) {
        return decision(
          strictBook.move,
          "strict",
          ["The strict opening repertoire selected this move."],
          [],
          { opening: strictBook.opening },
        );
      }
      return decision(
        result.move,
        "strict",
        ["Strict mode follows the concrete principal move."],
        [],
      );
    }

    const safetyMargin = Math.max(0, options.safetyMargin ?? (technicalEndgame ? 25 : 60));
    const safetyDepth = Math.max(1, Math.min(4, Math.floor(options.safetyDepth ?? (technicalEndgame ? 4 : 3))));

    const generatedEngineCandidate = generated.scores.find(
      (candidate) => candidate.move.uci() === engineMoveUci,
    );
    const engineCandidate: CandidateScore = generatedEngineCandidate
      ? {
          ...generatedEngineCandidate,
          score: result.score,
          reasons: [
            ...generatedEngineCandidate.reasons,
            "Concrete search also selected this move as its principal variation.",
          ],
        }
      : {
          move: result.move,
          score: result.score,
          ideaKinds: ["tactical"],
          reasons: ["Concrete search selected this move as its principal variation."],
        };

    // Human plans choose which ideas deserve calculation time. The raw engine
    // move is guaranteed a seat at the table, but no longer automatically sits
    // at the head of it.
    const planned = [...generated.scores]
      .sort((a, b) =>
        (b.score + this.mind.planBias(b.ideaKinds)) -
        (a.score + this.mind.planBias(a.ideaKinds)),
      )
      .map((candidate) => candidate.move.uci() === engineMoveUci ? engineCandidate : candidate);
    if (!planned.some((candidate) => candidate.move.uci() === engineMoveUci)) {
      planned.push(engineCandidate);
    }
    const candidateScores = planned;

    const ponderDepth = Math.max(
      safetyDepth,
      Math.min(5, Math.floor(options.ponderDepth ?? (profile.tacticalPressure > 0.2 ? safetyDepth + 1 : safetyDepth))),
    );
    const baseline = this.childSearchScore(board, result.move, ponderDepth, options.ponderTimeMs);
    const tacticalMargin = this.positionSafetyMargin(safetyMargin, profile);

    const book = openingBookMove(board, options.seed ?? Date.now(), history);
    if (book && !this.wouldRepeatPosition(board, book.move, options.positionHistoryKeys ?? [])) {
      const bookMargin = history.length < 8
        ? Math.max(tacticalMargin, 90)
        : history.length < 12
          ? Math.max(tacticalMargin, 65)
          : tacticalMargin;
      const bookSafe = history.length <= 1 ||
        this.isSafeCandidate(board, book.move, baseline, bookMargin, ponderDepth, options.safetyTimeMs);
      if (bookSafe) {
        const bookCandidate = candidateScores.find((candidate) => candidate.move.uci() === book.move.uci()) ?? {
          move: book.move,
          score: result.score,
          ideaKinds: ["develop"] as CandidateScore["ideaKinds"],
          reasons: ["Swift's opening repertoire selected this move."],
        };
        return decision(
          book.move,
          "opening-book",
          bookCandidate.reasons,
          [bookCandidate],
          { opening: book.opening },
        );
      }
    }

    const safetyLimit = Math.max(1, Math.floor(options.safetyCandidateLimit ?? candidateScores.length));
    const safetyCandidates = candidateScores.slice(0, safetyLimit);
    if (!safetyCandidates.some((candidate) => candidate.move.uci() === engineMoveUci)) {
      if (safetyCandidates.length >= safetyLimit) safetyCandidates[safetyCandidates.length - 1] = engineCandidate;
      else safetyCandidates.push(engineCandidate);
    }

    const safe = safetyCandidates
      .map((candidate) =>
        this.assessCandidate(
          board,
          candidate,
          baseline,
          tacticalMargin,
          ponderDepth,
          options.safetyTimeMs,
          candidate.move.uci() === engineMoveUci,
        ),
      )
      .filter((candidate): candidate is CandidateScore => candidate !== null);

    if (!safe.length) {
      this.mind.recordSetback("The current plan produced no candidate that survived concrete verification.");
      return decision(
        result.move,
        "engine-fallback",
        ["No human-plan candidate survived the concrete safety check."],
        candidateScores.slice(0, options.candidateLimit ?? 6),
      );
    }

    const historyKeys = options.positionHistoryKeys ?? [];
    const nonRepeatingSafe = safe.filter((candidate) => !this.wouldRepeatPosition(board, candidate.move, historyKeys));
    const repetitionSafe = nonRepeatingSafe.length ? nonRepeatingSafe : safe;
    const naturalSafe = repetitionSafe.filter((candidate) => !this.burnsCastlingRightEarly(board, candidate.move, history));
    const movementPool = naturalSafe.length ? naturalSafe : repetitionSafe;
    const nonBacktracking = movementPool.filter((candidate) => !this.isMechanicalBacktrack(board, candidate.move, history));
    const movementSafe = nonBacktracking.length ? nonBacktracking : movementPool;

    const selected = selectHumanMove(board, {
      candidateLimit: Math.min(options.candidateLimit ?? 6, movementSafe.length),
      randomness: technicalEndgame ? 0 : options.randomness,
      riskTolerance: technicalEndgame ? 0.2 : options.riskTolerance,
      errorBudget: baseErrorBudget,
      seed: options.seed === undefined ? undefined : deriveSeed(options.seed, history.length),
      initiative: options.initiative,
      simplification: options.simplification,
      development: options.development,
      pawnBreaks: options.pawnBreaks,
      history,
      mind: observedMind,
      candidates: movementSafe,
      strictBestPlay: options.strictBestPlay,
    });
    const selectedMove = selected.move;
    const safeKeys = new Set(movementSafe.map((candidate) => candidate.move.uci()));
    if (!selectedMove || !safeKeys.has(selectedMove.uci())) {
      this.mind.recordSetback("The human decision layer could not produce a verified continuation.");
      return decision(
        result.move,
        "engine-fallback",
        ["Human selection did not return a verified candidate."],
        movementSafe,
      );
    }

    const selectedCandidate = movementSafe.find((candidate) => candidate.move.uci() === selectedMove.uci());
    if (
      observedMind.plan &&
      selectedCandidate &&
      !selectedCandidate.ideaKinds.includes(observedMind.plan)
    ) {
      this.mind.recordSetback(
        "The current plan had no convincing continuation, so Swift changed course for this move.",
      );
    }
    const reasons = selectedCandidate?.reasons.length
      ? selectedCandidate.reasons
      : [`This move supports Swift's continuing plan to ${this.mind.planDescription()}.`];

    return decision(
      selectedMove,
      "human-plan",
      reasons,
      movementSafe,
    );
  }

  evaluate(board: Board): number {
    return this.engine.evaluate(board);
  }

  private positionSearchDepth(board: Board, requested: number, queenUnderAttack = false): number {
    const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "").length;
    if (pieces <= 6) return Math.max(5, Math.floor(requested));
    if (queenUnderAttack) return Math.max(5, Math.floor(requested) + 2);
    if (board.isInCheck(board.turn())) return Math.max(4, Math.floor(requested));
    return Math.max(1, Math.floor(requested));
  }

  private isTechnicalEndgame(board: Board): boolean {
    const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "");
    const nonKings = pieces.replace(/[kK]/g, "");
    const queens = (nonKings.match(/[qQ]/g) ?? []).length;
    const rooks = (nonKings.match(/[rR]/g) ?? []).length;
    return pieces.length <= 6 || (queens + rooks > 0 && pieces.length <= 8 && !/[pP]/.test(nonKings));
  }

  private childSearchScore(board: Board, move: Move, depth: number, timeMs?: number): number {
    const child = board.makeMove(move);
    return -this.safetyEngine.search(child, { depth, timeMs: this.optionsTimeMs(timeMs) }).score;
  }

  private optionsTimeMs(value?: number): number | undefined {
    return value !== undefined && value > 0 ? Math.floor(value) : undefined;
  }

  private positionSafetyMargin(baseMargin: number, profile: HumanErrorProfile): number {
    const pressure = profile.tacticalPressure * 0.65 + profile.practicalPressure * 0.35;
    return Math.max(0, baseMargin * (1 - pressure));
  }

  private assessCandidate(
    board: Board,
    candidate: CandidateScore,
    baseline: number,
    margin: number,
    depth: number,
    timeMs?: number,
    preservePrincipalScore = false,
  ): CandidateScore | null {
    const child = board.makeMove(candidate.move);
    if (!child.isCheckmate()) {
      const opponent = child.turn();
      const replies = child.legalMoves();
      if (replies.some((reply) => child.makeMove(reply).isCheckmate())) return null;
      if (child.isInCheck(opponent) && replies.length === 0) return null;
    }

    const concreteScore = -this.safetyEngine.search(child, {
      depth,
      timeMs: this.optionsTimeMs(timeMs),
    }).score;
    if (concreteScore < baseline - margin) return null;

    return {
      ...candidate,
      score: preservePrincipalScore ? candidate.score : concreteScore,
      reasons: [...candidate.reasons, "Concrete consequence search kept this move inside Swift's safety margin."],
    };
  }

  private isSafeCandidate(board: Board, move: Move, baseline: number, margin: number, depth: number, timeMs?: number): boolean {
    const child = board.makeMove(move);
    if (!child.isCheckmate()) {
      const opponent = child.turn();
      if (child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate())) return false;
      if (child.isInCheck(opponent) && child.legalMoves().length === 0) return false;
    }
    return -this.safetyEngine.search(child, { depth, timeMs: this.optionsTimeMs(timeMs) }).score >= baseline - margin;
  }

  private wouldRepeatPosition(board: Board, move: Move, positionHistoryKeys: string[]): boolean {
    if (!positionHistoryKeys.length) return false;
    const child = board.makeMove(move);
    const key = Game.positionKey(child);
    return positionHistoryKeys.filter((entry) => entry === key).length >= 2;
  }

  private burnsCastlingRightEarly(board: Board, move: Move, history: string[]): boolean {
    if (history.length >= 20 || move.castle || move.enPassant || board.pieceAt(move.to)) return false;
    const piece = board.pieceAt(move.from);
    if (!piece || piece[1] !== "r") return false;

    const side = piece[0] as "w" | "b";
    const kingHome = side === "w" ? 4 : 60;
    if (board.pieceAt(kingHome) !== `${side}k`) return false;

    const castling = board.toFEN().split(/\s+/)[2];
    const kingRook = side === "w" ? 7 : 63;
    const queenRook = side === "w" ? 0 : 56;
    if (move.from === kingRook) return side === "w" ? castling.includes("K") : castling.includes("k");
    if (move.from === queenRook) return side === "w" ? castling.includes("Q") : castling.includes("q");
    return false;
  }

  private isMechanicalBacktrack(board: Board, move: Move, history: string[]): boolean {
    if (move.castle || move.enPassant || board.pieceAt(move.to)) return false;
    const piece = board.pieceAt(move.from);
    if (!piece || piece[1] === "p") return false;
    const from = move.uci().slice(0, 2);
    for (let index = history.length - 2; index >= Math.max(0, history.length - 12); index -= 2) {
      const previous = history[index];
      if (!previous) continue;
      if (previous.slice(2, 4) === from) return true;
    }
    return false;
  }
}
