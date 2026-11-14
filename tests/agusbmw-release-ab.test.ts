import { describe, expect, it } from "vitest";
import { Board, Game, SwiftEngine } from "../src";
import { FrozenMainSwiftEngine } from "./fixtures/frozen-main-20261114";
import { replayAgusbmwGame } from "./fixtures/agusbmw";

/** Frozen main at 901f3cc; experimental branch differs only in its root pin
 * forecast and timing. This is not a calibrated Elo test.
 */
describe("Agusbmw correction versus frozen November 14 production", () => {
  const game = replayAgusbmwGame();

  it("checks exact-depth critical positions, move quality and search work", () => {
    const samples = [
      { ply: 14, depth: 4, label: "8th move" },
      { ply: 16, depth: 4, label: "9th move" },
      { ply: 18, depth: 4, label: "10th move" },
      { ply: 20, depth: 4, label: "11.Nb5 trap" },
      { ply: 20, depth: 6, label: "11.Nb5 deeper" },
      { ply: 22, depth: 4, label: "12.a4 forced" },
      { ply: 46, depth: 4, label: "24.Qxb4 sacrifice" },
      { ply: 98, depth: 4, label: "50.Rxe3 endgame" },
      { ply: -1, depth: 2, label: "known mate in one" },
    ];
    for (const { ply, depth, label } of samples) {
      const position = ply === -1
        ? Board.fromFEN("6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1")
        : game.positions[ply];
      const startBase = Date.now();
      const base = new FrozenMainSwiftEngine().search(position, { depth });
      const baseMs = Date.now() - startBase;
      const startNew = Date.now();
      const candidate = new SwiftEngine().search(position, { depth });
      const newMs = Date.now() - startNew;
      expect(base.depth).toBe(depth);
      expect(candidate.depth).toBe(depth);
      expect(position.legalMoves().some((m) => m.uci() === candidate.move?.uci())).toBe(true);
      console.log("AGUSBMW_RELEASE_AB " + JSON.stringify({
        label, ply, depth, fen: position.toFEN(),
        base: { move: base.move?.uci(), score: base.score, nodes: base.nodes, ms: baseMs },
        candidate: { move: candidate.move?.uci(), score: candidate.score, nodes: candidate.nodes, ms: newMs },
      }));
      if (label === "11.Nb5 trap") {
        expect(base.move?.uci()).toBe("c3b5");
        expect(candidate.move?.uci()).toBe("d3d1");
      }
      if (label === "24.Qxb4 sacrifice") {
        expect(candidate.move?.uci()).toBe("a4b4");
      }
    }
  }, 90_000);

  it("plays four color-reversed opening pairs, recording completed outcomes only", () => {
    const openings = [
      { name:"Reti", moves:["g1f3","d7d5","c2c4","e7e6"] },
      { name:"QGD", moves:["d2d4","d7d5","c2c4","e7e6","b1c3","g8f6"] },
      { name:"Italian", moves:["e2e4","e7e5","g1f3","b8c6","f1c4","f8c5"] },
      { name:"Slav", moves:["d2d4","d7d5","c2c4","c7c6","g1f3","g8f6"] },
    ];
    const records = [];
    for (const opening of openings) for (const candidateColor of ["w","b"] as const) {
      const match = Game.start();
      for (const uci of opening.moves) match.playUci(uci);
      const newEngine = new SwiftEngine();
      const oldEngine = new FrozenMainSwiftEngine();
      let plies = 0, newNodes = 0, oldNodes = 0, newMs = 0, oldMs = 0;
      while (match.result() === "ongoing" && plies < 60) {
        const isCandidate = match.turn() === candidateColor;
        const started = Date.now();
        const r = (isCandidate ? newEngine : oldEngine).search(match.board(), {
          depth: 3, positionHistoryKeys: match.positionHistoryKeys(),
        });
        const elapsed = Date.now() - started;
        expect(r.depth).toBe(3);
        expect(r.move).not.toBeNull();
        if (isCandidate) { newNodes += r.nodes; newMs += elapsed; }
        else { oldNodes += r.nodes; oldMs += elapsed; }
        match.play(r.move!);
        plies++;
      }
      const outcome = match.result();
      const result = outcome === "checkmate" ? (match.turn() !== candidateColor ? "win" : "loss")
        : outcome === "ongoing" ? "unresolved" : "draw";
      records.push({ opening: opening.name, candidateColor, result, plies,
        newNodes, oldNodes, newMs, oldMs, material: match.board().material() *
          (candidateColor === "w" ? 1 : -1) });
    }
    const score = records.reduce((t,game) => t + (game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0), 0);
    const completed = records.filter((x) => x.result !== "unresolved").length;
    console.log("AGUSBMW_RELEASE_PAIRED " + JSON.stringify({
      games: records.length, completed, unfinished: records.length - completed,
      scoreOnCompleted: score, records,
    }));
    expect(records).toHaveLength(8);
  }, 200_000);
});
