import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

interface KingEvaluationInspector {
  kingSafetyFromSquare(
    board: Board, square: number, color: "w" | "b",
    castling: string, pieces: number, queens: boolean,
  ): number;
}
const board = Board.fromFEN(
  "r5kr/p1B3pp/1p2Rb2/2p5/6P1/5N2/P1N2P1P/6K1 b - - 0 26",
);
const inspect = new SwiftEngine() as unknown as KingEvaluationInspector;
const relativeKingScore = (square: string, color: "w" | "b", pieces: number, queens: boolean) => {
  const score = inspect.kingSafetyFromSquare(
    board, Board.squareIndex(square), color, board.castlingRights(), pieces, queens,
  );
  return color === "w" ? score : -score;
};
describe("queenless king activation after the October 29 Chess.com game",()=>{
  it("does not pay an artificial castling bonus after queens are exchanged",()=>{
    const g8 = relativeKingScore("g8", "b", 18, false);
    const f7 = relativeKingScore("f7", "b", 18, false);
    expect(f7).toBeGreaterThan(g8);
  });
  it("retains genuine middlegame castled-king shelter when queens remain",()=>{
    const g8=relativeKingScore("g8","b",26,true);
    const f7=relativeKingScore("f7","b",26,true);
    expect(g8).toBeGreaterThan(f7);
  });
  it("also rewards White king activation after queens are exchanged",()=>{
    expect(relativeKingScore("f2","w",12,false))
      .toBeGreaterThan(relativeKingScore("g1","w",12,false));
  });
});
