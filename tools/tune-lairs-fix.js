// Second pass over the fitted table: measures each cell again and nudges the blows towards the wanted win rate.
// Usage: node tools/tune-lairs-fix.js <class> <out.json> [rounds] [fights]. Merge with tools/tune-lairs-merge.js.
const fs = require("fs");
const { loadCore } = require("./load-core");
const bot = require("./lair-bot");
const CLASS = process.argv[2];
const OUT = process.argv[3];
const ROUNDS = Number(process.argv[4] || 4);
const N = Number(process.argv[5] || 50);
const run = loadCore();
fs.writeFileSync(OUT, run(`(()=>{
  ${bot(false)}
  const c=${JSON.stringify(CLASS)};
  const result={};
  Object.values(LAIR_CATALOG).forEach(lair=>{
    const table=LAIR_TUNE[lair.master][c];
    Object.keys(table).forEach(L=>{
      const level=Number(L);
      for(let k=0;k<${ROUNDS};k++){
        let w=0;
        for(let i=0;i<${N};i++){const h=build(c,level,lair);if(fight(h,lair,level).over==="hero")w++;}
        const win=w/${N};
        if(win>=0.32&&win<=0.48)break;
        table[L][1]=Number((table[L][1]*Math.max(0.6,Math.min(1.7,1+(win-0.4)*1.6))).toFixed(3));
      }
    });
    result[lair.master]=table;
  });
  return JSON.stringify(result);
})()`));
