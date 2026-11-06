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

## Conclusion and next hypothesis

**Confirmed:** rook-invasion awareness and explanatory planning improved in the historical positions tested.

**Not confirmed:** better selected moves, match results, playing strength, a higher Chess.com rapid rating, or increased resemblance to a real human player.

This suggests a next test: detect *prospective* rank invasions **before** an opponent's rook arrives, then generate specific prophylactic moves that reduce concrete danger. Build that only after preparing negative-control positions to avoid indiscriminately penalizing normal open-file play. Any candidate must survive the existing concrete safety verification.

A larger, matched-game protocol with paired opening positions, both colors, unchanged search/time conditions, legal-move assurance, human-choice telemetry, and a separate opponent is required before considering deployment or Elo claims. Keep PR #44 a draft until that evidence exists.

## How to reproduce

On either comparison branch, install dependencies and run the two common test files:

    pnpm install --no-frozen-lockfile
    pnpm test -- --run tests/rey-enigma-defense-probe.test.ts tests/rey-enigma-fixed-depth.test.ts

On the experimental branch, run the extra historical-awareness assertions:

    pnpm test -- --run tests/rey-enigma-awareness.test.ts

Look for REY_DEFENSE_PROBE, REY_DEFENSE_SUMMARY, and REY_FIXED_DEPTH_PROBE in the CI test output.
