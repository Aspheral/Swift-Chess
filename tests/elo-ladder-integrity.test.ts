import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root=mkdtempSync(join(tmpdir(),"swift-elo-ladder-"));
afterAll(()=>rmSync(root,{recursive:true,force:true}));
const openingNames=[
  "Reti / ...d5","Reti / kingside fianchetto","Queen's Gambit Declined",
  "Slav structure","Queen's Gambit Accepted","London structure",
  "Four Knights","Scotch structure","Bishop's Opening","Italian structure",
];
const levels=[1900,2050,2200];

function setup(kind: "valid" | "missing" | "unresolved" | "mixedSeed") {
  const input=join(root,kind),output=join(root,kind+"-out.json");
  mkdirSync(input,{recursive:true});
  for(const elo of levels){
    for(let batch=0;batch<4;batch++){
      if(kind==="missing" && elo===2200 && batch===3)continue;
      const openingStart=(batch*3)%10;
      const openingPairs=Array.from({length:10},(_,p)=>openingNames[(openingStart+p)%10]);
      const games=openingPairs.flatMap((opening,p)=>{
        const seed=20_000+batch*1_000_003+p*7_919;
        return [
          {opening,seed,swiftColor:"White",result:"draw",reason:"stalemate",
            moves:["e2e4"],plies:1,finalFen:"8/8/8/8/8/8/8/8 w - - 0 1"},
          {opening,seed,swiftColor:"Black",result:"draw",reason:"stalemate",
            moves:["e2e4"],plies:1,finalFen:"8/8/8/8/8/8/8/8 w - - 0 1"},
        ];
      });
      if(kind==="unresolved" && elo===2050 && batch===2)
        games[5].result="unresolved";
      if(kind==="mixedSeed" && elo===2200 && batch===1)
        games[1].seed+=1;
      writeFileSync(join(input,elo+"-"+batch+".json"),JSON.stringify({
        configuration:{mode:"human",opponentElo:elo,batch,openingStart,
          openingPairs,stockfishMoveMs:100,maxPlies:500,
          swift:{profile:"adaptive-human-v15"}},games,
      }));
    }
  }
  return {input,output};
}
function run(kind: "valid" | "missing" | "unresolved" | "mixedSeed") {
  const {input,output}=setup(kind);
  return {
    run:()=>execFileSync(process.execPath,
      ["scripts/aggregate-elo-ladder.mjs",input,output],
      {cwd:process.cwd(),encoding:"utf8",stdio:"pipe"}),
    output,
  };
}

describe("multi-strength game record integrity",()=>{
  it("validates 240 complete games and recovers known 2050 score",()=>{
    const fixture=run("valid");
    fixture.run();
    const result=JSON.parse(readFileSync(fixture.output,"utf8"));
    expect(result.total.games).toBe(240);
    expect(result.fittedEloEquivalent).toBe(2050);
    expect(result.pairedBootstrap95).toEqual([2050,2050]);
    expect(result.openingFamilyBootstrap95).toEqual([2050,2050]);
    expect(result.byOpponent["1900"].games).toBe(80);
    expect(result.byOpponent["2050"].games).toBe(80);
    expect(result.byOpponent["2200"].games).toBe(80);
  });
  it("refuses to rate incomplete opponent ladders",()=>{
    expect(run("missing").run).toThrow(/Expected exactly 12 ladder batches/);
  });
  it("rejects unresolved game outcomes rather than counting them as draws",()=>{
    expect(run("unresolved").run).toThrow(/Invalid finished game result/);
  });
  it("rejects unequal seeds within color-reversed pairs",()=>{
    expect(run("mixedSeed").run).toThrow(/mismatched opening seeds/);
  });
});
