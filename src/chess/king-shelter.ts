import { Board, Move } from "./board";

/**
 * A positional warning for unnecessarily opening one's own castled pawn cover.
 * This does NOT evaluate tactics. Concrete search is authoritative and the
 * human-facing selector uses this only to break safe, near-equal decisions.
 */
export function quietKingShelterDebt(board: Board, move: Move): number {
  const color = board.turn();
  const pawn = board.pieceAt(move.from);
  if (pawn !== color + "p" || move.enPassant || board.pieceAt(move.to) ||
      board.isInCheck(color)) return 0;

  let king = -1;
  for (let square = 0; square < 64; square++) {
    if (board.pieceAt(square) === color + "k") { king = square; break; }
  }
  if (king < 0) return 0;
  const file = king & 7;
  const rank = king >>> 3;
  // Do not penalize normal center pawn development before castling.
  if (file > 2 && file < 5) return 0;
  if (color === "w" ? rank > 1 : rank < 6) return 0;
  if (Math.abs((move.from & 7) - file) > 1) return 0;

  const direction = color === "w" ? 1 : -1;
  const shelter = (position: Board): number => {
    let cover = 0;
    for (let df = -1; df <= 1; df++) {
      const f = file + df;
      if (f < 0 || f > 7) continue;
      for (let step = 1; step <= 2; step++) {
        const r = rank + direction * step;
        if (r < 0 || r > 7) continue;
        if (position.pieceAt(r * 8 + f) === color + "p") {
          cover += step === 1 ? 1 : 0.5;
          break;
        }
      }
    }
    return cover;
  };

  const delta = shelter(board) - shelter(board.makeMove(move));
  return Math.min(5.5, Math.max(0, delta * 5.5));
}
