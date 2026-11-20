import type { IdeaKind } from "./ideas";

/**
 * Allow a little variety when the board admits genuinely different plans.
 * Variation is not a strength limiter, a blunder generator, or an alternative
 * to calculation: the caller supplies completed, consequence-verified moves.
 */
export interface VerifiedPlanOption {
  score: number;
  ideaKinds: readonly IdeaKind[];
}

export interface ContextualChoicePressure {
  tacticalPressure: number;
  practicalPressure: number;
}

export interface ContextualChoiceMind {
  plan: IdeaKind | null;
  confidence: number;
  planStallCycles?: number;
}

/** A bounded tie-breaking temperature, not a probability of playing a bad move. */
export function contextualChoiceUncertainty(
  candidates: readonly VerifiedPlanOption[],
  pressure: ContextualChoicePressure,
  mind?: ContextualChoiceMind,
): number {
  // Forced/unstable positions are for calculation, not experimentation.
  if (pressure.tacticalPressure >= 0.10 ||
      pressure.practicalPressure >= 0.45) return 0;

  const valid = candidates.filter((candidate) =>
    Number.isFinite(candidate.score) && candidate.ideaKinds.length > 0);
  if (valid.length < 2) return 0;

  const best = valid.reduce((a, b) => a.score >= b.score ? a : b);
  const near = valid.filter((candidate) => best.score - candidate.score <= 8);
  if (near.length < 2) return 0;

  // A collection of equivalent moves with the SAME reasoning does not justify
  // randomizing Swift's choice. A rival must offer a distinct positional idea.
  const leaderIdeas = new Set(best.ideaKinds);
  const rivals = near.filter((candidate) =>
    candidate !== best && candidate.ideaKinds.some((kind) =>
      kind !== "tactical" && !leaderIdeas.has(kind)));
  if (!rivals.length) return 0;

  // Closely verified alternatives invite a little deliberation latitude.
  // A confident, advancing plan narrows it; a stale plan allows reconsideration.
  const closestGap = Math.min(...rivals.map((candidate) => best.score - candidate.score));
  const closeness = Math.max(0, 1 - closestGap / 8);
  let uncertainty = 0.20 + 0.16 * closeness;
  const confidence = Math.max(0, Math.min(1, mind?.confidence ?? 0));
  const stalls = Math.max(0, mind?.planStallCycles ?? 0);
  if (mind?.plan && confidence >= 0.75 && stalls < 2) uncertainty *= 0.55;
  if (mind?.plan && stalls >= 3) uncertainty *= 1.10;
  return Math.min(0.40, Math.max(0, uncertainty));
}
