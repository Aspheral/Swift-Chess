#!/usr/bin/env python3
"""Reproduce the supplied Roblox Swift game and locate critical defensive errors.

Uses python-chess PGN rules and independent full-strength Stockfish.
Every actual Black move is compared with the strongest discovered move from
the SAME root at identical depth, excluding outcome-based assumptions.
"""
import argparse
import io
import json
from pathlib import Path
import chess
import chess.pgn
import chess.engine

def score(info, side):
    pov=info["score"].pov(side)
    return {"cp":pov.score(mate_score=10000),"mate":pov.mate()}

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--pgn",default="tests/fixtures/roblox-20261018-1A14CD5416564.pgn")
    cli.add_argument("--engine",default="/usr/games/stockfish")
    cli.add_argument("--depth",type=int,default=15)
    cli.add_argument("--output",default="calibration-results/roblox-20261018-analysis.json")
    args=cli.parse_args()
    src=Path(args.pgn).read_text()
    game=chess.pgn.read_game(io.StringIO(src))
    if game is None or game.errors: raise RuntimeError(f"PGN parse errors: {getattr(game,'errors',None)}")
    board=game.board()
    engine=chess.engine.SimpleEngine.popen_uci(args.engine)
    engine.configure({"Threads":1,"Hash":128})
    results=[]
    try:
        for ply,move in enumerate(game.mainline_moves(),1):
            if move not in board.legal_moves:
                raise RuntimeError(f"Illegal ply {ply}: {move.uci()}")
            if board.turn==chess.BLACK:
                san=board.san(move)
                fen=board.fen()
                before=engine.analyse(board,chess.engine.Limit(depth=args.depth),game=ply)
                proposed=before["pv"][0]
                pv=[board.san(proposed)]
                best=score(before,chess.BLACK)
                if proposed==move:
                    played=before
                else:
                    played=engine.analyse(board,chess.engine.Limit(depth=args.depth),
                                          root_moves=[move],game=ply)
                actual=score(played,chess.BLACK)
                regret=max(0,best["cp"]-actual["cp"])
                record={"moveNumber":board.fullmove_number,"ply":ply,
                  "fen":fen,"played":san,"playedUci":move.uci(),
                  "best":board.san(proposed),"bestUci":proposed.uci(),
                  "bestScore":best,"playedScore":actual,"regretCp":regret}
                results.append(record)
                print(f'{record["moveNumber"]:2d}...{san:8} preferred {record["best"]:8}'
                      f' best {best["cp"]:6d} mate {str(best["mate"]):>4}'
                      f' played {actual["cp"]:6d} mate {str(actual["mate"]):>4}'
                      f' loss {regret:5d}',flush=True)
            board.push(move)
    finally:
        engine.quit()
    if not board.is_checkmate() or board.result()!="1-0":
        raise RuntimeError("Recorded game did not checkmate Black")
    output={"gameId":game.headers["GameId"],"result":board.result(),
        "moves":len(results),"depth":args.depth,
        "firstDefiniteMateAllowed":next((r for r in results
            if r["playedScore"]["mate"] is not None
            and r["playedScore"]["mate"]<0 and
            (r["bestScore"]["mate"] is None or r["bestScore"]["mate"]<0)),None),
        "mostCostly":sorted(results,key=lambda r:r["regretCp"],reverse=True)[:12],
        "allBlackMoves":results}
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(output,indent=2))
    print("ROBLOX-AUDIT-SUMMARY")
    for row in output["mostCostly"][:10]:
        print(f'  {row["moveNumber"]}...{row["played"]} vs {row["best"]} loss {row["regretCp"]}cp;'
              f' played mate {row["playedScore"]["mate"]}')
    print("ROBLOX-AUDIT-END")
if __name__=="__main__": main()
