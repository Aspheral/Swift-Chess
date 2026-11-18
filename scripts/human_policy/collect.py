"""Streaming rated-human Lichess game collector.

Usage: python -m scripts.human_policy.collect --input lichess_db_standard_rated_2014-01.pgn.zst --output data/human-games.jsonl
Does not store usernames. Single-pass; decompresses .zst without creating a giant PGN.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
from typing import Iterator
from urllib.request import Request, urlopen

import chess.pgn
import zstandard as zstd

HEADER = re.compile(r'^\[([A-Za-z0-9_]+) "((?:\\.|[^"\\])*)"\]$')
SOURCE_PREFIX = "https://database.lichess.org/standard/"
BANDS = ((1850, 2049), (2050, 2249), (2250, 2399), (2400, 2550))


def iter_raw_games(lines: Iterator[str]) -> Iterator[str]:
    """Detect boundaries before parsing costly SAN movetext, in constant memory."""
    parts: list[str] = []
    for line in lines:
        if line.startswith("[Event ") and parts:
            yield "".join(parts)
            parts.clear()
        if line.startswith("[Event ") or parts:
            parts.append(line)
            if sum(map(len, parts)) > 2_000_000:
                parts.clear()  # refuse malicious/malformed unbounded games
    if parts:
        yield "".join(parts)


def read_headers(raw: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in raw.splitlines():
        if not line.startswith("["):
            if headers:
                break
            continue
        m = HEADER.fullmatch(line.strip())
        if m:
            headers[m.group(1)] = m.group(2).replace(r'\\"', '"')
    return headers


def rating_band(rating: int) -> str:
    for lo, hi in BANDS:
        if lo <= rating <= hi:
            return f"{lo}-{hi}"
    return "out-of-range"


def game_filter(headers: dict[str, str], lo: int = 1850, hi: int = 2550,
                min_base_seconds: int = 600) -> str | None:
    if "rated" not in headers.get("Event", "").lower():
        return "not-rated"
    if headers.get("Variant", "Standard").lower() not in ("standard", "chess"):
        return "variant"
    if headers.get("WhiteTitle", "").upper() == "BOT" or headers.get("BlackTitle", "").upper() == "BOT":
        return "bot-title"
    try:
        white, black = int(headers["WhiteElo"]), int(headers["BlackElo"])
    except (KeyError, ValueError):
        return "missing-rating"
    if not (lo <= white <= hi and lo <= black <= hi):
        return "outside-rating-band"
    if headers.get("Result") not in ("1-0", "0-1", "1/2-1/2"):
        return "unresolved"
    control = headers.get("TimeControl", "")
    if not re.fullmatch(r"\d+\+\d+", control):
        return "unknown-clock"
    if int(control.split("+")[0]) < min_base_seconds:
        return "too-fast"
    return None


def split_for_game(game_id: str, seed: int = 2026) -> str:
    n = int.from_bytes(hashlib.sha256(f"{seed}:{game_id}".encode()).digest()[:8], "little") % 10
    return "train" if n < 8 else "val" if n == 8 else "test"


@contextmanager
def open_source(source: str):
    """Allow one official monthly URL or a local .pgn/.pgn.gz/.pgn.zst path."""
    with ExitStack() as stack:
        if source.startswith("https://"):
            if not source.startswith(SOURCE_PREFIX) or not source.endswith(".pgn.zst"):
                raise ValueError("Remote input must be an official Lichess standard PGN .zst")
            raw = stack.enter_context(urlopen(Request(source, headers={"User-Agent": "SwiftHumanPolicyResearch/1.0"}), timeout=90))
        else:
            raw = stack.enter_context(open(source, "rb"))
        if source.endswith(".zst"):
            binary = stack.enter_context(zstd.ZstdDecompressor().stream_reader(raw))
        elif source.endswith(".gz"):
            binary = stack.enter_context(gzip.GzipFile(fileobj=raw))
        else:
            binary = raw
        text = stack.enter_context(io.TextIOWrapper(binary, encoding="utf-8", errors="replace"))
        yield text


def collect(source: str, output: str, max_games: int = 5000, lo: int = 1850,
            hi: int = 2550, min_base_seconds: int = 600,
            seed: int = 2026, min_plies: int = 24) -> dict:
    if not (1 <= max_games <= 2_000_000):
        raise ValueError("max_games must be 1..2,000,000")
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    rejects: Counter[str] = Counter()
    splits: Counter[str] = Counter()
    rating_bands: Counter[str] = Counter()
    seen: set[str] = set()
    accepted = plies = scanned = 0

    with open_source(source) as lines, path.open("w", encoding="utf-8") as sink:
        for raw in iter_raw_games(iter(lines)):
            scanned += 1
            headers = read_headers(raw)
            reason = game_filter(headers, lo, hi, min_base_seconds)
            if reason:
                rejects[reason] += 1
                continue
            game_id = headers.get("Site", "")
            if not game_id:
                rejects["missing-id"] += 1
                continue
            if game_id in seen:
                rejects["duplicate"] += 1
                continue
            game = chess.pgn.read_game(io.StringIO(raw))
            if game is None or game.errors:
                rejects["bad-pgn"] += 1
                continue
            moves = [move.uci() for move in game.mainline_moves()]
            if len(moves) < min_plies or len(moves) > 400:
                rejects["wrong-length"] += 1
                continue
            seen.add(game_id)
            split = split_for_game(game_id, seed)
            white = int(headers["WhiteElo"])
            black = int(headers["BlackElo"])
            row = {
                "id": game_id, "date": headers.get("UTCDate", headers.get("Date", "")),
                "source": "lichess-rated-standard", "white_elo": white, "black_elo": black,
                "time_control": headers["TimeControl"], "result": headers["Result"],
                "split": split, "moves": moves,
            }
            sink.write(json.dumps(row, separators=(",", ":")) + "\n")
            accepted += 1
            plies += len(moves)
            splits[split] += 1
            rating_bands[rating_band((white + black) // 2)] += 1
            if accepted >= max_games:
                break
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(block)
    manifest = {
        "schema": "swift-lichess-games-v1",
        "source": source,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "filters": {"min_elo": lo, "max_elo": hi, "min_base_seconds": min_base_seconds,
                    "min_plies": min_plies, "both_players_in_range": True,
                    "rated_standard": True, "bot_titles_excluded": True},
        "seed": seed, "scanned": scanned, "accepted": accepted, "total_plies": plies,
        "splits": dict(splits), "rating_bands": dict(rating_bands),
        "rejected": dict(rejects), "games_sha256": hasher.hexdigest(),
    }
    Path(str(path) + ".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    p = argparse.ArgumentParser(description="Stream Lichess rated games for human neural policy training")
    p.add_argument("--input", required=True, help="Official Lichess monthly .pgn.zst URL or local PGN/zst/gz")
    p.add_argument("--output", required=True)
    p.add_argument("--max-games", type=int, default=5000)
    p.add_argument("--min-elo", type=int, default=1850)
    p.add_argument("--max-elo", type=int, default=2550)
    p.add_argument("--min-base-seconds", type=int, default=600)
    p.add_argument("--min-plies", type=int, default=24)
    p.add_argument("--seed", type=int, default=2026)
    args = p.parse_args()
    result = collect(args.input, args.output, args.max_games, args.min_elo,
                     args.max_elo, args.min_base_seconds, args.seed, args.min_plies)
    print(json.dumps(result, indent=2))
    if result["accepted"] < 30 or not all(result["splits"].get(x, 0) for x in ("train", "val", "test")):
        raise SystemExit("Too few valid split human games; try a larger archive / less filtering.")


if __name__ == "__main__":
    main()
