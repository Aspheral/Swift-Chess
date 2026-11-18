# Full-legal human neural training: controlled negative result

**Date:** 2026-11-18 (UTC)
**Run:** https://github.com/Aspheral/Swift-Chess/actions/runs/44239086152
**Artifact:** `swift-human-policy-full-legal-compare`
**Status:** RESEARCH COMPLETE, **NOT ACCEPTED AS TOP-1 IMPROVEMENT**, NOT A SWIFT MODEL RELEASE.

## Same-data, same-holdout comparison

Both models trained on the exact 2015+2017 Lichess filtered corpus:
- **4,661** games; SHA256 `3add048c5b21c8e98b8c011280e55443b8a4ca5eb35ef8112c56f2a724043f09`
- **3,706 / 483 / 472** train/val/test games, disjoint by game ID.
- 40,000 sampled training positions, 3 epochs, 3,500 held-out test moves, seed 2026.
- Same `925 -> 64 -> 32 -> 1` legal move neural scorer, AdamW optimizer.
- Only deliberate change: old **7 random negative candidates** versus **every legal candidate** under a properly masked full-legal cross-entropy loss.

| Held-out metric | Original sampled-softmax | Full-legal | Difference |
| --- | ---: | ---: | ---: |
| Exact top-1 move match | **25.229%** | **25.114%** | **-0.115 pp** |
| Top-3 move match | 45.600% | **46.029%** | +0.429 pp |
| Full-legal NLL (lower better) | 2.74233 | **2.72662** | -0.01571 |
| 2050-2249 top-1 | **25.691%** | 25.322% | -0.369 pp |
| 2250-2399 top-1 | **24.566%** | 23.121% | -1.445 pp |
| 2400-2550 top-1 | **29.630%** | 25.926% | -3.704 pp (n=54 only!) |

**Conclusion:** The mismatch in sampled training negatives and full-candidate
evaluation was theoretically questionable, but correcting it did NOT raise
exact-move top-1 accuracy on this controlled holdout. Calibration and top-3
improved slightly. Top-1 remains about **25%**, far below the owner's explicit
**>=60% exact-top-1** research target. Do NOT promote the new checkpoint,
inflate a different metric, or count filtered/forced positions as a substitute.

## Next architecture milestone

The published [Maia-3 79M](https://github.com/CSSLab/maia3) Chessformer
architecture achieves around **57.1% top-1** on its own dataset; the
[ChessDS DSC-150M](https://huggingface.co/ChessDS/DSC-150M) model reports
**62.74%** on **2400+ classical** games, which does NOT establish performance
at 1850–2550 in Lichess rapid games. These studies point to **transformer
board history, large-scale training and rich player/time context** rather
than trying to coax 60% out of a small feed-forward network.

A separate, strictly offline published-model baseline comparison on the
same Swift heldout positions is underway. It may guide whether Swift should
adopt a new own-trained architecture, a pretrained backbone, or a student
model distilled from a human-alignment teacher, subject to weight/code
licenses and the project's no-deployment gate.

## Release prohibition

No neural policy is enabled in Vercel. No new game-level manual-humanity
score, exact-model Elo estimate, or independent external detector review
has been completed for a candidate using this checkpoint. The owner's
strictly above 90% per-game and aggregate humanity gate remains separate
from top-1 imitation accuracy. All experimental releases remain BLOCKED.
