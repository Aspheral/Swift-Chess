import { Board, Color, Move, PieceType } from "./board";
import { canDeltaPrune } from "./tactics";

export interface SearchOptions { depth?: number; timeMs?: number; }
export interface SearchResult { move: Move | null; score: number; depth: number; nodes: number; pv?: Move[]; }
type Bound = "exact" | "lower" | "upper";
interface TTEntry { depth: number; score: number; bound: Bound; move?: Move; }
const INF = 1_000_000;
const MATE = 100_000;
const MAX_PV = 32;
const pieceValues: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const PST: Record<Exclude<PieceType, "k">, number[]> = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,5,0,0,0,0,0,0,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
};

for (const [piece, table] of Object.entries(PST)) {
  if (table.length !== 64) throw new Error(`Invalid ${piece} piece-square table: expected 64 entries, got ${table.length}`);
}

export class SwiftEngine {
  private readonly table = new Map<string, TTEntry>();
  private readonly killers: Array<[string | null, string | null]> = [];
  private readonly history = new Map<string, number>();
  private nodes = 0;
  private deadline = Infinity;

  search(board: Board, options: SearchOptions = {}): SearchResult {
    const maxDepth = Math.max(1, Math.floor(options.depth ?? 4));
    this.nodes = 0;
    this.deadline = options.timeMs && options.timeMs > 0 ? Date.now() + options.timeMs : Infinity;
    const legal = board.legalMoves();
    if (legal.length === 0) return { move: null, score: board.isInCheck(this.sideToMove(board)) ? -MATE : 0, depth: 0, nodes: this.nodes, pv: [] };
    let bestMove = legal[0], bestScore = -INF, completedDepth = 0, bestPv: Move[] = [bestMove];
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        const result = this.root(
          board,
          depth,
          completedDepth > 0 ? bestScore : undefined,
          completedDepth > 0 ? bestMove : undefined,
        );
        if (result.move) bestMove = result.move;
        bestScore = result.score;
        bestPv = result.pv;
        completedDepth = depth;
      } catch (error) {
        if (error !== TIMEOUT) throw error;
        break;
      }
    }
    return { move: bestMove, score: bestScore, depth: completedDepth, nodes: this.nodes, pv: bestPv };
  }

  evaluate(board: Board): number { return this.evaluateWhite(board) * (this.sideToMove(board) === "w" ? 1 : -1); }

  private root(
    board: Board,
    depth: number,
    previousScore?: number,
    previousMove?: Move,
  ): { move: Move | null; score: number; pv: Move[] } {
    this.checkTime();
    let alpha = -INF, beta = INF;
    if (previousScore !== undefined && depth >= 4) {
      const window = 40;
      alpha = previousScore - window;
      beta = previousScore + window;
    }
    let result = this.rootWindow(board, depth, alpha, beta, previousMove);
    if (result.score <= alpha || result.score >= beta) {
      result = this.rootWindow(board, depth, -INF, INF, previousMove);
    }
    return result;
  }

  private rootWindow(
    board: Board,
    depth: number,
    alpha: number,
    beta: number,
    hashMove?: Move,
  ): { move: Move | null; score: number; pv: Move[] } {
    const moves = this.orderMoves(board, board.legalMoves(), hashMove, 0);
    let bestScore = -INF, bestMove: Move | null = null, bestPv: Move[] = [];

    for (let index = 0; index < moves.length; index++) {
      this.checkTime();
      const move = moves[index];
      const child = board.makeMove(move);
      let childResult: { score: number; pv: Move[] };

      if (index === 0) {
        childResult = this.negamax(child, depth - 1, -beta, -alpha, 1);
      } else {
        childResult = this.negamax(child, depth - 1, -alpha - 1, -alpha, 1);
      }
      let score = -childResult.score;

      if (index > 0 && score > alpha && score < beta) {
        childResult = this.negamax(child, depth - 1, -beta, -alpha, 1);
        score = -childResult.score;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        bestPv = [move, ...childResult.pv];
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    return { move: bestMove, score: bestScore, pv: bestPv.slice(0, MAX_PV) };
  }

  private negamax(board: Board, depth: number, alpha: number, beta: number, ply: number, allowNullMove = true): { score: number; pv: Move[] } {
    this.checkTime();
    this.nodes++;
    const inCheck = board.isInCheck(this.sideToMove(board));
    if (depth <= 0 && !inCheck) return { score: this.quiescence(board, alpha, beta, ply), pv: [] };
    const extension = inCheck && depth > 0 ? 1 : 0;
    const effectiveDepth = depth + extension;
    if (effectiveDepth <= 0) return { score: this.quiescence(board, alpha, beta, ply), pv: [] };

    const key = this.key(board), cached = this.table.get(key), alphaOriginal = alpha;
    if (cached && cached.depth >= effectiveDepth) {
      const cachedScore = this.scoreFromTable(cached.score, ply);
      if (cached.bound === "exact") return { score: cachedScore, pv: cached.move ? [cached.move] : [] };
      if (cached.bound === "lower") alpha = Math.max(alpha, cachedScore);
      if (cached.bound === "upper") beta = Math.min(beta, cachedScore);
      if (alpha >= beta) return { score: cachedScore, pv: cached.move ? [cached.move] : [] };
    }

    const legal = board.legalMoves();
    if (legal.length === 0) return { score: inCheck ? -MATE + ply : 0, pv: [] };

    if (allowNullMove && effectiveDepth >= 3 && !inCheck && beta < MATE - 1_000 && this.canNullMove(board)) {
      const reduction = effectiveDepth >= 7 ? 3 : 2;
      const nullDepth = Math.max(0, effectiveDepth - 1 - reduction);
      const nullResult = this.negamax(board.makeNullMove(), nullDepth, -beta, -beta + 1, ply + 1, false);
      const nullScore = -nullResult.score;
      if (nullScore >= beta) {
        if (effectiveDepth >= 6) {
          const verification = this.negamax(board, effectiveDepth - 1, alpha, beta, ply, false);
          if (verification.score >= beta) return verification;
        } else {
          return { score: nullScore, pv: [] };
        }
      }
    }

    let best = -INF, bestMove: Move | undefined, bestPv: Move[] = [];
    let moveIndex = 0;
    for (const move of this.orderMoves(board, legal, cached?.move, ply)) {
      this.checkTime();
      const child = board.makeMove(move);
      const opponent = this.sideToMove(child);
      const forcing = this.isCapture(board, move) || !!move.promotion || child.isInCheck(opponent);
      const quiet = !forcing;
      const canReduce = effectiveDepth >= 3 && moveIndex >= 3 && quiet && !inCheck;
      let score: number;
      let childResult: { score: number; pv: Move[] };
      if (canReduce) {
        const reduction = effectiveDepth >= 6 && moveIndex >= 6 ? 2 : 1;
        childResult = this.negamax(child, Math.max(1, effectiveDepth - 1 - reduction), -alpha - 1, -alpha, ply + 1);
        score = -childResult.score;
        if (score > alpha) { childResult = this.negamax(child, effectiveDepth - 1, -beta, -alpha, ply + 1); score = -childResult.score; }
      } else if (moveIndex === 0) {
        childResult = this.negamax(child, effectiveDepth - 1, -beta, -alpha, ply + 1);
        score = -childResult.score;
      } else {
        childResult = this.negamax(child, effectiveDepth - 1, -alpha - 1, -alpha, ply + 1);
        score = -childResult.score;
        if (score > alpha && score < beta) {
          childResult = this.negamax(child, effectiveDepth - 1, -beta, -alpha, ply + 1);
          score = -childResult.score;
        }
      }
      if (score > best) { best = score; bestMove = move; bestPv = [move, ...childResult.pv]; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) { if (quiet) this.recordKiller(move, ply, effectiveDepth); break; }
      moveIndex++;
    }
    const bound: Bound = best <= alphaOriginal ? "upper" : best >= beta ? "lower" : "exact";
    this.table.set(key, { depth: effectiveDepth, score: this.scoreToTable(best, ply), bound, move: bestMove });
    return { score: best, pv: bestPv.slice(0, MAX_PV) };
  }

  private quiescence(board: Board, alpha: number, beta: number, ply: number): number {
    this.checkTime();
    this.nodes++;
    const side = this.sideToMove(board);
    const inCheck = board.isInCheck(side);
    const legal = board.legalMoves();
    if (legal.length === 0) return inCheck ? -MATE + ply : 0;
    if (inCheck) {
      let best = -INF;
      for (const move of this.orderMoves(board, legal, undefined, 0)) {
        const score = -this.quiescence(board.makeMove(move), -beta, -alpha, ply + 1);
        best = Math.max(best, score); alpha = Math.max(alpha, score);
        if (alpha >= beta) break;
      }
      return best;
    }
    const standPat = this.evaluate(board);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    const tactical = legal.filter((move) => this.isCapture(board, move) || !!move.promotion);
    const captures = this.orderMoves(board, tactical, undefined, 0);
    for (const move of captures) {
      this.checkTime();
      const child = board.makeMove(move);
      const checking = child.isInCheck(this.sideToMove(child));
      if (!checking && canDeltaPrune(board, move, standPat, alpha)) continue;
      const score = -this.quiescence(child, -beta, -alpha, ply + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
  private orderMoves(board: Board, moves: Move[], hashMove?: Move, ply = 0): Move[] {
    return moves
      .map((move) => ({ move, score: this.moveScore(board, move, hashMove, ply) }))
      .sort((a, b) => b.score - a.score)
      .map(({ move }) => move);
  }

  private moveScore(board: Board, move: Move, hashMove?: Move, ply = 0): number {
    if (hashMove && move.uci() === hashMove.uci()) return 2_000_000;
    let score = 0;
    const moving = board.pieceAt(move.from), captured = board.pieceAt(move.to);
    if (move.promotion) score += 900_000 + pieceValues[move.promotion];
    if (move.enPassant) score += 1_000_000 + 1_000;
    if (captured && moving) {
      const victim = pieceValues[captured[1] as PieceType];
      const attacker = pieceValues[moving[1] as PieceType];
      score += 1_000_000 + victim * 10 - attacker;
    }
    if (move.castle) score += 100;
    if (!this.isCapture(board, move) && !move.promotion) {
      const key = move.uci();
      const [killer1, killer2] = this.killers[ply] ?? [null, null];
      if (key === killer1) score += 800_000;
      else if (key === killer2) score += 700_000;
      score += this.history.get(key) ?? 0;
    }
    return score;
  }

  private givesCheck(board: Board, move: Move): boolean {
    const child = board.makeMove(move);
    return child.isInCheck(this.sideToMove(child));
  }

  private recordKiller(move: Move, ply: number, depth: number): void {
    const key = move.uci(); const pair = this.killers[ply] ?? [null, null];
    if (pair[0] === key) return;
    this.killers[ply] = [key, pair[0]];
    this.history.set(key, Math.min(200_000, (this.history.get(key) ?? 0) + depth * depth));
  }

  private isCapture(board: Board, move: Move): boolean { return move.enPassant || board.pieceAt(move.to) !== null; }

  private canNullMove(board: Board): boolean {
    let nonPawnPieces = 0;
    let rooksQueens = 0;
    for (let square = 0; square < 64; square++) {
      const piece = board.pieceAt(square);
      if (!piece || piece[1] === "k" || piece[1] === "p") continue;
      nonPawnPieces++;
      if (piece[1] === "r" || piece[1] === "q") rooksQueens++;
    }
    if (nonPawnPieces <= 2) return false;
    if (rooksQueens === 0 && nonPawnPieces <= 4) return false;
    return true;
  }

  private evaluateWhite(board: Board): number {
    const castling = board.castlingRights();
    let score = 0;
    const whitePawns: number[] = [], blackPawns: number[] = [];
    const whiteRooks: number[] = [], blackRooks: number[] = [];
    let whiteBishops = 0, blackBishops = 0;
    let whiteKing = -1, blackKing = -1;
    let totalPieces = 0, queens = 0;

    for (let square = 0; square < 64; square++) {
      const piece = board.pieceAt(square);
      if (!piece) continue;
      const white = piece[0] === "w";
      const type = piece[1] as PieceType;
      totalPieces++;
      if (type === "q") queens++;
      const sign = white ? 1 : -1;
      score += sign * pieceValues[type];

      if (type !== "k") {
        const tableSquare = white ? (square ^ 56) : square;
        score += sign * PST[type as Exclude<PieceType, "k">][tableSquare];
      } else if (white) {
        whiteKing = square;
      } else {
        blackKing = square;
      }

      if (type === "p") (white ? whitePawns : blackPawns).push(square);
      if (type === "r") (white ? whiteRooks : blackRooks).push(square);
      if (type === "b") white ? whiteBishops++ : blackBishops++;
    }

    score += this.pawnStructure(whitePawns, "w", blackPawns);
    score -= this.pawnStructure(blackPawns, "b", whitePawns);
    if (whiteBishops >= 2) score += 28;
    if (blackBishops >= 2) score -= 28;
    score += this.rookActivity(whiteRooks, "w", whitePawns, blackPawns);
    score -= this.rookActivity(blackRooks, "b", blackPawns, whitePawns);
    score += this.kingSafetyFromSquare(board, whiteKing, "w", castling, totalPieces, queens > 0);
    score += this.kingSafetyFromSquare(board, blackKing, "b", castling, totalPieces, queens > 0);
    return score;
  }

  private pawnStructure(pawns: number[], color: Color, enemyPawns: number[]): number {
    const files = new Array<number>(8).fill(0);
    for (const square of pawns) files[square & 7]++;
    let score = 0;
    for (const count of files) if (count > 1) score -= 14 * (count - 1);

    const passedBonus = [0, 8, 20, 45, 100, 180, 0];
    for (const square of pawns) {
      const file = square & 7;
      const rank = Math.floor(square / 8);
      const connected = (file > 0 && files[file - 1] > 0) || (file < 7 && files[file + 1] > 0);
      if (connected) score += 6;
      else score -= 8;

      const advance = color === "w" ? Math.max(0, rank - 1) : Math.max(0, 6 - rank);
      if (advance > 2) score += (advance - 2) * 4;

      const passed = !enemyPawns.some((enemySquare) => {
        const enemyFile = enemySquare & 7;
        if (Math.abs(enemyFile - file) > 1) return false;
        const enemyRank = Math.floor(enemySquare / 8);
        return color === "w" ? enemyRank > rank : enemyRank < rank;
      });
      if (passed) {
        score += passedBonus[Math.min(6, advance)] ?? 0;
        if (connected && advance >= 3) score += 18;
      }
    }
    return score;
  }

  private rookActivity(
    rooks: number[],
    color: Color,
    ownPawns: number[],
    enemyPawns: number[],
  ): number {
    const ownFiles = new Set(ownPawns.map((square) => square & 7));
    const enemyFiles = new Set(enemyPawns.map((square) => square & 7));
    let score = 0;
    for (const square of rooks) {
      const file = square & 7;
      const rank = Math.floor(square / 8);
      if (!ownFiles.has(file)) score += 10;
      if (!ownFiles.has(file) && !enemyFiles.has(file)) score += 8;
      if (rank === (color === "w" ? 6 : 1)) score += 12;
    }
    return score;
  }

  private kingSafetyFromSquare(
    board: Board,
    kingSquare: number,
    color: Color,
    castling: string,
    totalPieces: number,
    queensPresent: boolean,
  ): number {
    if (kingSquare < 0) return 0;
    const file = kingSquare & 7;
    const rank = Math.floor(kingSquare / 8);
    const homeRank = color === "w" ? 0 : 7;
    const kingSideRight = color === "w" ? castling.includes("K") : castling.includes("k");
    const queenSideRight = color === "w" ? castling.includes("Q") : castling.includes("q");
    const rights = Number(kingSideRight) + Number(queenSideRight);
    const castled = color === "w"
      ? kingSquare === 6 || kingSquare === 2
      : kingSquare === 62 || kingSquare === 58;
    const middlegame = queensPresent && totalPieces >= 14;

    let score = castled ? 30 : rights * (middlegame ? 10 : 4);
    if (middlegame) {
      const direction = color === "w" ? 8 : -8;
      for (const df of [-1, 0, 1]) {
        const shieldFile = file + df;
        if (shieldFile < 0 || shieldFile > 7) continue;
        const square = kingSquare + direction + df;
        if (square >= 0 && square < 64 && board.pieceAt(square) === `${color}p`) score += 4;
      }
      if (!castled && rights === 0 && rank === homeRank && (file === 3 || file === 4)) score -= 18;
      if (rank !== homeRank && !castled) score -= 10;
    } else if (totalPieces <= 10) {
      const centerDistance = Math.abs(file - 3.5) + Math.abs(rank - 3.5);
      score += Math.round((7 - centerDistance) * 4);
    }
    return color === "w" ? score : -score;
  }

  private scoreToTable(score: number, ply: number): number {
    if (score >= MATE - 1_000) return score + ply;
    if (score <= -MATE + 1_000) return score - ply;
    return score;
  }

  private scoreFromTable(score: number, ply: number): number {
    if (score >= MATE - 1_000) return score - ply;
    if (score <= -MATE + 1_000) return score + ply;
    return score;
  }

  private sideToMove(board: Board): Color { return board.turn(); }
  private key(board: Board): string { return board.searchKey(); }
  private checkTime(): void { if (Date.now() > this.deadline) throw TIMEOUT; }
}

const TIMEOUT = Symbol("Swift search timeout");
