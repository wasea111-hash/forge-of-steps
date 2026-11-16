// Late-game balance: single fights at full health, the way a player feels them.
// Usage: node tools/balance-late.js [N=200] [filter] [trail]   (trail: whole orange/purple/red trails instead of single fights)
// Rows: class/build × (solo | Tessa front) × (ruins red fight | archivist). Prints win %, HP lost in wins, ally HP lost, enemy actions dodged.
const { loadCore } = require("./load-core");
const run = loadCore();
const N = Number(process.argv[2] || 200);
const filter = process.argv[3] || "";
console.log(run(`(()=>{
  const PLAN = { warrior:{strength:2,endurance:1}, mage:{intellect:2,endurance:1}, archer:{agility:1,strength:1,endurance:1}, bard:{intellect:1,spirituality:1,endurance:1}, assassin:{strength:2,agility:1} };
  const PROF = { warrior:"berserk", mage:"fire", archer:"ranger", bard:"skald", assassin:"blade" };
  const SETS = { archer:"hunter_camp" };
  // gear: [item level, rarity, set pieces]
  const build=(c,L,gear)=>{
    const h=createHero({name:"B",classKey:c});
    for(let i=1;i<L;i++)awardExperience(h,getExperienceForNextLevel(h.level));
    const keys=Object.keys(PLAN[c]);let g=0;while(h.statPoints>0&&g++<900){for(const k of keys)addStatPoint(h,k,Math.min(PLAN[c][k],h.statPoints));}
    const prof=BRANCH_CATALOG[c].professions[PROF[c]];
    if(L>=30)chooseSubclass(h,prof.subclassId); if(L>=60)chooseProfession(h,prof.id);
    getVisibleClassSkills(h).forEach(s=>{if(getSkillStudyState(h,s)==="AVAILABLE")learnSkill(h,s.id)});
    const acts=getVisibleClassSkills(h,"active").filter(s=>isSkillLearned(h,s.id)).sort((a,b)=>b.unlockLevel-a.unlockLevel);
    h.activeSkillSlots=[0,1,2,3,4].map(i=>acts[i]?.id||null);
    let setLeft=gear[2]||0;
    Object.keys(h.equipment).forEach(slot=>{const type=slot.split("-")[0];const setId=setLeft>0&&SETS[c]?(setLeft--,SETS[c]):null;h.equipment[slot]=generateItem({level:gear[0],rarity:gear[1],classKey:c,slotType:type,offhand:type==="weapon"?slot==="weapon-2":null,setId});});
    autoSpendTalents(h, PROF[c]);
    h.gold=1e7; SHOP_PASSIVE_CATALOG.filter(p=>canUseShopPassive(h,p)&&Number(p.minLevel||1)<=L).sort((a,b)=>b.rank-a.rank).slice(0,getShopSlotLimit(h)).forEach(p=>buyShopPassive(h,p.id));
    applyDerivedStats(h,true);h.potions={hp:0,mp:0};return h;
  };
  const redFight=(h,reg,zone)=>{const exp=createExpedition(h,reg,zone);h.expedition=exp;for(let k=0;k<30;k++){const node=exp.choices.find(n=>n.type==="fight"||n.type==="elite")||exp.choices[0];const idx=exp.choices.indexOf(node);const en=enterNode(h,exp,idx);if(en.enemy){h.expedition=null;return en.enemy;}completeStep(h,exp);}return null;};
  const fight=(h,e,ally)=>{
    if(ally)ally.control="auto";
    const opt=ally?{ally:{unit:makeAllyUnit(h,ally),companion:ally,front:true}}:{};
    const b=createBattle(h,e,opt);let g=0;
    while(!b.over&&g++<400){
      if(b.awaitingActor==="ally")break;
      const r=heroAction(b,chooseBotAction(b));if(!r.ok)heroAction(b,{type:"attack"});
    }
    return b;
  };
  const rows=[];
  const GUARD={thicket:"greyfang",ashlands:"pyre_queen",ruins:"archivist",limit:"smith"};
  const CASES=[
    ["Эш archer L49 red30 set5", "archer",49,[30,"red",5],"ruins"],
    ["archer L49 purple49",      "archer",49,[49,"purple",0],"ruins"],
    ["warrior L49 purple49",     "warrior",49,[49,"purple",0],"ruins"],
    ["mage L49 purple49",        "mage",49,[49,"purple",0],"ruins"],
    ["bard L49 purple49",        "bard",49,[49,"purple",0],"ruins"],
    ["assassin L49 purple49",    "assassin",49,[49,"purple",0],"ruins"],
    ["archer L38 purple38",      "archer",38,[38,"purple",0],"ruins"],
    ["warrior L38 purple38",     "warrior",38,[38,"purple",0],"ruins"],
    ["archer L22 purple22",      "archer",22,[22,"purple",0],"ashlands"],
    ["warrior L22 purple22",     "warrior",22,[22,"purple",0],"ashlands"],
    ["mage L22 purple22",        "mage",22,[22,"purple",0],"ashlands"],
    ["warrior L62 purple62",     "warrior",62,[62,"purple",0],"limit"],
    ["archer L62 purple62",      "archer",62,[62,"purple",0],"limit"],
  ].filter(r=>r[0].includes(${JSON.stringify(filter)}));
  // Whole trails (mode "trail"): wounds carry over, short rests, 3 potions, the companion's health carries too.
  const trail=(h,reg,zone,ally)=>{const exp=createExpedition(h,reg,zone);h.expedition=exp;h.potions={hp:3,mp:2};let fights=0;
    for(let s=0;s<60;s++){if(exp.pendingBoons?.length)takeBoon(h,exp,exp.pendingBoons[0]);const en=enterNode(h,exp,Math.floor(rand()*exp.choices.length));let e=null;
      if(en.kind==="event"){const res=resolveEventOption(h,exp,en.event,0);if(res.battle)e=res.battle;}else e=en.enemy;
      if(e){fights++;const b=fight(h,e,ally&&getActiveCompanion(h));if(ally)settleCompanionBattle(h,b);if(b.over!=="hero"){h.expedition=null;return {done:false,fights};}}
      if(completeStep(h,exp)){h.expedition=null;return {done:true,fights};}}
    return {done:false,fights};};
  if(${JSON.stringify(process.argv[4] || "")}==="trail"){
    CASES.forEach(([label,c,L,gear,reg])=>{[false,true].forEach(withAlly=>{["orange","purple","red"].forEach(zone=>{
      let d=0,f=0;for(let i=0;i<${N};i++){const h=build(c,L,gear);let ally=null;if(withAlly){ally=recruitCompanion(h,"tessa");ally.rank=3;ally.control="auto";}const r=trail(h,reg,zone,ally);if(r.done)d++;f+=r.fights;}
      rows.push((label+(withAlly?" +Tessa":"")).padEnd(34)+" trail "+zone.padEnd(7)+" done "+String(Math.round(d/${N}*100)).padStart(3)+"%  fights "+(f/${N}).toFixed(1));});});});
    return rows.join("\\n");
  }
  CASES.forEach(([label,c,L,gear,reg])=>{
    [false,true].forEach(withAlly=>{
      [["red"],[GUARD[reg]]].forEach(([what])=>{
        let w=0,lost=0,allyLost=0,acts=0;
        for(let i=0;i<${N};i++){
          const h=build(c,L,gear);
          let ally=null;if(withAlly){ally=recruitCompanion(h,"tessa");ally.rank=3;ally.control="auto";}
          const e=what==="red"?redFight(h,reg,"red"):buildGuardianEncounter(what);
          const b=fight(h,e,ally);
          if(b.over==="hero"){w++;lost+=1-h.currentHp/h.maxHp;if(b.ally)allyLost+=1-b.ally.currentHp/b.ally.maxHp;}
          acts+=b.stats.turns;
        }
        rows.push((label+(withAlly?" +Tessa":"")).padEnd(34)+" "+what.padEnd(10)+" win "+String(Math.round(w/${N}*100)).padStart(3)+"%  hpLost "+String(Math.round(lost/Math.max(1,w)*100)).padStart(3)+"%"+(withAlly?"  allyLost "+Math.round(allyLost/Math.max(1,w)*100)+"%":"")+"  turns "+(acts/${N}).toFixed(1));
      });
    });
  });
  const h=build("archer",49,[30,"red",5]);
  rows.push("Эш-like stats: hp "+h.maxHp+" crit "+h.critChance.toFixed(1)+" dodge "+h.dodgeChance.toFixed(1)+" speed "+h.attackSpeed.toFixed(1)+" eff "+getSpeed(h).toFixed(1));
  return rows.join("\\n");
})()`));
