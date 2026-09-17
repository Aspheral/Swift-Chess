import { Board, Move } from "./board";

export type SwiftOpening = "Reti" | "Queen's Gambit" | "Queen's Gambit Declined" | "Four Knights" | "Bishop's Opening";

interface OpeningLine {
  name: SwiftOpening;
  moves: string[];
  weight: number;
}

/**
 * Swift's small human repertoire. These are deliberately short, normal
 * developing lines rather than a giant opening database. Several branches
 * cover the same opening so an opponent's harmless deviation does not throw
 * Swift into a completely unrelated move such as ...Na6.
 */
const LINES: OpeningLine[] = [
  {
    name: "Reti",
    moves: ["g1f3", "d7d5", "c2c4", "e7e6", "g2g3", "g8f6", "f1g2", "f8e7", "e1g1", "e8g8", "d2d4"],
    weight: 3,
  },
  {
    name: "Reti",
    moves: ["g1f3", "d7d5", "b1c3", "g8f6", "d2d4", "e7e6", "e2e4", "f8e7", "e1g1", "e8g8"],
    weight: 2,
  },
  {
    name: "Queen's Gambit",
    moves: ["d2d4", "d7d5", "c2c4", "d5c4", "g1f3", "g8f6", "e2e3", "e7e6", "f1c4", "f8e7", "e1g1"],
    weight: 3,
  },
  {
    name: "Queen's Gambit Declined",
    moves: ["d2d4", "d7d5", "c2c4", "e7e6", "g1f3", "g8f6", "e2e3", "f8e7", "f1d3", "e8g8"],
    weight: 4,
  },
  {
    name: "Queen's Gambit Declined",
    moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7", "e2e3", "e8g8"],
    weight: 2,
  },
  {
    name: "Four Knights",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6", "f1b5", "f8b4", "e1g1", "e8g8"],
    weight: 4,
  },
  {
    name: "Four Knights",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6", "d2d4", "e5d4", "f3d4", "f8b4"],
    weight: 2,
  },
  {
    name: "Bishop's Opening",
    moves: ["e2e4", "e7e5", "f1c4", "g8f6", "d2d3", "f8c5", "g1f3", "e8g8", "e1g1"],
    weight: 3,
  },
  {
    name: "Bishop's Opening",
    moves: ["e2e4", "e7e5", "f1c4", "g8f6", "d2d3", "f8b4", "c1d2", "b4c5", "g1f3", "e8g8"],
    weight: 1,
  },
];

function seededRandom(seed: number): number {
  let state = seed >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}

/**
 * Small natural-development fallback for harmless opening deviations. It is
 * intentionally conservative: center pawns and undeveloped knights are much
 * more human than inventing a flank knight excursion just because the exact
 * book line stopped matching.
 */
function naturalOpeningMove(board: Board, history: string[]): Move | null {
  if (history.length >= 8) return null;

  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const first = history[0];
  const preferred = first === "e2e4"
    ? ["e7e5", "g8f6", "b8c6", "f8c5", "f8e7", "e8g8"]
    : first === "d2d4"
      ? ["d7d5", "g8f6", "e7e6", "c7c5", "f8e7", "e8g8"]
      : first === "g1f3"
        ? ["d7d5", "g8f6", "e7e6", "c7c5", "f8e7", "e8g8"]
        : [];

  for (const uci of preferred) {
    const move = legal.get(uci);
    if (move) return move;
  }
  return null;
}

/**
 * Return a repertoire move while the actual game history matches a line. If
 * the opponent makes a harmless deviation, Swift keeps making normal
 * developing moves instead of falling into engine-only play.
 */
export function openingBookMove(
  board: Board,
  seed = Date.now(),
  history: string[] = [],
): { move: Move; opening: SwiftOpening } | null {
  if (history.length >= 12) return null;

  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const matches = LINES
    .filter((line) => history.every((move, index) => line.moves[index] === move))
    .map((line) => ({ line, next: line.moves[history.length] }))
    .filter(({ next }) => Boolean(next && legal.has(next)));

  if (matches.length) {
    const totalWeight = matches.reduce((sum, choice) => sum + choice.line.weight, 0);
    let roll = seededRandom(seed) * totalWeight;
    for (const choice of matches) {
      roll -= choice.line.weight;
      if (roll <= 0) return { move: legal.get(choice.next)!, opening: choice.line.name };
    }
    return { move: legal.get(matches[0].next)!, opening: matches[0].line.name };
  }

  const natural = naturalOpeningMove(board, history);
  if (natural) {
    const first = history[0];
    const opening: SwiftOpening = first === "e2e4"
      ? (history[2] === "f1c4" ? "Bishop's Opening" : "Four Knights")
      : first === "d2d4"
        ? "Queen's Gambit Declined"
        : "Reti";
    return { move: natural, opening };
  }

  return null;
}

export function openingNames(): SwiftOpening[] {
  return ["Reti", "Queen's Gambit", "Queen's Gambit Declined", "Four Knights", "Bishop's Opening"];
}

export function openingLineMoves(name: SwiftOpening): string[] {
  return [...LINES.find((line) => line.name === name)!.moves];
}
