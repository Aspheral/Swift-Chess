import type { SwiftDecisionTrace } from "./human-engine";
import type { SwiftMindSnapshot } from "./mind";

export interface HumanityObservation {
  decision?: SwiftDecisionTrace;
  mind?: SwiftMindSnapshot;
}

export interface HumanitySummary {
  decisions: number;
  engineAgreementRate: number;
  humanPlanRate: number;
  tacticalOverrideRate: number;
  openingBookRate: number;
  engineFallbackRate: number;
  averagePlanAge: number;
  planContinuationRate: number;
  distinctPlans: string[];
  reasonCoverage: number;
}

function rate(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

/**
 * Behavioral measurements for Swift's human-facing decision layer.
 *
 * None of these numbers is "humanity" by itself. Together they make regressions
 * visible: a build that agrees with the raw engine 100% of the time, never
 * carries plans, or constantly abandons plans should not be called more human.
 */
export function summarizeHumanity(observations: HumanityObservation[]): HumanitySummary {
  const usable = observations.filter((observation) => observation.decision);
  const decisions = usable.length;
  const agreements = usable.filter((observation) => observation.decision?.engineAgreement).length;
  const humanPlan = usable.filter((observation) => observation.decision?.source === "human-plan").length;
  const tactical = usable.filter((observation) => observation.decision?.source === "tactical").length;
  const book = usable.filter((observation) => observation.decision?.source === "opening-book").length;
  const fallback = usable.filter((observation) => observation.decision?.source === "engine-fallback").length;
  const reasons = usable.filter((observation) => (observation.decision?.reasons.length ?? 0) > 0).length;

  const minds = usable.map((observation) => observation.mind).filter((mind): mind is SwiftMindSnapshot => !!mind);
  const averagePlanAge = minds.length
    ? minds.reduce((sum, mind) => sum + mind.planAge, 0) / minds.length
    : 0;

  let planTransitions = 0;
  let planContinuations = 0;
  for (let index = 1; index < minds.length; index += 1) {
    const previous = minds[index - 1].plan;
    const current = minds[index].plan;
    if (!previous || !current) continue;
    planTransitions += 1;
    if (previous === current) planContinuations += 1;
  }

  const distinctPlans = [...new Set(minds.flatMap((mind) => mind.plan ? [mind.plan] : []))].sort();

  return {
    decisions,
    engineAgreementRate: rate(agreements, decisions),
    humanPlanRate: rate(humanPlan, decisions),
    tacticalOverrideRate: rate(tactical, decisions),
    openingBookRate: rate(book, decisions),
    engineFallbackRate: rate(fallback, decisions),
    averagePlanAge,
    planContinuationRate: rate(planContinuations, planTransitions),
    distinctPlans,
    reasonCoverage: rate(reasons, decisions),
  };
}
