import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { Board, Game, HumanSwiftEngine, Move, START_FEN } from "../src";

const GAMES = 20;
const TARGET_WINS = Math.ceil(GAMES * 0.5);
const STOCKFISH_ELO = 1650;
const MAX_PLIES = 100;
const SWIFT_DEPTH = 6;
const SWIFT_TIME_MS = 650;
const STOCKFISH_MOVETIME_MS = 25;
const HUMAN_SAFETY_DEPTH = 2;
const HUMAN_PONDER_DEPTH = 2;
const HUMAN_SAFETY_TIME_MS = 30;
const HUMAN_PONDER_TIME_MS = 35;
const HUMAN_CANDIDATE_LIMIT = 4;
const HUMAN_SAFETY_CANDIDATE_LIMIT = 3;
const HUMAN_CONCRETE_CANDIDATE_LIMIT = 6;
const HUMAN_TACTICAL_DEPTH = 0;

class UciStockfish {
  private process: ChildProcessWithoutNullStreams;
  private buffer = "";
  private closed = false;
  private pending: Array<{ resolve: (value: string) => void; reject: (error: Error) => void; marker: string }> = [];

  constructor() {
    this.process = spawn("stockfish", [], { stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    this.process.on("error", (error) => this.rejectPending(error));
    this.process.on("exit", (code, signal) => {
      this.closed = true;
      this.rejectPending(new Error(`Stockfish exited before completing a command (code=${code}, signal=${signal})`));
    });
  }

  async init() {
    await this.command("uci", "uciok");
    this.write("setoption name UCI_LimitStrength value true\n");
    this.write(`setoption name UCI_Elo value ${STOCKFISH_ELO}\n`);
    await this.command("isready", "readyok");
  }

  async bestMove(fen: string): Promise<string> {
    this.buffer = "";
    this.write(`position fen ${fen}\ngo movetime ${STOCKFISH_MOVETIME_MS}\n`);
    const output = await this.waitFor("bestmove ");
    return output.match(/bestmove\s+(\S+)/)?.[1] ?? "0000";
  }

  close() {
    if (this.closed || this.process.stdin.destroyed || this.process.killed) return;
    this.closed = true;
    this.process.stdin.end("quit\n");
  }

  private command(command: string, marker: string): Promise<string> {
    this.buffer = "";
    this.write(`${command}\n`);
    return this.waitFor(marker);
  }

  private write(data: string) {
    if (this.closed || this.process.stdin.destroyed || this.process.killed) {
      throw new Error("Stockfish process is no longer available");
    }
    this.process.stdin.write(data);
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

  private rejectPending(error: Error) {
    const pending = this.pending.splice(0);
    for (const item of pending) item.reject(error);
  }
}

function applyUci(board: Board, uci: string): Board {
  const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
  if (!move) throw new Error(`Illegal UCI move ${uci} in ${board.toFEN()}`);
  return board.makeMove(move);
}

function swiftMove(
  board: Board,
  engine: HumanSwiftEngine,
  history: string[],
  positionKeys: string[],
  seed: number,
): { move: Move; depth: number; score: number; nodes: number } {
  const result = engine.search(board, {
    depth: SWIFT_DEPTH,
    timeMs: SWIFT_TIME_MS,
    randomness: 0,
    errorBudget: 0,
    strictBestPlay: true,
    safetyDepth: HUMAN_SAFETY_DEPTH,
    ponderDepth: HUMAN_PONDER_DEPTH,
    safetyTimeMs: HUMAN_SAFETY_TIME_MS,
    ponderTimeMs: HUMAN_PONDER_TIME_MS,
    candidateLimit: HUMAN_CANDIDATE_LIMIT,
    safetyCandidateLimit: HUMAN_SAFETY_CANDIDATE_LIMIT,
    concreteCandidateLimit: HUMAN_CONCRETE_CANDIDATE_LIMIT,
    tacticalSearchDepth: HUMAN_TACTICAL_DEPTH,
    safetyMargin: 45,
    seed,
    moveHistory: history,
    positionHistoryKeys: positionKeys,
  });
  if (!result.move) throw new Error(`Swift returned no move in ${board.toFEN()}`);
  return { move: result.move, depth: result.depth, score: result.score, nodes: result.nodes };
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
      const engine = new HumanSwiftEngine();
      let board = Board.fromFEN(START_FEN);
      const swiftIsWhite = game % 2 === 0;
      const history: string[] = [];
      const positionKeys: string[] = [Game.positionKey(board)];
      const swiftDepths: number[] = [];
      const swiftNodes: number[] = [];

      for (let ply = 0; ply < MAX_PLIES; ply += 1) {
        if (board.isCheckmate() || board.isStalemate()) break;

        const side = board.toFEN().split(/\s+/)[1] as "w" | "b";
        let uci: string;
        if ((side === "w") === swiftIsWhite) {
          const swift = swiftMove(board, engine, history, positionKeys, 10_000 + game);
          uci = swift.move.uci();
          swiftDepths.push(swift.depth);
          swiftNodes.push(swift.nodes);
        } else {
          uci = await stockfish.bestMove(board.toFEN());
        }

        board = applyUci(board, uci);
        history.push(uci);
        positionKeys.push(Game.positionKey(board));
      }

      const sideToMove = board.toFEN().split(/\s+/)[1] as "w" | "b";
      const swiftWon = board.isCheckmate() && ((sideToMove === "b") === swiftIsWhite);
      const stockfishWon = board.isCheckmate() && ((sideToMove === "w") === swiftIsWhite);

      if (swiftWon) wins += 1;
      else if (stockfishWon) losses += 1;
      else draws += 1;
      const averageDepth = swiftDepths.length
        ? swiftDepths.reduce((sum, depth) => sum + depth, 0) / swiftDepths.length
        : 0;
      const averageNodes = swiftNodes.length
        ? swiftNodes.reduce((sum, nodes) => sum + nodes, 0) / swiftNodes.length
        : 0;
      console.log(
        `Swift gate game ${game + 1}/${GAMES}: ${swiftWon ? "win" : stockfishWon ? "loss" : "draw"}; ` +
        `avgDepth=${averageDepth.toFixed(2)} avgNodes=${Math.round(averageNodes)} moves=${history.join(" ")}`,
      );

      const remainingGames = GAMES - (game + 1);
      if (wins + remainingGames < TARGET_WINS) {
        console.log(`Swift gate cannot reach ${TARGET_WINS} wins after ${game + 1} games; ending the failed match early.`);
        break;
      }
    }

    const winRate = wins / GAMES;
    console.log(`Swift gate: ${wins}-${losses}-${draws} (wins=${(winRate * 100).toFixed(1)}%) vs Stockfish ${STOCKFISH_ELO}`);
    expect(wins).toBeGreaterThanOrEqual(TARGET_WINS);
  }, 600_000);
});
