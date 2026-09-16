import { Board, Color, Move, PieceType } from "./board";

export interface SearchOptions { depth?: number; timeMs?: number; }
export interface SearchResult { move: Move | null; score: number; depth: number; nodes: number; }
type Bound = "exact" | "lower" | "upper";
interface TTEntry { depth: number; score: number; bound: Bound; move?: Move; }
const INF = 1_000_000;
const MATE = 100_000;
const pieceValues: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables are intentionally modest. Swift is meant to value
// useful human chess features without becoming a tactical-only calculator.
const PST: Record<Exclude<PieceType, "k">, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  5,  5,  0,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
};

export class SwiftEngine {
  private readonly table = new Map<string, TTEntry>();
  private nodes = 0;
  private deadline = Infinity;

  search(board: Board, options: SearchOptions = {}): SearchResult {
    const maxDepth = Math.max(1, Math.floor(options.depth ?? 4));
    this.nodes = 0;
    this.deadline = options.timeMs && options.timeMs > 0 ? Date.now() + options.timeMs : Infinity;
    const legal = board.legalMoves();
    if (legal.length === 0) return { move: null, score: board.isInCheck(this.sideToMove(board)) ? -MATE : 0, depth: 0, nodes: this.nodes };

    let bestMove = legal[0], bestScore = -INF, completedDepth = 0;
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
    let alpha = -INF, bestScore = -INF, bestMove: Move | null = null;
    for (const move of moves) {
      this.checkTime();
      const score = -this.negamax(board.makeMove(move), depth - 1, -INF, -alpha);
      if (score > bestScore) { bestScore = score; bestMove = move; }
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

    const key = this.key(board), cached = this.table.get(key), alphaOriginal = alpha;
    if (cached && cached.depth >= depth) {
      if (cached.bound === "exact") return cached.score;
      if (cached.bound === "lower") alpha = Math.max(alpha, cached.score);
      if (cached.bound === "upper") beta = Math.min(beta, cached.score);
      if (alpha >= beta) return cached.score;
    }

    let best = -INF, bestMove: Move | undefined;
    for (const move of this.orderMoves(board, legal, cached?.move)) {
      const score = -this.negamax(board.makeMove(move), depth - 1, -beta, -alpha);
      if (score > best) { best = score; bestMove = move; }
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
    const moving = board.pieceAt(move.from), captured = board.pieceAt(move.to);
    if (captured) score += 10_000 + pieceValues[captured[1] as PieceType] - (moving ? pieceValues[moving[1] as PieceType] : 0) / 10;
    if (move.enPassant) score += 10_000;
    if (move.promotion) score += 8_000 + pieceValues[move.promotion];
    if (move.castle) score += 100;
    return score;
  }

  private isCapture(board: Board, move: Move): boolean { return move.enPassant || board.pieceAt(move.to) !== null; }

  private evaluateWhite(board: Board): number {
    const fenBoard = board.toFEN().split(/\s+/)[0];
    let score = 0, square = 56;
    const pawns: number[] = [], whitePawns: number[] = [], blackPawns: number[] = [];
    let whiteBishops = 0, blackBishops = 0;

    for (const char of fenBoard) {
      if (char === "/") { square -= 16; continue; }
      if (/\d/.test(char)) { square += Number(char); continue; }
      const type = char.toLowerCase() as PieceType;
      const white = char === char.toUpperCase();
      const sign = white ? 1 : -1;
      score += sign * pieceValues[type];

      if (type !== "k") {
        const tableSquare = white ? square : 63 - square;
        score += sign * PST[type as Exclude<PieceType, "k">][tableSquare];
      }
      if (type === "p") {
        pawns.push(square);
        (white ? whitePawns : blackPawns).push(square);
      }
      if (type === "b") {
        if (white) whiteBishops++; else blackBishops++;
      }
      square++;
    }

    // Pawn structure: reward connected/advanced pawns, penalize doubled pawns.
    score += this.pawnStructure(whitePawns, 1);
    score -= this.pawnStructure(blackPawns, -1);

    // Bishop pair is a small, durable advantage rather than a tactical jackpot.
    if (whiteBishops >= 2) score += 28;
    if (blackBishops >= 2) score -= 28;

    // Mobility and king safety use legal moves, keeping the evaluation grounded
    // in the actual rules engine instead of introducing a second attack model.
    const fields = board.toFEN().split(/\s+/);
    const mobility = board.legalMoves().length;
    score += (fields[1] === "w" ? mobility : -mobility) * 2;

    score += this.kingSafety(board, "w");
    score += this.kingSafety(board, "b");
    void pawns;
    return score;
  }

  private pawnStructure(pawns: number[], sign: 1 | -1): number {
    const files = new Array<number>(8).fill(0);
    for (const square of pawns) files[square & 7]++;
    let score = 0;
    for (const count of files) {
      if (count > 1) score -= 14 * (count - 1);
    }
    for (const square of pawns) {
      const file = square & 7;
      const rank = Math.floor(square / 8);
      const adjacent = (file > 0 && files[file - 1] > 0) || (file < 7 && files[file + 1] > 0);
      if (adjacent) score += 5;
      const advance = sign === 1 ? rank : 7 - rank;
      if (advance >= 4) score += (advance - 3) * 4;
    }
    return score * sign;
  }

  private kingSafety(board: Board, color: Color): number {
    const fen = board.toFEN().split(/\s+/)[0];
    const target = color === "w" ? "K" : "k";
    let kingSquare = -1, square = 56;
    for (const char of fen) {
      if (char === "/") { square -= 16; continue; }
      if (/\d/.test(char)) { square += Number(char); continue; }
      if (char === target) kingSquare = square;
      square++;
    }
    if (kingSquare < 0) return 0;

    let score = 0;
    const file = kingSquare & 7;
    const rank = Math.floor(kingSquare / 8);
    const castling = board.toFEN().split(/\s+/)[2];
    const hasRights = color === "w" ? /K|Q/.test(castling) : /k|q/.test(castling);
    if (hasRights) score += color === "w" ? 8 : -8;
    const edgePenalty = (file === 0 || file === 7 ? 3 : 0) + (rank === 0 || rank === 7 ? 3 : 0);
    score += color === "w" ? -edgePenalty : edgePenalty;
    return score;
  }

  private sideToMove(board: Board): Color { return board.toFEN().split(/\s+/)[1] as Color; }
  private key(board: Board): string { return board.toFEN().split(/\s+/).slice(0, 4).join(" "); }
  private checkTime(): void { if (Date.now() > this.deadline) throw TIMEOUT; }
}

const TIMEOUT = Symbol("Swift search timeout");
