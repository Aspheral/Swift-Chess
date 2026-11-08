import { describe, expect, it } from "vitest";
import { HumanSwiftEngine, SwiftEngine, generateIdeas } from "../src";
import { replayReyEnigmaGame } from "./fixtures/rey-enigma";

/**
 * No timeMs / safetyTimeMs / ponderTimeMs: both versions must finish exactly
 * the same requested search depths. Move differences are then meaningful
 * observations about the decision layers (not proof of increased playing strength).
 */
describe("Rey Enigma completed-depth comparison", () => {
  it("fully searches the quiet but dangerous position after 37...Rcc1", () => {
    const game = replayReyEnigmaGame();
    const ply = 74;
    const board = game.positions[ply];
    expect(board.turn()).toBe("w");
    expect(board.isInCheck("w")).toBe(false);
    const rawEngine = new SwiftEngine();
    const raw = rawEngine.search(board, { depth: 3 });
    expect(raw.depth).toBe(3);

    const result = new HumanSwiftEngine().search(board, {
      depth: 3,
      safetyDepth: 2,
      ponderDepth: 2,
      safetyCandidateLimit: 3,
      concreteCandidateLimit: 6,
      candidateLimit: 3,
      tacticalSearchDepth: 0,
      adaptiveThinking: false,
      randomness: 0,
      errorBudget: 0.025,
      seed: 87,
      moveHistory: game.moves.slice(0, ply),
    });
    expect(result.depth).toBe(3);
    expect(result.move).not.toBeNull();
    expect(board.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
    const generation = generateIdeas(board);
    console.log("REY_FIXED_DEPTH_PROBE " + JSON.stringify({
      ply,
      fen: board.toFEN(),
      rawEngineMove: raw.move?.uci(),
      rawEngineDepth: raw.depth,
      selected: result.move?.uci(),
      selectedEngineMove: result.decision?.engineMove,
      selectedDepth: result.depth,
      decisionSource: result.decision?.source,
      topPlan: result.mind?.plan,
      concern: result.mind?.concern,
      defensiveIdeas: generation.ideas.filter((idea) => idea.kind === "defend")
        .map((idea) => ({ reason: idea.reason, candidates: idea.candidates.map((move) => move.uci()) })),
      reasons: result.decision?.reasons,
    }));
  });
});
