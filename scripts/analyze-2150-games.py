#!/usr/bin/env python3
"""Independently annotate Swift gauntlet JSON with Stockfish and export honest PGNs.

Human-style scores are *unvalidated internal proxies*, NOT probabilities that a
human played the game. UCI_Elo caps are not human/chess.com Elo calibration.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import chess
import chess.engine
import chess.pgn


PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def score_cp(info, pov):
    return info["score"].pov(pov).score(mate_score=10000)


def tactical_reply(board: chess.Board, reply: chess.Move | None) -> list[str]:
    """Lightweight *candidate* motif labels; not a proof of a combination."""
    if reply is None or reply not in board.legal_moves:
        return []
    findings = []
    if board.gives_check(reply):
        findings.append("check")
    if board.is_capture(reply):
        findings.append("capture")
    piece = board.piece_at(reply.from_square)
    future = board.copy()
    future.push(reply)
    if piece is not None and piece.piece_type == chess.PAWN and not board.is_capture(reply):
        attacked = [p for square, p in future.piece_map().items()
                    if p.color != piece.color and p.piece_type != chess.PAWN
                    and future.is_attacked_by(piece.color, square)
                    and reply.to_square in future.attackers(piece.color, square)]
        if attacked:
            findings.append("pawn push attacks piece")
    mover = future.piece_at(reply.to_square)
    if mover and mover.piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN):
        valuables = [p for square, p in future.piece_map().items()
                     if p.color != mover.color and p.piece_type in (chess.ROOK, chess.QUEEN, chess.KING)
                     and reply.to_square in future.attackers(mover.color, square)]
        if len(valuables) >= 2:
            findings.append("multiple major-piece threats")
    return findings


def human_style_proxy(decisions, analyzed):
    """0-100 descriptive telemetry index. NOT a validated human similarity rating."""
    if not decisions:
        return None
    count = len(decisions)
    with_reasons = sum(bool(d.get("reasons")) for d in decisions) / count
    plan_follow = sum((d.get("planAge") or 0) >= 2 for d in decisions) / count
    plan_progress = sum((d.get("planProgress") or 0) >= .025 for d in decisions) / count
    loss_by_ply = {row["ply"]: row["lossCp"] for row in analyzed if row.get("isSwift")}
    safe = sum(min(1, (loss_by_ply.get(d["ply"], 0) or 0) / 180) for d in decisions) / count
    contextual = sum(
        d.get("source") == "human-plan" and bool(d.get("reasons"))
        and (loss_by_ply.get(d["ply"], 0) or 0) < 80
        for d in decisions
    ) / count
    value = 100 * (.20 * with_reasons + .20 * plan_follow + .10 * plan_progress
                   + .15 * contextual + .35 * (1 - safe))
    return round(value, 1)


def is_swift(game, index):
    if game.get("mode") == "self-play":
        return True
    return (index % 2 == 0) == (game.get("swiftColor") == "White")


def classify_weird(board, move, earlier_own_move, cp_loss):
    flags = []
    moved_piece = board.piece_at(move.from_square)
    if earlier_own_move and earlier_own_move.from_square == move.to_square and earlier_own_move.to_square == move.from_square:
        flags.append("piece immediately returns to former square")
    if cp_loss >= 200:
        flags.append("large unexplained evaluation loss")
    if moved_piece and moved_piece.piece_type == chess.QUEEN and board.fullmove_number <= 12 and not board.is_capture(move) and not board.gives_check(move):
        flags.append("early quiet queen move: inspect plan")
    return flags


def game_to_pgn(game, label, engine, depth):
    board = chess.Board()
    pgn = chess.pgn.Game()
    pgn.headers["Event"] = "Swift 2150 Research Gauntlet"
    pgn.headers["Site"] = "GitHub Actions"
    pgn.headers["White"] = "Swift" if game.get("mode") == "self-play" or game.get("swiftColor") == "White" else label
    pgn.headers["Black"] = "Swift" if game.get("mode") == "self-play" or game.get("swiftColor") == "Black" else label
    pgn.headers["Opening"] = game.get("opening", "Unknown")
    pgn.headers["Annotator"] = "Stockfish reference at depth " + str(depth)

    uci_moves = game["moves"]
    first_analysis = engine.analyse(board, chess.engine.Limit(depth=depth))
    current_analysis = first_analysis
    all_moves = []
    root = pgn
    decisions = {row["ply"]: row for row in game.get("decisions", [])}
    previous_own = {chess.WHITE: None, chess.BLACK: None}

    for i, uci in enumerate(uci_moves):
        ply = i + 1
        turn = board.turn
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            raise ValueError(f"Illegal recorded move {uci} at ply {ply}")
        old = board.copy()
        best = current_analysis.get("pv", [None])[0] if current_analysis else None
        before = score_cp(current_analysis, turn)
        san = board.san(move)
        board.push(move)
        after_info = engine.analyse(board, chess.engine.Limit(depth=depth))
        after = score_cp(after_info, turn)
        loss = max(0, before - after) if before is not None and after is not None else None

        swift = is_swift(game, i)
        d = decisions.get(ply, {})
        actual_reply = chess.Move.from_uci(uci_moves[i + 1]) if i + 1 < len(uci_moves) else None
        best_reply = after_info.get("pv", [None])[0] if after_info else None
        motifs = tactical_reply(board, actual_reply) if swift else []
        best_motifs = tactical_reply(board, best_reply) if swift else []
        prior = previous_own[turn]
        weird = classify_weird(old, move, prior, loss or 0) if swift else []
        previous_own[turn] = move

        row = {
            "ply": ply, "side": "White" if turn == chess.WHITE else "Black",
            "san": san, "uci": uci, "isSwift": swift,
            "lossCp": loss, "bestMove": old.san(best) if best else None,
            "actualOpponentReply": board.san(actual_reply) if actual_reply and actual_reply in board.legal_moves else None,
            "bestOpponentReply": board.san(best_reply) if best_reply and best_reply in board.legal_moves else None,
            "actualReplyMotifs": motifs, "bestReplyMotifs": best_motifs,
            "reviewFlags": weird,
            "source": d.get("source"), "plan": d.get("plan"),
            "reason": (d.get("reasons") or [""])[0],
        }
        all_moves.append(row)
        root = root.add_variation(move)
        if swift and (weird or (loss or 0) >= 100):
            note = [f"SF depth {depth}: loss {loss} cp", f"best {row['bestMove']}"]
            if d.get("plan"): note.append("Swift plan: " + str(d["plan"]))
            if motifs: note.append("played reply: " + ", ".join(motifs))
            if best_motifs: note.append("best reply: " + ", ".join(best_motifs))
            if weird: note.append("review: " + ", ".join(weird))
            root.comment = "; ".join(note)
        current_analysis = after_info

    reason = game.get("reason", "ongoing")
    if reason == "checkmate":
        result = "0-1" if board.turn == chess.WHITE else "1-0"
    elif reason == "ongoing":
        result = "*"
    else:
        result = "1/2-1/2"
    pgn.headers["Result"] = result
    if (result == "*") != (reason == "ongoing"):
        raise ValueError("Inconsistent completion claim")
    if board.fen() != game.get("finalFen"):
        raise ValueError("Final FEN does not match replay for " + label)

    swift_moves = [row for row in all_moves if row["isSwift"]]
    losses = [row["lossCp"] for row in swift_moves if row["lossCp"] is not None]
    mean_loss = round(sum(losses) / len(losses), 1) if losses else None
    biggest = sorted(swift_moves, key=lambda x: x["lossCp"] or 0, reverse=True)[:5]
    score = human_style_proxy(game.get("decisions", []), all_moves)
    return pgn, {
        "opening": game.get("opening"), "source": label, "result": result,
        "reason": reason, "plies": len(all_moves), "stockfishReferenceDepth": depth,
        "swiftAverageCpLoss": mean_loss,
        "swiftMistakes100cp": sum((v or 0) >= 100 for v in losses),
        "swiftBlunders200cp": sum((v or 0) >= 200 for v in losses),
        "humanStyleProxy0to100": score,
        "humanStyleRatingMeaning": "Unvalidated internal decision-process proxy; not probability of a human player",
        "criticalMoves": biggest, "moves": all_moves,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--depth", type=int, default=10)
    args = ap.parse_args()
    if args.depth < 5 or args.depth > 22:
        ap.error("--depth must be between 5 and 22")
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for file in sorted(args.input.rglob("*.json")):
        try:
            data = json.loads(file.read_text())
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(data, dict) or not isinstance(data.get("games"), list):
            continue
        if "configuration" not in data:
            continue
        for game in data["games"]:
            records.append((file.stem, data, game))
    if not records:
        raise RuntimeError("No game records found. No outcomes are invented.")

    engine = chess.engine.SimpleEngine.popen_uci("stockfish")
    engine.configure({"Threads": 1, "Hash": 64})
    summaries = []
    try:
        for number, (source, data, game) in enumerate(records, start=1):
            config = data.get("configuration", {})
            label = config.get("opponent", "Swift self-play")
            pgn, outcome = game_to_pgn(game, label, engine, args.depth)
            identity = re.sub("[^a-zA-Z0-9_-]+", "-", f"{number:03d}-{source}-{game.get('opening','')}")
            filename = identity[:130] + ".pgn"
            (args.output / filename).write_text(str(pgn) + "\n", encoding="utf-8")
            outcome.update({"pgn": filename, "opponentElo": config.get("opponentElo"),
                            "swiftColor": game.get("swiftColor"), "game": game.get("game"),
                            "profile": config.get("swift", {}).get("profile", config.get("swiftProfile"))})
            summaries.append(outcome)
    finally:
        engine.quit()

    by_level = {}
    for elo in sorted({x["opponentElo"] for x in summaries if x["opponentElo"] is not None}):
        group = [x for x in summaries if x["opponentElo"] == elo]
        wins = sum((x["result"] == ("1-0" if x["swiftColor"] == "White" else "0-1")) for x in group)
        losses = sum(x["result"] in ("1-0", "0-1") for x in group) - wins
        draws = sum(x["result"] == "1/2-1/2" for x in group)
        unresolved = sum(x["result"] == "*" for x in group)
        by_level[str(elo)] = {"games": len(group), "wins": wins, "losses": losses, "draws": draws,
                              "unresolved": unresolved, "score": wins + draws / 2}
    output = {"method": "Independent Stockfish depth reference; descriptive ratings only",
              "sampleSize": len(summaries), "opponents": by_level, "games": summaries,
              "limitations": [
                  "UCI_Elo is not calibrated to Chess.com or human Elo.",
                  "Small paired opening pilot; no reliable overall Elo estimate.",
                  "Human-style proxy is not validated against human game traces.",
                  "Single depth-limited reference evaluations can miss deep combinations.",
                  "Games capped at MAX_PLIES remain unresolved, never counted as draws."
              ]}
    (args.output / "analysis.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    lines = ["# Swift 2150 experimental match report", "", "Stockfish tactical review, depth "
             + str(args.depth) + ". Human-style scores are **internal proxies, not measured human likeness**.", "",
             "| Opponent | W | L | D | Unresolved |", "|---|---:|---:|---:|---:|"]
    for elo, r in by_level.items():
        lines.append(f"| Stockfish UCI_Elo {elo} | {r['wins']} | {r['losses']} | {r['draws']} | {r['unresolved']} |")
    lines += ["", "## Game records", ""]
    for row in summaries:
        lines += [
            f"### {row['pgn']}",
            f"Result: {row['result']} ({row['reason']}); {row['plies']} plies. "
            f"Swift ACPL: {row['swiftAverageCpLoss']}; blunders >=200 cp: {row['swiftBlunders200cp']}; "
            f"internal human-style proxy: {row['humanStyleProxy0to100']}/100.",
            ""
        ]
        for m in row["criticalMoves"][:3]:
            if (m["lossCp"] or 0) < 80: continue
            lines.append(
                f"- Ply {m['ply']} {m['side']} **{m['san']}**: {m['lossCp']}cp loss vs {m['bestMove']}; "
                f"opponent replied {m['actualOpponentReply'] or '(game ended)'} "
                f"({', '.join(m['actualReplyMotifs']) or 'no immediate motif identified'}). "
                f"Best reference reply: {m['bestOpponentReply'] or 'none'} "
                f"({', '.join(m['bestReplyMotifs']) or 'not forcing'}). "
                f"Flags: {', '.join(m['reviewFlags']) or 'review tactical continuation'}."
            )
        lines.append("")
    (args.output / "REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Analyzed {len(summaries)} recorded games. PGN, REPORT.md and analysis.json saved.")
    print(json.dumps(by_level, indent=2))


if __name__ == "__main__":
    main()
