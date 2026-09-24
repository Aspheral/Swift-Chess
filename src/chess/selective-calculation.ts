export interface SelectiveCandidate<Idea extends string = string> {
  score: number;
  ideaKinds: Idea[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ideaConflict<Idea extends string>(leaderKinds: Idea[], rivalKinds: Idea[]): number {
  if (!leaderKinds.length || !rivalKinds.length) return 1;
  const leader = new Set(leaderKinds);
  const rival = new Set(rivalKinds);
  let shared = 0;
  for (const kind of rival) if (leader.has(kind)) shared += 1;
  const union = new Set([...leader, ...rival]).size;
  return union ? 1 - shared / union : 0;
}

/**
 * Measure unresolved strategic disagreement after Swift's current plan has had
 * its say. This intentionally uses adjusted candidate scores rather than raw
 * move count: a remembered plan can turn an apparent tie into a clear human
 * preference, while genuinely competing ideas remain ambiguous.
 */
export function personalizedCandidateConflict<Idea extends string>(
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
): number {
  if (candidates.length < 2) return 0;
  const ordered = candidates
    .map((candidate) => ({ candidate, adjusted: candidate.score + planBias(candidate.ideaKinds) }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, 3);
  const leader = ordered[0];
  const rival = ordered.slice(1).reduce((best, candidate) =>
    Math.abs(leader.adjusted - candidate.adjusted) < Math.abs(leader.adjusted - best.adjusted) ? candidate : best,
  );
  const gap = Math.max(0, leader.adjusted - rival.adjusted);
  const moveUncertainty = clamp01(1 - gap / 8);
  const conflict = ideaConflict(leader.candidate.ideaKinds, rival.candidate.ideaKinds);
  return moveUncertainty * (0.35 + 0.65 * conflict);
}

/**
 * A genuine conflict between personalized strategic choices earns one extra
 * consequence ply, never more. Clear preferences keep the normal depth.
 */
export function selectiveConsequenceDepth<Idea extends string>(
  baseDepth: number,
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
): number {
  const depth = Math.max(1, Math.floor(baseDepth));
  return personalizedCandidateConflict(candidates, planBias) >= 0.65 ? depth + 1 : depth;
}
