import { Board, Move } from "./board";

export type SwiftOpening = "Reti" | "Queen's Gambit" | "Queen's Gambit Declined" | "Four Knights" | "Bishop's Opening";

/**
 * Swift does not memorize one brittle opening line. It chooses a small
 * repertoire family from the first moves, then follows the position's cues.
 * That is important for human play: an opponent can deviate without making
 * Swift abandon the opening and start improvising nonsense.
 */
function seededRandom(seed: number): number {
  let state = seed >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}

function legalChoice(board: Board, choices: string[], seed: number): Move | null {
  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const available = choices.filter((uci) => legal.has(uci));
  if (!available.length) return null;
  const index = Math.min(available.length - 1, Math.floor(seededRandom(seed) * available.length));
  return legal.get(available[index]) ?? null;
}

function openingFamily(history: string[], seed: number): SwiftOpening | null {
  const first = history[0];
  if (first === "g1f3") return "Reti";
  if (first === "d2d4") {
    // A real repertoire contains both QGD and QGA-style responses. Keep the
    // choice stable for the whole game by deriving it from the opening seed.
    return seededRandom(seed) < 0.62 ? "Queen's Gambit Declined" : "Queen's Gambit";
  }
  if (first === "e2e4") {
    // Both requested e4 families begin with ...e5. The later white move makes
    // the distinction clearer, but this seed gives Swift a consistent intent
    // before that branch appears on the board.
    return seededRandom(seed) < 0.52 ? "Four Knights" : "Bishop's Opening";
  }
  return null;
}

function moveForReti(board: Board, history: string[], seed: number): Move | null {
  if (history.length === 1) return legalChoice(board, ["d7d5", "g8f6"], seed);
  const last = history.at(-1);
  if (last === "c2c4") return legalChoice(board, ["e7e6", "c7c6", "d5d4"], seed + 11);
  if (last === "g2g3") return legalChoice(board, ["g8f6", "e7e6"], seed + 17);
  if (last === "f1g2") return legalChoice(board, ["f8e7", "c7c5", "g8f6"], seed + 19);
  if (last === "d2d4") return legalChoice(board, ["g8f6", "e7e6", "c7c5"], seed + 23);
  if (last === "b1c3") return legalChoice(board, ["g8f6", "e7e6"], seed + 29);
  return legalChoice(board, ["g8f6", "f8e7", "e7e6", "c7c5"], seed + history.length);
}

function moveForQueensGambit(board: Board, history: string[], seed: number): Move | null {
  if (history.length === 1) return legalChoice(board, ["d7d5"], seed);
  const last = history.at(-1);
  if (last === "c2c4") return legalChoice(board, ["d5c4"], seed + 7);
  if (last === "g1f3") return legalChoice(board, ["g8f6", "e7e6"], seed + 13);
  if (last === "e2e3") return legalChoice(board, ["e7e6", "g8f6"], seed + 17);
  if (last === "c1g5") return legalChoice(board, ["g8f6", "f8e7"], seed + 19);
  if (last === "f1c4") return legalChoice(board, ["g8f6", "e7e6"], seed + 23);
  return legalChoice(board, ["g8f6", "e7e6", "c7c5", "f8e7"], seed + history.length);
}

function moveForQgd(board: Board, history: string[], seed: number): Move | null {
  if (history.length === 1) return legalChoice(board, ["d7d5"], seed);
  const last = history.at(-1);
  if (last === "c2c4") return legalChoice(board, ["e7e6", "g8f6"], seed + 5);
  if (last === "g1f3") return legalChoice(board, ["g8f6", "e7e6"], seed + 11);
  if (last === "b1c3") return legalChoice(board, ["g8f6", "f8e7"], seed + 13);
  if (last === "c1g5") return legalChoice(board, ["f8e7", "g8f6"], seed + 17);
  if (last === "e2e3") return legalChoice(board, ["f8e7", "g8f6"], seed + 19);
  return legalChoice(board, ["g8f6", "f8e7", "e7e6", "c7c5"], seed + history.length);
}

function moveForFourKnights(board: Board, history: string[], seed: number): Move | null {
  if (history.length === 1) return legalChoice(board, ["e7e5"], seed);
  const last = history.at(-1);
  if (last === "g1f3") return legalChoice(board, ["b8c6", "g8f6"], seed + 7);
  if (last === "b1c3") return legalChoice(board, ["g8f6", "b8c6"], seed + 11);
  if (last === "f1b5") return legalChoice(board, ["f8b4", "a7a6", "f8e7"], seed + 13);
  if (last === "d2d4") return legalChoice(board, ["e5d4", "f8b4"], seed + 17);
  if (last === "f3d4") return legalChoice(board, ["f8b4", "g8f6"], seed + 19);
  return legalChoice(board, ["g8f6", "b8c6", "f8b4", "f8e7"], seed + history.length);
}

function moveForBishops(board: Board, history: string[], seed: number): Move | null {
  if (history.length === 1) return legalChoice(board, ["e7e5"], seed);
  const last = history.at(-1);
  if (last === "f1c4") return legalChoice(board, ["g8f6", "f8c5", "b8c6"], seed + 7);
  if (last === "d2d3") return legalChoice(board, ["f8c5", "b8c6", "g8f6"], seed + 11);
  if (last === "g1f3") return legalChoice(board, ["b8c6", "f8c5", "g8f6"], seed + 13);
  if (last === "c2c3") return legalChoice(board, ["g8f6", "d7d5"], seed + 17);
  if (last === "e1g1") return legalChoice(board, ["f8e7", "d7d6", "a7a6"], seed + 19);
  return legalChoice(board, ["g8f6", "b8c6", "f8c5", "f8e7", "d7d6"], seed + history.length);
}

export function openingBookMove(
  board: Board,
  seed = Date.now(),
  history: string[] = [],
): { move: Move; opening: SwiftOpening } | null {
  if (history.length >= 12 || !history.length) return null;

  const opening = openingFamily(history, seed);
  if (!opening) return null;

  let move: Move | null = null;
  if (opening === "Reti") move = moveForReti(board, history, seed);
  else if (opening === "Queen's Gambit") move = moveForQueensGambit(board, history, seed);
  else if (opening === "Queen's Gambit Declined") move = moveForQgd(board, history, seed);
  else if (opening === "Four Knights") move = moveForFourKnights(board, history, seed);
  else move = moveForBishops(board, history, seed);

  return move ? { move, opening } : null;
}

export function openingNames(): SwiftOpening[] {
  return ["Reti", "Queen's Gambit", "Queen's Gambit Declined", "Four Knights", "Bishop's Opening"];
}

/** Representative first branch, used by UI/tests rather than as a forced line. */
export function openingLineMoves(name: SwiftOpening): string[] {
  switch (name) {
    case "Reti": return ["g1f3", "d7d5", "c2c4", "e7e6"];
    case "Queen's Gambit": return ["d2d4", "d7d5", "c2c4", "d5c4"];
    case "Queen's Gambit Declined": return ["d2d4", "d7d5", "c2c4", "e7e6"];
    case "Four Knights": return ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"];
    case "Bishop's Opening": return ["e2e4", "e7e5", "f1c4", "g8f6"];
  }
}
