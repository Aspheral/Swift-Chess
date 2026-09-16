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

const center = new Set([27, 28, 35, 36]);

function boardWithTurn(board: Board, color: Color): Board {
  return Board.fromFEN(board.toFEN().replace(/ [wb] /, ` ${color} `));
}

function materialForSide(board: Board, side: Color): number {
  const material = board.material();
  return side === "w" ? material : -material;
}

function mobilityForSide(board: Board, side: Color): number {
  return boardWithTurn(board, side).legalMoves().length;
}

function movedPieceMobility(board: Board, move: Move, side: Color): number {
  const next = board.makeMove(move);
  return boardWithTurn(next, side).legalMoves().filter((candidate) => candidate.from === move.to).length;
}

function moveScore(
  board: Board,
  move: Move,
  ideaKinds: ChessIdea["kind"][],
  side: Color,
  beforeOwnMobility: number,
  beforeOpponentMobility: number,
): number {
  const moving = board.pieceAt(move.from);
  const beforeMaterial = materialForSide(board, side);
  const next = board.makeMove(move);
  const afterMaterial = materialForSide(next, side);
  const materialGain = afterMaterial - beforeMaterial;
  let score = materialGain * 0.35;

  // Material change already accounts for captures, en passant, and promotions.
  // Keep the material signal single-counted so exchanges do not get inflated.
  if (next.isCheckmate()) score += 500;
  else if (next.isInCheck(side === "w" ? "b" : "w")) score += 28;

  if (center.has(move.to)) score += 4;
  if (moving?.[1] === "p" && Math.abs(move.to - move.from) === 16) score += 1;

  const afterOpponentMobility = mobilityForSide(next, side === "w" ? "b" : "w");
  score += Math.max(-12, Math.min(12, (beforeOpponentMobility - afterOpponentMobility) * 0.5));

  if (moving && moving[0] === side) {
    const afterOwnMobility = mobilityForSide(next, side);
    score += Math.max(-6, Math.min(8, (afterOwnMobility - beforeOwnMobility) * 0.15));

    if (!move.promotion && moving[1] !== "p" && !board.pieceAt(move.to)) {
      const beforePieceMobility = board.legalMoves().filter((candidate) => candidate.from === move.from).length;
      const afterPieceMobility = movedPieceMobility(board, move, side);
      score += Math.max(-5, Math.min(7, (afterPieceMobility - beforePieceMobility) * 0.5));
    }
  }

  // Idea labels are supporting evidence, not the main evaluation. Each kind is
  // applied once after move consequences have been measured.
  if (ideaKinds.includes("tactical")) score += 10;
  if (ideaKinds.includes("defend")) score += moving?.[0] === side ? 4 : 0;
  if (ideaKinds.includes("develop") && ["n", "b"].includes(moving?.[1] ?? "")) score += 4;
  if (ideaKinds.includes("create-threat")) score += 3;
  if (ideaKinds.includes("attack")) score += 2.5;
  if (ideaKinds.includes("simplify") && move.to !== move.from) score += 1.5;
  if (ideaKinds.includes("complicate") && !board.pieceAt(move.to)) score += 1.5;
  if (ideaKinds.includes("create-weakness") && moving?.[1] === "p") score += 1.5;
  return score;
}

interface MoveEvidence {
  move: Move;
  ideaKinds: ChessIdea["kind"][];
  reasons: string[];
  priority: number;
}

export function scoreCandidates(board: Board): CandidateGeneration {
  const generated = generateIdeas(board);
  const side = generated.understanding.sideToMove;
  const beforeOwnMobility = mobilityForSide(board, side);
  const beforeOpponentMobility = mobilityForSide(board, side === "w" ? "b" : "w");
  const byMove = new Map<string, MoveEvidence>();

  // First aggregate the strategic evidence for each move. This prevents a move
  // that happens to satisfy several ideas from repeatedly paying the concrete
  // move-evaluation cost or stacking the same label bonus over and over.
  for (const idea of generated.ideas) {
    for (const move of idea.candidates) {
      const key = move.uci();
      const existing = byMove.get(key);
      if (existing) {
        existing.priority += idea.priority;
        if (!existing.ideaKinds.includes(idea.kind)) existing.ideaKinds.push(idea.kind);
        if (!existing.reasons.includes(idea.reason)) existing.reasons.push(idea.reason);
      } else {
        byMove.set(key, {
          move,
          priority: idea.priority,
          ideaKinds: [idea.kind],
          reasons: [idea.reason],
        });
      }
    }
  }

  const scores = [...byMove.values()]
    .map((entry) => ({
      move: entry.move,
      // Priority provides a small strategic prior. Concrete consequences remain
      // the dominant signal, while multiple independent ideas add modest evidence.
      score: moveScore(board, entry.move, entry.ideaKinds, side, beforeOwnMobility, beforeOpponentMobility)
        + Math.min(12, entry.priority * 0.15),
      ideaKinds: entry.ideaKinds,
      reasons: entry.reasons,
    }))
    .sort((a, b) => b.score - a.score);

  return { scores, candidates: scores.map((entry) => entry.move) };
}
