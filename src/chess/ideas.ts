import { Board, Move, Color, PieceType } from "./board";
import { PositionUnderstanding, understandPosition } from "./understanding";

export type IdeaKind = "tactical" | "attack" | "defend" | "improve-piece" | "create-weakness" | "simplify" | "complicate" | "create-threat" | "pawn-break" | "develop";
export interface ChessIdea { kind: IdeaKind; priority: number; reason: string; candidates: Move[]; }
export interface IdeaGeneration { understanding: PositionUnderstanding; ideas: ChessIdea[]; candidates: Move[]; }

const squareName = (s: number) => `${"abcdefgh"[s & 7]}${Math.floor(s / 8) + 1}`;
const squareIndex = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const uniqueMoves = (moves: Move[]) => { const seen = new Set<string>(); return moves.filter((m) => !seen.has(m.uci()) && seen.add(m.uci())); };
const captures = (board: Board, moves: Move[]) => moves.filter((m) => m.enPassant || board.pieceAt(m.to) !== null);
const quiet = (board: Board, moves: Move[]) => moves.filter((m) => !m.enPassant && !board.pieceAt(m.to) && !m.promotion);
const pieceType = (board: Board, move: Move): PieceType | null => {
  const piece = board.pieceAt(move.from);
  return piece ? (piece[1] as PieceType) : null;
};

function fromSquares(moves: Move[], squares: Set<string>) { return moves.filter((m) => squares.has(squareName(m.from))); }

function attacksSquare(board: Board, color: Color, square: string): boolean {
  return board.isSquareAttacked(squareIndex(square), color);
}

function tacticalIdeas(board: Board, u: PositionUnderstanding, legal: Move[]): ChessIdea[] {
  const enemyColor = u.sideToMove === "w" ? "b" : "w";
  const mates = legal.filter((m) => board.makeMove(m).isCheckmate());
  const checks = legal.filter((m) => board.makeMove(m).isInCheck(enemyColor));
  const caps = captures(board, legal);
  const promotions = legal.filter((m) => !!m.promotion);
  const ideas: ChessIdea[] = [];
  if (mates.length) ideas.push({ kind: "tactical", priority: 120, reason: "Checkmate is immediately available.", candidates: uniqueMoves(mates).slice(0, 8) });
  if (promotions.length) ideas.push({ kind: "tactical", priority: 110, reason: "A promotion is immediately available.", candidates: uniqueMoves(promotions).slice(0, 8) });
  if (checks.length) ideas.push({ kind: "tactical", priority: 100, reason: "Immediate checks are available.", candidates: uniqueMoves(checks).slice(0, 8) });
  if (caps.length) ideas.push({ kind: "tactical", priority: 90, reason: "Captures are available and should be examined before quiet plans.", candidates: uniqueMoves(caps).slice(0, 8) });
  return ideas;
}

function strategicIdeas(board: Board, u: PositionUnderstanding, legal: Move[]): ChessIdea[] {
  const color = u.sideToMove;
  const enemyColor = color === "w" ? "b" : "w";
  const own = u.pieces[color];
  const enemy = u.pieces[enemyColor];
  const quietMoves = quiet(board, legal);
  const ideas: ChessIdea[] = [];

  const vulnerableOwn = own.filter((p) => p.vulnerable);
  if (vulnerableOwn.length) {
    const candidates = legal.filter((move) => {
      if (vulnerableOwn.some((p) => p.square === squareName(move.from))) return true;
      const next = board.makeMove(move);
      return vulnerableOwn.some((p) => attacksSquare(next, color, p.square));
    });
    if (candidates.length) ideas.push({ kind: "defend", priority: 75, reason: "A piece is currently vulnerable, so adding protection or moving it to safety is a concrete defensive plan.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }

  const vulnerableEnemy = enemy.filter((p) => p.vulnerable);
  if (vulnerableEnemy.length) {
    const candidates = legal.filter((move) => {
      if (vulnerableEnemy.some((p) => p.square === squareName(move.to))) return true;
      const next = board.makeMove(move);
      return vulnerableEnemy.some((p) => attacksSquare(next, color, p.square));
    });
    if (candidates.length) ideas.push({ kind: "attack", priority: 72, reason: "An enemy piece is vulnerable and can be directly attacked or captured.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }

  const home = color === "w" ? new Set(["b1", "c1", "f1", "g1"]) : new Set(["b8", "c8", "f8", "g8"]);
  const undeveloped = own.filter((p) => ["n", "b"].includes(p.type) && home.has(p.square));
  if (undeveloped.length) {
    const candidates = fromSquares(quietMoves, new Set(undeveloped.map((p) => p.square)));
    if (candidates.length) ideas.push({ kind: "develop", priority: 55, reason: "A minor piece remains on its original square and can improve development.", candidates: candidates.slice(0, 8) });
  }

  // Keep idea generation cheap. Strategic improvement is a broad concept, so
  // use destination activity and centralization rather than a fresh legal-move
  // generation for every quiet move.
  const improvementCandidates = quietMoves.filter((move) => {
    const type = pieceType(board, move);
    if (!type || type === "p" || type === "k") return false;
    const centralAfter = [27, 28, 35, 36].includes(move.to);
    const destinationIsSafe = !board.isSquareAttacked(move.to, enemyColor);
    const destinationIsActive = board.isSquareAttacked(move.to, color);
    return centralAfter || (destinationIsSafe && destinationIsActive);
  });
  if (improvementCandidates.length) ideas.push({ kind: "improve-piece", priority: 52, reason: "A piece can move to a more active square or gain useful mobility.", candidates: uniqueMoves(improvementCandidates).slice(0, 8) });

  const enemyKing = u.king[enemyColor];
  if (enemyKing.exposed) {
    const candidates = quietMoves.filter((move) => {
      const next = board.makeMove(move);
      return next.isInCheck(enemyColor) || enemy.some((p) => attacksSquare(next, color, p.square));
    });
    if (candidates.length) ideas.push({ kind: "create-threat", priority: 65, reason: "The opposing king is exposed, so a concrete new check or attack can increase the pressure.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }

  if (u.pawns[color].passed > 0) {
    const candidates = legal.filter((m) => board.pieceAt(m.from) === `${color}p` && !board.pieceAt(m.to));
    if (candidates.length) ideas.push({ kind: "create-threat", priority: 68, reason: "A passed pawn can advance and create a concrete source of pressure.", candidates: candidates.slice(0, 8) });
  }

  const pawnBreaks = legal.filter((move) => {
    if (pieceType(board, move) !== "p") return false;
    const file = move.to & 7;
    return enemy.some((p) => p.type === "p" && Math.abs((p.square.charCodeAt(0) - 97) - file) === 1 && Math.abs(Number(p.square[1]) - (Math.floor(move.to / 8) + 1)) <= 2);
  });
  if (pawnBreaks.length) ideas.push({ kind: "pawn-break", priority: 54, reason: "A pawn advance can challenge the opposing pawn structure and open lines.", candidates: uniqueMoves(pawnBreaks).slice(0, 8) });

  if (u.pawns[color].isolated + u.pawns[color].doubled + u.pawns[color].backward > 0) {
    const candidates = quietMoves.filter((move) => pieceType(board, move) === "p" || ["r", "q"].includes(pieceType(board, move) ?? ""));
    if (candidates.length) ideas.push({ kind: "create-weakness", priority: 45, reason: "The pawn structure contains a static weakness that can be used to create or target pressure.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }

  if (u.pawns[color].openFiles.length || u.pawns[color].semiOpenFiles.length) {
    const candidates = legal.filter((m) => ["r", "q"].includes(pieceType(board, m) ?? ""));
    if (candidates.length) ideas.push({ kind: "attack", priority: 50, reason: "Open or semi-open files offer routes for rook and queen pressure.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }

  const opponentDev = u.development[enemyColor];
  if (u.development[color] < opponentDev && quietMoves.length) ideas.push({ kind: "develop", priority: 60, reason: "Development is behind, so improving piece coordination has strategic value.", candidates: quietMoves.filter((m) => ["n", "b", "k"].includes(pieceType(board, m) ?? "")).slice(0, 8) });
  if ((u.materialAdvantage === "white" && color === "w") || (u.materialAdvantage === "black" && color === "b")) {
    const candidates = captures(board, legal);
    if (candidates.length) ideas.push({ kind: "simplify", priority: 58, reason: "Material advantage makes favorable simplification a candidate plan.", candidates: uniqueMoves(candidates).slice(0, 8) });
  }
  if ((u.materialAdvantage === "white" && color === "b") || (u.materialAdvantage === "black" && color === "w")) {
    const candidates = uniqueMoves([...captures(board, legal), ...quietMoves.filter((m) => ["n", "b", "r", "q"].includes(pieceType(board, m) ?? ""))]);
    if (candidates.length) ideas.push({ kind: "complicate", priority: 58, reason: "Material deficit makes active, forcing play worth considering.", candidates: candidates.slice(0, 8) });
  }
  return ideas.filter((i) => i.candidates.length);
}

export function generateIdeas(board: Board): IdeaGeneration {
  const understanding = understandPosition(board);
  const legal = board.legalMoves();
  const ideas = [...tacticalIdeas(board, understanding, legal), ...strategicIdeas(board, understanding, legal)]
    .sort((a, b) => b.priority - a.priority)
    .map((i) => ({ ...i, candidates: uniqueMoves(i.candidates) }));
  return { understanding, ideas, candidates: uniqueMoves(ideas.flatMap((i) => i.candidates)) };
}
