import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ?? "rating-downloads";
const OUT = process.argv[3] ?? "calibration-results/rating-ladder-summary.json";
const EXPECTED_RATINGS = (process.env.SWIFT_RATING_LADDER ?? "1450,1550,1650,1750,1850")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter(Number.isFinite);
const EXPECTED_BATCHES = Math.max(1, Number.parseInt(process.env.SWIFT_EXPECTED_BATCHES ?? "2", 10) || 2);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (name.endsWith(".json")) files.push(path);
  }
  return files;
}

function point(game) {
  return game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0;
}

function expectedScore(swiftElo, opponentElo) {
  return 1 / (1 + 10 ** ((opponentElo - swiftElo) / 400));
}

function logLikelihood(swiftElo, games) {
  let value = 0;
  for (const game of games) {
    const p = Math.max(1e-9, Math.min(1 - 1e-9, expectedScore(swiftElo, game.opponentElo)));
    const y = game.point;
    value += y * Math.log(p) + (1 - y) * Math.log(1 - p);
  }
  return value;
}

function maximize(games, low = 900, high = 2600) {
  for (let i = 0; i < 120; i += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (logLikelihood(left, games) < logLikelihood(right, games)) low = left;
    else high = right;
  }
  return (low + high) / 2;
}

function profileBound(games, mle, target, side) {
  let low = side === "lower" ? 700 : mle;
  let high = side === "lower" ? mle : 2800;

  if (logLikelihood(side === "lower" ? low : high, games) > target) return null;

  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    const above = logLikelihood(mid, games) > target;
    if (side === "lower") {
      if (above) high = mid;
      else low = mid;
    } else {
      if (above) low = mid;
      else high = mid;
    }
  }
  return (low + high) / 2;
}

function performanceElo(opponentElo, rate) {
  if (rate <= 0 || rate >= 1) return null;
  return Math.round(opponentElo + 400 * Math.log10(rate / (1 - rate)));
}

const reports = walk(ROOT)
  .map((path) => JSON.parse(readFileSync(path, "utf8")))
  .filter((report) => report.configuration?.mode === "human");

const byRatingReports = new Map();
for (const report of reports) {
  const elo = Number(report.configuration?.opponentElo ??
    String(report.configuration?.opponent ?? "").match(/(\d+)/)?.[1]);
  if (!Number.isFinite(elo)) continue;
  if (!byRatingReports.has(elo)) byRatingReports.set(elo, []);
  byRatingReports.get(elo).push(report);
}

for (const rating of EXPECTED_RATINGS) {
  const count = byRatingReports.get(rating)?.length ?? 0;
  if (count !== EXPECTED_BATCHES) {
    throw new Error(`Expected ${EXPECTED_BATCHES} batches at Elo ${rating}, found ${count}`);
  }
}

const games = [];
for (const [opponentElo, ratingReports] of byRatingReports) {
  if (!EXPECTED_RATINGS.includes(opponentElo)) continue;
  for (const report of ratingReports) {
    for (const game of report.games ?? []) {
      games.push({
        ...game,
        opponentElo,
        point: point(game),
      });
    }
  }
}

const unresolved = games.filter((game) => game.result === "unresolved");
if (unresolved.length) {
  throw new Error(`Rating ladder contains ${unresolved.length} unresolved games`);
}

const completed = games.filter((game) => game.result !== "unresolved");
const mle = maximize(completed);
const maxLL = logLikelihood(mle, completed);
const targetLL = maxLL - 1.920729410347062;
const lower = profileBound(completed, mle, targetLL, "lower");
const upper = profileBound(completed, mle, targetLL, "upper");

const byRating = {};
for (const rating of EXPECTED_RATINGS) {
  const subset = completed.filter((game) => game.opponentElo === rating);
  const wins = subset.filter((game) => game.result === "win").length;
  const losses = subset.filter((game) => game.result === "loss").length;
  const draws = subset.filter((game) => game.result === "draw").length;
  const score = subset.reduce((sum, game) => sum + game.point, 0);
  const rate = subset.length ? score / subset.length : 0;
  byRating[rating] = {
    games: subset.length,
    wins,
    losses,
    draws,
    score,
    scoreRate: rate,
    performanceElo: performanceElo(rating, rate),
  };
}

const byColor = {};
for (const color of ["White", "Black"]) {
  const subset = completed.filter((game) => game.swiftColor === color);
  const score = subset.reduce((sum, game) => sum + game.point, 0);
  byColor[color] = {
    games: subset.length,
    wins: subset.filter((game) => game.result === "win").length,
    losses: subset.filter((game) => game.result === "loss").length,
    draws: subset.filter((game) => game.result === "draw").length,
    score,
    scoreRate: subset.length ? score / subset.length : 0,
  };
}

const summary = {
  generatedAt: new Date().toISOString(),
  method: "paired Stockfish UCI_LimitStrength ladder; fractional-result logistic MLE",
  profile: "adaptive-human-v1",
  games: completed.length,
  opponentRatings: EXPECTED_RATINGS,
  batchesPerRating: EXPECTED_BATCHES,
  calibratedElo: Math.round(mle),
  calibratedElo95: [
    lower === null ? null : Math.round(lower),
    upper === null ? null : Math.round(upper),
  ],
  byRating,
  byColor,
};

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
