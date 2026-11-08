import { describe, expect, it } from "vitest";
import { Board, humanErrorProfile, swiftPlayProfile } from "../src";

describe("material-aware human game phases", () => {
  it("recognizes an ordinary full-material opening", () => {
    const p = humanErrorProfile(Board.start(), 0.025);
    expect(p.phase).toBe(0);
    expect(p.gameStage).toBe("opening");
    expect(swiftPlayProfile(Board.start(), []).kind).toBe("opening");
  });

  it("recognizes an early queen trade as a middlegame, not a full opening", () => {
    // 30 pieces remain. The old piece-count formula incorrectly returned 0.
    const board = Board.fromFEN("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
    const profile = humanErrorProfile(board, 0.025);
    expect(profile.phase).toBeCloseTo(8 / 24);
    expect(profile.gameStage).toBe("middlegame");
    expect(swiftPlayProfile(board, Array(8).fill("fixture")).kind).not.toBe("opening");
  });

  it("recognizes a minor-and-heavy-piece simplification as an endgame with many pawns", () => {
    const board = Board.fromFEN("4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1");
    const profile = humanErrorProfile(board, 0.025);
    expect(profile.phase).toBe(1);
    expect(profile.gameStage).toBe("endgame");
  });

  it("does not confuse pawn count with major/minor material", () => {
    const normal = Board.start();
    const pawnless = Board.fromFEN("rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w KQkq - 0 1");
    expect(humanErrorProfile(pawnless).phase).toBe(humanErrorProfile(normal).phase);
  });

  it("moves game phases progressively as expensive pieces leave the board", () => {
    const withAllPieces = Board.start();
    const queensGone = Board.fromFEN("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
    const queensAndRooksGone = Board.fromFEN("1nb1kbn1/pppppppp/8/8/8/8/PPPPPPPP/1NB1KBN1 w - - 0 1");
    const p = [withAllPieces, queensGone, queensAndRooksGone].map(b => humanErrorProfile(b));
    expect(p[0].phase).toBeLessThan(p[1].phase);
    expect(p[1].phase).toBeLessThan(p[2].phase);
    expect(p[2].gameStage).toBe("middlegame");
  });
});
