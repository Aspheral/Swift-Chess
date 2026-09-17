import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { Board, HumanSwiftEngine, Move, START_FEN } from "../src";

const GAMES = 20;
const STOCKFISH_ELO = 1650;
const MAX_PLIES = 180;
const SWIFT_DEPTH = 4;

class UciStockfish {
  private process: ChildProcessWithoutNullStreams;
  private buffer = "";
  private pending: Array<{ resolve: (value: string) => void; reject: (error: Error) => void; marker: string }> = [];

  constructor() {
    this.process = spawn("stockfish", [], { stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
  }

  async init() {
    await this.command("uci", "uciok");
    this.process.stdin.write("setoption name UCI_LimitStrength value true\n");
    this.process.stdin.write(`setoption name UCI_Elo value ${STOCKFISH_ELO}\n`);
    await this.command("isready", "readyok");
  }

  async bestMove(fen: string): Promise<string> {
    this.buffer = "";
    this.process.stdin.write(`position fen ${fen}\ngo movetime 80\n`);
    const output = await this.waitFor("bestmove ");
    return output.match(/bestmove\s+(\S+)/)?.[1] ?? "0000";
  }

  close() {
    this.process.stdin.write("quit\n");
    this.process.kill();
  }

  private command(command: string, marker: string): Promise<string> {
    this.buffer = "";
    this.process.stdin.write(`${command}\n`);
    return this.waitFor(marker);
  }

  private waitFor(marker: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject, marker });
      this.flush();
    });
  }

  private flush() {
    for (let i = 0; i < this.pending.length; i += 1) {
      const item = this.pending[i];
      const index = this.buffer.indexOf(item.marker);
      if (index < 0) continue;
      const end = this.buffer.indexOf("\n", index);
      if (end < 0) continue;
      const result = this.buffer.slice(0, end + 1);
      this.buffer = this.buffer.slice(end + 1);
      this.pending.splice(i, 1);
      item.resolve(result);
      i -= 1;
    }
  }
}

function applyUci(board: Board, uci: string): Board {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!move) throw new Error(`Illegal UCI move ${uci} in ${board.toFEN()}`);
  return board.makeMove(move);
}

function swiftMove(board: Board, engine: HumanSwiftEngine, history: string[], positionKeys: string[], seed: number): Move {
  const result = engine.search(board, {
    depth: SWIFT_DEPTH,
    randomness: 0,
    errorBudget: 0,
    safetyDepth: 3,
    safetyMargin: 45,
    seed,
    moveHistory: history,
    positionHistoryKeys: positionKeys,
  });
  if (!result.move) throw new Error(`Swift returned no move in ${board.toFEN()}`);
  return result.move;
}

describe("Swift 1650 Elo Stockfish gate", () => {
  let stockfish: UciStockfish;

  beforeAll(async () => {
    stockfish = new UciStockfish();
    await stockfish.init();
  }, 15_000);

  afterAll(() => stockfish?.close());

  it("wins at least 50% of a balanced 1650-Elo Stockfish match", async () => {
    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (let game = 0; game < GAMES; game += 1) {
      let board = Board.fromFEN(START_FEN);
      const swiftIsWhite = game % 2 === 0;
      const engine = new HumanSwiftEngine();
      const history: string[] = [];
      const positionKeys: string[] = [board.toFEN()];

      for (let ply = 0; ply < MAX_PLIES; ply += 1) {
        if (board.isCheckmate() || board.isStalemate()) break;

        const side = board.toFEN().split(/\s+/)[1] as "w" | "b";
        const uci = ((side === "w") === swiftIsWhite)
          ? swiftMove(board, engine, history, positionKeys, 10_000 + game).uci()
          : await stockfish.bestMove(board.toFEN());

        board = applyUci(board, uci);
        history.push(uci);
        positionKeys.push(board.toFEN());
      }

      const sideToMove = board.toFEN().split(/\s+/)[1] as "w" | "b";
      const swiftWon = board.isCheckmate() && ((sideToMove === "b") === swiftIsWhite);
      const stockfishWon = board.isCheckmate() && ((sideToMove === "w") === swiftIsWhite);

      if (swiftWon) wins += 1;
      else if (stockfishWon) losses += 1;
      else draws += 1;
    }

    const winRate = wins / GAMES;
    console.log(`Swift gate: ${wins}-${losses}-${draws} (wins=${(winRate * 100).toFixed(1)}%) vs Stockfish ${STOCKFISH_ELO}`);
    expect(wins).toBeGreaterThanOrEqual(Math.ceil(GAMES * 0.5));
  }, 180_000);
});
