/**
 * A strategic plan belongs to a particular played line, not merely a board
 * position or move count. Undo, a different opponent response, and a new FEN
 * with unchanged history all invalidate the old plan memory.
 *
 * The common append-only case remains cheap (O(previous history length)) and
 * does not replay or evaluate any chess moves.
 */
export type HistoryContinuity = "same" | "advanced" | "forked";

export function historyContinuity(
  previouslySeen: readonly string[],
  incoming: readonly string[],
  previousPositionKey: string,
  incomingPositionKey: string,
): HistoryContinuity {
  if (incoming.length < previouslySeen.length) return "forked";
  for (let index = 0; index < previouslySeen.length; index++) {
    if (incoming[index] !== previouslySeen[index]) return "forked";
  }
  if (incoming.length > previouslySeen.length) return "advanced";
  // Unchanged history with a different position means an external FEN load,
  // non-game analysis, or a new setup. None should inherit the old plan.
  if (previousPositionKey && incomingPositionKey !== previousPositionKey) return "forked";
  return "same";
}
