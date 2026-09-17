import { Board, Move } from "./board";

export type SwiftOpening = "Reti" | "Queen's Gambit" | "Queen's Gambit Declined" | "Four Knights" | "Bishop's Opening";

interface OpeningLine {
  name: SwiftOpening;
  moves: string[];
  weight: number;
}

/**
 * A small human repertoire rather than a giant opening table.
 *
 * Swift only follows a line while the actual game history still matches it.
 * Once the opponent deviates, the book gets out of the way and the normal
 * position-understanding layer takes over. This prevents "opening memory"
 * from turning into mechanical play.
 */
const LINES: OpeningLine[] = [
  {
    name: "Reti",
    moves: ["g1f3", "d7d5", "c2c4", "e7e6", "g2g3", "g8f6", "f1g2", "f8e7", "e1g1", "e8g8", "d2d4"],
    weight: 3,
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
    name: "Four Knights",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6", "f1b5", "f8b4", "e1g1", "e8g8"],
    weight: 4,
  },
  {
    name: "Bishop's Opening",
    moves: ["e2e4", "e7e5", "f1c4", "g8f6", "d2d3", "f8c5", "g1f3", "e8g8", "e1g1"],
    weight: 3,
  },
];

function key(board: Board): string {
  return board.toFEN().split(/\s+/).slice(0, 4).join(" ");
}

function positionAfter(moves: string[]): Board {
  let board = Board.start();
  for (const uci of moves) {
    const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
    if (!move) throw new Error(`Invalid opening-book move: ${uci}`);
    board = board.makeMove(move);
  }
  return board;
}

const POSITIONS = LINES.flatMap((line) =>
  line.moves.map((_, index) => ({
    line,
    index,
    key: key(positionAfter(line.moves.slice(0, index))),
  })),
);

function seededRandom(seed: number): number {
  let state = seed >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}

/**
 * Return a repertoire move only when the supplied game history is an exact
 * prefix of the repertoire line. The history parameter is deliberately UCI
 * based so the opening layer stays independent from Game's mutable state.
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

  if (!matches.length) return null;

  const totalWeight = matches.reduce((sum, choice) => sum + choice.line.weight, 0);
  let roll = seededRandom(seed) * totalWeight;
  for (const choice of matches) {
    roll -= choice.line.weight;
    if (roll <= 0) return { move: legal.get(choice.next)!, opening: choice.line.name };
  }
  return { move: legal.get(matches[0].next)!, opening: matches[0].line.name };
}

/** Return the repertoire families Swift can use from its current side. */
export function openingNames(): SwiftOpening[] {
  return LINES.map((line) => line.name);
}

/** Useful for tests and diagnostics without exposing the internal table. */
export function openingLineMoves(name: SwiftOpening): string[] {
  return [...LINES.find((line) => line.name === name)!.moves];
}
