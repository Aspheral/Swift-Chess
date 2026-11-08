import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const OPENINGS = [
  "Reti / ...d5", "Reti / kingside fianchetto",
  "Queen's Gambit Declined", "Slav structure", "Queen's Gambit Accepted",
  "London structure", "Four Knights", "Scotch structure",
  "Bishop's Opening", "Italian structure",
];
const dirs: string[] = [];
function setup(result: (batch: number, index: number) => string = () => "draw") {
  const root = mkdtempSync(join(tmpdir(), "swift-32-"));
  dirs.push(root);
  const input = join(root, "batches");
  mkdirSync(input);
  const output = join(root, "summary.json");
  for (let batch = 0; batch < 4; batch++) {
    const openingStart = batch * 4 % OPENINGS.length;
    const openingPairs = Array.from({ length: 4 }, (_, i) => OPENINGS[(openingStart + i) % OPENINGS.length]);
    const games = Array.from({ length: 8 }, (_, index) => ({
      game: index + 1,
      swiftColor: index % 2 ? "Black" : "White",
      opening: openingPairs[Math.floor(index / 2)],
      seed: 20_000 + batch * 1_000_003 + Math.floor(index / 2) * 7_919,
      result: result(batch, index),
      reason: result(batch, index) === "unresolved" ? "ongoing" : "threefold",
      moves: ["g1f3", "g8f6"],
      plies: 2,
      finalFen: "rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2",
    }));
    writeFileSync(join(input, `batch-${batch}.json`), JSON.stringify({
      configuration: {
        mode: "human", opponentElo: 2050, stockfishMoveMs: 100,
        swift: { profile: "adaptive-human-v15" },
        maxPlies: 500, batch, openingStart, openingPairs,
      },
      overall: { swiftMoves: 16, depthSum: 96, nodeSum: 16000 },
      games,
    }));
  }
  return { input, output };
}
function run(input: string, output: string) {
  return spawnSync(process.execPath, ["scripts/aggregate-2050-32.mjs", input, output],
    { cwd: process.cwd(), encoding: "utf8" });
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("32-game Stockfish 2050 match report", () => {
  it("reports 32 draws as 50% score but zero outright wins", () => {
    const { input, output } = setup();
    const runResult = run(input, output);
    expect(runResult.status, runResult.stderr).toBe(0);
    const s = JSON.parse(readFileSync(output, "utf8"));
    expect(s.total).toMatchObject({
      games: 32, wins: 0, draws: 32, losses: 0,
      score: 16, scoreRate: 0.5, outrightWinRate: 0,
    });
    expect(s.byColor.White.games).toBe(16);
    expect(s.byColor.Black.games).toBe(16);
    expect(s.openingPairs).toBe(16);
    expect(s.uniqueOpeningFamilies).toBe(10);
    expect(s.averageCompletedDepth).toBe(6);
    expect(s.meetsNominal50PercentPilotTarget).toBe(true);
    expect(s.lowerApprox95BoundAbove50Percent).toBe(false);
  });

  it("records a failed strength target without marking a valid match as broken", () => {
    const { input, output } = setup(() => "loss");
    expect(run(input, output).status).toBe(0);
    const s = JSON.parse(readFileSync(output, "utf8"));
    expect(s.total.score).toBe(0);
    expect(s.meetsNominal50PercentPilotTarget).toBe(false);
    expect(s.descriptivePerformanceElo).toBe(null);
  });

  it("rejects unresolved games, never silently counts them as draws", () => {
    const { input, output } = setup((batch, index) =>
      batch === 2 && index === 3 ? "unresolved" : "draw");
    const response = run(input, output);
    expect(response.status).not.toBe(0);
    expect(response.stderr).toContain("Invalid game result");
  });

  it("rejects a missing batch", () => {
    const { input, output } = setup();
    unlinkSync(join(input, "batch-3.json"));
    const response = run(input, output);
    expect(response.status).not.toBe(0);
    expect(response.stderr).toContain("Expected 4 JSON batch files");
  });

  it("rejects opening mismatches within a reversed-color pair", () => {
    const { input, output } = setup();
    const path = join(input, "batch-1.json");
    const data = JSON.parse(readFileSync(path, "utf8"));
    data.games[1].opening = "unpaired opening";
    writeFileSync(path, JSON.stringify(data));
    const response = run(input, output);
    expect(response.status).not.toBe(0);
    expect(response.stderr).toContain("mismatched openings");
  });
});
