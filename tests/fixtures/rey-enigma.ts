import { Board, Move } from "../../src";

/**
 * User-supplied SwiftChessTV (White) vs Rey Enigma (Black), 0-1.
 * The PGN is a game fixture, not verification of player identity or rating.
 * The notation is converted via Swift's own legal move generator so a typo
 * fails at the exact ply rather than silently producing a fabricated FEN.
 */
export const REY_ENIGMA_SAN = [
  "1. Nf3 d5 2. c4 c6 3. cxd5 cxd5 4. Nc3 d4 5. Ne4 Nc6",
  "6. e3 Qd5 7. d3 f5 8. Ng3 Nf6 9. exd4 Bd7 10. Ne2 e6",
  "11. Bd2 Be7 12. Nc3 Qd6 13. Nb5 Qb8 14. Be2 a6 15. Nc3 Qd6",
  "16. Qa4 O-O 17. Qb3 b5 18. Bg5 b4 19. Nd1 h6 20. Bd2 Na5",
  "21. Qc2 Rac8 22. Qb1 Nc6 23. a3 bxa3 24. Rxa3 Qb8 25. Rxa6 Nb4",
  "26. Bxb4 Bxb4+ 27. Kf1 Qb7 28. Ra2 Nd5 29. Kg1 Nf4 30. b3 Bc6",
  "31. Qb2 Bd5 32. h3 Bd6 33. Ne3 Nxe2+ 34. Qxe2 Rc1+",
  "35. Nf1 Rfc8 36. Rb2 Ra1 37. Qe3 Rcc1 38. Nh2 g5 39. h4 Bf4",
  "40. Qe2 g4 41. b4 Re1 42. Qxe1 Rxe1 43. Nf3 gxf3 44. g3 Qg7",
  "45. Rh3 Qg4 46. Kh2 Rxf1 47. Rb1 Rxf2+ 48. Kg1 Rg2+",
  "49. Kf1 Qxh3 50. gxf4 Qh1# 0-1",
].join(" ");

function parseSan(board: Board, raw: string, ply: number): Move {
  const san = raw.replace(/[+#?!]+$/g, "");
  const legal = board.legalMoves();
  if (san === "O-O" || san === "O-O-O") {
    const offset = san === "O-O" ? 2 : -2;
    const moves = legal.filter((move) => move.castle && move.to - move.from === offset);
    if (moves.length !== 1) throw Error("Invalid castle at ply " + ply + ": " + raw);
    return moves[0];
  }
  const parts = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/);
  if (!parts) throw Error("Unsupported SAN at ply " + ply + ": " + raw);
  const [, namedPiece, fromFile, fromRank, capture, to, promotion] = parts;
  const expectedType = (namedPiece ?? "P").toLowerCase();
  const matches = legal.filter((move) => {
    const piece = board.pieceAt(move.from);
    if (!piece || piece[1] !== expectedType) return false;
    const uci = move.uci();
    if (uci.slice(2, 4) !== to) return false;
    if (fromFile && uci[0] !== fromFile) return false;
    if (fromRank && uci[1] !== fromRank) return false;
    if ((promotion?.toLowerCase() ?? "") !== (move.promotion ?? "")) return false;
    const isCapture = move.enPassant || board.pieceAt(move.to) !== null;
    return Boolean(capture) === isCapture;
  });
  if (matches.length !== 1) throw Error(
    "Ambiguous or illegal SAN at ply " + ply + ": " + raw +
    " (" + matches.length + " matches); FEN " + board.toFEN(),
  );
  const next = board.makeMove(matches[0]);
  if (raw.endsWith("#") && !next.isCheckmate()) throw Error("Expected checkmate at ply " + ply);
  if (raw.endsWith("+") && !next.isInCheck(next.turn())) throw Error("Expected check at ply " + ply);
  return matches[0];
}

export interface ReyReplay {
  /** Positions[0] is the initial board; positions[n] is after n half-moves. */
  positions: Board[];
  moves: string[];
  sans: string[];
}

export function replayReyEnigmaGame(): ReyReplay {
  const sans = REY_ENIGMA_SAN.replace(/\b\d+\.(?:\.\.)?/g, " ")
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
