import { Board, Move } from "./board";
import { allowsMateInOne } from "./blunder-guard";
import { allowsCheckingMate } from "./mate-threat";

/**
 * The web client may play a provisional move only after a worker failure.
 * Unlike a completed HumanSwiftEngine decision, the provisional principal
 * move has not yet passed the final tactical safety gates.
 *
 * Require legal play and an independently checked absence of opponent mate
 * in one or forced *checking* mates in two or three. A timed-out proof is
 * inconclusive, so fail closed: show Retry instead of playing blindly.
 *
 * This is deliberately not a claim of full tactical soundness: quiet forced
 * mates are outside the bounded checking-sequence verifier.
 */
export function safeEmergencyProvisional(board: Board, move: Move): boolean {
  if (!board.legalMoves().some((legal) => legal.uci() === move.uci())) return false;
  const child = board.makeMove(move);
  if (child.isCheckmate() || child.isStalemate()) return true;
  if (allowsMateInOne(board, move)) return false;

  const two = allowsCheckingMate(board, move, 2, { maxNodes: 4500, timeMs: 55 });
  if (!two.complete || two.found) return false;

  const three = allowsCheckingMate(board, move, 3, { maxNodes: 9000, timeMs: 120 });
  return three.complete && !three.found;
}
