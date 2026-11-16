# Swift 2150: extended strength-calibration protocol

## The goal

Swift's next playing-strength target is **2150 Chess.com Rapid**, because the developer currently beats Swift consistently and wants its strength to grow alongside their own. If Swift becomes consistently stronger than the developer, live strength should stay fixed until the developer catches up. A benchmark is not a reason to force a stronger live opponent. The long-term ambition is to make Swift think naturally and independently, not to chase a rating above an elite human.

## Current evidence (November 15, 2026, local time)

- Latest developer-shared Chess.com Rapid account screenshot: **2061**, observed November 14, 2026. This is a reported account rating for the then-deployed player, not a verified result for every source revision.
- Older, different Swift build: **1632 Stockfish-UCI-calibrated Elo** across 200 full games, interval 1580–1684. The old number cannot be transferred to the current build.
- Narrow 2150 research pilot: 14 games against UCI-limited Stockfish 1700–2400, all from the same Queen's Gambit Declined opening, result **10 wins / 4 draws / 0 losses**. **12 / 14** points, not a general Elo estimate.
- Four completed Swift self-play games: Italian draw, QGD draw, Réti black win, Four Knights black win. Self-play does not measure external Elo.

## Expanded controlled match protocol

The experimental workflow `.github/workflows/swift-2150-strength-ladder.yml` runs the current adaptive human profile without changing its playing ability. It uses:

- **Six** Stockfish `UCI_LimitStrength` Elo settings: **1800, 2000, 2150, 2350, 2550, 2750**.
- **Ten** curated opening families: two Réti setups, QGD, Slav, QGA, London, Four Knights, Scotch, Bishop's Opening, Italian.
- **Two colors** per opening and opponent: **20** games per level, **120** total. Two sharded batches cover all ten openings once at every level.
- Fixed **100ms Stockfish think time per move**, consistent with the pilot and historical protocol. This is an intentionally fixed benchmark, **not equal or matched wall-clock time**. Swift uses its current adaptive human think-time profile, so results have a time-budget confound.
- Each pair shares a reproducible Swift seed, Stockfish receives `ucinewgame` and cleared hash. The game runner exports full moves, final FEN, results, plan evidence, and other search telemetry.
- Maximum **500 plies** as a safety limit. Games that reach it without a chess result remain *unresolved* and invalidate the complete-data rating calculation; they cannot be counted as draws.
- Separate source-independent PGN replay and Stockfish tactical scan, and strict checks that all expected level/batch records, pairings, openings, seeds, and color assignments exist.

## Reporting rules

The `scripts/aggregate-2150-extended.mjs` estimator fits the common logistic expected-score equation over all full games, with draws scoring half a point. It reports an internal **Stockfish UCI-Elo-equivalent** estimate and two resampled uncertainty bands: an opening-pair bootstrap and a more conservative ten-family cluster bootstrap. These intervals are *conditional on this specific opponent protocol*. They do not include errors in the Stockfish rating scale and must not be relabeled as a confidence interval for human online Rapid ratings.

The test must finish with **all 120 legitimate games** before the estimate becomes reportable. If the fitted value reaches the upper search ceiling, report that the range did not bracket Swift; do not publish the clipped maximum as an Elo rating. Repeated openings, unequal thinking budgets, and a deliberately limited opponent pool still constrain external validity even with 120 games.

**Public site now:** “2150 Rapid” is a **goal**, not a measured Swift rating; disclose the 14-game pilot separately as preliminary. Do **not** replace this text with a claimed verified 2150 Chess.com rating based solely on Stockfish tests. Prefer a directly observed, dated Chess.com account result when describing actual platform rating, clearly noting that source revision and rating identity can differ.

## Humanization and playing-strength policy

Keep separate measures for playing strength, tactical safety, planning continuity, engine-search agreement, and actual human-likeness. Current internal proxies have not been validated against rated human decision traces and cannot honestly be expressed as a percentage probability of being human. Improve human-like reasoning without adding forced blunders or silently raising live playing difficulty.
