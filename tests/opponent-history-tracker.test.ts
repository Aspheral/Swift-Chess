import { afterEach, describe, expect, it, vi } from "vitest";
import { Board, Game } from "../src";
import { OpponentHistoryTracker } from "../src/chess/mind";

type Side = "w" | "b";
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Original replay-from-start implementation, kept only as a test oracle. */
function referenceModel(history: string[], swiftSide: Side) {
  const recentStart = Math.max(0, history.length - 12);
  let board = Board.start(), captures = 0, checks = 0, pawnMoves = 0, observedMoves = 0;
  for (let index = 0; index < history.length; index++) {
    const uci = history[index];
    const move = board.legalMoves().find((entry) => entry.uci() === uci);
    if (!move) break;
    const mover = board.turn();
    const movingPiece = board.pieceAt(move.from);
    const capture = move.enPassant || board.pieceAt(move.to) !== null;
    const child = board.makeMove(move);
    if (index >= recentStart && mover !== swiftSide) {
      observedMoves++;
      if (capture) captures++;
      if (movingPiece?.[1] === "p") pawnMoves++;
      if (child.isInCheck(swiftSide)) checks++;
    }
    board = child;
  }
  return observedMoves
    ? {
      aggression: clamp((captures * 0.55 + checks * 0.9) / observedMoves),
      exchangeSeeking: clamp(captures / observedMoves),
      pawnActivity: clamp(pawnMoves / observedMoves),
      observedMoves,
    }
    : { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 };
}

const pilotMoves = [
  "g1f3","d7d5","c2c4","e7e6","c4d5","e6d5","b1c3","g8f6",
  "d1a4","c8d7","a4b3","a7a6","c3d5","b8c6","d5f6","g7f6",
  "b3b7","f8b4","a2a3","a8a7","b7b4","c6b4","a3b4","a7b7",
  "a1a6","b7b6","a6b6","c7b6","d2d4","d8a8","e2e3","h8g8",
  "h2h4","a8a2","h4h5","e8f8","f1d3","g8g2","d3h7","a2c4",
  "c1d2","d7b5","e1d1","g2f2","h1h3","c4f1","d1c2","f1h3",
  "h7e4","b5a4","c2b1","f2f3","e4f3","h3h2","d2c3","h2c2",
  "b1a1","a4b3","c3d2","c2d3","d2e1","d3a6","a1b1","a6a2",
  "b1c1","a2a1","c1d2","a1b2","d2d3","b2c2",
];

afterEach(() => vi.restoreAllMocks());

describe("incremental opponent-model history", () => {
  it("matches old opponent metrics after every ply in a real 2050 match", () => {
    const game = Game.start();
    const tracker = new OpponentHistoryTracker();
    expect(tracker.observe([], "w")).toEqual(referenceModel([], "w"));
    for (const uci of pilotMoves) {
      game.playUci(uci);
      const moves = game.moveHistory();
      for (const side of ["w", "b"] as const) {
        expect(tracker.observe(moves, side), `history length ${moves.length}, side ${side}`)
          .toEqual(referenceModel(moves, side));
      }
    }
  });

  it("does no legal move generation for unchanged history and only new plies for append", () => {
    const tracker = new OpponentHistoryTracker();
    tracker.observe(pilotMoves.slice(0, 26), "w");
    const spy = vi.spyOn(Board.prototype, "legalMoves");
    const unchanged = tracker.observe(pilotMoves.slice(0, 26), "w");
    expect(unchanged).toEqual(referenceModel(pilotMoves.slice(0, 26), "w"));
    // The oracle above replays moves; only test the cache after the oracle.
    spy.mockClear();
    tracker.observe(pilotMoves.slice(0, 26), "b");
    expect(spy).not.toHaveBeenCalled();
    tracker.observe(pilotMoves.slice(0, 28), "w");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("replays correctly after undo, alternative continuation, and a new game", () => {
    const tracker = new OpponentHistoryTracker();
    const original = pilotMoves.slice(0, 24);
    tracker.observe(original, "w");
    const undone = original.slice(0, 16);
    expect(tracker.observe(undone, "b")).toEqual(referenceModel(undone, "b"));
    const variation = [...undone, "b3a4"];
    // The variation is not a legal follow-up here. A new real game has priority.
    expect(tracker.observe(variation, "w")).toEqual(referenceModel(variation, "w"));
    const newGame = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"];
    expect(tracker.observe(newGame, "w")).toEqual(referenceModel(newGame, "w"));
    expect(tracker.observe([], "w")).toEqual(referenceModel([], "w"));
  });

  it("resets explicitly with no change in resulting opponent metrics", () => {
    const tracker = new OpponentHistoryTracker();
    const history = pilotMoves.slice(0, 38);
    expect(tracker.observe(history, "w")).toEqual(referenceModel(history, "w"));
    tracker.reset();
    expect(tracker.observe(history, "w")).toEqual(referenceModel(history, "w"));
  });
});
