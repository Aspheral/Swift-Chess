/**
 * Small deterministic PRNG helpers used by Swift's reproducible decision paths.
 *
 * Consecutive integer seeds are first avalanched so nearby seeds do not begin
 * with nearly identical random values. This matters for calibration batches,
 * where seeds commonly look like 10000, 10001, 10002, ...
 */
export function mixSeed(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = mixSeed(seed);
  if (state === 0) state = 0x6d2b79f5;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function seededRandom(seed: number): number {
  return createSeededRandom(seed)();
}
