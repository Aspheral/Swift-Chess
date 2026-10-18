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
import { selectiveCandidateDepths } from "./selective-calculation";
import { AdaptiveThinkingOptions, planAdaptiveSecondLook, SwiftSecondLook, SwiftSecondLookReason } from "./adaptive-thinking";
import { avoidImmediateMajorBlunder, avoidImmediateCheckmate } from "./blunder-guard";
import { avoidShortCheckingMate } from "./mate-threat";

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
  /** Optional in-search deeper calculation when the first answer looks unstable or high-stakes. */
  adaptiveThinking?: AdaptiveThinkingOptions | false;
  onSecondLook?: (reason: SwiftSecondLookReason) => void;
  /** A legal first-pass move the browser can use when the game clock becomes critical. */
  onInitialMove?: (move: Move) => void;
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
  secondLook?: SwiftSecondLook & { initialDepth: number; finalDepth: number; improvedDepth: boolean };
}

export function shouldPreferPlanToBook(mind: SwiftMindSnapshot, historyLength: number): boolean {
  return historyLength >= 6 &&
    mind.plan !== null &&
    mind.planAge >= 2 &&
    mind.confidence >= 0.55 &&
    mind.setbacks === 0;
}

/** Only an exact return to the last square vacated counts as immediate reversal. */
export function isImmediateMoveReversal(uci: string, history: string[]): boolean {
  const previous = history[history.length - 2];
  return !!previous && previous.slice(0, 2) === uci.slice(2, 4) &&
    previous.slice(2, 4) === uci.slice(0, 2);
}

export class HumanSwiftEngine {
  private readonly engine: SwiftEngine;
  private readonly safetyEngine: SwiftEngine;
  private readonly mind: SwiftMind;

  constructor(engine = new SwiftEngine(), safetyEngine = new SwiftEngine()) {
    this.engine = engine;
    this.safetyEngine = safetyEngine;
    this.mind = new SwiftMind();
  }

  search(board: Board, options: HumanEngineOptions = {}): HumanSearchResult {
    const history = options.moveHistory ?? options.history ?? [];
    const technicalEndgame = this.isTechnicalEndgame(board);
    const queenUnderAttack = isOwnQueenUnderAttack(board);
    const baseErrorBudget = technicalEndgame ? Math.min(options.errorBudget ?? 0.35, 0.08) : (options.errorBudget ?? 0.35);
    const profile = humanErrorProfile(board, baseErrorBudget);

    const ideaGeneration = generateIdeas(board);
    const observedMind = this.mind.observe(board, ideaGeneration, profile, history);
    const generated = scoreCandidates(board, options.concreteCandidateLimit, ideaGeneration);

    const searchDepth = this.positionSearchDepth(board, options.depth ?? 4, queenUnderAttack);
    let result = this.engine.search(board, { ...options, depth: searchDepth });
    if (!result.move) {
      return { ...result, humanCandidates: [], humanProfile: profile, mind: observedMind, decision: { source: "engine-fallback", engineMove: null, selectedMove: null, engineAgreement: true, reasons: ["No legal move was available."] } };
    }
    const initialMove = result.move;
    options.onInitialMove?.(initialMove);

    // Search stability is observed only after an initial concrete search. Keep
    // the same SwiftMind observation throughout; rethinking is not another turn.
    const initialDepth = result.depth;
    let secondLook: HumanSearchResult["secondLook"];
    const extension = planAdaptiveSecondLook({
      legalMoves: board.legalMoves().length,
      historyLength: history.length,
      inCheck: board.isInCheck(board.turn()),
      searchDepth,
      baseTimeMs: options.timeMs,
      result,
      profile,
      mind: observedMind,
      candidates: generated.scores,
    }, options.adaptiveThinking);
    if (extension) {
      options.onSecondLook?.(extension.reason);
      const deeper = this.engine.search(board, { depth: extension.depth, timeMs: extension.timeMs, positionHistoryKeys: options.positionHistoryKeys });
      const improvedDepth = !!deeper.move && deeper.depth > result.depth;
      if (improvedDepth) result = deeper;
      secondLook = { ...extension, initialDepth, finalDepth: result.depth, improvedDepth };
    }

    // Preserve a legal root move even if a later search failed to complete.
    const principalMove: Move = result.move ?? initialMove;
    const engineMoveUci = principalMove.uci();
    const decision = (move: Move, source: SwiftDecisionSource, reasons: string[], humanCandidates: CandidateScore[], extra: Partial<HumanSearchResult> = {}): HumanSearchResult => {
      // A short timed search may return at depth zero. Independent SEE of the
      // opponent's immediate legal captures must veto an obvious queen/rook hang
      // even if the human plan, book or principal search initially chose it.
      const finalizesDraw = this.wouldRepeatPosition(board, move, options.positionHistoryKeys ?? []);
      // Never 'save' a piece by changing a move that already ended the game
      // with a legal threefold draw. The follow-up capture cannot happen.
      // Only an actual checkmate on the board is immune from tactical
      // safety overrides. A very high *reported* search score or a claimed
      // forced mate several moves away is not proof that this move cannot
      // hang material or permit an immediate counter-checkmate.
      const checkmatesNow = board.makeMove(move).isCheckmate();
      const proposedGuard = checkmatesNow || finalizesDraw ? null : avoidImmediateMajorBlunder(
        board, move,
        [principalMove, ...humanCandidates.map((candidate) => candidate.move), ...generated.scores.map((candidate) => candidate.move)],
        (position) => this.engine.evaluate(position),
      );
      // A one-square exchange calculation can mistake a sound positional
      // sacrifice for a blunder. In the 200-game audit it even replaced three
      // correctly searched principal moves with losing "safe" alternatives.
      // Deep principal choices must not be replaced without matching-depth
      // evidence that the replacement is actually better. For uncertain
      // shallow searches and human/book overrides, retain the emergency guard.
      const guard = proposedGuard && (
        move.uci() !== engineMoveUci || result.depth < 4 ||
        this.verifyMaterialOverride(board, move, proposedGuard.move, result.depth, options.timeMs)
      ) ? proposedGuard : null;
      const materialSafeMove = guard?.move ?? move;
      // The completed main search should identify mate in one, but a deep
      // reported depth is not a proof of tactical safety. A stale TT result,
      // pruning error, or final human override can still select a losing move.
      // Verify the actual selected move regardless of its apparent depth.
      // Skip only forced wins and immediate terminal draws.
      const requiresMateVerification = !checkmatesNow && !finalizesDraw;
      const mateGuard = requiresMateVerification
        ? avoidImmediateCheckmate(
          board, materialSafeMove,
          [principalMove, ...humanCandidates.map((candidate) => candidate.move),
            ...generated.scores.map((candidate) => candidate.move)],
          (position) => this.engine.evaluate(position),
        )
        : null;
      const mateOneSafeMove = mateGuard?.move ?? materialSafeMove;
      // Final verdict MUST examine the actual move after any book, strategic,
      // material or mate-in-one override. Mate-in-one alone cannot prevent a
      // forced mate in two or three, a source of documented weak games.
      // Only a proven checking sequence may trigger this bounded veto.
      const longerMateGuard = !checkmatesNow && !finalizesDraw
        ? avoidShortCheckingMate(
          board, mateOneSafeMove,
          [principalMove, ...humanCandidates.map((candidate) => candidate.move),
            ...generated.scores.map((candidate) => candidate.move)],
          (position) => this.engine.evaluate(position),
        )
        : null;
      const selectedMove = longerMateGuard?.move ?? mateOneSafeMove;
      const selectedSource: SwiftDecisionSource = guard || mateGuard || longerMateGuard ? "engine-fallback" : source;
      const selectedReasons = [
        ...(longerMateGuard ? [`Tactical safety override: avoided a proven checking mate in ${longerMateGuard.attackerMoves}.`] : []),
        ...(mateGuard ? ["Tactical safety override: rejected an avoidable mate in one."] : []),
        ...(guard ? [`Tactical safety override: avoided an immediate ${guard.originalLoss}cp material loss.`] : []),
        ...reasons,
      ];
      const reportedCandidates = guard && !humanCandidates.some((candidate) => candidate.move.uci() === selectedMove.uci())
        ? [...humanCandidates, generated.scores.find((candidate) => candidate.move.uci() === selectedMove.uci()) ?? {
          move: selectedMove, score: -this.engine.evaluate(board.makeMove(selectedMove)), ideaKinds: ["defend"] as CandidateScore["ideaKinds"], reasons: selectedReasons,
        }]
        : humanCandidates;
      const mind = this.mind.recordDecision(selectedMove.uci(), selectedReasons[0] ?? `Continue the plan to ${this.mind.planDescription()}.`);
      const pv = selectedMove.uci() === engineMoveUci ? (result.pv ?? []) : [];
      return { ...result, ...extra, secondLook, move: selectedMove, pv: pv.length ? [selectedMove, ...pv.slice(1)] : [selectedMove], humanCandidates: reportedCandidates, humanProfile: profile, mind, decision: { source: selectedSource, engineMove: engineMoveUci, selectedMove: selectedMove.uci(), engineAgreement: selectedMove.uci() === engineMoveUci, reasons: selectedReasons } };
    };

    const tacticalPriority = findTacticalPriority(board, this.engine, result, options.tacticalSearchDepth ?? 5);
    if (tacticalPriority) return decision(tacticalPriority.move, "tactical", ["A forcing tactical priority overrides the longer-term plan."], []);

    // The completed root search already compares this guaranteed draw at
    // 0cp with possible wins. Do not let a stylistic opening/plan preference
    // throw away a drawing escape, especially when Swift is defending.
    if (this.wouldRepeatPosition(board, principalMove, options.positionHistoryKeys ?? [])) {
      return decision(principalMove, "engine-fallback",
        ["Recognized a legal threefold repetition; preserving the searched drawing continuation."], []);
    }

    if (options.strictBestPlay) {
      const strictBook = openingBookMove(board, options.seed ?? Date.now(), history);
      if (strictBook && history.length <= 5 && !this.wouldRepeatPosition(board, strictBook.move, options.positionHistoryKeys ?? [])) return decision(strictBook.move, "strict", ["The strict opening repertoire selected this move."], [], { opening: strictBook.opening });
      return decision(principalMove, "strict", ["Strict mode follows the concrete principal move."], []);
    }

    const safetyMargin = Math.max(0, options.safetyMargin ?? (technicalEndgame ? 25 : 60));
    const safetyDepth = Math.max(1, Math.min(4, Math.floor(options.safetyDepth ?? (technicalEndgame ? 4 : 3))));
    const generatedEngineCandidate = generated.scores.find((candidate) => candidate.move.uci() === engineMoveUci);
    const engineCandidate: CandidateScore = generatedEngineCandidate ? { ...generatedEngineCandidate, score: result.score, reasons: [...generatedEngineCandidate.reasons, "Concrete search also selected this move as its principal variation."] } : { move: principalMove, score: result.score, ideaKinds: ["tactical"], reasons: ["Concrete search selected this move as its principal variation."] };

    const planned = [...generated.scores]
      .sort((a, b) => (b.score + this.mind.planBias(b.ideaKinds)) - (a.score + this.mind.planBias(a.ideaKinds)))
      .map((candidate) => candidate.move.uci() === engineMoveUci ? engineCandidate : candidate);
    if (!planned.some((candidate) => candidate.move.uci() === engineMoveUci)) planned.push(engineCandidate);
    const candidateScores = planned;

    const basePonderDepth = Math.max(safetyDepth, Math.min(5, Math.floor(options.ponderDepth ?? (profile.tacticalPressure > 0.2 ? safetyDepth + 1 : safetyDepth))));
    const tacticalMargin = this.positionSafetyMargin(safetyMargin, profile);

    const safetyLimit = Math.max(1, Math.floor(options.safetyCandidateLimit ?? candidateScores.length));
    const safetyCandidates = candidateScores.slice(0, safetyLimit);
    if (!safetyCandidates.some((candidate) => candidate.move.uci() === engineMoveUci)) {
      if (safetyCandidates.length >= safetyLimit) safetyCandidates[safetyCandidates.length - 1] = engineCandidate;
      else safetyCandidates.push(engineCandidate);
    }

    const candidateDepths = selectiveCandidateDepths(basePonderDepth, safetyCandidates, (ideaKinds) => this.mind.planBias(ideaKinds));
    // Compare every candidate at the same depth with the same search budget.
    // A score from the main root search or a deeper probe is not interchangeable
    // with the shallow consequence scores used by human move selection.
    const baselineProbe = this.childSearchScore(board, principalMove, basePonderDepth, options.ponderTimeMs);
    // A timed-out score at depth zero is static evaluation, NOT verification.
    // When even a two-ply baseline cannot complete, preserve the stronger
    // root search instead of allowing an unverified human plan to override it.
    if (baselineProbe.depth < 2) {
      this.mind.recordSetback("Safety verification was incomplete.");
      return decision(principalMove, "engine-fallback", ["Safety search was incomplete; preserving the principal move."], []);
    }
    const verifiedDepth = baselineProbe.depth;
    const baseline = baselineProbe.score;

    const book = shouldPreferPlanToBook(observedMind, history.length) ? null : openingBookMove(board, options.seed ?? Date.now(), history);
    if (book && !this.wouldRepeatPosition(board, book.move, options.positionHistoryKeys ?? [])) {
      const bookMargin = history.length < 8 ? Math.max(tacticalMargin, 42) : tacticalMargin;
      // Book familiarity cannot bypass concrete verification, even on move one.
      const bookSafe = this.isSafeCandidate(board, book.move, baseline, bookMargin, verifiedDepth, options.safetyTimeMs);
      if (bookSafe) {
        const bookCandidate = candidateScores.find((candidate) => candidate.move.uci() === book.move.uci()) ?? { move: book.move, score: result.score, ideaKinds: ["develop"] as CandidateScore["ideaKinds"], reasons: ["Swift's opening repertoire selected this move."] };
        return decision(book.move, "opening-book", bookCandidate.reasons, [bookCandidate], { opening: book.opening });
      }
    }

    const deepBaselines = new Map<number, number | null>();
    const safe = safetyCandidates.flatMap((candidate, index): CandidateScore[] => {
      const verified = this.assessCandidate(board, candidate, baseline, tacticalMargin, verifiedDepth, options.safetyTimeMs);
      if (!verified) return [];
      const deepDepth = candidateDepths[index];
      if (deepDepth > verifiedDepth && candidate.move.uci() !== engineMoveUci) {
        // The extra selective look is a veto only. Keep the original comparable
        // score for ranking, and check the extra depth against a matching baseline.
        if (!deepBaselines.has(deepDepth)) {
          const deepProbe = this.childSearchScore(board, principalMove, deepDepth, options.ponderTimeMs);
          deepBaselines.set(deepDepth, deepProbe.depth >= deepDepth ? deepProbe.score : null);
        }
        const deeperBaseline = deepBaselines.get(deepDepth);
        if (deeperBaseline === null || deeperBaseline === undefined ||
          !this.isSafeCandidate(board, candidate.move, deeperBaseline, tacticalMargin, deepDepth, options.safetyTimeMs)) return [];
      }
      return [verified];
    });
    if (!safe.length) {
      this.mind.recordSetback("The current plan produced no candidate that survived concrete verification.");
      return decision(principalMove, "engine-fallback", ["No human-plan candidate survived the concrete safety check."], candidateScores.slice(0, options.candidateLimit ?? 6));
    }

    const historyKeys = options.positionHistoryKeys ?? [];
    const nonRepeatingSafe = safe.filter((candidate) => !this.wouldRepeatPosition(board, candidate.move, historyKeys));
    const repetitionSafe = nonRepeatingSafe.length ? nonRepeatingSafe : safe;
    const naturalSafe = repetitionSafe.filter((candidate) => !this.burnsCastlingRightEarly(board, candidate.move, history));
    const movementPool = naturalSafe.length ? naturalSafe : repetitionSafe;
    // A needed defense or forcing continuation can justify an immediate retreat.
    const nonBacktracking = movementPool.filter((candidate) =>
      !this.isMechanicalBacktrack(board, candidate.move, history) ||
      candidate.ideaKinds.includes("tactical") ||
      candidate.ideaKinds.includes("defend") ||
      board.makeMove(candidate.move).isInCheck(board.turn() === "w" ? "b" : "w"),
    );
    const movementSafe = nonBacktracking.length ? nonBacktracking : movementPool;

    const selected = selectHumanMove(board, { candidateLimit: Math.min(options.candidateLimit ?? 6, movementSafe.length), randomness: technicalEndgame ? 0 : options.randomness, riskTolerance: technicalEndgame ? 0.2 : options.riskTolerance, errorBudget: baseErrorBudget, seed: options.seed === undefined ? undefined : deriveSeed(options.seed, history.length), initiative: options.initiative, simplification: options.simplification, development: options.development, pawnBreaks: options.pawnBreaks, history, mind: observedMind, candidates: movementSafe, strictBestPlay: options.strictBestPlay });
    const selectedMove = selected.move;
    const safeKeys = new Set(movementSafe.map((candidate) => candidate.move.uci()));
    if (!selectedMove || !safeKeys.has(selectedMove.uci())) {
      this.mind.recordSetback("The human decision layer could not produce a verified continuation.");
      return decision(principalMove, "engine-fallback", ["Human selection did not return a verified candidate."], movementSafe);
    }

    // A human plan may look equal in its shallow consequence search yet lose
    // to a move evaluated by the main engine several plies deeper. Challenge
    // only true plan divergences with matched-depth independent child searches.
    // Failure to complete either verification is NOT evidence of equivalence.
    if (selectedMove.uci() !== engineMoveUci &&
        !this.verifyPlanOverride(board, principalMove, selectedMove, result.depth, tacticalMargin, options.timeMs)) {
      this.mind.recordSetback("A deeper matched search did not confirm the human-plan deviation.");
      return decision(principalMove, "engine-fallback",
        ["Deeper verification rejected an unproven human-plan move; retaining the principal search choice."],
        movementSafe);
    }

    const selectedCandidate = movementSafe.find((candidate) => candidate.move.uci() === selectedMove.uci());
    if (observedMind.plan && selectedCandidate && !selectedCandidate.ideaKinds.includes(observedMind.plan)) this.mind.recordSetback("The current plan had no convincing continuation, so Swift changed course for this move.");
    const reasons = selectedCandidate?.reasons.length ? selectedCandidate.reasons : [`This move supports Swift's continuing plan to ${this.mind.planDescription()}.`];
    return decision(selectedMove, "human-plan", reasons, movementSafe);
  }

  evaluate(board: Board): number { return this.engine.evaluate(board); }

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

  /**
   * Cross-check a move chosen for human-plan reasons against the deeper main
   * search. Only runs on deviations, which are a small minority of decisions.
   * Both children must finish an identical depth before their scores can be
   * compared. Short, interrupted probes conservatively keep the principal.
   */
  private verifyPlanOverride(
    board: Board,
    principal: Move,
    selected: Move,
    mainDepth: number,
    margin: number,
    rootTimeMs?: number,
  ): boolean {
    if (selected.uci() === principal.uci()) return true;
    if (mainDepth < 5) return false;
    const comparisonDepth = Math.min(5, mainDepth - 1);
    const comparisonMs = Math.max(250, Math.min(650, Math.floor((rootTimeMs ?? 900) * 0.4)));
    const reference = this.childSearchScore(board, principal, comparisonDepth, comparisonMs);
    if (reference.depth < comparisonDepth) return false;
    const challenger = this.childSearchScore(board, selected, comparisonDepth, comparisonMs);
    if (challenger.depth < comparisonDepth) return false;
    return challenger.score >= reference.score - Math.min(18, margin);
  }

  /**
   * A short SEE test must not overrule a completed principal search merely
   * because the principal line gives up material on ONE square. Recheck the
   * original and the suggested "safe" move with identical child search depth
   * and time. Only a verified improvement may replace the principal.
   *
   * Interrupted probes are inconclusive, so retain the deep principal and
   * still apply the independent mate-in-one check afterward.
   */
  private verifyMaterialOverride(
    board: Board,
    principal: Move,
    replacement: Move,
    rootDepth: number,
    rootTimeMs?: number,
  ): boolean {
    if (replacement.uci() === principal.uci()) return false;
    if (rootDepth < 4) return true;
    const depth = Math.min(5, rootDepth - 1);
    const timeMs = Math.max(250, Math.min(650, Math.floor((rootTimeMs ?? 900) * 0.4)));
    const original = this.childSearchScore(board, principal, depth, timeMs);
    if (original.depth < depth) return false;
    const candidate = this.childSearchScore(board, replacement, depth, timeMs);
    if (candidate.depth < depth) return false;
    return candidate.score >= original.score + 10;
  }

  private childSearchScore(board: Board, move: Move, depth: number, timeMs?: number): { score: number; depth: number } {
    const probe = this.safetyEngine.search(board.makeMove(move), { depth, timeMs: this.optionsTimeMs(timeMs) });
    return { score: -probe.score, depth: probe.depth };
  }
  private optionsTimeMs(value?: number): number | undefined { return value !== undefined && value > 0 ? Math.floor(value) : undefined; }
  private positionSafetyMargin(baseMargin: number, profile: HumanErrorProfile): number {
    const pressure = profile.tacticalPressure * 0.65 + profile.practicalPressure * 0.35;
    return Math.max(0, baseMargin * (1 - pressure));
  }

  private assessCandidate(board: Board, candidate: CandidateScore, baseline: number, margin: number, depth: number, timeMs?: number): CandidateScore | null {
    const child = board.makeMove(candidate.move);
    if (!child.isCheckmate()) {
      const opponent = child.turn();
      const replies = child.legalMoves();
      if (replies.some((reply) => child.makeMove(reply).isCheckmate())) return null;
      if (child.isInCheck(opponent) && replies.length === 0) return null;
    }
    const probe = this.safetyEngine.search(child, { depth, timeMs: this.optionsTimeMs(timeMs) });
    if (probe.depth < depth) return null;
    const concreteScore = -probe.score;
    if (concreteScore < baseline - margin) return null;
    return { ...candidate, score: concreteScore, reasons: [...candidate.reasons, "Concrete consequence search kept this move inside Swift's safety margin."] };
  }

  private isSafeCandidate(board: Board, move: Move, baseline: number, margin: number, depth: number, timeMs?: number): boolean {
    const child = board.makeMove(move);
    if (!child.isCheckmate()) {
      const opponent = child.turn();
      if (child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate())) return false;
      if (child.isInCheck(opponent) && child.legalMoves().length === 0) return false;
    }
    const probe = this.safetyEngine.search(child, { depth, timeMs: this.optionsTimeMs(timeMs) });
    return probe.depth >= depth && -probe.score >= baseline - margin;
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
    return isImmediateMoveReversal(move.uci(), history);
  }
}
