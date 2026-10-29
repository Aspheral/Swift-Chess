import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine, swiftPlayProfile } from "../src";

const samples = [
  {
    label: "5...Bb4+ vs 5...d5, first serious positional collapse",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4P3/2Bp4/5N2/PPP2PPP/RNBQK2R b KQkq - 0 5",
    history: ["e2e4","e7e5","g1f3","b8c6","d2d4","e5d4","f1c4","g8f6","e4e5"],
    played: "f8b4", stockfish: "d7d5",
  },
  {
    label: "8...Na5 vs 8...d5, 332cp loss",
    fen: "r1bqk2r/ppppbppp/2n2n2/4P3/2B5/1QP2N2/P4PPP/RNB1K2R b KQkq - 2 8",
    history: ["e2e4","e7e5","g1f3","b8c6","d2d4","e5d4","f1c4","g8f6",
      "e4e5","f8b4","c2c3","d4c3","b2c3","b4e7","d1b3"],
    played: "c6a5", stockfish: "d7d5",
  },
  {
    label: "13...Kg8 vs 13...b6, 191cp loss",
    fen: "r1bq3r/ppp2kpp/5b2/Q2p4/8/2P2N2/P4PPP/RNB2RK1 b - - 1 13",
    history: Array(25).fill("fixture"),
    played: "f7g8", stockfish: "b7b6",
  },
  {
    label: "26...c4 vs 26...Kf7, 212cp loss",
    fen: "r5kr/p1B3pp/1p2Rb2/2p5/6P1/5N2/P1N2P1P/6K1 b - - 0 26",
    history: Array(51).fill("fixture"),
    played: "c5c4", stockfish: "g8f7",
  },
];
describe("Chess.com 186133372340: exact PGN turning-point diagnostics", () => {
  for (const item of samples) {
    it(item.label, () => {
      const board = Board.fromFEN(item.fen);
      const legal = board.legalMoves();
      expect(legal.some(m=>m.uci()===item.played)).toBe(true);
      expect(legal.some(m=>m.uci()===item.stockfish)).toBe(true);
      const profile = swiftPlayProfile(board,item.history);
      const result = new HumanSwiftEngine().search(board,{
        ...profile.options,moveHistory:item.history,randomness:0,
        seed:41,adaptiveThinking:false,
      });
      const root = new SwiftEngine().search(board,{depth:8,timeMs:1700});
      const deep = [5,8,13,26].some(n=>item.label.startsWith(n+"..."))
        ? new SwiftEngine().search(board,{depth:11,timeMs:7000}) : null;
      console.log("CHESSCOM-REPLAY",JSON.stringify({
        label:item.label,profile:profile.kind,
        humanMove:result.move?.uci(),humanSource:result.decision?.source,
        humanReason:result.decision?.reasons[0],
        engineMove:result.decision?.engineMove,
        humanDepth:result.depth,
        independentRoot:root.move?.uci(),independentDepth:root.depth,
        independentScore:root.score,
        deepRoot:deep?.move?.uci(),deepDepth:deep?.depth,deepScore:deep?.score,
        deepNodes:deep?.nodes,
      }));
      expect(result.move).not.toBeNull();
      // The first three independent Stockfish-verified forcing defenses
      // must no longer be overlooked by the current human decision pipeline.
      if (!item.label.startsWith("26...")) {
        expect(result.move?.uci(), item.label).toBe(item.stockfish);
      }
    },45_000);
  }
});
