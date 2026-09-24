import { Board } from "./board";
import { HumanEngineOptions } from "./human-engine";
import { humanErrorProfile } from "./human";
import { generateIdeas } from "./ideas";
import { CandidateScore, scoreCandidates } from "./scoring";

export const SWIFT_PLAY_PROFILE = "adaptive-human-v9";

export type SwiftThinkKind = "opening" | "calm" | "tactical" | "endgame";

export interface SwiftPlayProfile {
  kind: SwiftThinkKind;
  minimumThinkMs: number;
  options: HumanEngineOptions;
}

/** How unresolved the leading strategically plausible choices are, from 0 to 1. */
export function candidateDecisionUncertainty(scores: number[]): number {
  if (scores.length < 2) return 0;
  const ordered = [...scores].sort((a, b) => b - a).slice(0, 3);
  const leader = ordered[0];
  const rivals = ordered.slice(1);
  const closestGap = Math.min(...rivals.map((score) => Math.max(0, leader - score)));
  return Math.max(0, Math.min(1, 1 - closestGap / 8));
}

/** How strategically different a rival is from the leading candidate, from 0 to 1. */
export function ideaConflict(leaderKinds: string[], rivalKinds: string[]): number {
  if (!leaderKinds.length || !rivalKinds.length) return 1;
  const leader = new Set(leaderKinds);
  const rival = new Set(rivalKinds);
  let shared = 0;
  for (const kind of rival) if (leader.has(kind)) shared += 1;
  const union = new Set([...leader, ...rival]).size;
  return union ? 1 - shared / union : 0;
}

/**
 * Distinguish several ways to execute one idea from a genuine conflict between
 * ideas. Partial overlap matters too: a move can support development while also
 * introducing a pawn break, which should create some hesitation without being
 * treated as a completely unrelated plan.
 */
export function candidateIdeaUncertainty(candidates: Array<Pick<CandidateScore, "score" | "ideaKinds">>): number {
  if (candidates.length < 2) return 0;
  const ordered = [...candidates].sort((a, b) => b.score - a.score).slice(0, 3);
  const leader = ordered[0];
  const moveUncertainty = candidateDecisionUncertainty(ordered.map((candidate) => candidate.score));
  const closestRival = ordered.slice(1).reduce((best, candidate) =>
    Math.abs(leader.score - candidate.score) < Math.abs(leader.score - best.score) ? candidate : best,
  );
  const conflict = ideaConflict(leader.ideaKinds, closestRival.ideaKinds);
  // Even interchangeable executions retain a little move-level uncertainty.
  // Strategic divergence then scales that uncertainty smoothly instead of
  // flipping between "same plan" and "different plan" as a binary switch.
  return moveUncertainty * (0.35 + 0.65 * conflict);
}

/** Estimate how much a quiet position deserves a second look before committing. */
export function quietDecisionUncertainty(board: Board, practicalPressure: number): number {
  const generation = generateIdeas(board);
  const candidates = scoreCandidates(board, 8, generation).scores;
  const choiceLoad = candidateIdeaUncertainty(candidates);
  const pressureLoad = Math.max(0, Math.min(1, practicalPressure / 0.48));
  return Math.max(choiceLoad, pressureLoad);
}

export function swiftPlayProfile(board: Board, history: string[] = []): SwiftPlayProfile {
  const profile = humanErrorProfile(board, 0.05);
  const inCheck = board.isInCheck(board.turn());
  const opening = history.length < 12 && profile.gameStage === "opening";
  const tactical = inCheck || profile.tacticalPressure >= 0.12 || profile.practicalPressure >= 0.48;
  const endgame = profile.gameStage === "endgame";

  if (tactical) {
    return {
      kind: "tactical",
      minimumThinkMs: 380,
      options: { depth: 6, timeMs: 850, randomness: 0, errorBudget: 0.015, strictBestPlay: false, safetyDepth: 4, ponderDepth: 5, safetyMargin: 24, safetyTimeMs: 90, ponderTimeMs: 120, candidateLimit: 5, safetyCandidateLimit: 4, concreteCandidateLimit: 8, tacticalSearchDepth: 3 },
    };
  }

  if (opening) {
    const openingThinkMs = 90 + Math.min(150, history.length * 18);
    const openingSearchMs = 280 + Math.min(180, history.length * 22);
    return {
      kind: "opening",
      minimumThinkMs: openingThinkMs,
      options: { depth: 5, timeMs: openingSearchMs, randomness: 0, errorBudget: 0.035, strictBestPlay: false, safetyDepth: 3, ponderDepth: 3, safetyMargin: 30, safetyTimeMs: 55, ponderTimeMs: 70, candidateLimit: 4, safetyCandidateLimit: 2, concreteCandidateLimit: 6, tacticalSearchDepth: 2 },
    };
  }

  if (endgame) {
    return {
      kind: "endgame",
      minimumThinkMs: 260,
      options: { depth: 6, timeMs: 700, randomness: 0, errorBudget: 0.015, strictBestPlay: false, safetyDepth: 4, ponderDepth: 4, safetyMargin: 24, safetyTimeMs: 80, ponderTimeMs: 100, candidateLimit: 4, safetyCandidateLimit: 3, concreteCandidateLimit: 7, tacticalSearchDepth: 2 },
    };
  }

  const uncertainty = quietDecisionUncertainty(board, profile.practicalPressure);
  const calmThinkMs = 250 + Math.round(120 * uncertainty);
  const calmSearchMs = 600 + Math.round(180 * uncertainty);
  return {
    kind: "calm",
    minimumThinkMs: calmThinkMs,
    options: { depth: 5, timeMs: calmSearchMs, randomness: 0, errorBudget: 0.035, strictBestPlay: false, safetyDepth: 4, ponderDepth: 4, safetyMargin: 24, safetyTimeMs: 80, ponderTimeMs: 95, candidateLimit: 5, safetyCandidateLimit: 4, concreteCandidateLimit: 8, tacticalSearchDepth: 2 },
  };
}
