import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import type { Move } from "../src/chess/board";

const legal = (b: Board, uci: string): Move => {
  const move = b.legalMoves().find(m => m.uci() === uci);
  if (!move) throw new Error("Missing legal move: " + uci);
  return move;
};
const cases = [
  {
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4P3/2Bp4/5N2/PPP2PPP/RNBQK2R b KQkq - 0 5",
    best: "d7d5",
  },
  {
    fen: "r1bqk2r/ppppbppp/2n2n2/4P3/2B5/1QP2N2/P4PPP/RNB1K2R b KQkq - 2 8",
    best: "d7d5",
  },
  {
    fen: "r1bq3r/ppp2kpp/5b2/Q2p4/8/2P2N2/P4PPP/RNB2RK1 b - - 1 13",
    best: "b7b6",
  },
];
describe("forcing pawn attacks from the October 29 Scotch game", () => {
  for (const {fen,best} of cases) {
    it("includes " + best + " as a first-layer tactical move", () => {
      const b=Board.fromFEN(fen);
      const move=legal(b,best);
      expect(b.createsPawnPieceThreat(move)).toBe(true);
      expect(b.legalTactics(true,true).moves.map(m=>m.uci())).toContain(best);
      expect(b.legalTactics(true).moves.map(m=>m.uci())).not.toContain(best);
      b.legalMoves();
      expect(b.legalTactics(true,true).moves.map(m=>m.uci())).toContain(best);
    });
  }
  it("does not invent a threat for a pawn push into an empty diagonal",()=>{
    const b=Board.start();
    expect(b.createsPawnPieceThreat(legal(b,"d2d4"))).toBe(false);
    expect(b.legalTactics(true,true).moves.map(m=>m.uci())).not.toContain("d2d4");
  });
  it("gives tactical order priority to a noncapturing pawn piece attack",()=>{
    const b=Board.fromFEN(cases[1].fen);
    const engine=new SwiftEngine() as unknown as {
      moveScore(board: Board, move: Move, hash?: Move, ply?: number): number;
    };
    const attack=engine.moveScore(b,legal(b,"d7d5"));
    const quiet=engine.moveScore(b,legal(b,"a7a6"));
    expect(attack).toBeGreaterThan(quiet+100_000);
  });
});
