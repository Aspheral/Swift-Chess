import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import type { Move } from "../src/chess/board";
function move(board: Board, uci: string): Move {
  const found=board.legalMoves().find(m=>m.uci()===uci);
  if(!found)throw Error("Not legal: "+uci);
  return found;
}
function isCritical(board: Board, m: Move): boolean {
  const engine = new SwiftEngine() as unknown as {
    isCriticalQuietMove(board: Board, move: Move, child: Board): boolean;
  };
  return engine.isCriticalQuietMove(board,m,board.makeMove(m));
}
describe("unreduced critical quiet searches",()=>{
  it("preserves central pawn defense, not routine knight attacks",()=>{
    const b=Board.fromFEN("r1bqk2r/ppppbppp/2n2n2/4P3/2B5/1QP2N2/P4PPP/RNB1K2R b KQkq - 2 8");
    expect(isCritical(b,move(b,"d7d5"))).toBe(true);
    expect(isCritical(b,move(b,"c6a5"))).toBe(false);
  });
  it("preserves king activation rather than flank pawn pushing",()=>{
    const b=Board.fromFEN("r5kr/p1B3pp/1p2Rb2/2p5/6P1/5N2/P1N2P1P/6K1 b - - 0 26");
    expect(isCritical(b,move(b,"g8f7"))).toBe(true);
    expect(isCritical(b,move(b,"c5c4"))).toBe(false);
  });
  it("recognizes the quiet queen attack against the knight on a5",()=>{
    const b=Board.fromFEN("r1bqk2r/ppppbppp/2n2n2/4P3/2B5/1QP2N2/P4PPP/RNB1K2R b KQkq - 2 8");
    const a=b.makeMove(move(b,"c6a5"));
    const c=a.makeMove(move(a,"c4f7"));
    const d=c.makeMove(move(c,"e8f8"));
    expect(d.isSquareAttacked("a5","w")).toBe(false);
    const qa4=move(d,"b3a4");
    expect(d.makeMove(qa4).isSquareAttacked("a5","w")).toBe(true);
    expect(isCritical(d,qa4)).toBe(true);
  });
});
