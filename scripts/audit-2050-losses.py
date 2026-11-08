#!/usr/bin/env python3
"""Independent fixed-depth Stockfish audit of the immutable 200-game Swift match.

Compares Stockfish's preferred move against Swift's played move from the same
root, at equal nominal depth. Scores are heuristics, NOT Chess.com accuracy.
Preset opening moves are excluded from Swift's error count.
"""
import argparse, collections, csv, json, statistics
from pathlib import Path
import chess
import chess.engine

OPENINGS={
    "Reti / ...d5":4, "Reti / kingside fianchetto":4,
    "Queen's Gambit Declined":6, "Slav structure":6,
    "Queen's Gambit Accepted":6, "London structure":6,
    "Four Knights":6, "Scotch structure":6,
    "Bishop's Opening":6, "Italian structure":6,
}
EXPECTED={"win":68,"draw":52,"loss":80}

def cp(info, color):
    return info["score"].pov(color).score(mate_score=10000)

def stage(board):
    units=sum(len(board.pieces(p,c))*w
        for c in (chess.WHITE,chess.BLACK)
        for p,w in ((chess.KNIGHT,1),(chess.BISHOP,1),(chess.ROOK,2),(chess.QUEEN,4)))
    return "opening" if units>=19 else "endgame" if units<=7 else "middlegame"

def audit_game(engine, game, batch, depth):
    if game["result"] not in EXPECTED or game["opening"] not in OPENINGS:
        raise ValueError("Unexpected benchmark game metadata")
    board=chess.Board()
    swift=chess.WHITE if game["swiftColor"]=="White" else chess.BLACK
    annotated=[]
    for idx,uci in enumerate(game["moves"]):
        move=chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            raise ValueError(f"Illegal move: batch {batch}, game {game['game']}, ply {idx+1}, {uci}")
        if idx>=OPENINGS[game["opening"]] and board.turn==swift:
            color=board.turn
            san=board.san(move)
            best=engine.analyse(board,chess.engine.Limit(depth=depth),
                game=f"batch{batch}-game{game['game']}")
            preferred=best.get("pv",[None])[0]
            best_cp=cp(best,color)
            if preferred==move:
                chosen_cp=best_cp
            else:
                chosen=engine.analyse(board,chess.engine.Limit(depth=depth),
                    root_moves=[move],game=f"batch{batch}-game{game['game']}")
                chosen_cp=cp(chosen,color)
            regret=max(0,best_cp-chosen_cp)
            annotated.append({
                "ply":idx+1,"moveNumber":board.fullmove_number,"san":san,
                "uci":uci,"stage":stage(board),
                "best":preferred.uci() if preferred else None,
                "bestSan":board.san(preferred) if preferred else None,
                "bestCp":best_cp,"playedCp":chosen_cp,"regretCp":regret,
                "inaccuracy75":regret>=75,"mistake150":regret>=150,
                "blunder300":regret>=300,
                "competitiveMistake150":regret>=150 and best_cp>=-300,
                "competitiveBlunder300":regret>=300 and best_cp>=-300,
            })
        board.push(move)
    if board.fen(en_passant="fen")!=game["finalFen"]:
        raise ValueError(f"Replay final FEN differs: batch={batch}, game={game['game']}")
    if not annotated: raise ValueError("No Swift moves found")
    critical=[m for m in annotated if m["competitiveBlunder300"]]
    return {
        "id":f"batch-{batch}-game-{game['game']}",
        "batch":batch,"game":game["game"],"opening":game["opening"],
        "color":game["swiftColor"],"result":game["result"],
        "reason":game["reason"],"plies":game["plies"],"swiftMoves":len(annotated),
        "averageRegretCp":round(statistics.mean(m["regretCp"] for m in annotated),2),
        "blunder300":sum(m["blunder300"] for m in annotated),
        "mistake150":sum(m["mistake150"] for m in annotated),
        "competitiveBlunder300":len(critical),
        "firstCompetitiveBlunder":critical[0] if critical else None,
        "humanity":game["humanity"],"moves":annotated,
    }

def analyze(args):
    original=json.loads(Path(args.input).read_text())
    config=original["configuration"]
    assert config["mode"]=="human" and config["opponentElo"]==2050
    assert len(original["games"])==20
    engine=chess.engine.SimpleEngine.popen_uci(args.engine)
    engine.configure({"Threads":1,"Hash":96})
    games=[]
    try:
        for i,game in enumerate(original["games"]):
            result=audit_game(engine,game,config["batch"],args.depth)
            games.append(result)
            print(f"batch={config['batch']} game={i+1}/20 result={result['result']} "
                f"moves={result['swiftMoves']} blunders={result['blunder300']} "
                f"competitive={result['competitiveBlunder300']} "
                f"avgRegret={result['averageRegretCp']}",flush=True)
    finally: engine.quit()
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps({
        "sourceRun":39005772490,"batch":config["batch"],"depth":args.depth,
        "games":games},indent=2))

def category(n):
    if n==0:return "0"
    if n==1:return "1"
    if n==2:return "2"
    if n<=4:return "3-4"
    return "5+"

def summary(games):
    moves=[m for g in games for m in g["moves"]]
    return {
        "games":len(games),"swiftMoves":len(moves),
        "meanCpRegretPerMove":round(statistics.mean(m["regretCp"] for m in moves),2),
        "medianGameCpRegret":round(statistics.median(g["averageRegretCp"] for g in games),2),
        "inaccuracies75Per100Moves":round(100*sum(m["inaccuracy75"] for m in moves)/len(moves),2),
        "mistakes150Per100Moves":round(100*sum(m["mistake150"] for m in moves)/len(moves),2),
        "blunders300Per100Moves":round(100*sum(m["blunder300"] for m in moves)/len(moves),2),
        "competitiveBlunders300Per100Moves":round(100*sum(m["competitiveBlunder300"] for m in moves)/len(moves),2),
        "gamesWithBlunder":sum(g["blunder300"]>0 for g in games),
        "gamesWithCompetitiveBlunder":sum(g["competitiveBlunder300"]>0 for g in games),
        "blundersPerGame":dict(collections.Counter(category(g["blunder300"]) for g in games)),
        "competitiveBlundersPerGame":dict(collections.Counter(category(g["competitiveBlunder300"]) for g in games)),
    }

def aggregate(args):
    files=sorted(Path(args.input).glob("audit-batch-*.json"))
    if len(files)!=10:raise ValueError(f"Expected 10 batches; got {len(files)}")
    batches=[json.loads(p.read_text()) for p in files]
    if sorted(x["batch"] for x in batches)!=list(range(10)):
        raise ValueError("Duplicate or missing batch ID")
    games=[g for b in batches for g in b["games"]]
    if len(games)!=200 or dict(collections.Counter(g["result"] for g in games))!=EXPECTED:
        raise ValueError("Not the expected complete 200-game 68/52/80 run")
    grouped={outcome:[g for g in games if g["result"]==outcome]
             for outcome in ("win","draw","loss")}
    losing=grouped["loss"]
    allmoves=[dict(m,gameId=g["id"],result=g["result"],color=g["color"],opening=g["opening"])
        for g in games for m in g["moves"]]
    worstmoves=sorted((m for m in allmoves if m["result"]=="loss"),
       key=lambda m:m["regretCp"],reverse=True)[:30]
    worstgames=sorted(losing,
       key=lambda g:(g["competitiveBlunder300"],g["blunder300"],g["averageRegretCp"]),
       reverse=True)[:20]
    report={
        "sourceRun":39005772490,
        "method":{
            "analyzer":"Full-strength independent Stockfish at nominal depth 11",
            "comparison":"Best move vs actual move, searched separately at same root and nominal depth",
            "excluded":"All fixed starting opening plies, not played by Swift",
            "thresholdsCp":{"inaccuracy":75,"mistake":150,"blunder":300},
            "competitiveDefinition":"Best evaluation before move is at least -300cp",
            "limitations":"A fixed-depth engine estimate, not an official blunder definition; tactical mate swings and horizon effects require manual review"},
        "byOutcome":{k:summary(v) for k,v in grouped.items()},
        "byColor":{c:summary([g for g in games if g["color"]==c]) for c in ("White","Black")},
        "byOpening":{n:summary([g for g in games if g["opening"]==n]) for n in OPENINGS},
        "lostGamesNoBlunders":sum(g["blunder300"]==0 for g in losing),
        "lostGamesOneBlunder":sum(g["blunder300"]==1 for g in losing),
        "lostGamesMultipleBlunders":sum(g["blunder300"]>=2 for g in losing),
        "lostGamesFivePlusBlunders":sum(g["blunder300"]>=5 for g in losing),
        "lostGamesNoCompetitiveBlunders":sum(g["competitiveBlunder300"]==0 for g in losing),
        "worstLostGames":[{
            k:v for k,v in g.items() if k not in ("moves","humanity")
        } for g in worstgames],
        "worstLostMoves":worstmoves,
    }
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2))
    path=target.with_name("swift-2050-audit-moves.csv")
    columns=["gameId","result","color","opening","ply","moveNumber","san","uci",
        "stage","best","bestSan","bestCp","playedCp","regretCp",
        "inaccuracy75","mistake150","blunder300","competitiveMistake150","competitiveBlunder300"]
    with path.open("w",newline="") as file:
        writer=csv.DictWriter(file,fieldnames=columns,extrasaction="ignore")
        writer.writeheader();writer.writerows(allmoves)
    print("AUDIT-SUMMARY-START")
    print(json.dumps({k:v for k,v in report.items()
        if k not in ("worstLostGames","worstLostMoves","byOpening")},indent=2))
    print("AUDIT-WORST-LOSSES")
    for g in worstgames[:10]:
        print(g["id"],g["color"],g["opening"],"blunders",
              g["blunder300"],"competitive",g["competitiveBlunder300"])
    print("AUDIT-WORST-MOVES")
    for m in worstmoves[:15]:
        print(m["gameId"],m["moveNumber"],m["san"],"best",m["bestSan"],
              "regret",m["regretCp"],"position",m["bestCp"])
    print("AUDIT-SUMMARY-END")

if __name__=="__main__":
    p=argparse.ArgumentParser()
    subs=p.add_subparsers(dest="mode",required=True)
    a=subs.add_parser("analyze")
    a.add_argument("--input",required=True);a.add_argument("--output",required=True)
    a.add_argument("--engine",default="/usr/games/stockfish")
    a.add_argument("--depth",type=int,default=11)
    a=subs.add_parser("aggregate")
    a.add_argument("--input",required=True);a.add_argument("--output",required=True)
    args=p.parse_args()
    (analyze if args.mode=="analyze" else aggregate)(args)
