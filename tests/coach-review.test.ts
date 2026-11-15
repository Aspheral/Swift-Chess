import { describe, expect, it } from "vitest";
import { Board, START_FEN } from "../src/chess/board";
import { buildPlayedMoveReview } from "../src/chess/coach";
import { queenExchangeContext } from "../src/chess/coach-exchanges";
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

  it("verifies all defenses to a checking mate in two from a documented engine position", () => {
    const before = Board.fromFEN("5r1k/p5pp/8/3Q2N1/2B5/8/8/K7 b - - 0 1");
    const review = buildPlayedMoveReview(before, "a7a6");
    expect(review?.verdict).toBe("mate-in-two");
    expect(review?.forced).toBe(true);
    expect(review?.line[0]).toBe("a7a6");
    let board = before;
    for (const uci of review?.line ?? []) {
      const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
      expect(move).toBeDefined();
      board = board.makeMove(move!);
    }
    expect(board.isCheckmate()).toBe(true);
  });


  it("recognizes the screenshot's queen trade after 15. O-O, including the pawn recapture", () => {
    // User screenshot before 15. O-O: white Qe5/Pd4, black Qd5. After
    // ...Qxe5, dxe5 is legal, so White has not simply hung the queen.
    const before = Board.fromFEN(
      "r1b2b1r/p4kpp/2p5/1p1qQ1B1/3P4/8/PPP2PPP/R3K2R w KQ - 0 15",
    );
    expect(before.legalMoves().some((m) => m.uci() === "e1g1")).toBe(true);
    const after = before.makeMove(before.legalMoves().find((m) => m.uci() === "e1g1")!);
    const exchange = queenExchangeContext(after, "w");
    expect(exchange?.kind).toBe("queen-trade");
    expect(exchange?.localGainCp).toBeLessThan(250);
    expect(exchange?.line).toEqual(["d5e5", "d4e5"]);
    const report = buildPlayedMoveReview(before, "e1g1");
    expect(report?.verdict).toBe("queen-trade");
    expect(report?.headline).toMatch(/queen trade/i);
    expect(report?.explanation).toMatch(/both queens leave the board/i);
    expect(report?.explanation).not.toMatch(/blunder|free queen|queen can be captured/i);
    expect(report?.line).toEqual(["e1g1", "d5e5", "d4e5"]);
    expect(report?.forced).toBe(false);
  });

  it("does not let an unbalanced rook-for-queen recapture masquerade as an equal queen trade", () => {
    const board = Board.fromFEN("4k2r/8/8/7Q/6P1/8/8/4K3 b - - 0 1");
    const exchange = queenExchangeContext(board, "w");
    expect(exchange?.capture).toBe("h8h5");
    expect(exchange?.recapture).toBe("g4h5");
    expect(exchange?.kind).toBe("queen-risk");
    expect(exchange?.localGainCp).toBeGreaterThan(200);
  });

  it("describes a genuinely hanging queen without pretending compensation was ruled out", () => {
    const before = Board.fromFEN("4k2r/8/8/8/8/8/8/3QK3 w - - 0 1");
    const review = buildPlayedMoveReview(before, "d1h5");
    expect(review?.verdict).toBe("queen-capture");
    expect(review?.line).toEqual(["d1h5", "h8h5"]);
    expect(review?.forced).toBe(false);
    expect(review?.explanation).toMatch(/no immediate legal recapture/i);
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
