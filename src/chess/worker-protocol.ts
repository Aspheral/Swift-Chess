import { SwiftOpening } from "./openings";
import { SwiftThinkKind } from "./play-profile";

export interface SwiftWorkerSearchRequest {
  type: "search";
  id: number;
  fen: string;
  seed: number;
  moveHistory: string[];
  positionHistoryKeys: string[];
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
  opening?: SwiftOpening;
  score: number;
  depth: number;
  nodes: number;
  thinkKind: SwiftThinkKind;
  minimumThinkMs: number;
}

export interface SwiftWorkerErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type SwiftWorkerResponse = SwiftWorkerSearchResponse | SwiftWorkerErrorResponse;
