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
    expect(Game.fromFEN("8/8/8/8/8/8/2b1k3/2B1K3 w - - 0 1").isInsufficientMaterial()).toBe(true);
  });

  it("does not call a bishop-versus-bishop position dead when bishops occupy opposite colors", () => {
    expect(Game.fromFEN("8/8/8/8/8/8/3bk3/2B1K3 w - - 0 1").isInsufficientMaterial()).toBe(false);
  });

  it("tracks a repeated position using side, castling and en-passant state", () => {
    const game = Game.start();
    for (const uci of ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]) {
      game.playUci(uci);
    }
    expect(game.repetitionCount()).toBe(3);
    expect(game.isThreefoldRepetition()).toBe(true);
    expect(game.result()).toBe("threefold");
  });

  it("rejects an illegal UCI move", () => {
    const game = new Game(Board.start());
    expect(() => game.playUci("e2e5")).toThrow("Illegal UCI move");
  });
});
