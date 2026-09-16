import { Board, Color, Move, PieceType } from "./board";

export interface SearchOptions {
  depth?: number;
  timeMs?: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

type Bound = "exact" | "lower" | "upper";

interface TTEntry {
  depth: number;
  score: number;
  bound: Bound;
  move?: Move;
}

const INF = 1_000_000;
const MATE = 100_000;
const pieceValues: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const centerBonus = (square: number): number => {
  const file = square & 7;
  const rank = Math.floor(square / 8);
  const distance = Math.abs(3.5 - file) + Math.abs(3.5 - rank);
  return Math.round((7 - distance) * 4);
};

/**
 * Small, deterministic alpha-beta engine foundation.
 * Search is deliberately separated from the Board so the Board remains an
 * immutable rules object and can continue to serve both UI and engine code.
 */
export class SwiftEngine {
  private readonly table = new Map<string, TTEntry>();
  private nodes = 0;
  private deadline = Infinity;

  search(board: Board, options: SearchOptions = {}): SearchResult {
    const maxDepth = Math.max(1, Math.floor(options.depth ?? 4));
    this.nodes = 0;
    this.deadline = options.timeMs && options.timeMs > 0 ? Date.now() + options.timeMs : Infinity;

    const legal = board.legalMoves();
    if (legal.length === 0) {
      return { move: null, score: board.isInCheck(this.sideToMove(board)) ? -MATE : 0, depth: 0, nodes: this.nodes };
    }

    let bestMove = legal[0];
    let bestScore = -INF;
    let completedDepth = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        const result = this.root(board, depth);
        if (result.move) bestMove = result.move;
        bestScore = result.score;
        completedDepth = depth;
      } catch (error) {
        if (error !== TIMEOUT) throw error;
        break;
      }
    }

    return { move: bestMove, score: bestScore, depth: completedDepth, nodes: this.nodes };
  }

  evaluate(board: Board): number {
    return this.evaluateWhite(board) * (this.sideToMove(board) === "w" ? 1 : -1);
  }

  private root(board: Board, depth: number): { move: Move | null; score: number } {
    this.checkTime();
    const moves = this.orderMoves(board, board.legalMoves());
    let alpha = -INF;
    let bestScore = -INF;
    let bestMove: Move | null = null;

    for (const move of moves) {
      this.checkTime();
      const score = -this.negamax(board.makeMove(move), depth - 1, -INF, -alpha);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
    }

    return { move: bestMove, score: bestScore };
  }

  private negamax(board: Board, depth: number, alpha: number, beta: number): number {
    this.checkTime();
    this.nodes++;

    const legal = board.legalMoves();
    if (legal.length === 0) return board.isInCheck(this.sideToMove(board)) ? -MATE + this.nodes : 0;
    if (depth <= 0) return this.quiescence(board, alpha, beta);

    const key = this.key(board);
    const cached = this.table.get(key);
    const alphaOriginal = alpha;
    if (cached && cached.depth >= depth) {
      if (cached.bound === "exact") return cached.score;
      if (cached.bound === "lower") alpha = Math.max(alpha, cached.score);
      if (cached.bound === "upper") beta = Math.min(beta, cached.score);
      if (alpha >= beta) return cached.score;
    }

    let best = -INF;
    let bestMove: Move | undefined;
    for (const move of this.orderMoves(board, legal, cached?.move)) {
      const score = -this.negamax(board.makeMove(move), depth - 1, -beta, -alpha);
      if (score > best) {
        best = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }

    const bound: Bound = best <= alphaOriginal ? "upper" : best >= beta ? "lower" : "exact";
    this.table.set(key, { depth, score: best, bound, move: bestMove });
    return best;
  }

  private quiescence(board: Board, alpha: number, beta: number): number {
    this.checkTime();
    this.nodes++;
    const standPat = this.evaluate(board);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const captures = this.orderMoves(board, board.legalMoves().filter((move) => this.isCapture(board, move)));
    for (const move of captures) {
      this.checkTime();
      const score = -this.quiescence(board.makeMove(move), -beta, -alpha);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private orderMoves(board: Board, moves: Move[], hashMove?: Move): Move[] {
    return [...moves].sort((a, b) => this.moveScore(board, b, hashMove) - this.moveScore(board, a, hashMove));
  }

  private moveScore(board: Board, move: Move, hashMove?: Move): number {
    if (hashMove && move.uci() === hashMove.uci()) return 1_000_000;
    let score = 0;
    const moving = board.pieceAt(move.from);
    const captured = board.pieceAt(move.to);
    if (captured) score += 10_000 + pieceValues[captured[1]] - (moving ? pieceValues[moving[1]] : 0) / 10;
    if (move.enPassant) score += 10_000;
    if (move.promotion) score += 8_000 + pieceValues[move.promotion];
    if (move.castle) score += 100;
    return score;
  }

  private isCapture(board: Board, move: Move): boolean {
    return move.enPassant || board.pieceAt(move.to) !== null;
  }

  private evaluateWhite(board: Board): number {
    const fenBoard = board.toFEN().split(/\s+/)[0];
    let score = 0;
    let square = 56;
    for (const char of fenBoard) {
      if (char === "/") {
        square -= 16;
        continue;
      }
      if (/\d/.test(char)) {
        square += Number(char);
        continue;
      }
      const type = char.toLowerCase() as PieceType;
      const value = pieceValues[type];
      const sign = char === char.toUpperCase() ? 1 : -1;
      score += sign * value;
      if (type !== "k") {
        const orientedSquare = sign > 0 ? square : 63 - square;
        score += sign * centerBonus(orientedSquare);
      }
      square++;
    }

    const mobility = board.legalMoves().length;
    score += (board.toFEN().split(/\s+/)[1] === "w" ? mobility : -mobility) * 2;
    return score;
  }

  private sideToMove(board: Board): Color {
    return board.toFEN().split(/\s+/)[1] as Color;
  }

  private key(board: Board): string {
    return board.toFEN().split(/\s+/).slice(0, 4).join(" ");
  }

  private checkTime(): void {
    if (Date.now() > this.deadline) throw TIMEOUT;
  }
}

const TIMEOUT = Symbol("Swift search timeout");
