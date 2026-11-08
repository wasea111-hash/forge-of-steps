// Fits the life and blows of every lair master for one class. Usage: node tools/tune-lairs.js <class> <out.json> [targetWin] [turns]
// For each sampled rank it first finds the life that gives a long fight, then the blows that give the wanted win rate.
// tools/tune-lairs-merge.js collects the results of all classes into js/core/data.lairtune.js.
const fs = require("fs");
const { loadCore } = require("./load-core");
const bot = require("./lair-bot");
const CLASS = process.argv[2];
const OUT = process.argv[3];
const TARGET = Number(process.argv[4] || 0.42);
const TURNS = Number(process.argv[5] || 28);
const run = loadCore();
fs.writeFileSync(OUT, run(`(()=>{
  ${bot(false)}
  const c=${JSON.stringify(CLASS)};
  const result={};
  const test=(lair,L,hp,dmg,n)=>{
    LAIR_TUNE[lair.master]=LAIR_TUNE[lair.master]||{};
    LAIR_TUNE[lair.master][c]={[L]:[hp,dmg]};
    let w=0,t=0,tn=0;
    for(let i=0;i<n;i++){const h=build(c,L,lair);const b=fight(h,lair,L);if(b.over==="hero"){w++;t+=b.stats.turns;tn++;}}
    return {win:w/n,turns:tn?t/tn:0};
  };
  Object.values(LAIR_CATALOG).forEach(lair=>{
    const ranks=getLairRanks(lair);
    const levels=ranks.filter((_,i)=>i%2===0||i===ranks.length-1);
    const table={};
    levels.forEach(L=>{
      let hp=12;
      for(let k=0;k<4;k++){const r=test(lair,L,hp,0.06,8);if(!r.turns)break;hp*=Math.max(0.4,Math.min(2.5,${TURNS}/r.turns));}
      let lo=0.1,hi=14;
      for(let k=0;k<6;k++){const dmg=Math.sqrt(lo*hi);const r=test(lair,L,hp,dmg,24);if(r.win>${TARGET})lo=dmg;else hi=dmg;}
      table[L]=[Number(hp.toFixed(2)),Number(Math.sqrt(lo*hi).toFixed(3))];
    });
    result[lair.master]=table;
  });
  return JSON.stringify(result);
})()`));
