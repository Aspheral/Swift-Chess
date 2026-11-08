import { Board, Color, Move } from "./board";

/**
 * Human planning has two different modes:
 * 1. Real move selection: search the opponent's replies (elsewhere in Swift).
 * 2. Imagination: ask "what if I could develop this idea uninterrupted?"
 *
 * The second mode is useful for identifying a goal, NEVER for claiming a
 * forced variation, mate, or a favorable evaluation against best defense.
 */
export interface SoloPlanVision {
  rootMove: string;
  /** Legal own-side moves in a deliberately unopposed hypothetical sequence. */
  imaginedLine: string[];
  alternativeLine: string[];
  ownMovesImagined: number;
  kingPressureGain: number;
  possibleCheck: boolean;
  examinedMoves: number;
  /** This flag is always true: the opponent has NOT been consulted here. */
  opponentUnopposed: true;
}

export interface SoloPlanOptions {
  /** Includes the real first move. Clamped to [1, 5]. */
  maxOwnMoves?: number;
  /** Keep at most two competing visions at each imagined step. */
  beamWidth?: number;
  /** Hard cap per root move on candidate expansions, not engine nodes. */
  maxExpansions?: number;
}

interface Node {
  position: Board;
  line: string[];
  score: number;
  pressure: number;
  terminal: boolean;
  possibleCheck: boolean;
}

const opposite = (c: Color): Color => c === "w" ? "b" : "w";

function kingPressure(board: Board, attacker: Color): number {
  const defender = opposite(attacker);
  let king = -1;
  for (let square = 0; square < 64; square++) {
    if (board.pieceAt(square) === defender + "k") { king = square; break; }
  }
  if (king < 0) return 0;
  const kingFile = king & 7, kingRank = Math.floor(king / 8);
  let pressure = board.isSquareAttacked(king, attacker) ? 2 : 0;
  for (const df of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
    if (df === 0 && dr === 0) continue;
    const f = kingFile + df, r = kingRank + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    if (board.isSquareAttacked(r * 8 + f, attacker)) pressure++;
  }
  return pressure;
}

function plausibleFutureMove(board: Board, move: Move, own: Color, line: string[]): boolean {
  const moving = board.pieceAt(move.from);
  if (!moving || moving[0] !== own) return false;
  // No king wanderlust in a middlegame fantasy, and no mechanical undoing of
  // the previous imagined move. Actual king safety is checked by real search.
  if (moving[1] === "k" && board.toFEN().split("/").join("").replace(/[1-8]/g, "").length > 10) return false;
  const previous = line[line.length - 1];
  if (previous && previous.slice(2, 4) === move.uci().slice(0, 2) &&
    previous.slice(0, 2) === move.uci().slice(2, 4)) return false;

  const next = board.makeMove(move);
  const opponent = opposite(own);
  // Avoid fantasizing about moving an undefended major/minor piece directly
  // into an obvious capture unless it gives check. This is NOT a full SEE.
  const piece = next.pieceAt(move.to);
  if (piece && piece[1] !== "p" && next.isSquareAttacked(move.to, opponent) &&
    !next.isSquareAttacked(move.to, own) && !next.isInCheck(opponent)) return false;
  return true;
}

function nodeOrder(a: Node, b: Node): number {
  return b.score - a.score || b.line.length - a.line.length ||
    a.line.join(" ").localeCompare(b.line.join(" "));
}

function oneRootVision(
  board: Board,
  first: Move,
  options: Required<SoloPlanOptions>,
): SoloPlanVision {
  const own = board.turn(), opponent = opposite(own);
  const initialPressure = kingPressure(board, own);
  const afterFirst = board.makeMove(first);
  const initialCheck = afterFirst.isInCheck(opponent);
  const starting: Node = {
    position: initialCheck || afterFirst.isStalemate() || afterFirst.isCheckmate()
      ? afterFirst : afterFirst.makeNullMove(),
    line: [first.uci()],
    pressure: kingPressure(afterFirst, own),
    score: (kingPressure(afterFirst, own) - initialPressure) * 6,
    terminal: initialCheck || afterFirst.isStalemate() || afterFirst.isCheckmate(),
    possibleCheck: initialCheck,
  };

  let beam = [starting];
  const completed: Node[] = [starting];
  let examinedMoves = 0;

  for (let step = 1; step < options.maxOwnMoves; step++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (node.terminal) continue;
      for (const move of node.position.legalMoves()) {
        if (examinedMoves >= options.maxExpansions) break;
        examinedMoves++;
        if (!plausibleFutureMove(node.position, move, own, node.line)) continue;
        const after = node.position.makeMove(move);
        const check = after.isInCheck(opponent);
        const finished = check || after.isStalemate() || after.isCheckmate();
        const pressure = kingPressure(after, own);
        const gain = pressure - initialPressure;
        const improvement = Math.max(0, pressure - node.pressure);
        const imaginedLine = [...node.line, move.uci()];
        next.push({
          position: finished ? after : after.makeNullMove(),
          line: imaginedLine,
          pressure,
          score: gain * 6 + improvement * 1.5 + (check ? 5 : 0) +
            (imaginedLine.length - 1) * 0.15,
          terminal: finished,
          possibleCheck: check,
        });
      }
      if (examinedMoves >= options.maxExpansions) break;
    }
    if (!next.length) break;
    next.sort(nodeOrder);
    // Keep the top possible futures; a check is a *terminal* imagined event,
    // not permission to grant ourselves another turn while the king is checked.
    beam = next.slice(0, options.beamWidth);
    completed.push(...beam);
    if (examinedMoves >= options.maxExpansions) break;
  }

  completed.sort(nodeOrder);
  const best = completed[0];
  const alternative = completed.find((node) =>
    node.line.length > 1 && best.line.length > 1 && node.line[1] !== best.line[1]);
  return {
    rootMove: first.uci(),
    imaginedLine: [...best.line],
    alternativeLine: alternative ? [...alternative.line] : [],
    ownMovesImagined: best.line.length,
    kingPressureGain: Math.max(0, best.pressure - initialPressure),
    possibleCheck: best.possibleCheck,
    examinedMoves,
    opponentUnopposed: true,
  };
}

/**
 * Up to 5 own-side moves, capped expansions, up to two competing paths.
 * Each hypothetical opponent pass is deliberately illegal in real chess if
 * the opponent is in check, so such visions terminate at the checking move.
 * The function only accepts legal initial moves and returns no engine score.
 */
export function visualizeSoloPlans(
  board: Board,
  candidates: Move[],
  options: SoloPlanOptions = {},
): SoloPlanVision[] {
  const safeOptions: Required<SoloPlanOptions> = {
    maxOwnMoves: Math.max(1, Math.min(5, Math.floor(options.maxOwnMoves ?? 5))),
    beamWidth: Math.max(1, Math.min(2, Math.floor(options.beamWidth ?? 2))),
    maxExpansions: Math.max(1, Math.min(160, Math.floor(options.maxExpansions ?? 130))),
  };
  if (board.isInCheck(board.turn())) return [];
  const legal = new Map(board.legalMoves().map((move) => [move.uci(), move]));
  const seen = new Set<string>();
  return candidates.slice(0, 3).flatMap((move) => {
    const match = legal.get(move.uci());
    if (!match || seen.has(match.uci())) return [];
    seen.add(match.uci());
    return [oneRootVision(board, match, safeOptions)];
  });
}

/**
 * Only a small tie-break, not a static evaluation or a substitute for
 * opponent-aware search. The concrete selection layer applies its own
 * verified-score proximity filter before using any of these bonuses.
 */
export function soloPlanTieBreaks(visions: SoloPlanVision[]): Record<string, number> {
  if (!visions.length) return {};
  const strengths = visions.map((v) => v.kingPressureGain * 2 + (v.possibleCheck ? 1 : 0));
  const weakest = Math.min(...strengths);
  return Object.fromEntries(visions.map((vision, index) =>
    [vision.rootMove, Math.min(5, Math.max(0, strengths[index] - weakest))]));
}
