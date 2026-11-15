import { describe, expect, it } from "vitest";
import { Board, START_FEN } from "../src/chess/board";
import { buildPlayedMoveReview } from "../src/chess/coach";
import { Game } from "../src/chess/game";

describe("Played-move Coach review", () => {
  it("retrieves the exact immutable board before a historical ply, including after undo", () => {
    const game = Game.start();
    game.playUci("e2e4");
    game.playUci("e7e5");
    expect(game.boardBeforePly(0)?.toFEN()).toBe(START_FEN);
    expect(game.boardBeforePly(1)?.toFEN()).toBe(Board.start().makeMove(
      Board.start().legalMoves().find((move) => move.uci() === "e2e4")!,
    ).toFEN());
    expect(game.boardBeforePly(2)).toBeNull();
    game.undo();
    expect(game.boardBeforePly(1)).toBeNull();
    expect(game.boardBeforePly(0)?.toFEN()).toBe(START_FEN);
    expect(game.boardBeforePly(-1)).toBeNull();
  });

  it("proves that 2. g4 permits the immediate Fool's Mate", () => {
    const before = Board.fromFEN("rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2");
    const review = buildPlayedMoveReview(before, "g2g4");
    expect(review?.verdict).toBe("mate-in-one");
    expect(review?.headline).toMatch(/blunder/i);
    expect(review?.line).toEqual(["g2g4", "d8h4"]);
    expect(review?.forced).toBe(true);
    expect(before.makeMove(before.legalMoves().find((move) => move.uci() === "g2g4")!)
      .makeMove(before.makeMove(before.legalMoves().find((move) => move.uci() === "g2g4")!)
        .legalMoves().find((move) => move.uci() === "d8h4")!).isCheckmate()).toBe(true);
  });

  it("recognizes the Scholar's Mate trap caused by 3...Nf6", () => {
    const before = Board.fromFEN("r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3");
    const review = buildPlayedMoveReview(before, "g8f6");
    expect(review?.verdict).toBe("mate-in-one");
    expect(review?.line).toEqual(["g8f6", "h5f7"]);
  });

  it("describes a queen capture as a possibility, not proven net material loss", () => {
    const before = Board.fromFEN("4k2r/8/8/8/8/8/8/3QK3 w - - 0 1");
    const review = buildPlayedMoveReview(before, "d1h5");
    expect(review?.verdict).toBe("queen-capture");
    expect(review?.line).toEqual(["d1h5", "h8h5"]);
    expect(review?.forced).toBe(false);
    expect(review?.explanation).toMatch(/not prove/i);
  });

  it("only produces score-based losses from completed aligned searches", () => {
    const before = Board.start();
    const evidence = {
      bestMove: "d2d4", bestLine: ["d2d4", "d7d5"],
      bestScore: 200, rootDepth: 4,
      replyLine: ["e7e5"], replyScore: 150, childDepth: 3,
    };
    const supported = buildPlayedMoveReview(before, "e2e4", evidence);
    expect(supported?.verdict).toBe("large-drop");
    expect(supported?.centipawnDrop).toBe(350);
    expect(supported?.suggestedMove).toBe("d2d4");
    expect(supported?.suggestedLine).toEqual(["d2d4", "d7d5"]);
    expect(supported?.forced).toBe(false);

    const incomplete = buildPlayedMoveReview(before, "e2e4", { ...evidence, childDepth: 2 });
    expect(incomplete?.verdict).toBe("unverified");
    expect(incomplete?.centipawnDrop).toBeUndefined();
  });

  it("does not mark its own searched move as a loss because of probe disagreement", () => {
    const evidence = {
      bestMove: "e2e4", bestLine: ["e2e4", "e7e5"],
      bestScore: 45, rootDepth: 4,
      replyLine: ["e7e5"], replyScore: 110, childDepth: 3,
    };
    const review = buildPlayedMoveReview(Board.start(), "e2e4", evidence);
    expect(review?.verdict).toBe("close");
    expect(review?.centipawnDrop).toBe(0);
  });

  it("never reviews an illegal played move", () => {
    expect(buildPlayedMoveReview(Board.start(), "a1a8")).toBeNull();
  });
});
