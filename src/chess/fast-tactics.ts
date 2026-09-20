import { Board, Color, Move } from "./board";
import { SwiftEngine, SearchResult } from "./engine";
import { staticExchange } from "./see";

const MATE_SCORE = 99_000;
const QUEEN_VALUE = 900;

export interface TacticalPriority {
  move: Move;
  kind: "mate" | "queen" | "material";
  score: number;
}

function sideToMove(board: Board): Color {
  return board.toFEN().split(/\s+/)[1] as Color;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function ownQueenSquare(board: Board, side: Color): number | null {
  for (let square = 0; square < 64; square += 1) {
    if (board.pieceAt(square) === `${side}q`) return square;
  }
  return null;
}

export function isOwnQueenUnderAttack(board: Board): boolean {
  const side = sideToMove(board);
  const queen = ownQueenSquare(board, side);
  return queen !== null && board.isSquareAttacked(queen, opposite(side));
}

function allowsImmediateMate(board: Board, move: Move): boolean {
  const child = board.makeMove(move);
  if (child.isCheckmate()) return false;
  return child.legalMoves().some((reply) => child.makeMove(reply).isCheckmate());
}

function immediateMate(board: Board): Move | null {
  for (const move of board.legalMoves()) {
    if (board.makeMove(move).isCheckmate()) return move;
  }
  return null;
}

function hasTacticalSignal(board: Board): boolean {
  const opponent = opposite(sideToMove(board));
  return board.legalMoves().some((move) => {
    const child = board.makeMove(move);
    return child.isInCheck(opponent) || board.pieceAt(move.to) !== null || move.enPassant || !!move.promotion;
  });
}

function canForceMate(
  board: Board,
  attacker: Color,
  pliesRemaining: number,
  memo: Map<string, boolean>,
): boolean {
  const key = `${board.toFEN().split(/\s+/).slice(0, 4).join(" ")}|${attacker}|${pliesRemaining}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  if (board.isCheckmate()) {
    const result = sideToMove(board) !== attacker;
    memo.set(key, result);
    return result;
  }
  if (pliesRemaining <= 0 || board.isStalemate()) {
    memo.set(key, false);
    return false;
  }

  const attackerToMove = sideToMove(board) === attacker;
  const legal = board.legalMoves();
  const result = attackerToMove
    ? legal.some((move) => canForceMate(board.makeMove(move), attacker, pliesRemaining - 1, memo))
    : legal.every((move) => canForceMate(board.makeMove(move), attacker, pliesRemaining - 1, memo));
  memo.set(key, result);
  return result;
}

function exactMateInTwo(board: Board): Move | null {
  const attacker = sideToMove(board);
  const memo = new Map<string, boolean>();
  for (const move of board.legalMoves()) {
    const child = board.makeMove(move);
    if (canForceMate(child, attacker, 2, memo)) return move;
  }
  return null;
}

function forcedMate(
  board: Board,
  engine: SwiftEngine,
  existing?: SearchResult,
  tacticalSearchDepth = 5,
): Move | null {
  const immediate = immediateMate(board);
  if (immediate) return immediate;
  if (existing?.move && existing.score >= MATE_SCORE) return existing.move;
  if (tacticalSearchDepth <= 0) return null;

  const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "").length;
  if (pieces <= 8 && tacticalSearchDepth >= 3) {
    const exact = exactMateInTwo(board);
    if (exact) return exact;
  }

  const tactical = hasTacticalSignal(board);
  if (!tactical && pieces > 12) return null;

  const depth = Math.max(1, Math.floor(tacticalSearchDepth));
  if (existing?.depth && existing.depth >= depth) return null;
  const result = engine.search(board, { depth });
  return result.move && result.score >= MATE_SCORE ? result.move : null;
}

function bestMaterialCapture(board: Board, queenUnderAttack: boolean): TacticalPriority | null {
  if (queenUnderAttack) return null;

  let best: TacticalPriority | null = null;
  for (const move of board.legalMoves()) {
    const captured = board.pieceAt(move.to);
    if (!captured || captured[1] !== "q") continue;
    if (allowsImmediateMate(board, move)) continue;

    const gain = staticExchange(board, move);
    if (gain <= 0) continue;
    if (!best || gain > best.score) best = { move, kind: "queen", score: gain };
  }

  for (const move of board.legalMoves()) {
    if (!board.pieceAt(move.to) && !move.enPassant) continue;
    if (allowsImmediateMate(board, move)) continue;
    const gain = staticExchange(board, move);
    if (gain < QUEEN_VALUE) continue;
    if (!best || gain > best.score) best = { move, kind: "material", score: gain };
  }

  return best;
}

export function findTacticalPriority(
  board: Board,
  engine: SwiftEngine,
  existing?: SearchResult,
  tacticalSearchDepth = 5,
): TacticalPriority | null {
  const mate = forcedMate(board, engine, existing, tacticalSearchDepth);
  if (mate) return { move: mate, kind: "mate", score: MATE_SCORE };
  return bestMaterialCapture(board, isOwnQueenUnderAttack(board));
}
