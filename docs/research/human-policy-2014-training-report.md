# First real Lichess neural-human-policy training result (NOT a release)

**Training run:** [GitHub Actions 44234767365](https://github.com/Aspheral/Swift-Chess/actions/runs/44234767365)
**Checkpoint:** Artifact `swift-human-policy-lichess-2014-trained-prototype` (download from that Actions run).
**Data:** Official Lichess [CC0 standard rated PGN](https://database.lichess.org/standard/), January 2014.
**Dataset hash (selected anonymized JSONL):** `77260e5a72822d71d695faa091791376f08f76ef89ac3350d56edb14dd2480c6`.
**Model:** Actually trained 925→64→32→1 PyTorch neural network, quantized row-wise to int8 with separate scale/bias. Exports a real checkpoint JSON, not placeholder weights.

## Collection audit
- Scanned **398,116** rated standard PGN records to accept **1,500 complete games**, containing **116,130 plies**.
- Both participants 1850–2550 Lichess Glicko-2; time-control base at least 600 seconds; standard chess; no known BOT titles. Excluded ~367,547 out-of-band games and ~28,998 too-fast games.
- Whole-game data split: **1,198 training / 149 validation / 153 test games**.
- **Important selection bias:** 1,436 games had average player rating 1850–2049, 64 were 2050–2249, and **none** 2250–2550. This model is NOT representative of the entire advertised range. Do not claim it learned elite 2400–2550 behavior.

## Held-out human-move prediction, not human-likeness
- Training sample: 14,000 positions; validation: 1,200; test: 1,200.
- Independent held-out **test top-1 exact move prediction: 21.667%**.
- Test top-3: **42.0%**.
- Test negative log-likelihood: **2.78752**.
- Uniformly random legal-move baseline on those test positions: **5.484%** top-1.
- Validation top-1: **26.917%** (test gap highlights generalization limitations).
- By rating on test: 1850–2049 **21.895%** (n=1,119 positions), 2050–2249 **18.519%** (n=81); no upper bands.
- By game phase on test: opening **26.957%**, middlegame **20.767%**, endgame **19.159%**.

These are honest statistical prediction metrics, not a subjective 0–100 "humanity percentage" or probability that Swift played like a human. The random baseline isn't the appropriate high-skill comparator for release: require genuine human-game and strong-policy baselines, equal time, blinded human judgments, and complete play testing.

## Follow-up before release
1. Collect **rating-stratified** games from multiple archives. The code now offers `collect_stratified.py`, with a reservoir per band and no username storage.
2. Retrain and compare held-out test metrics to this prototype and human reference games.
3. Check TS/Python feature parity, export/checkpoint metadata, and opt-in behavior.
4. Run full paired-color games with the *specific trained checkpoint enabled*, then manually review EVERY game, calibrate Elo and score humanity per game. The NN is NOT enabled in production.
5. Owner sign-off after strictly >90/100 per game and aggregate and an independent detector/position review.

**Current verdict: INCOMPLETE.** The checkpoint exists and learned a pattern, but it has not passed the Swift release gate.
