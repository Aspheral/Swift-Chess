import { describe, expect, it } from "vitest";
import { Board } from "../src/chess/board";
import { buildCoachReport, verifyCoachLine } from "../src/chess/coach";

describe("Coach Mode", () => {
  it("replays only legal, alternating moves and stops before an invented tactic", () => {
    const board = Board.start();
    expect(verifyCoachLine(board, ["e2e4", "e7e5", "a1a8", "g1f3"])).toEqual(["e2e4", "e7e5"]);
    const report = buildCoachReport(board, {
      move: "e2e4",
      pv: ["e2e4", "e7e5", "a1a8"],
    });
    expect(report.verifiedLine).toEqual(["e2e4", "e7e5"]);
    expect(report.explanation).not.toMatch(/forced (win|mate)/i);
  });

  it("only calls checkmate when the legal move really mates", () => {
    const board = Board.fromFEN("7k/6pp/8/8/8/8/5QPP/6K1 w - - 0 1");
    const report = buildCoachReport(board, { move: "f2f8" });
    expect(report.headline).toContain("checkmate");
    expect(report.verifiedLine).toEqual(["f2f8"]);
    expect(board.makeMove(board.legalMoves().find((move) => move.uci() === "f2f8")!).isCheckmate()).toBe(true);
  });

  it("finds Fool's Mate as a verified refutation of a candidate", () => {
    // After 1. f3 e5, 2. g4?? allows 2... Qh4#.
    const board = Board.fromFEN("rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2");
    const report = buildCoachReport(board, {
      move: "e2e4",
      suggestions: ["e2e4", "g2g4"],
    });
    const alternative = report.alternatives.find((item) => item.move === "g2g4");
    expect(alternative?.kind).toBe("mate-threat");
    expect(alternative?.line).toEqual(["g2g4", "d8h4"]);
    expect(alternative?.explanation).toMatch(/checkmate/i);
  });


  it("explains a queen-trade alternative without calling the queen lost", () => {
    const board = Board.fromFEN("r1b2b1r/p4kpp/2p5/1p1qQ1B1/3P4/8/PPP2PPP/R3K2R w KQ - 0 15");
    const report = buildCoachReport(board, { move: "a2a3", suggestions: ["a2a3", "e1g1"] });
    const alt = report.alternatives.find((candidate) => candidate.move === "e1g1");
    expect(alt?.kind).toBe("queen-trade");
    expect(alt?.line).toEqual(["e1g1", "d5e5", "d4e5"]);
    expect(alt?.explanation).toMatch(/queen trade, not a queen being given away/i);
  });

  it("describes castling as king development, not just an unexplained UCI move", () => {
    const board = Board.fromFEN("r1b2b1r/p4kpp/2p5/1p1qQ1B1/3P4/8/PPP2PPP/R3K2R w KQ - 0 15");
    const report = buildCoachReport(board, { move: "e1g1" });
    expect(report.headline).toMatch(/castles kingside/i);
    expect(report.explanation).toMatch(/rook into play/i);
  });

  it("does not invent an alternative, or call an unresolved move a blunder", () => {
    const report = buildCoachReport(Board.start(), {
      move: "e2e4",
      suggestions: ["e2e4", "a1a8", "d2d4"],
    });
    expect(report.alternatives).toHaveLength(1);
    expect(report.alternatives[0].move).toBe("d2d4");
    expect(report.alternatives[0].kind).toBe("unresolved");
    expect(report.alternatives[0].explanation).not.toMatch(/blunder|loses|refuted/i);
  });
});
