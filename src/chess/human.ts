import { Board, Move } from "./board";
import { CandidateScore, scoreCandidates } from "./scoring";
import { understandPosition } from "./understanding";

export interface HumanStyleOptions {
  /** Preference for active, forcing play over quiet choices. */
  initiative?: number;
  /** Preference for reducing complexity through exchanges. */
  simplification?: number;
  /** Preference for natural piece development in the opening. */
  development?: number;
  /** Preference for pawn breaks and structural changes in the middlegame. */
  pawnBreaks?: number;
  /** Recent game moves used to recognize mechanical backtracking. */
  history?: string[];
}

export interface HumanSelectionOptions extends HumanStyleOptions {
  candidateLimit?: number;
  /** Choose strictly by verified score instead of applying human style preferences. */
  strictBestPlay?: boolean;
  randomness?: number;
  riskTolerance?: number;
  /** How much quality loss a human is willing to tolerate before position modifiers. */
  errorBudget?: number;
  /** Optional seed for reproducible human choices. */
  seed?: number;
  candidates?: CandidateScore[];
}

export type HumanGameStage = "opening" | "middlegame" | "endgame";

export interface HumanErrorProfile {
  /** Position complexity from legal-choice breadth. */
  complexity: number;
  /** Tactical pressure from forcing moves. */
  tacticalPressure: number;
  /** Game phase, where 0 is opening and 1 is endgame. */
  phase: number;
  /** Practical pressure from king exposure and material imbalance. */
  practicalPressure: number;
  /** Coarse game-flow stage used for practical style decisions. */
  gameStage: HumanGameStage;
  /** Final normalized error budget used for candidate selection. */
  effectiveBudget: number;
}

export interface HumanSelection {
  move: Move | null;
  candidates: CandidateScore[];
  selectedScore: number;
  profile?: HumanErrorProfile;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Turns a static human error setting into a position-aware decision budget.
 * Complex quiet positions allow more imperfect choices; tactical danger sharply
 * reduces the budget so Swift still behaves like a careful human under fire.
 */
export function humanErrorProfile(board: Board, baseBudget = 0.35): HumanErrorProfile {
  const understanding = understandPosition(board);
  const legalMoves = Math.max(1, understanding.space[understanding.sideToMove]);
  const complexity = clamp((legalMoves - 8) / 28);
  const tacticalPressure = clamp(understanding.tactics.forcingMoves / legalMoves);
  const boardField = board.toFEN().split(/\s+/)[0];
  const totalPieces = boardField.replace(/[1-8/]/g, "").length;
  const phase = clamp((16 - totalPieces) / 10);
  const ownKing = understanding.king[understanding.sideToMove];
  const enemyKing = understanding.king[understanding.sideToMove === "w" ? "b" : "w"];
  const materialSwing = clamp(Math.abs(understanding.material) / 500);
  const kingPressure = clamp((ownKing.attackers * 0.35) + (ownKing.exposed ? 0.3 : 0) + (enemyKing.exposed ? 0.15 : 0));
  const practicalPressure = clamp(kingPressure + materialSwing * 0.35);
  const gameStage: HumanGameStage = phase < 0.25 ? "opening" : phase < 0.7 ? "middlegame" : "endgame";

  const calmComplexityBonus = complexity * 0.55 + phase * 0.12;
  const pressurePenalty = tacticalPressure * 0.7 + practicalPressure * 0.55;
  const effectiveBudget = clamp(baseBudget * (1 + calmComplexityBonus - pressurePenalty));

  return { complexity, tacticalPressure, phase, practicalPressure, gameStage, effectiveBudget };
}

function isCentralPawnMove(board: Board, move: Move): boolean {
  const piece = board.pieceAt(move.from);
  if (piece?.[1] !== "p") return false;
  const file = move.to & 7;
  const rank = Math.floor(move.to / 8);
  return (file === 3 || file === 4) && (rank === 3 || rank === 4);
}

function uciSquare(uci: string, offset: number): number | null {
  const file = uci.charCodeAt(offset) - 97;
  const rank = Number(uci[offset + 1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7 || !Number.isFinite(rank)) return null;
  return rank * 8 + file;
}

/**
 * Detect the mechanical move reversal that made earlier Swift games look like
 * a machine testing the same corridor over and over. Only recent moves by the
 * side to move are considered, and this is a preference penalty, not a chess
 * rule: tactical necessities can still win the comparison.
 */
function backtrackPenalty(move: Move, history: string[]): number {
  const current = move.uci();
  const from = uciSquare(current, 0);
  const to = uciSquare(current, 2);
  if (from === null || to === null) return 0;

  let penalty = 0;
  for (let index = history.length - 2; index >= Math.max(0, history.length - 10); index -= 2) {
    const previous = history[index];
    if (!previous) continue;
    const previousFrom = uciSquare(previous, 0);
    const previousTo = uciSquare(previous, 2);
    if (previousFrom === to && previousTo === from) {
      penalty = Math.max(penalty, index === history.length - 2 ? 10 : 5);
    }
  }
  return penalty;
}

function openingNaturalness(board: Board, candidate: CandidateScore, history: string[]): number {
  if (history.length > 20) return 0;
  const moving = board.pieceAt(candidate.move.from);
  if (!moving) return 0;

  let value = 0;
  const destinationFile = candidate.move.to & 7;
  const destinationRank = Math.floor(candidate.move.to / 8);

  if (candidate.ideaKinds.includes("develop")) value += 2;
  if (moving[1] === "p" && isCentralPawnMove(board, candidate.move)) value += 1.5;

  // Early Na6/Nh6/Na3/Nh3 is legal but usually a special decision, not a
  // default development habit. Swift should reach for the natural central
  // squares unless the position gives it a concrete reason not to.
  if (moving[1] === "n" && (destinationFile === 0 || destinationFile === 7)) value -= 6;

  // Rooks moving before a useful castling decision are especially suspicious
  // in a normal opening. This directly addresses the rook shuffling pattern.
  if (moving[1] === "r" && history.length < 20) value -= 10;
  if (moving[1] === "q" && history.length < 12) value -= 3;

  value -= backtrackPenalty(candidate.move, history);
  return value;
}

function gameFlowValue(board: Board, candidate: CandidateScore, profile: HumanErrorProfile): number {
  const moving = board.pieceAt(candidate.move.from);
  if (!moving) return 0;

  if (profile.gameStage === "opening") {
    let value = 0;
    if (candidate.ideaKinds.includes("develop")) value += 3.5;
    if (candidate.move.castle) value += 5;
    if (isCentralPawnMove(board, candidate.move)) value += 2;
    if (moving[1] === "q" && !candidate.move.castle) value -= 1.5;
    return value;
  }

  if (profile.gameStage === "middlegame") {
    let value = 0;
    if (candidate.ideaKinds.includes("pawn-break")) value += 4.5;
    if (candidate.ideaKinds.includes("attack") || candidate.ideaKinds.includes("create-threat")) value += 1.5;
    return value;
  }

  let value = 0;
  if (candidate.ideaKinds.includes("simplify")) value += 3;
  if (candidate.ideaKinds.includes("create-threat")) value += 2;
  if (moving[1] === "k") value += 2;
  return value;
}

function styleValue(
  board: Board,
  candidate: CandidateScore,
  profile: HumanErrorProfile,
  options: HumanStyleOptions,
): number {
  const initiative = clamp(options.initiative ?? 0.5);
  const simplification = clamp(options.simplification ?? 0.5);
  const development = clamp(options.development ?? 0.7);
  const pawnBreaks = clamp(options.pawnBreaks ?? 0.5);
  const has = (kind: CandidateScore["ideaKinds"][number]) => candidate.ideaKinds.includes(kind);

  let value = gameFlowValue(board, candidate, profile);
  value += openingNaturalness(board, candidate, options.history ?? []);
  if (has("attack") || has("create-threat") || has("complicate")) {
    value += initiative * (4 + profile.complexity * 2) * (1 - profile.tacticalPressure * 0.35);
  }
  if (has("simplify")) {
    value += simplification * (3 + profile.phase * 2);
  }
  if (has("develop") && profile.phase < 0.45) {
    value += development * (4 + (0.45 - profile.phase) * 4);
  }
  if (has("create-weakness") && profile.phase >= 0.25 && profile.phase < 0.9) {
    value += pawnBreaks * (2 + profile.complexity * 2);
  }
  return value;
}

/**
 * Keep a small human-sized menu while preserving different plans when they
 * exist. A machine tends to over-cluster on near-identical top moves; people
 * usually compare a forcing move, an improvement, an exchange, or a pawn move
 * before choosing. Diversity is deliberately bounded so score quality remains
 * the primary signal.
 */
function diversifyCandidates(candidates: CandidateScore[], limit: number): CandidateScore[] {
  if (candidates.length <= limit) return candidates;

  const selected: CandidateScore[] = [candidates[0]];
  const seenKinds = new Set(candidates[0].ideaKinds);
  const remaining = candidates.slice(1);

  while (selected.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestUtility = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const novelKinds = candidate.ideaKinds.filter((kind) => !seenKinds.has(kind)).length;
      const scoreGap = Math.max(0, candidates[0].score - candidate.score);
      const diversityBonus = novelKinds > 0 ? Math.min(7, 2.5 + novelKinds * 1.5) : 0;
      const utility = candidate.score + diversityBonus - Math.min(6, scoreGap * 0.08);
      if (utility > bestUtility) {
        bestUtility = utility;
        bestIndex = index;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    for (const kind of chosen.ideaKinds) seenKinds.add(kind);
  }

  return selected;
}

export function selectHumanMove(board: Board, options: HumanSelectionOptions = {}): HumanSelection {
  const candidateLimit = Math.max(1, options.candidateLimit ?? 6);
  const randomness = clamp(options.randomness ?? 0.08);
  const riskTolerance = clamp(options.riskTolerance ?? 0.5);
  const baseBudget = clamp(options.errorBudget ?? 0.35);
  const generated = options.candidates ?? scoreCandidates(board).scores;
  const ranked = diversifyCandidates(generated, candidateLimit);
  if (!ranked.length) return { move: null, candidates: [], selectedScore: -Infinity };

  const profile = humanErrorProfile(board, baseBudget);
  if (options.strictBestPlay) {
    const strongest = ranked.reduce((best, candidate) => candidate.score > best.score ? candidate : best);
    return { move: strongest.move, candidates: ranked, selectedScore: strongest.score, profile };
  }

  const topScore = ranked[0].score;
  const allowedLoss = profile.effectiveBudget * 80;
  const eligible = ranked.filter((candidate) => candidate.score >= topScore - allowedLoss);
  const rng = options.seed === undefined ? Math.random : seededRandom(options.seed);
  const temperature = 1 + randomness * 5 + profile.effectiveBudget * 7;

  const adjusted = eligible.map((candidate, index) => {
    const rankPenalty = index * (1.5 + (1 - profile.effectiveBudget) * 2.5);
    const riskKinds = candidate.ideaKinds.filter(
      (kind) => kind === "complicate" || kind === "attack" || kind === "create-threat",
    ).length;
    const practicalRisk = riskKinds * 3 * riskTolerance * (1 - profile.tacticalPressure * 0.5);
    const value = candidate.score - rankPenalty + practicalRisk + styleValue(board, candidate, profile, options);
    return { candidate, value };
  });

  const best = adjusted.reduce((a, b) => (a.value >= b.value ? a : b));
  const weights = adjusted.map(({ value }) => Math.exp((value - best.value) / (10 * temperature)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  let selected = adjusted[0].candidate;
  for (let index = 0; index < adjusted.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      selected = adjusted[index].candidate;
      break;
    }
  }

  return { move: selected.move, candidates: ranked, selectedScore: selected.score, profile };
}
