import type { Color } from "./board";

export const RAPID_INITIAL_MS = 600_000;
export interface RapidClock {
  remainingMs: Record<Color, number>;
  active: Color | null;
  timestampMs: number | null;
  started: boolean;
  flagged: Color | null;
}
const other = (side: Color): Color => side === "w" ? "b" : "w";
export function createRapidClock(initialMs = RAPID_INITIAL_MS): RapidClock {
  const ms = Math.max(0, Math.floor(initialMs));
  return { remainingMs: { w: ms, b: ms }, active: null, timestampMs: null, started: false, flagged: null };
}
/** Monotonic timestamp accounting, independent of animation intervals. */
export function settleRapidClock(clock: RapidClock, nowMs: number): RapidClock {
  if (!clock.active || clock.timestampMs === null || clock.flagged) return clock;
  const elapsed = Math.max(0, nowMs - clock.timestampMs);
  if (!elapsed) return clock;
  const side = clock.active;
  const remaining = Math.max(0, clock.remainingMs[side] - elapsed);
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [side]: remaining },
    active: remaining === 0 ? null : side,
    timestampMs: remaining === 0 ? null : nowMs,
    flagged: remaining === 0 ? side : null,
  };
}
export function startRapidClock(clock: RapidClock, side: Color, nowMs: number): RapidClock {
  if (clock.started || clock.flagged) return clock;
  return { ...clock, started: true, active: side, timestampMs: nowMs };
}
export function playRapidClockMove(clock: RapidClock, mover: Color, nowMs: number): RapidClock {
  const settled = settleRapidClock(clock, nowMs);
  if (settled.flagged || (settled.started && settled.active !== mover)) return settled;
  return { ...settled, started: true, active: other(mover), timestampMs: nowMs };
}
export function pauseRapidClock(clock: RapidClock, nowMs: number): RapidClock {
  const settled = settleRapidClock(clock, nowMs);
  return { ...settled, active: null, timestampMs: null };
}
export function resumeRapidClock(clock: RapidClock, side: Color, nowMs: number): RapidClock {
  if (!clock.started || clock.flagged) return clock;
  return { ...clock, active: side, timestampMs: nowMs };
}
export function restoreRapidClock(clock: RapidClock, side: Color, nowMs: number): RapidClock {
  return { ...clock, flagged: null, active: clock.started ? side : null, timestampMs: clock.started ? nowMs : null };
}
export function rapidClockLabel(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
