"""Independent human-move baseline experiment, not a new Swift release."""
import json

import chess
import numpy as np
import pytest

from scripts.human_policy.maia3_ceiling import evaluate_predictor, score_quantized_policy
from scripts.human_policy.features import move_features


def test_predictor_is_scored_by_exact_human_move_with_rating_groups():
    board = chess.Board()
    next_board = board.copy()
    next_board.push_uci("e2e4")
    examples = [
        (board.fen(), "e2e4", 1900),
        (next_board.fen(), "e7e5", 2400),
    ]
    def predict(position, rating):
        return "e2e4" if rating < 2000 else "c7c5"
    summary = evaluate_predictor(examples, predict)
    assert summary["positions"] == 2
    assert summary["top1"] == 0.5
    assert summary["by_band"]["1850-2049"]["count"] == 1
    assert summary["by_band"]["2400-2550"]["top1"] == 0.0


def test_invalid_or_illegal_model_predictions_do_not_get_credit():
    board = chess.Board()
    with pytest.raises(ValueError, match="legal"):
        evaluate_predictor([(board.fen(), "e2e4", 2200)], lambda fen, rating: "a1a8")


def test_quantized_swift_policy_scores_the_same_features_as_python_trainer():
    board = chess.Board()
    legal = list(board.legal_moves)
    destination_idx = 832 + chess.E4
    values = np.zeros((1, 925), dtype=np.int8)
    values[0, destination_idx] = 127
    checkpoint = {
        "schema": "swift-human-policy-mlp-v1",
        "feature_schema": "swift-human-policy-features-v1",
        "feature_size": 925,
        "layers": [{"qweight": values.tolist(), "scale": [0.02],
                    "bias": [0.0], "activation": "identity"}],
    }
    best = score_quantized_policy(board, 2200, checkpoint)
    assert best == "e2e4"
    checkpoint["feature_size"] = 999
    with pytest.raises(ValueError, match="feature"):
        score_quantized_policy(board, 2200, checkpoint)
