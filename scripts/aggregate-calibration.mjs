import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] ?? "calibration-downloads";
const OUT = process.argv[3] ?? "calibration-results/summary.json";
const STOCKFISH_ELO = 1650;
const EXPECTED_BATCHES = Math.max(1, Number.parseInt(process.env.SWIFT_EXPECTED_BATCHES ?? "3", 10) || 3);

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

function performanceElo(rate) {
  if (rate <= 0 || rate >= 1) return null;
  return Math.round(STOCKFISH_ELO + 400 * Math.log10(rate / (1 - rate)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const files = walk(ROOT);
if (!files.length) throw new Error(`No calibration JSON files found under ${ROOT}`);

const reports = files.map((path) => JSON.parse(readFileSync(path, "utf8")));
const grouped = new Map();

for (const report of reports) {
  const mode = report.configuration?.mode;
  if (mode !== "strict" && mode !== "human") continue;
  if (!grouped.has(mode)) grouped.set(mode, []);
  grouped.get(mode).push(report);
}

const summary = {
  generatedAt: new Date().toISOString(),
  opponent: `Stockfish-${STOCKFISH_ELO}`,
  modes: {},
};

for (const mode of ["strict", "human"]) {
  const modeReports = grouped.get(mode) ?? [];
  if (modeReports.length !== EXPECTED_BATCHES) {
    throw new Error(`Expected ${EXPECTED_BATCHES} ${mode} calibration batches, found ${modeReports.length}`);
  }
  const games = modeReports.flatMap((report) => report.games ?? []);
  const completed = games.filter((game) => game.result !== "unresolved");
  const points = completed.map((game) => game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0);
  const wins = completed.filter((game) => game.result === "win").length;
  const losses = completed.filter((game) => game.result === "loss").length;
  const draws = completed.filter((game) => game.result === "draw").length;
  const unresolved = games.length - completed.length;
  const score = points.reduce((sum, value) => sum + value, 0);
  const rate = completed.length ? score / completed.length : 0;

  const mean = rate;
  const variance = points.length > 1
    ? points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (points.length - 1)
    : 0;
  const standardError = points.length ? Math.sqrt(variance / points.length) : 0;
  const margin95 = 1.96 * standardError;
  const lowRate = clamp(rate - margin95, 0.001, 0.999);
  const highRate = clamp(rate + margin95, 0.001, 0.999);

  const byColor = {};
  for (const color of ["White", "Black"]) {
    const colorGames = completed.filter((game) => game.swiftColor === color);
    const colorScore = colorGames.reduce(
      (sum, game) => sum + (game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0),
      0,
    );
    byColor[color] = {
      games: colorGames.length,
      wins: colorGames.filter((game) => game.result === "win").length,
      losses: colorGames.filter((game) => game.result === "loss").length,
      draws: colorGames.filter((game) => game.result === "draw").length,
      score: colorScore,
      scoreRate: colorGames.length ? colorScore / colorGames.length : 0,
    };
  }

  const byOpening = {};
  for (const game of completed) {
    const key = game.opening;
    if (!byOpening[key]) byOpening[key] = { games: 0, wins: 0, losses: 0, draws: 0, score: 0 };
    const item = byOpening[key];
    item.games += 1;
    item[game.result === "win" ? "wins" : game.result === "loss" ? "losses" : "draws"] += 1;
    item.score += game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0;
  }
  for (const item of Object.values(byOpening)) item.scoreRate = item.games ? item.score / item.games : 0;

  summary.modes[mode] = {
    batches: modeReports.length,
    games: games.length,
    completedGames: completed.length,
    wins,
    losses,
    draws,
    unresolved,
    score,
    scoreRate: rate,
    performanceElo: performanceElo(rate),
    scoreRate95: [lowRate, highRate],
    performanceElo95: [performanceElo(lowRate), performanceElo(highRate)],
    byColor,
    byOpening,
  };
}

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));

const strict = summary.modes.strict;
if (!strict) throw new Error("Strict calibration results are missing");
if (strict.unresolved > 0) {
  throw new Error(`Strict calibration has ${strict.unresolved} unresolved games`);
}
if (strict.scoreRate < 0.5) {
  throw new Error(`Strict calibration scored ${(strict.scoreRate * 100).toFixed(1)}%, below the 50% gate`);
}
