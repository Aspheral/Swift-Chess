"""Supervised human move imitation network.

Not reinforcement learning: predicts which *legal* move a rated human actually
played. No model is used on Swift's website without explicit later approval.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
import hashlib
import json
from pathlib import Path
import random

import chess
import numpy as np
import torch
import torch.nn as nn

from .collect import rating_band, split_for_game
from .features import FEATURE_SIZE, SCHEMA as FEATURE_SCHEMA, move_features, all_legal_features, feature_fixture

MODEL_SCHEMA = "swift-human-policy-mlp-v1"
TRAINING_SPLITS = ("train", "val", "test")
Example = tuple[str, str, int]


class PolicyNet(nn.Module):
    """Actually learned MLP: 925 input -> 64 -> 32 -> a legal move score."""
    def __init__(self):
        super().__init__()
        self.layers = nn.ModuleList([
            nn.Linear(FEATURE_SIZE, 64),
            nn.Linear(64, 32),
            nn.Linear(32, 1),
        ])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.layers[0](x))
        x = torch.relu(self.layers[1](x))
        return self.layers[2](x).squeeze(-1)


def load_positions(games_file: str, max_positions: int = 15000,
                   min_ply: int = 12, max_ply: int = 150,
                   max_eval_positions: int | None = None,
                   seed: int = 2026) -> tuple[dict[str, list[Example]], dict[str, set[str]]]:
    """Reservoir sample WHOLE-GAME-disjoint positions without leaking usernames."""
    rng = random.Random(seed)
    samples: dict[str, list[Example]] = {s: [] for s in TRAINING_SPLITS}
    ids: dict[str, set[str]] = {s: set() for s in TRAINING_SPLITS}
    seen: Counter[str] = Counter()
    limits = {s: (max_positions if s == "train" else max_eval_positions or max_positions)
              for s in TRAINING_SPLITS}
    used_games: set[str] = set()
    with open(games_file, encoding="utf-8") as stream:
        for raw in stream:
            row = json.loads(raw)
            game_id = row["id"]
            split = split_for_game(game_id, seed)
            if split != row["split"]:
                raise ValueError(f"Incorrect split label for {game_id}")
            if game_id in used_games:
                raise ValueError(f"Duplicated game id in training file: {game_id}")
            used_games.add(game_id)
            ids[split].add(game_id)
            board = chess.Board()
            for ply, uci in enumerate(row["moves"]):
                try:
                    move = chess.Move.from_uci(uci)
                    if move not in board.legal_moves:
                        raise ValueError("illegal move")
                    if min_ply <= ply <= max_ply and board.legal_moves.count() > 1:
                        rating = int(row["white_elo"] if board.turn else row["black_elo"])
                        seen[split] += 1
                        position: Example = (board.fen(), uci, rating)
                        if len(samples[split]) < limits[split]:
                            samples[split].append(position)
                        else:
                            replacement = rng.randrange(seen[split])
                            if replacement < limits[split]:
                                samples[split][replacement] = position
                    board.push(move)
                except (ValueError, AssertionError) as exc:
                    raise ValueError(f"Invalid game {game_id} at ply {ply}: {exc}") from exc
    assert not (ids["train"] & ids["val"] or ids["train"] & ids["test"]
                or ids["val"] & ids["test"]), "Game id leakage"
    return samples, ids


def sample_batch(examples: list[Example], seed: int, negatives: int = 7
                 ) -> tuple[torch.Tensor, torch.Tensor]:
    """Randomize target slot so the model cannot learn a fake always-first label."""
    if negatives < 1:
        raise ValueError("Need at least one legal alternative")
    rng = random.Random(seed)
    batch: list[np.ndarray] = []
    targets: list[int] = []
    for fen, played_uci, rating in examples:
        board = chess.Board(fen)
        played = chess.Move.from_uci(played_uci)
        alternatives = [m for m in board.legal_moves if m != played]
        if played not in board.legal_moves or not alternatives:
            raise ValueError("Invalid training target or no legal alternatives")
        chosen = [played]
        if len(alternatives) >= negatives:
            chosen.extend(rng.sample(alternatives, negatives))
        else:
            chosen.extend(rng.choices(alternatives, k=negatives))
        rng.shuffle(chosen)
        targets.append(chosen.index(played))
        batch.append(np.stack([move_features(board, move, rating) for move in chosen]))
    return torch.from_numpy(np.stack(batch)), torch.tensor(targets, dtype=torch.long)


@torch.no_grad()
def evaluate(net: PolicyNet, positions: list[Example]) -> dict:
    """Full legal move evaluation, never just sampled training negatives."""
    net.eval()
    count = 0
    top1 = top3 = 0
    nll = random_top1 = 0.0
    bands: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    stages: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for fen, target, rating in positions:
        board = chess.Board(fen)
        legal, features = all_legal_features(board, rating)
        if not legal:
            continue
        ranking = net(torch.from_numpy(features)).numpy()
        target_index = next((i for i, m in enumerate(legal) if m.uci() == target), -1)
        if target_index < 0:
            raise ValueError("Human target is not a legal move")
        ordered = np.argsort(-ranking, kind="stable")
        best = int(ordered[0]) == target_index
        top1 += best
        top3 += target_index in ordered[:3]
        shifted = ranking - ranking.max()
        log_total = float(np.log(np.exp(shifted).sum())) + float(ranking.max())
        nll += log_total - float(ranking[target_index])
        random_top1 += 1 / len(legal)
        band = rating_band(rating)
        stage = "opening" if board.ply() < 24 else "middlegame" if board.ply() < 80 else "endgame"
        bands[band][0] += 1
        bands[band][1] += best
        stages[stage][0] += 1
        stages[stage][1] += best
        count += 1
    if not count:
        return {"count": 0}
    def groups(items: dict[str, list[int]]) -> dict:
        return {k: {"count": n, "top1": round(w / n, 5)} for k, (n, w) in sorted(items.items())}
    return {
        "count": count, "top1": round(top1 / count, 5),
        "top3": round(top3 / count, 5),
        "nll": round(nll / count, 5),
        "random_legal_top1": round(random_top1 / count, 5),
        "by_rating_band": groups(bands), "by_phase": groups(stages),
    }


def export_checkpoint(net: PolicyNet, destination: str, training: dict,
                      evaluation: dict) -> None:
    """Row-wise int8 quantization: small enough for a future web inference adapter."""
    layers = []
    for i, linear in enumerate(net.layers):
        weights = linear.weight.detach().cpu().numpy()
        maxima = np.max(np.abs(weights), axis=1)
        scales = np.maximum(maxima / 127.0, 1e-8)
        quantized = np.clip(np.rint(weights / scales[:, None]), -127, 127).astype(np.int8)
        layers.append({
            "in": int(weights.shape[1]), "out": int(weights.shape[0]),
            "qweight": quantized.tolist(), "scale": scales.round(9).tolist(),
            "bias": linear.bias.detach().cpu().numpy().round(9).tolist(),
            "activation": "relu" if i < len(net.layers) - 1 else "identity",
        })
    output = {
        "schema": MODEL_SCHEMA, "feature_schema": FEATURE_SCHEMA,
        "feature_size": FEATURE_SIZE, "enabled_by_default": False,
        "method": "supervised-human-legal-move-imitation-not-reinforcement-learning",
        "layers": layers, "training": training, "evaluation": evaluation,
    }
    dest = Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")


def train(games: str, output: str, metrics_file: str, max_train: int = 15000,
          max_eval: int = 1200, epochs: int = 2, batch_size: int = 48,
          negatives: int = 7, seed: int = 2026) -> dict:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    manifest_file = Path(games + ".manifest.json")
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    if manifest.get("games_sha256"):
        hash_value = hashlib.sha256(Path(games).read_bytes()).hexdigest()
        if hash_value != manifest["games_sha256"]:
            raise ValueError("Game training data does not match collector manifest SHA256")
    positions, ids = load_positions(games, max_positions=max_train,
                                   max_eval_positions=max_eval, seed=seed)
    if len(positions["train"]) < 100 or len(positions["val"]) < 20 or len(positions["test"]) < 20:
        raise ValueError("Not enough independent train/validation/test positions")
    model = PolicyNet()
    optim = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)
    best_loss = float("inf")
    best_state = None
    history: list[dict] = []
    rng = random.Random(seed)
    for epoch in range(epochs):
        model.train()
        rng.shuffle(positions["train"])
        losses: list[float] = []
        for at in range(0, len(positions["train"]), batch_size):
            batch = positions["train"][at:at + batch_size]
            X, y = sample_batch(batch, seed + epoch * 1000000 + at, negatives)
            logits = model(X.reshape(-1, FEATURE_SIZE)).reshape(len(batch), negatives + 1)
            loss = nn.functional.cross_entropy(logits, y)
            optim.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step()
            losses.append(float(loss.detach()))
        valid = evaluate(model, positions["val"])
        history.append({"epoch": epoch + 1, "train_sampled_loss": round(float(np.mean(losses)), 5),
                        "validation_top1": valid["top1"], "validation_nll": valid["nll"]})
        print(json.dumps(history[-1]), flush=True)
        if valid["nll"] < best_loss:
            best_loss = valid["nll"]
            best_state = copy.deepcopy(model.state_dict())
    assert best_state is not None
    model.load_state_dict(best_state)
    test = evaluate(model, positions["test"])
    valid = evaluate(model, positions["val"])
    training = {
        "source": manifest.get("source", "local-reviewed-PGN"),
        "games_sha256": manifest.get("games_sha256"),
        "games": {key: len(ids[key]) for key in TRAINING_SPLITS},
        "positions": {key: len(positions[key]) for key in TRAINING_SPLITS},
        "elo_range": [1850, 2550], "seed": seed,
        "epochs": epochs, "batch_size": batch_size,
        "negative_moves_per_positive": negatives,
        "training_history": history,
    }
    report = {
        "schema": "swift-human-policy-evaluation-v1",
        "trained": True, "method": "supervised-imitation",
        "dataset": training, "validation": valid, "test": test,
        "warnings": [
            "Test move prediction is not a human-likeness percentage.",
            "Lichess Glicko-2 is not Chess.com Rapid Elo.",
            "Rated PGN may contain unknown assisted players despite BOT-title filtering.",
            "Model has not been manually reviewed in Swift games and is not release-approved.",
        ],
    }
    export_checkpoint(model, output, training, {"validation": valid, "test": test})
    dest = Path(metrics_file)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    Path(str(dest.parent / "features-parity.json")).write_text(json.dumps(feature_fixture(), indent=2) + "\n")
    print(json.dumps({"test": test, "validation": valid, "model": output}), flush=True)
    return report


def main() -> None:
    p = argparse.ArgumentParser(description="Train legal-move human imitation network")
    p.add_argument("--games", required=True, help="Output JSONL from collector")
    p.add_argument("--output", required=True, help="Versioned quantized neural weights JSON")
    p.add_argument("--metrics", required=True)
    p.add_argument("--max-train-positions", type=int, default=15000)
    p.add_argument("--max-eval-positions", type=int, default=1200)
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--batch-size", type=int, default=48)
    p.add_argument("--negatives", type=int, default=7)
    p.add_argument("--seed", type=int, default=2026)
    a = p.parse_args()
    train(a.games, a.output, a.metrics, a.max_train_positions, a.max_eval_positions,
          a.epochs, a.batch_size, a.negatives, a.seed)


if __name__ == "__main__":
    main()
