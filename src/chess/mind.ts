import { Board, Color } from "./board";
import { ChessIdea, IdeaGeneration, IdeaKind } from "./ideas";

export interface SwiftOpponentModel {
  aggression: number;
  exchangeSeeking: number;
  pawnActivity: number;
  observedMoves: number;
}

export interface SwiftMindSnapshot {
  plan: IdeaKind | null;
  planAge: number;
  confidence: number;
  concern: string;
  opponent: SwiftOpponentModel;
  lastMove?: string;
  lastReason?: string;
  observedHistoryLength: number;
}

export interface MindPositionProfile {
  tacticalPressure: number;
  practicalPressure: number;
  gameStage: "opening" | "middlegame" | "endgame";
}

const PLAN_LABELS: Record<IdeaKind, string> = {
  tactical: "calculate the forcing sequence",
  attack: "increase pressure on the opponent",
  defend: "stabilize the position",
  "improve-piece": "improve the least useful piece",
  "create-weakness": "create a lasting weakness",
  simplify: "trade into a cleaner position",
  complicate: "keep practical problems on the board",
  "create-threat": "build a concrete threat",
  "pawn-break": "prepare or play a pawn break",
  develop: "finish development",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function strategicIdeas(ideas: ChessIdea[]): ChessIdea[] {
  return ideas.filter((idea) => idea.kind !== "tactical");
}

function planPriority(ideas: ChessIdea[], kind: IdeaKind): number {
  return ideas
    .filter((idea) => idea.kind === kind)
    .reduce((best, idea) => Math.max(best, idea.priority), -Infinity);
}

function describeConcern(
  generation: IdeaGeneration,
  profile: MindPositionProfile,
): string {
  const u = generation.understanding;
  const side = u.sideToMove;
  const enemy = opposite(side);

  if (u.king[side].attackers > 0 || profile.tacticalPressure >= 0.2) {
    return "Immediate king safety and forcing moves need attention.";
  }

  const vulnerable = u.pieces[side].filter((piece) => piece.vulnerable);
  if (vulnerable.length) {
    return `${vulnerable[0].square} is loose and may need protection or activity.`;
  }

  if (u.development[side] + 1 < u.development[enemy] && profile.gameStage === "opening") {
    return "Development is lagging behind the opponent.";
  }

  const weaknesses = u.pawns[side].isolated + u.pawns[side].doubled + u.pawns[side].backward;
  if (weaknesses >= 2) {
    return "The pawn structure has multiple long-term weaknesses.";
  }

  const materialForSide = side === "w" ? u.material : -u.material;
  if (materialForSide <= -250) {
    return "Material is down, so passive play is unlikely to be enough.";
  }

  if (u.king[enemy].exposed && profile.practicalPressure > 0.2) {
    return "The opponent king is exposed enough to justify sustained pressure.";
  }

  return "No urgent defect dominates the position.";
}

function analyzeOpponent(history: string[], swiftSide: Color): SwiftOpponentModel {
  const recentStart = Math.max(0, history.length - 12);
  let board = Board.start();
  let captures = 0;
  let checks = 0;
  let pawnMoves = 0;
  let observedMoves = 0;

  for (let index = 0; index < history.length; index += 1) {
    const uci = history[index];
    const move = board.legalMoves().find((candidate) => candidate.uci() === uci);
    if (!move) break;

    const mover = board.turn();
    const movingPiece = board.pieceAt(move.from);
    const capture = move.enPassant || board.pieceAt(move.to) !== null;
    const child = board.makeMove(move);

    if (index >= recentStart && mover !== swiftSide) {
      observedMoves += 1;
      if (capture) captures += 1;
      if (movingPiece?.[1] === "p") pawnMoves += 1;
      if (child.isInCheck(swiftSide)) checks += 1;
    }

    board = child;
  }

  if (!observedMoves) {
    return { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 };
  }

  return {
    aggression: clamp((captures * 0.55 + checks * 0.9) / observedMoves),
    exchangeSeeking: clamp(captures / observedMoves),
    pawnActivity: clamp(pawnMoves / observedMoves),
    observedMoves,
  };
}

/**
 * Persistent game-level state for Swift.
 *
 * The mind does not replace calculation. It gives Swift continuity: a plan can
 * survive several moves, an urgent new fact can replace it, and the selected
 * move can be remembered with the reason it served.
 */
export class SwiftMind {
  private state: SwiftMindSnapshot = {
    plan: null,
    planAge: 0,
    confidence: 0,
    concern: "No urgent defect dominates the position.",
    opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 },
    observedHistoryLength: 0,
  };

  observe(
    board: Board,
    generation: IdeaGeneration,
    profile: MindPositionProfile,
    history: string[] = [],
  ): SwiftMindSnapshot {
    if (history.length < this.state.observedHistoryLength) this.reset();

    const ideas = strategicIdeas(generation.ideas);
    const best = ideas[0];
    const current = this.state.plan;
    const currentPriority = current ? planPriority(ideas, current) : -Infinity;
    const bestPriority = best?.priority ?? -Infinity;
    const tacticalEmergency = profile.tacticalPressure >= 0.24 || board.isInCheck(board.turn());

    if (!best) {
      this.state.plan = null;
      this.state.planAge = 0;
      this.state.confidence *= 0.75;
    } else if (!current || currentPriority === -Infinity || tacticalEmergency) {
      this.state.plan = best.kind;
      this.state.planAge = 1;
      this.state.confidence = clamp(0.42 + bestPriority / 180);
    } else if (best.kind === current) {
      this.state.planAge += 1;
      this.state.confidence = clamp(this.state.confidence + 0.08);
    } else {
      const inertia = 10 + this.state.confidence * 12 + Math.min(6, this.state.planAge * 1.5);
      if (bestPriority >= currentPriority + inertia) {
        this.state.plan = best.kind;
        this.state.planAge = 1;
        this.state.confidence = clamp(0.38 + bestPriority / 190);
      } else {
        this.state.planAge += 1;
        this.state.confidence = clamp(this.state.confidence + 0.035);
      }
    }

    this.state.concern = describeConcern(generation, profile);
    this.state.opponent = analyzeOpponent(history, board.turn());
    this.state.observedHistoryLength = history.length;
    return this.snapshot();
  }

  recordDecision(move: string, reason: string): SwiftMindSnapshot {
    this.state.lastMove = move;
    this.state.lastReason = reason;
    return this.snapshot();
  }

  planBias(ideaKinds: IdeaKind[]): number {
    if (!this.state.plan || !ideaKinds.includes(this.state.plan)) return 0;
    return 4 + this.state.confidence * 8 + Math.min(4, this.state.planAge) * 0.75;
  }

  planDescription(): string {
    return this.state.plan ? PLAN_LABELS[this.state.plan] : "find a useful plan";
  }

  snapshot(): SwiftMindSnapshot {
    return {
      ...this.state,
      opponent: { ...this.state.opponent },
    };
  }

  reset(): void {
    this.state = {
      plan: null,
      planAge: 0,
      confidence: 0,
      concern: "No urgent defect dominates the position.",
      opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 },
      observedHistoryLength: 0,
    };
  }
}
