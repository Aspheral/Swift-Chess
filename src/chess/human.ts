import { Board, Move } from "./board";
import { CandidateScore, scoreCandidates } from "./scoring";
import { understandPosition } from "./understanding";

export interface HumanSelectionOptions {
  candidateLimit?: number;
  randomness?: number;
  riskTolerance?: number;
  /** How much quality loss a human is willing to tolerate before position modifiers. */
  errorBudget?: number;
  /** Optional seed for reproducible human choices. */
  seed?: number;
  candidates?: CandidateScore[];
}

export interface HumanErrorProfile {
  /** Position complexity from legal-choice breadth. */
  complexity: number;
  /** Tactical pressure from forcing moves. */
  tacticalPressure: number;
  /** Game phase, where 0 is opening and 1 is endgame. */
  phase: number;
  /** Practical pressure from king exposure and material imbalance. */
  practicalPressure: number;
  /** Final normalized error budget used for candidate selection. */
  effectiveBudget: number;
}

export interface HumanSelection {
  move: Move | null;
  candidates: CandidateScore[];
  selectedScore: number;
  profile?: HumanErrorProfile;
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

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Turns a static human error setting into a position-aware decision budget.
 * Complex quiet positions allow more imperfect choices; tactical danger sharply
 * reduces the budget so Swift still behaves like a careful human under fire.
 */
export function humanErrorProfile(board: Board, baseBudget = 0.35): HumanErrorProfile {
  const understanding = understandPosition(board);
  const legalMoves = Math.max(1, understanding.space[understanding.sideToMove]);
  const complexity = clamp((legalMoves - 8) / 28);
  const tacticalPressure = clamp(understanding.tactics.forcingMoves / legalMoves);
  const totalPieces = understanding.pieces.w.length + understanding.pieces.b.length + 2;
  const phase = clamp((16 - totalPieces) / 10);
  const ownKing = understanding.king[understanding.sideToMove];
  const enemyKing = understanding.king[understanding.sideToMove === "w" ? "b" : "w"];
  const materialSwing = clamp(Math.abs(understanding.material) / 500);
  const kingPressure = clamp((ownKing.attackers * 0.35) + (ownKing.exposed ? 0.3 : 0) + (enemyKing.exposed ? 0.15 : 0));
  const practicalPressure = clamp(kingPressure + materialSwing * 0.35);

  const calmComplexityBonus = complexity * 0.55 + phase * 0.12;
  const pressurePenalty = tacticalPressure * 0.7 + practicalPressure * 0.55;
  const effectiveBudget = clamp(baseBudget * (1 + calmComplexityBonus - pressurePenalty));

  return { complexity, tacticalPressure, phase, practicalPressure, effectiveBudget };
}

export function selectHumanMove(board: Board, options: HumanSelectionOptions = {}): HumanSelection {
  const candidateLimit = Math.max(1, options.candidateLimit ?? 6);
  const randomness = clamp(options.randomness ?? 0.12);
  const riskTolerance = clamp(options.riskTolerance ?? 0.5);
  const baseBudget = clamp(options.errorBudget ?? 0.35);
  const generated = options.candidates ?? scoreCandidates(board).scores;
  const ranked = generated.slice(0, candidateLimit);
  if (!ranked.length) return { move: null, candidates: [], selectedScore: -Infinity };

  const profile = humanErrorProfile(board, baseBudget);
  const topScore = ranked[0].score;
  const allowedLoss = profile.effectiveBudget * 80;
  const eligible = ranked.filter((candidate) => candidate.score >= topScore - allowedLoss);
  const rng = options.seed === undefined ? Math.random : seededRandom(options.seed);
  const temperature = 1 + randomness * 5 + profile.effectiveBudget * 7;

  const adjusted = eligible.map((candidate, index) => {
    const rankPenalty = index * (1.5 + (1 - profile.effectiveBudget) * 2.5);
    const riskKinds = candidate.ideaKinds.filter(
      (kind) => kind === "complicate" || kind === "attack" || kind === "create-threat",
    ).length;
    const practicalRisk = riskKinds * 3 * riskTolerance * (1 - profile.tacticalPressure * 0.5);
    const value = candidate.score - rankPenalty + practicalRisk;
    return { candidate, value };
  });

  const best = adjusted.reduce((a, b) => (a.value >= b.value ? a : b));
  if (randomness === 0 && profile.effectiveBudget === 0) {
    return { move: best.candidate.move, candidates: ranked, selectedScore: best.candidate.score, profile };
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

  return { move: selected.move, candidates: ranked, selectedScore: selected.score, profile };
}
