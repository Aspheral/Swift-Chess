import { Board, Move, PieceType } from "./board";

/**
 * Optional neural imitation prior. Its only job is to express what a trained
 * human player might prefer; it is NOT a chess evaluation or tactical oracle.
 *
 * IMPORTANT: Never import/train/load a checkpoint automatically here.
 * Model use must be explicitly enabled on an experimental build and evaluated
 * against the full humanity-first release gate before any deployment.
 */
export interface HumanPolicyLayer {
  in: number;
  out: number;
  qweight: number[][];
  scale: number[];
  bias: number[];
  activation: "relu" | "identity";
}
export interface HumanPolicyModel {
  schema: string;
  feature_schema: string;
  feature_size: number;
  enabled_by_default: boolean;
  method?: string;
  training?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  layers: HumanPolicyLayer[];
}

export const HUMAN_POLICY_FEATURES = 925;
export const HUMAN_POLICY_HISTORY_PLIES = 8;
export const HUMAN_POLICY_CONTEXT_FEATURES =
  HUMAN_POLICY_FEATURES + HUMAN_POLICY_HISTORY_PLIES * 128;
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const MAX_HUMAN_POLICY_CP = 4;
const PIECES = "pnbrqk";
const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));
const mirrorForBlack = (square: number, black: boolean) =>
  black ? square ^ 56 : square;

export function encodeHumanPolicyMove(board: Board, move: Move,
                                      rating = 2200): Float32Array {
  // The exact schema matches scripts/human_policy/features.py.
  const legal = board.legalMoves().some((candidate) => candidate.uci() === move.uci());
  if (!legal) throw new Error("The human neural policy can score only legal moves");
  const values = new Float32Array(HUMAN_POLICY_FEATURES);
  const side = board.turn();
  const isBlack = side === "b";
  for (let square = 0; square < 64; square += 1) {
    const piece = board.pieceAt(square);
    if (!piece) continue;
    const kind = PIECES.indexOf(piece[1]);
    if (kind < 0) throw new Error("Unsupported chess piece");
    const plane = kind + (piece[0] === side ? 0 : 6);
    values[plane * 64 + mirrorForBlack(square, isBlack)] = 1;
  }
  values[768 + mirrorForBlack(move.from, isBlack)] = 1;
  values[832 + mirrorForBlack(move.to, isBlack)] = 1;
  const moving = board.pieceAt(move.from);
  if (!moving) throw new Error("Candidate has no moving piece");
  const moverIndex = PIECES.indexOf(moving[1]);
  if (moverIndex < 0) throw new Error("Unknown moving piece");
  values[896 + moverIndex] = 1;
  const captured = board.pieceAt(move.to);
  if (move.enPassant) values[902] = 1;
  else if (captured) values[902 + PIECES.indexOf(captured[1])] = 1;
  if (move.promotion) {
    const promotionIndex = PIECES.indexOf(move.promotion as PieceType);
    if (promotionIndex >= 0 && promotionIndex < 5) values[908 + promotionIndex] = 1;
  }

  const base = 913;
  const child = board.makeMove(move);
  const capture = move.enPassant || captured !== null;
  values[base + 0] = Number(board.isInCheck(side));
  values[base + 1] = Number(child.isInCheck(child.turn()));
  values[base + 2] = Number(capture);
  values[base + 3] = Number(move.castle);
  values[base + 4] = Number(move.enPassant);
  values[base + 5] = Number(isBlack);
  values[base + 6] = clamp((rating - 2200) / 350, -1, 1);
  const fullmove = Number(board.toFEN().split(/\s+/)[5]);
  const ply = (fullmove - 1) * 2 + Number(isBlack);
  values[base + 7] = clamp(ply / 160, 0, 1);
  const rights = board.castlingRights();
  const ourKing = isBlack ? "k" : "K";
  const ourQueen = isBlack ? "q" : "Q";
  const theirKing = isBlack ? "K" : "k";
  const theirQueen = isBlack ? "Q" : "q";
  values[base + 8] = Number(rights.includes(ourKing));
  values[base + 9] = Number(rights.includes(ourQueen));
  values[base + 10] = Number(rights.includes(theirKing));
  values[base + 11] = Number(rights.includes(theirQueen));
  return values;
}

/**
 * Match the trained Python 1949-feature human policy exactly:
 * 925 position/move features + eight past UCI plies, left zero-padded.
 * The board's CURRENT side to move fixes orientation for ALL past plies.
 * Never insert the current candidate move into the remembered history.
 */
export function encodeHumanPolicyContextMove(
  board: Board, move: Move, rating = 2200,
  moveHistory: readonly string[] = [],
): Float32Array {
  const features = new Float32Array(HUMAN_POLICY_CONTEXT_FEATURES);
  features.set(encodeHumanPolicyMove(board, move, rating));
  const recent = moveHistory.slice(-HUMAN_POLICY_HISTORY_PLIES);
  const slotOffset = HUMAN_POLICY_HISTORY_PLIES - recent.length;
  const mirror = board.turn() === "b";
  for (let index = 0; index < recent.length; index++) {
    const uci = recent[index];
    if (!UCI_MOVE.test(uci)) throw new Error("Invalid prior chess move in neural history");
    const square = (offset: number): number => (
      (Number(uci[1 + offset]) - 1) * 8 + "abcdefgh".indexOf(uci[offset])
    );
    const from = mirrorForBlack(square(0), mirror);
    const to = mirrorForBlack(square(2), mirror);
    const slot = HUMAN_POLICY_FEATURES + (slotOffset + index) * 128;
    features[slot + from] = 1;
    features[slot + 64 + to] = 1;
  }
  return features;
}

export function validateHumanPolicyModel(model: HumanPolicyModel | undefined): boolean {
  if (!model) return false;
  const legacy = model.schema === "swift-human-policy-mlp-v1" &&
    model.feature_schema === "swift-human-policy-features-v1" &&
    model.feature_size === HUMAN_POLICY_FEATURES;
  const contextual = model.schema === "swift-human-policy-context-v1" &&
    model.feature_schema === "swift-human-policy-features+history8-v1" &&
    model.feature_size === HUMAN_POLICY_CONTEXT_FEATURES;
  if ((!legacy && !contextual) ||
      model.enabled_by_default !== false ||
      !Array.isArray(model.layers) ||
      model.layers.length < 1 || model.layers.length > 6) return false;
  let input = model.feature_size;
  for (let layerIndex = 0; layerIndex < model.layers.length; layerIndex += 1) {
    const layer = model.layers[layerIndex];
    if (layer.in !== input || layer.out < 1 || layer.out > 512 ||
        layer.qweight.length !== layer.out ||
        layer.bias.length !== layer.out ||
        layer.scale.length !== layer.out ||
        (layer.activation !== "relu" && layer.activation !== "identity")) return false;
    if (layerIndex === model.layers.length - 1 &&
        (layer.out !== 1 || layer.activation !== "identity")) return false;
    for (let row = 0; row < layer.out; row += 1) {
      if (layer.qweight[row].length !== input ||
          !Number.isFinite(layer.bias[row]) ||
          !Number.isFinite(layer.scale[row]) ||
          layer.scale[row] <= 0) return false;
      for (const weight of layer.qweight[row]) {
        if (!Number.isInteger(weight) || weight < -127 || weight > 127) return false;
      }
    }
    input = layer.out;
  }
  return true;
}

export function humanPolicyLogit(model: HumanPolicyModel, features: Float32Array): number {
  if (features.length !== model.feature_size) throw new Error("Policy feature mismatch");
  let x: Float32Array = features;
  for (const layer of model.layers) {
    const y = new Float32Array(layer.out);
    for (let row = 0; row < layer.out; row += 1) {
      const weights = layer.qweight[row];
      let dot = 0;
      for (let input = 0; input < layer.in; input += 1) {
        const value = x[input];
        if (value !== 0) dot += weights[input] * value;
      }
      const score = layer.bias[row] + layer.scale[row] * dot;
      y[row] = layer.activation === "relu" ? Math.max(0, score) : score;
    }
    x = y;
  }
  return x[0];
}

/**
 * Convert a trained neural preference into a TINY bonus among candidate moves
 * already proved safe by matched-depth tactical verification.
 *
 * The bonus is capped at 4 centipawns and cannot make an unverified move legal,
 * skip a safety search, select a mate-losing option or change strict-best-play.
 */
export function humanPolicyBonuses(board: Board, verifiedMoves: Move[],
                                  model: HumanPolicyModel | undefined,
                                  rating = 2200,
                                  moveHistory: readonly string[] = []): Record<string, number> {
  if (!validateHumanPolicyModel(model) || verifiedMoves.length < 2 || !model) return {};
  const contextual = model.schema === "swift-human-policy-context-v1";
  if (contextual && moveHistory.some((uci) => !UCI_MOVE.test(uci))) return {};
  const legalKeys = new Set(board.legalMoves().map((move) => move.uci()));
  if (verifiedMoves.some((move) => !legalKeys.has(move.uci()))) return {};
  const scores = verifiedMoves.map((move) =>
    humanPolicyLogit(model,
      contextual
        ? encodeHumanPolicyContextMove(board, move, rating, moveHistory)
        : encodeHumanPolicyMove(board, move, rating)));
  if (scores.some((score) => !Number.isFinite(score))) return {};
  const best = Math.max(...scores), worst = Math.min(...scores);
  if (best - worst < 0.00001) return {};
  const result: Record<string, number> = {};
  verifiedMoves.forEach((move, i) => {
    // Do not stretch a nearly-tied neural prediction to the maximum bonus.
    // At least ~2 logits of learned separation are needed for the full 4cp.
    result[move.uci()] = clamp(
      MAX_HUMAN_POLICY_CP * (scores[i] - worst) / 2.0, 0, MAX_HUMAN_POLICY_CP);
  });
  return result;
}
