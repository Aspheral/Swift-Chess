import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const INPUT = process.argv[2] ?? "calibration-downloads";
const OUTPUT = process.argv[3] ?? "calibration-results/stockfish-2050-summary.json";
const ELO = 2050;
const BATCHES = 10;
const GAMES_PER_BATCH = 20;
const TARGET_SCORE = BATCHES * GAMES_PER_BATCH / 2;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".json") ? [path] : [];
  });
}
function points(result) {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  if (result === "loss") return 0;
  throw new Error(`Invalid outcome: ${result}`);
}
function summarize(games) {
  const wins = games.filter((game) => game.result === "win").length;
  const draws = games.filter((game) => game.result === "draw").length;
  const losses = games.filter((game) => game.result === "loss").length;
  const score = wins + draws / 2;
  return { games: games.length, wins, draws, losses, score,
    scoreRate: games.length ? score / games.length : 0,
    winRate: games.length ? wins / games.length : 0 };
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

const paths = walk(INPUT);
assert(paths.length === BATCHES,
  `Expected exactly ${BATCHES} JSON batch files, found ${paths.length}`);
const batches = new Map();
for (const path of paths) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  const config = report.configuration ?? {};
  assert(config.mode === "human", `${path}: expected Swift's human-play profile`);
  assert(config.opponentElo === ELO, `${path}: expected Stockfish UCI_Elo=${ELO}`);
  assert(config.maxPlies >= 360, `${path}: expected a safety cap of at least 360 plies`);
  assert(Number.isInteger(config.batch) && config.batch >= 0 && config.batch < BATCHES,
    `${path}: invalid batch number ${config.batch}`);
  assert(!batches.has(config.batch), `Duplicate batch ${config.batch}`);
  assert(Array.isArray(report.games) && report.games.length === GAMES_PER_BATCH,
    `${path}: expected ${GAMES_PER_BATCH} completed game records`);

  for (let index = 0; index < report.games.length; index += 2) {
    const first = report.games[index];
    const second = report.games[index + 1];
    assert(first.swiftColor === "White" && second.swiftColor === "Black",
      `${path}: opening pair ${index / 2} must alternate colors`);
    assert(first.opening === second.opening,
      `${path}: opening pair ${index / 2} must share an opening`);
    assert(first.result !== "unresolved" && second.result !== "unresolved",
      `${path}: unresolved game in opening pair ${index / 2}`);
    points(first.result);
    points(second.result);
  }
  batches.set(config.batch, report);
}
for (let batch = 0; batch < BATCHES; batch += 1) {
  assert(batches.has(batch), `Missing batch ${batch}`);
}

const games = [...batches.entries()].sort(([a], [b]) => a - b)
  .flatMap(([, report]) => report.games);
const total = summarize(games);
assert(total.games === BATCHES * GAMES_PER_BATCH, "Incorrect overall game count");
const white = summarize(games.filter((game) => game.swiftColor === "White"));
const black = summarize(games.filter((game) => game.swiftColor === "Black"));
assert(white.games === black.games, "Color balance is incorrect");

// An approximate descriptive 95% interval, clustered by paired openings.
// The 10 starting openings recur across batches, so this interval does not
// eliminate dependence between opening families or substitute for fresh games.
const pairScores = [];
for (let index = 0; index < games.length; index += 2) {
  pairScores.push((points(games[index].result) + points(games[index + 1].result)) / 2);
}
const mean = total.scoreRate;
const variance = pairScores.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  / (pairScores.length - 1);
const margin95 = 1.96 * Math.sqrt(variance / pairScores.length);
const interval95 = [clamp01(mean - margin95), clamp01(mean + margin95)];
const passed = total.score >= TARGET_SCORE;

const summary = {
  opponent: `Stockfish UCI_Elo ${ELO}`,
  mode: "human",
  openingPairs: pairScores.length,
  batches: BATCHES,
  total,
  byColor: { White: white, Black: black },
  scoreRate95Approx: interval95,
  targetScore: TARGET_SCORE,
  passedNominal50PercentGate: passed,
  lowerBoundAbove50Percent: interval95[0] > 0.5,
  interpretation: "Only a Stockfish UCI_Elo match benchmark; not a Chess.com Rapid rating.",
};
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
if (!passed) {
  throw new Error(`Swift scored ${total.score}/${total.games} (${(mean * 100).toFixed(1)}%); ` +
    `below the ${TARGET_SCORE}-point gate against Stockfish UCI_Elo ${ELO}.`);
}
