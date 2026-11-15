import { Board } from "./board";
import { buildCoachReport, buildPlayedMoveReview } from "./coach";
import { SwiftEngine } from "./engine";
import { HumanSwiftEngine } from "./human-engine";
import { decisionThinkPaceMs, swiftPlayProfile } from "./play-profile";
import { allocateRapidThink } from "./rapid-time";
import { safeEmergencyProvisional } from "./provisional-safety";
import { safeProvisionalMove } from "./blunder-guard";
import { SwiftWorkerRequest, SwiftWorkerResponse } from "./worker-protocol";

type WorkerContext = {
  onmessage: ((event: MessageEvent<SwiftWorkerRequest>) => void) | null;
  postMessage: (message: SwiftWorkerResponse) => void;
};

const context = self as unknown as WorkerContext;
let engine = new HumanSwiftEngine();
let analysisEngines: Record<"w" | "b", HumanSwiftEngine> = {
  w: new HumanSwiftEngine(),
  b: new HumanSwiftEngine(),
};

context.onmessage = (event) => {
  const request = event.data;

  if (request.type === "review") {
    try {
      const before = Board.fromFEN(request.fen);
      const played = before.legalMoves().find((move) => move.uci() === request.move);
      if (!played) {
        context.postMessage({ type: "review-result", id: request.id, review: null });
        return;
      }

      const immediate = buildPlayedMoveReview(before, played.uci());
      // Forced mates are already conclusively verified by the chess rules.
      // Search only unresolved / material questions and never on the game-
      // playing worker: the UI launches this request in its own worker.
      const decisive = immediate && ["mate-in-one", "mate-in-two", "checkmate"].includes(immediate.verdict);
      const evidence = !decisive ? (() => {
        const reference = new SwiftEngine().search(before, { depth: 4, timeMs: 550 });
        const response = new SwiftEngine().search(before.makeMove(played), { depth: 3, timeMs: 450 });
        return {
          bestMove: reference.move?.uci() ?? null,
          bestLine: (reference.pv ?? []).map((move) => move.uci()),
          bestScore: reference.score,
          rootDepth: reference.depth,
          replyLine: (response.pv ?? []).map((move) => move.uci()),
          replyScore: response.score,
          childDepth: response.depth,
        };
      })() : undefined;

      context.postMessage({
        type: "review-result", id: request.id,
        review: buildPlayedMoveReview(before, played.uci(), evidence),
      });
    } catch (error) {
      context.postMessage({
        type: "review-error", id: request.id,
        message: error instanceof Error ? error.message : "The move review could not finish",
      });
    }
    return;
  }

  if (request.type === "reset") {
    engine = new HumanSwiftEngine();
    analysisEngines = { w: new HumanSwiftEngine(), b: new HumanSwiftEngine() };
    return;
  }

  try {
    const board = Board.fromFEN(request.fen);
    const profile = swiftPlayProfile(board, request.moveHistory);
    const activeEngine = request.mode === "analyze" ? analysisEngines[board.turn()] : engine;
    const isRapid = request.mode !== "analyze" && request.clockMs !== undefined && request.opponentClockMs !== undefined;
    const rapid = isRapid ? allocateRapidThink(profile, {
      remainingMs: request.clockMs!,
      opponentMs: request.opponentClockMs!,
      ply: request.moveHistory.length,
    }) : null;
    const result = activeEngine.search(board, {
      ...(rapid?.options ?? profile.options),
      // Account for root, verification, plan probes and second looks together.
      // A 3+2 clock cannot afford independent uncoordinated time budgets.
      totalTimeMs: rapid?.targetTotalMs,
      adaptiveThinking: request.mode === "analyze" ? false : (rapid?.options.adaptiveThinking ?? profile.options.adaptiveThinking),
      // A failed worker must never fall back to an unverified root move.
      onInitialMove: (move, completedDepth) => {
        // Analysis needs no fallback. Real play demands a completed first
        // iteration, no exposed queen/rook, and bounded mate verification.
        if (request.mode === "analyze") return;
        const fallback = safeProvisionalMove(board, move, completedDepth,
          (position) => activeEngine.evaluate(position));
        if (fallback && safeEmergencyProvisional(board, fallback)) {
          context.postMessage({ type: "provisional", id: request.id, move: fallback.uci() });
        }
      },
      onSecondLook: (reason) => context.postMessage({ type: "thinking", id: request.id, reason }),
      seed: request.seed,
      moveHistory: request.moveHistory,
      positionHistoryKeys: request.positionHistoryKeys,
    });

    const suggestions = [result.move?.uci(), ...result.humanCandidates.map((candidate) => candidate.move.uci())]
      .filter((move): move is string => Boolean(move))
      .filter((move, index, moves) => moves.indexOf(move) === index)
      .slice(0, 4);

    const selectedCandidate = result.humanCandidates.find((candidate) => candidate.move.uci() === result.move?.uci());
    const naturalThinkMs = request.mode === "analyze" ? 0 : decisionThinkPaceMs(profile, {
      legalMoves: board.legalMoves().length,
      decisionSource: result.decision?.source,
      candidates: result.humanCandidates,
      planAge: result.mind?.planAge,
      planConfidence: result.mind?.confidence,
      followsPlan: !!(result.mind?.plan && selectedCandidate?.ideaKinds.includes(result.mind.plan)),
    });

    const minimumThinkMs = rapid ? Math.min(naturalThinkMs, rapid.minimumThinkMs) : naturalThinkMs;
    const pv = (result.pv ?? []).map((move) => move.uci());
    const coach = request.mode === "analyze" ? buildCoachReport(board, {
      move: result.move?.uci() ?? null,
      pv,
      suggestions,
      mind: result.mind,
      decision: result.decision,
    }) : undefined;

    context.postMessage({
      type: "result",
      id: request.id,
      move: result.move?.uci() ?? null,
      pv,
      suggestions,
      opening: result.opening,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      thinkKind: profile.kind,
      minimumThinkMs,
      secondLook: result.secondLook,
      mind: result.mind,
      decision: result.decision,
      planVision: result.planVision,
      coach,
    });
  } catch (error) {
    context.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Swift worker failed",
    });
  }
};
