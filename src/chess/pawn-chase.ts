import { Board, Move, Color } from "./board";

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
