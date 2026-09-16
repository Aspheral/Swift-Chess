import { Board, Color, Move } from "./board";
import { PositionUnderstanding, understandPosition } from "./understanding";

export type IdeaKind =
  | "tactical"
  | "attack"
  | "defend"
  | "improve-piece"
  | "create-weakness"
  | "simplify"
  | "complicate"
  | "create-threat"
  | "pawn-break"
  | "develop";

export interface ChessIdea {
  kind: IdeaKind;
  priority: number;
  reason: string;
  candidates: Move[];
}

export interface IdeaGeneration {
  understanding: PositionUnderstanding;
  ideas: ChessIdea[];
  candidates: Move[];
}

function uniqueMoves(moves: Move[]): Move[] {
  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = move.uci();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function captures(board: Board, moves: Move[]): Move[] {
  return moves.filter((move) => move.enPassant || board.pieceAt(move.to) !== null);
}

function quiet(moves: Move[], board: Board): Move[] {
  return moves.filter((move) => !move.enPassant && board.pieceAt(move.to) === null && !move.promotion);
}

function movesFromSquares(moves: Move[], squares: Set<string>): Move[] {
  return moves.filter((move) => {
    const from = `${"abcdefgh"[move.from & 7]}${Math.floor(move.from / 8) + 1}`;
    return squares.has(from);
  });
}

function tacticalIdeas(board: Board, understanding: PositionUnderstanding, legal: Move[]): ChessIdea[] {
  const ideas: ChessIdea[] = [];
  const checks = legal.filter((move) => board.makeMove(move).isInCheck(understanding.sideToMove === "w" ? "b" : "w"));
  const caps = captures(board, legal);
  const promotions = legal.filter((move) => !!move.promotion);
  const forcing = uniqueMoves([...checks, ...caps, ...promotions]);
  if (checks.length) ideas.push({ kind: "tactical", priority: 100, reason: "Immediate checks are available.", candidates: uniqueMoves(checks).slice(0, 8) });
  if (caps.length) ideas.push({ kind: "tactical", priority: 90, reason: "Captures are available and should be examined before quiet plans.", candidates: uniqueMoves(caps).slice(0, 8) });
  if (promotions.length) ideas.push({ kind: "tactical", priority: 110, reason: "A promotion is immediately available.", candidates: promotions.slice(0, 8) });
  if (!ideas.length && forcing.length) ideas.push({ kind: "tactical", priority: 80, reason: "Forcing moves deserve first examination.", candidates: forcing.slice(0, 8) });
  return ideas;
}

function strategicIdeas(board: Board, u: PositionUnderstanding, legal: Move[]): ChessIdea[] {
  const color = u.sideToMove;
  const own = u.pieces[color];
  const enemy = u.pieces[color === "w" ? "b" : "w"];
  const ideas: ChessIdea[] = [];
  const quietMoves = quiet(legal, board);
  const vulnerable = new Set(own.filter((piece) => piece.vulnerable).map((piece) => piece.square));
  const enemyVulnerable = new Set(enemy.filter((piece) => piece.vulnerable).map((piece) => piece.square));

  if (vulnerable.size) ideas.push({ kind: "defend", priority: 75, reason: "A piece is currently vulnerable.", candidates: movesFromSquares(legal, vulnerable).slice(0, 6) });
  if (enemyVulnerable.size) ideas.push({ kind: "attack", priority: 72, reason: "An enemy piece is vulnerable and can become a concrete target.", candidates: captures(board, legal).slice(0, 8) });

  const undeveloped = own.filter((piece) => ["n", "b"].includes(piece.type) && ["b1", "c1", "f1", "g1", "b8", "c8", "f8", "g8"].includes(piece.square));
  if (undeveloped.length) ideas.push({ kind: "develop", priority: 55, reason: "A minor piece remains on its original square.", candidates: movesFromSquares(legal, new Set(undeveloped.map((piece) => piece.square))).slice(0, 8) });

  const enemyKing = u.king[color === "w" ? "b" : "w"];
  if (enemyKing.exposed) ideas.push({ kind: "create-threat", priority: 65, reason: "The opposing king has reduced shelter or active pressure nearby.", candidates: quietMoves.slice(0, 8) });

  if (u.pawns[color].passed > 0) ideas.push({ kind: "create-threat", priority: 68, reason: "A passed pawn can become a source of pressure.", candidates: legal.filter((move) => board.pieceAt(move.from) === `${color}p`).slice(0, 8) });
  if (u.pawns[color].isolated + u.pawns[color].doubled + u.pawns[color].backward > 0) ideas.push({ kind: "create-weakness", priority: 45, reason: "The pawn structure contains a static weakness that may shape the plan.", candidates: quietMoves.slice(0, 8) });
  if (u.pawns[color].openFiles.length || u.pawns[color].semiOpenFiles.length) ideas.push({ kind: "attack", priority: 50, reason: "Open or semi-open files offer routes for pressure.", candidates: legal.filter((move) => ["r", "q"].includes(board.pieceAt(move.from)?.[1] ?? "")).slice(0, 8) });
  if (u.development[color] < u.development[color === "w" ? "b" : "w"]) ideas.push({ kind: "develop", priority: 60, reason: "Development is behind, so improving piece coordination has strategic value.", candidates: quietMoves.slice(0, 8) });

  const materialEdge = u.materialAdvantage === "equal" ? 0 : u.materialAdvantage === color === "w" ? 1 : -1;
  if (materialEdge > 0) ideas.push({ kind: "simplify", priority: 58, reason: "Material advantage makes favorable simplification a candidate plan.", candidates: captures(board, legal).slice(0, 8) });
  if (materialEdge < 0) ideas.push({ kind: "complicate", priority: 58, reason: "Material deficit makes active, forcing play worth considering.", candidates: uniqueMoves([...captures(board, legal), ...quietMoves]).slice(0, 8) });

  return ideas.filter((idea) => idea.candidates.length > 0);
}

export function generateIdeas(board: Board): IdeaGeneration {
  const understanding = understandPosition(board);
  const legal = board.legalMoves();
  const ideas = [...tacticalIdeas(board, understanding, legal), ...strategicIdeas(board, understanding, legal)]
    .sort((a, b) => b.priority - a.priority)
    .map((idea) => ({ ...idea, candidates: uniqueMoves(idea.candidates) }));
  return { understanding, ideas, candidates: uniqueMoves(ideas.flatMap((idea) => idea.candidates)) };
}

export { IdeaKind, ChessIdea };
