"use client";

import { useMemo, useRef, useState } from "react";
import { Board, HumanSwiftEngine, Move, Piece } from "../src";

const files = "abcdefgh";
const pieceNames: Record<Piece, string> = {
  wk: "white king", wq: "white queen", wr: "white rook", wb: "white bishop", wn: "white knight", wp: "white pawn",
  bk: "black king", bq: "black queen", br: "black rook", bb: "black bishop", bn: "black knight", bp: "black pawn",
};

type PromotionPiece = "q" | "r" | "b" | "n";

function squareName(index: number) {
  return `${files[index & 7]}${Math.floor(index / 8) + 1}`;
}

function moveLabel(move: Move) {
  return move.uci();
}

function PieceArt({ piece }: { piece: Piece }) {
  const white = piece[0] === "w";
  const kind = piece[1];
  const fill = white ? "#f7f4f2" : "#3f9fc4";
  const stroke = white ? "#6f6870" : "#173c50";
  const shadow = white ? "#b9b2b6" : "#245c73";
  const common = { fill, stroke, strokeWidth: 3.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  return (
    <svg className="piece-art" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`piece-${piece}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fill} />
          <stop offset="1" stopColor={shadow} />
        </linearGradient>
      </defs>
      {kind === "p" && <g {...common}><path d="M50 15c-10 0-16 8-16 17 0 7 3 12 8 16-8 4-14 11-15 21h46c-1-10-7-17-15-21 5-4 8-9 8-16 0-9-6-17-16-17Z" fill={`url(#piece-${piece})`} /><path d="M20 78h60v9H20z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "r" && <g {...common}><path d="M28 18h10v8h8v-8h8v8h8v-8h10v18l-7 8v27H35V44l-7-8V18Z" fill={`url(#piece-${piece})`} /><path d="M23 71h54v9H23z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "n" && <g {...common}><path d="M25 80h51v-9H65c4-12 1-25-8-36-5-6-11-10-18-14l2 15-12 8 10 4c-8 8-11 19-9 32H25Z" fill={`url(#piece-${piece})`} /><path d="M29 42c8-2 15 0 20 5M47 30l7 3" fill="none" /></g>}
      {kind === "b" && <g {...common}><path d="M50 14c-8 5-13 12-13 20 0 8 4 14 10 19-8 4-14 10-16 18h38c-2-8-8-14-16-18 6-5 10-11 10-19 0-8-5-15-13-20Z" fill={`url(#piece-${piece})`} /><path d="m43 24 14 14M57 24 43 38" fill="none" /><path d="M21 78h58v9H21z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "q" && <g {...common}><path d="m25 28 9 10 10-18 6 18 6-18 10 18 9-10-7 36H32L25 28Z" fill={`url(#piece-${piece})`} /><circle cx="25" cy="24" r="5" fill={fill}/><circle cx="50" cy="16" r="5" fill={fill}/><circle cx="75" cy="24" r="5" fill={fill}/><path d="M29 64h42v9H29zM22 76h56v10H22z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "k" && <g {...common}><path d="M45 14h10v9h9v10h-9v8c7 4 11 10 11 19H34c0-9 4-15 11-19v-8H36V23h9v-9Z" fill={`url(#piece-${piece})`} /><path d="M27 69h46v8H27zM20 79h60v9H20z" fill={`url(#piece-${piece})`} /><path d="M50 27V13M44 20h12" fill="none" /></g>}
    </svg>
  );
}

export default function Playground() {
  const engine = useMemo(() => new HumanSwiftEngine(), []);
  const [board, setBoard] = useState(() => Board.start());
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [promotion, setPromotion] = useState<{ moves: Move[]; target: number } | null>(null);
  const gameRef = useRef(0);

  const legalMoves = board.legalMoves();
  const selectedMoves = selected === null ? [] : legalMoves.filter((move) => move.from === selected);
  const selectedTargets = new Set(selectedMoves.map((move) => move.to));
  const terminal = board.isCheckmate() || board.isStalemate();
  const turn = board.toFEN().split(/\s+/)[1] as "w" | "b";
  const inCheck = board.isInCheck(turn);

  function reset() {
    gameRef.current += 1;
    setBoard(Board.start());
    setSelected(null);
    setHistory([]);
    setLastMove(null);
    setThinking(false);
    setPromotion(null);
  }

  function applyHumanMove(move: Move) {
    const next = board.makeMove(move);
    setBoard(next);
    setSelected(null);
    setPromotion(null);
    setLastMove({ from: move.from, to: move.to });
    setHistory((items) => [...items, moveLabel(move)]);

    if (next.isCheckmate() || next.isStalemate() || next.toFEN().split(/\s+/)[1] !== "b") return;

    const game = gameRef.current;
    setThinking(true);
    window.setTimeout(() => {
      if (game !== gameRef.current) return;
      const result = engine.search(next, {
        depth: 2,
        randomness: 0.16,
        errorBudget: 0.3,
        safetyDepth: 2,
        seed: Date.now() & 0xffffffff,
      });
      if (game !== gameRef.current) return;
      if (result.move) {
        setBoard((current) => current.makeMove(result.move!));
        setLastMove({ from: result.move.from, to: result.move.to });
        setHistory((items) => [...items, moveLabel(result.move!)]);
      }
      setThinking(false);
    }, 90);
  }

  function chooseMove(moves: Move[], target: number) {
    if (moves.length === 1) {
      applyHumanMove(moves[0]);
      return;
    }
    setPromotion({ moves, target });
  }

  function clickSquare(index: number) {
    if (thinking || terminal || turn !== "w" || promotion) return;
    const piece = board.pieceAt(index);

    if (selectedTargets.has(index)) {
      chooseMove(selectedMoves.filter((move) => move.to === index), index);
      return;
    }
    if (piece?.startsWith("w")) {
      setSelected(index);
      return;
    }
    setSelected(null);
  }

  function dragStart(event: React.DragEvent, index: number) {
    if (thinking || terminal || turn !== "w" || !board.pieceAt(index)?.startsWith("w")) {
      event.preventDefault();
      return;
    }
    setSelected(index);
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
  }

  function dropSquare(event: React.DragEvent, target: number) {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(from)) return;
    const moves = board.legalMoves().filter((move) => move.from === from && move.to === target);
    if (moves.length) chooseMove(moves, target);
  }

  let status = thinking ? "Swift is thinking…" : terminal ? (board.isCheckmate() ? `Checkmate · ${turn === "w" ? "Swift" : "You"} wins` : "Stalemate · draw") : turn === "w" ? (inCheck ? "Your king is in check" : "Your move") : "Swift to move";

  const promotionOptions: Array<{ piece: PromotionPiece; label: string }> = [
    { piece: "q", label: "Queen" }, { piece: "r", label: "Rook" }, { piece: "b", label: "Bishop" }, { piece: "n", label: "Knight" },
  ];

  return (
    <section className="playground" id="play">
      <div className="play-head">
        <div><p className="eyebrow">01 · SWIFT PLAYGROUND</p><h2>Play against a human-shaped engine.</h2><p>Drag or tap a piece. Swift plays Black with tactical safety, positional ideas, and a bounded error budget.</p></div>
        <button className="reset" onClick={reset}>New game</button>
      </div>
      <div className="game-shell">
        <div className="chess-wrap">
          <div className="chessboard-frame">
            <div className="rank-labels" aria-hidden="true">{[8,7,6,5,4,3,2,1].map((rank) => <span key={rank}>{rank}</span>)}</div>
            <div className="chessboard" aria-label="Interactive chessboard">
              {Array.from({ length: 64 }, (_, visualIndex) => {
                const rank = 7 - Math.floor(visualIndex / 8);
                const file = visualIndex % 8;
                const index = rank * 8 + file;
                const piece = board.pieceAt(index);
                const isSelected = selected === index;
                const isTarget = selectedTargets.has(index);
                const isLast = lastMove?.from === index || lastMove?.to === index;
                const isKingInCheck = piece?.[1] === "k" && piece[0] === turn && inCheck;
                const dark = (rank + file) % 2 === 1;
                return <button key={index} className={`square ${dark ? "dark" : "light"} ${isSelected ? "selected" : ""} ${isTarget ? "target" : ""} ${isLast ? "last" : ""} ${isKingInCheck ? "in-check" : ""}`} onClick={() => clickSquare(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropSquare(event, index)} aria-label={piece ? `${pieceNames[piece]} on ${squareName(index)}` : squareName(index)}>
                  {piece && <span className={`piece ${piece[0]}`} draggable={piece[0] === "w"} onDragStart={(event) => dragStart(event, index)}><PieceArt piece={piece} /></span>}
                  {isTarget && <span className={`move-dot ${piece ? "capture" : ""}`} />}
                </button>;
              })}
            </div>
            <div className="file-labels" aria-hidden="true">{files.split("").map((file) => <span key={file}>{file}</span>)}</div>
          </div>
          {promotion && <div className="promotion" role="dialog" aria-label="Choose promotion piece"><span>Promote to</span>{promotionOptions.map(({ piece, label }) => <button key={piece} onClick={() => { const move = promotion.moves.find((candidate) => candidate.promotion === piece); if (move) applyHumanMove(move); }}><PieceArt piece={`w${piece}` as Piece} /><small>{label}</small></button>)}</div>}
        </div>
        <aside className="game-info">
          <div className="game-status"><span className={thinking ? "pulse" : "dot"} />{status}</div>
          <div className="history-head"><span>MOVE HISTORY</span><span>{history.length}</span></div>
          <div className="history">{history.length === 0 ? <span className="muted">Make the first move.</span> : history.map((move, index) => <div className="move" key={`${move}-${index}`}><span>{Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"}</span><code>{move}</code></div>)}</div>
          <div className="engine-note"><strong>SWIFT / HUMAN ENGINE</strong><span>Drag · tap · legal moves · promotion</span></div>
        </aside>
      </div>
    </section>
  );
}
