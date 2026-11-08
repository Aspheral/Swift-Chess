import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expected, fitElo, openingFamilyBootstrap, pairedBootstrap, score } from "./elo-ladder-math.mjs";

const INPUT = process.argv[2] ?? "calibration-downloads";
const OUTPUT = process.argv[3] ?? "calibration-results/swift-elo-ladder-summary.json";
const LEVELS = [1900, 2050, 2200], BATCHES = 4, PAIRS_PER_BATCH = 10;
const GAMES_PER_BATCH = 2 * PAIRS_PER_BATCH, EXPECTED_FILES = LEVELS.length * BATCHES;
const OPENINGS = [
  "Reti / ...d5", "Reti / kingside fianchetto",
  "Queen's Gambit Declined", "Slav structure", "Queen's Gambit Accepted",
  "London structure", "Four Knights", "Scotch structure",
  "Bishop's Opening", "Italian structure",
];
const assert = (truth, explanation) => { if (!truth) throw new Error(explanation); };
const walk = (dir) => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path)
    : path.endsWith(".json") ? [path] : [];
});
const count = (games) => {
  const wins = games.filter(g=>g.result==="win").length;
  const losses = games.filter(g=>g.result==="loss").length;
  const draws = games.filter(g=>g.result==="draw").length;
  return { games:games.length, wins, losses, draws, points:wins+draws/2,
    scoreRate:games.length ? (wins+draws/2)/games.length : null };
};

const paths = walk(INPUT);
assert(paths.length === EXPECTED_FILES,
  "Expected exactly " + EXPECTED_FILES + " ladder batches; found " + paths.length);
const reports = new Map();
for (const path of paths) {
  const item=JSON.parse(readFileSync(path,"utf8")), c=item.configuration ?? {};
  assert(c.mode === "human", path + ": must test human Swift");
  assert(LEVELS.includes(c.opponentElo), path + ": unknown opponent strength");
  assert(Number.isInteger(c.batch) && c.batch>=0 && c.batch<BATCHES,
    path + ": invalid batch ID");
  assert(c.stockfishMoveMs === 100 && c.maxPlies >= 360,
    path + ": mismatched time/move safety protocols");
  assert(c.swift?.profile === "adaptive-human-v15", path + ": different Swift profile");
  assert(c.openingStart === (c.batch * 3) % OPENINGS.length,
    path + ": wrong opening start");
  assert(JSON.stringify(c.openingPairs) === JSON.stringify(Array.from(
      {length:PAIRS_PER_BATCH},
      (_,i)=>OPENINGS[(c.openingStart+i)%OPENINGS.length])),
    path+": opening order does not match fixed experiment");
  assert(Array.isArray(item.games) && item.games.length === GAMES_PER_BATCH,
    path+": incorrect game total");
  const key=c.opponentElo+":"+c.batch;
  assert(!reports.has(key), path+": duplicate level/batch");
  for(let i=0;i<item.games.length;i+=2){
    const w=item.games[i], b=item.games[i+1];
    assert(w.swiftColor==="White" && b.swiftColor==="Black",
      path+": unbalanced pair "+(i/2));
    assert(w.opening===b.opening && w.opening===c.openingPairs[i/2],
      path+": incorrect paired opening");
    assert(w.seed===b.seed && Number.isFinite(w.seed),
      path+": mismatched opening seeds");
    for (const g of [w,b]) {
      score(g.result); // unresolved outcomes never count as draws
      assert(typeof g.reason === "string" && g.reason!=="ongoing",
        path+": unfinished result");
      assert(Array.isArray(g.moves) && g.moves.length===g.plies,
        path+": missing move history");
      assert(typeof g.finalFen==="string" && g.finalFen.split(" ").length===6,
        path+": invalid final position");
    }
  }
  reports.set(key,item);
}
for (const level of LEVELS) for(let batch=0;batch<BATCHES;batch++)
  assert(reports.has(level+":"+batch),"Missing batch "+batch+" for rating "+level);

const blocks=[], gameRows=[], seenSeeds=new Set();
for(let batch=0;batch<BATCHES;batch++){
  for(let pair=0;pair<PAIRS_PER_BATCH;pair++){
    const paired=[];
    const initial=reports.get(LEVELS[0]+":"+batch).games[2*pair];
    const opening=initial.opening, seed=initial.seed;
    const identity=batch+":"+pair;
    assert(!seenSeeds.has(seed),"Duplicate opening-pair seed "+seed);
    seenSeeds.add(seed);
    for(const opponentElo of LEVELS){
      const data=reports.get(opponentElo+":"+batch).games.slice(2*pair,2*pair+2);
      assert(data[0].opening===opening && data[0].seed===seed,
        "Mismatch in opening and seed across opponent levels for pair "+identity);
      for(const g of data){
        const row={ ...g, opponentElo, batch, pair };
        gameRows.push(row);
        paired.push(row);
      }
    }
    blocks.push({batch,pair,opening,seed,games:paired});
  }
}
assert(gameRows.length===EXPECTED_FILES*GAMES_PER_BATCH,"Wrong total game count");
const rating=fitElo(gameRows);
const pairedCI=pairedBootstrap(blocks,2000,20502050);
const familyCI=openingFamilyBootstrap(blocks,2000,75002050);
const byOpponent=Object.fromEntries(LEVELS.map(level=>{
  const group=gameRows.filter(g=>g.opponentElo===level);
  const stats=count(group);
  const p=stats.scoreRate;
  return [level,{
    ...stats,white:count(group.filter(g=>g.swiftColor==="White")),
    black:count(group.filter(g=>g.swiftColor==="Black")),
    descriptivePerformanceElo:p>0&&p<1
      ? Math.round(level+400*Math.log10(p/(1-p))) : null,
    expectedRateAtFittedRating:expected(rating,level),
  }];
}));
const total=count(gameRows);
const report={
  benchmark:"Stockfish UCI_Elo multi-level internal strength calibration",
  methods:{
    independentOpponentSettings:LEVELS,
    fixedStockfishMoveMs:100,
    swiftProfile:"adaptive-human-v15",
    openingFamilyCount:OPENINGS.length,
    batchesPerLevel:BATCHES,
    pairedOpeningsPerLevel:BATCHES*PAIRS_PER_BATCH,
    pairedGamesPerLevel:BATCHES*PAIRS_PER_BATCH*2,
    fit:"Common fixed 400-Elo logistic score expectation across all three UCI_Elo settings (score=win+0.5*draw)",
    interval:"Percentile 95% opening-pair-block bootstrap, 2000 seeded resamples; resamples the same opening across opponent settings together",
    sensitivity:"Separate 95% cluster bootstrap at ten repeated opening families, 2000 seeded resamples; potentially wider, not a formal human-rating interval",
    limitations:"Stockfish UCI_Elo values are internal relative-strength anchors, not verified Elo against real rated humans. Fixed 100ms/move and repeated openings limit external validity. Descriptive confidence intervals do not include uncertainty in the Stockfish Elo scale.",
    frozenRevision:"GitHub run head SHA supplies immutable engine revision; all batch artifacts must come from the same run",
  },
  total, byOpponent,
  fittedEloEquivalent:Math.round(rating),
  pairedBootstrap95:pairedCI.map(Math.round),
  openingFamilyBootstrap95:familyCI?.map(Math.round) ?? null,
  meetsNominal2050:rating>=2050,
  paired95LowerAbove2050:pairedCI[0]>2050,
  family95LowerAbove2050:familyCI!==null&&familyCI[0]>2050,
  interpretiveStatus:pairedCI[0]>2050&&familyCI!==null&&familyCI[0]>2050
    ? "Internal Stockfish-calibrated results support >=2050 under tested protocol, not official website Elo"
    : "Insufficient evidence to confirm Swift >=2050 at the 95% interval; no official chess-site rating",
};
mkdirSync(dirname(OUTPUT),{recursive:true});
writeFileSync(OUTPUT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
// No assertion on rating itself. Passing experimental CI means VALID DATA;
// a below-target result is legitimate evidence, not a broken test.
