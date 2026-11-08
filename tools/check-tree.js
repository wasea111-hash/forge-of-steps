// Checks a class's skill tree: shape, texts, unique animations, real fights for every skill and how often the bot uses it.
// Usage: node tools/check-tree.js <class>
const cls = process.argv[2];
if (!cls) throw new Error("class?");
process.env.FORGE_BUILD_ONLY = cls;
const { loadCore } = require("./load-core");
const run = loadCore();
console.log(run(`(()=>{
  const out=[];const bad=(t)=>out.push("BAD "+t);const NL=String.fromCharCode(10);
  const c=${JSON.stringify(cls)};
  const tree=SKILL_TREES[c];
  if(!tree)return "BAD no tree";
  const cat=BRANCH_CATALOG[c];
  if((tree.lanes||[]).length!==3)bad("lanes "+(tree.lanes||[]).length);
  const main=tree.stages.find(s=>s.stage==="class");
  if(!main||main.tiers.map(t=>t.level).join()!=="1,4,8,12,16,22")bad("class tiers must be 1,4,8,12,16,22");
  Object.keys(cat.subclasses).forEach(id=>{const s=tree.stages.find(x=>x.owner===id);if(!s||s.tiers.map(t=>t.level).join()!=="30,38,46")bad("subclass tiers "+id);});
  Object.keys(cat.professions).forEach(id=>{const s=tree.stages.find(x=>x.owner===id);if(!s||s.tiers.map(t=>t.level).join()!=="60,68,76")bad("profession tiers "+id);});
  main?.tiers.forEach(t=>{if(t.options.length!==3)bad("class tier "+t.level+" needs 3 options");});
  main?.tiers[0].options.forEach(id=>{if(!getSkillDefinition(id)?.attackType)bad("level 1 option must attack: "+id);});
  if(main&&main.tiers[5].needsLane!==2)bad("the last class tier needs needsLane: 2");
  const all=tree.stages.flatMap(s=>s.tiers.flatMap(t=>t.options));
  if(new Set(all).size!==all.length)bad("a skill twice: "+all.filter((x,i)=>all.indexOf(x)!==i));
  const skills=all.map(getSkillDefinition);
  const active=skills.filter(s=>s.category==="active");
  if(active.length/skills.length<0.6)bad("too few actives "+active.length+"/"+skills.length);
  const sign={};
  skills.forEach(s=>{
    if(!s.name||s.name.length>26)bad(s.id+" name "+s.name);
    if(!s.description||s.description.length>170)bad(s.id+" description "+(s.description||"").length);
    if(/\\bты\\s+(прош[её]л|устал|готов|сделал|нашёл|видел|должен|должна)\\b/i.test(s.description))bad(s.id+" gender");
    if(s.category!=="active")return;
    const a=s.anim;if(!a){bad(s.id+" has no anim");return;}
    if(!["melee","ranged","self"].includes(a.range))bad(s.id+" anim range");
    if(!a.pose||!a.pose.pose)bad(s.id+" anim pose");
    const POSES=["idle","strike","dash","cast","hit","windup","slam","thrust","guard","air","proud"];
    ["before","pose","then2"].forEach(k=>{if(a.pose?.[k]&&!POSES.includes(a.pose[k]))bad(s.id+" pose "+a.pose[k]);});
    const SHAPES=["slash","cross","ring","pillar","spikes","lightning","flames","sigil","whirl","void","rain","smoke","burst","glow","flash","notes","quake","chain","fan","shards","afterimages","wave"];
    const shapes=[...(a.anticipate||[]),...(a.release||[]),...(Array.isArray(a.impact)?a.impact:[])];
    shapes.forEach(p=>{if(!SHAPES.includes(p.fx))bad(s.id+" shape "+p.fx);});
    if(a.impact&&!Array.isArray(a.impact))bad(s.id+" anim.impact must be a list, the frame is anim.frame");
    if(!shapes.length)bad(s.id+" no shapes");
    const key=[a.range,a.move||a.hop||"",a.pose?.before,a.pose?.pose,a.pose?.then2||"",a.shot||"",shapes.map(p=>p.fx+(p.at||"")).sort().join("+")].join("|");
    if(sign[key])bad("same animation: "+s.id+" = "+sign[key]);sign[key]=s.id;
  });
  // Fights: every skill alone in the first slot beside a lane's build, against a boss and a group.
  const NEW=(L,sub,prof,lane)=>{const h=createHero({name:"T",classKey:c});for(let i=1;i<L;i++)awardExperience(h,getExperienceForNextLevel(h.level));h.subclass=sub||null;h.profession=prof||null;Object.keys(h.equipment).forEach(slot=>{const type=slot.split("-")[0];h.equipment[slot]=generateItem({level:L,rarity:"purple",classKey:c,slotType:type,offhand:type==="weapon"?slot==="weapon-2":null});});autoBuild(h,{laneIndex:lane});applyDerivedStats(h,true);restoreHero(h);h.potions={hp:5,mp:5};return h;};
  const uses={};const casts={};
  const FIGHT=(h,L,pack)=>{const foes=pack?[makeEnemy("wolf",L),makeEnemy("bandit",L),makeEnemy("hunter",L)]:[makeLairBoss(h,LAIR_CATALOG.red_mile,L)];const b=createBattle(h,foes);let g=0;while(!b.over&&g++<300){const act=chooseBotAction(b);if(act.type==="skill"){const sk=getActiveSkillFromSlot(h,act.slotIndex);uses[sk.id]=(uses[sk.id]||0)+1;}const r=heroAction(b,act);if(!r.ok)heroAction(b,{type:"attack"});}
    if(!Number.isFinite(h.currentHp)||!Number.isFinite(h.currentMana)||b.foes.some(f=>!Number.isFinite(f.currentHp)))throw new Error("NaN");return b;};
  tree.stages.forEach(stage=>{
    const prof=stage.stage==="profession"?stage.owner:null;
    const sub=stage.stage==="subclass"?stage.owner:prof?cat.professions[prof].subclassId:null;
    stage.tiers.forEach(tier=>{tier.options.forEach(id=>{
      const skill=getSkillDefinition(id);
      [false,true].forEach(pack=>{for(let i=0;i<4;i++){
        const L=Math.max(tier.level,prof?76:sub?46:22);
        try{const h=NEW(L,sub,prof,i%3);
          h.skillPicks={...h.skillPicks,[treeTierKey(stage,tier)]:id};
          syncKnownSkills(h);
          if(skill.category==="active"&&!h.activeSkillSlots.includes(id))h.activeSkillSlots[0]=id;
          applyDerivedStats(h,true);restoreHero(h);FIGHT(h,L,pack);
          casts[id]=(casts[id]||0)+1;
        }catch(e){bad("fight "+id+": "+(e.message||e)+" "+String(e.stack||"").split(NL)[1]);break;}
      }});
    });});
  });
  // Paths: lane 0,1,2 reach every stage and fill the panel.
  Object.values(cat.professions).forEach(p=>{[0,1,2].forEach(l=>{const h=NEW(80,p.subclassId,p.id,l);const acts=getPickedTreeSkills(h).filter(s=>s.category==="active");if(acts.filter(s=>s.attackType).length<2)bad("path "+p.id+" lane "+l+": fewer than 2 attacks");if(getPendingTreePick(h))bad("path "+p.id+" has an open tier");});});
  const zero=active.filter(s=>!uses[s.id]).map(s=>s.name);
  out.push(c+": skills "+skills.length+" active "+active.length+" animations "+Object.keys(sign).length);
  out.push("bot usage: "+active.map(s=>s.name+" "+Math.round((uses[s.id]||0)/Math.max(1,casts[s.id]||1)*10)/10).join(", "));
  if(zero.length)bad("never used by the bot: "+zero.join(", "));
  out.push(out.some(l=>l.startsWith("BAD"))?"FAILED "+out.filter(l=>l.startsWith("BAD")).length:"ALL GOOD");
  return out.join(NL);
})()`));
