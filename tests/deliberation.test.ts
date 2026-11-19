import { describe, expect, it } from "vitest";
import { deliberationShortlist, recentPieceCircuitLength } from "../src/chess/deliberation";

describe("reasoned deliberation and piece-route memory", () => {
  it("recognizes a multi-turn rook circuit that immediate-reversal logic misses", () => {
    // The same rook traveled a1-a3-c3-c1; returning to a1 completes a circuit.
    const moves = ["a1a3", "h7h6", "a3c3", "h6h5", "c3c1", "h5h4"];
    expect(recentPieceCircuitLength("c1a1", moves)).toBe(3);
    expect(recentPieceCircuitLength("c1c4", moves)).toBeNull();
  });

  it("works for Black's move parity and detects the same-piece route", () => {
    const moves = ["e2e4", "a8a6", "e4e5", "a6c6", "e5e6", "c6c8", "e6e7"];
    expect(recentPieceCircuitLength("c8a8", moves)).toBe(3);
  });

  it("does not infer a circuit when unrelated pieces moved", () => {
    const moves = ["a1a3", "h7h6", "b1c3", "h6h5", "c3d5", "h5h4"];
    expect(recentPieceCircuitLength("d5a1", moves)).toBeNull();
  });

  it("keeps immediate reversals separate and rejects invalid records", () => {
    expect(recentPieceCircuitLength("f3g1", ["g1f3", "a7a6"])).toBe(1);
    expect(recentPieceCircuitLength("invalid", [])).toBeNull();
    expect(recentPieceCircuitLength("e2e2", [])).toBeNull();
  });

  it("applies the same concrete-quality threshold to deterministic selection", () => {
    const options = [
      { id: "strong", concreteScore: 100, value: 90 },
      { id: "seductive", concreteScore: 70, value: 130, supportsPlan: true },
    ];
    expect(deliberationShortlist(options, 0, 0, 18).map((entry) => entry.id))
      .toEqual(["strong"]);
  });

  it("preserves a genuinely near-equal continuing plan when thought is deterministic", () => {
    const options = [
      { id: "principal", concreteScore: 100, value: 100 },
      { id: "prepared-plan", concreteScore: 89, value: 106, supportsPlan: true },
    ];
    expect(deliberationShortlist(options, 0, 0, 12).map((entry) => entry.id))
      .toEqual(["prepared-plan"]);
    // Plan latitude cannot be borrowed by a candidate that doesn't serve it.
    expect(deliberationShortlist(options.map((option) => ({ ...option, supportsPlan: false })), 0, 0, 12)
      .map((entry) => entry.id)).toEqual(["principal"]);
  });

  it("withdraws plan latitude when the position becomes tactically forcing", () => {
    const options = [
      { id: "strong", concreteScore: 100, value: 80 },
      { id: "plan", concreteScore: 89, value: 120, supportsPlan: true },
    ];
    expect(deliberationShortlist(options, 1, 0.25, 18).map((entry) => entry.id))
      .toEqual(["strong"]);
  });

  it("caps plan latitude and rejects unbounded strategic overreach", () => {
    const options = [
      { id: "strong", concreteScore: 100, value: 90 },
      { id: "plan", concreteScore: 75, value: 140, supportsPlan: true },
    ];
    expect(deliberationShortlist(options, 0, 0, 500).map((entry) => entry.id))
      .toEqual(["strong"]);
  });

  it("considers only near-equal practical choices, not the entire safe pool", () => {
    const ranked = [
      { concreteScore: 100, value: 100, id: "purposeful" },
      { concreteScore: 97, value: 97, id: "alternate" },
      { concreteScore: 86, value: 98, id: "too much concrete loss" },
      { concreteScore: 100, value: 72, id: "poor strategic fit" },
    ];
    expect(deliberationShortlist(ranked, 0.5, 0).map((entry) => entry.id))
      .toEqual(["purposeful", "alternate"]);
    expect(deliberationShortlist(ranked, 0, 0).map((entry) => entry.id))
      .toEqual(["purposeful"]);
    expect(deliberationShortlist(ranked, 1, 0.2).map((entry) => entry.id))
      .toEqual(["purposeful"]);
  });

  it("anchors safe choices to best CONCRETE move rather than an alluring style score", () => {
    const options = [
      { id: "concrete", concreteScore: 100, value: 95 },
      { id: "style-trap", concreteScore: 75, value: 125 },
      { id: "near-equal", concreteScore: 96, value: 93 },
    ];
    expect(deliberationShortlist(options, 1, 0).map((option) => option.id))
      .toEqual(["concrete", "near-equal"]);
    expect(deliberationShortlist(options, 1, 0.2).map((option) => option.id))
      .toEqual(["concrete"]);
  });

  it("prioritizes concrete safety rather than style during tactical pressure", () => {
    const options = [
      { id: "safest", concreteScore: 100, value: 94 },
      { id: "tempting", concreteScore: 96, value: 112 },
    ];
    expect(deliberationShortlist(options, 1, 0.25).map((option) => option.id))
      .toEqual(["safest"]);
  });

  it("can choose a close strategic preference without making a 20cp concession", () => {
    const options = [
      { id: "strong", concreteScore: 100, value: 97 },
      { id: "plan", concreteScore: 96, value: 102 },
      { id: "overreach", concreteScore: 80, value: 110 },
    ];
    expect(deliberationShortlist(options, 1, 0).map((option) => option.id))
      .toEqual(["strong", "plan"]);
  });

  it("does not confuse a preferred near-equal plan with a random mistake", () => {
    const candidates = [
      { concreteScore: 100, value: 98, id: "principal" },
      { concreteScore: 95, value: 103, id: "continuing-plan" },
      { concreteScore: 65, value: 102, id: "unverified-strength" },
    ];
    expect(deliberationShortlist(candidates, 1, 0).map((entry) => entry.id))
      .toEqual(["principal", "continuing-plan"]);
  });
});
