/**
 * This measures evidence of a plan stalling, not whether the plan is correct.
 * An idea can require patience, so an unmoving metric NEVER forces a switch.
 * It only stops confidence increasing from mere survival, and lowers the
 * resistance to a better independently generated idea after repeated stalls.
 */
export interface PlanFollowThroughEvidence {
  priorStalls: number;
  planAge: number;
  progress: number;
  tacticalEmergency: boolean;
}

export interface PlanFollowThrough {
  stalledCycles: number;
  confidenceGrowthScale: number;
  inertiaReduction: number;
  reconsider: boolean;
}

export function assessPlanFollowThrough(evidence: PlanFollowThroughEvidence): PlanFollowThrough {
  const prior = Number.isFinite(evidence.priorStalls)
    ? Math.max(0, Math.min(6, Math.floor(evidence.priorStalls)))
    : 0;
  if (evidence.tacticalEmergency) {
    // Forcing play suspends strategic scoring; do not call it a stalled plan.
    return { stalledCycles: prior, confidenceGrowthScale: 0, inertiaReduction: 0, reconsider: false };
  }
  if (evidence.planAge < 1) {
    return { stalledCycles: 0, confidenceGrowthScale: 1, inertiaReduction: 0, reconsider: false };
  }
  if (evidence.progress >= 0.025) {
    return { stalledCycles: 0, confidenceGrowthScale: 1, inertiaReduction: 0, reconsider: false };
  }
  const stalledCycles = Math.min(6, prior + 1);
  // A patient idea can remain best. Only a *better competing idea* can change
  // the plan; this simply makes Swift willing to consider one sooner.
  const confidenceGrowthScale = stalledCycles === 1 ? 0.65 : stalledCycles === 2 ? 0.25 : 0;
  const inertiaReduction = Math.min(9, Math.max(0, stalledCycles - 1) * 3);
  return {
    stalledCycles,
    confidenceGrowthScale,
    inertiaReduction,
    reconsider: stalledCycles >= 3,
  };
}
