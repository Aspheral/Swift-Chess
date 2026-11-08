import { describe, expect, it } from "vitest";
import { Board, generateIdeas, imminentRookInvasion, understandPosition, SwiftMind } from "../src";
import { replayReyEnigmaGame } from "./fixtures/rey-enigma";

describe("Anticipatory rook-invasion reasoning", () => {
  const whiteThreat = Board.fromFEN("2r1k3/8/8/8/8/1R6/1P4P1/6K1 w - - 0 1");
  const blackThreat = Board.fromFEN("6k1/1p4p1/1r6/8/8/8/8/2R1K3 b - - 0 1");

  it("detects a legal, dangerous rook entry on White's next opponent turn", () => {
    expect(whiteThreat.isInCheck("w")).toBe(false);
    expect(understandPosition(whiteThreat).king.w.rookInvasionPressure).toBe(0);
    expect(imminentRookInvasion(whiteThreat, "w")).toBeGreaterThanOrEqual(2);
    expect(understandPosition(whiteThreat).king.w.loomingRookInvasion).toBeGreaterThanOrEqual(2);
  });

  it("offers a concrete White move that blocks the open invasion file", () => {
    const generation = generateIdeas(whiteThreat);
    const prevention = generation.ideas.find((idea) => idea.kind === "defend" && idea.reason.includes("before it starts"));
    expect(prevention).toBeDefined();
    expect(prevention?.candidates.some((move) => move.uci() === "b3c3")).toBe(true);
    const blocking = whiteThreat.legalMoves().find((move) => move.uci() === "b3c3");
    expect(blocking).toBeDefined();
    expect(imminentRookInvasion(whiteThreat.makeMove(blocking!), "w")).toBe(0);
    const state = new SwiftMind().observe(whiteThreat, generation, {
      tacticalPressure: 0.04,
      practicalPressure: 0.12,
      gameStage: "middlegame",
    });
    expect(state.concern).toMatch(/next turn/i);
    expect(state.plan).toBe("defend");
  });

  it("works with colors reversed rather than favoring White", () => {
    expect(imminentRookInvasion(blackThreat, "b")).toBeGreaterThanOrEqual(2);
    const block = blackThreat.legalMoves().find((move) => move.uci() === "b6c6");
    expect(block).toBeDefined();
    expect(imminentRookInvasion(blackThreat.makeMove(block!), "b")).toBe(0);
    const generation = generateIdeas(blackThreat);
    expect(generation.ideas.some((idea) =>
      idea.kind === "defend" && idea.reason.includes("before it starts") &&
      idea.candidates.some((move) => move.uci() === "b6c6"),
    )).toBe(true);
  });

  it("ignores blocked files, unprotected rook sacrifices, the opening and kings far from home", () => {
    const blocked = Board.fromFEN("2r1k3/2p5/8/8/8/1R6/1P4P1/6K1 w - - 0 1");
    const hanging = Board.fromFEN("2r1k3/8/8/8/8/3B4/6P1/5RK1 w - - 0 1");
    const advanced = Board.fromFEN("2r1k3/8/8/8/8/4K3/8/8 w - - 0 1");
    expect(imminentRookInvasion(blocked, "w")).toBe(0);
    expect(imminentRookInvasion(hanging, "w")).toBe(0);
    expect(imminentRookInvasion(advanced, "w")).toBe(0);
    expect(imminentRookInvasion(Board.start(), "w")).toBe(0);
    expect(generateIdeas(Board.start()).ideas.some((idea) => idea.reason.includes("before it starts"))).toBe(false);
  });

  it("records warnings from real pre-invasion game checkpoints without inventing forced outcomes", () => {
    const game = replayReyEnigmaGame();
    for (const ply of [58, 60, 62, 64, 66]) {
      const board = game.positions[ply];
      expect(board.turn()).toBe("w");
      const u = understandPosition(board).king.w;
      console.log("REY_ROOK_FORECAST " + JSON.stringify({
        ply, fen: board.toFEN(),
        actualPressure: u.rookInvasionPressure,
        forecast: u.loomingRookInvasion,
        kingInCheck: board.isInCheck("w"),
      }));
      expect(Number.isFinite(u.loomingRookInvasion)).toBe(true);
      expect(u.loomingRookInvasion).toBeGreaterThanOrEqual(0);
    }
  });
});
