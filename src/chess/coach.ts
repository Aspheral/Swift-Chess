import { Board, Color, Move, PieceType } from "./board";
import type { SwiftDecisionTrace } from "./human-engine";
import type { SwiftMindSnapshot } from "./mind";

/**
 * First-pass, evidence-backed coaching for the Analyze view.
 *
 * Tactical claims are generated from legal moves, not from an LLM or from
 * unopposed plan imagination. The principal variation is replayed and cut
 * off at the first illegal move. This intentionally does not grade blunders:
 * that requires matched-depth evaluation of the played move and alternatives.
 */
export interface CoachAlternative {
  move: string;
  explanation: string;
  /** The candidate followed by a verified legal response, when available. */
  line: string[];
  kind: "mate-threat" | "queen-threat" | "unresolved";
}

export interface CoachReport {
  move: string | null;
  headline: string;
  explanation: string;
  recordedPlan?: string;
  decisionNote?: string;
  watchpoint?: string;
  /** Alternating legal moves only, starting from the analyzed position. */
  verifiedLine: string[];
  alternatives: CoachAlternative[];
}

export interface CoachInput {
  move: string | null;
  pv?: string[];
  suggestions?: string[];
  mind?: SwiftMindSnapshot;
  decision?: SwiftDecisionTrace;
}

const FILES = "abcdefgh";
const pieceLabels: Record<PieceType, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};
const opposite = (color: Color): Color => color === "w" ? "b" : "w";
const squareName = (square: number): string =>
  `${FILES[square & 7]}${Math.floor(square / 8) + 1}`;

function findLegal(board: Board, uci: string): Move | undefined {
  return board.legalMoves().find((move) => move.uci() === uci);
}

/** Never display an unverified principal variation as a concrete line. */
export function verifyCoachLine(board: Board, proposed: string[], maxPlies = 8): string[] {
  let position = board;
  const verified: string[] = [];
  for (const uci of proposed.slice(0, maxPlies)) {
    const move = findLegal(position, uci);
    if (!move) break;
    verified.push(move.uci());
    position = position.makeMove(move);
  }
  return verified;
}

function mateInOne(board: Board): Move | null {
  for (const move of board.legalMoves()) {
    if (board.makeMove(move).isCheckmate()) return move;
  }
  return null;
}

function queenCapture(board: Board, victim: Color): Move | null {
  for (const move of board.legalMoves()) {
    if (board.pieceAt(move.to) === `${victim}q`) return move;
  }
  return null;
}

function explainAlternative(board: Board, candidate: Move): CoachAlternative {
  const uci = candidate.uci();
  const replyPosition = board.makeMove(candidate);
  const mate = mateInOne(replyPosition);
  if (mate) {
    return {
      move: uci,
      explanation: `After ${uci}, ${mate.uci()} is an immediate checkmate. This is a verified one-move tactical danger.`,
      line: [uci, mate.uci()],
      kind: "mate-threat",
    };
  }
  const capturedQueen = queenCapture(replyPosition, board.turn());
  if (capturedQueen) {
    return {
      move: uci,
      explanation: `After ${uci}, the opponent can legally capture the queen with ${capturedQueen.uci()}. This is a tactical warning, not proof that the move loses.`,
      line: [uci, capturedQueen.uci()],
      kind: "queen-threat",
    };
  }
  return {
    move: uci,
    explanation: "Swift considered this alternative. The short tactical check does not establish a refutation or prove that it is worse.",
    line: [uci],
    kind: "unresolved",
  };
}

export function buildCoachReport(board: Board, input: CoachInput): CoachReport {
  const move = input.move ? findLegal(board, input.move) : undefined;
  const recordedPlan = input.mind?.plan && input.mind.planReason
    ? input.mind.planReason
    : undefined;
  const decisionNote = input.decision?.reasons.find((reason) => reason.trim().length > 0);
  const watchpoint = input.mind?.concern;

  if (!move) {
    return {
      move: null,
      headline: board.isCheckmate() ? "The position is checkmate" :
        board.isStalemate() ? "The position is stalemate" : "No analyzed move yet",
      explanation: "There is no move to explain from this analysis result.",
      recordedPlan,
      decisionNote,
      watchpoint,
      verifiedLine: [],
      alternatives: [],
    };
  }

  const uci = move.uci();
  const next = board.makeMove(move);
  const mover = board.pieceAt(move.from);
  const captured = board.pieceAt(move.to);
  const givesCheck = next.isInCheck(opposite(board.turn()));
  let headline = `Why Swift considers ${uci}`;
  let explanation = "Swift selected this move from the current position. Its recorded plan and a legally replayed continuation are shown below.";

  if (next.isCheckmate()) {
    headline = `${uci} delivers checkmate`;
    explanation = "This move legally ends the game in checkmate. The opponent has no legal escape from check.";
  } else if (move.promotion) {
    headline = `${uci} promotes the pawn`;
    explanation = `The pawn reaches the last rank and becomes a ${pieceLabels[move.promotion]}.` +
      (givesCheck ? " The promotion also gives check." : "");
  } else if (captured || move.enPassant) {
    const target = captured?.[1] ?? "p";
    headline = `${uci} captures a ${pieceLabels[target as PieceType]}`;
    explanation = `The ${mover ? pieceLabels[mover[1] as PieceType] : "piece"} captures on ${squareName(move.to)}.` +
      (givesCheck ? " This also puts the king in check." : " Whether the capture is best depends on the opponent's response.");
  } else if (givesCheck) {
    headline = `${uci} gives check`;
    explanation = "The move directly attacks the opposing king. The opponent must respond to the check.";
  } else if (board.createsPawnPieceThreat(move)) {
    headline = `${uci} attacks a piece with a pawn`;
    explanation = "The pawn advance attacks an opposing piece. The opponent may need to move, defend, or counterattack.";
  } else if (board.isInCheck(board.turn())) {
    headline = `${uci} answers the check`;
    explanation = "The king was in check. This legal move removes the immediate check.";
  }

  const proposedLine = input.pv?.[0] === uci ? input.pv : [uci];
  const verifiedLine = verifyCoachLine(board, proposedLine);

  const alternatives = [...new Set(input.suggestions ?? [])]
    .filter((other) => other !== uci)
    .map((other) => findLegal(board, other))
    .filter((candidate): candidate is Move => candidate !== undefined)
    .slice(0, 3)
    .map((candidate) => explainAlternative(board, candidate));

  return {
    move: uci,
    headline,
    explanation,
    recordedPlan,
    decisionNote,
    watchpoint,
    verifiedLine,
    alternatives,
  };
}
