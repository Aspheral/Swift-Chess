import { Board, Move } from "./board";
import { PositionUnderstanding, understandPosition } from "./understanding";

export type IdeaKind = "tactical" | "attack" | "defend" | "improve-piece" | "create-weakness" | "simplify" | "complicate" | "create-threat" | "pawn-break" | "develop";
export interface ChessIdea { kind: IdeaKind; priority: number; reason: string; candidates: Move[]; }
export interface IdeaGeneration { understanding: PositionUnderstanding; ideas: ChessIdea[]; candidates: Move[]; }

const squareName = (s: number) => `${"abcdefgh"[s & 7]}${Math.floor(s / 8) + 1}`;
const uniqueMoves = (moves: Move[]) => { const seen = new Set<string>(); return moves.filter((m) => !seen.has(m.uci()) && seen.add(m.uci())); };
const captures = (board: Board, moves: Move[]) => moves.filter((m) => m.enPassant || board.pieceAt(m.to) !== null);
const quiet = (board: Board, moves: Move[]) => moves.filter((m) => !m.enPassant && !board.pieceAt(m.to) && !m.promotion);

function fromSquares(moves: Move[], squares: Set<string>) { return moves.filter((m) => squares.has(squareName(m.from))); }

function tacticalIdeas(board: Board, u: PositionUnderstanding, legal: Move[]): ChessIdea[] {
  const checks = legal.filter((m) => board.makeMove(m).isInCheck(u.sideToMove === "w" ? "b" : "w"));
  const caps = captures(board, legal);
  const promotions = legal.filter((m) => !!m.promotion);
  const ideas: ChessIdea[] = [];
  if (promotions.length) ideas.push({ kind: "tactical", priority: 110, reason: "A promotion is immediately available.", candidates: promotions.slice(0, 8) });
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
  const vulnerable = new Set(own.filter((p) => p.vulnerable).map((p) => p.square));
  if (vulnerable.size) ideas.push({ kind: "defend", priority: 75, reason: "A piece is currently vulnerable.", candidates: fromSquares(legal, vulnerable).slice(0, 8) });

  const enemyVulnerable = new Set(enemy.filter((p) => p.vulnerable).map((p) => p.square));
  if (enemyVulnerable.size) ideas.push({ kind: "attack", priority: 72, reason: "An enemy piece is vulnerable and can become a concrete target.", candidates: captures(board, legal).slice(0, 8) });

  const home = color === "w" ? new Set(["b1", "c1", "f1", "g1"]) : new Set(["b8", "c8", "f8", "g8"]);
  const undeveloped = own.filter((p) => ["n", "b"].includes(p.type) && home.has(p.square));
  if (undeveloped.length) ideas.push({ kind: "develop", priority: 55, reason: "A minor piece remains on its original square.", candidates: fromSquares(legal, new Set(undeveloped.map((p) => p.square))).slice(0, 8) });

  const enemyKing = u.king[enemyColor];
  if (enemyKing.exposed) ideas.push({ kind: "create-threat", priority: 65, reason: "The opposing king has reduced shelter or active pressure nearby.", candidates: quietMoves.slice(0, 8) });
  if (u.pawns[color].passed > 0) ideas.push({ kind: "create-threat", priority: 68, reason: "A passed pawn can become a source of pressure.", candidates: legal.filter((m) => board.pieceAt(m.from) === `${color}p`).slice(0, 8) });
  if (u.pawns[color].isolated + u.pawns[color].doubled + u.pawns[color].backward > 0) ideas.push({ kind: "create-weakness", priority: 45, reason: "The pawn structure contains a static weakness that may shape the plan.", candidates: quietMoves.slice(0, 8) });
  if (u.pawns[color].openFiles.length || u.pawns[color].semiOpenFiles.length) ideas.push({ kind: "attack", priority: 50, reason: "Open or semi-open files offer routes for pressure.", candidates: legal.filter((m) => ["r", "q"].includes(board.pieceAt(m.from)?.[1] ?? "")).slice(0, 8) });

  const opponentDev = u.development[enemyColor];
  if (u.development[color] < opponentDev) ideas.push({ kind: "develop", priority: 60, reason: "Development is behind, so improving piece coordination has strategic value.", candidates: quietMoves.slice(0, 8) });
  if ((u.materialAdvantage === "white" && color === "w") || (u.materialAdvantage === "black" && color === "b")) ideas.push({ kind: "simplify", priority: 58, reason: "Material advantage makes favorable simplification a candidate plan.", candidates: captures(board, legal).slice(0, 8) });
  if ((u.materialAdvantage === "white" && color === "b") || (u.materialAdvantage === "black" && color === "w")) ideas.push({ kind: "complicate", priority: 58, reason: "Material deficit makes active, forcing play worth considering.", candidates: uniqueMoves([...captures(board, legal), ...quietMoves]).slice(0, 8) });
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
