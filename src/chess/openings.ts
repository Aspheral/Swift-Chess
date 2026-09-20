import { Board, Move } from "./board";
import { seededRandom } from "./random";

export type SwiftOpening = "Reti" | "Queen's Gambit" | "Queen's Gambit Declined" | "Four Knights" | "Bishop's Opening";

function legalChoice(board: Board, choices: string[], seed: number): Move | null {
  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const available = choices.filter((uci) => legal.has(uci));
  if (!available.length) return null;
  const index = Math.min(available.length - 1, Math.floor(seededRandom(seed) * available.length));
  return legal.get(available[index]) ?? null;
}

function sideToMove(board: Board): "w" | "b" {
  return board.turn();
}

function openingFamily(history: string[], seed: number): SwiftOpening | null {
  const first = history[0];
  if (first === "g1f3" || first === "c2c4") return "Reti";
  if (first === "d2d4") {
    return seededRandom(seed) < 0.62 ? "Queen's Gambit Declined" : "Queen's Gambit";
  }
  if (first === "e2e4") {
    // Once White has shown the bishop move or the four-knights setup, use the
    // position rather than the seed. Before that point the two families share
    // the natural ...e5 response.
    if (history.includes("f1c4")) return "Bishop's Opening";
    if (history.includes("b1c3") || history.includes("g1f3")) return "Four Knights";
    return seededRandom(seed) < 0.52 ? "Four Knights" : "Bishop's Opening";
  }
  return null;
}

function moveForReti(board: Board, history: string[], seed: number): Move | null {
  const last = history.at(-1);
  if (sideToMove(board) === "b") {
    if (history.length === 1) return legalChoice(board, ["d7d5", "g8f6"], seed);
    if (last === "c2c4") return legalChoice(board, ["e7e6", "c7c6", "d5d4"], seed + 11);
    if (last === "g2g3") return legalChoice(board, ["g8f6", "e7e6"], seed + 17);
    if (last === "f1g2") return legalChoice(board, ["f8e7", "c7c5", "g8f6"], seed + 19);
    if (last === "d2d4") return legalChoice(board, ["g8f6", "e7e6", "c7c5"], seed + 23);
    if (last === "b1c3") return legalChoice(board, ["g8f6", "e7e6"], seed + 29);
    return legalChoice(board, ["g8f6", "f8e7", "e7e6", "c7c5"], seed + history.length);
  }
  if (last === "d7d5") return legalChoice(board, ["c2c4", "g2g3", "d2d4", "f1g2"], seed + 3);
  if (last === "e7e6" || last === "c7c6") return legalChoice(board, ["g2g3", "c2c4", "d2d4", "f1g2"], seed + 5);
  if (last === "g8f6") return legalChoice(board, ["g2g3", "c2c4", "d2d4", "f1g2"], seed + 7);
  return legalChoice(board, ["f1g2", "c2c4", "g2g3", "d2d4", "b1c3"], seed + history.length);
}

function moveForQueensGambit(board: Board, history: string[], seed: number): Move | null {
  const last = history.at(-1);
  if (sideToMove(board) === "b") {
    if (history.length === 1) return legalChoice(board, ["d7d5"], seed);
    if (last === "c2c4") return legalChoice(board, ["d5c4"], seed + 7);
    if (last === "g1f3") return legalChoice(board, ["g8f6", "e7e6"], seed + 13);
    if (last === "e2e3") return legalChoice(board, ["e7e6", "g8f6"], seed + 17);
    if (last === "c1g5") return legalChoice(board, ["g8f6", "f8e7"], seed + 19);
    if (last === "f1c4") return legalChoice(board, ["g8f6", "e7e6"], seed + 23);
    return legalChoice(board, ["g8f6", "e7e6", "c7c5", "f8e7"], seed + history.length);
  }
  if (last === "d7d5") return legalChoice(board, ["c2c4", "g1f3", "c1f4"], seed + 3);
  if (last === "d5c4") return legalChoice(board, ["g1f3", "e2e3", "e2e4"], seed + 5);
  if (last === "g8f6") return legalChoice(board, ["e2e3", "c1f4", "b1c3"], seed + 7);
  return legalChoice(board, ["g1f3", "e2e3", "b1c3", "c1f4"], seed + history.length);
}

function moveForQgd(board: Board, history: string[], seed: number): Move | null {
  const last = history.at(-1);
  if (sideToMove(board) === "b") {
    if (history.length === 1) return legalChoice(board, ["d7d5"], seed);
    if (last === "c2c4") return legalChoice(board, ["e7e6", "g8f6"], seed + 5);
    if (last === "g1f3") return legalChoice(board, ["g8f6", "e7e6"], seed + 11);
    if (last === "b1c3") return legalChoice(board, ["g8f6", "f8e7"], seed + 13);
    if (last === "c1g5") return legalChoice(board, ["f8e7", "g8f6"], seed + 17);
    if (last === "e2e3") return legalChoice(board, ["f8e7", "g8f6"], seed + 19);
    return legalChoice(board, ["g8f6", "f8e7", "c7c5"], seed + history.length);
  }
  if (last === "d7d5") return legalChoice(board, ["c2c4", "g1f3", "c1f4"], seed + 3);
  if (last === "e7e6") return legalChoice(board, ["g1f3", "b1c3", "c1g5"], seed + 5);
  if (last === "g8f6") return legalChoice(board, ["g1f3", "b1c3", "c1g5"], seed + 7);
  return legalChoice(board, ["g1f3", "b1c3", "c1g5", "e2e3"], seed + history.length);
}

function moveForFourKnights(board: Board, history: string[], seed: number): Move | null {
  const last = history.at(-1);
  if (sideToMove(board) === "b") {
    if (history.length === 1) return legalChoice(board, ["e7e5"], seed);
    if (last === "g1f3") return legalChoice(board, ["b8c6", "g8f6"], seed + 7);
    if (last === "b1c3") return legalChoice(board, ["g8f6", "b8c6"], seed + 11);
    if (last === "f1b5") return legalChoice(board, ["f8b4", "a7a6", "f8e7"], seed + 13);
    if (last === "d2d4") return legalChoice(board, ["e5d4", "f8b4"], seed + 17);
    if (last === "f3d4") return legalChoice(board, ["f8b4", "g8f6"], seed + 19);
    return legalChoice(board, ["g8f6", "b8c6", "f8b4", "f8e7"], seed + history.length);
  }
  if (last === "e7e5") return legalChoice(board, ["g1f3", "b1c3"], seed + 3);
  if (last === "b8c6") return legalChoice(board, ["b1c3", "f1b5", "f1c4"], seed + 5);
  if (last === "g8f6") return legalChoice(board, ["b1c3", "d2d4", "f1b5"], seed + 7);
  return legalChoice(board, ["b1c3", "f1b5", "f1c4", "d2d4"], seed + history.length);
}

function moveForBishops(board: Board, history: string[], seed: number): Move | null {
  const last = history.at(-1);
  if (sideToMove(board) === "b") {
    if (history.length === 1) return legalChoice(board, ["e7e5"], seed);
    if (last === "f1c4") return legalChoice(board, ["g8f6", "b8c6", "f8c5"], seed + 7);
    if (last === "d2d3") return legalChoice(board, ["f8c5", "b8c6", "c7c6"], seed + 11);
    if (last === "g1f3") return legalChoice(board, ["b8c6", "f8c5", "g8f6"], seed + 13);
    if (last === "c2c3") return legalChoice(board, ["g8f6", "d7d5"], seed + 17);
    if (last === "e1g1") return legalChoice(board, ["f8e7", "d7d6", "a7a6"], seed + 19);
    return legalChoice(board, ["g8f6", "b8c6", "f8c5", "f8e7", "d7d6"], seed + history.length);
  }
  if (last === "e7e5") return legalChoice(board, ["f1c4", "g1f3"], seed + 3);
  if (last === "g8f6") return legalChoice(board, ["d2d3", "b1c3", "d2d4"], seed + 5);
  if (last === "b8c6") return legalChoice(board, ["g1f3", "b1c3", "d2d3"], seed + 7);
  return legalChoice(board, ["g1f3", "b1c3", "d2d3", "c2c3"], seed + history.length);
}

export function openingBookMove(
  board: Board,
  seed = Date.now(),
  history: string[] = [],
): { move: Move; opening: SwiftOpening } | null {
  if (history.length >= 12) return null;

  if (!history.length && sideToMove(board) === "w") {
    const roll = seededRandom(seed);
    if (roll < 0.4) {
      const move = legalChoice(board, ["g1f3"], seed);
      return move ? { move, opening: "Reti" } : null;
    }
    if (roll < 0.75) {
      const move = legalChoice(board, ["d2d4"], seed);
      return move ? { move, opening: roll < 0.62 ? "Queen's Gambit Declined" : "Queen's Gambit" } : null;
    }
    const move = legalChoice(board, ["e2e4"], seed);
    return move ? { move, opening: roll < 0.88 ? "Four Knights" : "Bishop's Opening" } : null;
  }

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

export function openingLineMoves(name: SwiftOpening): string[] {
  switch (name) {
    case "Reti": return ["g1f3", "d7d5", "c2c4", "e7e6"];
    case "Queen's Gambit": return ["d2d4", "d7d5", "c2c4", "d5c4"];
    case "Queen's Gambit Declined": return ["d2d4", "d7d5", "c2c4", "e7e6"];
    case "Four Knights": return ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"];
    case "Bishop's Opening": return ["e2e4", "e7e5", "f1c4", "g8f6"];
  }
}
