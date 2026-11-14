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
  private readonly positionKeysState: string[];
  private readonly movesState: string[];
  private readonly boardHistoryState: Board[];

  constructor(board: Board = Board.start()) {
    const initialKey = Game.positionKey(board);
    this.boardState = board;
    this.positionHistory = new Map([[initialKey, 1]]);
    this.positionKeysState = [initialKey];
    this.movesState = [];
    this.boardHistoryState = [board];
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
    this.positionKeysState.push(key);
    this.movesState.push(legal.uci());
    this.boardHistoryState.push(this.boardState);
    return this.boardState;
  }

  /** Rewind one ply, restoring all tracked game state. */
  undo(): Board | null {
    if (this.movesState.length === 0 || this.boardHistoryState.length <= 1) return null;

    const currentKey = this.positionKeysState.pop();
    if (currentKey) {
      const count = this.positionHistory.get(currentKey) ?? 0;
      if (count <= 1) this.positionHistory.delete(currentKey);
      else this.positionHistory.set(currentKey, count - 1);
    }

    this.movesState.pop();
    this.boardHistoryState.pop();
    this.boardState = this.boardHistoryState[this.boardHistoryState.length - 1];
    return this.boardState;
  }

  canUndo(): boolean {
    return this.movesState.length > 0;
  }

  /** Apply a UCI move such as e2e4 or e7e8q. */
  playUci(uci: string): Board {
    const legal = this.legalMoves().find((move) => move.uci() === uci.toLowerCase());
    if (!legal) throw new Error(`Illegal UCI move: ${uci}`);
    return this.play(legal);
  }

  /** UCI move history in chronological order. */
  moveHistory(): string[] {
    return [...this.movesState];
  }

  /** Repetition identities in chronological order, including the initial position. */
  positionHistoryKeys(): string[] {
    return [...this.positionKeysState];
  }

  repetitionCount(): number {
    return this.positionHistory.get(Game.positionKey(this.boardState)) ?? 0;
  }

  /** Would this move make the resulting position the third occurrence? */
  wouldCreateThreefold(move: Move): boolean {
    const legal = this.boardState.legalMoves().find((candidate) => candidate.uci() === move.uci());
    if (!legal) return false;
    const next = this.boardState.makeMove(legal);
    return (this.positionHistory.get(Game.positionKey(next)) ?? 0) + 1 >= 3;
  }

  isThreefoldRepetition(): boolean {
    return this.repetitionCount() >= 3;
  }

  isFiftyMoveDraw(): boolean {
    const halfmove = Number(this.fen().split(/\s+/)[4]);
    return halfmove >= 100;
  }

  /** Keep game adjudication and engine search on the same dead-position rule. */
  isInsufficientMaterial(): boolean {
    return this.boardState.isInsufficientMaterial();
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

  /**
   * Repetition identity is the actual chess position, not every detail of the
   * FEN serialization. An en-passant target only changes the position when an
   * en-passant capture is actually legal. This prevents harmless pawn-double
   * moves from creating false non-repetitions.
   */
  static positionKey(board: Board): string {
    const fields = board.toFEN().split(/\s+/);
    const enPassant = fields[3] !== "-" && board.legalMoves().some((move) => move.enPassant)
      ? fields[3]
      : "-";
    return [fields[0], fields[1], fields[2], enPassant].join(" ");
  }
}

export type { PieceType };
