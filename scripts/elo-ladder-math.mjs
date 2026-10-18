/**
 * Descriptive Elo-equivalent fit for a ladder of Stockfish UCI_Elo opponents.
 * Opponent ratings are internal engine-strength settings, not independently
 * verified human-ratings anchors. No claim of Chess.com rating calibration.
 */
export const score = (result) => {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  if (result === "loss") return 0;
  throw new Error("Invalid finished game result: " + result);
};
export const expected = (swiftRating, opponentRating) =>
  1 / (1 + 10 ** ((opponentRating - swiftRating) / 400));

/** Solve observed-points = expected-points at the chosen Elo scale. */
export function fitElo(games, lower = 1000, upper = 3000) {
  if (!games.length) throw new Error("No completed calibration games");
  const points = games.reduce((sum, g) => sum + score(g.result), 0);
  const projected = (r) => games.reduce((sum, g) => sum + expected(r, g.opponentElo), 0);
  // Guard against invalid quasi-infinite ratings in all-W/all-L samples.
  if (points <= projected(lower)) return lower;
  if (points >= projected(upper)) return upper;
  for (let k = 0; k < 70; k++) {
    const mid = (lower + upper) / 2;
    if (projected(mid) < points) lower = mid;
    else upper = mid;
  }
  return (lower + upper) / 2;
}

export function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) | 0;
    let t = Math.imul(x ^ x >>> 15, 1 | x);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const percentile = (sorted, fraction) => {
  const pos = (sorted.length - 1) * fraction, i = Math.floor(pos);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (pos - i);
};

/**
 * Resample complete two-color opening pairs as units. All opponent levels
 * sharing the same opening/batch are resampled together, preserving
 * intra-opening cross-level correlation.
 */
export function pairedBootstrap(blocks, repeats = 2000, seed = 20502050) {
  if (!blocks.length) throw new Error("No opening-pair blocks");
  const random = seededRandom(seed);
  const results = [];
  for (let k = 0; k < repeats; k++) {
    const sample = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[Math.floor(random() * blocks.length)];
      sample.push(...block.games);
    }
    results.push(fitElo(sample));
  }
  results.sort((a,b) => a-b);
  return [percentile(results, 0.025), percentile(results, 0.975)];
}

/** Cluster at the opening-FAMILY level, stricter than independent pairs. */
export function openingFamilyBootstrap(blocks, repeats = 2000, seed = 75002050) {
  const families = [...new Set(blocks.map(b => b.opening))];
  if (families.length < 2) return null;
  const byFamily = new Map(families.map(opening =>
    [opening, blocks.filter(b=>b.opening===opening).flatMap(b=>b.games)]));
  const random = seededRandom(seed), results = [];
  for (let k = 0; k < repeats; k++) {
    const sample = [];
    for (let i = 0; i < families.length; i++) {
      const chosen = families[Math.floor(random() * families.length)];
      sample.push(...byFamily.get(chosen));
    }
    results.push(fitElo(sample));
  }
  results.sort((a,b)=>a-b);
  return [percentile(results, 0.025), percentile(results, 0.975)];
}
