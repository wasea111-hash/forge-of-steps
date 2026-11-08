// Dev helper for the browser console (loaded by hand): plays every learned skill of a class on the 3D stage.
// Usage: paste into the console on index.html?dev=1, then __classRun("mage", 2, ["wraith", "rune_guard"]).
window.__errs = [];
window.addEventListener("error", (e) => __errs.push("E " + e.message));
window.addEventListener("unhandledrejection", (e) => __errs.push("R " + (e.reason?.stack || e.reason)));
window.__classRun = async (classKey, regionIndex, ids, level = 30, speed = 2) => {
  COACH_TIPS.forEach((t) => { App.save.settings.tips[t.id] = true; });
  const hero = createHero({ name: "Тест", classKey, allocated: {} });
  for (let i = 1; i < level; i += 1) awardExperience(hero, getExperienceForNextLevel(hero.level));
  applyDerivedStats(hero);
  DEV_TOOLS["Навыки"][0][1](hero);
  App.hero = hero;
  App.regionIndex = regionIndex;
  restoreHero(hero);
  closeModal?.();
  clearInterval(window.__pump);
  clearInterval(window.__heal);
  App.save.settings.battleSpeed = speed;
  beginFight(ids.map((id) => makeEnemy(id, 1)), { mode: "guardian", nodeType: "guardian" });
  window.__pump = setInterval(() => window.__stage?.render?.(), 40);
  window.__heal = setInterval(() => {
    if (!App.battle) return;
    App.hero.currentHp = App.hero.maxHp = 99999;
    App.battle.foes.forEach((f) => { f.maxHp = 9999999; f.currentHp = f.maxHp; });
  }, 20);
  const list = getVisibleClassSkills(hero).filter((s) => isSkillLearned(hero, s.id));
  window.__prog = { classKey, total: list.length, done: 0, stuck: [] };
  const b = App.battle;
  for (const skill of list) {
    let w = 0;
    while ((!b.awaiting || App.fight.playing) && w < 500) { w += 1; await new Promise((r) => setTimeout(r, 50)); }
    if (w >= 500) { __prog.stuck.push("hang before " + skill.id); break; }
    hero.activeSkillSlots[0] = skill.id;
    hero.currentResource = 999;
    hero.currentMana = 9999;
    hero.statusEffects = [];
    hero.effects = [];
    Object.keys(hero.cooldowns || {}).forEach((k) => { hero.cooldowns[k] = 0; });
    if (b.cooldowns) Object.keys(b.cooldowns).forEach((k) => { b.cooldowns[k] = 0; });
    const check = canUseSkill(b, 0);
    if (!check.ok) { __prog.stuck.push(skill.id + ": " + check.reason); __prog.done += 1; continue; }
    __prog.current = skill.id;
    await performHeroAction({ type: "skill", slotIndex: 0 });
    __prog.done += 1;
    await new Promise((r) => setTimeout(r, 400));
  }
  __prog.finished = true;
};
