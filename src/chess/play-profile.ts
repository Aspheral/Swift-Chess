import { Board } from "./board";
import { HumanEngineOptions } from "./human-engine";
import { humanErrorProfile } from "./human";

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
      minimumThinkMs: 420,
      options: {
        depth: 5,
        timeMs: 760,
        randomness: 0.006,
        errorBudget: 0.025,
        strictBestPlay: false,
        safetyDepth: 4,
        ponderDepth: 4,
        safetyMargin: 24,
        safetyTimeMs: 80,
        ponderTimeMs: 100,
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
      minimumThinkMs: 160,
      options: {
        depth: 4,
        timeMs: 300,
        randomness: 0.008,
        errorBudget: 0.04,
        strictBestPlay: false,
        safetyDepth: 2,
        ponderDepth: 2,
        safetyMargin: 36,
        safetyTimeMs: 35,
        ponderTimeMs: 45,
        candidateLimit: 4,
        safetyCandidateLimit: 2,
        concreteCandidateLimit: 6,
        tacticalSearchDepth: 1,
      },
    };
  }

  if (endgame) {
    return {
      kind: "endgame",
      minimumThinkMs: 280,
      options: {
        depth: 5,
        timeMs: 640,
        randomness: 0.006,
        errorBudget: 0.025,
        strictBestPlay: false,
        safetyDepth: 4,
        ponderDepth: 4,
        safetyMargin: 24,
        safetyTimeMs: 70,
        ponderTimeMs: 90,
        candidateLimit: 4,
        safetyCandidateLimit: 3,
        concreteCandidateLimit: 7,
        tacticalSearchDepth: 2,
      },
    };
  }

  return {
    kind: "calm",
    minimumThinkMs: 280,
    options: {
      depth: 5,
      timeMs: 520,
      randomness: 0.012,
      errorBudget: 0.05,
      strictBestPlay: false,
      safetyDepth: 3,
      ponderDepth: 3,
      safetyMargin: 28,
      safetyTimeMs: 60,
      ponderTimeMs: 75,
      candidateLimit: 5,
      safetyCandidateLimit: 3,
      concreteCandidateLimit: 7,
      tacticalSearchDepth: 2,
    },
  };
}
