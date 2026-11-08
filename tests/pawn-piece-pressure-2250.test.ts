import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

type Inspector = {
  attackedByEnemyPawn(board: Board, square: number, by: "w"|"b"): boolean;
};
const engine = new SwiftEngine() as unknown as Inspector;
function square(s: string) {
  return "abcdefgh".indexOf(s[0]) + 8 * (Number(s[1])-1);
}
describe("pawn attacks on valuable pieces",()=>{
  it("detects a central black pawn attacking a bishop on c4",()=>{
    const b=Board.fromFEN("4k3/8/8/3p4/2B5/8/8/4K3 w - - 0 1");
    expect(engine.attackedByEnemyPawn(b,square("c4"),"b")).toBe(true);
    expect(engine.attackedByEnemyPawn(b,square("c4"),"w")).toBe(false);
  });
  it("detects ...b6 attacking a queen on a5",()=>{
    const b=Board.fromFEN("4k3/8/1p6/Q7/8/8/8/4K3 w - - 0 1");
    expect(engine.attackedByEnemyPawn(b,square("a5"),"b")).toBe(true);
  });
  it("does not treat a same-file or wrapped pawn as a diagonal attack",()=>{
    const b=Board.fromFEN("4k3/8/8/7p/7Q/8/8/4K3 w - - 0 1");
    expect(engine.attackedByEnemyPawn(b,square("h4"),"b")).toBe(false);
  });
  it("applies the same diagonal pawn geometry to White",()=>{
    const b=Board.fromFEN("4k3/8/8/2q5/3P4/8/8/4K3 b - - 0 1");
    expect(engine.attackedByEnemyPawn(b,square("c5"),"w")).toBe(true);
  });
});
