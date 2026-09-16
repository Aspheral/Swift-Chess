export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Piece = `${Color}${PieceType}`;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class Move {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly promotion?: PieceType,
    readonly enPassant = false,
    readonly castle = false,
  ) {}

  uci(): string {
    const files = "abcdefgh";
    const square = (s: number) => `${files[s & 7]}${Math.floor(s / 8) + 1}`;
    return `${square(this.from)}${square(this.to)}${this.promotion ? this.promotion.toUpperCase() : ""}`;
  }
}

const pieceValues: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const pieceFromChar = (char: string): Piece => `${char === char.toUpperCase() ? "w" : "b"}${char.toLowerCase()}` as Piece;
const pieceChar = (piece: Piece): string => piece[0] === "w" ? piece[1].toUpperCase() : piece[1];
const colorOf = (piece: Piece): Color => piece[0] as Color;
const typeOf = (piece: Piece): PieceType => piece[1] as PieceType;
const opposite = (color: Color): Color => color === "w" ? "b" : "w";

export interface PositionState {
  board: Array<Piece | null>;
  turn: Color;
  castling: string;
  enPassant: number | null;
  halfmove: number;
  fullmove: number;
}

export class Board {
  private constructor(private readonly state: PositionState) {}

  static start(): Board { return Board.fromFEN(START_FEN); }

  static fromFEN(fen: string): Board {
    const fields = fen.trim().split(/\s+/);
    if (fields.length !== 6) throw new Error("FEN must contain six fields");
    const board: Array<Piece | null> = Array(64).fill(null);
    const ranks = fields[0].split("/");
    if (ranks.length !== 8) throw new Error("FEN board must contain eight ranks");
    for (let rank = 0; rank < 8; rank++) {
      let file = 0;
      for (const char of ranks[rank]) {
        if (/\d/.test(char)) file += Number(char);
        else {
          if (file > 7) throw new Error("Invalid FEN rank");
          board[(7 - rank) * 8 + file] = pieceFromChar(char);
          file++;
        }
      }
      if (file !== 8) throw new Error("Invalid FEN rank");
    }
    if (fields[1] !== "w" && fields[1] !== "b") throw new Error("Invalid FEN side to move");
    const ep = fields[3] === "-" ? null : Board.squareIndex(fields[3]);
    return new Board({ board, turn: fields[1], castling: fields[2] === "-" ? "" : fields[2], enPassant: ep, halfmove: Number(fields[4]), fullmove: Number(fields[5]) });
  }

  toFEN(): string {
    const ranks: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "", empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.state.board[rank * 8 + file];
        if (!piece) empty++;
        else { if (empty) row += empty, empty = 0; row += pieceChar(piece); }
      }
      if (empty) row += empty;
      ranks.push(row);
    }
    const ep = this.state.enPassant === null ? "-" : Board.squareName(this.state.enPassant);
    return `${ranks.join("/")} ${this.state.turn} ${this.state.castling || "-"} ${ep} ${this.state.halfmove} ${this.state.fullmove}`;
  }

  pieceAt(square: string | number): Piece | null {
    const index = typeof square === "number" ? square : Board.squareIndex(square);
    return this.state.board[index] ?? null;
  }

  legalMoves(): Move[] {
    return this.pseudoLegalMoves().filter((move) => {
      const next = this.makeMove(move);
      return !next.isInCheck(this.state.turn);
    });
  }

  isCheckmate(): boolean { return this.isInCheck(this.state.turn) && this.legalMoves().length === 0; }
  isStalemate(): boolean { return !this.isInCheck(this.state.turn) && this.legalMoves().length === 0; }
  isInCheck(color: Color): boolean {
    const king = this.state.board.findIndex((piece) => piece === `${color}k`);
    return king >= 0 && this.isSquareAttacked(king, opposite(color));
  }

  makeMove(move: Move): Board {
    const board = [...this.state.board];
    const moving = board[move.from];
    if (!moving || colorOf(moving) !== this.state.turn) throw new Error("Illegal move: wrong side or empty square");
    const movingType = typeOf(moving);
    let captured = board[move.to];
    board[move.from] = null;
    if (move.enPassant) {
      const capturedSquare = move.to + (this.state.turn === "w" ? -8 : 8);
      captured = board[capturedSquare];
      board[capturedSquare] = null;
    }
    board[move.to] = move.promotion ? `${this.state.turn}${move.promotion}` as Piece : moving;
    if (move.castle) {
      const rookFrom = move.to > move.from ? move.from + 3 : move.from - 4;
      const rookTo = move.to > move.from ? move.from + 1 : move.from - 1;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = null;
    }
    let castling = this.state.castling;
    const remove = (chars: string) => { for (const c of chars) castling = castling.replace(c, ""); };
    if (movingType === "k") remove(this.state.turn === "w" ? "KQ" : "kq");
    if (movingType === "r") {
      if (move.from === 0) remove("Q"); if (move.from === 7) remove("K");
      if (move.from === 56) remove("q"); if (move.from === 63) remove("k");
    }
    if (captured === "wr" && move.to === 0) remove("Q");
    if (captured === "wr" && move.to === 7) remove("K");
    if (captured === "br" && move.to === 56) remove("q");
    if (captured === "br" && move.to === 63) remove("k");
    let ep: number | null = null;
    if (movingType === "p" && Math.abs(move.to - move.from) === 16) ep = (move.to + move.from) / 2;
    return new Board({ board, turn: opposite(this.state.turn), castling, enPassant: ep, halfmove: movingType === "p" || captured ? 0 : this.state.halfmove + 1, fullmove: this.state.fullmove + (this.state.turn === "b" ? 1 : 0) });
  }

  material(): number {
    return this.state.board.reduce((score, piece) => piece ? score + (colorOf(piece) === "w" ? 1 : -1) * pieceValues[typeOf(piece)] : score, 0);
  }

  private pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    for (let from = 0; from < 64; from++) {
      const piece = this.state.board[from];
      if (!piece || colorOf(piece) !== this.state.turn) continue;
      const type = typeOf(piece);
      if (type === "p") this.pawnMoves(from, moves);
      else if (type === "n") this.knightMoves(from, moves);
      else if (type === "b") this.sliderMoves(from, moves, [[1,1],[-1,1],[1,-1],[-1,-1]]);
      else if (type === "r") this.sliderMoves(from, moves, [[1,0],[-1,0],[0,1],[0,-1]]);
      else if (type === "q") this.sliderMoves(from, moves, [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
      else this.kingMoves(from, moves);
    }
    return moves;
  }

  private pawnMoves(from: number, moves: Move[]) {
    const dir = this.state.turn === "w" ? 8 : -8, rank = Math.floor(from / 8), file = from & 7;
    const one = from + dir;
    const promotionRank = this.state.turn === "w" ? 7 : 0;
    if (one >= 0 && one < 64 && !this.state.board[one]) {
      if (Math.floor(one / 8) === promotionRank) for (const p of ["q","r","b","n"] as PieceType[]) moves.push(new Move(from, one, p));
      else moves.push(new Move(from, one));
      const startRank = this.state.turn === "w" ? 1 : 6, two = from + dir * 2;
      if (rank === startRank && !this.state.board[two]) moves.push(new Move(from, two));
    }
    for (const df of [-1, 1]) {
      if (file + df < 0 || file + df > 7) continue;
      const to = from + dir + df;
      if (to < 0 || to >= 64) continue;
      const target = this.state.board[to];
      if (target && colorOf(target) !== this.state.turn) {
        if (Math.floor(to / 8) === promotionRank) for (const p of ["q","r","b","n"] as PieceType[]) moves.push(new Move(from, to, p));
        else moves.push(new Move(from, to));
      } else if (this.state.enPassant === to) moves.push(new Move(from, to, undefined, true));
    }
  }

  private knightMoves(from: number, moves: Move[]) {
    for (const [df, dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) this.addStep(from, df, dr, moves);
  }
  private kingMoves(from: number, moves: Move[]) {
    for (const df of [-1,0,1]) for (const dr of [-1,0,1]) if (df || dr) this.addStep(from, df, dr, moves);
    const rank = this.state.turn === "w" ? 0 : 7;
    if (from === rank * 8 + 4 && !this.isInCheck(this.state.turn)) {
      const rights = this.state.turn === "w" ? ["K","Q"] : ["k","q"];
      if (this.state.castling.includes(rights[0]) && !this.state.board[from+1] && !this.state.board[from+2] && !this.isSquareAttacked(from+1, opposite(this.state.turn)) && !this.isSquareAttacked(from+2, opposite(this.state.turn))) moves.push(new Move(from, from+2, undefined, false, true));
      if (this.state.castling.includes(rights[1]) && !this.state.board[from-1] && !this.state.board[from-2] && !this.state.board[from-3] && !this.isSquareAttacked(from-1, opposite(this.state.turn)) && !this.isSquareAttacked(from-2, opposite(this.state.turn))) moves.push(new Move(from, from-2, undefined, false, true));
    }
  }
  private sliderMoves(from: number, moves: Move[], directions: number[][]) {
    const file = from & 7, rank = Math.floor(from / 8);
    for (const [df, dr] of directions) for (let n = 1; ; n++) {
      const f = file + df*n, r = rank + dr*n; if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const to = r*8+f, target = this.state.board[to];
      if (!target) moves.push(new Move(from, to));
      else { if (colorOf(target) !== this.state.turn) moves.push(new Move(from, to)); break; }
    }
  }
  private addStep(from: number, df: number, dr: number, moves: Move[]) {
    const f = (from & 7) + df, r = Math.floor(from / 8) + dr; if (f < 0 || f > 7 || r < 0 || r > 7) return;
    const to = r*8+f, target = this.state.board[to]; if (!target || colorOf(target) !== this.state.turn) moves.push(new Move(from, to));
  }

  private isSquareAttacked(square: number, by: Color): boolean {
    const file = square & 7, rank = Math.floor(square / 8);
    const pawnRank = rank + (by === "w" ? -1 : 1);
    for (const df of [-1,1]) { const f=file+df; if (f>=0&&f<8&&pawnRank>=0&&pawnRank<8&&this.state.board[pawnRank*8+f]===`${by}p`) return true; }
    for (const [df,dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const f=file+df,r=rank+dr; if(f>=0&&f<8&&r>=0&&r<8&&this.state.board[r*8+f]===`${by}n`) return true; }
    const sliderAttacks: Array<[number, number, PieceType[]]> = [
      [1,0,["r","q"]], [-1,0,["r","q"]], [0,1,["r","q"]], [0,-1,["r","q"]],
      [1,1,["b","q"]], [-1,1,["b","q"]], [1,-1,["b","q"]], [-1,-1,["b","q"]],
    ];
    for (const [df,dr,types] of sliderAttacks) {
      let f=file+df,r=rank+dr;
      while(f>=0&&f<8&&r>=0&&r<8){
        const p=this.state.board[r*8+f];
        if(p){if(colorOf(p)===by&&types.includes(typeOf(p))) return true; break;}
        f+=df;r+=dr;
      }
    }
    for (const df of [-1,0,1]) for (const dr of [-1,0,1]) if(df||dr){const f=file+df,r=rank+dr;if(f>=0&&f<8&&r>=0&&r<8&&this.state.board[r*8+f]===`${by}k`)return true;}
    return false;
  }

  private static squareIndex(square: string): number { if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Invalid square: ${square}`); return (Number(square[1])-1)*8 + square.charCodeAt(0)-97; }
  private static squareName(index: number): string { return `${"abcdefgh"[index&7]}${Math.floor(index/8)+1}`; }
}
