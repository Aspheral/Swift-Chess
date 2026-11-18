"""History-conditioned, human-imitation neural policy for Swift research.

A separate research model. It is neither enabled in the browser nor a
replacement for Swift's tactical engine. Training on full legal-move choices
uses the same fixed human-game holdout as the 925-feature MLP baseline.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import copy
import hashlib
import json
from pathlib import Path
import random
from typing import Sequence

import chess
import numpy as np
import torch
import torch.nn as nn

from .collect import rating_band, split_for_game
from .features import FEATURE_SIZE, move_features

HISTORY_PLIES = 8
HISTORY_FEATURES = HISTORY_PLIES * 128
CONTEXT_FEATURES = FEATURE_SIZE + HISTORY_FEATURES
ContextExample = tuple[str, str, int, tuple[str, ...]]
SPLITS = ("train", "val", "test")


def encode_history(board: chess.Board, prior_moves: Sequence[str]) -> np.ndarray:
    """The last 8 ACTUALLY PLAYED moves, BEFORE the move being predicted.

    Encode oldest to newest, left-padded with zero history slots. The pawn
    orientation mirrors for Black so the neural network has one side-to-move
    perspective. Never encode an opponent reply that hasn't occurred yet.
    """
    result = np.zeros(HISTORY_FEATURES, dtype=np.float32)
    recent = tuple(prior_moves)[-HISTORY_PLIES:]
    first_slot = HISTORY_PLIES - len(recent)
    for offset, uci in enumerate(recent):
        m = chess.Move.from_uci(uci)
        src = m.from_square if board.turn == chess.WHITE else chess.square_mirror(m.from_square)
        dst = m.to_square if board.turn == chess.WHITE else chess.square_mirror(m.to_square)
        slot = (first_slot + offset) * 128
        result[slot + src] = 1
        result[slot + 64 + dst] = 1
    return result


def contextual_features(board: chess.Board, move: chess.Move, rating: int,
                        prior_moves: Sequence[str]) -> np.ndarray:
    """Existing versioned candidate features plus eight previous plies."""
    return np.concatenate(
        (move_features(board, move, rating), encode_history(board, prior_moves))
    ).astype(np.float32, copy=False)


def load_context_positions(games_file: str, max_positions: int = 40000,
                           min_ply: int = 12, max_ply: int = 150,
                           max_eval_positions: int | None = 3500,
                           seed: int = 2026
                           ) -> tuple[dict[str, list[ContextExample]],
                                      dict[str, set[str]]]:
    """Same game ID splits and SAME reservoir choices as train.load_positions.

    Preserve the *identical* input move target, FEN and player rating at
    each sample. The only additional information is the true past move
    history. This makes any later performance comparison valid.
    """
    rng = random.Random(seed)
    samples: dict[str, list[ContextExample]] = {split: [] for split in SPLITS}
    ids: dict[str, set[str]] = {split: set() for split in SPLITS}
    seen: Counter[str] = Counter()
    limits = {split: (max_positions if split == "train"
                      else max_eval_positions or max_positions) for split in SPLITS}
    used_games: set[str] = set()
    with open(games_file, encoding="utf-8") as source:
        for line in source:
            row = json.loads(line)
            game_id = row["id"]
            split = split_for_game(game_id, seed)
            if split != row["split"]:
                raise ValueError(f"Incorrect split label for {game_id}")
            if game_id in used_games:
                raise ValueError(f"Duplicate game id {game_id}")
            used_games.add(game_id)
            ids[split].add(game_id)
            board = chess.Board()
            history: list[str] = []
            for ply, uci in enumerate(row["moves"]):
                try:
                    move = chess.Move.from_uci(uci)
                    if move not in board.legal_moves:
                        raise ValueError("illegal move")
                    if min_ply <= ply <= max_ply and board.legal_moves.count() > 1:
                        rating = int(row["white_elo"] if board.turn else row["black_elo"])
                        seen[split] += 1
                        position: ContextExample = (
                            board.fen(), uci, rating, tuple(history[-HISTORY_PLIES:])
                        )
                        if len(samples[split]) < limits[split]:
                            samples[split].append(position)
                        else:
                            replacement = rng.randrange(seen[split])
                            if replacement < limits[split]:
                                samples[split][replacement] = position
                    board.push(move)
                    history.append(uci)
                except (ValueError, AssertionError) as exc:
                    raise ValueError(
                        f"Invalid game {game_id} at ply {ply}: {exc}"
                    ) from exc
    if ids["train"] & ids["val"] or ids["train"] & ids["test"] or ids["val"] & ids["test"]:
        raise AssertionError("Game-level train/evaluation leakage")
    return samples, ids


class ContextPolicyNet(nn.Module):
    """A distinct, trainable human-move model with 8-ply chess context."""
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(CONTEXT_FEATURES, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.layers(features).squeeze(-1)


def context_full_legal_batch(examples: list[ContextExample]
                             ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Position-grouped full-legal softmax with non-legal padding masked."""
    if not examples:
        raise ValueError("Need a non-empty group of human move positions")
    feature_rows: list[np.ndarray] = []
    targets: list[int] = []
    max_choices = 0
    for fen, played_uci, rating, history in examples:
        board = chess.Board(fen)
        legal = list(board.legal_moves)
        if len(legal) < 2:
            raise ValueError("Need at least two candidate legal moves")
        try:
            target = next(index for index, move in enumerate(legal)
                          if move.uci() == played_uci)
        except StopIteration as exc:
            raise ValueError("Human target must be a legal move") from exc
        history_features = encode_history(board, history)
        features = np.empty((len(legal), CONTEXT_FEATURES), dtype=np.float32)
        for i, candidate in enumerate(legal):
            features[i, :FEATURE_SIZE] = move_features(board, candidate, rating)
            features[i, FEATURE_SIZE:] = history_features
        feature_rows.append(features)
        targets.append(target)
        max_choices = max(max_choices, len(legal))
    batch = np.zeros((len(examples), max_choices, CONTEXT_FEATURES), dtype=np.float32)
    mask = np.zeros((len(examples), max_choices), dtype=np.bool_)
    for i, row in enumerate(feature_rows):
        batch[i, :len(row)] = row
        mask[i, :len(row)] = True
    return torch.from_numpy(batch), torch.from_numpy(mask), torch.tensor(targets, dtype=torch.long)


def full_legal_loss(logits: torch.Tensor, legal_mask: torch.Tensor,
                    targets: torch.Tensor) -> torch.Tensor:
    """Full legal-candidate cross entropy; padding has no effect or gradient."""
    if logits.ndim != 2 or logits.shape != legal_mask.shape or \
            targets.shape != (logits.shape[0],):
        raise ValueError("Incompatible legal-move training dimensions")
    if torch.any(targets < 0) or torch.any(targets >= logits.shape[1]) or \
            not bool(legal_mask.gather(1, targets[:, None]).all()):
        raise ValueError("Target must index a valid legal candidate")
    if not bool(legal_mask.any(dim=1).all()):
        raise ValueError("A sample has no legal candidate")
    return nn.functional.cross_entropy(
        logits.masked_fill(~legal_mask, float("-inf")), targets
    )


@torch.no_grad()
def evaluate_context(net: ContextPolicyNet,
                     examples: list[ContextExample]) -> dict:
    """Evaluate against every legal move in original held-out human games."""
    net.eval()
    correct = top3 = 0
    nll = 0.0
    groups: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    phases: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for position in examples:
        X, mask, labels = context_full_legal_batch([position])
        scores = net(X[0, mask[0]])
        target = labels.item()
        prediction = int(torch.argmax(scores).item())
        hit = int(prediction == target)
        correct += hit
        top3 += int(target in torch.topk(scores, k=min(3, len(scores))).indices.tolist())
        nll += float(torch.logsumexp(scores, dim=0) - scores[target])
        board = chess.Board(position[0])
        rating = position[2]
        band = rating_band(rating)
        phase = ("opening" if board.ply() < 24 else
                 "middlegame" if board.ply() < 80 else "endgame")
        groups[band][0] += 1
        groups[band][1] += hit
        phases[phase][0] += 1
        phases[phase][1] += hit

    n = len(examples)
    if not n:
        return {"count": 0}
    def summarize(values: dict[str, list[int]]) -> dict:
        return {k: {"count": n_items, "top1": round(n_correct / n_items, 5)}
                for k, (n_items, n_correct) in sorted(values.items())}
    return {
        "count": n,
        "top1": round(correct / n, 5),
        "top3": round(top3 / n, 5),
        "nll": round(nll / n, 5),
        "by_rating_band": summarize(groups),
        "by_phase": summarize(phases),
    }


def train_context(games: str, output: str, metrics: str,
                  max_train: int = 40000, max_eval: int = 3500,
                  epochs: int = 2, batch_size: int = 16,
                  seed: int = 2026) -> dict:
    if not 1 <= epochs <= 30 or not 1 <= batch_size <= 128:
        raise ValueError("Training epochs/batch size out of range")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    manifest_path = Path(games + ".manifest.json")
    if not manifest_path.is_file():
        raise ValueError("Data manifest required for reproducible comparison")
    manifest = json.loads(manifest_path.read_text())
    checksum = hashlib.sha256(Path(games).read_bytes()).hexdigest()
    if checksum != manifest.get("games_sha256"):
        raise ValueError("Game data differs from its signed provenance manifest")
    examples, ids = load_context_positions(
        games, max_positions=max_train, max_eval_positions=max_eval,
        seed=seed,
    )
    if min(len(examples[s]) for s in SPLITS) < 20:
        raise ValueError("Not enough disjoint training, validation, test positions")
    model = ContextPolicyNet()
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0008, weight_decay=0.0001)
    best_state = None
    best_val_loss = float("inf")
    history = []
    rng = random.Random(seed)
    for epoch in range(epochs):
        rng.shuffle(examples["train"])
        model.train()
        losses = []
        for start in range(0, len(examples["train"]), batch_size):
            batch_examples = examples["train"][start:start + batch_size]
            X, mask, labels = context_full_legal_batch(batch_examples)
            logits = model(X.reshape(-1, CONTEXT_FEATURES)).reshape(len(batch_examples), -1)
            loss = full_legal_loss(logits, mask, labels)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
        val = evaluate_context(model, examples["val"])
        epoch_result = {"epoch": epoch + 1, "train_full_legal_loss":
                        round(float(np.mean(losses)), 5),
                        "validation_top1": val["top1"], "validation_nll": val["nll"]}
        history.append(epoch_result)
        print(json.dumps(epoch_result), flush=True)
        if val["nll"] < best_val_loss:
            best_val_loss = val["nll"]
            best_state = copy.deepcopy(model.state_dict())
    assert best_state is not None
    model.load_state_dict(best_state)
    test = evaluate_context(model, examples["test"])
    val = evaluate_context(model, examples["val"])
    dataset = {
        "games_sha256": checksum, "games": {s: len(ids[s]) for s in SPLITS},
        "positions": {s: len(examples[s]) for s in SPLITS},
        "source": manifest.get("source"), "seed": seed,
        "epochs": epochs, "batch_size": batch_size,
        "history_plies": HISTORY_PLIES,
        "feature_size": CONTEXT_FEATURES,
        "architecture": "1949 -> 128 -> 64 -> 1, full-legal supervised imitation",
        "training_history": history,
    }
    summary = {
        "schema": "swift-history-aware-human-policy-v1",
        "trained": True, "method": "supervised-imitation-not-reinforcement-learning",
        "disabled_in_swift_production": True,
        "dataset": dataset, "validation": val, "test": test,
        "warnings": [
            "Exact-move prediction is NOT a human-likeness percentage.",
            "This research checkpoint is not integrated into Swift's website.",
            "Comparison must be on exact same game-disjoint positions and move count.",
            "No model promotion before Elo and full manual review.",
        ],
    }
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "architecture": dataset,
                "release_approved": False}, target)
    destination = Path(metrics)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"test": test, "checkpoint": str(target)}, indent=2), flush=True)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Swift's research-only game-history human policy")
    parser.add_argument("--games", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metrics", required=True)
    parser.add_argument("--max-train-positions", type=int, default=40000)
    parser.add_argument("--max-eval-positions", type=int, default=3500)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    train_context(args.games, args.output, args.metrics,
                  args.max_train_positions, args.max_eval_positions,
                  args.epochs, args.batch_size, args.seed)


if __name__ == "__main__":
    main()
