"use client";

import { useMemo, useState } from "react";
import { Board, HumanSwiftEngine, Move, Piece } from "../src";

const glyphs: Record<Piece, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const files = "abcdefgh";

function squareName(index: number) {
  return `${files[index & 7]}${Math.floor(index / 8) + 1}`;
}

function moveLabel(move: Move) {
  return move.uci();
}

export default function Playground() {
  const engine = useMemo(() => new HumanSwiftEngine(), []);
  const [board, setBoard] = useState(() => Board.start());
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);

  const legalMoves = board.legalMoves();
  const selectedMoves = selected === null ? [] : legalMoves.filter((move) => move.from === selected);
  const selectedTargets = new Set(selectedMoves.map((move) => move.to));
  const terminal = board.isCheckmate() || board.isStalemate();
  const turn = board.toFEN().split(/\s+/)[1] as "w" | "b";
  const inCheck = board.isInCheck(turn);

  function reset() {
    setBoard(Board.start());
    setSelected(null);
    setHistory([]);
    setThinking(false);
  }

  function play(move: Move) {
    const next = board.makeMove(move);
    setBoard(next);
    setSelected(null);
    setHistory((items) => [...items, moveLabel(move)]);

    if (next.isCheckmate() || next.isStalemate()) return;
    if (next.toFEN().split(/\s+/)[1] !== "b") return;

    setThinking(true);
    window.setTimeout(() => {
      const result = engine.search(next, {
        depth: 2,
        randomness: 0.16,
        errorBudget: 0.3,
        safetyDepth: 2,
        seed: Date.now() & 0xffffffff,
      });
      if (result.move) {
        setBoard((current) => current.makeMove(result.move!));
        setHistory((items) => [...items, moveLabel(result.move!)]);
      }
      setThinking(false);
    }, 40);
  }

  function clickSquare(index: number) {
    if (thinking || terminal || turn !== "w") return;
    const piece = board.pieceAt(index);

    if (selectedTargets.has(index)) {
      const moves = selectedMoves.filter((move) => move.to === index);
      const move = moves.find((candidate) => !candidate.promotion) ?? moves.find((candidate) => candidate.promotion === "q");
      if (move) play(move);
      return;
    }

    if (piece?.startsWith("w")) {
      setSelected(index);
      return;
    }
    setSelected(null);
  }

  let status = thinking ? "Swift is thinking…" : terminal ? (board.isCheckmate() ? `Checkmate · ${turn === "w" ? "Swift" : "You"} wins` : "Stalemate · draw") : turn === "w" ? (inCheck ? "Your king is in check" : "Your move · White") : "Swift to move";

  return (
    <section className="playground">
      <div className="play-head">
        <div><p className="eyebrow">01 · SWIFT PLAYGROUND</p><h2>Play against a human-shaped engine.</h2><p>White is you. Swift plays Black with tactical safety, positional ideas, and a bounded error budget.</p></div>
        <button className="reset" onClick={reset}>New game</button>
      </div>
      <div className="game-shell">
        <div className="chess-wrap">
          <div className="chessboard" aria-label="Interactive chessboard">
            {Array.from({ length: 64 }, (_, visualIndex) => {
              const rank = 7 - Math.floor(visualIndex / 8);
              const file = visualIndex % 8;
              const index = rank * 8 + file;
              const piece = board.pieceAt(index);
              const isSelected = selected === index;
              const isTarget = selectedTargets.has(index);
              const dark = (rank + file) % 2 === 1;
              return <button key={index} className={`square ${dark ? "dark" : "light"} ${isSelected ? "selected" : ""} ${isTarget ? "target" : ""}`} onClick={() => clickSquare(index)} aria-label={squareName(index)}>
                {piece && <span className={`piece ${piece[0]}`}>{glyphs[piece]}</span>}
                {isTarget && <span className="move-dot" />}
              </button>;
            })}
          </div>
          <div className="board-coordinates"><span>a</span><span>b</span><span>c</span><span>d</span><span>e</span><span>f</span><span>g</span><span>h</span></div>
        </div>
        <aside className="game-info">
          <div className="game-status"><span className={thinking ? "pulse" : "dot"} />{status}</div>
          <div className="history-head"><span>MOVE HISTORY</span><span>{history.length}</span></div>
          <div className="history">{history.length === 0 ? <span className="muted">The board is waiting.</span> : history.map((move, index) => <div className="move" key={`${move}-${index}`}><span>{Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"}</span><code>{move}</code></div>)}</div>
          <div className="engine-note"><strong>SWIFT / HUMAN ENGINE</strong><span>Depth 2 · safety layer active</span></div>
        </aside>
      </div>
    </section>
  );
}
