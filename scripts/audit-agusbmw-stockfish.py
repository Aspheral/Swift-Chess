#!/usr/bin/env python3
"""Independent Stockfish audit of SAN-replayed positions from the Agusbmw game.

No chess strength or game outcome is inferred from a single depth-limited PV.
These FENs are pinned to legal replay checkpoints in the Vitest fixture.
"""
import json
import re
import subprocess

SAMPLES = [
    ("8.Qd3 developing queen into center", "rnbq1rk1/ppp1b1pp/4p3/3p1p2/3Pn3/2N1PNP1/PPP2PBP/R1BQ1RK1 w - - 2 8"),
    ("9.Re1 rook maneuver", "rnbq1rk1/p1p1b1pp/1p2p3/3p1p2/3Pn3/2NQPNP1/PPP2PBP/R1B2RK1 w - - 0 9"),
    ("10.Re2 rook redeployment", "rnbq1rk1/2p1b1pp/1p2p3/p2p1p2/3Pn3/2NQPNP1/PPP2PBP/R1B1R1K1 w - a6 0 10"),
    ("11.Nb5 before pawn attack", "rn1q1rk1/2p1b1pp/bp2p3/p2p1p2/3Pn3/2NQPNP1/PPP1RPBP/R1B3K1 w - - 2 11"),
    ("12.a4 with attacked knight", "rn1q1rk1/4b1pp/bpp1p3/pN1p1p2/3Pn3/3QPNP1/PPP1RPBP/R1B3K1 w - - 0 12"),
    ("24.Qxb4 complex queen exchange", "r6k/2q3pp/1pPr1n2/p2p1pn1/Qb1P4/4PPP1/RPR3BP/2B3K1 w - - 1 24"),
    ("50.Rxe3 before checking intermezzo", "8/8/4rnk1/7p/3P1K1P/1R2p1P1/1P6/8 w - - 0 50"),
]

def wait_for(proc, token):
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("Stockfish stopped before " + token)
        if line.startswith(token):
            return line.strip()

def analyze(proc, label, fen, depth=16):
    proc.stdin.write("position fen " + fen + "\n")
    proc.stdin.write("go depth " + str(depth) + "\n")
    proc.stdin.flush()
    variations = {}
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("Stockfish exited during " + label)
        line = line.strip()
        if line.startswith("info ") and " pv " in line:
            d = re.search(r"\bdepth (\d+)\b", line)
            n = re.search(r"\bmultipv (\d+)\b", line)
            score = re.search(r"\bscore (cp|mate) (-?\d+)\b", line)
            pv = line.split(" pv ", 1)[1].split()
            if d and n and score and pv:
                variations[int(n.group(1))] = {
                    "depth": int(d.group(1)),
                    "scoreType": score.group(1),
                    "score": int(score.group(2)),
                    "move": pv[0],
                    "line": pv[:12],
                }
        if line.startswith("bestmove"):
            best = line.split()[1]
            break
    result = {"label": label, "fen": fen, "depthRequested": depth,
              "bestmove": best, "lines": [variations[k] for k in sorted(variations)]}
    print("AGUSBMW_STOCKFISH " + json.dumps(result), flush=True)
    return result

def main():
    proc = subprocess.Popen(["stockfish"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, bufsize=1)
    try:
        proc.stdin.write("uci\n")
        proc.stdin.flush()
        wait_for(proc, "uciok")
        proc.stdin.write("setoption name Threads value 1\n")
        proc.stdin.write("setoption name Hash value 64\n")
        proc.stdin.write("setoption name MultiPV value 4\n")
        proc.stdin.write("isready\n")
        proc.stdin.flush()
        wait_for(proc, "readyok")
        for label, fen in SAMPLES:
            analyze(proc, label, fen, depth=16)
    finally:
        proc.stdin.write("quit\n")
        proc.stdin.flush()
        proc.wait(timeout=10)

if __name__ == "__main__":
    main()
