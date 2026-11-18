# Swift Human Policy Research (1850–2550 Lichess)

## This is a neural network, not a chess engine replacement

Train a **supervised PyTorch MLP** from actual human rated games to score which
legal moves strong human players would choose. The network has real trainable
weights (925 board-and-move inputs, 64- and 32-unit hidden layers, one output).
It is NOT reinforcement learning: learning from recorded demonstrations is
*imitation learning*. Neural moves must always be vetted by Swift's real
tactical search and mate guards. Model weights are **disabled in production**.

Lichess standard rated games are available as bulk monthly .pgn.zst from
https://database.lichess.org/standard/ and published under CC0. The sample
workflow uses a relatively small **January 2014 historical archive** to prove
that collection/training works. For representative modern human play, run on
several recent months with adequate downloads and rating-band balance.

Install prerequisites:

```sh
python -m pip install -r scripts/human_policy/requirements.txt

# Stream only rated standard, non-BOT-title games in which BOTH players
# were 1850–2550 on Lichess, with 600+ base time and 24+ plies.
python -m scripts.human_policy.collect \
  --input https://database.lichess.org/standard/lichess_db_standard_rated_2014-01.pgn.zst \
  --output artifacts/human-policy/games.jsonl --max-games 1500

# Train the NN and evaluate on disjoint 10% validation and test games.
python -m scripts.human_policy.train \
  --games artifacts/human-policy/games.jsonl \
  --output artifacts/human-policy/human-model.json \
  --metrics artifacts/human-policy/metrics.json \
  --max-train-positions 14000 --max-eval-positions 1200 --epochs 2
```

Outputs: anonymized `games.jsonl`, provenance/filter/sha256 manifest,
`human-model.json` with actual trained int8-quantized neural weights,
`metrics.json` with heldout top1/top3/NLL and a uniformly random legal-move
baseline, and `features-parity.json` for the Swift TypeScript encoder.

**Interpretation matters:** A held-out human-move prediction accuracy such as
12% is not a 12% human-likeness percentage. It describes a particular
supervised imitation task and is sensitive to opening frequencies and player
strength. Data can contain undisclosed engine assistance, despite excluding
BOT titles. The 1850–2550 band is Lichess Glicko-2, not Chess.com Elo.

**Release hold:** Do not turn on the neural policy on
https://swift-chess.vercel.app until exact-checkpoint full test games,
human-by-human move review, independent detector review, calibrated Elo,
strictly >90/100 *per game and aggregate* subjective humanity score, and
owner permission. Do not tune the model to evade fair-play detection.
