import { describe, expect, it } from "vitest";
import {
  expected, fitElo, pairedBootstrap, openingFamilyBootstrap, score,
} from "../scripts/elo-ladder-math.mjs";

describe("multi-opponent calibrated Elo math", () => {
  const opponents = [1900, 2050, 2200];
  const draws = opponents.flatMap(opponentElo =>
    Array.from({length:40}, () => ({opponentElo,result:"draw"})));

  it("values win=1 draw=half loss=0 and rejects unfinished games", () => {
    expect(score("win")).toBe(1);
    expect(score("draw")).toBe(0.5);
    expect(score("loss")).toBe(0);
    expect(() => score("unresolved")).toThrow();
  });

  it("fits exactly 2050 for an equal score against a symmetric three-level ladder", () => {
    expect(fitElo(draws)).toBeCloseTo(2050,5);
    expect(expected(2050,2050)).toBe(0.5);
    expect(expected(2050,1900)).toBeGreaterThan(0.5);
    expect(expected(2050,2200)).toBeLessThan(0.5);
  });

  it("is monotone with results and uses all three different opponent ratings", () => {
    const good=draws.map((g,i)=>({...g,result:i%8===0?"win":"draw"}));
    const bad=draws.map((g,i)=>({...g,result:i%8===0?"loss":"draw"}));
    expect(fitElo(good)).toBeGreaterThan(fitElo(draws));
    expect(fitElo(bad)).toBeLessThan(fitElo(draws));
    expect(fitElo([{opponentElo:2050,result:"win"}])).toBe(3000);
    expect(fitElo([{opponentElo:2050,result:"loss"}])).toBe(1000);
  });

  it("resamples complete two-color paired blocks, not isolated game outcomes", () => {
    const blocks=Array.from({length:20},(_,i)=>({
      opening:"Opening"+(i%5),
      games:opponents.flatMap(opponentElo=>[
        {opponentElo,result:i%2===0?"win":"loss"},
        {opponentElo,result:"draw"},
      ]),
    }));
    const a=pairedBootstrap(blocks,300,17);
    const b=pairedBootstrap(blocks,300,17);
    expect(a).toEqual(b);
    expect(a[0]).toBeLessThan(2050);
    expect(a[1]).toBeGreaterThan(2050);
    const family=openingFamilyBootstrap(blocks,300,17);
    expect(family).not.toBeNull();
    expect(family![0]).toBeLessThanOrEqual(family![1]);
  });

  it("does not treat repeated games with one opening as independent opening families", () => {
    const allOne=Array.from({length:5},()=>({opening:"only",games:draws}));
    expect(openingFamilyBootstrap(allOne,30,22)).toBeNull();
    expect(()=>fitElo([])).toThrow();
  });
});
