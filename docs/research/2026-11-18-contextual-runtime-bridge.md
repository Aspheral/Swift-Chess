# Contextual human policy: browser/runtime compatibility and export verification

**Status:** implementation verified; **release blocked**, 2026-11-18.
**Main research PR:** https://github.com/Aspheral/Swift-Chess/pull/65
**Final CI run:** https://github.com/Aspheral/Swift-Chess/actions/runs/44431197862
**Actual trained inference artifact:** `swift-human-policy-runtime-contextual-disabled`
**Model file:** `contextual-research-model.json`
**Export SHA-256:** `fd24cd68e2dbe4da343f82a187f3015992b3fd8c48a1e6e90228a2a15483a579`

## Why this was needed

Swift's best tested Lichess human-imitation neural network was trained as
a history-aware PyTorch model (1,949 inputs: 925 position/candidate features
and eight previous UCI plies, followed by 128 and 64 hidden units).
It reached **25.571% exact top-1** on 3,500 game-disjoint human decisions
with rating-balanced training, vs **25.400%** for the prior history network.
Those metrics measure **imitation**, not Swift's game-level human-likeness.
But the Swift browser adapter previously accepted only a different 925-feature
MLP and did not pass move history to any neural scorer.

## Implemented, test-first

- The Python research exporter now converts the **actual trained**
  `rating-balanced-weights.pt` to a versioned int8 quantized
  `swift-human-policy-context-v1` JSON file. Layer sizes:
  `1949 -> 128 -> 64 -> 1`, with per-row int8 quantization, float
  scales/biases and validated source-checkpoint metadata.
- Swift's TypeScript encoder builds exactly the same history vector as
  `train_contextual.py`: eight previous UCI moves, oldest-to-newest,
  zero padded on the left, side-to-move perspective (Black mirroring).
  The CURRENT candidate move is never included in its history.
- Legacy 925-input inference continues to work, while the new checkpoint
  requires its distinct feature schema and exactly 1,949 inputs.
  Invalid histories or corrupted model schemas cannot generate bonuses.
- The engine passes real `moveHistory` to the optional inference function,
  only for **already vetted** movement candidates. The learned preference
  contributes a maximum **4 centipawns**. No legal move insertion,
  tactical search bypass, or forced unsafe plan is permitted.
- The network remains strictly **opt-in**: `enableHumanPolicy` must be
  explicitly set to true with a provided checkpoint. No weights are bundled
  or automatically loaded on the Vercel website.

### Test evidence

- RED: [run 44430525179](https://github.com/Aspheral/Swift-Chess/actions/runs/44430525179)
  failed two TypeScript tests because no context encoder existed, and
  the Python tests failed while importing the nonexistent exporter.
- GREEN: [run 44430905892](https://github.com/Aspheral/Swift-Chess/actions/runs/44430905892)
  **376 TypeScript tests passed**, one skipped; **15 Python tests passed**;
  TypeScript typechecking and Next.js production build passed.
- REAL CHECKPOINT GREEN: [run 44431197862](https://github.com/Aspheral/Swift-Chess/actions/runs/44431197862)
  passed TS, Python and artifact-export jobs and verified the original
  trained dataset SHA matches the checkpoint metadata.
- The exported JSON from GitHub was compared byte-for-byte against an
  independent local quantization of the same archived PyTorch checkpoint.
  Identical size **843,525 bytes** and identical SHA256 as documented above.
- A numerical check over synthetic sparse chess-like input vectors found
  max raw-logit absolute quantization discrepancy **0.03379** versus
  original PyTorch weights. Python regression tests additionally compare
  real chess position features with a synthetic network, max tolerance 0.04.

## Explicit NOT COMPLETED

**This research checkpoint has NOT played full Swift games with neural
inference enabled. No manually reviewed complete candidate games, new
live/lab Elo, independent detector review, or scored candidate-game
human-likeness percentage has been obtained.**

The user's full humanization release standard remains:
- **>90/100 manual human-likeness assessment** in EACH completed test
  game and the aggregate.
- New model's Elo estimate with appropriate experimental uncertainty.
- Every complete test game reviewed and human behavior assessed.
- Owner's explicit approval and fair-play use only.

No Vercel deployment. The previous subjective Swift human-likeness estimate
**~62/100** is retained as **unverified carry-forward** rather than raised
by the existence of this model adapter. Separate neural top-1 goal >=60%
on unseen human decisions is also **NOT met** (best 25.571%).
