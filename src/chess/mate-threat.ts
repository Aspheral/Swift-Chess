import { Board, Color, Move } from "./board";

/**
 * Independent, bounded proof of a checking-sequence mate.
 *
 * "Mate in N" here means: the attacker can choose a checking move; every
 * legal defender response still permits a checking continuation; and a
 * final legal checking move checkmates. All defender replies are considered.
 * Non-checking attacking moves are intentionally not enumerated to bound
 * browser work. Consequently this proves threats it finds but can miss
 * quieter forced mating sequences. Search results are NOT used as proof.
 */
export interface CheckingMateProof {
  found: boolean;
  complete: boolean;
  nodes: number;
}

export interface CheckingMateLimits {
  maxNodes?: number;
  timeMs?: number;
}

const opposite = (color: Color): Color => color === "w" ? "b" : "w";

export function proveCheckingMate(
  position: Board,
  attacker: Color,
  attackerMoves: 1 | 2 | 3,
  limits: CheckingMateLimits = {},
): CheckingMateProof {
  const maxNodes = Math.max(1, Math.floor(limits.maxNodes ?? 6000));
  const deadline = Date.now() + Math.max(1, Math.floor(limits.timeMs ?? 70));
  const memo = new Map<string, boolean>();
  let nodes = 0;
  let complete = true;

  const prove = (board: Board, remaining: number): boolean => {
    nodes++;
    // An incomplete proof never justifies changing Swift's selected move.
    if (nodes > maxNodes || (nodes % 32 === 0 && Date.now() >= deadline)) {
      complete = false;
      return false;
    }
    const key = board.searchKey() + "|" + board.halfmoveClock() + "|" + remaining;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const side = board.turn();
    const inCheck = board.isInCheck(side);
    const moves = board.legalMoves();
    if (!moves.length) {
      const mate = inCheck && side !== attacker;
      memo.set(key, mate);
      return mate;
    }
    if (board.halfmoveClock() >= 100 || remaining === 0) return false;

    let found: boolean;
    if (side === attacker) {
      // Proving only checking moves ensures a sound but conservative result.
      // Checking every nonforcing move at five plies would freeze the page.
      found = false;
      for (const move of moves) {
        if (!complete) break;
        const child = board.makeMove(move);
        if (!child.isInCheck(opposite(attacker))) continue;
        if (prove(child, remaining - 1)) { found = true; break; }
      }
    } else {
      // EVERY defender reply must fail; a single escape refutes forced mate.
      found = true;
      for (const move of moves) {
        if (!complete || !prove(board.makeMove(move), remaining)) {
          found = false;
          break;
        }
      }
    }
    if (complete) memo.set(key, found);
    return found;
  };

  if (position.turn() !== attacker) return { found: false, complete: true, nodes: 0 };
  const found = prove(position, attackerMoves);
  return { found: found && complete, complete, nodes };
}

/** Does Swift's proposed move permit a short forced *checking* mating line? */
export function allowsCheckingMate(
  board: Board,
  move: Move,
  attackerMoves: 2 | 3,
  limits: CheckingMateLimits = {},
): CheckingMateProof {
  const child = board.makeMove(move);
  if (child.halfmoveClock() >= 100) return { found: false, complete: true, nodes: 0 };
  return proveCheckingMate(child, child.turn(), attackerMoves, limits);
}

export interface CheckingMateAvoidance {
  move: Move;
  previousMove: Move;
  attackerMoves: 2 | 3;
}

/**
 * Final tactical gate. Unlike static material guards, it changes a move only
 * after proving a concrete forced checking mate against the proposed move.
 * Check alternative moves too, or the "rescue" could walk into another mate.
 */
export function avoidShortCheckingMate(
  board: Board,
  proposed: Move,
  preferredAlternatives: Move[] = [],
  evaluate?: (position: Board) => number,
): CheckingMateAvoidance | null {
  const firstThreat = allowsCheckingMate(board, proposed, 2, { maxNodes: 4500, timeMs: 55 });
  const secondThreat = !firstThreat.found && firstThreat.complete
    ? allowsCheckingMate(board, proposed, 3, { maxNodes: 9000, timeMs: 120 })
    : firstThreat;
  if (!secondThreat.found && !firstThreat.found) return null;
  const attackMoves: 2 | 3 = firstThreat.found ? 2 : 3;

  const legal = board.legalMoves();
  const legalByUci = new Map(legal.map((move) => [move.uci(), move]));
  const keys = [...new Set([
    ...preferredAlternatives.map((move) => move.uci()),
    ...legal.map((move) => move.uci()),
  ])].filter((key) => key !== proposed.uci());
  const preferred = new Set(preferredAlternatives.map((move) => move.uci()));
  let best: { move: Move; score: number } | null = null;

  // An emergency mating net merits some extra work, but never unbounded work.
  const deadline = Date.now() + 500;
  let inspected = 0;
  for (const key of keys) {
    if (inspected++ >= 14 || Date.now() >= deadline) break;
    const candidate = legalByUci.get(key);
    if (!candidate) continue;
    const next = board.makeMove(candidate);
    if (!next.isCheckmate()) {
      const proof = allowsCheckingMate(board, candidate, 3, { maxNodes: 6500, timeMs: 75 });
      if (!proof.complete || proof.found) continue;
    }
    const score = (evaluate ? -evaluate(next) : 0) +
      (preferred.has(key) ? 30 : 0);
    if (!best || score > best.score) best = { move: candidate, score };
  }
  return best ? { move: best.move, previousMove: proposed, attackerMoves: attackMoves } : null;
}
