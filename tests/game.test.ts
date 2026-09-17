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

  it("rejects an illegal UCI move", () => {
    const game = new Game(Board.start());
    expect(() => game.playUci("e2e5")).toThrow("Illegal UCI move");
  });
});
