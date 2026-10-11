import { SwiftOpening } from "./openings";
import { SwiftThinkKind } from "./play-profile";
import type { SwiftMindSnapshot } from "./mind";
import type { SwiftDecisionTrace } from "./human-engine";

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
  mind?: SwiftMindSnapshot;
  decision?: SwiftDecisionTrace;
}

export interface SwiftWorkerErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type SwiftWorkerResponse = SwiftWorkerSearchResponse | SwiftWorkerErrorResponse;
