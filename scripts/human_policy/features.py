"""Human-oriented, mover-relative chess position + legal candidate features.

The feature schema is versioned because Swift's lightweight TypeScript inference
must calculate identical numbers before any trained policy can be enabled.
"""
from __future__ import annotations

import chess
import numpy as np

SCHEMA = "swift-human-policy-features-v1"
BOARD_FEATURES = 12 * 64
MOVE_FEATURES = 64 * 2 + 6 + 6 + 5
EXTRA_FEATURES = 12
FEATURE_SIZE = BOARD_FEATURES + MOVE_FEATURES + EXTRA_FEATURES  # 925


def oriented(square: int, side: chess.Color) -> int:
    return square if side == chess.WHITE else chess.square_mirror(square)


def move_features(board: chess.Board, move: chess.Move, rating: int) -> np.ndarray:
    """One-hot board/piece planes plus candidate origin, destination and context."""
    vector = np.zeros(FEATURE_SIZE, dtype=np.float32)
    side = board.turn
    for square, piece in board.piece_map().items():
        plane = piece.piece_type - 1 + (0 if piece.color == side else 6)
        vector[plane * 64 + oriented(square, side)] = 1.0
    vector[768 + oriented(move.from_square, side)] = 1.0
    vector[832 + oriented(move.to_square, side)] = 1.0
    mover = board.piece_at(move.from_square)
    if mover is None:
        raise ValueError("Candidate has no moving piece")
    vector[896 + mover.piece_type - 1] = 1.0
    captured = board.piece_at(move.to_square)
    if board.is_en_passant(move):
        vector[902 + chess.PAWN - 1] = 1.0
    elif captured:
        vector[902 + captured.piece_type - 1] = 1.0
    if move.promotion:
        vector[908 + move.promotion - 1] = 1.0

    base = 913
    vector[base + 0] = float(board.is_check())
    vector[base + 1] = float(board.gives_check(move))
    vector[base + 2] = float(board.is_capture(move))
    vector[base + 3] = float(board.is_castling(move))
    vector[base + 4] = float(board.is_en_passant(move))
    vector[base + 5] = float(side == chess.BLACK)
    vector[base + 6] = float(np.clip((rating - 2200) / 350.0, -1, 1))
    vector[base + 7] = float(min(1.0, board.ply() / 160.0))
    vector[base + 8] = float(board.has_kingside_castling_rights(side))
    vector[base + 9] = float(board.has_queenside_castling_rights(side))
    vector[base + 10] = float(board.has_kingside_castling_rights(not side))
    vector[base + 11] = float(board.has_queenside_castling_rights(not side))
    return vector


def all_legal_features(board: chess.Board, rating: int) -> tuple[list[chess.Move], np.ndarray]:
    legal = list(board.legal_moves)
    if not legal:
        return [], np.empty((0, FEATURE_SIZE), dtype=np.float32)
    return legal, np.stack([move_features(board, move, rating) for move in legal])


def feature_fixture() -> dict:
    """Cross-runtime parity vector for TypeScript feature encoder."""
    board = chess.Board()
    played = chess.Move.from_uci("e2e4")
    features = move_features(board, played, 2200)
    return {"schema": SCHEMA, "fen": board.fen(), "move": played.uci(),
            "rating": 2200, "active_indices": np.flatnonzero(features).tolist(),
            "values": features[np.flatnonzero(features)].round(6).tolist()}
