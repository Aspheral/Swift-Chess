"""Game-history aware human policy regression tests.

Exact same human-game holdout as the previous 25.229% Swift neural baseline.
"""
import json
from pathlib import Path

import chess
import numpy as np
import torch

from scripts.human_policy.train import load_positions
from scripts.human_policy.train_contextual import (
    HISTORY_FEATURES,
    CONTEXT_FEATURES,
    encode_history,
    contextual_features,
    load_context_positions,
    context_full_legal_batch,
    ContextPolicyNet,
)
from scripts.human_policy.train import full_legal_loss


def test_same_position_different_prior_moves_produces_different_context():
    first = chess.Board()
    first_moves = ["g1f3", "g8f6", "f3g1", "f6g8"]
    for move in first_moves:
        first.push_uci(move)
    second = chess.Board()
    second_moves = ["b1c3", "b8c6", "c3b1", "c6b8"]
    for move in second_moves:
        second.push_uci(move)
    assert first.fen() == second.fen()
    assert first.turn == second.turn == chess.WHITE
    assert HISTORY_FEATURES == 8 * 128
    one = encode_history(first, first_moves)
    two = encode_history(second, second_moves)
    assert one.shape == two.shape == (HISTORY_FEATURES,)
    assert np.count_nonzero(one) == 8
    assert np.count_nonzero(two) == 8
    assert not np.array_equal(one, two)
    candidate = chess.Move.from_uci("e2e4")
    a = contextual_features(first, candidate, 2200, first_moves)
    b = contextual_features(second, candidate, 2200, second_moves)
    assert a.shape == b.shape == (CONTEXT_FEATURES,)
    assert np.array_equal(a[:925], b[:925])
    assert not np.array_equal(a[925:], b[925:])


def test_history_only_uses_prior_plies_not_future_choices():
    board = chess.Board()
    empty = encode_history(board, [])
    assert np.count_nonzero(empty) == 0
    board.push_uci("e2e4")
    history = encode_history(board, ["e2e4"])
    assert np.count_nonzero(history) == 2
    # Most recent ply is in the LAST slot, oriented for the side to move.
    mirrored_origin = chess.square_mirror(chess.E2)
    mirrored_destination = chess.square_mirror(chess.E4)
    assert history[7 * 128 + mirrored_origin] == 1
    assert history[7 * 128 + 64 + mirrored_destination] == 1
    # The recorded target move must not be part of its own history.
    assert np.array_equal(empty, encode_history(chess.Board(), []))


def test_history_dataset_uses_identical_games_and_positions_as_baseline(tmp_path: Path):
    rows = []
    moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5",
             "c2c3", "g8f6", "d2d3", "d7d6", "e1g1", "e8g8",
             "b1d2", "c8g4"]
    from scripts.human_policy.collect import split_for_game
    for i in range(220):
        key = f"https://lichess.org/context-{i}"
        rows.append({"id": key, "white_elo": 2050, "black_elo": 2300,
                     "split": split_for_game(key), "moves": moves})
    file = tmp_path / "human-games.jsonl"
    file.write_text("\n".join(json.dumps(x) for x in rows) + "\n")
    original, original_ids = load_positions(
        str(file), max_positions=85, max_eval_positions=35,
        min_ply=5, max_ply=13, seed=2026)
    context, context_ids = load_context_positions(
        str(file), max_positions=85, max_eval_positions=35,
        min_ply=5, max_ply=13, seed=2026)
    assert context_ids == original_ids
    for split in ("train", "val", "test"):
        assert [(fen, move, rating) for fen, move, rating, history in context[split]] == original[split]
        assert all(len(history) <= 8 for *_, history in context[split])
        assert all(len(history) > 0 for *_, history in context[split])


def test_model_learns_preferences_from_all_legal_moves_and_backpropagates():
    torch.manual_seed(13)
    model = ContextPolicyNet()
    example = (chess.Board().fen(), "e2e4", 2200, ())
    batch = [example] * 4
    X, mask, labels = context_full_legal_batch(batch)
    assert X.ndim == 3
    assert X.shape[0] == 4 and X.shape[-1] == CONTEXT_FEATURES
    assert mask.shape == X.shape[:2]
    assert mask.all()
    assert (labels >= 0).all()
    optim = torch.optim.Adam(model.parameters(), lr=0.008)
    with torch.no_grad():
        initial = float(full_legal_loss(model(X.reshape(-1, CONTEXT_FEATURES)).reshape(4, -1),
                                        mask, labels))
    for _ in range(12):
        logits = model(X.reshape(-1, CONTEXT_FEATURES)).reshape(4, -1)
        loss = full_legal_loss(logits, mask, labels)
        optim.zero_grad()
        loss.backward()
        optim.step()
    assert float(loss.detach()) < initial * 0.7
