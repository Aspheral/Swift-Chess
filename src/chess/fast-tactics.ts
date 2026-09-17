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
  const side = sideToMove(board);
  const opponent = opposite(side);
  return board.legalMoves().some((move) => {
    const child = board.makeMove(move);
    return child.isInCheck(opponent) || board.pieceAt(move.to) !== null || move.enPassant || !!move.promotion;
  });
}

function forcedMate(board: Board, engine: SwiftEngine, existing?: SearchResult): Move | null {
  const immediate = immediateMate(board);
  if (immediate) return immediate;
  if (existing?.move && existing.score >= MATE_SCORE) return existing.move;

  const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "").length;
  const tactical = hasTacticalSignal(board);
  if (!tactical && pieces > 12) return null;

  const depths = existing?.depth && existing.depth >= 5 ? [] : [5];
  for (const depth of depths) {
    const result = engine.search(board, { depth });
    if (result.move && result.score >= MATE_SCORE) return result.move;
  }
  return null;
}

function bestMaterialCapture(board: Board, queenUnderAttack: boolean): TacticalPriority | null {
  // If our queen is under attack, do not auto-grab the opponent's queen.
  // This is exactly where a human pauses to decide whether to trade queens,
  // save the queen, or exploit a deeper tactical resource.
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

  // A capture sequence worth a queen or more is also a forcing human priority.
  // SEE keeps this grounded in the actual exchange rather than raw victim value.
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
): TacticalPriority | null {
  const mate = forcedMate(board, engine, existing);
  if (mate) return { move: mate, kind: "mate", score: MATE_SCORE };
  return bestMaterialCapture(board, isOwnQueenUnderAttack(board));
}
