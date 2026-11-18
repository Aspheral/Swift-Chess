"""Human policy tests must never use self-play as human training truth."""
import json
from pathlib import Path

import chess
import numpy as np
import torch

from scripts.human_policy.collect import collect, game_filter, rating_band, split_for_game
from scripts.human_policy.features import FEATURE_SIZE, move_features, feature_fixture
from scripts.human_policy.train import PolicyNet, sample_batch, export_checkpoint, load_positions


def test_rating_filters_rated_bots_and_time():
    base = {"Event": "Rated Rapid game", "Variant": "Standard",
            "WhiteElo": "1850", "BlackElo": "2550",
            "TimeControl": "600+0", "Result": "1-0"}
    assert game_filter(base) is None
    assert game_filter({**base, "BlackElo": "2551"}) == "outside-rating-band"
    assert game_filter({**base, "WhiteTitle": "BOT"}) == "bot-title"
    assert game_filter({**base, "Event": "Casual Rapid game"}) == "not-rated"
    assert game_filter({**base, "Variant": "Chess960"}) == "variant"
    assert game_filter({**base, "TimeControl": "60+0"}) == "too-fast"
    assert game_filter({**base, "Result": "*"}) == "unresolved"
    assert rating_band(2050) == "2050-2249"
    assert split_for_game("https://lichess.org/testA") == split_for_game("https://lichess.org/testA")


def test_collector_streams_games_and_never_stores_player_names(tmp_path: Path):
    headers = ('[Event "Rated Rapid game"]\n[Site "https://lichess.org/{id}"]\n'
               '[Date "2026.10.01"]\n[White "SensitivePlayer"]\n[Black "OtherPlayer"]\n'
               '[Result "1/2-1/2"]\n[WhiteElo "{white}"]\n[BlackElo "2150"]\n'
               '[TimeControl "600+0"]\n[Variant "Standard"]\n\n')
    moves = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 1/2-1/2\n\n"
    input_file = tmp_path / "small.pgn"
    input_file.write_text("".join(headers.format(id=i, white=w) + moves
                                  for i, w in (("A", 2200), ("B", 1800), ("A", 2200),
                                               ("C", 1900), ("D", 2450))))
    output = tmp_path / "small.jsonl"
    manifest = collect(str(input_file), str(output), max_games=10, min_plies=12)
    assert manifest["accepted"] == 3
    assert manifest["rejected"]["outside-rating-band"] == 1
    assert manifest["rejected"]["duplicate"] == 1
    assert manifest["total_plies"] == 36
    lines = output.read_text()
    assert "SensitivePlayer" not in lines and "OtherPlayer" not in lines
    rows = [json.loads(x) for x in lines.splitlines()]
    assert len(rows) == 3 and all(len(row["moves"]) == 12 for row in rows)
    assert all(row["split"] == split_for_game(row["id"]) for row in rows)


def test_feature_board_perspective_and_promotion_shape():
    board = chess.Board()
    white = move_features(board, chess.Move.from_uci("e2e4"), 2200)
    assert len(white) == FEATURE_SIZE == 925
    assert white[0 * 64 + chess.E2] == 1
    assert white[768 + chess.E2] == 1 and white[832 + chess.E4] == 1
    assert white[913 + 5] == 0  # white to move
    assert white[913 + 6] == 0  # rating 2200 is centered
    assert white[913 + 10] == 1  # opponent (black) still has castling rights
    board.push_uci("e2e4")
    black = move_features(board, chess.Move.from_uci("e7e5"), 2200)
    assert black[0 * 64 + chess.E2] == 1   # black pawn e7 is mirrored to e2
    assert black[768 + chess.E2] == 1
    assert black[913 + 5] == 1
    assert np.isfinite(black).all()
    assert feature_fixture()["schema"] == "swift-human-policy-features-v1"


def test_training_uses_actual_neural_weights_and_randomized_label_positions():
    torch.manual_seed(7)
    net = PolicyNet()
    out = net(torch.zeros((7, FEATURE_SIZE), dtype=torch.float32))
    assert out.shape == (7,)
    board = chess.Board()
    example = (board.fen(), "e2e4", 2200)
    features, labels = sample_batch([example] * 20, seed=17, negatives=5)
    assert features.shape == (20, 6, FEATURE_SIZE)
    assert labels.shape == (20,)
    assert len(set(labels.tolist())) > 1
    assert (labels >= 0).all() and (labels < 6).all()


def test_export_predicts_same_scores_as_quantized_torch_model(tmp_path: Path):
    torch.manual_seed(9)
    net = PolicyNet()
    path = tmp_path / "model.json"
    board = chess.Board()
    samples = np.stack([move_features(board, m, 2200) for m in list(board.legal_moves)[:3]])
    export_checkpoint(net, str(path), {"game_count": 100}, {"test": {"top1": 0.15}})
    weights = json.loads(path.read_text())
    assert weights["schema"] == "swift-human-policy-mlp-v1"
    assert weights["feature_schema"] == "swift-human-policy-features-v1"
    assert weights["training"]["game_count"] == 100
    x = samples
    for layer in weights["layers"]:
        matrix = np.asarray(layer["qweight"], dtype=np.float32)
        scale = np.asarray(layer["scale"], dtype=np.float32)
        bias = np.asarray(layer["bias"], dtype=np.float32)
        x = x @ (matrix * scale[:, None]).T + bias
        if layer["activation"] == "relu":
            x = np.maximum(x, 0)
    target = net(torch.tensor(samples)).detach().numpy()
    assert np.max(np.abs(x.reshape(-1) - target)) < 0.035


def test_train_validation_holdout_never_overlap(tmp_path: Path):
    games = tmp_path / "games.jsonl"
    rows = []
    for i in range(120):
        site = f"https://lichess.org/a{i}"
        rows.append({"id": site, "white_elo": 2100, "black_elo": 2200,
                     "split": split_for_game(site), "moves": ["e2e4", "e7e5", "g1f3", "b8c6",
                     "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6", "e1g1", "e8g8"]})
    games.write_text("\n".join(json.dumps(row) for row in rows))
    samples, ids = load_positions(str(games), max_positions=400, min_ply=4, max_ply=12)
    assert len(samples["train"]) > 0 and len(samples["val"]) > 0 and len(samples["test"]) > 0
    assert not (ids["train"] & ids["val"] or ids["train"] & ids["test"] or ids["val"] & ids["test"])
