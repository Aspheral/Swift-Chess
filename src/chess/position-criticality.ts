import { Board, Color } from "./board";
import { understandPosition } from "./understanding";

/**
 * Side-specific tactical and practical urgency (0–100).
 *
 * 0: no immediate practical urgency; 100: checkmate against the named side.
 * NOT win probability, Elo, mate prediction, engine evaluation, nor the
 * human-likeness score. Both colors are evaluated from the SAME board.
 */
export type PositionCriticality = Record<Color, number>;

const other = (side: Color): Color => side === "w" ? "b" : "w";
const clamp = (value: number): number => Math.max(0, Math.min(99, Math.round(value)));

export function criticalityCornerSide(
  flipped: boolean,
  corner: "top-right" | "bottom-left",
): Color {
  return corner === "top-right"
    ? (flipped ? "w" : "b")
    : (flipped ? "b" : "w");
}

export function positionCriticality(board: Board): PositionCriticality {
  const sideToMove = board.turn();
  // There is no remaining decision if the position is already terminal.
  // Distinguish checkmate (100 for the mated side) from stalemate (0 each).
  const legal = board.legalMoves();
  if (!legal.length) {
    if (board.isInCheck(sideToMove)) {
      return sideToMove === "w" ? { w: 100, b: 0 } : { w: 0, b: 100 };
    }
    return { w: 0, b: 0 };
  }

  const position = understandPosition(board);

  function sideUrgency(side: Color): number {
    const enemy = other(side);
    const king = position.king[side];
    const hostileHeavyPieces = position.pieces[enemy].some(
      (piece) => piece.type === "q" || piece.type === "r",
    );

    let urgency = 8 + (side === sideToMove ? 3 : 0);
    urgency += Math.min(20, king.attackers * 10);
    urgency += Math.min(17, king.rookInvasionPressure * 7);
    urgency += Math.min(13, king.loomingRookInvasion * 4);
    urgency += Math.min(12, king.openFilesNearKing * 4);
    if (hostileHeavyPieces && king.pawnShield <= 1) urgency += 9;

    // A genuinely undefended attacked piece creates a practical problem.
    // Count queen/rook pressure more heavily than a minor-piece threat.
    for (const piece of position.pieces[side]) {
      if (!piece.vulnerable) continue;
      urgency += piece.type === "q" ? 21 : piece.type === "r" ? 13 : 8;
    }

    // An enemy pawn about to promote demands attention, even if a quiet
    // engine evaluation would prefer to pursue an unrelated plan.
    for (let square = 0; square < 64; square++) {
      if (board.pieceAt(square) !== enemy + "p") continue;
      const rank = square >>> 3;
      const stepsToPromotion = enemy === "w" ? 7 - rank : rank;
      if (stepsToPromotion > 3) continue;
      const file = square & 7;
      let obstructingPawn = false;
      for (let target = 0; target < 64; target++) {
        if (board.pieceAt(target) !== side + "p") continue;
        if (Math.abs((target & 7) - file) > 1) continue;
        const defendingRank = target >>> 3;
        if (enemy === "w" ? defendingRank > rank : defendingRank < rank) {
          obstructingPawn = true;
          break;
        }
      }
      if (!obstructingPawn) {
        urgency += stepsToPromotion === 1 ? 27
          : stepsToPromotion === 2 ? 16 : 7;
      }
    }

    // Material alone is not a "critical" position. A serious deficit adds
    // only a little pressure, and cannot overwhelm concrete checks/threats.
    const materialAgainstSide = (side === "w" ? -1 : 1) * position.material;
    if (materialAgainstSide > 250) urgency += Math.min(12, materialAgainstSide / 140);

    // Check is urgent regardless of positional heuristics.
    if (board.isInCheck(side)) urgency = Math.max(86, urgency + 35);
    return clamp(urgency);
  }

  return { w: sideUrgency("w"), b: sideUrgency("b") };
}
