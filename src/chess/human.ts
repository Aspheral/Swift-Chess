import { Board, Move } from "./board";
import { CandidateScore, scoreCandidates } from "./scoring";

export interface HumanSelectionOptions {
  candidateLimit?: number;
  randomness?: number;
  riskTolerance?: number;
}

export interface HumanSelection {
  move: Move | null;
  candidates: CandidateScore[];
  selectedScore: number;
}

function deterministicNoise(move: Move): number {
  let hash = 2166136261;
  for (const ch of move.uci()) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

export function selectHumanMove(board: Board, options: HumanSelectionOptions = {}): HumanSelection {
  const candidateLimit = Math.max(1, options.candidateLimit ?? 6);
  const randomness = Math.max(0, Math.min(1, options.randomness ?? 0.12));
  const riskTolerance = Math.max(0, Math.min(1, options.riskTolerance ?? 0.5));
  const generated = scoreCandidates(board);
  const candidates = generated.scores.slice(0, candidateLimit);
  if (!candidates.length) return { move: null, candidates: [], selectedScore: -Infinity };

  const adjusted = candidates.map((candidate, index) => {
    const rankPenalty = index * 2.5;
    const noise = (deterministicNoise(candidate.move) - 0.5) * randomness * 30;
    const riskKinds = candidate.ideaKinds.filter((kind) => kind === "complicate" || kind === "attack" || kind === "create-threat").length;
    const practicalRisk = riskKinds * 3 * riskTolerance;
    return { candidate, value: candidate.score - rankPenalty + noise + practicalRisk };
  });

  adjusted.sort((a, b) => b.value - a.value);
  const selected = adjusted[0].candidate;
  return { move: selected.move, candidates, selectedScore: selected.score };
}
