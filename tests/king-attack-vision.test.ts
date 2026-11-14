import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import { replayAfLinggaGame } from "./fixtures/af-lingga";

type KingRiskProbe = {
  kingAttackRisk(board: Board, square: number, defender: "w" | "b", pieces: number, queensPresent: boolean): number;
};
const engine = new SwiftEngine() as unknown as KingRiskProbe;

function risk(board: Board, defender: "w" | "b", queensPresent = true): number {
  let king = -1, count = 0;
  for (let square = 0; square < 64; square++) {
    const piece = board.pieceAt(square);
    if (piece) count++;
    if (piece === defender + "k") king = square;
  }
  return engine.kingAttackRisk(board, king, defender, count, queensPresent);
}

/** Rotate 180 degrees, switch colors, preserve only piece placement. */
function switchSides(board: Board): Board {
  const chars: (string | null)[] = Array(64).fill(null);
  for (let square = 0; square < 64; square++) {
    const piece = board.pieceAt(square);
    if (piece) chars[63 - square] = piece[0] === "w"
      ? piece[1].toUpperCase() : piece[1];
  }
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "", blanks = 0;
    for (let file = 0; file < 8; file++) {
      const p = chars[rank * 8 + file];
      if (p === null) blanks++;
      else {
        if (blanks) row += String(blanks);
        blanks = 0;
        row += p;
      }
    }
    if (blanks) row += String(blanks);
    ranks.push(row);
  }
  return Board.fromFEN(ranks.join("/") + " " + (board.turn() === "w" ? "b" : "w") + " - - 0 1");
}

describe("Prospective king attack in Swift's concrete evaluation", () => {
  const game = replayAfLinggaGame();

  it("recognizes coordinated attackers before forced check in the AfLingga game", () => {
    const earlier = game.positions[48]; // After 24...Bf8
    const latest = game.positions[52];  // After 26...Rh2, White to move
    expect(earlier.isInCheck("w")).toBe(false);
    expect(latest.isInCheck("w")).toBe(false);
    const start = risk(earlier, "w"), developed = risk(latest, "w");
    console.log("KING_HUNT_EVAL " + JSON.stringify({
      earlier: start, preCheck: developed,
      fen: latest.toFEN(),
    }));
    expect(developed).toBeGreaterThan(0);
    expect(developed).toBeGreaterThanOrEqual(start);
  });

  it("is color-symmetric and only a modest score, never a hard queen-sacrifice veto", () => {
    const board = game.positions[52];
    expect(risk(board, "w")).toBe(risk(switchSides(board), "b"));
    expect(risk(board, "w")).toBeLessThanOrEqual(65);
    expect(risk(board, "w")).toBeGreaterThanOrEqual(0);
  });

  it("does not punish kings in queenless technical endings or at the opening setup", () => {
    const middlegame = game.positions[52];
    expect(risk(middlegame, "w", false)).toBe(0);
    expect(risk(Board.start(), "w")).toBe(0);
    expect(risk(Board.start(), "b")).toBe(0);
    const ending = Board.fromFEN("r5k1/8/8/8/8/3R4/8/4K3 w - - 0 1");
    expect(risk(ending, "w")).toBe(0);
    expect(risk(ending, "b")).toBe(0);
  });

  it("preserves completed-depth tactical correctness under king pressure", () => {
    const positions = [
      Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1"),
      game.positions[52],
    ];
    for (const board of positions) {
      const answer = new SwiftEngine().search(board, { depth: 3 });
      expect(answer.depth).toBe(3);
      expect(board.legalMoves().some((move) => move.uci() === answer.move?.uci())).toBe(true);
      console.log("KING_HUNT_DEPTH " + JSON.stringify({
        fen: board.toFEN(), move: answer.move?.uci(),
        score: answer.score, nodes: answer.nodes,
      }));
    }
  }, 35_000);
});
