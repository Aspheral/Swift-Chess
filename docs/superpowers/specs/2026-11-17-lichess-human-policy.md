# Human-policy neural network from real Lichess games

**Status:** Research only; never deploy until per-game humanization and Elo release gates pass.

## Goal
Collect a reproducible, large, legally downloadable dataset of **rated standard, human-vs-human games** played by people whose ratings are each **1850–2550 Lichess Glicko-2**, prioritizing 10-minute rapid. Train a genuine move-policy neural network that predicts what those humans would choose from the legal moves. Swift's existing minimax, tactical and mate safety remain authoritative; the neural policy can only break ties among already verified, near-equal moves, and is **OFF by default**.

## Official source
Monthly bulk `.pgn.zst` archives from https://database.lichess.org/standard/ are CC0. Use bulk archives, not player-page scraping or a burst of profile requests. A monthly file can be streamed and stopped after the requested sample size, retaining provenance. The default scalable collector accepts local PGN, .gz, .zst or a single monthly HTTPS URL.

## Pipeline
1. Stream games; screen headers *before* expensive move parsing. Require valid standard PGN, rated event, both non-BOT ratings 1850–2550, time-control `base >= 600` or configured minimum, completed result, ≥16 moves. Do not store usernames.
2. Write one JSONL record per accepted game, with URL/game id, ratings, UCI moves and deterministic game-ID split (train/validation/test), plus manifest for all rejected reasons and rating bands. The model must never train on test games. Avoid exact duplicate site IDs.
3. Generate supervised examples (board position + **legal** candidate moves). A small PyTorch neural MLP scores legal moves; train with sampled-softmax imitation learning and crossentropy using the human move as label. Include both sides, rating-conditioned metadata, and midgame samples; hold out whole games.
4. Report test-set top-1/top-3/negative log likelihood and move-selection baselines, by phase and rating band. A low number is not a humanity percentage. Report total human moves learned from and uncertainty. Keep exact version, seed and source hash in metadata.
5. Export weights to a versioned JSON format for deterministic inference without PyTorch in the browser. Keep model loading and preference **disabled by default** in Swift, and bound any score adjustment to a few centipawns on moves that have already passed matched-depth verification.
6. Never merge into deployed site until full candidate-vs-v16 game testing, manual per-game review, independent detector context, honest Elo estimate, **strictly above 90/100 per-game and aggregate manually scored humanity**, and owner approval. Detector evasion is NOT the target.

## Non-goals
This is not reinforcement learning from rewards and not a trained win-maximizing chess engine. It is a *supervised human imitation policy* used as a strategic preference signal, not permission to make deliberately bad moves. Human models may reproduce biases and mistakes; search remains responsible for safety. Lichess ratings are not directly interchangeable with Chess.com ratings. Small archived samples are only training-pipeline demonstrations, not proof of strong human-like chess.

## Data fairness and checks
- Explicitly label archives from 2013/2014 as historical; for full training sample multiple recent months and opening types, both colors, and rating sub-bands.
- Filter detected BOT titles but cannot guarantee every archived rated account is human; report contamination risk.
- Split by stable game id, never by position; detect train/test duplicated game ids. Common opening positions may still occur in both sets, report evaluation separately after first 15 plies.
- Archive model and evaluation metadata and trained artifact SHA; never mark untrained/random weights as human-trained.
