// Shared by the lair tools: code that runs inside the game core and builds a well dressed bot hero.
module.exports = (relic) => `
  const PLAN = { warrior:{strength:2,endurance:1}, mage:{intellect:2,endurance:1}, archer:{agility:1,strength:1,endurance:1}, bard:{intellect:1,spirituality:1,endurance:1}, assassin:{strength:2,agility:1} };
  const PROF = { warrior:"berserk", mage:"fire", archer:"sniper", bard:"skald", assassin:"blade" };
  const build=(c,L,lair)=>{
    const h=createHero({name:"B",classKey:c});
    for(let i=1;i<L;i++)awardExperience(h,getExperienceForNextLevel(h.level));
    const keys=Object.keys(PLAN[c]);let g=0;while(h.statPoints>0&&g++<900){for(const k of keys)addStatPoint(h,k,Math.min(PLAN[c][k],h.statPoints));}
    const prof=BRANCH_CATALOG[c].professions[PROF[c]];
    if(L>=30)chooseSubclass(h,prof.subclassId); if(L>=60)chooseProfession(h,prof.id);
    let more=true;while(more){more=false;getVisibleClassSkills(h).forEach(s=>{if(h.skillPoints>0&&getSkillStudyState(h,s)==="AVAILABLE"){learnSkill(h,s.id);more=true;}});}
    const acts=getVisibleClassSkills(h,"active").filter(s=>isSkillLearned(h,s.id)).sort((a,b)=>b.unlockLevel-a.unlockLevel);
    h.activeSkillSlots=[0,1,2,3,4].map(i=>acts[i]?.id||null);
    const rarity=L<18?"orange":"purple";
    Object.keys(h.equipment).forEach(slot=>{const type=slot.split("-")[0];h.equipment[slot]=generateItem({level:L,rarity,classKey:c,slotType:type,offhand:type==="weapon"?slot==="weapon-2":null});});
    if(${relic}){const fit=lair.sets.find(id=>SET_CATALOG[id].classes.includes(c));const set=fit||Object.values(SET_CATALOG).find(s=>s.classes.includes(c)).id;["weapon-1","head","chest","legs","boots","ring-1","bracelet-1","necklace"].forEach(slot=>{h.equipment[slot]=generateRelic(h,set,L,slot.split("-")[0]);});}
    autoBuild(h,{formIndex:randomInt(0,1),styleIndex:randomInt(0,2),ultIndex:randomInt(0,1),laneIndex:randomInt(0,2)});
    h.gold=1e7; SHOP_PASSIVE_CATALOG.filter(p=>canUseShopPassive(h,p)&&Number(p.minLevel||1)<=L).sort((a,b)=>b.rank-a.rank).slice(0,getShopSlotLimit(h)).forEach(p=>buyShopPassive(h,p.id));
    applyDerivedStats(h,true);h.potions={hp:POTION_LIMIT,mp:POTION_LIMIT};return h;
  };
  const fight=(h,lair,L)=>{const b=createBattle(h,[makeLairBoss(h,lair,L)]);let g=0;while(!b.over&&g++<500){const r=heroAction(b,chooseBotAction(b));if(!r.ok)heroAction(b,{type:"attack"});}return b;};
`;
