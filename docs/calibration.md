# Swift rating calibration

Swift's current playable profile, `adaptive-human-v1`, is calibrated at approximately **1632 Elo** against Stockfish's UCI strength limiter.

This is a benchmark estimate, not an official human federation or online-platform rating.

## Current estimate

- Calibrated Elo: **1632**
- Rounded public label: **≈1630 Elo**
- 95% benchmark interval: **1580–1684**
- Completed games: **200**
- Opponent strengths: **1450, 1550, 1650, 1750, 1850**
- Games per opponent strength: **40**
- Colors: paired, with Swift playing both sides of the same opening positions
- Unresolved games included in the estimate: **0**

## Ladder results

| Stockfish strength | Swift record | Score | Score rate |
| --- | ---: | ---: | ---: |
| 1450 | 26-10-4 | 28.0 / 40 | 70.0% |
| 1550 | 24-12-4 | 26.0 / 40 | 65.0% |
| 1650 | 13-19-8 | 17.0 / 40 | 42.5% |
| 1750 | 7-21-12 | 13.0 / 40 | 32.5% |
| 1850 | 8-25-7 | 11.5 / 40 | 28.75% |

The estimate is fitted across all five opponent strengths rather than calculated from a single match. The calibration script uses the standard logistic Elo expectation curve and finds the Swift rating that best explains the full set of fractional game results. The 95% interval is derived from the profile likelihood around that fitted rating.

## What was controlled

The ladder uses fixed paired opening positions. Each opening is played with Swift on both colors. Stockfish is reset and its hash cleared between games. Swift uses deterministic game seeds for reproducibility while still deriving different seeds for human-style candidate selection from move to move.

Draws come from the chess rules implemented by `Game`, including stalemate, threefold repetition, the fifty-move rule, and insufficient material. A safety ply limit is not treated as a draw. If a game is still active at the limit, that batch fails and must be rerun with a larger ceiling.

The final ladder uses a 360-ply safety ceiling after one legitimate game remained active at 240 plies during the first pass.

## What this number means

**1632 is the best current calibrated estimate for the Swift configuration people actually play on the website.**

It should not be described as a verified human Elo. Stockfish's `UCI_LimitStrength` is a useful reproducible calibration opponent, but its rating scale is still a proxy. Hardware, time controls, opponent pool, and the mapping between engine-limited Elo and human ratings all matter.

For public-facing copy, **≈1630 Elo, calibrated over 200 games** is the preferred wording.
