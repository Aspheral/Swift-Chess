import { Board, Color, Move, PieceType, START_FEN } from "./board";

export type GameResult = "ongoing" | "checkmate" | "stalemate" | "threefold" | "fifty-move" | "insufficient-material";

/**
 * Stateful game wrapper around the immutable Board.
 * Tracks position history so repetition and draw rules can be evaluated
 * without making the search-oriented Board carry mutable history.
 */
export class Game {
  private boardState: Board;
  private readonly positionHistory: Map<string, number>;

  constructor(board: Board = Board.start()) {
    this.boardState = board;
    this.positionHistory = new Map([[Game.positionKey(board), 1]]);
  }

  static start(): Game {
    return new Game(Board.fromFEN(START_FEN));
  }

  static fromFEN(fen: string): Game {
    return new Game(Board.fromFEN(fen));
  }

  board(): Board {
    return this.boardState;
  }

  fen(): string {
    return this.boardState.toFEN();
  }

  legalMoves(): Move[] {
    return this.boardState.legalMoves();
  }

  /** Apply a legal move object and record the resulting position. */
  play(move: Move): Board {
    const legal = this.boardState.legalMoves().find((candidate) => candidate.uci() === move.uci());
    if (!legal) throw new Error(`Illegal move: ${move.uci()}`);
    this.boardState = this.boardState.makeMove(legal);
    const key = Game.positionKey(this.boardState);
    this.positionHistory.set(key, (this.positionHistory.get(key) ?? 0) + 1);
    return this.boardState;
  }

  /** Apply a UCI move such as e2e4 or e7e8q. */
  playUci(uci: string): Board {
    const legal = this.legalMoves().find((move) => move.uci() === uci.toLowerCase());
    if (!legal) throw new Error(`Illegal UCI move: ${uci}`);
    return this.play(legal);
  }

  repetitionCount(): number {
    return this.positionHistory.get(Game.positionKey(this.boardState)) ?? 0;
  }

  isThreefoldRepetition(): boolean {
    return this.repetitionCount() >= 3;
  }

  isFiftyMoveDraw(): boolean {
    const halfmove = Number(this.fen().split(/\s+/)[4]);
    return halfmove >= 100;
  }

  /**
   * Dead-position material test for the common insufficient-material cases:
   * K vs K, K+B vs K, K+N vs K, and K+B vs K+B with bishops on the same color.
   */
  isInsufficientMaterial(): boolean {
    const pieces = this.boardState
      .toFEN()
      .split(/\s+/)[0]
      .replace(/[1-8/]/g, "")
      .split("")
      .map((char) => char.toLowerCase());

    const nonKings = pieces.filter((piece) => piece !== "k");
    if (nonKings.length === 0) return true;
    if (nonKings.some((piece) => !["b", "n"].includes(piece))) return false;
    if (nonKings.length === 1) return true;
    if (nonKings.length !== 2 || nonKings[0] !== "b" || nonKings[1] !== "b") return false;

    const bishopSquares: number[] = [];
    for (let square = 0; square < 64; square++) {
      const piece = this.boardState.pieceAt(square);
      if (piece?.[1] === "b") bishopSquares.push(square);
    }
    return bishopSquares.length === 2 &&
      ((bishopSquares[0] & 7) + Math.floor(bishopSquares[0] / 8)) % 2 ===
      ((bishopSquares[1] & 7) + Math.floor(bishopSquares[1] / 8)) % 2;
  }

  result(): GameResult {
    if (this.boardState.isCheckmate()) return "checkmate";
    if (this.boardState.isStalemate()) return "stalemate";
    if (this.isThreefoldRepetition()) return "threefold";
    if (this.isFiftyMoveDraw()) return "fifty-move";
    if (this.isInsufficientMaterial()) return "insufficient-material";
    return "ongoing";
  }

  turn(): Color {
    const fields = this.fen().split(/\s+/);
    return fields[1] as Color;
  }

  static positionKey(board: Board): string {
    return board.toFEN().split(/\s+/).slice(0, 4).join(" ");
  }
}

export type { PieceType };
