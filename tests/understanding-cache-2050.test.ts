import { afterEach, describe, expect, it, vi } from "vitest";
import { Board, Move, humanErrorProfile, understandPosition, swiftPlayProfile } from "../src";

afterEach(() => vi.restoreAllMocks());

describe("shared immutable-position understanding", () => {
  it("generates each side's legal move set only once per board", () => {
    const board = Board.start();
    const spy = vi.spyOn(Board.prototype, "legalMoves");
    const first = understandPosition(board);
    expect(spy).toHaveBeenCalledTimes(2);
    const second = understandPosition(board);
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(first.space).toMatchObject({ w: 20, b: 20 });
  });

  it("reuses game facts across repeated human profiling", () => {
    const board = Board.start();
    const spy = vi.spyOn(Board.prototype, "legalMoves");
    humanErrorProfile(board, 0.025);
    const calls = spy.mock.calls.length;
    humanErrorProfile(board, 0.025);
    expect(spy.mock.calls.length).toBe(calls);
    expect(calls).toBe(2);
  });

  it("does not leak a position's cached understanding into a new board", () => {
    const board = Board.start();
    const original = understandPosition(board);
    const next = board.makeMove(new Move(12, 28)); // e2e4
    const after = understandPosition(next);
    expect(after).not.toBe(original);
    expect(after.sideToMove).toBe("b");
    expect(understandPosition(board)).toBe(original);
    expect(understandPosition(next)).toBe(after);
  });

  it("leaves opening decisions and attacker evidence consistent after caching", () => {
    const board = Board.start();
    expect(swiftPlayProfile(board, []).kind).toBe("opening");
    expect(understandPosition(board).tactics.incomingChecks).toBe(0);
    expect(swiftPlayProfile(board, []).kind).toBe("opening");
  });
});
