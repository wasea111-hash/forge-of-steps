// How hard is the game for a well-built hero: real gear, chosen talents, slotted shop passives. Usage: node tools/balance.js
const { loadCore } = require("./load-core");
const run = loadCore();
console.log(run(`(()=>{
  const PLAN = { warrior:{strength:2,endurance:1}, mage:{intellect:2,endurance:1}, archer:{agility:1,strength:1,endurance:1}, bard:{intellect:1,spirituality:1,endurance:1}, assassin:{strength:2,agility:1} };
  const PROF = { warrior:"berserk", mage:"fire", archer:"sniper", bard:"skald", assassin:"blade" };
  const build=(c,L,rarity)=>{
    const h=createHero({name:"B",classKey:c});
    for(let i=1;i<L;i++)awardExperience(h,getExperienceForNextLevel(h.level));
    const keys=Object.keys(PLAN[c]);let g=0;while(h.statPoints>0&&g++<900){for(const k of keys)addStatPoint(h,k,Math.min(PLAN[c][k],h.statPoints));}
    const prof=BRANCH_CATALOG[c].professions[PROF[c]];
    if(L>=30)chooseSubclass(h,prof.subclassId); if(L>=60)chooseProfession(h,prof.id);
    getVisibleClassSkills(h).forEach(s=>{if(getSkillStudyState(h,s)==="AVAILABLE")learnSkill(h,s.id)});
    const acts=getVisibleClassSkills(h,"active").filter(s=>isSkillLearned(h,s.id)).sort((a,b)=>b.unlockLevel-a.unlockLevel);
    h.activeSkillSlots=[0,1,2,3,4].map(i=>acts[i]?.id||null);
    Object.keys(h.equipment).forEach(slot=>{const type=slot.split("-")[0];h.equipment[slot]=generateItem({level:L,rarity,classKey:c,slotType:type,offhand:type==="weapon"?slot==="weapon-2":null});});
    autoBuild(h,{formIndex:randomInt(0,1),styleIndex:randomInt(0,2),ultIndex:randomInt(0,1),laneIndex:randomInt(0,2)});
    h.gold=1e7; SHOP_PASSIVE_CATALOG.filter(p=>canUseShopPassive(h,p)&&Number(p.minLevel||1)<=L).sort((a,b)=>b.rank-a.rank).slice(0,getShopSlotLimit(h)).forEach(p=>buyShopPassive(h,p.id));
    applyDerivedStats(h,true);h.potions={hp:3,mp:2};return h;
  };
  const out=[];
  const fight=(h,e)=>{const b=createBattle(h,e);let g=0;while(!b.over&&g++<300){const r=heroAction(b,chooseBotAction(b));if(!r.ok)heroAction(b,{type:"attack"});}return b;};
  ["warrior","mage","archer","bard","assassin"].forEach(c=>{
    [[16,"greyfang",1,"orange"],[32,"pyre_queen",1,"orange"],[52,"archivist",2,"purple"],[72,"smith",3,"purple"]].forEach(([L,boss,reg,rar])=>{
      let w=0,t=0,hp=0;const N=25;for(let i=0;i<N;i++){const h=build(c,L,rar);const b=fight(h,buildGuardianEncounter(boss));if(b.over==="hero"){w++;hp+=h.currentHp/h.maxHp;}t+=b.stats.turns;}
      out.push(c.padEnd(9)+" boss "+boss.padEnd(11)+" L"+L+" win "+Math.round(w/N*100)+"% turns "+(t/N).toFixed(1)+" hpLeft "+Math.round(hp/Math.max(1,w)*100)+"%");
    });
    [[29,"ashlands"],[49,"limit"],[65,"limit"]].forEach(([L,reg])=>{
      const row=[];["green","red"].forEach(z=>{let done=0;const N=20;for(let i=0;i<N;i++){const h=build(c,L,"purple");const exp=createExpedition(h,reg,z);h.expedition=exp;let dead=false;for(;;){if(exp.pendingBoons?.length)takeBoon(h,exp,exp.pendingBoons[0]);const en=enterNode(h,exp,Math.floor(rand()*exp.choices.length));let e=null;if(en.kind==="event"){const res=resolveEventOption(h,exp,en.event,0);if(res.battle)e=res.battle;}else e=en.enemy;if(e){const b=fight(h,e);if(b.over!=="hero"){dead=true;break;}}if(completeStep(h,exp))break;}if(!dead)done++;}row.push(z+":"+Math.round(done/N*100)+"%");});
      out.push(c.padEnd(9)+" trail L"+L+" "+row.join(" "));
    });
  });
  return out.join("\\n");
})()`));
