import { describe, expect, it } from "vitest";
import { HumanSwiftEngine, SwiftEngine, swiftPlayProfile } from "../src";
import { immediateMaterialLoss, safeProvisionalMove } from "../src/chess/blunder-guard";
import { staticExchange } from "../src/chess/see";
import { replayAfLinggaGame } from "./fixtures/af-lingga";

describe("AfLingga vs SwiftChessTV, November 9, 2026: queen-for-rook trap", () => {
  const game = replayAfLinggaGame();

  it("reconstructs the supplied game and its exact 27...Nxe4+ 28.Qxh2 Qxh2+ sequence", () => {
    expect(game.positions).toHaveLength(63);
    expect(game.positions[62].isCheckmate()).toBe(true);
    expect(game.sans.slice(53, 57)).toEqual(["Nxe4+", "Qxh2", "Qxh2+", "Kf3"]);
    const before = game.positions[54];
    expect(before.turn()).toBe("w");
    expect(before.isInCheck("w")).toBe(true);
    expect(before.pieceAt("g1")).toBe("wq");
    expect(before.pieceAt("h2")).toBe("br");
    expect(before.pieceAt("f4")).toBe("bq");
    const queenCapture = before.legalMoves().find((move) => move.uci() === "g1h2");
    expect(queenCapture).toBeDefined();
    const after = before.makeMove(queenCapture!);
    expect(after.legalMoves().some((move) => move.uci() === "f4h2")).toBe(true);
    expect(immediateMaterialLoss(before, queenCapture!)).toBeGreaterThanOrEqual(390);
    expect(staticExchange(before, queenCapture!)).toBeLessThanOrEqual(-390);
    console.log("AFLINGGA_QUEEN_TRAP " + JSON.stringify({
      fen: before.toFEN(),
      loss: immediateMaterialLoss(before, queenCapture!),
      exchange: staticExchange(before, queenCapture!),
      choices: before.legalMoves().map((move) => ({
        uci: move.uci(),
        immediateLoss: immediateMaterialLoss(before, move),
      })),
    }));
  });

  it("tests every escape from the discovered rook check, including the tempting king retreat", () => {
    const before = game.positions[54];
    const legal = before.legalMoves();
    expect(legal.map((move) => move.uci()).sort()).toEqual(["e2d1", "g1f2", "g1g2", "g1h2"]);
    const kingRetreat = legal.find((move) => move.uci() === "e2d1")!;
    const afterKingRetreat = before.makeMove(kingRetreat);
    const d2Check = afterKingRetreat.legalMoves().find((move) => move.uci() === "f4d2");
    console.log("AFLINGGA_KING_RETREAT " + JSON.stringify({
      kingMove: kingRetreat.uci(),
      fen: afterKingRetreat.toFEN(),
      replies: afterKingRetreat.legalMoves().map((move) => ({
        uci: move.uci(),
        mate: afterKingRetreat.makeMove(move).isCheckmate(),
      })).filter((move) => move.mate),
      queenToD2: !!d2Check,
      queenToD2Mate: d2Check ? afterKingRetreat.makeMove(d2Check).isCheckmate() : false,
    }));
    expect(d2Check).toBeDefined();
    expect(afterKingRetreat.makeMove(d2Check!).isCheckmate()).toBe(true);
    for (const queenBlock of ["g1f2", "g1g2"]) {
      const move = legal.find((candidate) => candidate.uci() === queenBlock)!;
      expect(immediateMaterialLoss(before, move), queenBlock).toBeGreaterThanOrEqual(800);
    }
  });

  it("diagnoses the currently live selection and emergency fallback on the exact game", () => {
    const before = game.positions[54];
    const queenCapture = before.legalMoves().find((move) => move.uci() === "g1h2")!;
    const opts = swiftPlayProfile(before, game.moves.slice(0, 54)).options;
    const raw = new SwiftEngine().search(before, { depth: 4, timeMs: 850 });
    const result = new HumanSwiftEngine().search(before, {
      ...opts, timeMs: 950, adaptiveThinking: false,
      moveHistory: game.moves.slice(0, 54), seed: 1109,
    });
    const provisional = safeProvisionalMove(before, queenCapture, 2);
    console.log("AFLINGGA_ENGINE_DIAGNOSTIC " + JSON.stringify({
      raw: raw.move?.uci(), rawDepth: raw.depth, rawScore: raw.score,
      selected: result.move?.uci(), resultDepth: result.depth, resultScore: result.score,
      source: result.decision?.source, reasons: result.decision?.reasons,
      kind: swiftPlayProfile(before, game.moves.slice(0, 54)).kind,
      provisional: provisional?.uci() ?? null,
      selectedImmediateLoss: result.move ? immediateMaterialLoss(before, result.move) : null,
    }));
    expect(result.move).not.toBeNull();
    expect(before.legalMoves().some((move) => move.uci() === result.move?.uci())).toBe(true);
    expect(provisional?.uci()).not.toBe("g1h2");
  });
});
