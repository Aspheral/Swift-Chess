# Swift vs. Stockfish 2050: 200-game strength gate

This is a **reproducible benchmark of Swift's human-play profile**, not an
independent Chess.com Rapid rating and not proof of exactly 2050 human Elo.

## Graduation rule

- Opponent: Stockfish with `UCI_LimitStrength=true` and `UCI_Elo=2050`.
- Swift: `SWIFT_CALIBRATION_MODE=human` using the deployed-style
  `swiftPlayProfile` (not `strictBestPlay` benchmark mode).
- 200 completed games, 100 as White and 100 as Black, in opening/color pairs.
- 10 independent batch runs of the 20-game calibration harness.
- Win=1 point, draw=0.5, loss=0.
- **Nominal pass: 100/200 points or better**, with zero unresolved games.
- Report win rate and score rate separately. 50% score does not imply 50% wins.
- Report an approximate 95% score-rate interval; a lower bound above 50% is
  stronger evidence than a nominal pass. Neither justifies calling the engine
  "2050 Chess.com Rapid."

This initial experiment cycles through 10 predefined opening families in each
batch, with randomized strength-limited Stockfish play and batch-specific game
seeds. Reusing opening families reduces diversity, so the descriptive interval
does not establish strict statistical independence. Follow up with more opening
positions and fresh rated Rapid games before asserting a stable strength.

## Run the challenge

In GitHub Actions, choose **Swift 2050 Strength Gate** and select **Run workflow**.
It is **manual only**, because 200 games are too expensive for ordinary CI.
Run it on the exact source revision you want to measure. Merge changes from
the endgame and tactical PRs into that revision before running the combined
candidate.

The workflow runs 10 parallel jobs of 20 games. Each job installs Stockfish,
uses the same Stockfish settings (one thread, 64 MB hash, 100 ms per move),
runs Swift's adaptive human profile, and exports complete game records.
The 360-ply ceiling is a safety stop **not** a draw adjudication.

The final aggregation job checks opponent rating, mode, expected batch identities,
full 200-game count, balanced colors, paired openings, and no unfinished games.
It then writes `stockfish-2050-summary.json` and fails if Swift scores under
100 points. Raw game records and the summary are available as Actions artifacts.

The runner's packaged Stockfish version, hardware, and the selected Swift commit
are part of the experimental conditions. For tight comparisons between versions,
use the same opponent binary and compute budget. If time budgets change, treat
the new result as a separate benchmark series.

## Interpreting results

| Example 200-game record | Score | Gate |
| --- | ---: | --- |
| 100 wins, 100 losses | 100/200 (50%) | Nominal pass |
| 80 wins, 80 losses, 40 draws | 100/200 (50%) | Nominal pass |
| 90 wins, 80 losses, 30 draws | 105/200 (52.5%) | Nominal pass, small lead |
| 75 wins, 100 losses, 25 draws | 87.5/200 (43.75%) | Fail |

A nominal pass at 50% is a **starting point**, not a confident rating.
Repeat with more diverse openings and more games if the confidence interval
includes 50%. To establish a Chess.com Rapid rating, separately play a
representative pool of actual rated Rapid games with a frozen Swift version.

### Existing calibration

The older calibration result of roughly 1632 was for an earlier Swift build
against a multi-level Stockfish ladder (1450–1850). The new 2050 gate does not
rewrite that historical result, and the Chess.com account rating is a different
measurement.
