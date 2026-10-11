import type { SearchResult } from "./engine";
import type { CandidateScore } from "./scoring";
import type { HumanErrorProfile } from "./human";
import type { SwiftMindSnapshot } from "./mind";

export type SwiftSecondLookReason = "search-shift" | "king-danger" | "competing-plans" | "serious-position";

export interface SwiftSecondLook {
  reason: SwiftSecondLookReason;
  /** New iterative-deepening ceiling, relative to the requested primary search. */
  depth: number;
  /** Maximum milliseconds for the additional concrete search. */
  timeMs: number;
}

export interface AdaptiveThinkingOptions {
  /** Explicit budget ceiling; no extension occurs unless enabled. */
  maxExtraMs: number;
  /** Additional search plies; bounded to two so the browser worker stays responsive. */
  extraDepth?: number;
}

export interface SecondLookEvidence {
  legalMoves: number;
  historyLength: number;
  inCheck: boolean;
  searchDepth: number;
  baseTimeMs?: number;
  result: Pick<SearchResult, "depth" | "score" | "stability">;
  profile: Pick<HumanErrorProfile, "tacticalPressure" | "practicalPressure">;
  mind: Pick<SwiftMindSnapshot, "setbacks" | "opponent">;
  candidates: Array<Pick<CandidateScore, "score" | "ideaKinds">>;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Competing *ideas* matter more than raw legal-move count. Strategic evidence
 * is not a centipawn value, so use a separate, narrow closeness window.
 */
export function strategicDisagreement(candidates: SecondLookEvidence["candidates"]): number {
  if (candidates.length < 2) return 0;
  const ranked = [...candidates].filter((c) => Number.isFinite(c.score)).sort((a, b) => b.score - a.score).slice(0, 3);
  if (ranked.length < 2) return 0;
  const leader = ranked[0];
  let disagreement = 0;
  for (const rival of ranked.slice(1)) {
    const gap = Math.max(0, leader.score - rival.score);
    const overlap = rival.ideaKinds.filter((kind) => leader.ideaKinds.includes(kind)).length;
    const union = new Set([...leader.ideaKinds, ...rival.ideaKinds]).size;
    const conflict = union > 0 ? 1 - overlap / union : 1;
    disagreement = Math.max(disagreement, clamp01(1 - gap / 9) * conflict);
  }
  return disagreement;
}

/**
 * Called *after* an initial iterative-deepening search. Swift may discover it
 * was overconfident, or notice a serious tactical/strategic situation. A second
 * search does actual calculation: this is not an artificial sleep, rating claim,
 * or engine-randomness dial. It is opt-in and has a strict additional budget.
 */
export function planAdaptiveSecondLook(
  evidence: SecondLookEvidence,
  config?: AdaptiveThinkingOptions | false,
): SwiftSecondLook | null {
  if (!config || !Number.isFinite(config.maxExtraMs) || config.maxExtraMs < 100) return null;
  if (evidence.legalMoves <= 1 || Math.abs(evidence.result.score) >= 98_000) return null;

  const { tacticalPressure, practicalPressure } = evidence.profile;
  const swing = evidence.result.stability?.scoreSwingCp ?? 0;
  const changedMind = evidence.result.stability?.moveChanged ?? false;
  const disagreement = strategicDisagreement(evidence.candidates);
  const unexpected = (evidence.result.depth >= 2 && (changedMind || swing >= 65)) ||
    (evidence.result.stability?.interrupted && disagreement >= 0.7);
  const kingDanger = evidence.inCheck || tacticalPressure >= 0.23;
  const serious = practicalPressure >= 0.62 ||
    (evidence.mind.setbacks >= 2 && (practicalPressure > 0.22 || tacticalPressure > 0.08)) ||
    (evidence.mind.opponent.aggression >= 0.6 && tacticalPressure >= 0.12);
  const competingPlans = disagreement >= 0.78 && evidence.historyLength >= 8;

  // Do not turn the familiar first moves into long, staged delays.
  if (!unexpected && !kingDanger && !serious && !competingPlans) return null;

  const reason: SwiftSecondLookReason = unexpected ? "search-shift"
    : kingDanger ? "king-danger"
    : serious ? "serious-position"
    : "competing-plans";

  const cappedExtraMs = Math.max(100, Math.min(2200, Math.floor(config.maxExtraMs)));
  const severity = Number(unexpected) + Number(kingDanger) + Number(serious);
  const desiredMs = Math.max(420, Math.round((evidence.baseTimeMs ?? 650) * (0.85 + 0.18 * severity)));
  const timeMs = Math.min(cappedExtraMs, desiredMs);
  const maxDepthBonus = Math.min(2, Math.max(1, Math.floor(config.extraDepth ?? 2)));
  const depthBonus = maxDepthBonus === 2 && (unexpected || kingDanger || serious) ? 2 : 1;
  return { reason, depth: Math.max(1, Math.floor(evidence.searchDepth)) + depthBonus, timeMs };
}
