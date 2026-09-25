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
  planReason?: string;
  planProgress?: number;
  planProgressNote?: string;
  setbacks: number;
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

function bestIdeaForPlan(ideas: ChessIdea[], kind: IdeaKind): ChessIdea | undefined {
  return ideas.filter((idea) => idea.kind === kind).sort((a, b) => b.priority - a.priority)[0];
}

function planPriority(ideas: ChessIdea[], kind: IdeaKind): number {
  return bestIdeaForPlan(ideas, kind)?.priority ?? -Infinity;
}

function confidenceGain(priority: number, setbacks: number): number {
  // Conviction should grow because the board keeps supporting the plan, not
  // merely because the plan survived another turn. Weak evidence produces only
  // a small nudge; a repeatedly strong strategic signal earns real confidence.
  const evidence = clamp((priority - 35) / 65);
  const base = 0.015 + evidence * 0.065;
  return setbacks ? base * 0.45 : base;
}

function signedClamp(value: number, limit = 1): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Measure whether the board is moving in the direction a plan is trying to go.
 * The metric is intentionally coarse and plan-specific. Swift should remember
 * whether a plan is making progress, not invent a universal "strategic score."
 */
export function planProgressMetric(
  board: Board,
  generation: IdeaGeneration,
  plan: IdeaKind,
): number {
  const u = generation.understanding;
  const side = u.sideToMove;
  const enemy = opposite(side);
  const ownPieces = u.pieces[side];
  const enemyPieces = u.pieces[enemy];
  const averageActivity = ownPieces.length
    ? ownPieces.reduce((sum, piece) => sum + piece.activity, 0) / (ownPieces.length * 10)
    : 0;
  const ownVulnerable = ownPieces.filter((piece) => piece.vulnerable).length;
  const enemyVulnerable = enemyPieces.filter((piece) => piece.vulnerable).length;
  const ownWeakPawns = u.pawns[side].isolated + u.pawns[side].doubled + u.pawns[side].backward;
  const enemyWeakPawns = u.pawns[enemy].isolated + u.pawns[enemy].doubled + u.pawns[enemy].backward;
  const forcing = clamp(u.tactics.forcingMoves / 10);
  const enemyKingPressure = clamp(
    (u.king[enemy].exposed ? 0.35 : 0) +
    u.king[enemy].attackers * 0.18 +
    enemyVulnerable * 0.08,
  );

  switch (plan) {
    case "develop":
      return clamp(u.development[side] / 4);
    case "defend":
      return clamp(
        1 -
        ownVulnerable * 0.18 -
        (u.king[side].exposed ? 0.2 : 0) -
        u.king[side].attackers * 0.18 -
        ownWeakPawns * 0.04,
      );
    case "improve-piece":
      return clamp(averageActivity);
    case "attack":
    case "create-threat":
    case "tactical":
      return clamp(enemyKingPressure * 0.65 + forcing * 0.35);
    case "create-weakness":
      return clamp((enemyWeakPawns * 0.16) + (enemyVulnerable * 0.08));
    case "pawn-break":
      return clamp(
        (u.pawns[side].openFiles.length + u.pawns[side].semiOpenFiles.length) * 0.08 +
        enemyWeakPawns * 0.12,
      );
    case "simplify": {
      const pieces = board.toFEN().split(/\s+/)[0].replace(/[1-8/]/g, "").length;
      const materialForSide = side === "w" ? u.material : -u.material;
      const reduction = clamp((32 - pieces) / 24);
      return materialForSide > 0 ? reduction : reduction * 0.45;
    }
    case "complicate":
      return clamp((u.space[side] / 40) * 0.55 + forcing * 0.45);
  }
}

function progressNote(progress: number): string {
  if (progress >= 0.08) return "The last cycle made clear progress on the plan.";
  if (progress >= 0.025) return "The plan improved a little.";
  if (progress <= -0.08) return "The plan lost ground after the last cycle.";
  if (progress <= -0.025) return "The plan became slightly less convincing.";
  return "The plan is holding roughly steady.";
}

function describeConcern(generation: IdeaGeneration, profile: MindPositionProfile): string {
  const u = generation.understanding;
  const side = u.sideToMove;
  const enemy = opposite(side);
  if (u.king[side].attackers > 0 || profile.tacticalPressure >= 0.2) return "Immediate king safety and forcing moves need attention.";
  const vulnerable = u.pieces[side].filter((piece) => piece.vulnerable);
  if (vulnerable.length) return `${vulnerable[0].square} is loose and may need protection or activity.`;
  if (u.development[side] + 1 < u.development[enemy] && profile.gameStage === "opening") return "Development is lagging behind the opponent.";
  const weaknesses = u.pawns[side].isolated + u.pawns[side].doubled + u.pawns[side].backward;
  if (weaknesses >= 2) return "The pawn structure has multiple long-term weaknesses.";
  const materialForSide = side === "w" ? u.material : -u.material;
  if (materialForSide <= -250) return "Material is down, so passive play is unlikely to be enough.";
  if (u.king[enemy].exposed && profile.practicalPressure > 0.2) return "The opponent king is exposed enough to justify sustained pressure.";
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
  if (!observedMoves) return { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 };
  return {
    aggression: clamp((captures * 0.55 + checks * 0.9) / observedMoves),
    exchangeSeeking: clamp(captures / observedMoves),
    pawnActivity: clamp(pawnMoves / observedMoves),
    observedMoves,
  };
}

export class SwiftMind {
  private state: SwiftMindSnapshot = {
    plan: null,
    planAge: 0,
    confidence: 0,
    setbacks: 0,
    concern: "No urgent defect dominates the position.",
    opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 },
    observedHistoryLength: 0,
  };
  private lastObservedPositionKey = "";
  private lastPlanMetric: number | null = null;
  private lastMetricPlan: IdeaKind | null = null;

  observe(board: Board, generation: IdeaGeneration, profile: MindPositionProfile, history: string[] = []): SwiftMindSnapshot {
    if (history.length < this.state.observedHistoryLength) this.reset();

    const positionKey = board.toFEN().split(/\s+/).slice(0, 4).join(" ");
    if (positionKey === this.lastObservedPositionKey && history.length === this.state.observedHistoryLength) {
      // Re-searching the same position is more calculation, not more life experience.
      // Do not let UI refreshes, analysis retries, or deeper searches manufacture
      // plan age and confidence when no chess move has actually happened.
      this.state.concern = describeConcern(generation, profile);
      this.state.opponent = analyzeOpponent(history, board.turn());
      return this.snapshot();
    }

    const ideas = strategicIdeas(generation.ideas);
    const best = ideas[0];
    const current = this.state.plan;
    const currentMetric = current ? planProgressMetric(board, generation, current) : null;
    const planProgress =
      current &&
      this.lastMetricPlan === current &&
      this.lastPlanMetric !== null &&
      currentMetric !== null
        ? signedClamp(currentMetric - this.lastPlanMetric)
        : 0;
    const currentPriority = current ? planPriority(ideas, current) : -Infinity;
    const bestPriority = best?.priority ?? -Infinity;
    const tacticalEmergency = profile.tacticalPressure >= 0.24 || board.isInCheck(board.turn());

    if (!best) {
      this.state.plan = null;
      this.state.planAge = 0;
      this.state.planReason = undefined;
      this.state.confidence *= 0.75;
    } else if (tacticalEmergency && current && currentPriority !== -Infinity) {
      this.state.planReason = bestIdeaForPlan(ideas, current)?.reason ?? this.state.planReason;
      this.state.confidence = clamp(this.state.confidence - 0.04);
    } else if (!current || currentPriority === -Infinity) {
      this.state.plan = best.kind;
      this.state.planAge = 1;
      this.state.planReason = best.reason;
      this.state.planProgress = 0;
      this.state.planProgressNote = "Swift is establishing a new plan.";
      this.state.setbacks = 0;
      this.state.confidence = clamp(0.42 + bestPriority / 180);
    } else if (best.kind === current) {
      const currentIdea = bestIdeaForPlan(ideas, current);
      this.state.planAge += 1;
      this.state.planReason = currentIdea?.reason ?? this.state.planReason;
      this.state.confidence = clamp(this.state.confidence + confidenceGain(currentPriority, this.state.setbacks));
    } else {
      const inertia = 10 + this.state.confidence * 12 + Math.min(6, this.state.planAge * 1.5);
      if (bestPriority >= currentPriority + inertia) {
        this.state.plan = best.kind;
        this.state.planAge = 1;
        this.state.planReason = best.reason;
        this.state.setbacks = 0;
        this.state.confidence = clamp(0.38 + bestPriority / 190);
      } else {
        this.state.planAge += 1;
        this.state.planReason = bestIdeaForPlan(ideas, current)?.reason ?? this.state.planReason;
        this.state.confidence = clamp(this.state.confidence + confidenceGain(currentPriority, this.state.setbacks) * 0.55);
      }
    }

    if (this.state.plan && this.state.plan === current && currentMetric !== null) {
      this.state.planProgress = planProgress;
      this.state.planProgressNote = progressNote(planProgress);
      if (!tacticalEmergency) {
        if (planProgress >= 0.025) {
          this.state.confidence = clamp(this.state.confidence + Math.min(0.03, planProgress * 0.2));
        } else if (planProgress <= -0.025) {
          this.state.confidence = clamp(this.state.confidence - Math.min(0.045, Math.abs(planProgress) * 0.24));
        }
      }
    } else {
      this.state.planProgress = 0;
      this.state.planProgressNote = this.state.plan ? "Swift is establishing a new plan." : undefined;
    }

    this.state.concern = describeConcern(generation, profile);
    this.state.opponent = analyzeOpponent(history, board.turn());
    this.state.observedHistoryLength = history.length;
    this.lastObservedPositionKey = positionKey;
    this.lastMetricPlan = this.state.plan;
    this.lastPlanMetric = this.state.plan ? planProgressMetric(board, generation, this.state.plan) : null;
    return this.snapshot();
  }

  recordDecision(move: string, reason: string): SwiftMindSnapshot {
    this.state.lastMove = move;
    this.state.lastReason = reason;
    return this.snapshot();
  }

  recordSetback(reason: string): SwiftMindSnapshot {
    this.state.setbacks += 1;
    this.state.confidence = clamp(this.state.confidence * 0.62);
    this.state.lastReason = reason;
    if (this.state.confidence < 0.28) {
      this.state.plan = null;
      this.state.planAge = 0;
      this.state.planReason = undefined;
      this.state.planProgress = 0;
      this.state.planProgressNote = undefined;
    }
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
    return { ...this.state, opponent: { ...this.state.opponent } };
  }

  reset(): void {
    this.state = {
      plan: null,
      planAge: 0,
      confidence: 0,
      setbacks: 0,
      concern: "No urgent defect dominates the position.",
      opponent: { aggression: 0, exchangeSeeking: 0, pawnActivity: 0, observedMoves: 0 },
      observedHistoryLength: 0,
    };
    this.lastObservedPositionKey = "";
    this.lastPlanMetric = null;
    this.lastMetricPlan = null;
  }
}