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
      explanation = `${color} can take the queen on ${name(capture.to)} with ${capture.uci()}, ` +
        `but your ${recapturing ? names[recapturing[1] as PieceType] : "piece"} can answer with ${recapture.uci()}. ` +
        "Both queens leave the board. That's a trade, not a queen left for free. " +
        "Whether you'd welcome that endgame is the real question.";
    } else if (recapture) {
      explanation = `${color} can take your queen with ${capture.uci()}, and ${recapture.uci()} ` +
        `recaptures the ${capturingPiece ? names[capturingPiece[1] as PieceType] : "piece"}. ` +
        "That is not an even queen trade; check what material remains afterward.";
    } else {
      explanation = `${color} can take the queen on ${name(capture.to)} with ${capture.uci()}, ` +
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
