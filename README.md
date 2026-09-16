<div align="center">
  <img src="assets/swift-logo.svg" width="160" alt="Swift Chess logo">
  <h1>Swift Chess</h1>
  <p><strong>A chess AI that is meant to think, not just calculate.</strong></p>
  <p>
    <a href="#what-is-swift">What is Swift?</a> ·
    <a href="#the-idea">The idea</a> ·
    <a href="#how-it-should-think">How it should think</a> ·
    <a href="#status">Status</a>
  </p>
</div>

<br>

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>1650 Elo</strong><br><sub>Human target</sub></td>
      <td align="center"><strong>AI</strong><br><sub>Not a fixed engine</sub></td>
      <td align="center"><strong>Swift</strong><br><sub>Fast, personal, experimental</sub></td>
    </tr>
  </table>
</div>

## What is Swift?

Swift is a chess AI made by Aspheral.

The original idea was pretty simple: I wanted a chess program that could actually feel like it was playing chess, instead of just being a machine that looks through a position and finds the move with the highest number attached to it.

The target is around **1650 Elo**. Not because that number is supposed to make Swift impressive, but because it gives the project a personality to build toward. Swift should be strong enough to understand what is happening on the board, while still making the kinds of decisions a human player might make.

This is not supposed to be Stockfish with a strength limiter.

It is supposed to be its own thing.

## The idea

Most traditional chess engines are built around a very straightforward loop:

```text
Position
   ↓
Generate moves
   ↓
Search moves
   ↓
Evaluate positions
   ↓
Pick the best move
```

That works extremely well when the goal is to find objectively strong chess.

That is not quite what Swift is trying to do.

Swift should be able to look at a position, form an understanding of it, consider what is going on, and then make a decision. The decision should depend on the position, the circumstances, and the way Swift currently understands the game.

The same position should not automatically mean the same move forever.

## How it should think

Swift is intended to be an actual AI rather than a deterministic chess engine wearing an AI label.

That means randomness should not just be thrown onto the final move to make it unpredictable. The randomness should be part of the decision-making process, where it makes sense.

For example, if Swift sees several reasonable moves, it should be able to weigh them against things such as:

- What the position is asking for
- King safety
- Material and potential sacrifices
- Initiative and pressure
- Pawn structure
- Piece activity
- Tactical opportunities
- What kind of position the move creates
- Whether the move is practical for its current understanding
- Its own confidence in the idea

A move can be good without being the single best move.

A human does this constantly. You might see three moves that all look playable and choose one because you understand the resulting position better, because you like the idea, or because something about the position makes that move feel right.

Swift should have room for that kind of decision.

### The important part

If Swift reaches the same position twice, the goal is **not**:

```text
Same position → Same answer
```

The goal is closer to:

```text
Same position
      ↓
Understand the position
      ↓
Consider several ideas
      ↓
Judge those ideas
      ↓
Make a decision
      ↓
Play
```

That does not mean Swift should randomly throw away winning moves. A strong move should still be a strong move.

It means that when multiple moves make sense, Swift should be capable of actually choosing between them instead of always following one predetermined line.

## What makes it different?

Swift is being designed around **human-like decision making**, not human-like mistakes for their own sake.

There is a difference.

The goal is not to intentionally make bad moves just to lower the Elo. The goal is to build an AI that understands enough chess to make decisions that naturally result in a human-level playing style.

That means Swift should be able to play a quiet move because it understands the position, attack because it sees an opportunity, sacrifice because it sees compensation, or choose a slightly less accurate move because it prefers the position it leads to.

It should have reasons for its moves.

Even if those reasons are not always the reasons a perfect engine would give.

## A different kind of chess engine

```text
                    ┌───────────────────┐
                    │       SWIFT       │
                    │     Chess AI      │
                    └─────────┬─────────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
           Understand     Consider       Decide
           the board      ideas          what to play
                │             │             │
                └─────────────┼─────────────┘
                              ▼
                       Play the position
                              │
                              ▼
                    Human-like result
```

The interesting part of Swift is what happens between seeing the board and making the move.

That is the part we want to build.

## Status

> **Early development**
>
> Swift is currently an experimental project. The AI architecture, evaluation model, search system, decision-making process, and playing strength are all subject to change.

The repository is intentionally starting small. The architecture should be built around the idea first, rather than building a conventional engine and trying to bolt a personality onto it afterward.

## Development

Swift is a personal chess project by **Aspheral**.

The project will be developed experimentally. Ideas will be tested, thrown away, rebuilt, and compared as we figure out what actually makes a chess AI feel like it is making decisions rather than reading answers from a giant calculator.

There is no promise that the first approach will be the final approach.

That is kind of the point.

## Long-term goal

Build a chess AI that can sit across the board from you and feel like there is an opponent on the other side making decisions.

Not a perfect player.

Not a random player.

Not a traditional engine with artificial blunders.

**An AI that understands the position well enough to make its own choices.**

<div align="center">
  <br>
  <img src="assets/swift-logo.svg" width="58" alt="Swift Chess">
  <br><br>
  <sub>Swift Chess · Aspheral</sub>
</div>
