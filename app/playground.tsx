"use client";

import { useEffect, useRef, useState } from "react";
import { Game, Move, Piece, SwiftOpening } from "../src";
import type { SwiftMindSnapshot } from "../src";
import type { SwiftWorkerResponse } from "../src/chess/worker-protocol";

const files = "abcdefgh";
const pieceNames: Record<Piece, string> = {
  wk: "white king", wq: "white queen", wr: "white rook", wb: "white bishop", wn: "white knight", wp: "white pawn",
  bk: "black king", bq: "black queen", br: "black rook", bb: "black bishop", bn: "black knight", bp: "black pawn",
};

type PromotionPiece = "q" | "r" | "b" | "n";
type Side = "w" | "b";
type GameMode = "play" | "analyze";
type Arrow = { from: number; to: number };

function squareName(index: number) {
  return `${files[index & 7]}${Math.floor(index / 8) + 1}`;
}

function squareIndex(square: string): number | null {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  return (Number(square[1]) - 1) * 8 + square.charCodeAt(0) - 97;
}

function planLabel(plan: string): string {
  return plan.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function arrowFromUci(uci: string): Arrow | null {
  const from = squareIndex(uci.slice(0, 2));
  const to = squareIndex(uci.slice(2, 4));
  return from === null || to === null ? null : { from, to };
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
      <defs><marker id="swift-arrowhead" markerWidth="6" markerHeight="6" refX="5.1" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" /></marker></defs>
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
  const gameRef = useRef<Game>(Game.start());
  const openingSeed = useRef(Date.now() & 0xffffffff);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const activeSearchRef = useRef<{ id: number; version: number; game: Game; startedAt: number } | null>(null);
  const playerSideRef = useRef<Side>("w");
  const analysisModeRef = useRef(false);
  const [board, setBoard] = useState(() => gameRef.current.board());
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [promotion, setPromotion] = useState<{ moves: Move[] } | null>(null);
  const [opening, setOpening] = useState<SwiftOpening | null>(null);
  const [playerSide, setPlayerSide] = useState<Side>("w");
  const [mode, setMode] = useState<GameMode>("play");
  const [flipped, setFlipped] = useState(false);
  const [thoughtArrows, setThoughtArrows] = useState<Arrow[]>([]);
  const [mind, setMind] = useState<SwiftMindSnapshot | null>(null);
  const gameVersion = useRef(0);

  const legalMoves = board.legalMoves();
  const selectedMoves = selected === null ? [] : legalMoves.filter((move) => move.from === selected);
  const selectedTargets = new Set(selectedMoves.map((move) => move.to));
  const result = gameRef.current.result();
  const terminal = result !== "ongoing";
  const turn = board.toFEN().split(/\s+/)[1] as Side;
  const inCheck = board.isInCheck(turn);
  const analysisMode = mode === "analyze";
  const canUndoPlayerMove = analysisMode ? history.length > 0 : history.some((_, index) =>
    (index % 2 === 0 ? "w" : "b") === playerSide,
  );

  function ensureWorker(): Worker {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL("../src/chess/browser-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SwiftWorkerResponse>) => {
      const response = event.data;
      const active = activeSearchRef.current;
      if (!active || response.id !== active.id) return;

      if (response.type === "error") {
        activeSearchRef.current = null;
        setThinking(false);
        return;
      }

      const finish = () => {
        const latest = activeSearchRef.current;
        if (
          !latest ||
          latest.id !== response.id ||
          latest.version !== gameVersion.current ||
          gameRef.current !== latest.game
        ) return;

        const game = latest.game;
        const move = response.move
          ? game.legalMoves().find((candidate) => candidate.uci() === response.move)
          : null;

        const arrowMoves = analysisModeRef.current
          ? (response.suggestions?.length ? response.suggestions : response.move ? [response.move] : [])
          : response.pv.slice(0, 4);
        setThoughtArrows(
          arrowMoves
            .map(arrowFromUci)
            .filter((arrow): arrow is Arrow => arrow !== null),
        );
        if (response.opening) setOpening(response.opening);
        setMind(response.mind ?? null);

        if (move && !analysisModeRef.current && game.turn() !== playerSideRef.current) {
          game.play(move);
          setBoard(game.board());
          setLastMove({ from: move.from, to: move.to });
          setHistory(game.moveHistory());
        }

        activeSearchRef.current = null;
        setThinking(false);
      };

      const elapsed = performance.now() - active.startedAt;
      const remaining = analysisModeRef.current ? 0 : Math.max(0, response.minimumThinkMs - elapsed);
      if (remaining > 0) window.setTimeout(finish, remaining);
      else finish();
    };
    worker.onerror = () => {
      activeSearchRef.current = null;
      setThinking(false);
    };
    workerRef.current = worker;
    return worker;
  }

  function restartWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
    activeSearchRef.current = null;
  }

  function runSwift(version: number, game: Game) {
    if (version !== gameVersion.current || gameRef.current !== game || (!analysisModeRef.current && game.turn() === playerSideRef.current)) return;
    const id = ++requestIdRef.current;
    activeSearchRef.current = { id, version, game, startedAt: performance.now() };
    setThinking(true);
    ensureWorker().postMessage({
      type: "search",
      id,
      fen: game.fen(),
      seed: openingSeed.current,
      moveHistory: game.moveHistory(),
      positionHistoryKeys: game.positionHistoryKeys(),
      mode: analysisModeRef.current ? "analyze" : "play",
    });
  }

  function setGameMode(nextMode: GameMode) {
    if (mode === nextMode) return;
    gameVersion.current += 1;
    restartWorker();
    analysisModeRef.current = nextMode === "analyze";
    setMode(nextMode);
    setSelected(null);
    setPromotion(null);
    setThinking(false);
    setOpening(null);
    setThoughtArrows([]);
    setMind(null);
  }

  function reset(side: Side = playerSide) {
    gameVersion.current += 1;
    restartWorker();
    gameRef.current = Game.start();
    openingSeed.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    playerSideRef.current = side;
    setBoard(gameRef.current.board()); setSelected(null); setHistory([]); setLastMove(null); setThinking(false); setPromotion(null); setOpening(null); setThoughtArrows([]); setMind(null); setPlayerSide(side); setFlipped(side === "b");
  }

  function undoPlayerMove() {
    if (!canUndoPlayerMove) return;

    gameVersion.current += 1;
    restartWorker();

    const game = gameRef.current;
    game.undo();

    // In a normal game, rewind Swift's reply too. Analyze mode rewinds one ply
    // because the user is intentionally controlling both colors.
    if (!analysisMode) {
      while (game.canUndo() && game.turn() !== playerSide) {
        game.undo();
      }
    }

    const moves = game.moveHistory();
    const previousMove = moves.length ? arrowFromUci(moves[moves.length - 1]) : null;
    setBoard(game.board());
    setHistory(moves);
    setLastMove(previousMove);
    setSelected(null);
    setPromotion(null);
    setThinking(false);
    setOpening(null);
    setThoughtArrows([]);
    setMind(null);
  }

  function applyHumanMove(move: Move) {
    const game = gameRef.current;
    if (analysisModeRef.current) {
      activeSearchRef.current = null;
      setThinking(false);
      setThoughtArrows([]);
      setMind(null);
      setOpening(null);
    }
    game.play(move);
    const next = game.board();
    setBoard(next); setSelected(null); setPromotion(null); setLastMove({ from: move.from, to: move.to }); setHistory(game.moveHistory());
    if (game.result() !== "ongoing") { setThoughtArrows([]); return; }
  }

  function chooseMove(moves: Move[]) {
    if (moves.length === 1) { applyHumanMove(moves[0]); return; }
    setPromotion({ moves });
  }

  function clickSquare(index: number) {
    if (terminal || promotion || (!analysisMode && (thinking || turn !== playerSide))) return;
    const piece = board.pieceAt(index);
    if (selectedTargets.has(index)) { chooseMove(selectedMoves.filter((move) => move.to === index)); return; }
    if (piece?.startsWith(analysisMode ? turn : playerSide)) { setSelected(index); return; }
    setSelected(null);
  }

  function dragStart(event: React.DragEvent, index: number) {
    const movableSide = analysisMode ? turn : playerSide;
    if (terminal || (!analysisMode && thinking) || (!analysisMode && turn !== playerSide) || !board.pieceAt(index)?.startsWith(movableSide)) { event.preventDefault(); return; }
    setSelected(index); event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move";
  }

  function dropSquare(event: React.DragEvent, target: number) {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(from)) return;
    const moves = board.legalMoves().filter((move) => move.from === from && move.to === target);
    if (moves.length) chooseMove(moves);
  }

  const status = analysisMode
    ? thinking
      ? `Swift is analyzing ${turn === "w" ? "White" : "Black"}'s move…`
      : terminal
        ? (result === "checkmate" ? `Checkmate · ${turn === "w" ? "Black" : "White"} wins` : resultLabels[result] ?? "Game over")
        : `${turn === "w" ? "White" : "Black"} to move · Swift is showing its preferences`
    : thinking
      ? "Swift is considering the position…"
      : terminal
        ? (result === "checkmate" ? `Checkmate · ${turn === playerSide ? "Swift" : "You"} wins` : resultLabels[result] ?? "Game over")
        : turn === playerSide ? (inCheck ? "Your king is in check" : "Your move") : "Swift to move";
  const promotionOptions: Array<{ piece: PromotionPiece; label: string }> = [{ piece: "q", label: "Queen" }, { piece: "r", label: "Rook" }, { piece: "b", label: "Bishop" }, { piece: "n", label: "Knight" }];

  useEffect(() => {
    playerSideRef.current = playerSide;
  }, [playerSide]);

  useEffect(() => {
    analysisModeRef.current = analysisMode;
  }, [analysisMode]);

  useEffect(() => {
    if (terminal || thinking || (!analysisMode && turn === playerSide)) return;
    runSwift(gameVersion.current, gameRef.current);
  }, [turn, playerSide, terminal, thinking, analysisMode]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return (
    <section className="playground" id="play">
      <div className="play-head">
        <div><p className="eyebrow">YOUR GAME</p><h2>Set up the board. See what happens.</h2><p>Play Swift normally, or switch to Analyze to move both colors while Swift marks the moves it prefers.</p></div>
        <div className="game-controls">
          <div className="mode-picker" aria-label="Choose board mode">
            <button className={mode === "play" ? "active" : ""} onClick={() => setGameMode("play")}>Play</button>
            <button className={mode === "analyze" ? "active" : ""} onClick={() => setGameMode("analyze")}>Analyze</button>
          </div>
          {!analysisMode && <div className="side-picker" aria-label="Choose your side">
            <button className={playerSide === "w" ? "active" : ""} onClick={() => reset("w")}>White</button>
            <button className={playerSide === "b" ? "active" : ""} onClick={() => reset("b")}>Black</button>
          </div>}
          <button className="flip" onClick={() => setFlipped((value) => !value)} aria-label="Flip board">↻ Flip board</button>
          <button className="undo" onClick={undoPlayerMove} disabled={!canUndoPlayerMove} aria-label="Undo your last move">← Undo move</button>
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
                  {piece && <span className={`piece ${piece[0]}`} draggable={piece[0] === (analysisMode ? turn : playerSide)} onDragStart={(event) => dragStart(event, index)}><PieceArt piece={piece} /></span>}
                  {isTarget && <span className={`move-dot ${piece ? "capture" : ""}`} />}
                </button>;
              })}
              <ThoughtArrows arrows={thoughtArrows} flipped={flipped} />
            </div>
            <div className="file-labels" aria-hidden="true">{(flipped ? files.split("").reverse() : files.split("")).map((file) => <span key={file}>{file}</span>)}</div>
          </div>
          {promotion && <div className="promotion" role="dialog" aria-label="Choose promotion piece"><span>Promote to</span>{promotionOptions.map(({ piece, label }) => <button key={piece} onClick={() => { const move = promotion.moves.find((candidate) => candidate.promotion === piece); if (move) applyHumanMove(move); }}><PieceArt piece={`${analysisMode ? turn : playerSide}${piece}` as Piece} /><small>{label}</small></button>)}</div>}
        </div>
        <aside className="game-info">
          <div className="game-status"><span className={thinking ? "pulse" : "dot"} />{status}</div>
          <div className="thought-card">
            <span>{analysisMode ? "Swift's analysis" : "Swift's current plan"}</span>
            <strong>{mind?.plan ? planLabel(mind.plan) : (thoughtArrows.length ? (analysisMode ? `${thoughtArrows.length} preferred move${thoughtArrows.length === 1 ? "" : "s"}` : `${thoughtArrows.length} moves in view`) : "Reading the position")}</strong>
            <p>{mind?.planReason ?? "Swift carries plans forward when the position still supports them."}</p>
            {mind?.planProgressNote && <p className="mind-detail">{mind.planProgressNote}</p>}
            {mind && <p className="mind-detail">Watching: {mind.concern} Confidence {Math.round(mind.confidence * 100)}% · held for {mind.planAge} Swift turn{mind.planAge === 1 ? "" : "s"}{mind.setbacks ? ` · ${mind.setbacks} setback${mind.setbacks === 1 ? "" : "s"}` : ""}.</p>}
          </div>
          {opening && <div className="opening-card"><span>Opening</span><strong>{opening}</strong></div>}
          <div className="history-head"><span>Moves</span><span>{history.length}</span></div>
          <div className="history">{history.length === 0 ? <span className="muted">The first move is yours.</span> : history.map((move, index) => <div className="move" key={`${move}-${index}`}><span>{Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"}</span><code>{move}</code></div>)}</div>
        </aside>
      </div>
    </section>
  );
}
