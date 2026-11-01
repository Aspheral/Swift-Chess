import { Board, Move } from "./board";
import { staticExchange } from "./see";

/**
 * Immediate material losses which a completed shallow search can still miss
 * if its time budget expires before the opponent's first reply.
 *
 * This is deliberately an independent, untimed calculation using LEGAL
 * captures and recaptures. It is not a complete tactical search.
 */
export function immediateMajorPieceLoss(board: Board, move: Move): number {
  const child = board.makeMove(move);
  if (child.isCheckmate()) return 0;

  let worst = 0;
  for (const reply of child.legalMoves()) {
    const victim = child.pieceAt(reply.to);
    if (!victim || victim[0] !== board.turn() || (victim[1] !== "q" && victim[1] !== "r")) continue;
    worst = Math.max(worst, staticExchange(child, reply));
  }
  return worst;
}

export interface MajorLossAvoidance {
  move: Move;
  originalLoss: number;
  remainingLoss: number;
}

/**
 * Prevent a plan or an incomplete concrete search from simply hanging a queen
 * or exchanging a rook for a minor piece without a serious tactical reason.
 *
 * Safer moves are taken from the engine principal move first, then the
 * existing strategic candidates. All-legal fallback is used only if those
 * candidates fail; if *every* move suffers the same risk we keep the original.
 */
export function avoidImmediateMajorBlunder(
  board: Board,
  proposed: Move,
  preferredAlternatives: Move[] = [],
  evaluate?: (next: Board) => number,
): MajorLossAvoidance | null {
  const loss = immediateMajorPieceLoss(board, proposed);
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
    const candidateLoss = immediateMajorPieceLoss(board, candidate);
    if (candidateLoss > loss - 140) continue;
    const value = evaluate ? -evaluate(board.makeMove(candidate)) : 0;
    const priority = prioritySet.has(candidate.uci()) ? 1 : 0;
    if (!best || candidateLoss < best.loss - 80 ||
      (Math.abs(candidateLoss - best.loss) <= 80 && (priority > best.priority ||
        (priority === best.priority && value > best.value)))) {
      best = { move: candidate, loss: candidateLoss, value, priority };
    }
    // An already-vetted engine suggestion with no exposure is preferable
    // to scanning every possible quiet move.
    if (priority && candidateLoss === 0) break;
  }
  return best ? { move: best.move, originalLoss: loss, remainingLoss: best.loss } : null;
}

/**
 * Worker failures must not convert an arbitrary first-pass move into a play.
 * Independently check the opponent's legal immediate major-piece captures.
 * With no completed search or no safe fallback, report the worker error instead.
 */
export function safeProvisionalMove(
  board: Board,
  firstPass: Move,
  completedDepth: number,
  evaluate?: (next: Board) => number,
): Move | null {
  if (completedDepth < 1) return null;
  const guard = avoidImmediateMajorBlunder(board, firstPass, [], evaluate);
  const proposed = guard?.move ?? firstPass;
  return immediateMajorPieceLoss(board, proposed) >= 160 ? null : proposed;
}
