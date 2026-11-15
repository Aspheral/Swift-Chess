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


/** One recorded move, reviewed from the board *before* it was played. */
export interface CoachMoveReview {
  playedMove: string;
  headline: string;
  verdict: "checkmate" | "mate-in-one" | "mate-in-two" | "queen-capture" |
    "large-drop" | "smaller-drop" | "close" | "unverified";
  explanation: string;
  /** Every move in this variation was replayed and checked for legality. */
  line: string[];
  /** Only an exhaustive mate proof can be marked forced. */
  forced: boolean;
  suggestedMove?: string;
  suggestedLine?: string[];
  centipawnDrop?: number;
  completedDepth?: number;
}

/**
 * Optional independent, aligned-depth searches:
 * a depth-N search of the parent and depth-(N-1) search of the played child.
 * Scores are from their respective sides to move, so the child's score is
 * negated when comparing from the original mover's perspective.
 */
export interface CoachReviewSearchEvidence {
  bestMove: string | null;
  bestLine: string[];
  bestScore: number;
  rootDepth: number;
  replyLine: string[];
  replyScore: number;
  childDepth: number;
}

/**
 * Look only for a fully proven checking mate in two: the attacker has a
 * checking first move, and for EVERY legal defense has a mate in one.
 * Work is bounded by two branching gates; failing a gate means "unknown",
 * never "not mate".
 */
function provenCheckingMateInTwo(board: Board): string[] | null {
  const attacker = board.turn();
  const defender = opposite(attacker);
  let checksExamined = 0;
  for (const first of board.legalMoves()) {
    const next = board.makeMove(first);
    if (!next.isInCheck(defender)) continue;
    if (++checksExamined > 8) break;
    const replies = next.legalMoves();
    if (replies.length === 0 || replies.length > 10) continue;
    let example: string[] | null = null;
    let allResponsesMated = true;
    for (const reply of replies) {
      const afterDefense = next.makeMove(reply);
      const finishingMate = mateInOne(afterDefense);
      if (!finishingMate) {
        allResponsesMated = false;
        break;
      }
      if (!example) example = [first.uci(), reply.uci(), finishingMate.uci()];
    }
    if (allResponsesMated && example) return example;
  }
  return null;
}

export function buildPlayedMoveReview(
  before: Board,
  playedUci: string,
  evidence?: CoachReviewSearchEvidence,
): CoachMoveReview | null {
  const move = findLegal(before, playedUci);
  if (!move) return null;
  const playedMove = move.uci();
  const after = before.makeMove(move);
  const legalBest = evidence?.bestMove ? findLegal(before, evidence.bestMove) : undefined;
  const suggestedMove = legalBest && legalBest.uci() !== playedMove
    ? legalBest.uci() : undefined;
  const suggestedLine = suggestedMove && evidence?.bestLine[0] === suggestedMove
    ? verifyCoachLine(before, evidence.bestLine, 6) : undefined;

  const matched = !!evidence && evidence.rootDepth >= 4 && evidence.childDepth >= 3 &&
    Number.isFinite(evidence.bestScore) && Number.isFinite(evidence.replyScore) &&
    !!legalBest;
  // A principal result selecting the played move is not evidence of a loss,
  // even when two separate time-limited searches disagree numerically.
  const centipawnDrop = matched ? suggestedMove
    ? Math.max(0, Math.round(evidence!.bestScore + evidence!.replyScore))
    : 0 : undefined;
  const completedDepth = matched ? evidence!.rootDepth : undefined;
  const candidateLine = evidence?.replyLine
    ? verifyCoachLine(before, [playedMove, ...evidence.replyLine], 6) : [playedMove];
  const base = { playedMove, suggestedMove, suggestedLine, centipawnDrop, completedDepth };

  if (after.isCheckmate()) {
    return {
      ...base, verdict: "checkmate", headline: "This move delivers checkmate",
      explanation: "The move legally checkmates the opposing king. There is no legal escape.",
      line: [playedMove], forced: true,
    };
  }

  const matingReply = mateInOne(after);
  if (matingReply) {
    // A losing situation can already be forced. Call it a blunder only if at
    // least one other legal choice avoids mate on the next move.
    const avoidable = before.legalMoves().some((alternative) =>
      alternative.uci() !== playedMove && mateInOne(before.makeMove(alternative)) === null,
    );
    return {
      ...base, verdict: "mate-in-one",
      headline: avoidable ? "Blunder: this allows mate in one" : "The opponent has mate in one",
      explanation: "The opponent can checkmate immediately with " + matingReply.uci() + "." +
        (avoidable
          ? " At least one other legal move would avoid this immediate mate."
          : " No alternative avoiding the same immediate threat was found, so it may have been unavoidable."),
      line: [playedMove, matingReply.uci()], forced: true,
    };
  }

  const twoMoveMate = provenCheckingMateInTwo(after);
  if (twoMoveMate) {
    return {
      ...base, verdict: "mate-in-two", headline: "A forced mate in two is available",
      explanation: "After " + twoMoveMate[0] +
        " the opponent has a check that leads to mate on their following move against every legal defense. The line shows one of those defenses.",
      line: [playedMove, ...twoMoveMate], forced: true,
    };
  }

  const queenAttack = queenCapture(after, before.turn());
  if (queenAttack) {
    return {
      ...base, verdict: "queen-capture", headline: "Your queen can be captured",
      explanation: "After this move, the opponent can legally capture your queen with " +
        queenAttack.uci() + ". This is a real tactical possibility, but a capture alone does not prove a net material loss.",
      line: [playedMove, queenAttack.uci()], forced: false,
    };
  }

  if (centipawnDrop !== undefined && centipawnDrop >= 250) {
    return {
      ...base, verdict: "large-drop", headline: "A major evaluation drop",
      explanation: "At completed aligned search depths, Swift estimates this choice is about " +
        centipawnDrop + " centipawns worse than its searched preference. This is a search estimate, not a proven forced win.",
      line: candidateLine, forced: false,
    };
  }
  if (centipawnDrop !== undefined && centipawnDrop >= 90) {
    return {
      ...base, verdict: "smaller-drop", headline: "A possible improvement was missed",
      explanation: "Swift's completed searches favor a different move by about " +
        centipawnDrop + " centipawns. This is an estimate; the tactical cause is not yet proven.",
      line: candidateLine, forced: false,
    };
  }
  if (centipawnDrop !== undefined) {
    return {
      ...base, verdict: "close", headline: "No major evaluation drop found",
      explanation: "At the completed comparison depth, Swift did not find a large advantage to switching moves. That is not proof this was the best move.",
      line: candidateLine, forced: false,
    };
  }
  return {
    ...base, verdict: "unverified", headline: "Review is inconclusive",
    explanation: "No short forced mate or immediate queen capture was verified. A matched-depth search did not finish, so Swift is not grading this move.",
    line: candidateLine, forced: false,
  };
}
