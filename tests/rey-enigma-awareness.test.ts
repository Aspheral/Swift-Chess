import { describe, expect, it } from "vitest";
import { generateIdeas, SwiftMind, understandPosition } from "../src";
import { replayReyEnigmaGame } from "./fixtures/rey-enigma";

/**
 * Actual midgame checkpoints from the supplied Swift - Rey Enigma score.
 * Tests of threat awareness, NOT assertions that a particular historical
 * move is the only good move or that a position is objectively lost.
 */
describe("Rey Enigma rook invasion awareness", () => {
  const game = replayReyEnigmaGame();

  it("distinguishes the coming intrusion from established back-rank pressure", () => {
    const before = game.positions[67]; // 34.Qxe2, Black to move
    const first = game.positions[68];  // 34...Rc1+, White to move
    const doubled = game.positions[74]; // 37...Rcc1, White to move
    const later = game.positions[82];  // 41...Re1, White to move

    expect(understandPosition(before).king.w.rookInvasionPressure).toBe(0);
    expect(understandPosition(first).king.w.rookInvasionPressure).toBeGreaterThanOrEqual(2);
    expect(understandPosition(doubled).king.w.rookInvasionPressure).toBeGreaterThanOrEqual(4);
    expect(understandPosition(later).king.w.rookInvasionPressure).toBeGreaterThanOrEqual(4);
    expect(doubled.isInCheck("w")).toBe(false);
  });

  it("notices and explains the strategic danger at 37...Rcc1", () => {
    const board = game.positions[74];
    const generation = generateIdeas(board);
    const defensive = generation.ideas.find((idea) =>
      idea.kind === "defend" && idea.reason.includes("penetrated"),
    );
    expect(defensive).toBeDefined();
    expect(defensive?.priority).toBeGreaterThan(80);
    expect(defensive?.candidates.length).toBeGreaterThan(0);
    for (const move of defensive?.candidates ?? []) {
      expect(board.legalMoves().some((legal) => legal.uci() === move.uci())).toBe(true);
    }
    const mind = new SwiftMind().observe(board, generation, {
      tacticalPressure: 0.04,
      practicalPressure: 0.12,
      gameStage: "middlegame",
    }, game.moves.slice(0, 74));
    expect(mind.concern).toMatch(/rooks.*king/i);
    expect(mind.plan).toBe("defend");
  });
});
