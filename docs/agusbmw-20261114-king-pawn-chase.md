# Agusbmw game, November 14, 2026: an avoidable pinned-knight trap

## Primary evidence

User-provided [Chess.com game 187190596522](https://www.chess.com/analysis/game/live/187190596522/analysis): SwiftChessTV (White, **2045 Chess.com Rapid** as reported at game start) versus Agusbmw (Black, **2074 Rapid** as reported), 10+0, 0-1 after **60...Rh1#**. The full score is replayed from SAN into legal Swift boards, and the exact final FEN is checked.

This is historical account-rating information. The PGN does **not** identify a Git commit, server configuration, active search budget, or which Swift code actually supplied Chess.com moves.

## Independent evaluation: Stockfish 17.1, depth 16

[Stockfish UCI audit #43597530576](https://github.com/Aspheral/Swift-Chess/actions/runs/43597530576) and [initial multi-PV audit #43596893450](https://github.com/Aspheral/Swift-Chess/actions/runs/43596893450) used independent Stockfish 17.1 (one thread, 64MB hash). Depth-16 scores are approximate, perspective White, and may vary with MultiPV settings and hash state.

| White move | Depth-16 comparison | Interpretation |
| --- | --- | --- |
| 8.Qd3 | ~-0.67 vs 8.Ne2 ~+0.21 | Premature queen movement misses pressure on Nc3 |
| 9.Re1 | ~-1.81 to -1.90 vs 9.Ne2 ~-0.63 | Black's initiative grows as White spends time on rook moves |
| 10.Re2 | ~-2.62 vs 10.Qd1 ~-0.62 | Continuing rook redeployment worsens the position |
| **11.Nb5** | **~-4.21 vs 11.Qd1 ~-2.26** | A nearly two-pawn *additional* avoidable error |
| 12.a4 | Stockfish's top choice ~-4.0 | White is now salvaging material in an already lost structure |
| **24.Qxb4** | Stockfish's top choice ~-1.75 to -2.29 | Queen-for-bishop, with significant tactical continuation and counterplay; not an automatic blunder |
| 50.Rxe3 | ~-6.32, very close to the first-ranked move | A lost endgame; a forcing ...Nd5+ resource explains the rook's fate |

The code previously recognizes an immediate 220-centipawn loss after 12.a4, but this is a symptom rather than the cause. **11.Nb5 allows 11...c6**, attacking a knight on b5 that is pinned to its queen on d3 by Black's bishop on a6. Independent legal-reply analysis using Swift's existing static exchange calculation found that every legal White response after 11...c6 allowed at least **220cp of next-capture material loss**.

## What was reproduced

With the frozen original main engine at commit `901f3ccf`, exact fixed-depth searches after 10...Ba6 selected **11.Nb5** at depths 3, 4, and 6. It briefly selected 11.Qd1 at depth 5, then reverted at depth 6. This is unstable tactical prioritization, not evidence that adding one arbitrary search ply fixes it.

The released human layer, under a sample bounded timer, sometimes selected 11.Qd1 already. A PGN cannot prove which source revision was used on Chess.com. We must therefore distinguish **a demonstrated engine weakness in a reproduced position** from an unverified deployment history.

## The narrow change

- Detect an *actual relative pin* of a knight or bishop to its own queen, **and** a legal opponent quiet pawn move that attacks the pinned piece next turn.
- Enumerate all legal defensive replies at the resulting threatened position. If every defense permits immediate material loss, measure the minimum forced material loss using legality-aware static exchange.
- Apply only a **modest, capped 190cp root-score caution**, never a hard ban or a full-engine evaluation rewrite. All chess moves remain legal/searchable and a justified sacrifice can still outweigh the caution.
- Lower initial ordering priority for this rare risky candidate; cache results once per root candidate per search. The check does not run at every search node.
- Give Swift extra **actual** search time when a pawn or an advanced enemy knight directly attacks one of its valuable pieces. Initial opening play and one-legal-move situations stay quick.
- Preserve the verified 24.Qxb4 tactical continuation, mate-in-one safety, and queenless endgame behavior.

## A/B results, frozen main vs experimental candidate

[Matched-depth A/B CI #43598899743](https://github.com/Aspheral/Swift-Chess/actions/runs/43598899743) passed the full suite, TypeScript and production build. Fixed-depth choices:

| Position / completed depth | Frozen main | New candidate |
| --- | --- | --- |
| 8th move / 4 | Qd3 | Qd3 |
| 9th move / 4 | Ne5 | Ne5 |
| 10th move / 4 | Ne5 | Ne5 |
| **11th move / 4** | **Nb5** | **Qd1** |
| **11th move / 6** | **Nb5** | **Qd1** |
| 12th move / 4 | a4 | a4 |
| 24th move / 4 | Qxb4 | Qxb4 |
| 50th move / 4 | Rc3 | Rc3 |
| Mate in one / 2 | Qb8# | Qb8# |

At move 11, completed-depth-4 work increased from ~7,645 to ~10,376 nodes, and depth-6 work from ~86,172 to ~105,994 nodes. These are deliberate costs for identifying the trap; measured milliseconds vary with shared CI hardware and are not a calibrated performance improvement.

Eight color-reversed fixed-depth-3 games: **0 wins, 0 losses, 2 draws, 6 unresolved at a 60-ply cap**. The unresolved results were not counted as draws. This is only a safety and behavior smoke test, and it does **not** establish a Chess.com Elo or human-likeness increase.

The long benchmark copies and frozen main fixture were removed from final release CI once their exact logs were saved. The permanent regression checks retain the SAN replay, risk detector, Black/White symmetry, false-positive controls, and original 11.Qd1 and 24.Qxb4 tactical responses.

## Remaining work

The root cause also involves earlier decisions: **8.Qd3, 9.Re1 and 10.Re2**. This patch does *not* claim to fix all three or to guarantee higher strength. Next calibration should test controlled paired rapid games across multiple openings, with active clock budgets, plus more complete human-style/gameplay feedback. The last user-reported Chess.com rating is **2045 at the start of this game**, not a 2100 rating.

**Goal remains 2100; improvement on one demonstrated tactical error is not an Elo certification.**
