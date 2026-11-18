# Swift human-policy research: rating-balanced history-aware training

**Status:** Completed offline A/B research experiment, **NOT a release**.
**Training and verification run:** https://github.com/Aspheral/Swift-Chess/actions/runs/44421100676
**Artifact:** `swift-human-policy-rating-balanced-experiment`
**Source:** 4,661 rated-standard Lichess games, both players rated 1850–2550,
from the fixed 2015-01 and 2017-01 monthly datasets.
**Data SHA256:** `3add048c5b21c8e98b8c011280e55443b8a4ca5eb35ef8112c56f2a724043f09`.
**Training:** 40,000 position examples; 2 epochs; identical model architecture
1949→128→64→1 with 8 history plies, full legal-move masked loss,
seed 2026. Holdout: *unchanged* 3,500 decisions from 472 game-disjoint test
games. Validation: unchanged 3,500 decisions from 483 game-disjoint games.

## Test-first implementation

1. RED [44420165979](https://github.com/Aspheral/Swift-Chess/actions/runs/44420165979):
   new train-balance regression tests failed because there was no balanced
   loader option.
2. GREEN [44420478420](https://github.com/Aspheral/Swift-Chess/actions/runs/44420478420):
   13 tests passed. Strengthened non-vacuous rare-elite selection fixture
   passed in [44420786044](https://github.com/Aspheral/Swift-Chess/actions/runs/44420786044).
3. GREEN [44421100676](https://github.com/Aspheral/Swift-Chess/actions/runs/44421100676):
   all tests passed, complete corpus training and same-holdout comparison
   succeeded with one saved trained checkpoint. The actual training option
   is disabled by default and used only with `--balance-training-rating-bands`.
4. Split-preserving design: retain the existing game-disjoint validation/test
   positions *exactly*, load training data in a second deterministic pass,
   select genuine moves by the mover's rating band, and redistribute unused
   positions from scarce bands without cloning samples.

## Quantitative results

| Held-out test | Original MLP | Prior history model | New rating-balanced history model |
| --- | ---: | ---: | ---: |
| Exact top-1 move prediction | 25.229% | 25.400% | **25.571%** |
| Top-3 prediction | 45.600% | 44.914% | 44.943% |
| Negative log likelihood (lower is better) | 2.74233 | **2.72375** | 2.72497 |
| Unseen decisions | 3,500 | 3,500 | 3,500 |

The balanced history model improved top-1 **+0.171 percentage points**
over the previous history model and **+0.342 pp** over the original MLP.
The differences are too small to claim convincing statistical
generalization without repeated seeds / larger held-out cohorts.
The full user's **>=60% exact-top-1 neural prediction** target is NOT met.

### Actual training positions by the moving player's Lichess rating

| Rating | Selected training moves |
| --- | ---: |
| 1850–2049 | 11,888 |
| 2050–2249 | 11,888 |
| 2250–2399 | 11,888 |
| 2400–2550 | 4,336 |
| **Total** | **40,000** |

The 2400–2550 band exhausted its available eligible training evidence.
No upper-band moves were synthetically duplicated to fill the quota.

### Test accuracy by human rating

| Rating | New top-1 | Test decisions | Previous history model top-1 |
| --- | ---: | ---: | ---: |
| 1850–2049 | 25.719% | 1,668 | 25.600% |
| 2050–2249 | 25.599% | 1,086 | 26.335% |
| 2250–2399 | 24.711% | 692 | 23.699% |
| 2400–2550 | 31.481% | **54** | 22.222% |

Only **54** test moves are from the top rating band, so the apparent
improvement there is uncertain and is **not proof** of generalization to
2400–2550 humans. Acquire many more recent elite rapid games and
evaluate on an *independent later-month test set* before confidence claims.

## Game human-likeness, Elo and release verdict

**This benchmark evaluates predictions of other humans' moves. It does NOT
measure Swift's subjective 0–100 human-likeness rating, its game-level
decision process or a new Elo estimate.**

No Swift playing model was changed or deployed in this experiment.
No full games were played with this checkpoint, so there are no new
candidate-game reviews, separate opponent results, external detector
results or exact-candidate Elo estimate. These are **outstanding release
requirements**, not implied successes.

Last subjective, unvalidated carry-forward estimate for Swift's
humanization is **~62/100** (range 60–65), based on earlier manual
game observations. It is **not** a validated new score and cannot be
increased based on this tiny top-1 improvement alone.

**Final verdict: INCOMPLETE / NOT APPROVED FOR DEPLOYMENT.**
Strict owner rules: full games with manual review of every game,
exact-checkpoint Elo estimate, a subjective human-likeness score
strictly **above 90/100 per game and aggregate**, independent detector
context where available, and explicit owner approval before release.
