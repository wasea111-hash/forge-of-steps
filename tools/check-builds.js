// Checks build content: forms, styles, ultimates and talent boards. Usage: node tools/check-builds.js [class ...]
// Every option plays whole fights against a boss and a group, so a broken hook or a NaN shows up here.
const classes = process.argv.slice(2);
if (classes.length === 1) process.env.FORGE_BUILD_ONLY = classes[0];
const { loadCore } = require("./load-core");
const run = loadCore();
console.log(run(`(()=>{
  const out=[];const bad=(t)=>out.push("BAD "+t);
  const CL=${JSON.stringify(classes.length ? classes : ["warrior", "mage", "archer", "bard", "assassin"])};
  const NEW=(c,L,sub,prof)=>{const h=createHero({name:"T",classKey:c});h.freeSkills=true;for(let i=1;i<L;i++)awardExperience(h,getExperienceForNextLevel(h.level));h.subclass=sub||null;h.profession=prof||null;Object.keys(h.equipment).forEach(slot=>{const type=slot.split("-")[0];h.equipment[slot]=generateItem({level:L,rarity:"purple",classKey:c,slotType:type,offhand:type==="weapon"?slot==="weapon-2":null});});applyDerivedStats(h,true);
    const acts=getVisibleClassSkills(h,"active").filter(s=>isSkillLearned(h,s.id)).sort((a,b)=>b.unlockLevel-a.unlockLevel);h.activeSkillSlots=[0,1,2,3,4].map(i=>acts[i]?.id||null);applyDerivedStats(h,true);restoreHero(h);h.potions={hp:5,mp:5};return h;};
  const FIGHT=(h,L,pack)=>{const foes=pack?[makeEnemy("wolf",L),makeEnemy("bandit",L),makeEnemy("hunter",L)]:[makeLairBoss(h,LAIR_CATALOG.red_mile,L)];const b=createBattle(h,foes);let g=0;while(!b.over&&g++<300){b.ult=Math.max(b.ult,g%5===0?100:b.ult);const r=heroAction(b,chooseBotAction(b));if(!r.ok)heroAction(b,{type:"attack"});}
    if(!Number.isFinite(h.currentHp)||!Number.isFinite(h.currentMana)||b.foes.some(f=>!Number.isFinite(f.currentHp)))throw new Error("NaN");return b;};
  const PLAY=(label,setup,c,L,sub,prof)=>{try{[false,true].forEach(p=>{const h=NEW(c,L,sub,prof);setup(h);applyDerivedStats(h,true);restoreHero(h);FIGHT(h,L,p);});}catch(e){bad(label+": "+(e.message||e)+" "+String(e.stack||"").split(String.fromCharCode(10))[1]);}};
  const TXT=(label,t,max)=>{if(!t||t.length>max)bad(label+" text "+(t||"").length);};
  CL.forEach(c=>{
    const cat=BRANCH_CATALOG[c];const subs=Object.values(cat.subclasses),profs=Object.values(cat.professions);
    // Forms: two early class skills, a main skill of every subclass and every profession.
    const skills=Object.values(SKILL_CATALOG).filter(s=>s.classId===c&&!s.hidden&&s.category==="active");
    const withForms=skills.filter(s=>getSkillForms(s.id).length);
    const need=2+subs.length+profs.length;
    const inTree=SKILL_TREES[c]?new Set(SKILL_TREES[c].stages.flatMap(st=>st.tiers.flatMap(t=>t.options))):null;
    if(inTree)withForms.forEach(s=>{if(!inTree.has(s.id))bad(s.id+" has forms but is not in the tree");});
    else { if(withForms.length!==need)bad(c+" skills with forms "+withForms.length+" need "+need);
    if(withForms.filter(s=>!s.subclass&&!s.profession).length!==2)bad(c+" class skills with forms");
    subs.forEach(x=>{if(withForms.filter(s=>s.subclass===x.id&&!s.profession).length!==1)bad(c+" subclass forms "+x.id);});
    profs.forEach(x=>{if(withForms.filter(s=>s.profession===x.id).length!==1)bad(c+" profession forms "+x.id);}); }
    withForms.forEach(s=>{const fs=getSkillForms(s.id);if(fs.length!==2)bad(s.id+" must have 2 forms");fs.forEach(f=>{TXT(f.id,f.name,28);TXT(f.id,f.description,200);
      const prof=s.profession?cat.professions[s.profession]:null;const sub=s.subclass||prof?.subclassId||null;const L=Math.max(s.unlockLevel,prof?60:sub?30:10);
      PLAY("form "+f.id,h=>{h.skillForms={[s.id]:f.id};const i=h.activeSkillSlots.indexOf(s.id);if(i<0)h.activeSkillSlots[0]=s.id;},c,L,sub,prof?.id);});});
    // Styles.
    const st=getClassStyles(c);if(st.length!==3)bad(c+" styles "+st.length);
    st.forEach(x=>{TXT(x.id,x.name,28);TXT(x.id,x.description,220);if(!x.on&&!x.mods)bad(x.id+" does nothing");[8,30,70].forEach(L=>PLAY("style "+x.id,h=>{h.styleId=x.id;},c,L));});
    // Ultimates.
    const owners=[[c,10,null,null],...subs.map(x=>[x.id,30,x.id,null]),...profs.map(x=>[x.id,60,x.subclassId,x.id])];
    owners.forEach(([o,L,sub,prof])=>{const pair=ULT_PAIRS[o]||[];if(pair.length!==2)bad("ults of "+o+": "+pair.length);pair.forEach(id=>{const u=ULT_OPTIONS[id];TXT(id,u.name,30);TXT(id,u.description,210);if(typeof u.run!=="function")bad(id+" has no run");PLAY("ult "+id,h=>{h.ultimateId=id;},c,Math.max(L,ULTIMATE_LEVEL),sub,prof);});});
    // Boards.
    const board=TALENT_BOARDS[c]||[];const size=c==="mage"?6:5;if(board.length!==size)bad(c+" schools "+board.length+" need "+size);
    board.forEach(sc=>{TXT(sc.id,sc.name,28);TXT(sc.id,sc.description,200);const by=[1,2,3,4].map(t=>sc.slots.filter(x=>x.tier===t).length).join("/");if(by!=="4/2/3/2")bad(c+"/"+sc.id+" shape "+by);
      const keys=new Set(sc.slots.map(x=>x.key));if(keys.size!==sc.slots.length)bad(sc.id+" duplicate keys");
      sc.slots.forEach(x=>{if(!TALENTS[x.talent])bad(sc.id+"/"+x.key+" talent "+x.talent);(x.afterAny||[]).forEach(k=>{if(!keys.has(k))bad(sc.id+"/"+x.key+" link "+k);});if(x.tier>1&&!(x.afterAny||[]).length)bad(sc.id+"/"+x.key+" has no parent");
        if(x.module)Object.entries(x.module.map).forEach(([k,id])=>{if(!TALENTS[id])bad(sc.id+"/"+x.key+" module talent "+id);});});});
    const ids=board.flatMap(sc=>sc.slots.map(x=>x.talent));if(new Set(ids).size!==ids.length)bad(c+" the same talent twice on the board: "+ids.filter((x,i)=>ids.indexOf(x)!==i));
    const sample=profs.map(p=>{const h=NEW(c,80,p.subclassId,p.id);autoBuild(h);PLAY("build "+p.id,g=>{autoBuild(g);},c,80,p.subclassId,p.id);return p.id+":"+h.talents.length+"t free "+getDevPointsFree(h);}).join(" ");
    out.push(c+": forms "+withForms.length*2+" styles "+st.length+" ults "+owners.length*2+" schools "+board.length+" | "+sample);
  });
  out.push(out.some(l=>l.startsWith("BAD"))?"FAILED "+out.filter(l=>l.startsWith("BAD")).length:"ALL GOOD");
  return out.join(String.fromCharCode(10));
})()`));
