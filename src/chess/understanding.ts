import { Board, Color, PieceType } from "./board";

export interface PieceUnderstanding {
  square: string;
  type: PieceType;
  activity: number;
  mobility: number;
  defended: boolean;
  vulnerable: boolean;
}

export interface PawnStructureUnderstanding {
  isolated: number;
  doubled: number;
  backward: number;
  passed: number;
  chains: number;
  openFiles: number[];
  semiOpenFiles: number[];
}

export interface KingUnderstanding {
  square: string;
  pawnShield: number;
  escapeSquares: number;
  attackers: number;
  openFilesNearKing: number;
  exposed: boolean;
}

export interface TacticalUnderstanding {
  checks: number;
  captures: number;
  promotions: number;
  forcingMoves: number;
}

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

const VALUES: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const FILES = "abcdefgh";

const squareName = (index: number): string => `${FILES[index & 7]}${Math.floor(index / 8) + 1}`;
const colorOf = (piece: string): Color => piece[0] as Color;
const typeOf = (piece: string): PieceType => piece[1] as PieceType;
const opposite = (color: Color): Color => color === "w" ? "b" : "w";

function boardArray(board: Board): Array<string | null> {
  return Array.from({ length: 64 }, (_, square) => board.pieceAt(square));
}

function pawnFiles(squares: number[]): number[] {
  return Array.from(new Set(squares.map((square) => square & 7))).sort((a, b) => a - b);
}

function pawnStructure(board: Board, color: Color): PawnStructureUnderstanding {
  const squares = boardArray(board).flatMap((piece, square) => piece === `${color}p` ? [square] : []);
  const files = pawnFiles(squares);
  const counts = new Map<number, number>();
  for (const square of squares) counts.set(square & 7, (counts.get(square & 7) ?? 0) + 1);

  let isolated = 0;
  let doubled = 0;
  let passed = 0;
  let backward = 0;
  let chains = 0;
  const enemy = opposite(color);
  const enemyPawns = boardArray(board).flatMap((piece, square) => piece === `${enemy}p` ? [square] : []);

  for (const square of squares) {
    const file = square & 7;
    const rank = Math.floor(square / 8);
    if ((counts.get(file) ?? 0) > 1) doubled++;
    if (!files.includes(file - 1) && !files.includes(file + 1)) isolated++;

    const blockedByEnemyPawn = enemyPawns.some((enemySquare) => {
      const enemyFile = enemySquare & 7;
      const enemyRank = Math.floor(enemySquare / 8);
      return Math.abs(enemyFile - file) <= 1 && (color === "w" ? enemyRank > rank : enemyRank < rank);
    });
    if (!blockedByEnemyPawn) passed++;

    const front = square + (color === "w" ? 8 : -8);
    const frontLeft = front + (file > 0 ? -1 : 0);
    const frontRight = front + (file < 7 ? 1 : 0);
    const friendlyPawnSupports = [frontLeft, frontRight].some((s) => s >= 0 && s < 64 && board.pieceAt(s) === `${color}p`);
    const adjacentFriendly = [file - 1, file + 1].some((f) => f >= 0 && f < 8 && squares.some((s) => (s & 7) === f));
    if (!friendlyPawnSupports && adjacentFriendly && ((color === "w" && rank > 1) || (color === "b" && rank < 6))) backward++;
  }

  for (const square of squares) {
    const file = square & 7;
    const rank = Math.floor(square / 8);
    const connected = [file - 1, file + 1].some((f) => f >= 0 && f < 8 && squares.some((s) => {
      const r = Math.floor(s / 8);
      return (s & 7) === f && Math.abs(r - rank) <= 1;
    }));
    if (connected) chains++;
  }

  const openFiles: number[] = [];
  const semiOpenFiles: number[] = [];
  for (let file = 0; file < 8; file++) {
    const white = boardArray(board).some((piece, square) => piece === "wp" && (square & 7) === file);
    const black = boardArray(board).some((piece, square) => piece === "bp" && (square & 7) === file);
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
  const enemy = opposite(color);
  const pawnShield = [-1, 0, 1].filter((df) => {
    const f = file + df;
    const r = rank + (color === "w" ? 1 : -1);
    return f >= 0 && f < 8 && r >= 0 && r < 8 && board.pieceAt(r * 8 + f) === `${color}p`;
  }).length;
  const escapeSquares = board.legalMoves().filter((move) => move.from === square).length;
  const enemyBoard = Board.fromFEN(board.toFEN().replace(/^(\S+) \S+/, `$1 ${enemy}`));
  const attackers = enemyBoard.legalMoves().filter((move) => move.to === square).length;
  const openFilesNearKing = [-1, 0, 1].filter((df) => {
    const f = file + df;
    if (f < 0 || f > 7) return false;
    return !pieces.some((piece, s) => piece?.endsWith("p") && (s & 7) === f);
  }).length;
  return { square: squareName(square), pawnShield, escapeSquares, attackers, openFilesNearKing, exposed: pawnShield <= 1 || attackers > 0 || openFilesNearKing > 0 };
}

function pieceUnderstanding(board: Board, color: Color): PieceUnderstanding[] {
  const pieces = boardArray(board);
  return pieces.flatMap((piece, square) => {
    if (!piece || colorOf(piece) !== color || typeOf(piece) === "p" || typeOf(piece) === "k") return [];
    const mobility = board.legalMoves().filter((move) => move.from === square).length;
    const attackedByEnemy = Board.fromFEN(board.toFEN().replace(/^(\S+) \S+/, `$1 ${opposite(color)}`)).legalMoves().some((move) => move.to === square);
    const defended = board.legalMoves().some((move) => move.to === square && move.from !== square);
    return [{ square: squareName(square), type: typeOf(piece), activity: Math.min(10, mobility), mobility, defended, vulnerable: attackedByEnemy && !defended }];
  });
}

export function understandPosition(board: Board): PositionUnderstanding {
  const material = board.material();
  const legal = board.legalMoves();
  const tacticalMoves = legal.filter((move) => {
    const next = board.makeMove(move);
    return next.isInCheck(board.toFEN().split(/\s+/)[1] === "w" ? "b" : "w");
  });
  const captures = legal.filter((move) => move.enPassant || board.pieceAt(move.to) !== null);
  const promotions = legal.filter((move) => !!move.promotion);
  const pawns = { w: pawnStructure(board, "w"), b: pawnStructure(board, "b") };
  const pieces = { w: pieceUnderstanding(board, "w"), b: pieceUnderstanding(board, "b") };
  const space = { w: legal.length, b: Board.fromFEN(board.toFEN().replace(/^(\S+) \S+/, `$1 b`)).legalMoves().length };
  const development = {
    w: pieces.w.filter((piece) => ["n", "b"].includes(piece.type) && !["b1", "c1", "f1", "g1"].includes(piece.square)).length,
    b: pieces.b.filter((piece) => ["n", "b"].includes(piece.type) && !["b8", "c8", "f8", "g8"].includes(piece.square)).length,
  };
  return {
    sideToMove: board.toFEN().split(/\s+/)[1] as Color,
    material,
    materialAdvantage: material > 0 ? "white" : material < 0 ? "black" : "equal",
    king: { w: kingUnderstanding(board, "w"), b: kingUnderstanding(board, "b") },
    pieces,
    pawns,
    tactics: { checks: tacticalMoves.length, captures: captures.length, promotions: promotions.length, forcingMoves: tacticalMoves.length + captures.length + promotions.length },
    space,
    development,
  };
}

export { VALUES };
