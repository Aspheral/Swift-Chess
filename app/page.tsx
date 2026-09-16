import Image from "next/image";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><Image src="/swift-logo.svg" alt="Swift" width={42} height={42} /><span>SWIFT</span></div>
        <span className="status"><i /> ONLINE · HUMAN ENGINE</span>
      </nav>
      <section className="hero">
        <div className="copy">
          <p className="eyebrow">HUMAN-ORIENTED CHESS AI</p>
          <h1>Think the position.<br /><em>Then make a move.</em></h1>
          <p className="lede">Swift understands positions, forms ideas, weighs practical choices, and plays with a controlled human error budget instead of simply weakening a computer engine.</p>
          <div className="actions"><a href="#play">Playground</a><a className="secondary" href="https://github.com/Aspheral/Swift-Chess">Source code ↗</a></div>
        </div>
        <div className="board" aria-label="Decorative chess position">{Array.from({length:64},(_,i)=><div key={i} className={(Math.floor(i/8)+i)%2===0?"light":"dark"}>{[0,7].includes(Math.floor(i/8)) && [0,7].includes(i%8) ? "♜" : ""}</div>)}</div>
      </section>
      <section id="play" className="panel">
        <span>01</span>
        <div><h2>The human layer is growing.</h2><p>Swift now separates tactical safety from human choice, allowing bounded inaccuracies while preserving the moves a player would reasonably need to find. Next comes position-dependent error: complexity, phase, and practical pressure shape the decision budget.</p></div>
      </section>
    </main>
  );
}
