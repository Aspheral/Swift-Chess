import { Board } from "../../src";
import { parseSan } from "./rey-enigma";

/** Exact user-supplied 2026-11-14 Chess.com 10+0 game (SwiftChessTV vs Agusbmw).
 * The recorded SwiftChessTV Elo is 2045 and Agusbmw 2074 at game start.
 * This is a user-provided score, not an independent rating verification.
 */
export const AGUSBMW_SAN = [
  "1. Nf3 f5 2. Nc3 e6 3. e3 Nf6 4. g3 Be7 5. Bg2 O-O",
  "6. d4 d5 7. O-O Ne4 8. Qd3 b6 9. Re1 a5 10. Re2 Ba6",
  "11. Nb5 c6 12. a4 cxb5 13. axb5 Bb7 14. Ne5 Nd7",
  "15. Nc6 Bxc6 16. bxc6 Ndf6 17. c4 Qc7 18. cxd5 exd5",
  "19. Rc2 Bb4 20. Qb3 Kh8 21. Ra2 Rfd8 22. Qa4 Rd6",
  "23. f3 Ng5 24. Qxb4 axb4 25. Rxa8+ Ng8 26. e4 Rxc6",
  "27. Bf4 Rxc2 28. Bxc7 Rxc7 29. exd5 Rd7 30. h4 Nf7",
  "31. f4 h6 32. Rb8 Nd6 33. Rxb6 Ne4 34. Bxe4 fxe4",
  "35. d6 Nf6 36. Kf2 Nd5 37. Rc6 Kh7 38. f5 h5",
  "39. Ra6 Rf7 40. Ra5 Nf6 41. Ke3 Rd7 42. Ra6 g6",
  "43. Kf4 gxf5 44. Kxf5 Kg7 45. Kf4 Kg6 46. Rb6 b3",
  "47. Rxb3 Rxd6 48. Rb4 Re6 49. Rb3 e3 50. Rxe3 Nd5+",
  "51. Kf3 Rxe3+ 52. Kf2 Rb3 53. g4 hxg4 54. h5+ Kxh5",
  "55. Ke1 Rxb2 56. Kd1 Rh2 57. Ke1 g3 58. Kf1 Kg4",
  "59. Kg1 Kf3 60. Kf1 Rh1# 0-1",
].join(" ");

export function replayAgusbmwGame() {
  const sans = AGUSBMW_SAN.replace(/\b\d+\.(?:\.\.)?/g, " ")
    .replace(/\b0-1\b/g, " ").trim().split(/\s+/);
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
