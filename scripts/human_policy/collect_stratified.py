"""Reproducible, balanced multi-archive collector for strong human Lichess games.

A bounded reservoir for each rating stratum prevents abundant 1850-2049 games
from crowding out scarce 2250-2550 examples. Does NOT store player usernames.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import random
from typing import Sequence

import chess.pgn

from .collect import BANDS, game_filter, iter_raw_games, open_source, rating_band, read_headers, split_for_game


def collect_stratified(sources: Sequence[str], output: str,
                       max_per_band: int = 500, min_elo: int = 1850,
                       max_elo: int = 2550, min_base_seconds: int = 600,
                       min_plies: int = 24, seed: int = 2026,
                       max_scanned: int = 3_000_000) -> dict:
    """Stream archives once and sample by highest participating human rating.

    Use max(WhiteElo, BlackElo) to ensure the upper rating strata contain
    examples from high-rated human players, even with lower-rated opponents.
    Both participants MUST still fall inside the requested overall range.
    """
    if not sources:
        raise ValueError("At least one archive source is required")
    if not (1 <= max_per_band <= 100000):
        raise ValueError("max_per_band must be 1..100000")
    keys = [f"{lo}-{hi}" for lo, hi in BANDS]
    reservoirs: dict[str, list[dict]] = {key: [] for key in keys}
    eligible_seen: Counter[str] = Counter()
    rejected: Counter[str] = Counter()
    game_ids: set[str] = set()
    rng = random.Random(seed)
    scanned = 0
    source_scanned: Counter[str] = Counter()

    for source in sources:
        with open_source(source) as stream:
            for raw in iter_raw_games(iter(stream)):
                if scanned >= max_scanned:
                    break
                scanned += 1
                source_scanned[source] += 1
                headers = read_headers(raw)
                reason = game_filter(headers, min_elo, max_elo, min_base_seconds)
                if reason:
                    rejected[reason] += 1
                    continue
                game_id = headers.get("Site", "")
                if not game_id or game_id in game_ids:
                    rejected["missing-or-duplicate-id"] += 1
                    continue
                white, black = int(headers["WhiteElo"]), int(headers["BlackElo"])
                band = rating_band(max(white, black))
                if band not in reservoirs:
                    rejected["unconfigured-band"] += 1
                    continue

                # Reservoir sampling: every qualifying game in the archive
                # has equal probability of remaining in its own rating band.
                eligible_seen[band] += 1
                existing = reservoirs[band]
                replacement = len(existing)
                if replacement >= max_per_band:
                    replacement = rng.randrange(eligible_seen[band])
                    if replacement >= max_per_band:
                        continue
                parsed = chess.pgn.read_game(io.StringIO(raw))
                if parsed is None or parsed.errors:
                    rejected["bad-pgn"] += 1
                    continue
                moves = [move.uci() for move in parsed.mainline_moves()]
                if not min_plies <= len(moves) <= 400:
                    rejected["wrong-length"] += 1
                    continue
                game_ids.add(game_id)
                row = {
                    "id": game_id,
                    "date": headers.get("UTCDate", headers.get("Date", "")),
                    "source": "lichess-rated-standard",
                    "white_elo": white, "black_elo": black,
                    "time_control": headers["TimeControl"],
                    "result": headers["Result"],
                    "split": split_for_game(game_id, seed),
                    "moves": moves,
                }
                if len(existing) < max_per_band:
                    existing.append(row)
                else:
                    existing[replacement] = row
        if scanned >= max_scanned:
            break

    selected = [row for band in keys for row in reservoirs[band]]
    rng.shuffle(selected)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256()
    with target.open("wb") as out:
        for row in selected:
            encoded = (json.dumps(row, separators=(",", ":")) + "\n").encode()
            out.write(encoded)
            h.update(encoded)
    bands = {band: len(reservoirs[band]) for band in keys}
    splits = Counter(row["split"] for row in selected)
    summary = {
        "schema": "swift-lichess-games-v1",
        "source": "; ".join(sources),
        "sources": list(sources),
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "filters": {
            "min_elo": min_elo, "max_elo": max_elo,
            "both_players_in_range": True,
            "min_base_seconds": min_base_seconds,
            "min_plies": min_plies, "rated_standard": True,
            "bot_titles_excluded": True,
            "stratified_by": "higher_player_rating",
            "max_per_band": max_per_band,
        },
        "seed": seed, "scanned": scanned, "source_scanned": dict(source_scanned),
        "candidate_games_seen": dict(eligible_seen),
        "accepted": len(selected),
        "total_plies": sum(len(row["moves"]) for row in selected),
        "rating_bands": bands, "splits": dict(splits),
        "rejected": dict(rejected),
        "games_sha256": h.hexdigest(),
        "scan_limit_reached": scanned >= max_scanned,
    }
    Path(output + ".manifest.json").write_text(json.dumps(summary, indent=2) + "\n")
    return summary


def main() -> None:
    p = argparse.ArgumentParser(description="Balanced human Lichess rated-game collector")
    p.add_argument("--input", action="append", required=True,
                   help="Repeat for each official .pgn.zst archive")
    p.add_argument("--output", required=True)
    p.add_argument("--max-per-band", type=int, default=500)
    p.add_argument("--min-elo", type=int, default=1850)
    p.add_argument("--max-elo", type=int, default=2550)
    p.add_argument("--min-base-seconds", type=int, default=600)
    p.add_argument("--min-plies", type=int, default=24)
    p.add_argument("--max-scanned", type=int, default=3_000_000)
    p.add_argument("--seed", type=int, default=2026)
    a = p.parse_args()
    report = collect_stratified(a.input, a.output, a.max_per_band,
                                a.min_elo, a.max_elo, a.min_base_seconds,
                                a.min_plies, a.seed, a.max_scanned)
    print(json.dumps(report, indent=2))
    if report["accepted"] < 60 or not all(report["splits"].get(x, 0)
                                              for x in ("train", "val", "test")):
        raise SystemExit("Insufficient sampled games for three-way train/val/test")


if __name__ == "__main__":
    main()
