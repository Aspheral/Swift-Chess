import type { SwiftPlayProfile } from "./play-profile";
import type { HumanEngineOptions } from "./human-engine";

export interface RapidThinkBudget {
  options: HumanEngineOptions;
  minimumThinkMs: number;
  targetTotalMs: number;
  reserveMs: number;
  emergency: boolean;
}
export interface RapidThinkContext {
  remainingMs: number;
  opponentMs: number;
  ply: number;
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * Position- and clock-aware search allocation. Soft total budgets account
 * for root search, verification and optional extra calculation. The real
 * browser clock separately enforces time forfeits if search overruns.
 */
export function allocateRapidThink(profile: SwiftPlayProfile, context: RapidThinkContext): RapidThinkBudget {
  const remaining = Math.max(0, context.remainingMs);
  const opponent = Math.max(0, context.opponentMs);
  const reserveMs = Math.min(12_000, Math.max(1_500, Math.round(remaining * 0.035)));
  const usable = Math.max(0, remaining - reserveMs);
  const emergency = remaining < 13_000 || usable < 700;

  const stageCap = profile.kind === "opening" ? 1_200
    : profile.kind === "tactical" ? 5_200
    : profile.kind === "endgame" ? 3_700 : 3_100;
  const clockAdvantage = remaining > opponent * 1.8 && remaining > 60_000 ? 1.12 : 1;
  const openingFactor = context.ply < 12 && profile.kind === "opening" ? 0.8 : 1;
  const desiredTotal = stageCap * clockAdvantage * openingFactor;
  const targetTotalMs = Math.max(0, Math.floor(Math.min(desiredTotal, usable * (remaining < 40_000 ? 0.12 : 0.18))));
  const primary = Math.max(20, Math.floor(Math.min(profile.options.timeMs ?? 600, targetTotalMs * 0.5)));
  const safetyScale = clamp(targetTotalMs / Math.max(1, desiredTotal), 0.08, 1);
  const safetyTimeMs = Math.max(15, Math.floor((profile.options.safetyTimeMs ?? 75) * safetyScale));
  const ponderTimeMs = Math.max(15, Math.floor((profile.options.ponderTimeMs ?? 90) * safetyScale));
  const extraBudget = Math.max(0, Math.floor(targetTotalMs - primary - safetyTimeMs * 2 - ponderTimeMs * 2 - 250));
  const configuredExtra = profile.options.adaptiveThinking && typeof profile.options.adaptiveThinking === "object"
    ? profile.options.adaptiveThinking : null;
  const permittedExtra = emergency ? 0 : Math.min(configuredExtra?.maxExtraMs ?? 0, extraBudget);
  const adaptiveThinking = permittedExtra >= 100
    ? { maxExtraMs: permittedExtra, extraDepth: configuredExtra?.extraDepth } : false;

  return {
    options: {
      ...profile.options,
      timeMs: primary, safetyTimeMs, ponderTimeMs, adaptiveThinking,
      tacticalSearchDepth: emergency ? 0 : profile.options.tacticalSearchDepth,
      safetyCandidateLimit: emergency ? Math.min(2, profile.options.safetyCandidateLimit ?? 2) : profile.options.safetyCandidateLimit,
    },
    minimumThinkMs: emergency ? 0 : Math.min(profile.minimumThinkMs, Math.max(0, usable - targetTotalMs)),
    targetTotalMs, reserveMs, emergency,
  };
}
