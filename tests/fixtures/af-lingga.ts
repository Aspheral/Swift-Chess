import { Board } from "../../src";
import { parseSan } from "./rey-enigma";

/**
 * User-supplied game: SwiftChessTV (White) vs AfLingga (Black),
 * Chess.com rapid 600 seconds, 2026-11-09, result 0-1.
 * Replayed from SAN with Swift's own legal move generator.
 * This is a supplied game score, not an independent online verification.
 */
export const AF_LINGGA_SAN = [
  "1. Nf3 d5 2. Nc3 Nf6 3. g3 c5 4. e3 Nc6 5. d4 Bg4",
  "6. Bb5 e6 7. Bxc6+ bxc6 8. h3 Bxf3 9. Qxf3 Rb8",
  "10. O-O Qc7 11. g4 c4 12. g5 Ng8 13. e4 Ne7",
  "14. Bf4 Qb7 15. Bxb8 Qxb8 16. Rab1 Ng6 17. Qg2 Be7",
  "18. Qg4 h5 19. gxh6 Rxh6 20. Rfd1 Rh4 21. Qg2 Nf4",
  "22. Qxg7 Nxh3+ 23. Kf1 Nxf2 24. Qg8+ Bf8 25. Re1 Qf4",
  "26. Ke2 Rh2 27. Qg1 Nxe4+ 28. Qxh2 Qxh2+ 29. Kf3 Qg3+",
  "30. Ke2 Qf2+ 31. Kd1 Qd2# 0-1",
].join(" ");

export function replayAfLinggaGame() {
  const sans = AF_LINGGA_SAN.replace(/\\b\\d+\\.(?:\\.\\.)?/g, " ")
    .replace(/\\b0-1\\b/g, " ").trim().split(/\\s+/);
  const positions = [Board.start()];
  const moves: string[] = [];
  let board = positions[0];
  for (const [index, san] of sans.entries()) {
    const move = parseSan(board, san, index + 1);
    moves.push(move.uci());
    board = board.makeMove(move);
    positions.push(board);
  }
  return { positions, moves, sans };
}
