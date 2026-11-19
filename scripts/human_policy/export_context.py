"""Export Swift's ACTUAL trained PyTorch contextual policy as gated int8 JSON.

The output is a numerical inference artifact, not a release approval. No
checkpoint is embedded, loaded or enabled automatically on the Swift site.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from .train_contextual import CONTEXT_FEATURES, ContextPolicyNet

SCHEMA = "swift-human-policy-context-v1"
FEATURE_SCHEMA = "swift-human-policy-features+history8-v1"


def export_context_checkpoint(checkpoint: str, output: str) -> dict:
    """Deterministic per-row int8 weights, matching the existing JS scorer."""
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    if saved.get("release_approved") is not False:
        raise ValueError("Expected a not release-approved research checkpoint")
    metadata = saved.get("architecture")
    if not isinstance(metadata, dict) or metadata.get("feature_size") != CONTEXT_FEATURES:
        raise ValueError("Contextual checkpoint metadata has the wrong feature schema")
    network = ContextPolicyNet()
    network.load_state_dict(saved["state_dict"], strict=True)
    network.eval()
    linear_layers = [layer for layer in network.layers if isinstance(layer, nn.Linear)]
    layers: list[dict] = []
    for index, linear in enumerate(linear_layers):
        weight = linear.weight.detach().numpy()
        max_by_row = np.max(np.abs(weight), axis=1)
        scale = np.maximum(max_by_row / 127.0, 1e-8)
        quantized = np.clip(np.rint(weight / scale[:, None]), -127, 127).astype(np.int8)
        layers.append({
            "in": int(weight.shape[1]),
            "out": int(weight.shape[0]),
            "qweight": quantized.tolist(),
            "scale": scale.round(9).tolist(),
            "bias": linear.bias.detach().numpy().round(9).tolist(),
            "activation": "identity" if index == len(linear_layers) - 1 else "relu",
        })
    model = {
        "schema": SCHEMA,
        "feature_schema": FEATURE_SCHEMA,
        "feature_size": CONTEXT_FEATURES,
        "enabled_by_default": False,
        "method": "supervised-human-full-legal-move-imitation",
        "training": metadata,
        "release_approved": False,
        "layers": layers,
    }
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(model, separators=(",", ":")) + "\n", encoding="utf-8")
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description="Export trained disabled contextual neural inference weights")
    parser.add_argument("--checkpoint", required=True, help="Validated original PyTorch .pt")
    parser.add_argument("--output", required=True, help="Research-only inference JSON")
    args = parser.parse_args()
    exported = export_context_checkpoint(args.checkpoint, args.output)
    print(json.dumps({"schema": exported["schema"],
                      "training_sha256": exported["training"].get("games_sha256"),
                      "enabled_by_default": False,
                      "layers": [(x["in"], x["out"]) for x in exported["layers"]]},
                     indent=2))


if __name__ == "__main__":
    main()
