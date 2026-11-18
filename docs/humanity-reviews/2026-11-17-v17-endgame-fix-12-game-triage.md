# Swift v17 research: 12-game manual triage, no release approval

**Recorded commit:** `b3ca43455c238187c8da1da8879bb88695a81932` (development-plan endgame bugfix).
**Source:** Six complete archived Stockfish match artifacts from [run 44215254253](https://github.com/Aspheral/Swift-Chess/actions/runs/44215254253).
**Conditions:** Stockfish UCI-limited 2000, 2350, 2550; fixed 100 ms per Stockfish move; Swift adaptive human profile; Réti/...d5 and London structures; both colors; fixed opening seeds. **No human opponents.**
**Record integrity:** 12 games, 12 decisive outcomes, 5W 0D 7L for Swift, 563 logged Swift decisions and no unresolved games.
**Reviewer:** ChatGPT, November 17–18 2026. Each complete legal-game UCI sequence was read for an initial human-chess plausibility and plan-continuity audit. The observations below identify contextual turning points without asserting unverified engine-best moves. This is **not** a complete per-ply tactical adjudication, blinded human comparison, or a release-grade 0–100 score.

## All games reviewed for prominent humanization defects

| # | Opponent | Opening | Swift | Result | Manual observations from the complete game record |
|---|---:|---|---|---|---|
| 1 | 2000 | Réti / ...d5 | White | W, mate (39 plies) | Conventional 1.Nf3 2.c4 followed by central d4/e4 expansion and active rook/queen play; 16.Rxc6 and 20.Qxf7 finish a concrete attack. Natural short-term intentions are visible, but all 18 recorded decisions agree with principal engine search; no proof of independent plan selection |
| 2 | 2000 | Réti / ...d5 | Black | W, mate (76 plies) | Black builds central pawn pressure with ...Nd4 and ...d3; the passed e-pawn advances through ...e2, ...e1=Q, then a queen attack finishes. Coherent pawn-conversion narrative; needs move-level tactical comparison |
| 3 | 2000 | London | White | W, mate (93 plies) | Swift accepts an early queen trade, develops a queenside pawn majority and ultimately promotes h-pawn on move 44; a credible strategic conversion, though clocks/alternative lines not yet audited |
| 4 | 2000 | London | Black | L, mate (67 plies) | Black spends time on queenside rook repositioning (...Ra7/...Ra8/...Rb8) while White's g- and h-files open. White's Qh6 and heavy-piece invasion win; review whether Swift's responses to kingside danger were coherent or search-horizon reactive |
| 5 | 2350 | Réti / ...d5 | White | W, mate (71 plies) | Sharp accepted pawn structure after 4.dxe6 and 8.e5, queen activity with Qb3/Qxb7, pressure on enemy king, final Qxe8 mate. Strong natural tactical narrative but 34/34 chosen moves agree with principal search |
| 6 | 2350 | Réti / ...d5 | Black | L, mate (213 plies) | Very long pawn race and major-promotion struggle. Several moves follow passed-pawn plans, but late king oscillation (...Kd8/...Ke8) and repeated queen routes make plan coherence dubious; 104 Swift decisions, 94 search agreements |
| 7 | 2350 | London | White | L, mate (80 plies) | White attacks with bishop/knight maneuvers but Black opens the g-file with ...Rg5/...Rg2 and invades with queen; White's defensive king path becomes forced. Need independent analysis of the point Swift should have re-evaluated its attack |
| 8 | 2350 | London | Black | W, mate (164 plies) | Black centralizes rook/queen, exploits White's heavy-piece shuffle and ultimately finishes with ...Qg1 mate. Long 79-move sample, **every** move agrees with the raw search choice; appearance of a plan is not evidence that the human planner caused it |
| 9 | 2550 | Réti / ...d5 | White | L, mate (86 plies) | Early queen expedition Qa4/Qb5/Qb7/Qa7/Qa6 coincides with Black's advancing central pawns and subsequent attack on the king; uncertain whether queen excursions are purposeful or overly search-driven |
| 10 | 2550 | Réti / ...d5 | Black | L, mate (81 plies) | Swift counters the early White queen but has difficulty containing a developed White initiative; Black king repeatedly travels on the queenside once the position deteriorates. Not enough evidence of consistent safety-first planning |
| 11 | 2550 | London | White | L, mate (156 plies) | **Highest-priority humanity regression:** repeated queen oscillation Qe2–Qf1–Qe2–Qf1 around moves 43–58, plus rook movement between d1/b1/a1. Some choices may be defensive, but Swift's record lacks causal explanations for the repeated reversals; must inspect threats before classifying errors |
| 12 | 2550 | London | Black | L, mate (61 plies) | Black repeatedly repositions rook along the d/e-files as White expands on the kingside (h4–h5 and g4–g5). Swift is mated by 31.Qxe6. Evaluate whether the engine has a defensible plan or merely responds one move at a time |

## Quantitative process warning (NOT a subjective humanity score)

- **Raw search agreement:** 546/563 = **96.98%** in these logged Swift decisions. This is not the percentage of moves that are inhuman.
- **Mean recorded plan age:** ~1.21 turns. Many game records alternate between one- or two-turn plans, temporary setbacks, and generic `create-threat` categories.
- **Result:** 5W/7L across the 12 tests; this is **not enough games or opponent breadth** to establish a defensible new Elo for the model.
- **External Chess Cheat Detector:** Not run on these 12 artifacts. The earlier user-supplied flagged game remains a separate known regression. A lack of detector results is not a pass.

## Root-cause follow-up

The recorded endgame bugfix eliminated nonsensical “develop” plans for king-only positions, confirmed by the failing-then-passing regression test and passing full CI. The next, separate experiment targets **false plan abandonment after tactical and defensive detours**. The original v17 selector calls `recordSetback` whenever a verified move lacks the remembered plan's generic idea tag, even if the move must address a tactical threat. The proposed correction distinguishes an interruption from real abandonment; it must be measured on complete games, and even then it is not proof of 90% human-likeness.

## Gate

**INCOMPLETE / NOT APPROVED FOR DEPLOYMENT.** Every game received initial full-score reading, but has NOT received full move-by-move, position-verified tactical annotations, per-game 0–100 human-plausibility scoring, a matched human-player reference set, independent detector cross-checks, or an appropriately powered Elo calibration. The production engine remains v16. Never invent 90% or treat statistical disagreement with Stockfish as the desired feature.
