import Image from "next/image";
import Playground from "./playground";

export default function Home() {
  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><Image src="/swift-logo.svg" alt="Swift" width={42} height={42} /><span>SWIFT</span></div>
        <span className="status">A QUIET GAME OF CHESS</span>
      </nav>
      <section className="hero">
        <div className="copy">
          <p className="eyebrow">PLAY CHESS, TAKE YOUR TIME</p>
          <h1>Think the position.<br /><em>Then make a move.</em></h1>
          <p className="lede">Swift is made for the rhythm of a good game: patient in the opening, purposeful in the middlegame, and always looking for the move that feels right on the board.</p>
          <div className="actions"><a href="#play">Play a game</a><a className="secondary" href="https://github.com/Aspheral/Swift-Chess">View the project ↗</a></div>
        </div>
        <div className="board" aria-hidden="true">{Array.from({length:64},(_,i)=><div key={i} className={(Math.floor(i/8)+i)%2===0?"light":"dark"}>{[0,7].includes(Math.floor(i/8)) && [0,7].includes(i%8) ? "♜" : ""}</div>)}</div>
      </section>
      <Playground />
      <section className="panel">
        <div className="panel-mark">✦</div>
        <div><h2>Chess without the rush.</h2><p>Swift leaves room for the character of a game. It develops naturally, follows familiar openings, notices the shape of the position, and chooses practical moves without filling the board with needless motion.</p></div>
      </section>
    </main>
  );
}
