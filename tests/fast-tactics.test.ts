import { describe, expect, it } from "vitest";
import { Board, SwiftEngine, findTacticalPriority, isOwnQueenUnderAttack } from "../src";

describe("Swift tactical priorities", () => {
  it("takes an immediate mate before human-style selection", () => {
    const board = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    const result = findTacticalPriority(board, new SwiftEngine());

    expect(result?.kind).toBe("mate");
    expect(result?.move.uci()).toBe("g3b8");
  });

  it("finds a forced mate in two", () => {
    const board = Board.fromFEN("kr6/1r1N4/2Q5/8/8/8/8/K7 w - - 0 1");
    const result = findTacticalPriority(board, new SwiftEngine());

    expect(result?.kind).toBe("mate");
    expect(result?.move.uci()).toBe("d7c5");
  });

  it("recognizes a queen grab as a forcing material priority", () => {
    const board = Board.fromFEN("4q1k1/8/8/8/8/8/8/Q3R1K1 w - - 0 1");
    const result = findTacticalPriority(board, new SwiftEngine());

    expect(result?.kind).toBe("queen");
    expect(result?.move.uci()).toBe("e1e8");
  });

  it("does not auto-grab the enemy queen when our queen is attacked", () => {
    const board = Board.fromFEN("3r2k1/4q3/8/8/8/8/3Q4/4R1K1 w - - 0 1");

    expect(isOwnQueenUnderAttack(board)).toBe(true);
    expect(findTacticalPriority(board, new SwiftEngine())?.kind).not.toBe("queen");
  });
});
