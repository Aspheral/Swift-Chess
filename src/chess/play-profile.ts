import { Board } from "./board";
import { HumanEngineOptions } from "./human-engine";
import { humanErrorProfile } from "./human";
import { generateIdeas } from "./ideas";
import { CandidateScore, scoreCandidates } from "./scoring";

export const SWIFT_PLAY_PROFILE = "adaptive-human-v8";

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
  // Candidate scores are intentionally coarse strategic evidence. A rival
  // within roughly eight points is close enough to deserve another look;
  // beyond that, the position has a comparatively clear human preference.
  return Math.max(0, Math.min(1, 1 - closestGap / 8));
}

/**
 * Distinguish several ways to execute one idea from a genuine conflict between
 * ideas. Humans can choose fairly quickly between two development moves that
 * serve the same plan, but competing plans deserve a more deliberate decision.
 */
export function candidateIdeaUncertainty(candidates: Array<Pick<CandidateScore, "score" | "ideaKinds">>): number {
  if (candidates.length < 2) return 0;
  const ordered = [...candidates].sort((a, b) => b.score - a.score).slice(0, 3);
  const leader = ordered[0];
  const leaderKinds = new Set(leader.ideaKinds);
  const competingIdeas = ordered.slice(1).filter((candidate) =>
    candidate.ideaKinds.every((kind) => !leaderKinds.has(kind)),
  );

  if (!competingIdeas.length) {
    // There is still some move-level choice, but it is mostly about execution
    // of the same strategic thought rather than choosing what Swift believes.
    return candidateDecisionUncertainty(ordered.map((candidate) => candidate.score)) * 0.35;
  }

  return candidateDecisionUncertainty([
    leader.score,
    ...competingIdeas.map((candidate) => candidate.score),
  ]);
}

/** Estimate how much a quiet position deserves a second look before committing. */
export function quietDecisionUncertainty(board: Board, practicalPressure: number): number {
  // Do not mistake a huge legal-move count for indecision. Humans discard many
  // legal moves immediately. Measure conflict among Swift's generated ideas,
  // then combine it with practical pressure from the position itself.
  const generation = generateIdeas(board);
  const candidates = scoreCandidates(board, 8, generation).scores;
  const choiceLoad = candidateIdeaUncertainty(candidates);
  const pressureLoad = Math.max(0, Math.min(1, practicalPressure / 0.48));
  return Math.max(choiceLoad, pressureLoad);
}

/**
 * Browser-facing search budget.
 *
 * Swift should feel like a person: familiar positions are played quickly,
 * ordinary positions get a short think, and tactical danger earns more time.
 * These limits are intentionally smaller than the old flat 800 ms budget and
 * are safe to use in calibration because they are deterministic from position.
 *
 * Default play deliberately carries no sampling randomness. Variation should
 * come from Swift's position interpretation, continuing plan, opponent model,
 * game history, and style preferences. Seeded/random sampling remains available
 * to explicit experiments through HumanEngineOptions, but it is not what makes
 * normal Swift play look human.
 */
export function swiftPlayProfile(board: Board, history: string[] = []): SwiftPlayProfile {
  const profile = humanErrorProfile(board, 0.05);
  const inCheck = board.isInCheck(board.turn());
  const opening = history.length < 12 && profile.gameStage === "opening";
  const tactical =
    inCheck ||
    profile.tacticalPressure >= 0.12 ||
    profile.practicalPressure >= 0.48;
  const endgame = profile.gameStage === "endgame";

  if (tactical) {
    return {
      kind: "tactical",
      minimumThinkMs: 380,
      options: {
        depth: 6,
        timeMs: 850,
        randomness: 0,
        errorBudget: 0.015,
        strictBestPlay: false,
        safetyDepth: 4,
        ponderDepth: 5,
        safetyMargin: 24,
        safetyTimeMs: 90,
        ponderTimeMs: 120,
        candidateLimit: 5,
        safetyCandidateLimit: 4,
        concreteCandidateLimit: 8,
        tacticalSearchDepth: 3,
      },
    };
  }

  if (opening) {
    // Humans tend to snap out the first familiar moves, then spend a little
    // longer as the opening becomes an actual decision. History depth gives us
    // that effect without timers, noise, or a random hesitation generator.
    const openingThinkMs = 90 + Math.min(150, history.length * 18);
    const openingSearchMs = 280 + Math.min(180, history.length * 22);
    return {
      kind: "opening",
      minimumThinkMs: openingThinkMs,
      options: {
        depth: 5,
        timeMs: openingSearchMs,
        randomness: 0,
        errorBudget: 0.035,
        strictBestPlay: false,
        safetyDepth: 3,
        ponderDepth: 3,
        safetyMargin: 30,
        safetyTimeMs: 55,
        ponderTimeMs: 70,
        candidateLimit: 4,
        safetyCandidateLimit: 2,
        concreteCandidateLimit: 6,
        tacticalSearchDepth: 2,
      },
    };
  }

  if (endgame) {
    return {
      kind: "endgame",
      minimumThinkMs: 260,
      options: {
        depth: 6,
        timeMs: 700,
        randomness: 0,
        errorBudget: 0.015,
        strictBestPlay: false,
        safetyDepth: 4,
        ponderDepth: 4,
        safetyMargin: 24,
        safetyTimeMs: 80,
        ponderTimeMs: 100,
        candidateLimit: 4,
        safetyCandidateLimit: 3,
        concreteCandidateLimit: 7,
        tacticalSearchDepth: 2,
      },
    };
  }

  const uncertainty = quietDecisionUncertainty(board, profile.practicalPressure);
  const calmThinkMs = 250 + Math.round(120 * uncertainty);
  const calmSearchMs = 600 + Math.round(180 * uncertainty);
  return {
    kind: "calm",
    minimumThinkMs: calmThinkMs,
    options: {
      depth: 5,
      timeMs: calmSearchMs,
      randomness: 0,
      errorBudget: 0.035,
      strictBestPlay: false,
      safetyDepth: 4,
      ponderDepth: 4,
      safetyMargin: 24,
      safetyTimeMs: 80,
      ponderTimeMs: 95,
      candidateLimit: 5,
      safetyCandidateLimit: 4,
      concreteCandidateLimit: 8,
      tacticalSearchDepth: 2,
    },
  };
}
