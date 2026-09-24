import { Board } from "./board";
import { HumanEngineOptions } from "./human-engine";
import { humanErrorProfile } from "./human";

export const SWIFT_PLAY_PROFILE = "adaptive-human-v6";

export type SwiftThinkKind = "opening" | "calm" | "tactical" | "endgame";

export interface SwiftPlayProfile {
  kind: SwiftThinkKind;
  minimumThinkMs: number;
  options: HumanEngineOptions;
}

/** Estimate how much a quiet position deserves a second look before committing. */
export function quietDecisionUncertainty(board: Board, practicalPressure: number): number {
  // A broad menu of plausible moves creates choice uncertainty even without a
  // tactic. Practical pressure adds a separate reason to hesitate. Neither is
  // random: the board itself decides whether Swift spends the extra time.
  const choiceLoad = Math.max(0, Math.min(1, (board.legalMoves().length - 18) / 18));
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
