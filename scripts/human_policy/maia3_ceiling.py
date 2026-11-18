"""Compare Swift's *trained* small NN to published Maia-3 on identical games.

Research only: do NOT bundle Maia-3 into the Swift website; the official
Maia-3 inference package uses AGPL-3.0 and pretrained checkpoints require
separate licensing/attribution review. This script does not train Swift.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sys
from typing import Callable, Sequence

import chess
import chess.engine
import numpy as np

from .collect import rating_band
from .features import all_legal_features, FEATURE_SIZE
from .train import Example, load_positions


def evaluate_predictor(examples: Sequence[Example],
                       predict: Callable[[str, int], str]) -> dict:
    """Score exact top-1, never top-k or filtered legal subsets."""
    correct = 0
    grouped: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    phases: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for fen, played, rating in examples:
        board = chess.Board(fen)
        legal = {move.uci() for move in board.legal_moves}
        if played not in legal:
            raise ValueError("Recorded human move is not legal")
        prediction = predict(fen, rating)
        if prediction not in legal:
            raise ValueError("Predicted move must be legal")
        hit = int(prediction == played)
        correct += hit
        grouped[rating_band(rating)][0] += 1
        grouped[rating_band(rating)][1] += hit
        phase = "opening" if board.ply() < 24 else "middlegame" if board.ply() < 80 else "endgame"
        phases[phase][0] += 1
        phases[phase][1] += hit
    if not examples:
        raise ValueError("No held-out positions to compare")
    def summarize(groups: dict[str, list[int]]) -> dict:
        return {name: {"count": n, "top1": round(hits / n, 5)}
                for name, (n, hits) in sorted(groups.items())}
    return {
        "positions": len(examples),
        "correct": correct,
        "top1": round(correct / len(examples), 5),
        "by_band": summarize(grouped),
        "by_phase": summarize(phases),
    }


def score_quantized_policy(board: chess.Board, rating: int,
                           checkpoint: dict) -> str:
    """Faithfully evaluate Swift's saved int8 neural layers on every legal move."""
    if checkpoint.get("schema") != "swift-human-policy-mlp-v1" or             checkpoint.get("feature_schema") != "swift-human-policy-features-v1" or             checkpoint.get("feature_size") != FEATURE_SIZE:
        raise ValueError("Invalid Swift neural feature schema")
    legal, x = all_legal_features(board, rating)
    if not legal:
        raise ValueError("No legal move")
    for index, layer in enumerate(checkpoint["layers"]):
        weights = np.asarray(layer["qweight"], dtype=np.float32)
        scales = np.asarray(layer["scale"], dtype=np.float32)
        bias = np.asarray(layer["bias"], dtype=np.float32)
        if weights.ndim != 2 or weights.shape[1] != x.shape[1] or                 weights.shape[0] != len(scales) or weights.shape[0] != len(bias):
            raise ValueError("Invalid quantized neural layer dimensions")
        x = x @ (weights * scales[:, None]).T + bias
        if layer["activation"] == "relu":
            x = np.maximum(x, 0)
        elif layer["activation"] != "identity":
            raise ValueError("Unrecognized neural layer activation")
    if x.shape != (len(legal), 1):
        raise ValueError("Swift neural final output is not one score per legal move")
    return legal[int(np.argmax(x[:, 0]))].uci()


def benchmark(games: str, student_checkpoint: str, output: str,
              maia_model: str = "maia3-5m", max_test: int = 400,
              seed: int = 2026) -> dict:
    if maia_model not in ("maia3-5m", "maia3-23m", "maia3-79m"):
        raise ValueError("Use a released, known Maia-3 model size")
    if not 1 <= max_test <= 3500:
        raise ValueError("Pilot sample must be between 1 and 3500 positions")
    manifest = json.loads(Path(games + ".manifest.json").read_text())
    checksum = hashlib.sha256(Path(games).read_bytes()).hexdigest()
    if checksum != manifest["games_sha256"]:
        raise ValueError("Dataset SHA256 differs from the baseline benchmark")
    positions, _ = load_positions(games, max_positions=40000,
                                  max_eval_positions=3500, seed=seed)
    held_out = positions["test"][:max_test]
    checkpoint = json.loads(Path(student_checkpoint).read_text())
    student = evaluate_predictor(held_out,
                                 lambda fen, rating: score_quantized_policy(
                                     chess.Board(fen), rating, checkpoint))
    engine_cmd = [sys.executable, "-m", "maia3.uci",
                  "--model", maia_model, "--device", "cpu", "--no-use-amp"]
    with chess.engine.SimpleEngine.popen_uci(engine_cmd, timeout=120) as eng:
        # python-chess manages MultiPV itself; only configure deterministic sampling.
        eng.configure({"Temperature": "0"})

        def predict_published(fen: str, rating: int) -> str:
            eng.configure({"SelfElo": rating, "OppoElo": rating})
            choice = eng.play(chess.Board(fen), chess.engine.Limit(nodes=1),
                              info=chess.engine.INFO_NONE)
            if not choice.move:
                raise RuntimeError("Published Maia-3 returned no legal move")
            return choice.move.uci()

        teacher = evaluate_predictor(held_out, predict_published)
    results = {
        "schema": "swift-human-policy-published-baseline-v1",
        "published_model": maia_model,
        "published_model_is_not_swift": True,
        "experiment_type": "zero-shot-pretrained-model-vs-own-trained-model",
        "source_sha256": checksum,
        "same_positions": True,
        "source_games": manifest["accepted"],
        "test_positions": len(held_out),
        "train_val_test_separation": "whole game IDs",
        "history": "FEN only for BOTH models; published model pads its missing history",
        "rating_conditioning": "current player's Lichess rating, same value as opponent",
        "swift_small_neural": student,
        "published_maia3": teacher,
        "top1_goal": 0.60,
        "swift_goal_reached": student["top1"] >= 0.60 and len(held_out) == 3500,
        "warnings": [
            "This compares architectures, not a newly trained 60% Swift model.",
            "A 400-position pilot cannot certify 60% on the 3500-position holdout.",
            "No Maia-3 code or weights are bundled with Swift production.",
            "The research comparison is not a Chess.com or human-likeness percentage.",
        ],
    }
    dest = Path(output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"swift": student["top1"], "maia": teacher["top1"],
                      "positions": len(held_out)}, indent=2), flush=True)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare against pretrained Maia-3 human chess policy")
    parser.add_argument("--games", required=True)
    parser.add_argument("--student-checkpoint", required=True)
    parser.add_argument("--model", choices=("maia3-5m", "maia3-23m", "maia3-79m"), default="maia3-5m")
    parser.add_argument("--max-test", type=int, default=400)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()
    benchmark(args.games, args.student_checkpoint, args.output, args.model,
              args.max_test, args.seed)


if __name__ == "__main__":
    main()
