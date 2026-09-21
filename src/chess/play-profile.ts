import { Board } from "./board";
import { HumanEngineOptions } from "./human-engine";
import { humanErrorProfile } from "./human";

export const SWIFT_PLAY_PROFILE = "adaptive-human-v3";

export type SwiftThinkKind = "opening" | "calm" | "tactical" | "endgame";

export interface SwiftPlayProfile {
  kind: SwiftThinkKind;
  minimumThinkMs: number;
  options: HumanEngineOptions;
}

/**
 * Browser-facing search budget.
 *
 * Swift should feel like a person: familiar positions are played quickly,
 * ordinary positions get a short think, and tactical danger earns more time.
 * These limits are intentionally smaller than the old flat 800 ms budget and
 * are safe to use in calibration because they are deterministic from position.
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
        randomness: 0.003,
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
    return {
      kind: "opening",
      minimumThinkMs: 140,
      options: {
        depth: 5,
        timeMs: 350,
        randomness: 0.006,
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
        randomness: 0.003,
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

  return {
    kind: "calm",
    minimumThinkMs: 250,
    options: {
      depth: 5,
      timeMs: 600,
      randomness: 0.008,
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
