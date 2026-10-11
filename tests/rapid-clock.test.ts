import { describe, expect, it } from "vitest";
import {
  createRapidClock, pauseRapidClock, playRapidClockMove, rapidClockLabel,
  restoreRapidClock, resumeRapidClock, settleRapidClock, startRapidClock,
} from "../src/chess/rapid-clock";
import { Board, swiftPlayProfile } from "../src";
import { allocateRapidThink } from "../src/chess/rapid-time";

describe("10-minute rapid clocks", () => {
  it("starts both sides at ten minutes and waits for the first move", () => {
    const initial = createRapidClock();
    expect(initial.remainingMs).toEqual({ w: 600_000, b: 600_000 });
    expect(settleRapidClock(initial, 20_000)).toEqual(initial);
    const afterWhite = playRapidClockMove(initial, "w", 20_000);
    expect(afterWhite.active).toBe("b");
    expect(settleRapidClock(afterWhite, 22_500).remainingMs.b).toBe(597_500);
  });

  it("charges Swift for its opening think when Swift plays White", () => {
    const start = startRapidClock(createRapidClock(), "w", 100);
    const after = settleRapidClock(start, 2100);
    expect(after.remainingMs.w).toBe(598_000);
    expect(playRapidClockMove(after, "w", 2100).active).toBe("b");
  });

  it("flags a side and refuses moves after time expires", () => {
    const running = startRapidClock(createRapidClock(2_000), "w", 10);
    const flagged = settleRapidClock(running, 2020);
    expect(flagged.flagged).toBe("w");
    expect(flagged.active).toBeNull();
    expect(playRapidClockMove(flagged, "w", 2200)).toEqual(flagged);
    expect(rapidClockLabel(flagged.remainingMs.w)).toBe("0:00");
  });

  it("pauses analysis without charging either clock, then resumes and undoes", () => {
    const afterWhite = playRapidClockMove(createRapidClock(), "w", 1000);
    const afterBlack = playRapidClockMove(afterWhite, "b", 3000);
    const paused = pauseRapidClock(afterBlack, 4500);
    expect(settleRapidClock(paused, 100_000).remainingMs.w).toBe(598_500);
    const resumed = resumeRapidClock(paused, "w", 100_000);
    expect(settleRapidClock(resumed, 100_600).remainingMs.w).toBe(597_900);
    const rewound = restoreRapidClock(afterWhite, "b", 110_000);
    expect(settleRapidClock(rewound, 110_500).remainingMs.b).toBe(599_500);
  });

  it("ignores negative elapsed time and formats clocks correctly", () => {
    const running = startRapidClock(createRapidClock(30_000), "w", 500);
    expect(settleRapidClock(running, 300).remainingMs.w).toBe(30_000);
    expect(rapidClockLabel(69_001)).toBe("1:10");
    expect(rapidClockLabel(0)).toBe("0:00");
  });
});

describe("10-minute rapid search budgets", () => {
  const opening = swiftPlayProfile(Board.start(), []);
  const tactical = swiftPlayProfile(Board.fromFEN("k3r3/8/8/8/8/8/8/4K3 w - - 0 1"), Array(22).fill("fixture"));

  it("allocates more work to dangerous positions at equal clocks", () => {
    const state = { remainingMs: 450_000, opponentMs: 400_000, ply: 30 };
    const easy = allocateRapidThink(opening, state);
    const hard = allocateRapidThink(tactical, state);
    expect(hard.targetTotalMs).toBeGreaterThan(easy.targetTotalMs);
    expect(hard.options.timeMs ?? 0).toBeGreaterThan(easy.options.timeMs ?? 0);
    expect(hard.options.adaptiveThinking).not.toBe(false);
  });

  it("stops extra thinking and disables expensive tactical probes in time trouble", () => {
    const ample = allocateRapidThink(tactical, { remainingMs: 300_000, opponentMs: 300_000, ply: 30 });
    const little = allocateRapidThink(tactical, { remainingMs: 7_000, opponentMs: 160_000, ply: 55 });
    expect(ample.options.adaptiveThinking).not.toBe(false);
    expect(little.options.adaptiveThinking).toBe(false);
    expect(little.options.tacticalSearchDepth).toBe(0);
    expect(little.minimumThinkMs).toBe(0);
    expect(little.options.timeMs ?? 0).toBeLessThan(ample.options.timeMs ?? 0);
  });

  it("reserves time even at very low clock values", () => {
    for (const ms of [0, 100, 1000, 3500, 14_000, 70_000, 600_000]) {
      const plan = allocateRapidThink(tactical, { remainingMs: ms, opponentMs: ms, ply: 45 });
      expect(plan.targetTotalMs).toBeLessThanOrEqual(Math.max(0, ms - plan.reserveMs));
    }
  });
});
