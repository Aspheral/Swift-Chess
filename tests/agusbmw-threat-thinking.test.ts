import { describe, expect, it } from "vitest";
import { Board, humanErrorProfile, swiftPlayProfile } from "../src";
import { defensiveThinkingNeed } from "../src/chess/play-profile";
import { replayAgusbmwGame } from "./fixtures/agusbmw";

describe("Early opponent-knight pressure and pawn-chase thinking time", () => {
  const game = replayAgusbmwGame();

  it("notices White's knight c3 attacked by Black's knight e4 before rook shuffling", () => {
    for (const ply of [14, 16, 18]) {
      const board = game.positions[ply];
      const need = defensiveThinkingNeed(board, humanErrorProfile(board, 0.05));
      const profile = swiftPlayProfile(board, game.moves.slice(0, ply));
      expect(need, "ply " + ply).toBeGreaterThanOrEqual(0.60);
      expect(profile.kind, "ply " + ply).toBe("tactical");
      expect(profile.options.timeMs, "ply " + ply).toBeGreaterThan(2050);
      console.log("AGUSBMW_EARLY_PRESSURE " + JSON.stringify({
        ply, need, kind: profile.kind, searchMs: profile.options.timeMs,
      }));
    }
  });

  it("spends extra actual search time when a pawn directly attacks a knight", () => {
    const board = game.positions[22]; // after 11...c6, before 12.a4
    const need = defensiveThinkingNeed(board, humanErrorProfile(board, 0.05));
    const profile = swiftPlayProfile(board, game.moves.slice(0, 22));
    expect(need).toBeGreaterThanOrEqual(0.7);
    expect(profile.kind).toBe("tactical");
    expect(profile.options.timeMs).toBeGreaterThan(2200);
    expect(board.legalMoves().some((move) => move.uci() === "a2a4")).toBe(true);
  });

  it("remains quick in a safe initial setup and does not fabricate an attack near the board edge", () => {
    const board = Board.start();
    expect(defensiveThinkingNeed(board, humanErrorProfile(board, 0.05))).toBe(0);
    const noThreat = Board.fromFEN("4k3/8/8/8/8/8/6N1/4K3 w - - 0 1");
    expect(defensiveThinkingNeed(noThreat, humanErrorProfile(noThreat, 0.05))).toBe(0);
  });

  it("recognizes an advanced enemy knight attacking Black's own knight too", () => {
    const reversed = Board.fromFEN("4k3/8/2n5/4N3/8/8/8/4K3 b - - 0 1");
    expect(defensiveThinkingNeed(reversed, humanErrorProfile(reversed, 0.05))).toBeGreaterThanOrEqual(0.60);
  });
});
