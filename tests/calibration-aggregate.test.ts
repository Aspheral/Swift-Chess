import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "swift-calibration-"));
  tempRoots.push(root);
  return root;
}

function report(mode: "strict" | "human", batch: number, results: Array<"win" | "loss" | "draw">) {
  return {
    configuration: { mode, batch },
    games: results.map((result, index) => ({
      game: index + 1,
      mode,
      swiftColor: index % 2 === 0 ? "White" : "Black",
      opening: index % 2 === 0 ? "Opening A" : "Opening B",
      result,
      reason: result === "draw" ? "threefold" : "checkmate",
      seed: batch * 1000 + index,
      plies: 40,
      averageDepth: 4,
      averageNodes: 20_000,
      moves: [],
      finalFen: "8/8/8/8/8/8/4k3/4K3 w - - 0 1",
    })),
  };
}

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("calibration aggregation", () => {
  it("combines three batches per mode and keeps a 50% strict sample at 1650", () => {
    const root = makeRoot();
    const input = join(root, "input");
    const output = join(root, "output", "summary.json");
    mkdirSync(input, { recursive: true });

    for (const mode of ["strict", "human"] as const) {
      for (let batch = 0; batch < 3; batch += 1) {
        const results = Array.from({ length: 20 }, () => "draw" as const);
        writeFileSync(
          join(input, `${mode}-batch-${batch}.json`),
          JSON.stringify(report(mode, batch, results)),
          "utf8",
        );
      }
    }

    const run = spawnSync(process.execPath, ["scripts/aggregate-calibration.mjs", input, output], {
      cwd: process.cwd(),
      env: { ...process.env, SWIFT_EXPECTED_BATCHES: "3" },
      encoding: "utf8",
    });

    expect(run.status, run.stderr || run.stdout).toBe(0);
    const summary = JSON.parse(readFileSync(output, "utf8"));
    expect(summary.modes.strict.games).toBe(60);
    expect(summary.modes.strict.scoreRate).toBe(0.5);
    expect(summary.modes.strict.performanceElo).toBe(1650);
    expect(summary.modes.strict.batches).toBe(3);
    expect(summary.modes.human.games).toBe(60);
  });

  it("fails when an expected batch is missing", () => {
    const root = makeRoot();
    const input = join(root, "input");
    const output = join(root, "output", "summary.json");
    mkdirSync(input, { recursive: true });

    for (const mode of ["strict", "human"] as const) {
      for (let batch = 0; batch < (mode === "strict" ? 2 : 3); batch += 1) {
        writeFileSync(
          join(input, `${mode}-batch-${batch}.json`),
          JSON.stringify(report(mode, batch, Array.from({ length: 20 }, () => "draw" as const))),
          "utf8",
        );
      }
    }

    const run = spawnSync(process.execPath, ["scripts/aggregate-calibration.mjs", input, output], {
      cwd: process.cwd(),
      env: { ...process.env, SWIFT_EXPECTED_BATCHES: "3" },
      encoding: "utf8",
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Expected 3 strict calibration batches, found 2");
  });
});
