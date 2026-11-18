# Game-history human policy: November 18, 2026 research pass

**Status:** research candidate. **Never deploy to Vercel without full user-defined release review.**

## Evidence: why move history is the next meaningful experiment

The last Swift supervised policy was a 925→64→32→1 candidate-move neural
network trained on 40,000 sampled moves from 4,661 filtered Lichess rated
standard games (both players 1850–2550, both colors).

Independent holdout: **3,500 decisions** from disjoint game IDs.
- Original Swift network top-1: **25.229%**.
- Masked full-legal loss top-1: **25.114%**. This decreased the exact-match
  rate despite slightly improving NLL and top-three accuracy. Not a promotion.
- Published **Maia-3 5M** evaluated against **the same 400 positions**, using
  FEN-only history padding: **199/400 = 49.75%** exact match; Swift's saved
  quantized student achieved **110/400 = 27.50%**. Data source: successful
  [Actions run 44240834456](https://github.com/Aspheral/Swift-Chess/actions/runs/44240834456)
  and artifact `swift-human-policy-published-model-same-holdout`.
- The 400-position sample contains only **eight** moves from players rated
  2400–2550, so its upper-band result has unacceptable uncertainty.
- These are exact **human-move prediction** results, NOT Swift's human-likeness
  percentage, Elo, or results from the live playing engine.

The competitive published human policy uses recent chess board history and a
chess-specific deep architecture. Swift's original MLP had **zero history**:
it could not distinguish an identical FEN reached through different sequences,
even when the prior moves were the evidence for a human strategic plan.

## Implemented, isolated test-first experiment

- Introduce **8 real past plies** (two one-hot square indices per move,
  mover-relative), giving 1,024 additional context features.
- Preserve all 925 original board/candidate/player rating features, total
  **1,949** neural inputs.
- Train a genuinely independent **1,949→128→64→1** PyTorch neural policy,
  against full legal candidate moves with masked cross entropy.
- Preserve every original train/val/test game ID, selected position FEN,
  human move and rating; the new data loader uses the **same seeded
  reservoir algorithm** as the baseline. A regression test compares
  selections exactly.
- The historical moves passed to the encoder end strictly *before* the
  target move, preventing future-move label leakage.
- The 60% research target remains **>=60.0% exact top-1** on the full unchanged
  3,500-position holdout, with properly balanced 2400–2550 human references
  in later external validation. A smaller pilot or top-three score cannot
  satisfy this target.
- Train-only checkpoint is stored as a PyTorch state dictionary with
  `release_approved=False`, never automatically loaded on the website.

### Validation requirements

First run: [human-history neural CI](https://github.com/Aspheral/Swift-Chess/actions/workflows/human-policy-game-history.yml).
The red test should demonstrate the contextual training module does not
exist; then, after implementation, all Python collector and neural tests
must pass. The separate optional training job must use the same saved
dataset/manifest and automatically reject different SHA, split game counts,
or selected position counts before comparing top-1.

**No playing-model changes, Elo claims or human-likeness increase are
supported by passing these offline tests alone.** We still need to enable
a candidate in authorized test games, manually review every full game,
perform the exact-model Elo calibration, cross-check detector information,
and obtain the owner's approval. Its strict manual human-likeness threshold
remains >90/100 **per game and overall**, a completely separate measure
from neural exact-move prediction.
