# Swift vs Rey Enigma: defensive decision study (November 5, 2026)

## Source and scope

The game is the **user-provided PGN** for SwiftChessTV (White) vs Rey Enigma (Black), result 0-1. Player identities, tentative ratings, and the game clock were **not independently verified**. The actual supplied 100-ply movetext has been replayed from the starting position with Swift's legal move generator and reaches the recorded 50...Qh1# checkmate. The fixture is in tests/fixtures/rey-enigma.ts.

This is a **small, exploratory code comparison**, not a human-likeness score or Elo estimate. It examines whether a proposed rook-invasion threat model changes Swift's perception and choices at positions drawn from the recorded game.

## Comparison setup

- **Control:** main plus *only* the SAN fixture and identical decision-probe tests, on branch benchmark/rey-defense-control-20261105 (temporary PR #45).
- **Experiment:** PR #44 (human/rook-invasion-awareness-20261105), adding rook-invasion interpretation, strategic defensive ideas and plan reconsideration.
- Both executed the exact same tests/rey-enigma-defense-probe.test.ts and tests/rey-enigma-fixed-depth.test.ts.
- The fixed-depth comparison uses HumanSwiftEngine at depth 3, with depth-2 safety/ponder checks, seed 87, no time limit, no randomness, no adaptive second look, and the preceding actual UCI game history. It also runs SwiftEngine directly as a control.
- The separate time-capped probes use a 420 ms search limit and **must not be used for causal move-quality comparisons**, because completed depths differed.

### Fixed-depth checkpoint after 37...Rcc1

Position after ply 74:

    6k1/1q4p1/3bp2p/3b1p2/3P4/1P1PQN1P/1R3PP1/r1r2NKR w - - 7 38

| Measured behavior | Control (main) | PR #44 |
| --- | --- | --- |
| Raw engine move, completed depth 3 | f3h2 | f3h2 |
| Human-selected move, completed depth 3 | f3h2 (38.Nh2) | f3h2 (38.Nh2) |
| Decision source | human-plan | human-plan |
| Current plan | defend | defend |
| Concern | "f1 is loose and may need protection or activity." | "Enemy rooks are penetrating the ranks around the king; an active defense may be needed." |
| Defense idea groups | 1 | 2 |

**Interpretation:** the upgrade correctly identifies strategic rook pressure and supplies a corresponding candidate idea. **It does not change the chosen move at this completed depth**. There is no evidence from this checkpoint that the upgrade increases tactical strength.

### Other checkpoints

- **Before 34...Rc1+ (ply 67):** the control and upgrade both played c8c1 in their time-bounded probe.
- **After 41...Re1 (ply 82):** both chose e2c2 (42.Qc2) in their time-bounded probe. The immediate-major-piece guard rejected a queen-losing e2e1 line on *both* builds. This tactical protection already existed on main.
- **After 37...Rcc1 (ply 74), time-bounded probe:** the baseline reached depth 3 and played f3h2; the experiment reached only depth 2 and played f3d2. **Do not interpret that move difference as an improvement or regression**, since the search was interrupted at different depths.

## Verification

- Control CI: [Swift CI run 42134928594](https://github.com/Aspheral/Swift-Chess/actions/runs/42134928594), typecheck, tests, production build all passed.
- Experimental CI: [Swift CI run 42134986593](https://github.com/Aspheral/Swift-Chess/actions/runs/42134986593), typecheck, tests, production build all passed.
- Real-game-specific assertions are in tests/rey-enigma-awareness.test.ts. They verify no premature invasion warning at ply 67, rook-pressure recognition at plies 68, 74, and 82, legal defensive candidates at ply 74, and an explanatory defensive SwiftMind concern.

## November 5 follow-up: one-move rook entry forecast

The next experimental addition is now implemented in the same draft branch, without deploying to main:

- A lightweight geometric gate detects a possible path for an enemy rook onto the king's first two ranks, then checks whether the rook entry is *legal* after a hypothetical pass or on the opponent's actual turn.
- Obvious undefended rook sacrifices that give no check are excluded from this planning warning.
- New `defend` candidates are legal moves which reduce next-turn rook entry pressure without merely checking the opponent. Existing concrete consequence searches still decide whether these plans are safe to play.
- The persistent mind can notice the coming invasion and reconsider an old plan. Neither the forecast nor a candidate's score is a claim that a forced tactic exists.

Regression tests in `tests/rook-invasion-forecast.test.ts` pass for White and Black, preventative rook blocks, ordinary starting positions, already-blocked files, unprotected rook sacrifices and advanced kings. [Final first forecast CI](https://github.com/Aspheral/Swift-Chess/actions/runs/42142036981): **153 tests passed, 1 skipped**, typecheck and production build passed.

**Important negative historical result:** in the actual Rey Enigma record, no warning fired at White-to-move positions after plies 58, 60, 62 or 64. At ply 66 White is already in check, so one-move prophylaxis is not applicable. This threat arose through a sequence of moves that changed the defenders of c1, not through an immediately playable, unpunished rook landing. The current forecast is useful for some positions but does **not** solve Swift's earlier handling of that specific game.

## Conclusion and next hypothesis

**Confirmed:** Swift's recognition of already-invading rooks improved, and it now recognizes certain imminent rook entries with legal preventative candidates on synthetic positions.

**Not confirmed:** improved selected moves in the Rey game, a better match score, Chess.com rating improvement, or increased human-likeness. The fixed-depth Rey checkpoint still selects 38.Nh2 on both builds.

Further tactical planning should model *deflection of critical defenders* and forcing intermediate moves, not merely extend the rook-forecast search horizon indiscriminately. Performance costs must be measured under the real browser time budget, and candidate moves must survive the existing tactical safety checks. The separate core defended-piece backport in PR #46 is not part of this experimental branch.

Before considering deployment, run larger paired-game matches using controlled openings and clocks, with both colors and a separate reference opponent, then measure tactical error rates, time usage, move diversity, decision trace, and strength uncertainty.

## How to reproduce

On either comparison branch, install dependencies and run the two common test files:

    pnpm install --no-frozen-lockfile
    pnpm test -- --run tests/rey-enigma-defense-probe.test.ts tests/rey-enigma-fixed-depth.test.ts

On the experimental branch, run the extra historical-awareness assertions:

    pnpm test -- --run tests/rey-enigma-awareness.test.ts

Look for REY_DEFENSE_PROBE, REY_DEFENSE_SUMMARY, and REY_FIXED_DEPTH_PROBE in the CI test output.
