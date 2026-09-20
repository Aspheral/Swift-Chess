import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  Board,
  Game,
  HumanEngineOptions,
  HumanSwiftEngine,
  Move,
  swiftPlayProfile,
} from "../src";

const STOCKFISH_ELO = Math.max(1320, Number.parseInt(process.env.SWIFT_STOCKFISH_ELO ?? "1650", 10) || 1650);
const STOCKFISH_MOVETIME_MS = 100;
const MAX_PLIES = 240;
const MODE = process.env.SWIFT_CALIBRATION_MODE === "human" ? "human" : "strict";
const REQUIRE_TARGET = process.env.SWIFT_CALIBRATION_REQUIRE_TARGET === "1";
const BATCH = Math.max(0, Number.parseInt(process.env.SWIFT_CALIBRATION_BATCH ?? "0", 10) || 0);

const OPENING_PAIRS = [
  { name: "Reti / ...d5", moves: ["g1f3", "d7d5", "c2c4", "e7e6"] },
  { name: "Reti / kingside fianchetto", moves: ["g1f3", "g8f6", "g2g3", "g7g6"] },
  { name: "Queen's Gambit Declined", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6"] },
  { name: "Slav structure", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6"] },
  { name: "Queen's Gambit Accepted", moves: ["d2d4", "d7d5", "c2c4", "d5c4", "g1f3", "g8f6"] },
  { name: "London structure", moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4", "e7e6"] },
  { name: "Four Knights", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"] },
  { name: "Scotch structure", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4"] },
  { name: "Bishop's Opening", moves: ["e2e4", "e7e5", "f1c4", "g8f6", "d2d3", "f8c5"] },
  { name: "Italian structure", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"] },
] as const;

const GAMES = OPENING_PAIRS.length * 2;
const TARGET_SCORE = GAMES * 0.5;

const STRICT_OPTIONS: HumanEngineOptions = {
  depth: 6,
  timeMs: 650,
  randomness: 0,
  errorBudget: 0,
  strictBestPlay: true,
  safetyDepth: 2,
  ponderDepth: 2,
  safetyTimeMs: 30,
  ponderTimeMs: 35,
  candidateLimit: 4,
  safetyCandidateLimit: 3,
  concreteCandidateLimit: 6,
  tacticalSearchDepth: 0,
  safetyMargin: 45,
};

const HUMAN_PROFILE = "adaptive-human-v1";

type Outcome = "win" | "loss" | "draw" | "unresolved";

interface CalibrationGame {
  game: number;
  mode: typeof MODE;
  swiftColor: "White" | "Black";
  opening: string;
  result: Outcome;
  reason: string;
  seed: number;
  plies: number;
  averageDepth: number;
  averageNodes: number;
  moves: string[];
  finalFen: string;
}

interface MatchStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  unresolved: number;
  score: number;
  depthSum: number;
  nodeSum: number;
  swiftMoves: number;
  plies: number;
}

function emptyStats(): MatchStats {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    unresolved: 0,
    score: 0,
    depthSum: 0,
    nodeSum: 0,
    swiftMoves: 0,
    plies: 0,
  };
}

function addGame(
  stats: MatchStats,
  outcome: Outcome,
  depths: number[],
  nodes: number[],
  plies: number,
): void {
  stats.games += 1;
  stats.plies += plies;
  stats.depthSum += depths.reduce((sum, value) => sum + value, 0);
  stats.nodeSum += nodes.reduce((sum, value) => sum + value, 0);
  stats.swiftMoves += depths.length;

  if (outcome === "win") {
    stats.wins += 1;
    stats.score += 1;
  } else if (outcome === "loss") {
    stats.losses += 1;
  } else if (outcome === "draw") {
    stats.draws += 1;
    stats.score += 0.5;
  } else {
    stats.unresolved += 1;
  }
}

function completedGames(stats: MatchStats): number {
  return stats.wins + stats.losses + stats.draws;
}

function scoreRate(stats: MatchStats): number {
  const completed = completedGames(stats);
  return completed ? stats.score / completed : 0;
}

function performanceElo(rate: number): number | null {
  if (rate <= 0 || rate >= 1) return null;
  return Math.round(STOCKFISH_ELO + 400 * Math.log10(rate / (1 - rate)));
}

function statsLine(label: string, stats: MatchStats): string {
  const completed = completedGames(stats);
  const rate = scoreRate(stats);
  const averageDepth = stats.swiftMoves ? stats.depthSum / stats.swiftMoves : 0;
  const averageNodes = stats.swiftMoves ? stats.nodeSum / stats.swiftMoves : 0;
  const averagePlies = stats.games ? stats.plies / stats.games : 0;
  const elo = performanceElo(rate);

  return (
    `${label}: ${stats.wins}-${stats.losses}-${stats.draws}` +
    (stats.unresolved ? ` +${stats.unresolved} unresolved` : "") +
    ` score=${stats.score.toFixed(1)}/${completed} (${(rate * 100).toFixed(1)}%)` +
    ` perfElo=${elo ?? "n/a"} avgCompletedDepth=${averageDepth.toFixed(2)}` +
    ` avgNodes=${Math.round(averageNodes)} avgPlies=${averagePlies.toFixed(1)}`
  );
}

class UciStockfish {
  private process: ChildProcessWithoutNullStreams;
  private buffer = "";
  private closed = false;
  private pending: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    marker: string;
  }> = [];

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
      this.rejectPending(
        new Error(`Stockfish exited before completing a command (code=${code}, signal=${signal})`),
      );
    });
  }

  async init() {
    await this.command("uci", "uciok");
    this.write("setoption name Threads value 1\n");
    this.write("setoption name Hash value 64\n");
    this.write("setoption name UCI_LimitStrength value true\n");
    this.write(`setoption name UCI_Elo value ${STOCKFISH_ELO}\n`);
    await this.command("isready", "readyok");
  }

  async newGame(): Promise<void> {
    this.write("ucinewgame\n");
    this.write("setoption name Clear Hash\n");
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

function swiftMove(
  board: Board,
  engine: HumanSwiftEngine,
  game: Game,
  baseSeed: number,
): { move: Move; depth: number; score: number; nodes: number } {
  const history = game.moveHistory();
  const searchOptions = MODE === "human"
    ? swiftPlayProfile(board, history).options
    : STRICT_OPTIONS;
  const result = engine.search(board, {
    ...searchOptions,
    seed: baseSeed,
    moveHistory: history,
    positionHistoryKeys: game.positionHistoryKeys(),
  });

  if (!result.move) throw new Error(`Swift returned no move in ${board.toFEN()}`);
  return { move: result.move, depth: result.depth, score: result.score, nodes: result.nodes };
}

const runStockfishGate = process.env.SWIFT_RUN_STOCKFISH_GATE === "1";

(runStockfishGate ? describe : describe.skip)(`Swift 1650 calibration (${MODE})`, () => {
  let stockfish: UciStockfish;

  beforeAll(async () => {
    stockfish = new UciStockfish();
    await stockfish.init();
  }, 15_000);

  afterAll(() => stockfish?.close());

  it("runs paired openings and records only real chess results", async () => {
    const overall = emptyStats();
    const byColor = { White: emptyStats(), Black: emptyStats() };
    const byOutcome = new Map<Outcome, MatchStats>();
    const byOpening = new Map<string, MatchStats>();
    const gameRecords: CalibrationGame[] = [];

    for (let gameIndex = 0; gameIndex < GAMES; gameIndex += 1) {
      const opening = OPENING_PAIRS[Math.floor(gameIndex / 2)];
      const swiftIsWhite = gameIndex % 2 === 0;
      const colorLabel = swiftIsWhite ? "White" : "Black";
      const baseSeed = 20_000 + BATCH * 1_000_003 + Math.floor(gameIndex / 2) * 7_919;

      await stockfish.newGame();

      const engine = new HumanSwiftEngine();
      const game = Game.start();
      for (const uci of opening.moves) game.playUci(uci);

      const swiftDepths: number[] = [];
      const swiftNodes: number[] = [];

      while (game.result() === "ongoing" && game.moveHistory().length < MAX_PLIES) {
        const board = game.board();
        let uci: string;

        if ((game.turn() === "w") === swiftIsWhite) {
          const swift = swiftMove(board, engine, game, baseSeed);
          uci = swift.move.uci();
          swiftDepths.push(swift.depth);
          swiftNodes.push(swift.nodes);
        } else {
          uci = await stockfish.bestMove(game.fen());
        }

        game.playUci(uci);
      }

      const endReason = game.result();
      let outcome: Outcome;
      if (endReason === "ongoing") {
        outcome = "unresolved";
      } else if (endReason === "checkmate") {
        const swiftWon = (game.turn() === "b") === swiftIsWhite;
        outcome = swiftWon ? "win" : "loss";
      } else {
        outcome = "draw";
      }

      const moves = game.moveHistory();
      const averageDepth = swiftDepths.length
        ? swiftDepths.reduce((sum, depth) => sum + depth, 0) / swiftDepths.length
        : 0;
      const averageNodes = swiftNodes.length
        ? swiftNodes.reduce((sum, nodes) => sum + nodes, 0) / swiftNodes.length
        : 0;

      addGame(overall, outcome, swiftDepths, swiftNodes, moves.length);
      addGame(byColor[colorLabel], outcome, swiftDepths, swiftNodes, moves.length);

      if (!byOutcome.has(outcome)) byOutcome.set(outcome, emptyStats());
      addGame(byOutcome.get(outcome)!, outcome, swiftDepths, swiftNodes, moves.length);

      if (!byOpening.has(opening.name)) byOpening.set(opening.name, emptyStats());
      addGame(byOpening.get(opening.name)!, outcome, swiftDepths, swiftNodes, moves.length);

      gameRecords.push({
        game: gameIndex + 1,
        mode: MODE,
        swiftColor: colorLabel,
        opening: opening.name,
        result: outcome,
        reason: endReason,
        seed: baseSeed,
        plies: moves.length,
        averageDepth,
        averageNodes,
        moves,
        finalFen: game.fen(),
      });

      console.log(
        `Swift calibration game ${gameIndex + 1}/${GAMES}: mode=${MODE} color=${colorLabel} ` +
        `opening="${opening.name}" result=${outcome} reason=${endReason}; ` +
        `avgCompletedDepth=${averageDepth.toFixed(2)} avgNodes=${Math.round(averageNodes)} ` +
        `plies=${moves.length} moves=${moves.join(" ")}`,
      );
    }

    console.log(`Swift calibration configuration: mode=${MODE} batch=${BATCH} opponent=Stockfish-${STOCKFISH_ELO} ` +
      `stockfishMoveMs=${STOCKFISH_MOVETIME_MS} maxPlies=${MAX_PLIES} ` +
      (MODE === "human" ? `swiftProfile=${HUMAN_PROFILE}` : `swiftMaxDepth=${STRICT_OPTIONS.depth} swiftMoveMs=${STRICT_OPTIONS.timeMs}`));
    console.log(statsLine("Overall", overall));
    console.log(statsLine("White", byColor.White));
    console.log(statsLine("Black", byColor.Black));

    for (const outcome of ["win", "loss", "draw", "unresolved"] as Outcome[]) {
      const stats = byOutcome.get(outcome);
      if (stats) console.log(statsLine(`Outcome ${outcome}`, stats));
    }

    for (const opening of OPENING_PAIRS) {
      const stats = byOpening.get(opening.name);
      if (stats) console.log(statsLine(`Opening ${opening.name}`, stats));
    }

    mkdirSync("calibration-results", { recursive: true });
    writeFileSync(
      `calibration-results/${MODE}-elo-${STOCKFISH_ELO}-batch-${BATCH}.json`,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        configuration: {
          mode: MODE,
          batch: BATCH,
          opponent: `Stockfish-${STOCKFISH_ELO}`,
          opponentElo: STOCKFISH_ELO,
          stockfishMoveMs: STOCKFISH_MOVETIME_MS,
          maxPlies: MAX_PLIES,
          swift: MODE === "human" ? { profile: HUMAN_PROFILE } : STRICT_OPTIONS,
        },
        overall,
        byColor,
        byOutcome: Object.fromEntries(byOutcome),
        byOpening: Object.fromEntries(byOpening),
        performanceElo: performanceElo(scoreRate(overall)),
        games: gameRecords,
      }, null, 2),
      "utf8",
    );

    // A safety cap is allowed to stop a runaway test, but an unfinished game is
    // never silently converted into a draw. If this trips, raise the cap or add
    // an explicit, documented adjudication policy before trusting the rating.
    expect(overall.unresolved).toBe(0);

    if (REQUIRE_TARGET) {
      expect(overall.score).toBeGreaterThanOrEqual(TARGET_SCORE);
    }
  }, 1_800_000);
});
