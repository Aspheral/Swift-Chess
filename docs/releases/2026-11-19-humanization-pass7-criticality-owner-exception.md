# Swift Humanization Pass 7 + board criticality: owner exception

**Target:** Aspheral/Swift-Chess main, production https://swift-chess.vercel.app.
**Base commit:** f41429c5cf24357133efc2c407036b96ab20d1ac.
**Request date:** November 19, 2026 (America/Chicago).
**Authorization:** The owner wrote in the associated chat: "Alright, I'm going to make one more exception. I want you to deploy this version of the humanized model, but this time with a new feature."
**Disposition:** OWNER-AUTHORIZED ONE-TIME EXCEPTION, not humanization-certified.

## Included model changes

Cumulative undeployed Passes 5–7 were applied sequentially to the known
base, with identical source patch SHA-256 checksums:
- Pass 5: 3f2428efd232e75b4bc7ffa15e843b07d6168550b4e3923b1ac2a626728fd586
- Pass 6: 94275f8ff8639340f91c8c5f63ab3ce51916f6290ede62d05e678a6258dea1ba
- Pass 7: e37e8845a13cd51c36a5b5ec49f9765b7e7655129466c3b20c91bc744e91fa93

These experimental passes add bounded contextual variation, king-shelter
preference, recognition of inconclusive searches, and strategic detours
without recording unearned plan maturity.

## New browser feature

Top-right and bottom-left on-board badges show a 0–100 **position criticality**
estimate for the side at each end of the board, swapping when the user flips
the board. The heuristic reflects direct check, king exposure, undefended
pieces, invasion pressure, serious material deficits, and opposing passed
pawns close to promotion. It is recomputed after any board change, including
undo and reset; it does not alter the move-selection engine.

**These percentages represent practical urgency, not win probability,
human-likeness, Elo, centipawn evaluation, or statistically calibrated risk.**
The initial position should have low percentages. Checkmate displays 100%
for the checkmated side and 0% for the other side; stalemate displays 0/0.

## Evidence and release gate

- pnpm test: 412 passed, 1 skipped, in 79 passing test files and one skipped file.
- pnpm typecheck: PASS.
- pnpm build: PASS.
- Production-built page served locally; both WHITE and BLACK CRITICALITY badges,
  corner classes, and explanatory copy were present.
- Five new focused criticality tests passed, covering bounded quiet scores,
  both check directions, mate/stalemate, passed pawns, and flipped orientation.
- Pass 7 review: four controlled short-budget games, two Swift checkmate wins
  (White) and two **UNFINISHED** games at 138 plies (Black). Provisional
  subjective manual review average 73.75/100 (~74%), with partial scores for
  unfinished games, as documented in the accompanying Pass 7 bundle.
- No candidate-specific Rapid Elo with uncertainty was established, nor full
  high-depth human-game comparisons, detector cross-check, calibrated timing
  audit, or above-90% humanity score for every reviewed game.

The owner *explicitly waived* those otherwise mandatory release prerequisites
**only for this release**. This record is not evidence that the release gate
was satisfied. AGENTS.md and future normal release requirements are unchanged.

## Rollback / limitations

Previous main revision for rollback:
f41429c5cf24357133efc2c407036b96ab20d1ac.
The position criticality percentages are deterministic heuristic UI values,
not verified by statistical calibration or supported as a chess
engine win-probability model. The humanization score of this release is the
provisional Pass 7 assessment, not a verified 90%+ result.
