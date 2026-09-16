import { Board, Move, PieceType } from "./board";
import { staticExchange } from "./see";

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000,
};

/**
 * Scores a tactical move for search ordering.
 * SEE is used to separate sound captures from likely poisoned captures while
 * checks and promotions remain forcing and therefore receive priority.
 */
export function tacticalMoveScore(board: Board, move: Move): number {
  let score = 0;
  if (move.promotion) score += 900_000 + PIECE_VALUES[move.promotion];
  if (move.enPassant) score += 1_000_000;

  const captured = board.pieceAt(move.to);
  if (captured) {
    const moving = board.pieceAt(move.from);
    const attacker = moving ? PIECE_VALUES[moving[1] as PieceType] : 0;
    const victim = PIECE_VALUES[captured[1] as PieceType];
    const see = staticExchange(board, move);
    score += 1_000_000 + see * 100 + victim * 10 - attacker;
  }

  return score;
}

/**
 * Conservative quiescence delta-pruning predicate.
 * A capture can be skipped when its immediate material gain cannot raise the
 * current alpha bound. Promotions and en-passant are always searched.
 */
export function canDeltaPrune(board: Board, move: Move, standPat: number, alpha: number): boolean {
  if (move.promotion || move.enPassant) return false;
  const captured = board.pieceAt(move.to);
  if (!captured) return true;
  const see = staticExchange(board, move);
  const optimisticGain = Math.max(0, see);
  return standPat + optimisticGain + 50 < alpha;
}
