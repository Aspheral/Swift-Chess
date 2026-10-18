import { describe, expect, it } from "vitest";
import { Game, HumanSwiftEngine, SwiftEngine, swiftPlayProfile } from "../src";

const openingScotch = [
  "e2e4","e7e5","g1f3","b8c6","d2d4","e5d4","c2c3",
  "d4c3","b1c3","g8f6","f1c4","f8b4","e1g1","b4c3","f3g5",
];
const afterBd4 = [...openingScotch,"c3d4","g5f7"];

const quietQgd = [
  "d2d4","d7d5","c2c4","e7e6","b1c3","g8f6","g1f3",
  "f8b4","c1g5","b4c3","b2c3","e8g8","d1c2","b8c6",
  "a1b1","h7h6","g5h4","d5c4","g2g4","g7g5","f3g5","h6g5","h4g5",
];

function inspect(uciMoves: string[], label: string) {
  const game = Game.start();
  for (const uci of uciMoves) game.playUci(uci);
  const board = game.board();
  const options = swiftPlayProfile(board,game.moveHistory()).options;
  const human = new HumanSwiftEngine();
  const result = human.search(board, {
    ...options, moveHistory:game.moveHistory(),
    positionHistoryKeys:game.positionHistoryKeys(),randomness:0,
  });
  const strict = new SwiftEngine().search(board,{
    depth: 8, timeMs:2500, positionHistoryKeys:game.positionHistoryKeys(),
  });
  console.log(JSON.stringify({
    label, fen:game.fen(), actualSide:game.turn(),
    profile:swiftPlayProfile(board,game.moveHistory()).kind,
    humanMove:result.move?.uci(), source:result.decision?.source,
    rootMove:result.decision?.engineMove,
    reasons:result.decision?.reasons.slice(0,3),
    searchDepth:result.depth,rootScore:result.score,
    strictMove:strict.move?.uci(),strictDepth:strict.depth,strictScore:strict.score,
  }));
  expect(result.move).not.toBeNull();
  return result;
}

describe("2050 loss-audit historical positions (diagnostic)",()=>{
  it("examines the Scotch 8...Bd4 early tactical error",()=>{
    const r=inspect(openingScotch,"Scotch move 8 Black");
    expect(r.move).not.toBeNull();
  },30_000);
  it("examines the Scotch 9...Bxf2+ attack",()=>{
    const r=inspect(afterBd4,"Scotch move 9 Black");
    expect(r.move).not.toBeNull();
  },30_000);
  it("examines QGD 12...Qe7 moderate-error accumulation",()=>{
    const r=inspect(quietQgd,"QGD move 12 Black");
    expect(r.move).not.toBeNull();
  },30_000);
});
