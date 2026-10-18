import { describe, expect, it } from "vitest";
import { Board, HumanSwiftEngine, SwiftEngine, swiftPlayProfile } from "../src";
import { allowsMateInOne } from "../src/chess/blunder-guard";

const cases = [
  { label: "6...Bg4 (better ...Nd3+)", fen: "r1bqkb1r/ppp1pppp/5n2/3Pn3/2p1PP2/2N5/PP4PP/R1BQKBNR b KQkq - 0 6", bad: "c8g4", preferred: "e5d3", ply: 11 },
  { label: "16...Be1+ (lose bishop vs castle)", fen: "r2qk2r/pp3ppp/8/3Q4/1b3P2/4BP2/PP3K1P/3R3R b kq - 2 16", bad: "b4e1", preferred: "e8g8", ply: 31 },
  { label: "42...Rd2 (rook endgame)", fen: "5k2/1p6/p4KR1/4BP2/8/8/PP5r/8 b - - 1 42", bad: "h2d2", preferred: "h2c2", ply: 83 },
  { label: "43...Rd8 (rook endgame)", fen: "5k2/1p6/p3K1R1/4BP2/8/8/PP1r4/8 b - - 3 43", bad: "d2d8", preferred: "d2e2", ply: 85 },
  { label: "44...Ke8 (Q: allowing Rg8#)", fen: "3r1k2/1p6/p2BK1R1/5P2/8/8/PP6/8 b - - 5 44", bad: "f8e8", preferred: "d8d6", ply: 87 },
];

describe("Roblox 2026-10-18 blitz loss: exact reported positions", () => {
  for (const entry of cases) {
    it(entry.label, () => {
      const board = Board.fromFEN(entry.fen);
      const history = Array(entry.ply).fill("fixture");
      const profile = swiftPlayProfile(board, history);
      const answer = new HumanSwiftEngine().search(board, {
        ...profile.options, moveHistory: history, seed: 17,
        adaptiveThinking: false,
      });
      const root = new SwiftEngine().search(board, { depth: 8, timeMs: 1600 });
      console.log(JSON.stringify({ label: entry.label, selected: answer.move?.uci(),
        source: answer.decision?.source, principal: answer.decision?.engineMove,
        reasons: answer.decision?.reasons.slice(0,2), root: root.move?.uci(),
        depth: answer.depth, nodes: answer.nodes }));
      expect(board.legalMoves().some((move) => move.uci() === entry.bad)).toBe(true);
      expect(answer.move).not.toBeNull();
      // These are mistakes confirmed in the original full PGN by independent
      // Stockfish at depth 15. Keep their FENs as durable negative tests.
      if (entry.ply >= 31) {
        expect(answer.move?.uci(), entry.label).not.toBe(entry.bad);
      }
      if (entry.ply === 87) {
        expect(allowsMateInOne(board, board.legalMoves().find((move)=>move.uci()===entry.bad)!)).toBe(true);
        expect(allowsMateInOne(board, answer.move!)).toBe(false);
      }
    }, 40_000);
  }
});
