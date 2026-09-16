import { Board, Move, PieceType } from "./board";

const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000,
};

/**
 * Estimates the net material result of an exchange on a target square.
 *
 * This is deliberately legality-aware: each recapture is selected from the
 * current board's legal moves, so pinned pieces and illegal king captures do
 * not participate in the exchange. Positive values favour the side making
 * the first capture.
 */
export function staticExchange(board: Board, move: Move): number {
  if (!isCapture(board, move)) return 0;

  const captured = capturedPieceValue(board, move);
  const child = board.makeMove(move);
  const gain = captured - exchange(child, move.to, PIECE_VALUES[move.promotion ?? movingType(board, move)]);
  return gain;
}

function exchange(board: Board, target: number, previousValue: number): number {
  const attackers = board
    .legalMoves()
    .filter((move) => move.to === target && isCapture(board, move))
    .sort((a, b) => movingValue(board, a) - movingValue(board, b));

  const attacker = attackers[0];
  if (!attacker) return 0;

  const capturedValue = previousValue;
  const nextBoard = board.makeMove(attacker);
  const nextValue = PIECE_VALUES[attacker.promotion ?? movingType(board, attacker)];
  return Math.max(0, capturedValue - exchange(nextBoard, target, nextValue));
}

function isCapture(board: Board, move: Move): boolean {
  return move.enPassant || board.pieceAt(move.to) !== null;
}

function movingType(board: Board, move: Move): PieceType {
  const piece = board.pieceAt(move.from);
  if (!piece) throw new Error(`No piece on ${move.from} for move ${move.uci()}`);
  return piece[1];
}

function movingValue(board: Board, move: Move): number {
  return PIECE_VALUES[movingType(board, move)];
}

function capturedPieceValue(board: Board, move: Move): number {
  if (move.enPassant) return PIECE_VALUES.p;
  const piece = board.pieceAt(move.to);
  return piece ? PIECE_VALUES[piece[1]] : 0;
}
