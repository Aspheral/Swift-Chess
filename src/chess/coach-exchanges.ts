import { Board, Color, Move, PieceType } from "./board";
import { staticExchange } from "./see";

export interface QueenExchangeContext {
  /** The opponent's legal capture of the queen. */
  capture: string;
  /** A legal immediate recapture, if it exists. */
  recapture?: string;
  /** A queen-for-queen trade requires both queens to leave in the line. */
  kind: "queen-trade" | "queen-risk";
  /** Moves following the position where the opponent is to play. */
  line: string[];
  /** A local exchange estimate, NOT a positional evaluation. */
  localGainCp: number;
  explanation: string;
}

const FILES = "abcdefgh";
const name = (s: number) => `${FILES[s & 7]}${Math.floor(s / 8) + 1}`;
/** Simple capture notation for explanation prose; the UCI line remains exact. */
const captureName = (board: Board, move: Move): string => {
  const piece = board.pieceAt(move.from);
  const prefix = piece?.[1] === "p" ? FILES[move.from & 7] : piece?.[1].toUpperCase() ?? "?";
  return `${prefix}x${name(move.to)}`;
};
const names: Record<PieceType, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

/**
 * Analyze the opponent's ability to take a queen and the immediate recapture.
 * This prevents Coach Mode from calling routine queen exchanges "queen hangs".
 * All moves are legal. Static exchange assessment helps prioritize a genuine
 * material threat over a harmless trade when several captures exist.
 *
 * Replacing a queen with a rook or bishop is not an equal queen trade.
 * Even a queen-for-queen sequence can be strategically poor, so we never
 * assert the move is good merely because it is a trade.
 */
export function queenExchangeContext(board: Board, victim: Color): QueenExchangeContext | null {
  if (board.turn() === victim) return null;
  const captures = board.legalMoves().filter((m) => board.pieceAt(m.to) === `${victim}q`);
  const options: QueenExchangeContext[] = captures.map((capture: Move) => {
    const capturingPiece = board.pieceAt(capture.from);
    const child = board.makeMove(capture);
    const recapture = child.legalMoves().find((reply) =>
      reply.to === capture.to && child.pieceAt(reply.to)?.[0] === board.turn(),
    );
    const tradesQueens = capturingPiece?.[1] === "q" && !!recapture;
    const color = board.turn() === "w" ? "White" : "Black";
    const localGainCp = staticExchange(board, capture);
    let explanation: string;
    if (recapture && tradesQueens) {
      const recapturing = child.pieceAt(recapture.from);
      const tradeEffect = recapturing?.[1] === "p"
        ? ` Your pawn finishes on ${name(recapture.to)}, changing the central pawn structure.`
        : "";
      explanation = `${color} can play ${captureName(board, capture)}, but your ` +
        `${recapturing ? names[recapturing[1] as PieceType] : "piece"} can take back with ${captureName(child, recapture)}. ` +
        "Both queens leave the board. That's a queen trade, not a queen being given away." +
        tradeEffect + " The resulting position matters more than the capture alone.";
    } else if (recapture) {
      explanation = `${color} can play ${captureName(board, capture)}, and your ${captureName(child, recapture)} ` +
        `takes back the ${capturingPiece ? names[capturingPiece[1] as PieceType] : "piece"}. ` +
        "That's not an equal queen-for-queen trade; check the material left on the board.";
    } else {
      explanation = `${color} can take the queen on ${name(capture.to)} with ${captureName(board, capture)}, ` +
        "and there is no immediate legal recapture. That is a real warning, although " +
        "a deeper tactic might still provide compensation.";
    }
    return {
      capture: capture.uci(), recapture: recapture?.uci(),
      kind: tradesQueens ? "queen-trade" : "queen-risk",
      line: [capture.uci(), ...(recapture ? [recapture.uci()] : [])],
      localGainCp, explanation,
    };
  });

  // If more than one capture exists, show the most materially concerning one.
  options.sort((a, b) => b.localGainCp - a.localGainCp ||
    Number(b.kind === "queen-risk") - Number(a.kind === "queen-risk"));
  return options[0] ?? null;
}
