import { Board, Color, Move } from "./board";
import { ChessIdea, generateIdeas } from "./ideas";

export interface CandidateScore {
  move: Move;
  score: number;
  ideaKinds: ChessIdea["kind"][];
  reasons: string[];
}

export interface CandidateGeneration {
  scores: CandidateScore[];
  candidates: Move[];
}

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const center = new Set([27, 28, 35, 36]);

function moveScore(board: Board, move: Move, ideaKinds: ChessIdea["kind"][], side: Color): number {
  let score = 0;
  const moving = board.pieceAt(move.from);
  const captured = board.pieceAt(move.to);
  if (captured) score += (PIECE_VALUES[captured[1]] ?? 0) / 10;
  if (move.promotion) score += (PIECE_VALUES[move.promotion] ?? 0) / 10;
  if (center.has(move.to)) score += 4;
  if (moving?.[1] === "p" && Math.abs(move.to - move.from) === 16) score += 1;
  if (ideaKinds.includes("tactical")) score += 18;
  if (ideaKinds.includes("defend")) score += moving?.[0] === side ? 8 : 0;
  if (ideaKinds.includes("develop") && ["n", "b"].includes(moving?.[1] ?? "")) score += 7;
  if (ideaKinds.includes("create-threat")) score += 6;
  if (ideaKinds.includes("attack")) score += 5;
  if (ideaKinds.includes("simplify")) score += captured ? 5 : 0;
  if (ideaKinds.includes("complicate") && !captured) score += 4;
  if (ideaKinds.includes("create-weakness") && moving?.[1] === "p") score += 3;
  return score;
}

export function scoreCandidates(board: Board): CandidateGeneration {
  const generated = generateIdeas(board);
  const byMove = new Map<string, CandidateScore>();
  for (const idea of generated.ideas) {
    for (const move of idea.candidates) {
      const key = move.uci();
      const existing = byMove.get(key);
      const local = moveScore(board, move, [idea.kind], generated.understanding.sideToMove);
      if (existing) {
        existing.score += local + idea.priority / 10;
        if (!existing.ideaKinds.includes(idea.kind)) existing.ideaKinds.push(idea.kind);
        if (!existing.reasons.includes(idea.reason)) existing.reasons.push(idea.reason);
      } else {
        byMove.set(key, { move, score: idea.priority + local, ideaKinds: [idea.kind], reasons: [idea.reason] });
      }
    }
  }
  const scores = [...byMove.values()].sort((a, b) => b.score - a.score);
  return { scores, candidates: scores.map((entry) => entry.move) };
}
