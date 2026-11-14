import { Board, Move, Color } from "./board";
import { immediateMaterialLoss } from "./blunder-guard";

/**
 * Did an otherwise quiet knight/bishop move walk into a queen-relative pin
 * that an enemy pawn can attack with a legal forward move next turn?
 *
 * This is a human-like candidate-ordering alert, not a score or veto.
 * Evaluate only for a proposed root move; every move is still searched.
 */
export function invitesPinnedPawnChase(board: Board, move: Move): boolean {
  const moving = board.pieceAt(move.from);
  if (!moving || (moving[1] !== "n" && moving[1] !== "b") ||
      board.pieceAt(move.to) || move.promotion) return false;

  const side = moving[0] as Color;
  const enemy: Color = side === "w" ? "b" : "w";
  const child = board.makeMove(move);
  const target = move.to;
  const file = target & 7, rank = target >>> 3;
  let relativePin = false;

  for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                          [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let f = file + df, r = rank + dr;
    // Our queen must be the FIRST piece behind the candidate, on this ray.
    while (f >= 0 && f < 8 && r >= 0 && r < 8 &&
           !child.pieceAt(r * 8 + f)) {
      f += df; r += dr;
    }
    if (f < 0 || f >= 8 || r < 0 || r >= 8 ||
        child.pieceAt(r * 8 + f) !== side + "q") continue;

    f = file - df; r = rank - dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8 &&
           !child.pieceAt(r * 8 + f)) {
      f -= df; r -= dr;
    }
    if (f < 0 || f >= 8 || r < 0 || r >= 8) continue;
    const pinning = child.pieceAt(r * 8 + f);
    const diagonal = df !== 0 && dr !== 0;
    if (pinning && pinning[0] === enemy &&
        (pinning[1] === "q" ||
          (diagonal && pinning[1] === "b") ||
          (!diagonal && pinning[1] === "r"))) {
      relativePin = true;
      break;
    }
  }
  if (!relativePin) return false;

  const opponentPawnDirection = enemy === "w" ? 1 : -1;
  // Only an actual legal pawn push matters. A blocked or pinned pawn should
  // not manufacture a threat just because of geometric attack squares.
  return child.legalMoves().some((reply) => {
    if (child.pieceAt(reply.from) !== enemy + "p" ||
        child.pieceAt(reply.to) || !child.createsPawnPieceThreat(reply)) return false;
    const pawnFile = reply.to & 7, pawnRank = reply.to >>> 3;
    return Math.abs(pawnFile - file) === 1 &&
      pawnRank + opponentPawnDirection === rank;
  });
}

/**
 * If a queen-pinned minor can be attacked by a legal next-turn pawn push,
 * independently check all legal replies. Return the least immediate loss
 * that the defender can suffer after the adversary chooses its best pawn
 * chase. This is bounded, used only at root and never an absolute veto.
 *
 * Limit per-branch replies to avoid a pathological position taking over the
 * worker clock. If exhaustive verification is not feasible, claim nothing.
 */
export function forcedPinnedPawnChaseLoss(board: Board, move: Move): number {
  if (!invitesPinnedPawnChase(board, move)) return 0;
  const side = board.turn();
  const enemy: Color = side === "w" ? "b" : "w";
  const child = board.makeMove(move);
  const targetFile = move.to & 7, targetRank = move.to >>> 3;
  let risk = 0;
  for (const push of child.legalMoves()) {
    if (child.pieceAt(push.from) !== enemy + "p" ||
        child.pieceAt(push.to) || !child.createsPawnPieceThreat(push)) continue;
    const file = push.to & 7, rank = push.to >>> 3;
    if (Math.abs(file - targetFile) !== 1 ||
        rank + (enemy === "w" ? 1 : -1) !== targetRank) continue;
    const threatened = child.makeMove(push);
    const defenses = threatened.legalMoves();
    if (!defenses.length || defenses.length > 42) continue;
    let bestDefenderLoss = Infinity;
    for (const defense of defenses) {
      bestDefenderLoss = Math.min(bestDefenderLoss, immediateMaterialLoss(threatened, defense));
      if (bestDefenderLoss === 0) break;
    }
    if (Number.isFinite(bestDefenderLoss)) risk = Math.max(risk, bestDefenderLoss);
  }
  return Math.max(0, risk);
}
