import { Board, Move, PieceType } from "./board";
import { staticExchange } from "./see";

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

/**
 * Net material Swift could lose on the opponent's very next capture.
 *
 * Credit material gained by the proposed move (including promotions) before
 * judging a recapture. Otherwise winning a queen for a rook looks exactly like
 * hanging a rook, and the guard mistakenly vetoes a profitable exchange.
 *
 * Include bishops and knights, not just queens and rooks. This remains a
 * one-reply, legality-aware SEE test, not a complete tactical search.
 */
export function immediateMaterialLoss(board: Board, move: Move): number {
  const child = board.makeMove(move);
  if (child.isCheckmate()) return 0;

  const captured = board.pieceAt(move.to);
  const captureGain = move.enPassant ? PIECE_VALUES.p
    : captured ? PIECE_VALUES[captured[1] as PieceType] : 0;
  const promotionGain = move.promotion
    ? PIECE_VALUES[move.promotion] - PIECE_VALUES.p : 0;
  const immediateGain = captureGain + promotionGain;

  let worst = 0;
  for (const reply of child.legalMoves()) {
    const victim = child.pieceAt(reply.to);
    if (!victim || victim[0] !== board.turn() || victim[1] === "p" || victim[1] === "k") continue;
    worst = Math.max(worst, staticExchange(child, reply) - immediateGain);
  }
  return Math.max(0, worst);
}

/** Kept for existing callers that used the original queen/rook-only name. */
export const immediateMajorPieceLoss = immediateMaterialLoss;

export interface MajorLossAvoidance {
  move: Move;
  originalLoss: number;
  remainingLoss: number;
}

/**
 * Block obvious net material blunders (including hangs of minor pieces) while
 * leaving genuine profitable exchanges alone.
 *
 * Prefer already considered candidate moves. Falling back to a different legal
 * move must never introduce an immediate checkmate for the opponent.
 */
export function avoidImmediateMajorBlunder(
  board: Board,
  proposed: Move,
  preferredAlternatives: Move[] = [],
  evaluate?: (next: Board) => number,
): MajorLossAvoidance | null {
  const loss = immediateMaterialLoss(board, proposed);
  if (loss < 160 || board.makeMove(proposed).isCheckmate()) return null;

  const legal = board.legalMoves();
  const unique = new Set<string>([proposed.uci()]);
  const choices: Move[] = [];
  for (const suggestion of [...preferredAlternatives, ...legal]) {
    const found = legal.find((candidate) => candidate.uci() === suggestion.uci());
    if (found && !unique.has(found.uci())) {
      unique.add(found.uci());
      choices.push(found);
    }
  }

  let best: { move: Move; loss: number; value: number; priority: number } | null = null;
  const prioritySet = new Set(preferredAlternatives.map((move) => move.uci()));
  for (const candidate of choices) {
    const candidateLoss = immediateMaterialLoss(board, candidate);
    if (candidateLoss > loss - 140) continue;
    const child = board.makeMove(candidate);
    // Avoid swapping a material blunder for a forced one-move loss.
    if (!child.isCheckmate() && child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate())) continue;
    const value = evaluate ? -evaluate(child) : 0;
    const priority = prioritySet.has(candidate.uci()) ? 1 : 0;
    if (!best || candidateLoss < best.loss - 80 ||
      (Math.abs(candidateLoss - best.loss) <= 80 && (priority > best.priority ||
        (priority === best.priority && value > best.value)))) {
      best = { move: candidate, loss: candidateLoss, value, priority };
    }
    if (priority && candidateLoss === 0) break;
  }
  return best ? { move: best.move, originalLoss: loss, remainingLoss: best.loss } : null;
}

/**
 * A human-plan or interrupted-search override can occasionally discard a
 * sound principal move and allow a one-move checkmate with no material loss.
 * That is not a human-like mistake Swift should make deliberately.
 *
 * Use this only for uncertain or non-principal decisions: looking for
 * opponent checking replies is more expensive than the routine SEE guard.
 */
export function allowsMateInOne(board: Board, move: Move): boolean {
  const child = board.makeMove(move);
  if (child.isCheckmate() || child.isStalemate()) return false;
  const defendingSide = board.turn();
  for (const reply of child.legalMoves()) {
    const after = child.makeMove(reply);
    // Most moves are not checks. Do not enumerate follow-up replies unless
    // the king is actually in check.
    if (after.isInCheck(defendingSide) && after.legalMoves().length === 0) return true;
  }
  return false;
}

export interface MateInOneAvoidance {
  move: Move;
  previousMove: Move;
}

/**
 * Rescue only a genuinely avoidable next-move checkmate.
 * Prefer already searched candidates, but never accept a second move that
 * still permits mate. The main engine still chooses normal moves.
 */
export function avoidImmediateCheckmate(
  board: Board,
  proposed: Move,
  preferredAlternatives: Move[] = [],
  evaluate?: (next: Board) => number,
): MateInOneAvoidance | null {
  if (!allowsMateInOne(board, proposed)) return null;
  const legal = board.legalMoves();
  const preferred = new Set(preferredAlternatives.map((move) => move.uci()));
  const seen = new Set<string>([proposed.uci()]);
  let best: { move: Move; score: number } | null = null;
  for (const suggestion of [...preferredAlternatives, ...legal]) {
    const key = suggestion.uci();
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = legal.find((move) => move.uci() === key);
    if (!candidate || allowsMateInOne(board, candidate)) continue;
    const materialLoss = immediateMaterialLoss(board, candidate);
    const score = (preferred.has(key) ? 40 : 0) +
      (evaluate ? -evaluate(board.makeMove(candidate)) : 0) -
      materialLoss * 2;
    if (!best || score > best.score) best = { move: candidate, score };
  }
  return best ? { move: best.move, previousMove: proposed } : null;
}
