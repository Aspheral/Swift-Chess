import { Board } from "./board";
import { buildPlayedMoveReview } from "./coach";
import { SwiftEngine } from "./engine";
import type { SwiftWorkerReviewRequest, SwiftWorkerReviewResponse, SwiftWorkerReviewErrorResponse } from "./worker-protocol";

/**
 * Separate worker so reviewing an old move never blocks Swift's current
 * position search, and old reviews can be cancelled by terminating the worker.
 * No HumanSwiftEngine or playing-mind instance is allocated here.
 */
type ReviewContext = {
  onmessage: ((event: MessageEvent<SwiftWorkerReviewRequest>) => void) | null;
  postMessage: (response: SwiftWorkerReviewResponse | SwiftWorkerReviewErrorResponse) => void;
};

const context = self as unknown as ReviewContext;

context.onmessage = (event) => {
  const request = event.data;
  if (request.type !== "review") return;
  try {
    const before = Board.fromFEN(request.fen);
    const played = before.legalMoves().find((move) => move.uci() === request.move);
    if (!played) {
      context.postMessage({ type: "review-result", id: request.id, review: null });
      return;
    }

    const immediate = buildPlayedMoveReview(before, played.uci());
    // Legal mate proofs are conclusive; there is no reason to slow them down
    // with a second, weaker, estimated search.
    const proven = immediate && ["mate-in-one", "mate-in-two", "checkmate"].includes(immediate.verdict);
    const evidence = !proven ? (() => {
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
      type: "review-result",
      id: request.id,
      review: buildPlayedMoveReview(before, played.uci(), evidence),
    });
  } catch (error) {
    context.postMessage({
      type: "review-error",
      id: request.id,
      message: error instanceof Error ? error.message : "Swift could not review that move",
    });
  }
};
