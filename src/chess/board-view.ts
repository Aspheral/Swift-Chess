/** Swift's board indices run from a1 (0) through h8 (63). */
export function squareAtVisualIndex(visualIndex: number, flipped: boolean): number {
  const visualRank = Math.floor(visualIndex / 8);
  const visualFile = visualIndex % 8;
  const rank = flipped ? visualRank : 7 - visualRank;
  const file = flipped ? 7 - visualFile : visualFile;
  return rank * 8 + file;
}

/** Inverse of squareAtVisualIndex, shared with the analysis-arrow overlay. */
export function visualIndexForSquare(square: number, flipped: boolean): number {
  const rank = Math.floor(square / 8);
  const file = square & 7;
  return (flipped ? rank : 7 - rank) * 8 + (flipped ? 7 - file : file);
}

/** a1 is dark and h1 is light, regardless of board orientation. */
export function isDarkSquare(square: number): boolean {
  return (Math.floor(square / 8) + (square & 7)) % 2 === 0;
}
