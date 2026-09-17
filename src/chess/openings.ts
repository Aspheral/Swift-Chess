import { Board, Move } from "./board";

export type SwiftOpening = "Reti" | "Queen's Gambit" | "Queen's Gambit Declined" | "Four Knights" | "Bishop's Opening";

interface OpeningLine {
  name: SwiftOpening;
  moves: string[];
  weight: number;
}

/**
 * A compact human repertoire. Swift does not invent a bizarre move simply to
 * satisfy the book. It follows a familiar family only while the opponent's
 * moves keep matching it, then returns to the normal human selector.
 *
 * The weights matter only where two repertoire families share the same
 * position, most notably the Queen's Gambit / QGD choice after 1.d4 d5 2.c4.
 */
const LINES: OpeningLine[] = [
  {
    name: "Reti",
    moves: ["g1f3", "d7d5", "c2c4", "e7e6", "g2g3", "g8f6", "f1g2", "f8e7", "e1g1", "e8g8", "d2d4"],
    weight: 3,
  },
  {
    name: "Queen's Gambit",
    moves: ["d2d4", "d7d5", "c2c4", "d5c4", "e2e4", "e7e5", "g1f3", "b8c6"],
    weight: 2,
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
    weight: 2,
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

/** Return the repertoire move for the current opening position, if one exists. */
export function openingBookMove(board: Board, seed = Date.now()): { move: Move; opening: SwiftOpening } | null {
  const matches = POSITIONS.filter((position) => position.key === key(board));
  if (!matches.length) return null;

  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const choices = matches
    .map((position) => ({ position, move: legal.get(position.line.moves[position.index]) }))
    .filter((choice): choice is { position: (typeof matches)[number]; move: Move } => Boolean(choice.move));
  if (!choices.length) return null;

  const totalWeight = choices.reduce((sum, choice) => sum + choice.position.line.weight, 0);
  let roll = seededRandom(seed) * totalWeight;
  for (const choice of choices) {
    roll -= choice.position.line.weight;
    if (roll <= 0) return { move: choice.move, opening: choice.position.line.name };
  }
  return { move: choices[0].move, opening: choices[0].position.line.name };
}

export function openingNames(): SwiftOpening[] {
  return LINES.map((line) => line.name);
}
