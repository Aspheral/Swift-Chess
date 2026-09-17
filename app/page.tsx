import Image from "next/image";
import Playground from "./playground";

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
          <div className="actions"><a href="#play">Play Swift</a><a className="secondary" href="https://github.com/Aspheral/Swift-Chess">Source code ↗</a></div>
        </div>
        <div className="board" aria-hidden="true">{Array.from({length:64},(_,i)=><div key={i} className={(Math.floor(i/8)+i)%2===0?"light":"dark"}>{[0,7].includes(Math.floor(i/8)) && [0,7].includes(i%8) ? "♜" : ""}</div>)}</div>
      </section>
      <Playground />
      <section className="panel">
        <span>02</span>
        <div><h2>Not weaker chess. Different chess.</h2><p>Swift keeps tactical safety separate from human choice. Its decision layer can tolerate bounded inaccuracies, prefer natural plans, and adapt its error budget to complexity, game phase, and practical pressure.</p></div>
      </section>
    </main>
  );
}
