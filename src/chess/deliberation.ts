/**
 * Reconstruct the path of the piece about to move, using only its own side's
 * actual moves. A return to a previously occupied square after two or more
 * of that piece's moves suggests a circuit rather than immediate backtracking.
 *
 * This is observational evidence, never a rule that forbids a legal move.
 * The chess-facing caller must exempt checks, captures, threats and defensive
 * necessities before using it as a small preference penalty.
 */
export function recentPieceCircuitLength(
  proposedMove: string,
  history: readonly string[],
  maxOwnTurns = 9,
): number | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(proposedMove)) return null;
  const from = proposedMove.slice(0, 2);
  const target = proposedMove.slice(2, 4);
  if (from === target) return null;

  let trackedSquare = from;
  let linkedMoves = 0;
  let ownTurnsInspected = 0;
  const limit = Math.max(0, Math.min(16, Math.floor(maxOwnTurns)));
  // Last same-color ply is always history.length - 2, for both colors.
  for (let index = history.length - 2; index >= 0 && ownTurnsInspected < limit; index -= 2) {
    ownTurnsInspected += 1;
    const previous = history[index];
    if (!previous || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(previous)) continue;
    if (previous.slice(2, 4) !== trackedSquare) continue;
    trackedSquare = previous.slice(0, 2);
    linkedMoves += 1;
    if (trackedSquare === target) return linkedMoves;
  }
  return null;
}

export interface DeliberationOption {
  /** Verified concrete centipawns from the same consequence-search depth. */
  concreteScore: number;
  /** Preference score after plan, position and opponent considerations. */
  value: number;
  /** True only for a continuation of a verified, mature existing plan. */
  supportsPlan?: boolean;
}

/**
 * Only genuinely close *reasoned* alternatives are suitable for uncertainty.
 * Never draw a weaker move from the whole safety margin just to look human.
 * The caller has already performed independent tactical verification.
 */
export function deliberationShortlist<T extends DeliberationOption>(
  options: readonly T[],
  randomness: number,
  tacticalPressure: number,
  planLatitudeCp = 0,
): T[] {
  const viable = options.filter((item) => Number.isFinite(item.value) && Number.isFinite(item.concreteScore));
  if (!viable.length) return [];
  const uncertainty = Math.max(0, Math.min(1, randomness));
  const topConcrete = Math.max(...viable.map((item) => item.concreteScore));
  // IMPORTANT: anchor the comparison to the BEST verified chess move, not
  // to the highest style-adjusted candidate. Otherwise a superficially
  // attractive but 25cp weaker move could become the sole "safe" leader.
  const concreteWindow = 8 + uncertainty * 4;
  // A mature, well-supported plan can justify a small additional concession,
  // but that latitude belongs ONLY to a move serving that plan, not every
  // stylistically interesting alternative. Never grant it in forcing play.
  const planWindow = Number.isFinite(planLatitudeCp)
    ? Math.max(0, Math.min(18, planLatitudeCp)) : 0;
  const concretelyClose = viable.filter((item) =>
    item.concreteScore >= topConcrete - Math.max(concreteWindow,
      tacticalPressure >= 0.12 || !item.supportsPlan ? 0 : planWindow));
  const leader = concretelyClose.reduce((a, b) => a.value >= b.value ? a : b);
  // Tactical pressure is a concrete problem, not a style vote. Follow the
  // highest verified score when the situation is forcing or unstable.
  if (tacticalPressure >= 0.12) {
    const strongest = concretelyClose.reduce((a, b) =>
      a.concreteScore >= b.concreteScore ? a : b);
    return [strongest];
  }
  if (uncertainty === 0) return [leader];

  const preferenceWindow = 2.5 + uncertainty * 4;
  const alternatives = concretelyClose.filter((item) =>
    leader.value - item.value <= preferenceWindow);
  return alternatives.length ? alternatives : [leader];
}
