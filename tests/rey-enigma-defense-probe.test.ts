import { describe, expect, it } from "vitest";
import { Board, generateIdeas, HumanSwiftEngine, summarizeHumanity } from "../src";
import { replayReyEnigmaGame } from "./fixtures/rey-enigma";

/**
 * Comparison fixture: run this IDENTICAL file against main and PR #44.
 * Output is diagnostic, not an Elo, centipawn-loss or humanity percentage.
 * Timing is deliberately bounded; identical nominal budgets may yield
 * different completed depths on different CI runners.
 */
describe("Rey Enigma historical-game control and defensive decision probes", () => {
  const replay = replayReyEnigmaGame();

  it("replays exactly 50 full moves legally to Black's checkmate", () => {
    expect(replay.moves).toHaveLength(100);
    expect(replay.positions).toHaveLength(101);
    expect(replay.sans[replay.sans.length - 1]).toBe("Qh1#");
    expect(replay.positions[100].isCheckmate()).toBe(true);
    expect(replay.positions[100].turn()).toBe("w");
    expect(replay.positions[100].legalMoves()).toHaveLength(0);
  });

  it("reports reproducible decisions at three pressure checkpoints", () => {
    const samples = [
      { label: "before-34-black-Rc1", ply: 67 },
      { label: "after-37-black-Rcc1", ply: 74 },
      { label: "after-41-black-Re1", ply: 82 },
    ];
    const observations = [];
    for (const sample of samples) {
      const board: Board = replay.positions[sample.ply];
      const ideas = generateIdeas(board);
      const moveHistory = replay.moves.slice(0, sample.ply);
      const result = new HumanSwiftEngine().search(board, {
        depth: 3,
        timeMs: 420,
        safetyDepth: 2,
        ponderDepth: 2,
        safetyTimeMs: 75,
        ponderTimeMs: 90,
        safetyCandidateLimit: 3,
        concreteCandidateLimit: 6,
        candidateLimit: 3,
        tacticalSearchDepth: 0,
        adaptiveThinking: false,
        randomness: 0,
        errorBudget: 0.025,
        seed: 87,
        moveHistory,
      });
      expect(result.move, sample.label).not.toBeNull();
      expect(board.legalMoves().some((move) => move.uci() === result.move?.uci()), sample.label).toBe(true);
      const legal = board.legalMoves().length;
      const report = {
        position: sample.label,
        ply: sample.ply,
        fen: board.toFEN(),
        legal,
        inCheck: board.isInCheck(board.turn()),
        firstIdea: ideas.ideas[0]?.kind ?? null,
        defenseIdeas: ideas.ideas.filter((idea) => idea.kind === "defend").length,
        selected: result.move?.uci() ?? null,
        engineMove: result.decision?.engineMove ?? null,
        decisionSource: result.decision?.source ?? null,
        plan: result.mind?.plan ?? null,
        concern: result.mind?.concern ?? "",
        depth: result.depth,
        choiceReasons: result.decision?.reasons ?? [],
      };
      console.log("REY_DEFENSE_PROBE " + JSON.stringify(report));
      observations.push({ decision: result.decision, mind: result.mind });
    }
    const summary = summarizeHumanity(observations);
    expect(summary.decisions).toBe(samples.length);
    expect(summary.reasonCoverage).toBe(1);
    console.log("REY_DEFENSE_SUMMARY " + JSON.stringify({
      decisions: summary.decisions,
      engineAgreementRate: summary.engineAgreementRate,
      humanPlanRate: summary.humanPlanRate,
      engineFallbackRate: summary.engineFallbackRate,
      planContinuationRate: summary.planContinuationRate,
      reasonCoverage: summary.reasonCoverage,
      distinctPlans: summary.distinctPlans,
    }));
  });
});
