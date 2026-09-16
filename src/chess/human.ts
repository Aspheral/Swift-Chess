import { Board, Move } from "./board";
import { CandidateScore, scoreCandidates } from "./scoring";

export interface HumanSelectionOptions {
  candidateLimit?: number;
  randomness?: number;
  riskTolerance?: number;
  /** How much quality loss a human is willing to tolerate in a quiet position. */
  errorBudget?: number;
  /** Optional seed for reproducible human choices. */
  seed?: number;
  candidates?: CandidateScore[];
}

export interface HumanSelection {
  move: Move | null;
  candidates: CandidateScore[];
  selectedScore: number;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function selectHumanMove(board: Board, options: HumanSelectionOptions = {}): HumanSelection {
  const candidateLimit = Math.max(1, options.candidateLimit ?? 6);
  const randomness = Math.max(0, Math.min(1, options.randomness ?? 0.12));
  const riskTolerance = Math.max(0, Math.min(1, options.riskTolerance ?? 0.5));
  const errorBudget = Math.max(0, Math.min(1, options.errorBudget ?? 0.35));
  const generated = options.candidates ?? scoreCandidates(board).scores;
  const ranked = generated.slice(0, candidateLimit);
  if (!ranked.length) return { move: null, candidates: [], selectedScore: -Infinity };

  const topScore = ranked[0].score;
  const allowedLoss = errorBudget * 80;
  const eligible = ranked.filter((candidate) => candidate.score >= topScore - allowedLoss);
  const rng = options.seed === undefined ? Math.random : seededRandom(options.seed);
  const temperature = 1 + randomness * 5 + errorBudget * 7;

  const adjusted = eligible.map((candidate, index) => {
    const rankPenalty = index * (1.5 + (1 - errorBudget) * 2.5);
    const riskKinds = candidate.ideaKinds.filter(
      (kind) => kind === "complicate" || kind === "attack" || kind === "create-threat",
    ).length;
    const practicalRisk = riskKinds * 3 * riskTolerance;
    const value = candidate.score - rankPenalty + practicalRisk;
    return { candidate, value };
  });

  const best = adjusted.reduce((a, b) => (a.value >= b.value ? a : b));
  if (randomness === 0 && errorBudget === 0) {
    return { move: best.candidate.move, candidates: ranked, selectedScore: best.candidate.score };
  }

  const weights = adjusted.map(({ value }) => Math.exp((value - best.value) / (10 * temperature)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  let selected = adjusted[0].candidate;
  for (let index = 0; index < adjusted.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      selected = adjusted[index].candidate;
      break;
    }
  }

  return { move: selected.move, candidates: ranked, selectedScore: selected.score };
}
