import { describe, expect, it } from "vitest";
import { assessPlanFollowThrough } from "../src/chess/plan-followthrough";

const base = { priorStalls: 0, planAge: 2, progress: 0, tacticalEmergency: false };

describe("Swift plan follow-through evidence", () => {
  it("does not mistake one quiet setup turn for a failed plan", () => {
    const first = assessPlanFollowThrough(base);
    expect(first.stalledCycles).toBe(1);
    expect(first.reconsider).toBe(false);
    expect(first.inertiaReduction).toBe(0);
  });

  it("stops manufacturing confidence and reduces inertia only after repeated stalls", () => {
    const first = assessPlanFollowThrough(base);
    const second = assessPlanFollowThrough({ ...base, priorStalls: first.stalledCycles });
    const third = assessPlanFollowThrough({ ...base, priorStalls: second.stalledCycles });
    expect(third.stalledCycles).toBe(3);
    expect(third.confidenceGrowthScale).toBe(0);
    expect(third.inertiaReduction).toBe(6);
    expect(third.reconsider).toBe(true);
  });

  it("restores conviction when the actual board shows measurable progress", () => {
    const recovered = assessPlanFollowThrough({ ...base, priorStalls: 5, progress: 0.03 });
    expect(recovered.stalledCycles).toBe(0);
    expect(recovered.confidenceGrowthScale).toBe(1);
    expect(recovered.inertiaReduction).toBe(0);
  });

  it("does not declare a stall during check or tactical emergency", () => {
    const paused = assessPlanFollowThrough({ ...base, priorStalls: 3, tacticalEmergency: true });
    expect(paused.stalledCycles).toBe(3);
    expect(paused.reconsider).toBe(false);
    expect(paused.inertiaReduction).toBe(0);
  });

  it("clamps corrupted or repeated evidence rather than fabricating inertia", () => {
    const result = assessPlanFollowThrough({ ...base, priorStalls: 9999 });
    expect(result.stalledCycles).toBe(6);
    expect(result.inertiaReduction).toBe(9);
    expect(assessPlanFollowThrough({ ...base, priorStalls: Number.NaN }).stalledCycles).toBe(1);
  });
});
