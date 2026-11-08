# Swift parallel human planning experiment

## Why this exists

A human player commonly reasons in two ways:

1. **Opponent-aware calculation:** "I move, my opponent replies, I respond..." with real legal moves and tactical refutations. Swift already does this through standard adversarial search and safety/pondering verification.
2. **Unopposed plan imagination:** "If nobody interfered, where would I put my pieces over the next several turns? Could I prepare a king attack? What else might I try?" This is a planning sketch, not a game prediction.

The new visualization is an **additional second track**. It does not replace minimax-style search or assert that an opponent will pass. It can imagine up to **five consecutive own-side moves** by explicitly placing a temporary pass between imagined moves.

## Safety and integration

- Implemented in src/chess/plan-vision.ts as bounded two-branch imagination, maximum five own moves per line, with at most 130 expansions per root candidate in normal play. Standalone API clamps expansions to 160.
- Future moves are checked for legality in each counterfactual position. If a move checks the enemy king, the imagined line **stops**: it never asks a checked king to pass.
- Uses bounded attacked squares around the opponent king as a proxy for "interesting attacking possibilities," not a material evaluation, win percentage, or mate detector.
- Only runs after the existing opponent-aware search has produced a principal move and safety verification has retained a shortlist of actually playable candidates.
- A tiny style tie-break (0-5 points) is permitted only among moves within **12 centipawns of the verified leader**. Verified centipawn scores are never changed. Candidates rejected by safety are never reintroduced.
- Skipped during check, tactical emergencies (profile tactical pressure >=0.12), technical endings, the early opening (<12 plies of history), and searches with explicit timeMs below 700.
- The final independent immediate-major-piece guard may still override a move. Its rejected imagined line is then discarded.
- Both imagined and opponent-aware lines are shown in the site's thinking panel with separate, explicit labels.
- HumanSwiftEngine.search with planVision: false is the built-in ablation switch for controlled experiments.

## Concrete diagnostic example

From a deterministic opening test on the development branch:

- Selected: b1c3 (Nc3).
- **Opponent-aware actual search:** b1c3 b8c6, depth 2 in this small test.
- **Imagined own-only plan:** b1c3 c3d5 d5f6. The opponent does not move between these hypothetical knight turns.
- **Alternative imagined continuation:** b1c3 a1b1.
- **Counterfactual search work:** 70 candidate expansions.
- Recorded output explicitly contains opponentUnopposed: true.

This is an **illustrative test**, not evidence that Black would permit Nd5/Nf6, that the alternative is better, or that the line wins. In an actual game Swift's adversarial search considers Black's responses and its tactical layer can reject any concrete candidate move.

## Verification

- [GitHub Actions CI run 42535282114](https://github.com/Aspheral/Swift-Chess/actions/runs/42535282114): 145 passing tests, 1 skipped; TypeScript typecheck and production Next.js build passed.
- tests/plan-vision.test.ts covers: sequence legality under explicit imagined passes, refusal to continue after giving check, illegal root moves, check-position suppression, deterministic expansion bounds, strict-mode immunity, near-equal-only tie-breaks, and an actual HumanSwiftEngine integration ablation with unchanged adversarial root score and depth.
- The diagnostic test output includes SWIFT_PARALLEL_THOUGHT fields for the two different lines.

## What is not established

This experiment has **not** shown increased Chess.com rating, higher playing strength, or a measured human-similarity improvement. The most recent user-reported Chess.com rating is **2014**, while 2100 is still a target.

Before merging or deploying, evaluate on repeated real browser games and controlled paired matches against frozen main at equal clocks; monitor timeouts, tactical blunders, move quality, how often imagination changes an actual verified move, and whether resulting plans are stable and understandable. Keep the PR as a draft until this evidence is available.
