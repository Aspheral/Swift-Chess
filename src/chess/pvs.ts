import { Board, Move } from "./board";
import { SwiftEngine as BaseSwiftEngine, SearchOptions, SearchResult } from "./engine";

/**
 * Principal Variation Search wrapper around Swift's alpha-beta core.
 * Later moves use a null window and are re-searched only when they raise alpha.
 */
export class PvsSwiftEngine extends BaseSwiftEngine {
  override search(board: Board, options: SearchOptions = {}): SearchResult {
    // Keep the established timeout path until PVS gets its own interruption-safe root.
    if (options.timeMs && options.timeMs > 0) return super.search(board, options);

    const depth = Math.max(1, Math.floor(options.depth ?? 4));
    const state = this as unknown as {
      nodes: number;
      deadline: number;
      table: Map<string, unknown>;
      orderMoves: (board: Board, moves: Move[], hashMove?: Move, ply?: number) => Move[];
      negamax: (board: Board, depth: number, alpha: number, beta: number, ply: number, allowNullMove?: boolean) => { score: number; pv: Move[] };
    };
    state.nodes = 0;
    state.deadline = Infinity;

    const legal = board.legalMoves();
    if (legal.length === 0) {
      const side = board.toFEN().split(/\s+/)[1] as "w" | "b";
      const inCheck = board.isInCheck(side);
      return { move: null, score: inCheck ? -100_000 : 0, depth: 0, nodes: state.nodes, pv: [] };
    }

    let bestMove = legal[0];
    let bestScore = -1_000_000;
    let bestPv: Move[] = [bestMove];

    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      state.table.clear();
      const result = this.pvsRoot(board, currentDepth, state);
      if (result.move) bestMove = result.move;
      bestScore = result.score;
      bestPv = result.pv;
    }

    return { move: bestMove, score: bestScore, depth, nodes: state.nodes, pv: bestPv };
  }

  private pvsRoot(
    board: Board,
    depth: number,
    state: {
      orderMoves: (board: Board, moves: Move[], hashMove?: Move, ply?: number) => Move[];
      negamax: (board: Board, depth: number, alpha: number, beta: number, ply: number, allowNullMove?: boolean) => { score: number; pv: Move[] };
    },
  ): { move: Move | null; score: number; pv: Move[] } {
    const moves = state.orderMoves(board, board.legalMoves(), undefined, 0);
    let alpha = -1_000_000;
    const beta = 1_000_000;
    let bestScore = -1_000_000;
    let bestMove: Move | null = null;
    let bestPv: Move[] = [];

    for (let index = 0; index < moves.length; index++) {
      const move = moves[index];
      const child = board.makeMove(move);
      let childResult: { score: number; pv: Move[] };

      if (index === 0) {
        childResult = state.negamax(child, depth - 1, -beta, -alpha, 1);
      } else {
        // PVS probe: a later move only needs to prove that it beats alpha.
        childResult = state.negamax(child, depth - 1, -alpha - 1, -alpha, 1);
      }
      let score = -childResult.score;

      // Fail-high probes are real candidates. Re-search with the full window
      // only when the move could become the new principal variation.
      if (index > 0 && score > alpha && score < beta) {
        childResult = state.negamax(child, depth - 1, -beta, -alpha, 1);
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

    return { move: bestMove, score: bestScore, pv: bestPv.slice(0, 32) };
  }
}
