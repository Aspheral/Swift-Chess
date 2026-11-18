# Swift human-move policy: the 60% exact-top-1 research target

**Status:** NOT ACHIEVED as of 2026-11-18. No model promotion authorized.

## Acceptance criterion
On an independently archived, game-disjoint and preferably player-disjoint
Lichess human-rated standard rapid dataset where both players rate **1850–2550**,
predict the **exact legal move the human chose**, measured against ALL legal
moves, **>=60.0% top-1 overall**. Keep >=3,500 fixed test positions at minimum,
and publish a 95% game-cluster bootstrap interval, the match rate within every
rating band and stage, sample counts, and the full code/data checkpoint hashes.
Do not relax the population, remove difficult middlegames or use a
different top-k/forced-only score to declare success. Ideally add a second
fully future-dated external test month where both models have never trained.

This is a separate research objective from the requirement for subjective
**>90/100 manually reviewed human-like behavior in EVERY tested Swift game
and the aggregate**, plus a grounded exact-checkpoint Elo estimate and
explicit owner approval before any Vercel release.

## Current honest benchmark
Official Lichess CC0 rated data: **4,661 filtered games** from 2015+2017;
**3,706/483/472** game-disjoint train/validation/test; 40,000 sampled
training positions and 3,500 unseen test positions. Exact SHA256 of the
anonymized game file:
`3add048c5b21c8e98b8c011280e55443b8a4ca5eb35ef8112c56f2a724043f09`.

| Experiment | Top-1 | Top-3 | Test NLL |
| --- | ---: | ---: | ---: |
| Swift trained MLP 925→64→32→1 with seven random alternatives | **25.229%** | 45.600% | 2.74233 |
| Same model/corpus, masked complete legal-move cross-entropy | **25.114%** | 46.029% | **2.72662** |
| Desired exact top-1 | **>=60%** | not a proxy | must report |

Training-loss choice alone did not solve accuracy. Full-legal loss was
well-tested but slightly reduced top-1. Do not promote this checkpoint
as an accuracy gain. Verify baseline and new metrics from
https://github.com/Aspheral/Swift-Chess/actions/runs/44239086152.

## Prior art and architecture choice
- [Maia-3 (ICLR 2026)](https://github.com/CSSLab/maia3) reports **57.1%**
  on its own move-prediction benchmark with an **79M-parameter**
  history-aware Chessformer. Official inference is AGPL-3.0. This is
  a strong architectural reference, NOT a result on our data.
- [ChessDS DSC-150M](https://huggingface.co/ChessDS/DSC-150M) reports
  **62.74%** over 6.7 million held-out moves in **2400+ classical**
  games, and **62.00%** on a later classical set. Its authors explicitly
  state rapid performance and play below that rating are unmeasured.
  Those results do NOT establish a 60% Swift result on 1850–2550 rapid.
- An offline Maia-3 5M zero-shot pilot versus Swift's actual quantized
  checkpoint on the same sample is tracked in PR #62 and GitHub run
  44240205247. It is an architectural diagnostic, not a trained Swift model.
- Do NOT add external AGPL code/weights to Swift production without
  reviewing legal obligations. A research-side teacher or fine-tuning
  design also requires license and attribution review.

## Execution plan
1. Hold the 2015+2017 test data immutable, and procure a **much larger
   more recent** 1850–2550 rapid corpus, with enough 2400–2550 examples.
   Keep train/validation/test games and sources separate by IDs and months;
   hash player IDs if person-level independence is desired without storing
   usernames. No banned bots, variants or unrated games.
2. Train a chess-native, position/history encoder with **both player ratings,
   last moves, remaining clock and legal move masking**. Use published
   models as baselines. Compare learning from scratch to a permitted,
   licensed, correctly attributed pretrained backbone. Maintain
   supervised legal-move imitation; never optimize detector evasion.
3. Use **all legal moves** for evaluation. Report top1, top3, NLL and
   by-band/stage results. Make changes one at a time with identical
   evaluation selection, random seed and statistical uncertainty.
4. If the 60% objective passes honestly, assess full Swift games with
   search-safe bounded human preferences, manually review every game,
   estimate Elo on the exact tested checkpoint, and apply the >90/100
   independent humanization gate. Do not deploy first.

**Never report an untrained checkpoint, pretrained reference model or
top-3 score as Swift reaching the owner's 60% top-1 criterion.**
