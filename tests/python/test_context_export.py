"""Export a REAL trained contextual checkpoint for Swift's opt-in browser scorer."""
from pathlib import Path
import json

import chess
import numpy as np
import torch

from scripts.human_policy.train_contextual import (
    CONTEXT_FEATURES, ContextPolicyNet, contextual_features,
)
from scripts.human_policy.export_context import export_context_checkpoint


def test_exported_trained_contextual_model_matches_torch_logits(tmp_path: Path):
    torch.manual_seed(34)
    network = ContextPolicyNet()
    checkpoint = tmp_path / "context.pt"
    torch.save({
        "state_dict": network.state_dict(),
        "architecture": {"feature_size": CONTEXT_FEATURES, "games_sha256": "test-sha"},
        "release_approved": False,
    }, checkpoint)
    output = tmp_path / "context.json"
    export_context_checkpoint(str(checkpoint), str(output))
    model = json.loads(output.read_text())
    assert model["schema"] == "swift-human-policy-context-v1"
    assert model["feature_schema"] == "swift-human-policy-features+history8-v1"
    assert model["feature_size"] == 1949
    assert model["enabled_by_default"] is False
    assert model["training"]["games_sha256"] == "test-sha"
    assert [layer["in"] for layer in model["layers"]] == [1949, 128, 64]
    assert [layer["out"] for layer in model["layers"]] == [128, 64, 1]

    board = chess.Board()
    played = []
    for uci in ("e2e4", "e7e5", "g1f3", "b8c6"):
        played.append(uci)
        board.push_uci(uci)
    legal = list(board.legal_moves)[:5]
    features = np.stack([contextual_features(board, m, 2200, played) for m in legal])
    x = features
    for layer in model["layers"]:
        qweight = np.asarray(layer["qweight"], dtype=np.float32)
        scale = np.asarray(layer["scale"], dtype=np.float32)
        bias = np.asarray(layer["bias"], dtype=np.float32)
        x = x @ (qweight * scale[:, None]).T + bias
        if layer["activation"] == "relu":
            x = np.maximum(x, 0)
    with torch.no_grad():
        ref = network(torch.from_numpy(features)).numpy()
    assert np.max(np.abs(x[:, 0] - ref)) < 0.04


def test_release_approved_checkpoint_cannot_be_exported_as_research(tmp_path: Path):
    from pytest import raises
    model = ContextPolicyNet()
    checkpoint = tmp_path / "invalid.pt"
    torch.save({"state_dict": model.state_dict(), "release_approved": True}, checkpoint)
    with raises(ValueError, match="not release-approved"):
        export_context_checkpoint(str(checkpoint), str(tmp_path / "out.json"))
