import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
type Outcome = "win" | "draw" | "loss" | "unresolved";

function fixture(override?: { batch?: number; opponentElo?: number; mode?: string;
  result?: (batch: number, game: number) => Outcome }) {
  const root = mkdtempSync(join(tmpdir(), "swift-2050-"));
  roots.push(root);
  const input = join(root, "input");
  const output = join(root, "summary.json");
  mkdirSync(input, { recursive: true });
  for (let batch = 0; batch < 10; batch++) {
    const games = Array.from({ length: 20 }, (_, i) => ({
      game: i + 1,
      swiftColor: i % 2 === 0 ? "White" : "Black",
      opening: `Opening ${Math.floor(i / 2)}`,
      result: override?.result?.(batch, i) ?? "draw",
    }));
    writeFileSync(join(input, `batch-${batch}.json`), JSON.stringify({
      configuration: {
        mode: override?.mode ?? "human",
        opponentElo: override?.opponentElo ?? 2050,
        batch: batch === 0 ? override?.batch ?? 0 : batch,
        maxPlies: 360,
      },
      games,
    }), "utf8");
  }
  return { input, output };
}

function run(input: string, output: string) {
  return spawnSync(process.execPath,
    ["scripts/aggregate-2050-gate.mjs", input, output],
    { cwd: process.cwd(), encoding: "utf8" });
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Stockfish UCI_Elo 2050 challenge aggregation", () => {
  it("passes exactly 50% score while distinguishing draws from wins", () => {
    const { input, output } = fixture();
    const result = run(input, output);
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(output, "utf8"));
    expect(summary.total).toMatchObject({
      games: 200, wins: 0, losses: 0, draws: 200,
      score: 100, scoreRate: 0.5, winRate: 0,
    });
    expect(summary.byColor.White.games).toBe(100);
    expect(summary.byColor.Black.games).toBe(100);
    expect(summary.passedNominal50PercentGate).toBe(true);
    expect(summary.lowerBoundAbove50Percent).toBe(false);
  });

  it("fails even a half-point below 100/200 and preserves the failed summary", () => {
    const { input, output } = fixture({
      result: (batch, game) => batch === 0 && game === 0 ? "loss" : "draw",
    });
    const result = run(input, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("below the 100-point gate");
    const summary = JSON.parse(readFileSync(output, "utf8"));
    expect(summary.total.score).toBe(99.5);
    expect(summary.passedNominal50PercentGate).toBe(false);
  });

  it("rejects unfinished chess games instead of treating them as draws", () => {
    const { input, output } = fixture({
      result: (batch, game) => batch === 4 && game === 3 ? "unresolved" : "draw",
    });
    const result = run(input, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unresolved game");
  });

  it("rejects a mismatched opponent rating", () => {
    const { input, output } = fixture({ opponentElo: 1950 });
    const result = run(input, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected Stockfish UCI_Elo=2050");
  });

  it("rejects missing or duplicated batch identities", () => {
    const { input, output } = fixture({ batch: 1 });
    const result = run(input, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Duplicate batch 1");
  });

  it("rejects the underlying strict engine as a substitute for human-play Swift", () => {
    const { input, output } = fixture({ mode: "strict" });
    const result = run(input, output);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected Swift's human-play profile");
  });

  it("accepts genuine wins as points independently of the draw rate", () => {
    const { input, output } = fixture({ result: (_, i) => i % 2 === 0 ? "win" : "loss" });
    const result = run(input, output);
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(output, "utf8"));
    expect(summary.total).toMatchObject({ wins: 100, losses: 100, draws: 0, score: 100 });
    expect(summary.total.winRate).toBe(0.5);
  });
});
