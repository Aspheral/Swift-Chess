# Swift humanization experiment: purposeful movement and bounded uncertainty

**Date:** 2026-11-18
**Base:** `feature/v17-verified-plan-choice`, commit `608f21e41062ba43940f25a14e72e949c54e0e63` (draft PR #58)
**Disposition:** EXPERIMENT ONLY / NOT APPROVED / NOT DEPLOYED

## Problem being addressed

The last manually inspected 65-move Swift game exposed repeated middlegame rook rerouting and a fairly regular thinking rhythm. Immediate A-B-A reversal detection already exists, but it does not recognize a piece returning along a longer A-B-C-D-A circuit. The weighted selector currently samples from all candidates inside its safety latitude, including moves that are not close in purposeful, opponent-aware preference. These are two small, testable opportunities for improvement, not proof that a model is human-like.

## Intervention

1. Reconstruct a moving piece's recent route from the actual same-color UCI history. A multi-turn circuit becomes a small **preference penalty** only for a quiet minor/major piece move. Exempt a capture, check, current attacked square, tactical or defensive idea, high immediate tactical pressure, and a setback in the stored plan. Retain all legal candidates and independent tactical/consequence safety searches.
2. Filter the uncertainty pool to candidates close in **both** independently verified concrete score and the choice model's contextual preference. With a single plausible leader, choose it rather than using a randomized safety-margin draw. Nonzero randomness remains available among genuine near-ties. Tactical pressure removes the uncertainty pool.
3. Add regression tests for both colors, unrelated-piece histories, near-equal deliberation, tactical-pressure restraint, and an integration fixture with a long rook circuit and a defensive exception.

## Scope and limitations

- The patch does not alter Vercel, the public site, the Elo-calibration protocol, or live playing strength.
- The small circuit penalty is a heuristic. It may sometimes discourage a sensible piece reroute; the defensive exemptions, small value, and non-exclusion are intended to limit harm.
- The near-equal shortlist may reduce move diversity; measure it against equal-clock baseline games rather than assuming it is more human.
- The new helper was tested in standalone Node assertions and typechecked, but **full Vitest/Next.js CI and chess-game tests have not been run for this exact candidate**.
- The November 17 documented 61/100 score belongs to one provisional, independently unverified game review and **cannot be attributed to this code or even specifically to v16/v17**.

## Required before release

Freeze the exact candidate SHA, run complete paired-color games in varied openings and opponent-strength bands, preserve every PGN and choice/clock trace (including losses and aborted games), then manually inspect every game and score each on the 25/25/20/20/10 rubric. Calculate each game score and the unweighted mean with spread; independently cross-check rated-human reference games and the external detector when available, without using it for evasion. Quantify Elo with W/D/L, uncertainty and protocol, compare with the deployed v16 baseline, and require every game's score **strictly above 90** as well as the mean. The owner must explicitly approve that release evidence before any Vercel deployment.

**Verdict:** INCOMPLETE. No new humanization percentage, Elo, or deployment claim is justified from this code-only pass.
