# Manual preliminary game audit: SwiftChessTV vs mishacorn959a

**Date:** 2026-11-17. **Event:** Chess.com Live Chess, 600 seconds (10+0).
**White:** SwiftChessTV (“Swift” in the submitted PGN), 2078. **Black:** mishacorn959a, 2125.
**Result:** 1-0, **White won on time**, not by checkmate. [Game link](https://www.chess.com/game/live/187383116292?username=swiftchesstv&move=78).

**Source:** Owner-supplied PGN plus the owner's pasted Chess Cheat Detector output.
**Model attribution:** The game header does **not** identify a Swift source SHA/profile; do not ascribe it to v16 or v17 without independent identification.
**Review completeness:** All 65 White moves and all 64 Black replies **manually read and annotated from the supplied PGN**. No independent Stockfish tactical analysis or mechanical legality replay has been completed here, so this is a **qualitative preliminary audit**, NOT a complete release-ready review or verified model-level score.

## External independent detector, as supplied by the owner

| Feature | Swift | Opponent | Detector's stated typical human reference |
| --- | ---: | ---: | ---: |
| Engine top-choice moves | 49% | 30% | 33% |
| Best moves with >=50cp gap to the next move | 83% (23 positions) | 69% (16 positions) | 56% |
| Mean centipawn loss | 31cp | 49cp | 57cp |

The owner reports the detector judged Swift to have **strong signs of engine-like play** and the opponent **no meaningful signs**. These figures are the user's report and have **not been independently reproduced**. The detector's published method combines Stockfish rankings, move losses and rating-conditional human-move likelihood: <https://chesscheatdetector.com/how-it-works/>.

This is a statistical **engine-assistance** detector, not a calibrated “humanity percentage” meter. Do NOT optimize Swift to bypass its classifier or misrepresent a detector-negative as proof of human chess cognition. Engine-like decision patterns are a useful research alarm in disclosed, sanctioned engine-vs-engine testing.

## Manual move-by-move review

“Review” means human chess plausibility from the supplied move record, not validated optimality. Comments avoid invented engine PVs, forced tactics or verified blunder claims.

| Move no. | Swift (White) | Opponent reply | Swift seconds | Manual observation |
| ---: | --- | --- | ---: | --- |
| 1 | `Nf3` | `Nf6` | 11.4 | Flexible Réti entry; conventional, human-plausible. |
| 2 | `g3` | `b6` | 1.5 | Kingside fianchetto setup; coherent with Nf3. |
| 3 | `Nc3` | `Bb7` | 3.0 | Develops knight and supports central options. |
| 4 | `d4` | `e6` | 4.1 | Claims central space; consistent opening plan. |
| 5 | `Bg2` | `Be7` | 3.0 | Completes fianchetto; natural development. |
| 6 | `O-O` | `O-O` | 6.3 | Castles before direct central tension. |
| 7 | `Bf4` | `h6` | 6.3 | Develops remaining bishop actively; plausible. |
| 8 | `e3` | `g5` | 4.6 | Secures center before ...g5; logical but somewhat slow. |
| 9 | `Be5` | `d6` | 7.7 | After ...g5 the bishop steps to e5, inviting ...d6; understandable. |
| 10 | `Bxf6` | `Bxf6` | 2.1 | Trades bishop for knight after ...d6; normal practical response. |
| 11 | `e4` | `Nd7` | 8.6 | Uses central e-pawn space; natural. |
| 12 | `g4` | `Bg7` | 5.7 | Mirrors Black's wing pawn advance with g4; ambitious and risky near own king, merits deeper positional review. |
| 13 | `Qd3` | `Nf6` | 12.9 | Centralizes queen; could support e4/e5, but purpose is not proven from move alone. |
| 14 | `h3` | `a6` | 4.8 | Supports kingside pawn structure; useful waiting move. |
| 15 | `e5` | `dxe5` | 6.1 | Commits to e5 central break; real strategic decision. |
| 16 | `Nxe5` | `Bxg2` | 0.1 | Immediate knight recapture after ...dxe5; natural quick response. |
| 17 | `Kxg2` | `Nd5` | 6.2 | King recaptures after forced Bxg2 exchange; not evidence of deliberate king wandering. |
| 18 | `Ne2` | `Bxe5` | 10.4 | Knight regroups toward d3; plausible continuing plan. |
| 19 | `dxe5` | `Nb4` | 4.4 | Pawn recapture after ...Bxe5; natural. |
| 20 | `Qc3` | `c5` | 0.7 | Queen evades ...Nb4 and stays near center; fast and plausible. |
| 21 | `Rfd1` | `Qc7` | 8.5 | Activates rook on d-file; supports central struggle. |
| 22 | `Kg1` | `Rfd8` | 10.0 | Returns exposed king from g2 to g1; defensible safety choice. |
| 23 | `Re1` | `Rd5` | 9.0 | Moves same rook from d1 to e1 after one move; needs concrete reason. |
| 24 | `Nc1` | `Rad8` | 8.3 | Knight retreats e2-c1 toward d3; a coherent multi-ply reroute. |
| 25 | `a3` | `Nc6` | 9.0 | Chases Black knight on b4 with pawn; natural. |
| 26 | `Nd3` | `Nd4` | 10.4 | Completes knight c1-d3 reroute; positive plan follow-through. |
| 27 | `Re3` | `Qd7` | 8.9 | Rook lift e1-e3 could coordinate d-file/e-file, but clear target is not evident. |
| 28 | `Rd1` | `Nc6` | 8.6 | Other rook goes to d1; could be sensible central coordination. |
| 29 | `b3` | `Qc7` | 12.4 | Queenside pawn structure move, supports future c4; plausible. |
| 30 | `Rde1` | `Nd4` | 5.6 | Rook from d1 to e1, reversing d-file focus; concern about move-to-move purpose. |
| 31 | `a4` | `a5` | 7.9 | Restricts opponent's queenside expansion; plausible. |
| 32 | `Rd1` | `Qe7` | 8.9 | Rook returns e1-d1 two turns after leaving d1; mechanical-looking if no tactical explanation. |
| 33 | `Rd2` | `f6` | 9.7 | Rook d1-d2 prepares lateral/vertical defense, but previous reversals remain questionable. |
| 34 | `Qb2` | `fxe5` | 8.2 | Queen b2 repositions behind queenside pawns; tactical rationale not established. |
| 35 | `c4` | `R5d6` | 1.1 | Pawn c4 directly challenges Black's advanced rook on d5; purposeful, played in ~1.1 seconds. |
| 36 | `Nxe5` | `Qf6` | 20.8 | Knight captures e5 pawn; long think (~20.8 seconds), plausible difficult tactical moment. |
| 37 | `Rdd3` | `Rf8` | 7.7 | Rook d2-d3 supports active rook coordination; concrete aim needs review. |
| 38 | `Kg2` | `Rfd8` | 8.7 | King g1-g2 enters more exposed square while queens/rooks remain; review threats. |
| 39 | `Kg1` | `Qg7` | 7.6 | King reverses g2-g1 immediately after ...Rfd8; particularly needs contextual justification. |
| 40 | `Re4` | `Nc6` | 8.3 | Rook e3-e4 takes active central square; understandable. |
| 41 | `Rxd6` | `Rxd6` | 1.8 | Exchanges rook on d6, immediately recaptured; sensible simplification if evaluated sound. |
| 42 | `Qe2` | `Nxe5` | 7.3 | Queen moves toward e-file after opponent captured knight on e5; plausible defensive centralization. |
| 43 | `Rxe5` | `Qf6` | 0.4 | Rook captures Black knight on e5, obvious recapture; near-instant timing is natural. |
| 44 | `Qe1` | `Kf7` | 8.9 | Queen e2-e1 retreats; reason unclear without threat analysis. |
| 45 | `Re2` | `Rd3` | 16.6 | Rook e5-e2 retreats, using ~16.6 seconds; requires clear tactical plan. |
| 46 | `Re3` | `Rxe3` | 18.3 | Rook e2-e3 offers contested rook exchange, using ~18.3 seconds; potentially purposeful simplification. |
| 47 | `Qxe3` | `Qf4` | 0.1 | Queen recaptures rook on e3 immediately; natural forced-looking response. |
| 48 | `Qd3` | `Qd4` | 8.4 | Queen centralizes on d3 for attack/endgame; plausible. |
| 49 | `Qh7+` | `Qg7` | 6.6 | Queen invades h7 with check; forcing opportunity, not inherently engine-like. |
| 50 | `Qe4` | `Qa1+` | 9.2 | Retreats queen from h7 to e4 after defense; keeps active central presence. |
| 51 | `Kg2` | `Qd4` | 7.1 | King moves to g2 after Black's ...Qa1+; check response, not an unnatural king drift. |
| 52 | `Qb7+` | `Kf6` | 8.1 | Queen b7 gives check; forcing play against Black's king and clock. |
| 53 | `Qh7` | `Ke5` | 6.8 | Queen travels back to h7; maintain threats, but repeated long-range queen shifts deserve context. |
| 54 | `Qxh6` | `Qe4+` | 3.3 | Captures h6 pawn; logical conversion when Black's clock is low. |
| 55 | `Kh2` | `Qf4+` | 12.5 | King h2 evades queen check; compelled response. |
| 56 | `Kg1` | `Qc1+` | 7.6 | King g1 evades repeated queen check; compelled response. |
| 57 | `Kg2` | `Qf4` | 7.0 | King g2 following ...Qc1+; check-escape sequence, not gratuitous oscillation. |
| 58 | `Qg7+` | `Kd6` | 8.3 | Queen g7+ creates a counter-check; practical attempt to gain tempo. |
| 59 | `Qb7` | `Ke5` | 9.0 | Queen returns to b7 while Black's king moves; needs verification of purpose. |
| 60 | `Qxb6` | `Qe4+` | 11.7 | Captures b6 pawn; plausible conversion from active queen. |
| 61 | `Kh2` | `Qf4+` | 2.1 | King h2 following ...Qe4+; forcing defensive response. |
| 62 | `Kg1` | `Qf3` | 3.0 | King g1 following ...Qf4+; forcing defensive response. |
| 63 | `Qxc5+` | `Ke4` | 11.9 | Queen captures c5 pawn with check; forcing resource but ~11.9 seconds spent with Black almost flagged. |
| 64 | `Qc6+` | `Kd4` | 4.1 | Queen c6+ continues checks; sensible queen activity. |
| 65 | `Qxf3` | — | 4.4 | Queen captures Black's queen on f3; PGN records win on time, not checkmate. |

## Reviewer's provisional, unvalidated score

This **single-game** subjective assessment cannot certify 90% human-like play, and is not a probability the game was played by a person.

| Criterion | Score | Maximum | Reason |
| --- | ---: | ---: | --- |
| Natural, purposeful move choices | 18 | 25 | Credible Réti opening, central breaks, material conversion; several unexplained defensive/retreating decisions |
| Coherent multi-move planning | 11 | 25 | Real knight c3-e2-c1-d3 reroute, but repeated rook rerouting and king reversal require evidence of an actual persistent objective |
| Threat and tactical awareness | 15 | 20 | Captures, queen checks and exchanges appear purposeful; **not verified** with independent engine; cannot claim tactics safe |
| Practical/opponent-aware adaptation | 13 | 20 | Sensible checks and conversion against low clock; some choices lack causal opponent-aware justification |
| Thinking rhythm | 4 | 10 | 474.0 seconds across 65 White moves, mean 7.29s and median 7.7s, with a cluster of 7–10-second decisions and some fast forced recaptures; too little evidence of genuine position-based time planning |
| **Provisional total** | **61** | **100** | **Preliminary manual impression only; not release certification** |

### Patterns requiring full board / opponent-aware forensic analysis

1. **Moves 21–34:** White toggles between d- and e-file rooks while trying to coordinate. `21.Rfd1, 23.Re1, 27.Re3, 28.Rd1, 30.Rde1, 32.Rd1, 33.Rd2`. Not every reversal is bad, but the engine needs to show a threat, concrete opponent reaction, or strategic objective for each one. Do not invent a justification retrospectively.
2. **King shifts `38.Kg2 39.Kg1`:** an immediate reversal amid heavy pieces. Black had just played `37...Rf8 38...Rfd8`. Confirm whether g2 addressed a real threat or was aimless safety shuffling.
3. **Move `35.c4`:** concrete central counterplay against Black's advanced rook; `36.Nxe5` follows a pawn capture. Independently evaluate whether the fast `35.c4` and long-thought `36.Nxe5` were correctly chosen and explainable without raw engine PV copying.
4. **Moves 41–47:** trades and recaptures form an understandable tactical sequence, with `45.Re2` and `46.Re3` unusually expensive in clock time. Clarify the intent to simplify on e3.
5. **Moves 49–65:** active queen checks and pawn captures are plausible against a short-clock opponent; `55.Kh2 56.Kg1 57.Kg2` and `61.Kh2 62.Kg1` are largely check-escape moves, **not** random king shuffling. Treating them as evidence of artificial play would be unfair.
6. **Clock behavior:** White's final `65.Qxf3` with about two minutes remaining followed Black's `64...Kd4` when Black had about six seconds. The game record reports victory **on time**. Check whether Swift's search time responds adaptively to enemy clock status, rather than throttling itself to a fixed cadence.

### Release verdict

**INCOMPLETE / NOT APPROVED.** This game does not meet the >90% humanization threshold on provisional review. A verified exact model SHA, independent complete-game chess replay, position-by-position engine alternatives, a human reference set and a calibrated cross-game review are still missing. One flagged rated game does not itself establish an entire model's Elo or humanity percentage. No model deployment should be justified by this result.

### Fair-play constraint

Where the opponent is a real Chess.com account and play is rated, testing an engine through an ordinary player account is not permitted by Chess.com's fair-play rules. Use sanctioned bot environments, disclosed games with permission, or Swift's own testing website. Do not attempt to reduce detection scores to conceal bot use in an ordinary human game.
