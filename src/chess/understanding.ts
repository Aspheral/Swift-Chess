import { Board, Color, PieceType } from "./board";

export interface PieceUnderstanding { square: string; type: PieceType; activity: number; mobility: number; defended: boolean; vulnerable: boolean; }
export interface PawnStructureUnderstanding { isolated: number; doubled: number; backward: number; passed: number; chains: number; openFiles: number[]; semiOpenFiles: number[]; }
export interface KingUnderstanding { square: string; pawnShield: number; escapeSquares: number; attackers: number; openFilesNearKing: number; exposed: boolean; }
export interface TacticalUnderstanding { checks: number; captures: number; promotions: number; forcingMoves: number; }
export interface PositionUnderstanding {
  sideToMove: Color;
  material: number;
  materialAdvantage: "white" | "black" | "equal";
  king: Record<Color, KingUnderstanding>;
  pieces: Record<Color, PieceUnderstanding[]>;
  pawns: Record<Color, PawnStructureUnderstanding>;
  tactics: TacticalUnderstanding;
  space: Record<Color, number>;
  development: Record<Color, number>;
}

const FILES = "abcdefgh";
const squareName = (index: number): string => `${FILES[index & 7]}${Math.floor(index / 8) + 1}`;
const colorOf = (piece: string): Color => piece[0] as Color;
const typeOf = (piece: string): PieceType => piece[1] as PieceType;
const opposite = (color: Color): Color => color === "w" ? "b" : "w";
const boardArray = (board: Board): Array<string | null> => Array.from({ length: 64 }, (_, square) => board.pieceAt(square));

function sideBoard(board: Board, color: Color): Board {
  return Board.fromFEN(board.toFEN().replace(/^(\S+) \S+/, `$1 ${color}`));
}

function pawnStructure(board: Board, color: Color): PawnStructureUnderstanding {
  const pieces = boardArray(board);
  const squares = pieces.flatMap((piece, square) => piece === `${color}p` ? [square] : []);
  const files = new Set(squares.map((square) => square & 7));
  const counts = new Map<number, number>();
  for (const square of squares) counts.set(square & 7, (counts.get(square & 7) ?? 0) + 1);
  const enemyPawns = pieces.flatMap((piece, square) => piece === `${opposite(color)}p` ? [square] : []);
  let isolated = 0, doubled = 0, passed = 0, backward = 0, chains = 0;

  for (const square of squares) {
    const file = square & 7, rank = Math.floor(square / 8);
    if ((counts.get(file) ?? 0) > 1) doubled++;
    if (!files.has(file - 1) && !files.has(file + 1)) isolated++;
    const blocked = enemyPawns.some((enemySquare) => {
      const enemyFile = enemySquare & 7, enemyRank = Math.floor(enemySquare / 8);
      return Math.abs(enemyFile - file) <= 1 && (color === "w" ? enemyRank > rank : enemyRank < rank);
    });
    if (!blocked) passed++;
    const front = square + (color === "w" ? 8 : -8);
    const support = [front - 1, front + 1].some((s) => s >= 0 && s < 64 && Math.abs((s & 7) - file) === 1 && board.pieceAt(s) === `${color}p`);
    const adjacent = [file - 1, file + 1].some((f) => f >= 0 && f < 8 && squares.some((s) => (s & 7) === f));
    if (!support && adjacent && ((color === "w" && rank > 1) || (color === "b" && rank < 6))) backward++;
    if ([file - 1, file + 1].some((f) => f >= 0 && f < 8 && squares.some((s) => (s & 7) === f && Math.abs(Math.floor(s / 8) - rank) <= 1))) chains++;
  }

  const openFiles: number[] = [], semiOpenFiles: number[] = [];
  for (let file = 0; file < 8; file++) {
    const white = pieces.some((piece, square) => piece === "wp" && (square & 7) === file);
    const black = pieces.some((piece, square) => piece === "bp" && (square & 7) === file);
    if (!white && !black) openFiles.push(file);
    else if (color === "w" ? !white : !black) semiOpenFiles.push(file);
  }
  return { isolated, doubled, backward, passed, chains, openFiles, semiOpenFiles };
}

function kingUnderstanding(board: Board, color: Color): KingUnderstanding {
  const pieces = boardArray(board);
  const square = pieces.findIndex((piece) => piece === `${color}k`);
  if (square < 0) return { square: "-", pawnShield: 0, escapeSquares: 0, attackers: 0, openFilesNearKing: 0, exposed: false };
  const rank = Math.floor(square / 8), file = square & 7;
  const pawnShield = [-1, 0, 1].filter((df) => {
    const f = file + df, r = rank + (color === "w" ? 1 : -1);
    return f >= 0 && f < 8 && r >= 0 && r < 8 && board.pieceAt(r * 8 + f) === `${color}p`;
  }).length;
  const ownMoves = sideBoard(board, color).legalMoves();
  const enemyMoves = sideBoard(board, opposite(color)).legalMoves();
  const attackers = enemyMoves.filter((move) => move.to === square).length;
  const openFilesNearKing = [-1, 0, 1].filter((df) => {
    const f = file + df;
    return f >= 0 && f < 8 && !pieces.some((piece, s) => piece?.endsWith("p") && (s & 7) === f);
  }).length;
  return { square: squareName(square), pawnShield, escapeSquares: ownMoves.filter((move) => move.from === square).length, attackers, openFilesNearKing, exposed: pawnShield <= 1 || attackers > 0 || openFilesNearKing > 0 };
}

function pieceUnderstanding(board: Board, color: Color, ownMoves: ReturnType<Board["legalMoves"]>, enemyMoves: ReturnType<Board["legalMoves"]>): PieceUnderstanding[] {
  return boardArray(board).flatMap((piece, square) => {
    if (!piece || colorOf(piece) !== color || typeOf(piece) === "p" || typeOf(piece) === "k") return [];
    const mobility = ownMoves.filter((move) => move.from === square).length;
    const defended = ownMoves.some((move) => move.to === square && move.from !== square);
    const attackedByEnemy = enemyMoves.some((move) => move.to === square);
    return [{ square: squareName(square), type: typeOf(piece), activity: Math.min(10, mobility), mobility, defended, vulnerable: attackedByEnemy && !defended }];
  });
}

export function understandPosition(board: Board): PositionUnderstanding {
  const sideToMove = board.turn();
  const material = board.material();
  const whiteMoves = sideBoard(board, "w").legalMoves();
  const blackMoves = sideBoard(board, "b").legalMoves();
  const legal = sideToMove === "w" ? whiteMoves : blackMoves;
  const tacticalMoves = legal.filter((move) => board.makeMove(move).isInCheck(opposite(sideToMove)));
  const captures = legal.filter((move) => move.enPassant || board.pieceAt(move.to) !== null);
  const promotions = legal.filter((move) => !!move.promotion);
  const pawns = { w: pawnStructure(board, "w"), b: pawnStructure(board, "b") };
  const pieces = { w: pieceUnderstanding(board, "w", whiteMoves, blackMoves), b: pieceUnderstanding(board, "b", blackMoves, whiteMoves) };
  const development = {
    w: pieces.w.filter((piece) => ["n", "b"].includes(piece.type) && !["b1", "c1", "f1", "g1"].includes(piece.square)).length,
    b: pieces.b.filter((piece) => ["n", "b"].includes(piece.type) && !["b8", "c8", "f8", "g8"].includes(piece.square)).length,
  };
  return {
    sideToMove, material, materialAdvantage: material > 0 ? "white" : material < 0 ? "black" : "equal",
    king: { w: kingUnderstanding(board, "w"), b: kingUnderstanding(board, "b") }, pieces, pawns,
    tactics: { checks: tacticalMoves.length, captures: captures.length, promotions: promotions.length, forcingMoves: tacticalMoves.length + captures.length + promotions.length },
    space: { w: whiteMoves.length, b: blackMoves.length }, development,
  };
}
