"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveSeed, Game, HumanSwiftEngine, Move, Piece, SwiftOpening } from "../src";

const files = "abcdefgh";
const pieceNames: Record<Piece, string> = {
  wk: "white king", wq: "white queen", wr: "white rook", wb: "white bishop", wn: "white knight", wp: "white pawn",
  bk: "black king", bq: "black queen", br: "black rook", bb: "black bishop", bn: "black knight", bp: "black pawn",
};

type PromotionPiece = "q" | "r" | "b" | "n";
type Side = "w" | "b";
type Arrow = { from: number; to: number };

function squareName(index: number) {
  return `${files[index & 7]}${Math.floor(index / 8) + 1}`;
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
      <defs><linearGradient id={`piece-${piece}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={fill} /><stop offset="1" stopColor={shadow} /></linearGradient></defs>
      {kind === "p" && <g {...common}><path d="M50 15c-10 0-16 8-16 17 0 7 3 12 8 16-8 4-14 11-15 21h46c-1-10-7-17-15-21 5-4 8-9 8-16 0-9-6-17-16-17Z" fill={`url(#piece-${piece})`} /><path d="M20 78h60v9H20z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "r" && <g {...common}><path d="M28 18h10v8h8v-8h8v8h8v-8h10v18l-7 8v27H35V44l-7-8V18Z" fill={`url(#piece-${piece})`} /><path d="M23 71h54v9H23z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "n" && <g {...common}><path d="M25 80h51v-9H65c4-12 1-25-8-36-5-6-11-10-18-14l2 15-12 8 10 4c-8 8-11 19-9 32H25Z" fill={`url(#piece-${piece})`} /><path d="M29 42c8-2 15 0 20 5M47 30l7 3" fill="none" /></g>}
      {kind === "b" && <g {...common}><path d="M50 14c-8 5-13 12-13 20 0 8 4 14 10 19-8 4-14 10-16 18h38c-2-8-8-14-16-18 6-5 10-11 10-19 0-8-5-15-13-20Z" fill={`url(#piece-${piece})`} /><path d="m43 24 14 14M57 24 43 38" fill="none" /><path d="M21 78h58v9H21z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "q" && <g {...common}><path d="m25 28 9 10 10-18 6 18 6-18 10 18 9-10-7 36H32L25 28Z" fill={`url(#piece-${piece})`} /><circle cx="25" cy="24" r="5" fill={fill}/><circle cx="50" cy="16" r="5" fill={fill}/><circle cx="75" cy="24" r="5" fill={fill}/><path d="M29 64h42v9H29zM22 76h56v10H22z" fill={`url(#piece-${piece})`} /></g>}
      {kind === "k" && <g {...common}><path d="M45 14h10v9h9v10h-9v8c7 4 11 10 11 19H34c0-9 4-15 11-19v-8H36V23h9v-9Z" fill={`url(#piece-${piece})`} /><path d="M27 69h46v8H27zM20 79h60v9H20z" fill={`url(#piece-${piece})`} /><path d="M50 27V13M44 20h12" fill="none" /></g>}
    </svg>
  );
}

const resultLabels: Record<string, string> = {
  threefold: "Draw by threefold repetition",
  "fifty-move": "Draw by the fifty-move rule",
  "insufficient-material": "Draw by insufficient material",
  stalemate: "Stalemate",
};

function ThoughtArrows({ arrows, flipped }: { arrows: Arrow[]; flipped: boolean }) {
  const point = (square: number) => {
    const file = square & 7;
    const rank = Math.floor(square / 8);
    const visualFile = flipped ? 7 - file : file;
    const visualRank = flipped ? rank : 7 - rank;
    return { x: visualFile * 12.5 + 6.25, y: visualRank * 12.5 + 6.25 };
  };

  return (
    <svg className="thought-arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><marker id="swift-arrowhead" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" /></marker></defs>
      {arrows.map((arrow, index) => {
        const from = point(arrow.from); const to = point(arrow.to);
        const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.max(1, Math.hypot(dx, dy));
        const inset = 2.1;
        return <line key={`${arrow.from}-${arrow.to}-${index}`} x1={from.x + (dx / length) * inset} y1={from.y + (dy / length) * inset} x2={to.x - (dx / length) * inset} y2={to.y - (dy / length) * inset} className="thought-arrow" markerEnd="url(#swift-arrowhead)" />;
      })}
    </svg>
  );
}

export default function Playground() {
  const engine = useMemo(() => new HumanSwiftEngine(), []);
  const gameRef = useRef<Game>(Game.start());
  const openingSeed = useRef(Date.now() & 0xffffffff);
  const [board, setBoard] = useState(() => gameRef.current.board());
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [promotion, setPromotion] = useState<{ moves: Move[] } | null>(null);
  const [opening, setOpening] = useState<SwiftOpening | null>(null);
  const [playerSide, setPlayerSide] = useState<Side>("w");
  const [flipped, setFlipped] = useState(false);
  const [thoughtArrows, setThoughtArrows] = useState<Arrow[]>([]);
  const gameVersion = useRef(0);

  const legalMoves = board.legalMoves();
  const selectedMoves = selected === null ? [] : legalMoves.filter((move) => move.from === selected);
  const selectedTargets = new Set(selectedMoves.map((move) => move.to));
  const result = gameRef.current.result();
  const terminal = result !== "ongoing";
  const turn = board.toFEN().split(/\s+/)[1] as Side;
  const inCheck = board.isInCheck(turn);

  function runSwift(version: number, game: Game) {
    setThinking(true);
    setTimeout(() => {
      if (version !== gameVersion.current || gameRef.current !== game) return;
      const current = game.board();
      const engineResult = engine.search(current, {
        depth: 5,
        timeMs: 800,
        randomness: 0.012,
        errorBudget: 0.05,
        safetyDepth: 4,
        ponderDepth: 4,
        safetyMargin: 28,
        safetyTimeMs: 100,
        ponderTimeMs: 120,
        candidateLimit: 5,
        safetyCandidateLimit: 4,
        concreteCandidateLimit: 8,
        tacticalSearchDepth: 3,
        seed: deriveSeed(openingSeed.current, game.moveHistory().length),
        moveHistory: game.moveHistory(),
        positionHistoryKeys: game.positionHistoryKeys(),
      });
      if (version !== gameVersion.current || gameRef.current !== game) return;
      setThoughtArrows((engineResult.pv ?? []).slice(0, 4).map((move) => ({ from: move.from, to: move.to })));
      if (engineResult.opening) setOpening(engineResult.opening);
      if (game.turn() === "b" || playerSide === "b") {
        if (engineResult.move) {
          game.play(engineResult.move); setBoard(game.board()); setLastMove({ from: engineResult.move.from, to: engineResult.move.to }); setHistory(game.moveHistory());
        }
      }
      setThinking(false);
    }, 70);
  }

  function reset(side: Side = playerSide) {
    gameVersion.current += 1;
    gameRef.current = Game.start();
    openingSeed.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    setBoard(gameRef.current.board()); setSelected(null); setHistory([]); setLastMove(null); setThinking(false); setPromotion(null); setOpening(null); setThoughtArrows([]); setPlayerSide(side); setFlipped(side === "b");
    if (side === "b") runSwift(gameVersion.current, gameRef.current);
  }

  function applyHumanMove(move: Move) {
    const game = gameRef.current;
    game.play(move);
    const next = game.board();
    setBoard(next); setSelected(null); setPromotion(null); setLastMove({ from: move.from, to: move.to }); setHistory(game.moveHistory());
    if (game.result() !== "ongoing") { setThoughtArrows([]); return; }
    runSwift(gameVersion.current, game);
  }

  function chooseMove(moves: Move[]) {
    if (moves.length === 1) { applyHumanMove(moves[0]); return; }
    setPromotion({ moves });
  }

  function clickSquare(index: number) {
    if (thinking || terminal || turn !== playerSide || promotion) return;
    const piece = board.pieceAt(index);
    if (selectedTargets.has(index)) { chooseMove(selectedMoves.filter((move) => move.to === index)); return; }
    if (piece?.startsWith(playerSide)) { setSelected(index); return; }
    setSelected(null);
  }

  function dragStart(event: React.DragEvent, index: number) {
    if (thinking || terminal || turn !== playerSide || !board.pieceAt(index)?.startsWith(playerSide)) { event.preventDefault(); return; }
    setSelected(index); event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move";
  }

  function dropSquare(event: React.DragEvent, target: number) {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(from)) return;
    const moves = board.legalMoves().filter((move) => move.from === from && move.to === target);
    if (moves.length) chooseMove(moves);
  }

  const status = thinking ? "Swift is considering the position…" : terminal ? (result === "checkmate" ? `Checkmate · ${turn === playerSide ? "Swift" : "You"} wins` : resultLabels[result] ?? "Game over") : turn === playerSide ? (inCheck ? "Your king is in check" : "Your move") : "Swift to move";
  const promotionOptions: Array<{ piece: PromotionPiece; label: string }> = [{ piece: "q", label: "Queen" }, { piece: "r", label: "Rook" }, { piece: "b", label: "Bishop" }, { piece: "n", label: "Knight" }];

  useEffect(() => {
    if (turn === playerSide || terminal || thinking) return;
    runSwift(gameVersion.current, gameRef.current);
  }, [turn, playerSide, terminal]);

  return (
    <section className="playground" id="play">
      <div className="play-head">
        <div><p className="eyebrow">YOUR GAME</p><h2>Set up the board. See what happens.</h2><p>Play as White or Black, turn the board around, and follow the lines Swift is considering as the position changes.</p></div>
        <div className="game-controls">
          <div className="side-picker" aria-label="Choose your side">
            <button className={playerSide === "w" ? "active" : ""} onClick={() => reset("w")}>White</button>
            <button className={playerSide === "b" ? "active" : ""} onClick={() => reset("b")}>Black</button>
          </div>
          <button className="flip" onClick={() => setFlipped((value) => !value)} aria-label="Flip board">↻ Flip board</button>
          <button className="reset" onClick={() => reset()}>New game</button>
        </div>
      </div>
      <div className="game-shell">
        <div className="chess-wrap">
          <div className="chessboard-frame">
            <div className="rank-labels" aria-hidden="true">{(flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1]).map((rank) => <span key={rank}>{rank}</span>)}</div>
            <div className="chessboard" aria-label="Interactive chessboard">
              {Array.from({ length: 64 }, (_, visualIndex) => {
                const visualRank = Math.floor(visualIndex / 8); const visualFile = visualIndex % 8;
                const rank = flipped ? visualRank : 7 - visualRank; const file = flipped ? 7 - visualFile : visualFile; const index = rank * 8 + file;
                const piece = board.pieceAt(index); const isSelected = selected === index; const isTarget = selectedTargets.has(index); const isLast = lastMove?.from === index || lastMove?.to === index; const isKingInCheck = piece?.[1] === "k" && piece[0] === turn && inCheck; const dark = (rank + file) % 2 === 1;
                return <button key={index} className={`square ${dark ? "dark" : "light"} ${isSelected ? "selected" : ""} ${isTarget ? "target" : ""} ${isLast ? "last" : ""} ${isKingInCheck ? "in-check" : ""}`} onClick={() => clickSquare(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropSquare(event, index)} aria-label={piece ? `${pieceNames[piece]} on ${squareName(index)}` : squareName(index)}>
                  {piece && <span className={`piece ${piece[0]}`} draggable={piece[0] === playerSide} onDragStart={(event) => dragStart(event, index)}><PieceArt piece={piece} /></span>}
                  {isTarget && <span className={`move-dot ${piece ? "capture" : ""}`} />}
                </button>;
              })}
              <ThoughtArrows arrows={thoughtArrows} flipped={flipped} />
            </div>
            <div className="file-labels" aria-hidden="true">{(flipped ? files.split("").reverse() : files.split("")).map((file) => <span key={file}>{file}</span>)}</div>
          </div>
          {promotion && <div className="promotion" role="dialog" aria-label="Choose promotion piece"><span>Promote to</span>{promotionOptions.map(({ piece, label }) => <button key={piece} onClick={() => { const move = promotion.moves.find((candidate) => candidate.promotion === piece); if (move) applyHumanMove(move); }}><PieceArt piece={`${playerSide}${piece}` as Piece} /><small>{label}</small></button>)}</div>}
        </div>
        <aside className="game-info">
          <div className="game-status"><span className={thinking ? "pulse" : "dot"} />{status}</div>
          <div className="thought-card"><span>Swift's board</span><strong>{thoughtArrows.length ? `${thoughtArrows.length} moves in view` : "Thinking from here"}</strong><p>Arrows stay on the board to show the line Swift is considering.</p></div>
          {opening && <div className="opening-card"><span>Opening</span><strong>{opening}</strong></div>}
          <div className="history-head"><span>Moves</span><span>{history.length}</span></div>
          <div className="history">{history.length === 0 ? <span className="muted">The first move is yours.</span> : history.map((move, index) => <div className="move" key={`${move}-${index}`}><span>{Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"}</span><code>{move}</code></div>)}</div>
        </aside>
      </div>
    </section>
  );
}
