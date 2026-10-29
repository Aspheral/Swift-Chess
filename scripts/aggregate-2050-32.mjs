import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const INPUT = process.argv[2] ?? "calibration-downloads";
const OUTPUT = process.argv[3] ?? "calibration-results/swift-2050-32-summary.json";
const ELO = Number.parseInt(process.env.SWIFT_STOCKFISH_ELO ?? "2050", 10);
if (!Number.isInteger(ELO) || ELO < 1320 || ELO > 3190)
  throw new Error("Invalid requested Stockfish UCI_Elo for rating pilot");
const BATCHES = 4;
const GAMES_PER_BATCH = 8;
const OPENINGS = [
  "Reti / ...d5", "Reti / kingside fianchetto",
  "Queen's Gambit Declined", "Slav structure", "Queen's Gambit Accepted",
  "London structure", "Four Knights", "Scotch structure",
  "Bishop's Opening", "Italian structure",
];

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}
function jsonFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? jsonFiles(path)
      : path.endsWith(".json") ? [path] : [];
  });
}
function points(result) {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  if (result === "loss") return 0;
  throw new Error(`Invalid game result: ${result}`);
}
function summarize(games) {
  const wins = games.filter((game) => game.result === "win").length;
  const draws = games.filter((game) => game.result === "draw").length;
  const losses = games.filter((game) => game.result === "loss").length;
  const score = wins + 0.5 * draws;
  return {
    games: games.length, wins, draws, losses, score,
    scoreRate: games.length ? score / games.length : null,
    outrightWinRate: games.length ? wins / games.length : null,
  };
}
function clamp01(value) { return Math.max(0, Math.min(1, value)); }

const files = jsonFiles(INPUT);
requireTrue(files.length === BATCHES,
  `Expected ${BATCHES} JSON batch files; found ${files.length}`);
const batchReports = new Map();
const seenSeeds = new Set();
for (const path of files) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const c = data.configuration ?? {};
  requireTrue(c.mode === "human", `${path}: expected human playing mode`);
  requireTrue(c.opponentElo === ELO, `${path}: expected Stockfish UCI_Elo ${ELO}`);
  requireTrue(c.stockfishMoveMs === 100, `${path}: Stockfish time limit differs`);
  requireTrue(c.swift?.profile === "adaptive-human-v15", `${path}: Swift profile differs`);
  requireTrue(c.maxPlies >= 360, `${path}: maximum plies is too low`);
  requireTrue(Number.isInteger(c.batch) && c.batch >= 0 && c.batch < BATCHES,
    `${path}: unexpected batch ID`);
  requireTrue(!batchReports.has(c.batch), `Duplicate batch ${c.batch}`);
  const expectedOpeningStart = (c.batch * 4) % OPENINGS.length;
  requireTrue(c.openingStart === expectedOpeningStart,
    `${path}: batch ${c.batch} openingStart must be ${expectedOpeningStart}`);
  const expectedOpenings = Array.from({ length: 4 },
    (_, i) => OPENINGS[(expectedOpeningStart + i) % OPENINGS.length]);
  requireTrue(JSON.stringify(c.openingPairs) === JSON.stringify(expectedOpenings),
    `${path}: opening sequence differs from the 32-game protocol`);
  requireTrue(Array.isArray(data.games) && data.games.length === GAMES_PER_BATCH,
    `${path}: expected exactly ${GAMES_PER_BATCH} games`);
  for (let i = 0; i < GAMES_PER_BATCH; i += 2) {
    const white = data.games[i];
    const black = data.games[i + 1];
    requireTrue(white.swiftColor === "White" && black.swiftColor === "Black",
      `${path}: pair ${i / 2} is not color balanced`);
    requireTrue(white.opening === black.opening && white.opening === expectedOpenings[i / 2],
      `${path}: pair ${i / 2} has mismatched openings`);
    requireTrue(white.seed === black.seed && Number.isFinite(white.seed),
      `${path}: pair ${i / 2} must share a deterministic seed`);
    requireTrue(!seenSeeds.has(white.seed), `${path}: duplicate pair seed ${white.seed}`);
    seenSeeds.add(white.seed);
    for (const game of [white, black]) {
      points(game.result); // Also rejects "unresolved", which is not a draw.
      requireTrue(typeof game.reason === "string" && game.reason !== "ongoing",
        `${path}: missing completed game result reason`);
      requireTrue(Array.isArray(game.moves) && game.moves.length === game.plies,
        `${path}: missing or incomplete UCI move history`);
      requireTrue(typeof game.finalFen === "string" && game.finalFen.split(" ").length === 6,
        `${path}: missing final FEN`);
    }
  }
  batchReports.set(c.batch, data);
}
for (let batch = 0; batch < BATCHES; batch++) {
  requireTrue(batchReports.has(batch), `Missing batch ${batch}`);
}
const games = [...batchReports.entries()].sort(([a], [b]) => a - b)
  .flatMap(([, report]) => report.games);
const all = summarize(games);
const white = summarize(games.filter((game) => game.swiftColor === "White"));
const black = summarize(games.filter((game) => game.swiftColor === "Black"));
requireTrue(all.games === 32 && white.games === 16 && black.games === 16,
  "Game total or color balance is invalid");

const byOpening = Object.fromEntries([...new Set(games.map((game) => game.opening))]
  .map((opening) => [opening, summarize(games.filter((game) => game.opening === opening))]));
const pairScores = Array.from({ length: 16 }, (_, pair) =>
  (points(games[pair * 2].result) + points(games[pair * 2 + 1].result)) / 2);
const mean = all.scoreRate;
const pairVariance = pairScores.reduce((sum, v) => sum + (v - mean) ** 2, 0)
  / (pairScores.length - 1);
const margin = 1.96 * Math.sqrt(pairVariance / pairScores.length);
const approximateInterval95 = [clamp01(mean - margin), clamp01(mean + margin)];
const performanceElo = mean > 0 && mean < 1
  ? Math.round(ELO + 400 * Math.log10(mean / (1 - mean))) : null;
const swiftMoves = [...batchReports.values()].reduce((sum, report) =>
  sum + (report.overall?.swiftMoves ?? 0), 0);
const depthSum = [...batchReports.values()].reduce((sum, report) =>
  sum + (report.overall?.depthSum ?? 0), 0);
const nodeSum = [...batchReports.values()].reduce((sum, report) =>
  sum + (report.overall?.nodeSum ?? 0), 0);

const summary = {
  opponent: `Stockfish 16 UCI_Elo ${ELO} (100 ms/move)`,
  swiftProfile: "adaptive-human-v15",
  batches: BATCHES,
  openingPairs: 16,
  uniqueOpeningFamilies: Object.keys(byOpening).length,
  total: all,
  byColor: { White: white, Black: black },
  byOpening,
  averageCompletedDepth: swiftMoves ? depthSum / swiftMoves : null,
  averageNodesPerSwiftMove: swiftMoves ? nodeSum / swiftMoves : null,
  scoreRate95Approx: approximateInterval95,
  descriptivePerformanceElo: performanceElo,
  targetScore: 16,
  meetsNominal50PercentPilotTarget: all.score >= 16,
  lowerApprox95BoundAbove50Percent: approximateInterval95[0] > 0.5,
  interpretation: "32-game exploratory Stockfish UCI_Elo benchmark, not the 200-game gate or a Chess.com Rapid rating. The approximate interval treats paired games as independent although some opening families repeat.",
};
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
// A losing result is a VALID experimental outcome, not a failed CI job.
// Invalid batches, unfinished games, or missing artifacts do fail this script.
