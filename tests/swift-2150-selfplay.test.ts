import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { Game, HumanSwiftEngine, swiftPlayProfile, summarizeHumanity, SWIFT_PLAY_PROFILE } from "../src";
import type { HumanityObservation } from "../src";

const RUN = process.env.SWIFT_RUN_2150_SELFPLAY === "1";
const MAX_PLIES = Math.max(80, Number.parseInt(process.env.SWIFT_SELFPLAY_MAX_PLIES ?? "360", 10) || 360);
const BUDGET_SCALE = Math.max(0.1, Math.min(1, Number(process.env.SWIFT_LAB_BUDGET_SCALE ?? "1") || 1));
const OPENINGS = [
  { name: "Italian Game", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"] },
  { name: "Queen's Gambit Declined", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6"] },
  { name: "Reti", moves: ["g1f3", "d7d5", "c2c4", "e7e6"] },
  { name: "Four Knights", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"] },
] as const;

(RUN ? describe : describe.skip)("Swift 2150 human-style self-play gauntlet", () => {
  it("replays legal games, records per-move reasons, and never calls an unfinished game a draw", () => {
    const records = [];
    for (let index = 0; index < OPENINGS.length; index++) {
      const opening = OPENINGS[index];
      const game = Game.start();
      for (const uci of opening.moves) game.playUci(uci);
      const engines = { w: new HumanSwiftEngine(), b: new HumanSwiftEngine() };
      const observations: { White: HumanityObservation[]; Black: HumanityObservation[] } = { White: [], Black: [] };
      const decisions = [];

      while (game.result() === "ongoing" && game.moveHistory().length < MAX_PLIES) {
        const board = game.board();
        const color = game.turn();
        const player = color === "w" ? "White" : "Black";
        const history = game.moveHistory();
        const profile = swiftPlayProfile(board, history);
        const started = Date.now();
        const result = engines[color].search(board, {
          ...profile.options,
          timeMs: Math.max(100, Math.round(profile.options.timeMs! * BUDGET_SCALE)),
          seed: 2150_000 + index * 10007 + (color === "w" ? 1 : 2),
          moveHistory: history,
          positionHistoryKeys: game.positionHistoryKeys(),
        });
        if (!result.move) throw new Error("Swift produced no move in " + game.fen());
        const observation = { decision: result.decision, mind: result.mind };
        observations[player].push(observation);
        decisions.push({
          ply: history.length + 1,
          player,
          uci: result.move.uci(),
          elapsedMs: Date.now() - started,
          depth: result.depth,
          nodes: result.nodes,
          score: result.score,
          source: result.decision?.source ?? null,
          engineMove: result.decision?.engineMove ?? null,
          engineAgreement: result.decision?.engineAgreement ?? null,
          reasons: result.decision?.reasons ?? [],
          plan: result.mind?.plan ?? null,
          planAge: result.mind?.planAge ?? null,
          planConfidence: result.mind?.confidence ?? null,
          planProgress: result.mind?.planProgress ?? null,
        });
        game.playUci(result.move.uci());
      }

      const reason = game.result();
      const victor = reason === "checkmate" ? (game.turn() === "w" ? "Black" : "White") : null;
      records.push({
        game: index + 1,
        mode: "self-play",
        opening: opening.name,
        white: "Swift",
        black: "Swift",
        result: reason === "ongoing" ? "unresolved" : victor ? (victor === "White" ? "white-win" : "black-win") : "draw",
        reason,
        plies: game.moveHistory().length,
        moves: game.moveHistory(),
        finalFen: game.fen(),
        humanityByColor: {
          White: summarizeHumanity(observations.White),
          Black: summarizeHumanity(observations.Black),
        },
        decisions,
      });
      console.log("Swift self-play " + opening.name + ": " + reason + ", plies=" + game.moveHistory().length);
    }
    mkdirSync("calibration-results", { recursive: true });
    writeFileSync("calibration-results/2150-selfplay.json", JSON.stringify({
      configuration: { mode: "self-play", swiftProfile: SWIFT_PLAY_PROFILE, maxPlies: MAX_PLIES, budgetScale: BUDGET_SCALE },
      generatedAt: new Date().toISOString(),
      games: records,
    }, null, 2));
    expect(records.length).toBe(OPENINGS.length);
    for (const record of records) {
      expect(record.moves.length).toBe(record.plies);
      if (record.result === "unresolved") expect(record.reason).toBe("ongoing");
    }
  }, 6_600_000);
});
