import { SwiftOpening } from "./openings";
import { SwiftThinkKind } from "./play-profile";
import type { SwiftMindSnapshot } from "./mind";
import type { SwiftDecisionTrace } from "./human-engine";
import type { SwiftSecondLookReason } from "./adaptive-thinking";

export interface SwiftWorkerSearchRequest {
  type: "search";
  id: number;
  fen: string;
  seed: number;
  moveHistory: string[];
  positionHistoryKeys: string[];
  mode?: "play" | "analyze";
}

export interface SwiftWorkerResetRequest {
  type: "reset";
}

export type SwiftWorkerRequest = SwiftWorkerSearchRequest | SwiftWorkerResetRequest;

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
}

export interface SwiftWorkerErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type SwiftWorkerResponse = SwiftWorkerSearchResponse | SwiftWorkerThinkingResponse | SwiftWorkerErrorResponse;
