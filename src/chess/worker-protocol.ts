import { SwiftOpening } from "./openings";
import { SwiftThinkKind } from "./play-profile";
import type { SwiftMindSnapshot } from "./mind";
import type { SwiftDecisionTrace } from "./human-engine";
import type { SoloPlanVision } from "./plan-vision";
import type { CoachReport, CoachMoveReview } from "./coach";
import type { SwiftSecondLookReason } from "./adaptive-thinking";

export interface SwiftWorkerSearchRequest {
  type: "search";
  id: number;
  fen: string;
  seed: number;
  moveHistory: string[];
  positionHistoryKeys: string[];
  mode?: "play" | "analyze";
  /** Optional remaining clock values for timed modes; omitted in untimed Play and Analyze. */
  clockMs?: number;
  opponentClockMs?: number;
}

export interface SwiftWorkerResetRequest {
  type: "reset";
}

export interface SwiftWorkerReviewRequest {
  type: "review";
  id: number;
  fen: string;
  move: string;
}

export type SwiftWorkerRequest = SwiftWorkerSearchRequest | SwiftWorkerResetRequest | SwiftWorkerReviewRequest;

export interface SwiftWorkerProvisionalResponse {
  type: "provisional";
  id: number;
  move: string;
}

export interface SwiftWorkerThinkingResponse {
  type: "thinking";
  id: number;
  reason: SwiftSecondLookReason;
}

export interface SwiftWorkerSearchResponse {
  type: "result";
  id: number;
  move: string | null;
  pv: string[];
  suggestions?: string[];
  opening?: SwiftOpening;
  score: number;
  depth: number;
  nodes: number;
  thinkKind: SwiftThinkKind;
  minimumThinkMs: number;
  secondLook?: { reason: SwiftSecondLookReason; initialDepth: number; finalDepth: number; improvedDepth: boolean };
  mind?: SwiftMindSnapshot;
  decision?: SwiftDecisionTrace;
  planVision?: SoloPlanVision;
  coach?: CoachReport;
}

export interface SwiftWorkerErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export interface SwiftWorkerReviewResponse {
  type: "review-result";
  id: number;
  review: CoachMoveReview | null;
}

export interface SwiftWorkerReviewErrorResponse {
  type: "review-error";
  id: number;
  message: string;
}

export type SwiftWorkerResponse = SwiftWorkerSearchResponse | SwiftWorkerProvisionalResponse | SwiftWorkerThinkingResponse | SwiftWorkerErrorResponse | SwiftWorkerReviewResponse | SwiftWorkerReviewErrorResponse;
