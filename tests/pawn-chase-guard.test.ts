import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";
import { invitesPinnedPawnChase } from "../src/chess/pawn-chase";
import { immediateMaterialLoss } from "../src/chess/blunder-guard";
import { replayAgusbmwGame } from "./fixtures/agusbmw";

function legal(board: Board, uci: string) {
  const move = board.legalMoves().find((m) => m.uci() === uci);
  if (!move) throw Error("Move " + uci + " not legal in " + board.toFEN());
  return move;
}
type RootScore = {
  moveScore(board: Board, move: ReturnType<Board["legalMoves"]>[number], hash?: never, ply?: number): number;
};

describe("Human-like foresight: a knight pinned to the queen can be pawn-chased", () => {
  const game = replayAgusbmwGame();
  const before = game.positions[20];

  it("recognizes precisely the ...c6 pinned knight trap that made 11.Nb5 bad", () => {
    const blunder = legal(before, "c3b5");
    expect(invitesPinnedPawnChase(before, blunder)).toBe(true);
    expect(invitesPinnedPawnChase(before, legal(before, "d3d1"))).toBe(false);
    const engine = new SwiftEngine() as unknown as RootScore;
    expect(engine.moveScore(before, blunder, undefined, 0))
      .toBeLessThan(engine.moveScore(before, legal(before, "d3d1"), undefined, 0));
    // In a non-root search, this optional planning heuristic must cost ZERO.
    expect(engine.moveScore(before, blunder, undefined, 2))
      .toBeGreaterThan(engine.moveScore(before, blunder, undefined, 0));
  });

  it("probes whether any legal reply to ...c6 avoids immediate material loss", () => {
    const child = before.makeMove(legal(before, "c3b5"));
    const pushed = child.makeMove(legal(child, "c7c6"));
    const replies = pushed.legalMoves().map((reply) => ({
      uci: reply.uci(), loss: immediateMaterialLoss(pushed, reply),
    })).sort((a, b) => a.loss - b.loss);
    console.log("AGUSBMW_PINNED_PAWN_CHASE_REPLIES " + JSON.stringify(replies.slice(0, 16)));
    expect(replies).not.toHaveLength(0);
  });

  it("does not invent a pawn chase if the pinning bishop is absent", () => {
    const noBishop = Board.fromFEN(before.toFEN().replace("bp2p3", "1p2p3"));
    expect(invitesPinnedPawnChase(noBishop, legal(noBishop, "c3b5"))).toBe(false);
  });

  it("does not invent a pawn chase if c6 is blocked", () => {
    const blocked = Board.fromFEN(before.toFEN().replace("bp2p3", "bpn1p3"));
    expect(invitesPinnedPawnChase(blocked, legal(blocked, "c3b5"))).toBe(false);
  });

  it("preserves development in ordinary openings and sound tactical queen captures", () => {
    const opening = Board.start();
    expect(invitesPinnedPawnChase(opening, legal(opening, "b1c3"))).toBe(false);
    const queenCompensation = game.positions[46];
    expect(invitesPinnedPawnChase(queenCompensation, legal(queenCompensation, "a4b4"))).toBe(false);
  });

  it("still searches ALL legal moves and does not reinterpret a forced sacrifice", () => {
    const oldSacrifice = game.positions[46];
    const result = new SwiftEngine().search(oldSacrifice, { depth: 4 });
    expect(result.depth).toBe(4);
    expect(result.move?.uci()).toBe("a4b4");
  }, 30_000);
});
