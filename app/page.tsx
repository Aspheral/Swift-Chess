import Image from "next/image";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav"><div className="brand"><Image src="/swift-logo.svg" alt="Swift" width={42} height={42} /><span>SWIFT</span></div><span className="status"><i /> FOUNDATION · 0.1</span></nav>
      <section className="hero">
        <div className="copy"><p className="eyebrow">HUMAN-ORIENTED CHESS AI</p><h1>Think the position.<br /><em>Then make a move.</em></h1><p className="lede">Swift is an experimental chess AI built to understand positions, form ideas, weigh reasonable choices, and develop its own way of playing.</p><div className="actions"><a href="#play">Playground</a><a className="secondary" href="https://github.com/Aspheral/Swift-Chess">Source code ↗</a></div></div>
        <div className="board" aria-label="Decorative chess position">{Array.from({length:64},(_,i)=><div key={i} className={(Math.floor(i/8)+i)%2===0?"light":"dark"}>{[0,7].includes(Math.floor(i/8)) && [0,7].includes(i%8) ? "♜" : ""}</div>)}</div>
      </section>
      <section id="play" className="panel"><span>01</span><div><h2>The foundation is being built now.</h2><p>Phase 1 starts with a correct chess world: board state, legal moves, FEN, checks, castling, en passant, promotion, and position history. Intelligence comes next.</p></div></section>
    </main>
  );
}
