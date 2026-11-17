# Swift rating calibration

## Current experiment and next milestone

Swift's next laboratory goal is **2500 Stockfish UCI-Elo equivalent**, separate from its **2150 Chess.com Rapid** goal. An expanded **120-game** ladder completed November 16, 2026 and fitted **2385 Stockfish UCI-Elo equivalent**, with a conditional 95% bootstrap benchmark interval **2354–2422**. Ten opening families were tested with both colors against UCI strength-limited Stockfish settings 1800, 2000, 2150, 2350, 2550, and 2750. [Complete workflow evidence](https://github.com/Aspheral/Swift-Chess/actions/runs/43802486328).

**This result is not an estimate of Chess.com or FIDE Elo.** The test used fixed 100-ms Stockfish moves against Swift's adaptive thinking-time profile, so time budgets differ. The interval describes uncertainty within the limited-Stockfish test protocol, not systematic differences from real rapid games. The last user-shared Swift account screenshot (November 14, 2026) showed **2061 Chess.com Rapid**, which is not verified for the exact laboratory build.

Swift's live strength should grow alongside its creator. Laboratory improvements do not automatically change live difficulty.

An earlier Swift configuration was calibrated at approximately **1632 Elo** against Stockfish's UCI strength limiter. That historical estimate belongs to an older engine and test population.

## Historical estimate (not the current profile)

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

**1632 is a historical benchmark for an older Swift profile; 2385 is the latest measured internal lab equivalent, not a verified Chess.com rating.**

It should not be described as a verified human Elo. Stockfish's `UCI_LimitStrength` is a useful reproducible calibration opponent, but its rating scale is still a proxy. Hardware, time controls, opponent pool, and the mapping between engine-limited Elo and human ratings all matter.

For public-facing copy, distinguish the **2500 laboratory target**, **2385 internal benchmark estimate** (120 games, 95% conditional interval 2354–2422), and **2150 verified Chess.com Rapid target** (unconfirmed). The old 1632 equivalent remains a historical result for a different revision.
