import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine, swiftPlayProfile } from "../src";
import { immediateMaterialLoss } from "../src/chess/blunder-guard";
import { staticExchange } from "../src/chess/see";
import { replayAgusbmwGame } from "./fixtures/agusbmw";

describe("Agusbmw vs SwiftChessTV 2026-11-14 real-game loss", () => {
  const game = replayAgusbmwGame();

  it("replays exact 60-move game to the supplied final checkmate FEN", () => {
    expect(game.positions).toHaveLength(121);
    expect(game.moves).toHaveLength(120);
    expect(game.positions[120].isCheckmate()).toBe(true);
    expect(game.positions[120].toFEN()).toBe("8/8/8/3n4/3P4/5kp1/8/5K1r w - - 6 61");
    expect(game.sans.slice(20, 26)).toEqual(["Nb5", "c6", "a4", "cxb5", "axb5", "Bb7"]);
    expect(game.sans.slice(46, 50)).toEqual(["Qxb4", "axb4", "Rxa8+", "Ng8"]);
    expect(game.sans.slice(98, 103)).toEqual(["Rxe3", "Nd5+", "Kf3", "Rxe3+", "Kf2"]);
  });

  it("records material/tactics and legal alternatives at the suspect decisions", () => {
    const positions = [
      { ply: 14, label: "8.Qd3, opening development" },
      { ply: 16, label: "9.Re1, repeated rook maneuver begins" },
      { ply: 18, label: "10.Re2, rook maneuver continues" },
      { ply: 20, label: "11.Nb5, before the ...c6 pawn chase" },
      { ply: 22, label: "12.a4, knight b5 attacked by c6 pawn" },
      { ply: 46, label: "24.Qxb4, queen takes bishop defended by a-pawn" },
      { ply: 98, label: "50.Rxe3, rook captures pawn while enemy rook supports e-file" },
    ];
    for (const { ply, label } of positions) {
      const before = game.positions[ply];
      const actual = before.legalMoves().find((m) => m.uci() === game.moves[ply]);
      expect(actual).toBeDefined();
      const options = before.legalMoves().map((move) => ({
        uci: move.uci(), loss: immediateMaterialLoss(before, move),
        see: before.pieceAt(move.to) ? staticExchange(before, move) : null,
      }));
      const actualScore = options.find((x) => x.uci === actual!.uci());
      console.log("AGUSBMW_POSITION " + JSON.stringify({
        label, ply, fen: before.toFEN(), played: actual!.uci(), nextSan: game.sans[ply],
        actualScore, options: options.filter((x) => x.loss < (actualScore?.loss ?? 0)).slice(0, 16),
        legalCount: options.length,
        materialBefore: before.material(), materialAfter: before.makeMove(actual!).material(),
      }));
    }
  });

  it("compares timed current human choice and frozen-depth root choice at actual errors", () => {
    for (const ply of [18, 20, 22, 46, 98]) {
      const board = game.positions[ply];
      const history = game.moves.slice(0, ply);
      const profile = swiftPlayProfile(board, history);
      const strict = new SwiftEngine().search(board, { depth: 4, timeMs: 1200 });
      const human = new HumanSwiftEngine().search(board, {
        ...profile.options, timeMs: Math.min(1700, profile.options.timeMs ?? 1700),
        adaptiveThinking: false, totalTimeMs: 2100,
        randomness: 0, seed: 1411, moveHistory: history,
      });
      console.log("AGUSBMW_SEARCH " + JSON.stringify({
        ply, fen: board.toFEN(), actual: game.moves[ply], style: profile.kind,
        strict: strict.move?.uci(), strictDepth: strict.depth, strictScore: strict.score,
        human: human.move?.uci(), source: human.decision?.source,
        humanDepth: human.depth, humanScore: human.score,
        humanReasons: human.decision?.reasons.slice(0, 3),
        humanLoss: human.move ? immediateMaterialLoss(board, human.move) : null,
        actualLoss: immediateMaterialLoss(board, board.legalMoves().find((m) => m.uci() === game.moves[ply])!),
      }));
      expect(strict.move).not.toBeNull();
      expect(human.move).not.toBeNull();
    }
  }, 35_000);
});
