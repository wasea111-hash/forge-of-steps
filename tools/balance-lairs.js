// How often a well-built hero beats each lair master. Usage: node tools/balance-lairs.js [fights] [relic]
// "relic" dresses the bot in a full eight piece set of the lair instead of plain gear.
const { loadCore } = require("./load-core");
const bot = require("./lair-bot");
const N = Number(process.argv[2] || 24);
const RELIC = process.argv[3] === "relic";
const run = loadCore();
console.log(run(`(()=>{
  ${bot(RELIC)}
  const CL = Object.keys(PLAN);
  const out=["lair".padEnd(16)+"lvl  "+CL.map(c=>c.slice(0,7).padEnd(14)).join("")];
  Object.values(LAIR_CATALOG).forEach(lair=>{
    const levels=[...new Set([lair.level,getLairRanks(lair).find(l=>l>=lair.level+15),80])].filter(Boolean);
    levels.forEach(L=>{
      const row=CL.map(c=>{let w=0,t=0;for(let i=0;i<${N};i++){const h=build(c,L,lair);const b=fight(h,lair,L);if(b.over==="hero")w++;t+=b.stats.turns;}return (Math.round(w/${N}*100)+"% t"+Math.round(t/${N})).padEnd(14);});
      out.push(lair.id.padEnd(16)+String(L).padEnd(5)+row.join(""));
    });
  });
  return out.join(String.fromCharCode(10));
})()`));
