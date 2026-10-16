import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, Move, SwiftEngine } from "../src";
import { allowsMateInOne, avoidImmediateCheckmate } from "../src/chess/blunder-guard";
import type { SearchOptions, SearchResult } from "../src/chess/engine";

const threatened = Board.fromFEN("1k4r1/8/8/6q1/8/8/5PPP/R6K w - - 0 1");
const find = (board: Board, uci: string) => {
  const move = board.legalMoves().find((m) => m.uci() === uci);
  expect(move, `${uci} should be legal`).toBeDefined();
  return move!;
};

describe("next-move checkmate safety", () => {
  it("finds a queen-and-rook mating threat without any immediately lost material", () => {
    const careless = find(threatened, "a1a2");
    const after = threatened.makeMove(careless);
    expect(after.legalMoves().some((move) => move.uci() === "g5g2")).toBe(true);
    expect(after.makeMove(find(after, "g5g2")).isCheckmate()).toBe(true);
    expect(allowsMateInOne(threatened, careless)).toBe(true);
    expect(allowsMateInOne(threatened, find(threatened, "g2g3"))).toBe(false);
  });

  it("replaces the avoidable blunder while keeping legal human alternatives", () => {
    const proposed = find(threatened, "a1a2");
    const correction = avoidImmediateCheckmate(threatened, proposed, [
      find(threatened, "g2g3"),
    ]);
    expect(correction?.move.uci()).toBe("g2g3");
    expect(correction?.previousMove.uci()).toBe("a1a2");
    expect(allowsMateInOne(threatened, correction!.move)).toBe(false);
  });

  it("does not change a safe move or veto Swift's own immediate mate", () => {
    expect(avoidImmediateCheckmate(threatened, find(threatened, "g2g3"))).toBeNull();
    const mate = Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1");
    expect(avoidImmediateCheckmate(mate, find(mate, "g3b8"))).toBeNull();
  });

  it("vetoes an interrupted engine fallback even with no material-loss trigger", () => {
    class UncertainPrincipal extends SwiftEngine {
      override search(board: Board, _options: SearchOptions = {}): SearchResult {
        const badMove: Move = find(board, "a1a2");
        return { move: badMove, depth: 2, score: -100, nodes: 100, pv: [badMove] };
      }
    }
    const answer = new HumanSwiftEngine(new UncertainPrincipal()).search(threatened, {
      depth: 2,
      adaptiveThinking: false,
      strictBestPlay: true,
      tacticalSearchDepth: 0,
      randomness: 0,
      errorBudget: 0,
    });
    expect(answer.move?.uci()).not.toBe("a1a2");
    expect(allowsMateInOne(threatened, answer.move!)).toBe(false);
    expect(answer.decision?.reasons[0]).toContain("mate in one");
  });
});
