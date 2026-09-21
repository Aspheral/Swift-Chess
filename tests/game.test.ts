import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";
import { Game } from "../src/chess/game";

describe("Swift game state and draw rules", () => {
  it("tracks the fifty-move counter from FEN", () => {
    const game = Game.fromFEN("8/8/8/8/8/8/4k3/4K2R w - - 100 51");
    expect(game.isFiftyMoveDraw()).toBe(true);
    expect(game.result()).toBe("fifty-move");
  });

  it("recognizes bare-king and minor-piece dead positions", () => {
    expect(Game.fromFEN("8/8/8/8/8/8/4k3/4K3 w - - 0 1").isInsufficientMaterial()).toBe(true);
    expect(Game.fromFEN("8/8/8/8/8/8/4k3/2B1K3 w - - 0 1").isInsufficientMaterial()).toBe(true);
    expect(Game.fromFEN("8/8/8/8/8/8/4k3/2N1K3 w - - 0 1").isInsufficientMaterial()).toBe(true);
    expect(Game.fromFEN("8/8/8/2b5/8/8/4k3/2B1K3 w - - 0 1").isInsufficientMaterial()).toBe(true);
  });

  it("does not call a bishop-versus-bishop position dead when bishops occupy opposite colors", () => {
    expect(Game.fromFEN("8/8/8/3b4/8/8/4k3/2B1K3 w - - 0 1").isInsufficientMaterial()).toBe(false);
  });

  it("tracks a repeated position using side, castling and legal en-passant state", () => {
    const game = Game.start();
    for (const uci of ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]) {
      game.playUci(uci);
    }
    expect(game.repetitionCount()).toBe(3);
    expect(game.isThreefoldRepetition()).toBe(true);
    expect(game.result()).toBe("threefold");
  });

  it("does not treat an unusable en-passant target as a different position", () => {
    const withoutEp = Board.fromFEN("8/8/8/8/4P3/8/8/4K2k b - - 0 1");
    const withEp = Board.fromFEN("8/8/8/8/4P3/8/8/4K2k b - e3 0 1");
    expect(Game.positionKey(withEp)).toBe(Game.positionKey(withoutEp));
  });

  it("keeps a legal en-passant opportunity in the repetition identity", () => {
    const withoutEp = Board.fromFEN("8/8/8/3pP3/8/8/8/4K2k w - - 0 2");
    const withEp = Board.fromFEN("8/8/8/3pP3/8/8/8/4K2k w - d6 0 2");
    expect(Game.positionKey(withEp)).not.toBe(Game.positionKey(withoutEp));
  });


  it("undo restores board, history, and repetition tracking", () => {
    const game = Game.start();
    const startFen = game.fen();

    game.playUci("g1f3");
    game.playUci("g8f6");
    game.playUci("f3g1");
    const beforeUndoKeys = game.positionHistoryKeys();

    expect(game.canUndo()).toBe(true);
    expect(game.undo()).not.toBeNull();
    expect(game.moveHistory()).toEqual(["g1f3", "g8f6"]);
    expect(game.positionHistoryKeys()).toEqual(beforeUndoKeys.slice(0, -1));
    expect(game.fen()).toBe(Board.start().makeMove(Board.start().legalMoves().find((move) => move.uci() === "g1f3")!).makeMove(
      Board.start().makeMove(Board.start().legalMoves().find((move) => move.uci() === "g1f3")!).legalMoves().find((move) => move.uci() === "g8f6")!,
    ).toFEN());

    game.undo();
    game.undo();
    expect(game.fen()).toBe(startFen);
    expect(game.moveHistory()).toEqual([]);
    expect(game.positionHistoryKeys()).toHaveLength(1);
    expect(game.canUndo()).toBe(false);
    expect(game.undo()).toBeNull();
  });

  it("undo restores castling and en-passant state exactly", () => {
    const game = Game.start();
    game.playUci("e2e4");
    const afterE4 = game.fen();
    game.playUci("a7a6");
    game.playUci("e1e2");

    game.undo();
    game.undo();
    expect(game.fen()).toBe(afterE4);
    expect(game.fen().split(/\s+/)[2]).toContain("K");
    expect(game.fen().split(/\s+/)[3]).toBe("e3");
  });

  it("rejects an illegal UCI move", () => {
    const game = new Game(Board.start());
    expect(() => game.playUci("e2e5")).toThrow("Illegal UCI move");
  });
});
