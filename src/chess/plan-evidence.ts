import { Board, Move } from "./board";
import { IdeaGeneration, IdeaKind } from "./ideas";
import { planProgressMetric } from "./mind";
import { understandPosition } from "./understanding";

/**
 * Measure what a REAL, legal candidate changes on the board for the plan
 * Swift has already been pursuing. This is a small strategic tie-breaker,
 * NEVER a chess evaluation or an imagined opponent-proof continuation.
 *
 * The candidate's tactical acceptability must already have been established
 * by an independent search of the position with the opponent to move.
 * Switch the snapshot back to Swift's perspective ONLY to measure its static
 * own-side plan metric; do not use this snapshot as an actual game position.
 */
export function planOutcomeDelta(
  board: Board,
  move: Move,
  plan: IdeaKind,
  beforeMetric: number,
): number {
  const after = board.makeMove(move);
  const opponent = after.turn();
  // Checks, mates and other forcing positions belong to tactical calculation.
  // Do not award imaginary quiet-plan progress while the opponent is in check.
  if (after.isCheckmate() || after.isInCheck(opponent)) return 0;

  const own = board.turn();
  const ownSideView = Board.fromFEN(after.toFEN().replace(/ [wb] /, ` ${own} `));
  const updated: IdeaGeneration = {
    understanding: understandPosition(ownSideView),
    ideas: [],
    candidates: [],
  };
  const afterMetric = planProgressMetric(ownSideView, updated, plan);
  return Math.max(-1, Math.min(1, afterMetric - beforeMetric));
}
