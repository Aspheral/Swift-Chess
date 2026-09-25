import { Board } from "./board";
import { HumanSwiftEngine } from "./human-engine";
import { swiftPlayProfile } from "./play-profile";
import { SwiftWorkerRequest, SwiftWorkerResponse } from "./worker-protocol";

type WorkerContext = {
  onmessage: ((event: MessageEvent<SwiftWorkerRequest>) => void) | null;
  postMessage: (message: SwiftWorkerResponse) => void;
};

const context = self as unknown as WorkerContext;
let engine = new HumanSwiftEngine();
let analysisEngines: Record<"w" | "b", HumanSwiftEngine> = {
  w: new HumanSwiftEngine(),
  b: new HumanSwiftEngine(),
};

context.onmessage = (event) => {
  const request = event.data;

  if (request.type === "reset") {
    engine = new HumanSwiftEngine();
    analysisEngines = { w: new HumanSwiftEngine(), b: new HumanSwiftEngine() };
    return;
  }

  try {
    const board = Board.fromFEN(request.fen);
    const profile = swiftPlayProfile(board, request.moveHistory);
    const activeEngine = request.mode === "analyze" ? analysisEngines[board.turn()] : engine;
    const result = activeEngine.search(board, {
      ...profile.options,
      seed: request.seed,
      moveHistory: request.moveHistory,
      positionHistoryKeys: request.positionHistoryKeys,
    });

    const suggestions = [result.move?.uci(), ...result.humanCandidates.map((candidate) => candidate.move.uci())]
      .filter((move): move is string => Boolean(move))
      .filter((move, index, moves) => moves.indexOf(move) === index)
      .slice(0, 4);

    context.postMessage({
      type: "result",
      id: request.id,
      move: result.move?.uci() ?? null,
      pv: (result.pv ?? []).map((move) => move.uci()),
      suggestions,
      opening: result.opening,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      thinkKind: profile.kind,
      minimumThinkMs: profile.minimumThinkMs,
      mind: result.mind,
      decision: result.decision,
    });
  } catch (error) {
    context.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : "Swift worker failed",
    });
  }
};
