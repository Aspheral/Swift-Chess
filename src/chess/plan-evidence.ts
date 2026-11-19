import { Board, Move } from "./board";
import { IdeaGeneration, IdeaKind } from "./ideas";
import { planProgressMetric } from "./mind";
import { understandPosition } from "./understanding";

/**
 * Measure strategic progress on the ACTUAL two-ply board after Swift's legal
 * candidate and the opponent's reply from a completed verification search.
 *
 * This is a bounded tie-breaker, not a chess evaluation or a forced variation.
 * If the opponent reply is missing or either move leaves a tactical emergency,
 * decline to claim progress. The caller must already have verified both
 * candidate legality and concrete tactical safety independently.
 */
export function planOutcomeDelta(
  board: Board,
  move: Move,
  plan: IdeaKind,
  beforeMetric: number,
  opponentReplyUci?: string,
): number {
  if (!opponentReplyUci) return 0;
  const after = board.makeMove(move);
  const enemy = after.turn();
  // Forcing checks belong to tactics, not a speculative continuing plan.
  if (after.isCheckmate() || after.isInCheck(enemy)) return 0;

  const reply = after.legalMoves().find((candidate) => candidate.uci() === opponentReplyUci);
  if (!reply) return 0;
  const defended = after.makeMove(reply);
  if (defended.isCheckmate() || defended.isInCheck(board.turn()) ||
      defended.turn() !== board.turn()) return 0;

  const updated: IdeaGeneration = {
    understanding: understandPosition(defended),
    ideas: [],
    candidates: [],
  };
  const afterMetric = planProgressMetric(defended, updated, plan);
  return Math.max(-1, Math.min(1, afterMetric - beforeMetric));
}
