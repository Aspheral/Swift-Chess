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

interface ConflictPair {
  leaderIndex: number;
  rivalIndex: number;
  conflict: number;
}

function candidateConflictPair<Idea extends string>(
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
): ConflictPair | null {
  if (candidates.length < 2) return null;
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index, adjusted: candidate.score + planBias(candidate.ideaKinds) }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, 3);
  const leader = ordered[0];
  const rival = ordered.slice(1).reduce((best, candidate) =>
    Math.abs(leader.adjusted - candidate.adjusted) < Math.abs(leader.adjusted - best.adjusted) ? candidate : best,
  );
  const gap = Math.max(0, leader.adjusted - rival.adjusted);
  const moveUncertainty = clamp01(1 - gap / 8);
  const conflict = ideaConflict(leader.candidate.ideaKinds, rival.candidate.ideaKinds);
  return {
    leaderIndex: leader.index,
    rivalIndex: rival.index,
    conflict: moveUncertainty * (0.35 + 0.65 * conflict),
  };
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
  return candidateConflictPair(candidates, planBias)?.conflict ?? 0;
}

/**
 * Return the two candidates that deserve a second look when personalized
 * strategic disagreement is strong enough. Human attention is local: Swift
 * should not make every plausible move deeper just because two ideas conflict.
 */
export function selectiveConflictCandidateIndexes<Idea extends string>(
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
): number[] {
  const pair = candidateConflictPair(candidates, planBias);
  return pair && pair.conflict >= 0.65 ? [pair.leaderIndex, pair.rivalIndex] : [];
}

/**
 * Compatibility helper for callers that only need the maximum consequence
 * depth. A genuine conflict can still add exactly one ply, never more.
 */
export function selectiveConsequenceDepth<Idea extends string>(
  baseDepth: number,
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
): number {
  const depth = Math.max(1, Math.floor(baseDepth));
  return selectiveConflictCandidateIndexes(candidates, planBias).length ? depth + 1 : depth;
}


/**
 * Allocate consequence-search depth per candidate. Only the two moves behind
 * unresolved strategic conflict receive Swift's optional extra look.
 */
export function selectiveCandidateDepths<Idea extends string>(
  baseDepth: number,
  candidates: SelectiveCandidate<Idea>[],
  planBias: (ideaKinds: Idea[]) => number,
  maxDepth = 5,
): number[] {
  const depth = Math.max(1, Math.min(maxDepth, Math.floor(baseDepth)));
  const focused = new Set(selectiveConflictCandidateIndexes(candidates, planBias));
  return candidates.map((_, index) => focused.has(index) ? Math.min(maxDepth, depth + 1) : depth);
}
