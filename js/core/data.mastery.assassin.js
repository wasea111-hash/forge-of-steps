// Mastery of the assassin skills: at level V each skill offers three upgrades of its own (designed with Codex).
(() => {
  const direct = c => !c.proc && !c.noEcho;
  const hidden = b => Boolean(b.mech?.core_assassin?.hidden);
  const combo = b => Number(b.mech?.shade?.value || 0);
  const ticks = e => Number(e?.meta?.elapsedTicks || 0);
  const hp = u => u.currentHp / Math.max(1, u.maxHp);

  const energy = (b, n) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + n);
    if (b.hero.currentMana > before) {
      emit(b, "mana", {
        target: "hero",
        amount: b.hero.currentMana - before
      });
    }
  };

  const at = (b, u, fn) => {
    const old = b.enemy;
    const focus = b.focus;
    b.enemy = u;
    b.focus = focus ?? old.slot;
    try {
      return fn();
    } finally {
      b.enemy = old;
      b.focus = focus;
    }
  };

  const put = (b, u, id, duration, value) => at(b, u, () => {
    const old = getEffect(u, id);
    const saved = old && {
      value: old.value,
      duration: old.duration,
      ticks: ticks(old)
    };
    const e = fx(b, id, duration, value, { self: u === b.hero });

    // Добавочная доза не ослабляет прежний токсин и не сбрасывает его зрелость.
    if (e && saved && (id === "poison" || id === "bleed")) {
      e.value = Math.max(e.value, saved.value);
      e.duration = Math.max(e.duration, saved.duration);
      e.meta.elapsedTicks = Math.max(ticks(e), saved.ticks);
    }
    return e;
  });

  // Усиливает собственное значение эффекта без накопления бонуса при обновлениях.
  const improve = (b, u, id, base, bonus, cap = Infinity) => {
    const e = getEffect(u, id);
    if (!e) return;
    const resist = u === b.hero ? 1 : getEnemyResist(u, id);
    const value = base * (1 + tm(b.hero, "val:" + id)) * resist;
    e.value = Math.max(e.value, Math.min(cap, value + bonus * resist));
  };

  const extend = (u, id, n = 1, cap = 8) => {
    const e = getEffect(u, id);
    if (e && Number.isFinite(e.duration)) {
      e.duration = Math.max(e.duration, Math.min(cap, e.duration + n));
    }
  };

  // Отдельная запись каждой цели на применение, включая серию и повтор мутации.
  const record = (b, s) => {
    if (!s.cast) {
      s.cast = {
        hidden: hidden(b),
        combo: combo(b),
        targets: new Map()
      };
    }
    const a = s.cast;
    if (!a.targets.has(b.enemy)) {
      const e = getEffect(b.enemy, "poison");
      a.targets.set(b.enemy, {
        unit: b.enemy,
        hp: hp(b.enemy),
        dose: Number(e?.value || 0),
        ticks: ticks(e),
        poison: e,
        attempts: 0,
        hits: 0,
        damage: 0,
        crit: false
      });
    }
    return a.targets.get(b.enemy);
  };

  const watch = (b, s, c) => {
    if (!direct(c)) return null;
    const t = record(b, s);
    t.attempts += 1;
    return t;
  };

  const land = (b, s, c) => {
    if (!direct(c)) return;
    const t = record(b, s);
    t.hits += 1;
    t.damage += Math.max(0, c.hpDamage);
    t.crit ||= Boolean(c.crit);
  };

  const close = s => {
    const a = s.cast;
    s.cast = null;
    return a;
  };

  const landed = a =>
    a ? [...a.targets.values()].filter(t => t.hits > 0) : [];

  const alive = a =>
    landed(a).filter(t => t.unit.currentHp > 0);

  const hasEffectSpec = (skill, id) =>
    (skill.appliedEffects || []).some(e => e.id === id && e.target !== "self");

  // Добавочный урон не вызывает критов, повторов теней и набора приёмов.
  const chip = (b, u, amount, label, element = "steel") => {
    if (!u || u.currentHp <= 0 || amount <= 0) return;
    at(b, u, () => {
      const r = dealDamage(b, u, amount, {
        ignoreShield: element === "poison"
      });
      emit(b, "hit", {
        target: "enemy",
        amount: r.hpDamage,
        absorbed: r.absorbed,
        crit: false,
        kind: "physical",
        element,
        label
      });
    });
  };

  const other = (b, u) => livingFoes(b).find(f => f !== u);

  // Теневой выпад: длительность следа, пробой из тени или энергия за убийство.
  defineSkillMastery("assassin-shadow-lunge", [
    {
      id: "long_trace",
      name: "Долгий след",
      description: "После попадания яд или метка от выпада держится на 1 ход дольше, до 8 ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-lunge") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-lunge") return;
          alive(close(s)).forEach(t => {
            ["poison", "mark"].forEach(id => {
              if (hasEffectSpec(c.skill, id)) extend(t.unit, id);
            });
          });
        }
      }
    },
    {
      id: "shadow_seam",
      name: "Шов тени",
      description: "При выпаде из тени ты игнорируешь дополнительно 20% защиты цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-lunge") return;
          if (direct(c) && hidden(b)) c.pierce += 0.2;
        }
      }
    },
    {
      id: "paid_trail",
      name: "Оплаченный след",
      description: "Если выпад убивает хотя бы одну задетую цель, ты возвращаешь 10 энергии за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-lunge") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-lunge") return;
          if (landed(close(s)).some(t => t.unit.currentHp <= 0)) {
            energy(b, 10);
          }
        }
      }
    }
  ]);

  // Подхват кинжала: открытый темп, возврат за крит или защита после подхвата.
  defineSkillMastery("assassin-knife-catch", [
    {
      id: "quick_catch",
      name: "Лёгкий подхват",
      description: "После попадания вне тени подхват требует на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          const a = close(s);
          if (a && !a.hidden && landed(a).length) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "ringing_edge",
      name: "Звонкая кромка",
      description: "Критическое попадание подхватом возвращает 6 энергии. Не чаще одного раза за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          if (landed(close(s)).some(t => t.crit)) energy(b, 6);
        }
      }
    },
    {
      id: "wrist_turn",
      name: "Поворот запястья",
      description: "После попадания подхватом ты получаешь 6 уклонения на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-catch") return;
          if (landed(close(s)).length) {
            put(b, b.hero, "evasion", 1, 6);
          }
        }
      }
    }
  ]);

  // Ядовитый клык: пробой отравленной плоти, остаток дозы или капля соседу, включая форму извлечения.
  defineSkillMastery("assassin-venom-fang", [
    {
      id: "softened_flesh",
      name: "Разъеденная плоть",
      description: "Если до удара на цели есть яд, клык игнорирует дополнительно 20% её защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          if (direct(c) && getEffect(b.enemy, "poison")) {
            c.pierce += 0.2;
          }
        }
      }
    },
    {
      id: "dose_residue",
      name: "Остаток дозы",
      description: "После попадания оставшийся яд длится на 1 ход дольше, до 8 ходов. Если форма извлекла яд, вместо продления ты возвращаешь 6 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          const ts = landed(close(s));
          ts.forEach(t => {
            if (t.unit.currentHp > 0) extend(t.unit, "poison");
          });
          if (
            !hasEffectSpec(c.skill, "poison") &&
            ts.some(t => t.dose > 0 && !getEffect(t.unit, "poison"))
          ) {
            energy(b, 6);
          }
        }
      }
    },
    {
      id: "flying_drop",
      name: "Капля на излёте",
      description: "После попадания другой враг получает яд на 1 ход: 50% силы дозы, не выше 30% твоего физического урона. При извлечении используется доза до удара; одна капля за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-venom-fang") return;
          const t = landed(close(s))[0];
          if (!t) return;
          const dose = hasEffectSpec(c.skill, "poison")
            ? effectValue(t.unit, "poison")
            : t.dose;
          const u = other(b, t.unit);
          if (u && dose > 0) {
            put(
              b, u, "poison", 1,
              Math.min(dose * 0.5, b.hero.physicalDamage * 0.3)
            );
          }
        }
      }
    }
  ]);

  // Перерезать путь: длинное замедление, повторный перехват или защита от тяжёлого ответа.
  defineSkillMastery("assassin-cut-route", [
    {
      id: "blocked_path",
      name: "Закрытый проход",
      description: "После попадания замедление цели держится на 1 ход дольше, до 8 ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-route") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-cut-route") return;
          alive(close(s)).forEach(t => extend(t.unit, "slow"));
        }
      }
    },
    {
      id: "second_intercept",
      name: "Второй перехват",
      description: "Если цель уже замедлена до удара, ты наносишь этим навыком на 18% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-route") return;
          if (direct(c) && getEffect(b.enemy, "slow")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "broken_run",
      name: "Сбитый разбег",
      description: "После попадания по замедленной цели её ближайший тяжёлый удар по тебе слабее на 20%. Защита действует до твоего следующего хода и срабатывает один раз.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-route") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-cut-route") return;
          s.guard = alive(close(s))
            .find(t => getEffect(t.unit, "slow"))?.unit || null;
        },
        incoming(b, s, c) {
          if (!s.guard) return;
          if (b.enemy !== s.guard || !c.heavy || c.parried) return;
          c.amount *= 0.8;
          s.guard = null;
        },
        turnStart(b, s) {
          if (!s.guard) return;
          s.guard = null;
        }
      }
    }
  ]);

  // Двойная насечка: точное продолжение, энергия за два попадания или новая рана.
  defineSkillMastery("assassin-double-notch", [
    {
      id: "cross_notch",
      name: "Поперечная зарубка",
      description: "Если первый удар попал, второй удар по той же цели наносит на 30% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          const t = watch(b, s, c);
          if (t?.attempts === 2 && t.hits === 1) c.mult *= 1.3;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          close(s);
        }
      }
    },
    {
      id: "even_breath",
      name: "Ровное дыхание",
      description: "Два попадания по одной цели за применение возвращают 6 энергии. Возврат срабатывает один раз.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          if (landed(close(s)).some(t => t.hits >= 2)) energy(b, 6);
        }
      }
    },
    {
      id: "open_notch",
      name: "Открытая насечка",
      description: "После двух попаданий по одной цели ты оставляешь на ней рану на 2 хода с силой 12% твоего физического урона.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-double-notch") return;
          alive(close(s)).filter(t => t.hits >= 2).forEach(t => {
            put(b, t.unit, "bleed", 2, b.hero.physicalDamage * 0.12);
          });
        }
      }
    }
  ]);

  // Доза по кругу: долгий общий яд, возврат за охват или пробой заражённой группы.
  defineSkillMastery("assassin-shared-dose", [
    {
      id: "sticky_drops",
      name: "Липкие капли",
      description: "После попадания яд каждой задетой цели держится на 1 ход дольше, до 8 ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shared-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shared-dose") return;
          alive(close(s)).forEach(t => extend(t.unit, "poison"));
        }
      }
    },
    {
      id: "measured_fan",
      name: "Мерный веер",
      description: "За каждую отравленную цель после первой, по которой попала доза, ты возвращаешь 4 энергии. Не больше 12 энергии за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shared-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shared-dose") return;
          const n = alive(close(s))
            .filter(t => getEffect(t.unit, "poison")).length;
          energy(b, Math.min(12, Math.max(0, n - 1) * 4));
        }
      }
    },
    {
      id: "linked_toxin",
      name: "Связанный токсин",
      description: "Если до попадания яд есть и на цели, и хотя бы на одном другом живом враге, доза игнорирует дополнительно 20% защиты цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-shared-dose") return;
          if (
            direct(c) &&
            getEffect(b.enemy, "poison") &&
            livingFoes(b).some(u =>
              u !== b.enemy && getEffect(u, "poison")
            )
          ) {
            c.pierce += 0.2;
          }
        }
      }
    }
  ]);

  // Шаг под ребро: долгая рана, удар под замах или ослабление ответа раненой цели.
  defineSkillMastery("assassin-rib-step", [
    {
      id: "deep_seam",
      name: "Глубокий шов",
      description: "После попадания рана цели держится на 1 ход дольше, до 8 ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-rib-step") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-rib-step") return;
          alive(close(s)).forEach(t => extend(t.unit, "bleed"));
        }
      }
    },
    {
      id: "under_swing",
      name: "Под замах",
      description: "Если цель готовит тяжёлый приём, шаг под ребро наносит ей на 18% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-rib-step") return;
          if (direct(c) && b.enemy.intent?.heavy) c.mult *= 1.18;
        }
      }
    },
    {
      id: "held_rib",
      name: "Зажатое ребро",
      description: "После попадания по кровоточащей цели её следующий удар по тебе слабее на 15%. Защита действует до твоего следующего хода и срабатывает один раз.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-rib-step") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-rib-step") return;
          s.guard = alive(close(s))
            .find(t => getEffect(t.unit, "bleed"))?.unit || null;
        },
        incoming(b, s, c) {
          if (!s.guard) return;
          if (b.enemy !== s.guard || c.parried) return;
          c.amount *= 0.85;
          s.guard = null;
        },
        turnStart(b, s) {
          if (!s.guard) return;
          s.guard = null;
        }
      }
    }
  ]);

  // Перехват кисти: крепкая слабость, быстрый выход из захвата или энергия за уклонение.
  defineSkillMastery("assassin-catch-wrist", [
    {
      id: "numb_fingers",
      name: "Немые пальцы",
      description: "Слабость от перехвата усиливается на 5 процентных пунктов, до 60%. Более сильная слабость сохраняется.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          const config = (c.skill.appliedEffects || [])
            .find(e => e.id === "weaken");
          if (config) {
            alive(close(s)).forEach(t => {
              improve(
                b, t.unit, "weaken",
                resolveSkillEffectValue(b.hero, config, c.skill),
                0.05, 0.6
              );
            });
          } else {
            close(s);
          }
        }
      }
    },
    {
      id: "slipping_grip",
      name: "Скользящий захват",
      description: "После попадания вне тени перехват требует на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          const a = close(s);
          if (a && !a.hidden && landed(a).length) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "released_grip",
      name: "Свободная кисть",
      description: "После попадания перехватом первое уклонение до твоего следующего хода возвращает 8 энергии.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-catch-wrist") return;
          s.dodge = landed(close(s)).length > 0;
        },
        dodged(b, s) {
          if (!s.dodge) return;
          s.dodge = false;
          energy(b, 8);
        },
        turnStart(b, s) {
          if (!s.dodge) return;
          s.dodge = false;
        }
      }
    }
  ]);

  // Затаиться: плотнее щит, дольше старый яд или ответ поглощённым ударом.
  defineSkillMastery("assassin-lie-low", [
    {
      id: "folded_cover",
      name: "Складка укрытия",
      description: "После ухода в тень существующий щит получает ещё 2% твоего максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lie-low") return;
          const e = getEffect(b.hero, "shield");
          if (e) e.value += Math.round(b.hero.maxHp * 0.02);
        }
      }
    },
    {
      id: "patient_dose",
      name: "Терпеливая доза",
      description: "Когда ты затаиваешься, существующий яд цели продлевается ещё на 1 ход, до 7 ходов. Рост тиков сохраняется.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lie-low") return;
          extend(b.enemy, "poison", 1, 7);
        }
      }
    },
    {
      id: "hidden_shard",
      name: "Скрытый осколок",
      description: "До твоего следующего хода первое поглощение урона щитом возвращает врагу 25% поглощённого урона, не выше 35% твоего физического урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lie-low") return;
          s.counter = Boolean(getEffect(b.hero, "shield"));
        },
        hurt(b, s, c) {
          if (!s.counter) return;
          if (c.absorbed <= 0) return;
          s.counter = false;
          chip(
            b, b.enemy,
            Math.min(c.absorbed * 0.25, b.hero.physicalDamage * 0.35),
            "Скрытый осколок"
          );
        },
        turnStart(b, s) {
          if (!s.counter) return;
          s.counter = false;
        }
      }
    }
  ]);

  // Дымный разрез: слепящий след, энергия за возвращение в тень или защита под дымом.
  defineSkillMastery("assassin-smoke-cut", [
    {
      id: "ash_in_eyes",
      name: "Пепел в глаза",
      description: "После попадания разрез ослепляет цель на 10 на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          alive(close(s)).forEach(t => put(b, t.unit, "blind", 1, 10));
        }
      }
    },
    {
      id: "saved_breath",
      name: "Сбережённый вдох",
      description: "Если в начале разреза ты вне тени, попадание и возвращение в тень дают 8 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          const a = close(s);
          if (a && !a.hidden && hidden(b) && landed(a).length) {
            energy(b, 8);
          }
        }
      }
    },
    {
      id: "thick_veil",
      name: "Густая завеса",
      description: "После попадания первый удар, прошедший сквозь твою тень, слабее на 20%. Завеса действует до твоего следующего хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-cut") return;
          s.veil = landed(close(s)).length > 0 && hidden(b);
        },
        incoming(b, s, c) {
          if (!s.veil) return;
          if (!hidden(b) || c.parried) return;
          c.amount *= 0.8;
          s.veil = false;
        },
        turnStart(b, s) {
          if (!s.veil) return;
          s.veil = false;
        }
      }
    }
  ]);

  // Сменить руку: темп, защита или метка только за сработавшую быструю связку.
  defineSkillMastery("assassin-change-hand", [
    {
      id: "seamless_swap",
      name: "Бесшовная смена",
      description: "Если сработала быстрая связка смены руки, ты тратишь на неё ещё на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-change-hand") return;
          if (c.tempo <= 0.7) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "cross_guard",
      name: "Косой заслон",
      description: "После быстрой связки ближайший удар по тебе слабее на 15%. Заслон действует до твоего следующего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-change-hand") return;
          s.guard = c.tempo <= 0.7;
        },
        incoming(b, s, c) {
          if (!s.guard) return;
          if (c.parried) return;
          c.amount *= 0.85;
          s.guard = false;
        },
        turnStart(b, s) {
          if (!s.guard) return;
          s.guard = false;
        }
      }
    },
    {
      id: "wrong_hand",
      name: "Не та рука",
      description: "После попадания быстрой связкой ты ставишь метку на 1 ход: цель получает на 12% больше урона.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-change-hand") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-change-hand") return;
          const ts = alive(close(s));
          if (c.tempo <= 0.7) {
            ts.forEach(t => put(b, t.unit, "mark", 1, 0.12));
          }
        }
      }
    }
  ]);

  // Горький ответ: цепкое замедление, давление на скованную цель или энергия с двух тиков.
  defineSkillMastery("assassin-bitter-answer", [
    {
      id: "bitter_step",
      name: "Горький шаг",
      description: "После попадания уже наложенное замедление цели длится на 1 ход дольше, до 8 ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          alive(close(s)).forEach(t => extend(t.unit, "slow"));
        }
      }
    },
    {
      id: "caught_breath",
      name: "Застрявший вдох",
      description: "Если до удара цель одновременно отравлена и замедлена, горький ответ наносит на 18% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          if (
            direct(c) &&
            getEffect(b.enemy, "poison") &&
            getEffect(b.enemy, "slow")
          ) {
            c.mult *= 1.18;
          }
        }
      }
    },
    {
      id: "bitter_return",
      name: "Горький возврат",
      description: "После попадания вне тени два следующих тика оставшегося яда этой цели возвращают по 4 энергии. Повторное применение обновляет запас тиков.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-bitter-answer") return;
          const a = close(s);
          const t = a && !a.hidden ? alive(a)[0] : null;
          s.dose = t ? getEffect(t.unit, "poison") : null;
          s.target = t?.unit;
          s.left = s.dose ? 2 : 0;
        },
        tick(b, s, c) {
          if (!s.left) return;
          if (
            c.id !== "poison" ||
            b.enemy !== s.target ||
            getEffect(b.enemy, "poison") !== s.dose
          ) return;
          s.left -= 1;
          energy(b, 4);
        }
      }
    }
  ]);

  // Взять след: раннее добивание, возврат отката за убийство или метка на ускользнувшей жертве.
  defineSkillMastery("assassin-take-trail", [
    {
      id: "fresh_tracks",
      name: "Свежие следы",
      description: "Порог усиленного удара повышается на 5 процентных пунктов: с 35% до 40% здоровья цели.",
      patch: skill => ({
        execute: {
          ...skill.execute,
          threshold: Math.min(
            1,
            Number(skill.execute?.threshold || 0.35) + 0.05
          )
        }
      })
    },
    {
      id: "unbroken_hunt",
      name: "Непрерывная охота",
      description: "Убийство этим навыком сокращает его текущий откат на 1 ход. Не чаще одного раза за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-take-trail") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-take-trail") return;
          if (landed(close(s)).some(t => t.unit.currentHp <= 0)) {
            b.hero.cooldowns[c.skill.id] = Math.max(
              0,
              Number(b.hero.cooldowns[c.skill.id] || 0) - 1
            );
          }
        }
      }
    },
    {
      id: "visible_trail",
      name: "Видимый след",
      description: "Если усиленное добивание попало, но цель выжила, ты ставишь метку на 2 хода: она получает на 12% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-take-trail") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-take-trail") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-take-trail") return;
          alive(close(s))
            .filter(t => t.hp <= c.skill.execute.threshold)
            .forEach(t => put(b, t.unit, "mark", 2, 0.12));
        }
      }
    }
  ]);

  // Круг кинжалов: сильнее края круга, быстрее широкий охват или слабость задетой группы.
  defineSkillMastery("assassin-knife-circle", [
    {
      id: "outer_edge",
      name: "Внешняя кромка",
      description: "Попадания круга по дополнительным целям наносят на 18% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-circle") return;
          if (
            direct(c) &&
            b.focus != null &&
            b.enemy.slot !== b.focus
          ) {
            c.mult *= 1.18;
          }
        }
      }
    },
    {
      id: "round_step",
      name: "Круговой шаг",
      description: "Если круг попал хотя бы по двум разным целям, ты тратишь на применение на 15% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-circle") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-circle") return;
          if (landed(close(s)).length >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "lowered_hands",
      name: "Опущенные руки",
      description: "Если круг попал хотя бы по двум разным целям, все выжившие задетые цели получают слабость 12% на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-circle") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-circle") return;
          const a = close(s);
          if (landed(a).length >= 2) {
            alive(a).forEach(t => put(b, t.unit, "weaken", 1, 0.12));
          }
        }
      }
    }
  ]);

  // Не будить яд: сохранение зрелости, энергия за тихий бросок или помеха ответу.
  defineSkillMastery("assassin-quiet-dose", [
    {
      id: "undisturbed_dose",
      name: "Нетронутый осадок",
      description: "При броске из тени после попадания яд сохраняет до 2 тиков своей зрелости до броска.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          const a = close(s);
          if (!a?.hidden) return;
          alive(a).forEach(t => {
            const e = getEffect(t.unit, "poison");
            if (e) {
              e.meta.elapsedTicks = Math.max(
                ticks(e),
                Math.min(2, t.ticks)
              );
            }
          });
        }
      }
    },
    {
      id: "quiet_breath",
      name: "Тихий вдох",
      description: "Попадание броском из тени возвращает 8 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          const a = close(s);
          if (a?.hidden && landed(a).length) energy(b, 8);
        }
      }
    },
    {
      id: "soundless_prick",
      name: "Беззвучный укол",
      description: "После попадания из тени ты ослепляешь цель на 12 на 1 ход.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-quiet-dose") return;
          const a = close(s);
          if (a?.hidden) {
            alive(a).forEach(t => put(b, t.unit, "blind", 1, 12));
          }
        }
      }
    }
  ]);

  // Последний силуэт: пробой раненой цели, быстрый уход за убийство или щит при неудавшемся добивании.
  defineSkillMastery("assassin-last-silhouette", [
    {
      id: "thin_outline",
      name: "Тонкий контур",
      description: "При ударе из тени по цели ниже 50% здоровья ты игнорируешь дополнительно 20% её защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          if (direct(c) && hidden(b) && hp(b.enemy) < 0.5) {
            c.pierce += 0.2;
          }
        }
      }
    },
    {
      id: "vanishing_end",
      name: "Исчезающий конец",
      description: "Если силуэт убил хотя бы одну задетую цель, применение требует на 20% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          if (landed(close(s)).some(t => t.unit.currentHp <= 0)) {
            c.tempo *= 0.8;
          }
        }
      }
    },
    {
      id: "remaining_shadow",
      name: "Оставшаяся тень",
      description: "Если до удара у цели было меньше 50% здоровья и она выжила, ты получаешь щит на 2 хода: 15% нанесённого ей прямого урона, не выше 5% твоего максимального здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-last-silhouette") return;
          const n = alive(close(s))
            .filter(t => t.hp < 0.5)
            .reduce((v, t) => v + t.damage * 0.15, 0);
          if (n > 0) {
            put(
              b, b.hero, "shield", 2,
              Math.min(n, b.hero.maxHp * 0.05)
            );
          }
        }
      }
    }
  ]);

  // Ножевой шквал: точный третий удар, энергия полной открытой серии или замедление после трёх попаданий.
  defineSkillMastery("assassin-knife-squall", [
    {
      id: "third_blade",
      name: "Третий клинок",
      description: "Если первые два удара попали по одной цели, третий наносит ей на 45% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          const t = watch(b, s, c);
          if (t?.attempts === 3 && t.hits === 2) c.mult *= 1.45;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          close(s);
        }
      }
    },
    {
      id: "full_return",
      name: "Полный возврат",
      description: "При применении вне тени хотя бы три попадания по одной цели возвращают ещё 10 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          const a = close(s);
          if (a && !a.hidden && landed(a).some(t => t.hits >= 3)) {
            energy(b, 10);
          }
        }
      }
    },
    {
      id: "pinned_step",
      name: "Прибитый шаг",
      description: "Три попадания по одной цели за применение замедляют её на 20% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-knife-squall") return;
          alive(close(s)).filter(t => t.hits >= 3).forEach(t => {
            put(b, t.unit, "slow", 2, 0.2);
          });
        }
      }
    }
  ]);

  // Смертная доза: длительность, два усиленных зрелых тика или энергия за обновление зрелого яда.
  defineSkillMastery("assassin-mortal-dose", [
    {
      id: "last_sediment",
      name: "Последний осадок",
      description: "После попадания яд держится ещё на 1 ход дольше, до 8 ходов. Рост тиков сохраняется.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          alive(close(s)).forEach(t => extend(t.unit, "poison"));
        }
      }
    },
    {
      id: "ripened_death",
      name: "Созревшая смерть",
      description: "После попадания два следующих тика этого яда, перед которыми уже прошло хотя бы 2 тика, наносят на 20% больше урона. Повторное применение обновляет запас.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          const t = alive(close(s))[0];
          s.target = t?.unit;
          s.dose = t ? getEffect(t.unit, "poison") : null;
          s.left = s.dose ? 2 : 0;
        },
        beforeTick(b, s, c) {
          if (!s.left) return;
          if (
            c.id !== "poison" ||
            b.enemy !== s.target ||
            getEffect(b.enemy, "poison") !== s.dose ||
            ticks(s.dose) < 2
          ) return;
          c.amount *= 1.2;
          s.left -= 1;
        }
      }
    },
    {
      id: "mature_extract",
      name: "Зрелая вытяжка",
      description: "Если до попадания яд цели уже прошёл хотя бы 2 тика, смертная доза возвращает 12 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-mortal-dose") return;
          if (landed(close(s)).some(t => t.ticks >= 2)) energy(b, 12);
        }
      }
    }
  ]);

  // Дымный шаг: плотность выбранного дыма, темп при полном запасе или энергия за уклонение.
  defineSkillMastery("assassin-smoke-step", [
    {
      id: "dense_smoke",
      name: "Плотный дым",
      description: "Дым даёт ещё 3 уклонения. Если форма вместо этого ослепляет врагов, её ослепление становится сильнее на 4.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-step") return;
          if (
            (c.skill.appliedEffects || []).some(e =>
              e.id === "evasion" && e.target === "self"
            )
          ) {
            const config = c.skill.appliedEffects.find(e =>
              e.id === "evasion" && e.target === "self"
            );
            improve(
              b, b.hero, "evasion",
              resolveSkillEffectValue(b.hero, config, c.skill),
              3
            );
          } else {
            livingFoes(b).forEach(u => {
              improve(b, u, "blind", 20, 4);
            });
          }
        }
      }
    },
    {
      id: "ready_dance",
      name: "Готовый рисунок",
      description: "Если после дымного шага у тебя 5 приёмов, ты тратишь на этот шаг на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-step") return;
          if (combo(b) >= 5) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "breath_in_smoke",
      name: "Вдох в дыму",
      description: "Первое уклонение после дымного шага возвращает 8 энергии. Возможность действует до твоего следующего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-smoke-step") return;
          s.dodge = true;
        },
        dodged(b, s) {
          if (!s.dodge) return;
          s.dodge = false;
          energy(b, 8);
        },
        turnStart(b, s) {
          if (!s.dodge) return;
          s.dodge = false;
        }
      }
    }
  ]);

  // Кража приёма: польза полного запаса, энергия за крит или кража темпа цели.
  defineSkillMastery("assassin-steal-move", [
    {
      id: "full_purse",
      name: "Полный запас",
      description: "Если до атаки у тебя уже было 5 приёмов, кража наносит на 18% больше прямого урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          if (!watch(b, s, c)) return;
          if (s.cast.combo >= 5) c.mult *= 1.18;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          close(s);
        }
      }
    },
    {
      id: "stolen_spark",
      name: "Краденая искра",
      description: "Критическое попадание кражей возвращает 6 энергии. Не чаще одного раза за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          if (landed(close(s)).some(t => t.crit)) energy(b, 6);
        }
      }
    },
    {
      id: "stolen_pause",
      name: "Чужая пауза",
      description: "Критическое попадание кражей замедляет цель на 15% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steal-move") return;
          alive(close(s)).filter(t => t.crit).forEach(t => {
            put(b, t.unit, "slow", 2, 0.15);
          });
        }
      }
    }
  ]);

  // Удар в печень: слабость после добивания, запасной приём или пробой тяжёлого замаха.
  defineSkillMastery("assassin-gut-strike", [
    {
      id: "liver_knot",
      name: "Узел под рёбрами",
      description: "После попадания добиванием ты ослабляешь цель на 15% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-gut-strike") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-gut-strike") return;
          alive(close(s)).forEach(t => {
            put(b, t.unit, "weaken", 2, 0.15);
          });
        }
      }
    },
    {
      id: "spare_motion",
      name: "Запасное движение",
      description: "Попадание добиванием или его казнь оставляет тебе 1 приём для новой связки.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-gut-strike") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-gut-strike") return;
          if (landed(close(s)).length || b.enemy.currentHp <= 0) {
            bumpGauge(b, "shade", 1, 5);
          }
        }
      }
    },
    {
      id: "opened_swing",
      name: "Открытый замах",
      description: "Если цель готовит тяжёлый приём, удар в печень игнорирует дополнительно 25% её защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-gut-strike") return;
          if (direct(c) && b.enemy.intent?.heavy) c.pierce += 0.25;
        }
      }
    }
  ]);

  // Неполная связка: точный второй рез, темп полного запаса или слабость после насыщенной серии.
  defineSkillMastery("assassin-unfinished-chain", [
    {
      id: "linked_cut",
      name: "Связанный рез",
      description: "Если первый удар попал, второй удар связки по той же цели наносит на 30% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          const t = watch(b, s, c);
          if (t?.attempts === 2 && t.hits === 1) c.mult *= 1.3;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          close(s);
        }
      }
    },
    {
      id: "flowing_chain",
      name: "Текучая связка",
      description: "Если до атаки у тебя было хотя бы 4 приёма и связка попала, применение требует на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          const a = close(s);
          if (a && a.combo >= 4 && landed(a).length) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "tangled_hands",
      name: "Спутанные руки",
      description: "Если до атаки у тебя было хотя бы 4 приёма, два попадания по одной цели ослабляют её на 12% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-unfinished-chain") return;
          const a = close(s);
          if (a && a.combo >= 4) {
            alive(a).filter(t => t.hits >= 2).forEach(t => {
              put(b, t.unit, "weaken", 2, 0.12);
            });
          }
        }
      }
    }
  ]);

  // Отсечь погоню: замедление преследователей, энергия широкого выхода или сильнее боковые удары.
  defineSkillMastery("assassin-cut-pursuit", [
    {
      id: "cut_heels",
      name: "Подрезанные пятки",
      description: "После попадания добиванием каждая задетая цель замедляется на 15% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-pursuit") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-cut-pursuit") return;
          alive(close(s)).forEach(t => {
            put(b, t.unit, "slow", 2, 0.15);
          });
        }
      }
    },
    {
      id: "open_corridor",
      name: "Свободный коридор",
      description: "Если добивание попало хотя бы по двум разным целям, ты возвращаешь 8 энергии за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-pursuit") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-cut-pursuit") return;
          if (landed(close(s)).length >= 2) energy(b, 8);
        }
      }
    },
    {
      id: "wide_exit",
      name: "Широкий выход",
      description: "Боковые попадания добивания по дополнительным целям наносят на 20% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-cut-pursuit") return;
          if (
            direct(c) &&
            b.focus != null &&
            b.enemy.slot !== b.focus
          ) {
            c.mult *= 1.2;
          }
        }
      }
    }
  ]);

  // Без развязки: полный запас открывает броню, возвращает энергию или оставляет рану.
  defineSkillMastery("assassin-no-resolution", [
    {
      id: "unspent_edge",
      name: "Нерастраченная кромка",
      description: "Если до атаки у тебя было 5 приёмов, удар игнорирует дополнительно 20% защиты цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          if (!watch(b, s, c)) return;
          if (s.cast.combo >= 5) c.pierce += 0.2;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          close(s);
        }
      }
    },
    {
      id: "held_breath",
      name: "Удержанный вдох",
      description: "Если до атаки у тебя было 5 приёмов и удар попал, ты возвращаешь 8 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          const a = close(s);
          if (a && a.combo >= 5 && landed(a).length) energy(b, 8);
        }
      }
    },
    {
      id: "unfinished_wound",
      name: "Незакрытая рана",
      description: "Если до атаки у тебя было 5 приёмов, попадание оставляет рану на 2 хода с силой 14% твоего физического урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-resolution") return;
          const a = close(s);
          if (a && a.combo >= 5) {
            alive(a).forEach(t => {
              put(b, t.unit, "bleed", 2, b.hero.physicalDamage * 0.14);
            });
          }
        }
      }
    }
  ]);

  // Токсичный порез: зрелость дозы или длительность подреза, пробой старого яда, энергия за убийство.
  defineSkillMastery("assassin-toxic-cut", [
    {
      id: "settled_toxin",
      name: "Отстоявшийся токсин",
      description: "После попадания новая доза сохраняет до 2 тиков зрелости прежнего яда. Форма с замедлением вместо этого продлевает своё замедление на 1 ход, до 8 ходов.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          alive(close(s)).forEach(t => {
            if (hasEffectSpec(c.skill, "poison")) {
              const e = getEffect(t.unit, "poison");
              if (e) {
                e.meta.elapsedTicks = Math.max(
                  ticks(e),
                  Math.min(2, t.ticks)
                );
              }
            } else if (hasEffectSpec(c.skill, "slow")) {
              extend(t.unit, "slow");
            }
          });
        }
      }
    },
    {
      id: "etched_channel",
      name: "Протравленный канал",
      description: "Если до удара цель отравлена, токсичный порез игнорирует дополнительно 20% её защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          if (direct(c) && getEffect(b.enemy, "poison")) {
            c.pierce += 0.2;
          }
        }
      }
    },
    {
      id: "clean_blade",
      name: "Чистая кромка",
      description: "Если токсичный порез убил хотя бы одну задетую цель, ты возвращаешь 10 энергии за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-toxic-cut") return;
          if (landed(close(s)).some(t => t.unit.currentHp <= 0)) {
            energy(b, 10);
          }
        }
      }
    }
  ]);

  // Проверить дрожь: раннее чтение зрелости, продление проверенного яда или возврат за чистую пробу.
  defineSkillMastery("assassin-read-tremor", [
    {
      id: "first_tremor",
      name: "Первая дрожь",
      description: "Бонус удара за зрелый яд, +25% прямого урона, срабатывает уже после 1 тика вместо 2.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          if (direct(c) && ticks(getEffect(b.enemy, "poison")) === 1) {
            c.mult *= 1.25;
          }
        }
      }
    },
    {
      id: "confirmed_dose",
      name: "Проверенная доза",
      description: "Если до попадания яд прошёл хотя бы 2 тика, после проверки ты продлеваешь его на 1 ход, до 7 ходов.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          alive(close(s)).filter(t => t.ticks >= 2).forEach(t => {
            extend(t.unit, "poison", 1, 7);
          });
        }
      }
    },
    {
      id: "clean_sample",
      name: "Чистая проба",
      description: "Если до попадания яда не было, а проверка успешно наложила пробную дозу, ты возвращаешь 6 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-read-tremor") return;
          if (
            alive(close(s)).some(t =>
              !t.poison && getEffect(t.unit, "poison")
            )
          ) {
            energy(b, 6);
          }
        }
      }
    }
  ]);

  // Разогнать токсин: дополнительное время, удар по зрелой дозе или возврат энергии с двух тиков.
  defineSkillMastery("assassin-stir-toxin", [
    {
      id: "deep_stir",
      name: "Глубокий замес",
      description: "После попадания существующий яд продлевается ещё на 1 ход, до 7 ходов. Рост тиков сохраняется.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-stir-toxin") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-stir-toxin") return;
          alive(close(s)).forEach(t => extend(t.unit, "poison", 1, 7));
        }
      }
    },
    {
      id: "ripe_surge",
      name: "Зрелый всплеск",
      description: "Если яд цели уже прошёл хотя бы 2 тика, разгон наносит на 18% больше прямого урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-stir-toxin") return;
          if (direct(c) && ticks(getEffect(b.enemy, "poison")) >= 2) {
            c.mult *= 1.18;
          }
        }
      }
    },
    {
      id: "toxin_pulse",
      name: "Пульс токсина",
      description: "После попадания два следующих тика оставшегося яда этой цели возвращают по 4 энергии. Повторное применение обновляет запас тиков.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-stir-toxin") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-stir-toxin") return;
          const t = alive(close(s))[0];
          s.target = t?.unit;
          s.dose = t ? getEffect(t.unit, "poison") : null;
          s.left = s.dose ? 2 : 0;
        },
        tick(b, s, c) {
          if (!s.left) return;
          if (
            c.id !== "poison" ||
            b.enemy !== s.target ||
            getEffect(b.enemy, "poison") !== s.dose
          ) return;
          s.left -= 1;
          energy(b, 4);
        }
      }
    }
  ]);

  // Промыть клинок: меньше потерь токсина, энергия зрелого смыва или защитная плёнка.
  defineSkillMastery("assassin-wash-blade", [
    {
      id: "retained_film",
      name: "Несмытая плёнка",
      description: "После попадания промывка возвращает 20% силы оставшегося после неё яда.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          alive(close(s)).forEach(t => {
            const e = getEffect(t.unit, "poison");
            if (e) {
              e.value = Math.max(e.value, Math.round(e.value * 1.2));
            }
          });
        }
      }
    },
    {
      id: "rich_wash",
      name: "Насыщенный смыв",
      description: "Если до попадания старый яд прошёл хотя бы 2 тика, промывка возвращает ещё 8 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          if (landed(close(s)).some(t => t.ticks >= 2)) energy(b, 8);
        }
      }
    },
    {
      id: "caustic_coat",
      name: "Едкое покрытие",
      description: "Если после попадания и промывки на цели остаётся яд, ты получаешь щит на 2 хода в 3% твоего максимального здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-wash-blade") return;
          if (alive(close(s)).some(t => getEffect(t.unit, "poison"))) {
            put(b, b.hero, "shield", 2, b.hero.maxHp * 0.03);
          }
        }
      }
    }
  ]);

  // Глубокий прокол: дополнительный вклад токсина, сохранение зрелого яда или энергия насыщенной дозы.
  defineSkillMastery("assassin-deep-puncture", [
    {
      id: "toxic_channel",
      name: "Токсичный канал",
      description: "К добавке прокола ты прибавляешь ещё 16% силы текущего токсина, не выше 16% твоего физического урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          if (direct(c)) {
            c.flat += Math.min(
              b.hero.physicalDamage * 0.16,
              effectValue(b.enemy, "poison") * 0.16
            );
          }
        }
      }
    },
    {
      id: "sealed_puncture",
      name: "Запечатанный прокол",
      description: "Если до попадания яд прошёл хотя бы 2 тика, прокол продлевает его на 1 ход, до 7 ходов.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          alive(close(s)).filter(t => t.ticks >= 2).forEach(t => {
            extend(t.unit, "poison", 1, 7);
          });
        }
      }
    },
    {
      id: "full_needle",
      name: "Полная игла",
      description: "Если до попадания сила токсина была не ниже твоего физического урона, прокол возвращает 8 энергии за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          watch(b, s, c);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          land(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-deep-puncture") return;
          if (
            landed(close(s)).some(t =>
              t.dose >= b.hero.physicalDamage
            )
          ) {
            energy(b, 8);
          }
        }
      }
    }
  ]);

  // Мёртвый час: время старых доз, защита от замедленного врага или энергия зрелой группы.
  defineSkillMastery("assassin-dead-hour", [
    {
      id: "long_minute",
      name: "Долгая минута",
      description: "Мёртвый час продлевает существующий яд каждого живого врага ещё на 1 ход, до 7 ходов. Рост тиков сохраняется.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-dead-hour") return;
          livingFoes(b).forEach(u => extend(u, "poison", 1, 7));
        }
      }
    },
    {
      id: "stilled_answer",
      name: "Застывший ответ",
      description: "После мёртвого часа первый удар замедленного врага по тебе слабее на 20%. Защита действует до твоего следующего хода и срабатывает один раз.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-dead-hour") return;
          s.guard = true;
        },
        incoming(b, s, c) {
          if (!s.guard) return;
          if (!getEffect(b.enemy, "slow") || c.parried) return;
          c.amount *= 0.8;
          s.guard = false;
        },
        turnStart(b, s) {
          if (!s.guard) return;
          s.guard = false;
        }
      }
    },
    {
      id: "harvest_hour",
      name: "Час сбора",
      description: "За каждого живого врага, чей яд уже прошёл хотя бы 2 тика, мёртвый час возвращает 4 энергии. Не больше 12 энергии за применение.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-dead-hour") return;
          const n = livingFoes(b).filter(u =>
            ticks(getEffect(u, "poison")) >= 2
          ).length;
          energy(b, Math.min(12, n * 4));
        }
      }
    }
  ]);
})();

(() => {
  const direct = c => !c.proc && !c.noEcho;
  const hidden = b => Boolean(b.mech?.core_assassin?.hidden);
  const shades = b => Number(b.mech?.phantom?.value || 0);
  const plague = b => Boolean(b.mech?.plaguebearer?.plague);
  const aged = (u, id) => Number(getEffect(u, id)?.meta?.elapsedTicks || 0);

  const energy = (b, n) => {
    if (b.hero.currentHp <= 0) return;
    const old = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, old + n);
    if (b.hero.currentMana > old) {
      emit(b, "mana", { target: "hero", amount: b.hero.currentMana - old });
    }
  };

  const extend = (u, id, n = 1, cap = 8) => {
    const e = getEffect(u, id);
    if (e && Number.isFinite(e.duration)) {
      e.duration = Math.max(e.duration, Math.min(cap, e.duration + n));
    }
  };

  const shield = (b, ratio) => {
    if (b.hero.currentHp <= 0) return;
    const value = Math.round(b.hero.maxHp * ratio);
    const e = getEffect(b.hero, "shield");
    if (!e) {
      fx(b, "shield", 2, value, { self: true });
      return;
    }
    e.value += value;
    e.duration = Math.max(e.duration, 2);
    emit(b, "effect", { target: "hero", id: "shield" });
  };

  const at = (b, u, fn) => {
    const old = b.enemy;
    const focus = b.focus;
    b.enemy = u;
    b.focus = focus ?? old.slot;
    try {
      return fn();
    } finally {
      b.enemy = old;
      b.focus = focus;
    }
  };

  const next = (b, u = b.enemy) => livingFoes(b).find(f => f !== u);

  const record = (b, s, c) => {
    if (!direct(c)) return;
    if (!s.hits) s.hits = new Map();
    const row = s.hits.get(b.enemy) || {
      unit: b.enemy, count: 0, crits: 0, damage: 0
    };
    row.count += 1;
    row.crits += Number(Boolean(c.crit));
    row.damage += c.hpDamage;
    s.hits.set(b.enemy, row);
  };

  const take = s => {
    const rows = s.hits ? [...s.hits.values()] : [];
    s.hits = null;
    return rows;
  };

  const living = rows => rows.filter(r => r.unit.currentHp > 0);
  const faster = c => { c.tempo *= 0.85; };

  // Отслеживаем сам эффект и его метаданные: обновление дозы снимает подготовку.
  const watch = (u, id) => {
    const effect = getEffect(u, id);
    return effect ? { unit: u, id, effect, meta: effect.meta } : null;
  };

  const matches = (b, w, id) => Boolean(
    w &&
    w.unit === b.enemy &&
    w.id === id &&
    getEffect(w.unit, id) === w.effect &&
    w.effect.meta === w.meta
  );

  const diseaseWatches = rows => living(rows).flatMap(r =>
    ["poison", "bleed"].map(id => watch(r.unit, id)).filter(Boolean)
  );

  const seed = (b, source, id, value, duration = 2) => {
    const u = livingFoes(b).find(f => f !== source && !getEffect(f, id));
    if (u) at(b, u, () => fx(b, id, duration, value));
  };

  // Два клыка: удержать рану или слабость, связать попадания, собрать приём критом.
  defineSkillMastery("assassin-twin-fangs", [
    {
      id: "barbs",
      name: "Обратные зубцы",
      description: "После попадания рана или слабость этой формы держится на 1 ход дольше, до 8 оставшихся ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          for (const r of living(take(s))) {
            for (const id of ["bleed", "weaken"]) {
              if (c.skill.appliedEffects?.some(e => e.id === id)) {
                extend(r.unit, id);
              }
            }
          }
        }
      }
    },
    {
      id: "crosscut",
      name: "Перекрёстный рез",
      description: "Повторное попадание серии по той же цели сильнее на 30%. У одноударной формы удар сильнее на 15%, если цель уже кровоточит или ослаблена.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          if (!direct(c)) return;
          if (Number(c.skill.hits || 1) === 1) {
            if (getEffect(b.enemy, "bleed") || getEffect(b.enemy, "weaken")) {
              c.mult *= 1.15;
            }
          } else if (s.hits?.has(b.enemy)) {
            c.mult *= 1.3;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          take(s);
        }
      }
    },
    {
      id: "fang_rhythm",
      name: "Ритм клыков",
      description: "Если хотя бы одно попадание навыка критическое, ты получаешь ещё 1 приём, до 5. Не чаще одного раза за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-twin-fangs") return;
          if (take(s).some(r => r.crits)) bumpGauge(b, "shade", 1, 5);
        }
      }
    }
  ]);

  // Казнь: усилить добивание, оставить начало связки, напугать следующую жертву.
  defineSkillMastery("assassin-execution", [
    {
      id: "last_breath",
      name: "Последний вздох",
      description: "Если перед ударом у цели не больше 30% здоровья, обычный удар казни сильнее на 15%. Порог мгновенной казни прежний.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-execution") return;
          if (direct(c) && b.enemy.currentHp / b.enemy.maxHp <= 0.3) {
            c.mult *= 1.15;
          }
        }
      }
    },
    {
      id: "loose_knot",
      name: "Незатянутый узел",
      description: "Если цель пережила попадание казни, ты получаешь 1 приём для следующей связки, до 5.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-execution") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-execution") return;
          if (living(take(s)).length) bumpGauge(b, "shade", 1, 5);
        }
      }
    },
    {
      id: "red_witness",
      name: "Свидетель казни",
      description: "Если казнь убивает выбранную цель, один другой живой враг получает метку: +15% входящего урона на 2 хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-execution") return;
          const u = b.enemy.currentHp <= 0 && next(b);
          if (u) at(b, u, () => fx(b, "mark", 2, 0.15));
        }
      }
    }
  ]);

  // Зарез по шву: сохранить кровоточащий шов, окупить крит, перенести кровь после казни.
  defineSkillMastery("assassin-seam-kill", [
    {
      id: "open_seam",
      name: "Незакрытый шов",
      description: "После попадания по выжившей цели ты продлеваешь имеющуюся рану на 1 ход, до 8 оставшихся ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-seam-kill") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-seam-kill") return;
          living(take(s)).forEach(r => extend(r.unit, "bleed"));
        }
      }
    },
    {
      id: "blood_payment",
      name: "Плата кровью",
      description: "Критическое попадание по кровоточащей цели возвращает 9 энергии. Не чаще одного раза за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-seam-kill") return;
          if (direct(c) && c.crit && getEffect(b.enemy, "bleed")) s.paid = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-seam-kill") return;
          if (s.paid) energy(b, 9);
          s.paid = false;
        }
      }
    },
    {
      id: "bloody_thread",
      name: "Кровавая нить",
      description: "Если зарез убивает кровоточащую цель, ты ранишь одного другого врага без раны: 2 хода по 12% физической силы.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-seam-kill") return;
          if (b.enemy.currentHp <= 0 && getEffect(b.enemy, "bleed")) {
            seed(b, b.enemy, "bleed", b.hero.physicalDamage * 0.12);
          }
        }
      }
    }
  ]);

  // Красная ступень: кровавый щит, быстрый шаг при нехватке здоровья, удержание лечебной раны.
  defineSkillMastery("assassin-red-step", [
    {
      id: "blood_sole",
      name: "Алая подошва",
      description: "Попадание по кровоточащей цели даёт щит на 2 хода: 12% нанесённого прямого урона, до 3% твоего здоровья за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (getEffect(b.enemy, "bleed")) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          const damage = take(s).reduce((n, r) => n + r.damage, 0);
          if (damage > 0) {
            shield(b, Math.min(0.03, damage * 0.12 / b.hero.maxHp));
          }
        }
      }
    },
    {
      id: "urgent_step",
      name: "Шаг к жизни",
      description: "Если перед попаданием у тебя меньше 50% здоровья, а цель кровоточит, красная ступень занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (direct(c)) {
            s.low = b.hero.currentHp < b.hero.maxHp * 0.5 &&
              Boolean(getEffect(b.enemy, "bleed"));
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (direct(c) && s.low) s.fast = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (s.fast) faster(c);
          s.low = s.fast = false;
        }
      }
    },
    {
      id: "living_vein",
      name: "Живая жила",
      description: "Если до попадания тебе недоставало здоровья, ты продлеваешь рану выжившей цели на 1 ход, до 8 оставшихся ходов.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (direct(c)) s.injured = b.hero.currentHp < b.hero.maxHp;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          if (s.injured) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-red-step") return;
          living(take(s)).forEach(r => extend(r.unit, "bleed"));
          s.injured = false;
        }
      }
    }
  ]);

  // Без права на вдох: долгая рана, энергия после убийства, защита от тяжёлого ответа.
  defineSkillMastery("assassin-no-breath", [
    {
      id: "lingering_gasp",
      name: "Долгий хрип",
      description: "После попадания рана выжившей цели держится на 1 ход дольше, до 8 оставшихся ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-breath") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-breath") return;
          living(take(s)).forEach(r => extend(r.unit, "bleed"));
        }
      }
    },
    {
      id: "silence_price",
      name: "Цена тишины",
      description: "Если навык убивает выбранную цель, ты возвращаешь 11 энергии, включая мгновенную казнь.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-breath") return;
          if (b.enemy.currentHp <= 0) energy(b, 11);
        }
      }
    },
    {
      id: "choked_swing",
      name: "Сорванный замах",
      description: "После попадания первый тяжёлый удар этой цели наносит тебе на 20% меньше урона, пока её рана сохраняется. Обновление раны снимает подготовку.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-no-breath") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-no-breath") return;
          const r = living(take(s))[0];
          s.guard = r ? watch(r.unit, "bleed") : null;
        },
        incoming(b, s, c) {
          if (!s.guard || !c.heavy || !matches(b, s.guard, "bleed")) return;
          s.guard = null;
          c.amount *= 0.8;
        }
      }
    }
  ]);

  // Перепрыгнуть тело: раннее добивание, энергия для погони, удар по следующей цели.
  defineSkillMastery("assassin-leap-body", [
    {
      id: "staggered_prey",
      name: "Шаткая опора",
      description: "Усиление удара по раненой цели включается на 5 процентных пунктов раньше: без других изменений порог становится 35% здоровья.",
      patch: s => ({
        execute: {
          ...s.execute,
          threshold: Math.min(1, Number(s.execute?.threshold || 0) + 0.05)
        }
      })
    },
    {
      id: "pursuit_breath",
      name: "Дыхание погони",
      description: "Если прыжок убивает выбранную цель, ты возвращаешь 9 энергии для следующей жертвы.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-leap-body") return;
          if (b.enemy.currentHp <= 0) energy(b, 9);
        }
      }
    },
    {
      id: "landing_cut",
      name: "Рез приземления",
      description: "После убийства прыжком один другой живой враг получает дополнительный урон: 20% физической силы, умноженной на силу этого навыка.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-leap-body") return;
          const u = b.enemy.currentHp <= 0 && next(b);
          if (u) {
            at(b, u, () => procDamage(
              b,
              b.hero.physicalDamage * getSkillPower(c.skill, b.hero) * 0.2,
              "Рез приземления"
            ));
          }
        }
      }
    }
  ]);

  // Удар из тени: награда за полный запас, темп скрытого выпада, боковой след отражения.
  defineSkillMastery("assassin-shadow-strike", [
    {
      id: "fourth_outline",
      name: "Лишний силуэт",
      description: "Если перед попаданием у тебя уже 3 тени, ты получаешь щит на 2 хода величиной 3% твоего здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (direct(c) && shades(b) === 3) s.full = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (s.full) shield(b, 0.03);
          s.full = false;
        }
      }
    },
    {
      id: "silent_entry",
      name: "Тихий вход",
      description: "При попадании из настоящей скрытности выпад занимает на 15% меньше времени. Работает с обеими формами.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (direct(c)) s.cover = hidden(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (direct(c) && s.cover) s.fast = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (s.fast) faster(c);
          s.fast = s.cover = false;
        }
      }
    },
    {
      id: "slant_shade",
      name: "Косая тень",
      description: "Если при попадании у тебя есть тень, один другой враг получает дополнительный урон: 25% физической силы. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          if (direct(c) && shades(b) > 0) s.struck = b.enemy;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-shadow-strike") return;
          const u = s.struck && next(b, s.struck);
          s.struck = null;
          if (u) {
            at(b, u, () => procDamage(
              b, b.hero.physicalDamage * 0.25, "Косая тень", "dark"
            ));
          }
        }
      }
    }
  ]);

  // Исчезновение: дольше уклоняться, окупить первый уход от удара, заслонить полный строй теней.
  defineSkillMastery("assassin-vanish", [
    {
      id: "fading_outline",
      name: "Тающее очертание",
      description: "Ты продлеваешь имеющееся уклонение после исчезновения на 1 ход, до 8 оставшихся ходов.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-vanish") return;
          extend(b.hero, "evasion");
        }
      }
    },
    {
      id: "empty_grasp",
      name: "Пустая хватка",
      description: "Первое уклонение после исчезновения возвращает 7 энергии. Подготовка исчезает в начале твоего следующего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-vanish") return;
          s.ready = true;
        },
        dodged(b, s) {
          if (!s.ready) return;
          s.ready = false;
          energy(b, 7);
        },
        turnStart(b, s) {
          if (!s.ready) return;
          s.ready = false;
        }
      }
    },
    {
      id: "crowded_mist",
      name: "Тесный туман",
      description: "Если после исчезновения у тебя 3 тени, выбранный враг получает ослепление 10 на 2 хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-vanish") return;
          if (shades(b) === 3) fx(b, "blind", 2, 10);
        }
      }
    }
  ]);

  // Порез отражения: усилить полный строй, окупить порез, скрыть движение клинка.
  defineSkillMastery("assassin-mirror-nick", [
    {
      id: "aligned_edges",
      name: "Совпавшие лезвия",
      description: "При 3 тенях прямые попадания пореза сильнее ещё на 15%. Тени сохраняются.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-mirror-nick") return;
          if (direct(c) && shades(b) === 3) c.mult *= 1.15;
        }
      }
    },
    {
      id: "borrowed_motion",
      name: "Заёмное движение",
      description: "Если порез попадает при 3 тенях, ты возвращаешь 4 энергии. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-mirror-nick") return;
          if (direct(c) && shades(b) === 3) s.ready = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-mirror-nick") return;
          if (s.ready) energy(b, 4);
          s.ready = false;
        }
      }
    },
    {
      id: "false_edge",
      name: "Ложное лезвие",
      description: "При попадании с хотя бы 1 тенью выжившая цель получает ослепление 10 на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-mirror-nick") return;
          if (shades(b) > 0) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-mirror-nick") return;
          living(take(s)).forEach(r =>
            at(b, r.unit, () => fx(b, "blind", 2, 10))
          );
        }
      }
    }
  ]);

  // Разбить отражение: провести осколок через броню, оставить защитный след, ослабить ответ.
  defineSkillMastery("assassin-break-mirror", [
    {
      id: "glass_needle",
      name: "Стеклянная игла",
      description: "Если перед ударом есть хотя бы 1 тень, прямые попадания игнорируют дополнительно 20% брони.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-break-mirror") return;
          if (direct(c) && shades(b) > 0) c.pierce += 0.2;
        }
      }
    },
    {
      id: "protective_shard",
      name: "Защитный осколок",
      description: "Попадание при наличии тени оставляет щит на 2 хода величиной 3% твоего здоровья. Расход тени прежний.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-break-mirror") return;
          if (direct(c) && shades(b) > 0) s.ready = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-break-mirror") return;
          if (s.ready) shield(b, 0.03);
          s.ready = false;
        }
      }
    },
    {
      id: "splintered_grip",
      name: "Осколки в хватке",
      description: "Если удар попадает при 3 тенях, выжившая цель получает слабость 15% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-break-mirror") return;
          if (shades(b) === 3) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-break-mirror") return;
          living(take(s)).forEach(r =>
            at(b, r.unit, () => fx(b, "weaken", 2, 0.15))
          );
        }
      }
    }
  ]);

  // Свести отражения: пробить броню строем, вернуть тень убийством, ослепить свидетелей.
  defineSkillMastery("assassin-converge-mirrors", [
    {
      id: "single_point",
      name: "Одна точка",
      description: "Каждая имеющаяся тень даёт прямым попаданиям сведения ещё 8% пробивания брони, до 24%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-converge-mirrors") return;
          if (direct(c)) c.pierce += Math.min(3, shades(b)) * 0.08;
        }
      }
    },
    {
      id: "surviving_image",
      name: "Уцелевший образ",
      description: "Если сведение убивает выбранную цель при запасе от 2 теней, после расхода ты создаёшь 1 новую тень.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-converge-mirrors") return;
          if (direct(c)) s.stock = Math.max(s.stock || 0, shades(b));
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-converge-mirrors") return;
          if (s.stock >= 2 && b.enemy.currentHp <= 0) {
            bumpGauge(b, "phantom", 1, 3);
          }
          s.stock = 0;
        }
      }
    },
    {
      id: "dazzling_merge",
      name: "Ослепительное слияние",
      description: "Попадание при запасе от 2 теней ослепляет остальных живых врагов на 10 на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-converge-mirrors") return;
          if (direct(c) && shades(b) >= 2) s.target = b.enemy;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-converge-mirrors") return;
          if (s.target) {
            livingFoes(b).filter(u => u !== s.target).forEach(u =>
              at(b, u, () => fx(b, "blind", 2, 10))
            );
          }
          s.target = null;
        }
      }
    }
  ]);

  // Тени вразброс: сильнее боковые удары, быстрее широкий выпад, помеха от полного строя.
  defineSkillMastery("assassin-scattered-shades", [
    {
      id: "wide_silhouettes",
      name: "Широкие силуэты",
      description: "При наличии тени прямые попадания по второстепенным целям сильнее на 20%. Выбранная цель не получает этой прибавки.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-scattered-shades") return;
          if (direct(c) && shades(b) > 0 &&
              b.focus != null && b.enemy.slot !== b.focus) {
            c.mult *= 1.2;
          }
        }
      }
    },
    {
      id: "scattered_step",
      name: "Расходящийся шаг",
      description: "Если навык попадает хотя бы по 2 разным врагам, ты выполняешь его на 15% быстрее.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-scattered-shades") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-scattered-shades") return;
          if (take(s).length >= 2) faster(c);
        }
      }
    },
    {
      id: "tangled_sight",
      name: "Путаница силуэтов",
      description: "При попадании с 3 тенями задетые выжившие враги получают ослепление 8 на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-scattered-shades") return;
          if (shades(b) === 3) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-scattered-shades") return;
          living(take(s)).forEach(r =>
            at(b, r.unit, () => fx(b, "blind", 2, 8))
          );
        }
      }
    }
  ]);

  // Чёрный флакон: стойкость яда или кислоты, повтор по подготовленной броне, возврат за выдержку.
  defineSkillMastery("assassin-black-vial", [
    {
      id: "clinging_mix",
      name: "Цепкая смесь",
      description: "Яд флакона или надлом кислой формы после попадания держится на 1 ход дольше, до 8 оставшихся ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-black-vial") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-black-vial") return;
          for (const r of living(take(s))) {
            for (const id of ["poison", "armor_break"]) {
              if (c.skill.appliedEffects?.some(e => e.id === id)) {
                extend(r.unit, id);
              }
            }
          }
        }
      }
    },
    {
      id: "eaten_shell",
      name: "Разъеденная оболочка",
      description: "Если цель уже отравлена или под надломом, прямое попадание флакона игнорирует дополнительно 20% брони.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-black-vial") return;
          if (direct(c) &&
              (getEffect(b.enemy, "poison") || getEffect(b.enemy, "armor_break"))) {
            c.pierce += 0.2;
          }
        }
      }
    },
    {
      id: "return_sample",
      name: "Обратная проба",
      description: "Первый ход врага, сохранившего яд или надлом после попадания флакона, возвращает тебе 6 энергии. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-black-vial") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-black-vial") return;
          s.watches = living(take(s)).flatMap(r =>
            ["poison", "armor_break"]
              .filter(id => c.skill.appliedEffects?.some(e => e.id === id))
              .map(id => watch(r.unit, id))
              .filter(Boolean)
          );
        },
        enemyTurn(b, s) {
          if (!s.watches?.some(w => matches(b, w, w.id))) return;
          s.watches = [];
          energy(b, 6);
        }
      }
    }
  ]);

  // Сухой надрез: глубже использовать разъедание, открыть надлом, ускориться по зрелому яду.
  defineSkillMastery("assassin-dry-incision", [
    {
      id: "rust_channel",
      name: "Русло коррозии",
      description: "К добавке надреза прибавляется ещё 1,5 единицы урона за единицу разъедания брони, до 30% физической силы.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          if (direct(c)) {
            c.flat += Math.min(
              b.hero.physicalDamage * 0.3,
              Math.max(0, Number(b.enemy.defShred || 0)) * 1.5
            );
          }
        }
      }
    },
    {
      id: "peeling_armor",
      name: "Снятая скорлупа",
      description: "Попадание по цели с разъеданием брони от 4 единиц накладывает надлом 10% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          if (Number(b.enemy.defShred || 0) >= 4) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          living(take(s)).forEach(r =>
            at(b, r.unit, () => fx(b, "armor_break", 2, 0.1))
          );
        }
      }
    },
    {
      id: "read_corrosion",
      name: "Прочитать коррозию",
      description: "Если надрез попадает по цели, чей текущий яд пережил хотя бы 2 тика, действие занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          if (direct(c)) s.aged = aged(b.enemy, "poison") >= 2;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          if (direct(c) && s.aged) s.fast = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-dry-incision") return;
          if (s.fast) faster(c);
          s.aged = s.fast = false;
        }
      }
    }
  ]);

  // Вскрытие раны: выплата длинной дозы, окупаемая выдержка, слабый выплеск в соседнюю цель.
  defineSkillMastery("assassin-lance-wound", [
    {
      id: "deep_reserve",
      name: "Глубокий запас",
      description: "Если у яда осталось хотя бы 3 конечных хода и цель выжила, вскрытие наносит ещё 15% обычной расчётной выплаты. Яд сохраняется.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lance-wound") return;
          const e = getEffect(b.enemy, "poison");
          if (b.enemy.currentHp > 0 && e &&
              Number.isFinite(e.duration) && e.duration >= 3) {
            procDamage(
              b,
              e.value * e.duration * (1 + tm(b.hero, "lanceBonus")) * 0.15,
              "Глубокий запас",
              "poison"
            );
          }
        }
      }
    },
    {
      id: "mature_extraction",
      name: "Зрелое вскрытие",
      description: "Если текущий яд пережил хотя бы 2 тика, вскрытие возвращает 8 энергии.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lance-wound") return;
          if (aged(b.enemy, "poison") >= 2) energy(b, 8);
        }
      }
    },
    {
      id: "venom_spurt",
      name: "Ядовитый выплеск",
      description: "После вскрытия один другой враг без яда получает яд на 2 хода с силой 20% текущей дозы вскрытой цели.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-lance-wound") return;
          const e = getEffect(b.enemy, "poison");
          if (e) seed(b, b.enemy, "poison", e.value * 0.2);
        }
      }
    }
  ]);

  // Настаивать: увеличить выдержку, быстро работать со зрелой дозой, отделить новую пробу.
  defineSkillMastery("assassin-steep-dose", [
    {
      id: "last_drop",
      name: "Последняя капля",
      description: "После попадания ты продлеваешь имеющийся яд ещё на 1 ход сверх обычного продления, до 7 оставшихся ходов. Рост тиков сохраняется.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          living(take(s)).forEach(r => extend(r.unit, "poison", 1, 7));
        }
      }
    },
    {
      id: "settled_hand",
      name: "Выверенная выдержка",
      description: "Если попадание приходится по яду, пережившему хотя бы 2 тика, настаивание занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (direct(c)) s.aged = aged(b.enemy, "poison") >= 2;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (direct(c) && s.aged) s.fast = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (s.fast) faster(c);
          s.aged = s.fast = false;
        }
      }
    },
    {
      id: "spare_sample",
      name: "Запасная проба",
      description: "Если до попадания у яда осталось хотя бы 4 конечных хода, один другой враг без яда получает дозу на 2 хода по 10% физической силы.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (!direct(c)) return;
          const e = getEffect(b.enemy, "poison");
          s.long = Boolean(e && Number.isFinite(e.duration) && e.duration >= 4);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (direct(c) && s.long) s.target = b.enemy;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-steep-dose") return;
          if (s.target) {
            seed(b, s.target, "poison", b.hero.physicalDamage * 0.1);
          }
          s.target = null;
          s.long = false;
        }
      }
    }
  ]);

  // Вирулентность: удар по зрелой дозе, сохранение токсина, энергия за глубокую коррозию.
  defineSkillMastery("assassin-virulence", [
    {
      id: "ripe_toxin",
      name: "Созревший токсин",
      description: "Прямые попадания вирулентности сильнее на 15%, если текущий яд цели пережил хотя бы 2 тика.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-virulence") return;
          if (direct(c) && aged(b.enemy, "poison") >= 2) c.mult *= 1.15;
        }
      }
    },
    {
      id: "tenacious_strain",
      name: "Живучий штамм",
      description: "После попадания по выжившей цели ты продлеваешь её имеющийся яд на 1 ход, до 6 оставшихся ходов, сохраняя рост тиков.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-virulence") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-virulence") return;
          living(take(s)).forEach(r => extend(r.unit, "poison", 1, 6));
        }
      }
    },
    {
      id: "corrosion_yield",
      name: "Выход коррозии",
      description: "Попадание по отравленной цели с разъеданием брони от 4 единиц возвращает 9 энергии. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-virulence") return;
          if (direct(c) && getEffect(b.enemy, "poison") &&
              Number(b.enemy.defShred || 0) >= 4) {
            s.ready = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-virulence") return;
          if (s.ready) energy(b, 9);
          s.ready = false;
        }
      }
    }
  ]);

  // Слить осадок: окупить последние тики, укрыть полное здоровье, перелить слабый остаток.
  defineSkillMastery("assassin-drain-sediment", [
    {
      id: "clean_drain",
      name: "Чистый слив",
      description: "Попадание, снимающее яд с остатком не больше 2 ходов, возвращает 9 энергии.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (direct(c)) {
            const e = getEffect(b.enemy, "poison");
            s.short = Boolean(e && e.value > 0 && e.duration <= 2);
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (direct(c) && s.short) s.ready = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (s.ready) energy(b, 9);
          s.ready = s.short = false;
        }
      }
    },
    {
      id: "sealed_vessel",
      name: "Запечатанный сосуд",
      description: "Если слив снимает яд и после лечения у тебя полное здоровье, ты получаешь щит на 2 хода величиной 2% твоего здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (direct(c) && effectValue(b.enemy, "poison") > 0) s.drain = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (s.drain && b.hero.currentHp >= b.hero.maxHp) shield(b, 0.02);
          s.drain = false;
        }
      }
    },
    {
      id: "sediment_transfer",
      name: "Перелить осадок",
      description: "После попадания, снимающего яд, один другой враг без яда получает дозу на 2 хода с силой 25% снятой дозы.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (direct(c)) s.dose = effectValue(b.enemy, "poison");
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (direct(c) && s.dose > 0) {
            s.target = b.enemy;
            s.value = s.dose;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-drain-sediment") return;
          if (s.target) seed(b, s.target, "poison", s.value * 0.25);
          s.target = null;
          s.dose = s.value = 0;
        }
      }
    }
  ]);

  // Касание чумы: дольше слабость, удар по уже больной цели, заражение от первой дозы любой формы.
  defineSkillMastery("assassin-plague-touch", [
    {
      id: "lingering_malaise",
      name: "Тягучее недомогание",
      description: "После попадания слабость касания держится на 1 ход дольше, до 8 оставшихся ходов. Работает со всеми формами.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-plague-touch") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-plague-touch") return;
          living(take(s)).forEach(r => extend(r.unit, "weaken"));
        }
      }
    },
    {
      id: "familiar_sickness",
      name: "Знакомая хворь",
      description: "Если до попадания цель уже отравлена или кровоточит, прямое попадание касания сильнее на 15%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-plague-touch") return;
          if (direct(c) &&
              (getEffect(b.enemy, "poison") || getEffect(b.enemy, "bleed"))) {
            c.mult *= 1.15;
          }
        }
      }
    },
    {
      id: "first_chill",
      name: "Первый озноб",
      description: "Первый тик яда или раны, сохранившихся после касания, даёт ещё 1 заражение до начала чумы. Один раз за применение; чума при пяти начинается на следующем тике.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-plague-touch") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-plague-touch") return;
          s.watches = diseaseWatches(take(s));
        },
        tick(b, s, c) {
          if (!s.watches?.some(w => matches(b, w, c.id))) return;
          s.watches = [];
          if (!plague(b)) bumpGauge(b, "plaguebearer", 1, 5);
        }
      }
    }
  ]);

  // Гниющая рана: удержать рану в яде, быстро связать две беды, вынести гниль к соседу.
  defineSkillMastery("assassin-festering-wound", [
    {
      id: "poisoned_edges",
      name: "Отравленные края",
      description: "Если после попадания выжившая цель отравлена, её имеющаяся рана держится на 1 ход дольше, до 8 оставшихся ходов.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          living(take(s)).forEach(r => {
            if (getEffect(r.unit, "poison")) extend(r.unit, "bleed");
          });
        }
      }
    },
    {
      id: "familiar_lesion",
      name: "Знакомый очаг",
      description: "Если до попадания на цели уже есть яд и рана, гниющая рана занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          if (direct(c)) {
            s.both = Boolean(
              getEffect(b.enemy, "poison") && getEffect(b.enemy, "bleed")
            );
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          if (direct(c) && s.both) s.fast = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          if (s.fast) faster(c);
          s.fast = s.both = false;
        }
      }
    },
    {
      id: "rotting_splinter",
      name: "Гнилой осколок",
      description: "После попадания по выжившей отравленной цели с раной ты ранишь одного другого врага без раны: 2 хода с силой 25% текущей раны.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-festering-wound") return;
          const r = living(take(s)).find(r =>
            getEffect(r.unit, "poison") && getEffect(r.unit, "bleed")
          );
          if (r) {
            seed(b, r.unit, "bleed", effectValue(r.unit, "bleed") * 0.25);
          }
        }
      }
    }
  ]);

  // Заражённый круг: слабость от двух бед, экономный охват, защитная награда за пару тиков.
  defineSkillMastery("assassin-infected-circle", [
    {
      id: "feeble_circle",
      name: "Круг бессилия",
      description: "Задетые выжившие враги, на которых после круга есть и яд, и рана, получают слабость 10% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          living(take(s)).forEach(r => {
            if (getEffect(r.unit, "poison") && getEffect(r.unit, "bleed")) {
              at(b, r.unit, () => fx(b, "weaken", 2, 0.1));
            }
          });
        }
      }
    },
    {
      id: "shared_burden",
      name: "Общая ноша",
      description: "Если круг попадает хотя бы по 2 разным врагам, ты возвращаешь 11 энергии.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          if (take(s).length >= 2) energy(b, 11);
        }
      }
    },
    {
      id: "paired_fever",
      name: "Парная лихорадка",
      description: "Когда один из задетых врагов получит после круга по тику сохранившихся яда и раны, ты получишь щит на 2 хода величиной 3% здоровья. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-infected-circle") return;
          s.pairs = living(take(s)).map(r => ({
            poison: watch(r.unit, "poison"),
            bleed: watch(r.unit, "bleed"),
            seen: new Set()
          })).filter(p => p.poison && p.bleed);
        },
        tick(b, s, c) {
          if (!s.pairs?.length || !["poison", "bleed"].includes(c.id)) return;
          const p = s.pairs.find(p =>
            matches(b, p.poison, "poison") && matches(b, p.bleed, "bleed")
          );
          if (!p) return;
          p.seen.add(c.id);
          if (p.seen.size === 2) {
            s.pairs = [];
            shield(b, 0.03);
          }
        }
      }
    }
  ]);

  // Переболеть: быстрее собрать заражение, пережить ответ в чуме, пробить двойной очаг.
  defineSkillMastery("assassin-live-through", [
    {
      id: "second_chill",
      name: "Второй озноб",
      description: "До начала чумы попадание даёт ещё 1 заражение сверх обычного, до 5. Чума при пяти начинается на следующем тике.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-live-through") return;
          if (direct(c) && !plague(b)) s.ready = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-live-through") return;
          if (s.ready && !plague(b)) bumpGauge(b, "plaguebearer", 1, 5);
          s.ready = false;
        }
      }
    },
    {
      id: "fever_respite",
      name: "Передышка в жару",
      description: "После попадания во время чумы следующий входящий удар наносит тебе на 20% меньше урона. Подготовка исчезает в начале твоего следующего хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-live-through") return;
          if (direct(c) && plague(b)) s.landed = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-live-through") return;
          s.ready = Boolean(s.landed);
          s.landed = false;
        },
        incoming(b, s, c) {
          if (!s.ready) return;
          s.ready = false;
          c.amount *= 0.8;
        },
        turnStart(b, s) {
          if (!s.ready) return;
          s.ready = false;
        }
      }
    },
    {
      id: "fever_crack",
      name: "Лихорадочная трещина",
      description: "Во время чумы прямые попадания игнорируют ещё 25% брони цели, если на ней одновременно есть яд и рана.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "assassin-live-through") return;
          if (direct(c) && plague(b) &&
              getEffect(b.enemy, "poison") && getEffect(b.enemy, "bleed")) {
            c.pierce += 0.25;
          }
        }
      }
    }
  ]);

  // Носитель: удержать короткую беду, окупить чумной тик, вынести дозу за пределы очага.
  defineSkillMastery("assassin-carrier", [
    {
      id: "balanced_focus",
      name: "Ровный очаг",
      description: "Во время чумы после попадания ты продлеваешь более короткий из имеющихся яда и раны на 1 ход, до 8. При равном остатке продлевается яд.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          const rows = living(take(s));
          if (!plague(b)) return;
          for (const r of rows) {
            const p = getEffect(r.unit, "poison");
            const w = getEffect(r.unit, "bleed");
            if (p && w) {
              extend(r.unit, p.duration <= w.duration ? "poison" : "bleed");
            }
          }
        }
      }
    },
    {
      id: "fever_yield",
      name: "Чумной сбор",
      description: "Во время чумы первый тик яда или раны, сохранившихся после попадания носителя, возвращает 12 энергии. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          const rows = take(s);
          s.watches = plague(b) ? diseaseWatches(rows) : [];
        },
        tick(b, s, c) {
          if (!s.watches?.some(w => matches(b, w, c.id))) return;
          s.watches = [];
          if (plague(b)) energy(b, 12);
        }
      }
    },
    {
      id: "wandering_strain",
      name: "Бродячий штамм",
      description: "Во время чумы после попадания по выжившей цели с ядом и раной один другой враг без яда получает дозу на 2 хода с силой 25% текущего яда.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-carrier") return;
          const rows = living(take(s));
          if (!plague(b)) return;
          const r = rows.find(r =>
            getEffect(r.unit, "poison") && getEffect(r.unit, "bleed")
          );
          if (r) {
            seed(b, r.unit, "poison", effectValue(r.unit, "poison") * 0.25);
          }
        }
      }
    }
  ]);

  // Сбросить лихорадку: удержать щит, смягчить удар в него, начать новый цикл заражения.
  defineSkillMastery("assassin-break-fever", [
    {
      id: "cooling_shell",
      name: "Остывающая оболочка",
      description: "После сброса твой имеющийся щит держится на 1 ход дольше, до 8 оставшихся ходов.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-break-fever") return;
          extend(b.hero, "shield");
        }
      }
    },
    {
      id: "soft_landing",
      name: "Мягкое приземление",
      description: "Первый входящий удар по сохранившемуся щиту после сброса наносит тебе на 20% меньше урона. Обновление щита снимает подготовку.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-break-fever") return;
          s.guard = watch(b.hero, "shield");
        },
        incoming(b, s, c) {
          if (!s.guard ||
              getEffect(b.hero, "shield") !== s.guard.effect ||
              s.guard.effect.meta !== s.guard.meta) return;
          s.guard = null;
          c.amount *= 0.8;
        }
      }
    },
    {
      id: "latent_chill",
      name: "Скрытый озноб",
      description: "Первый тик яда или раны, сохранившихся у врагов после сброса, даёт ещё 1 заражение до новой чумы. Один раз за применение; чума при пяти начинается на следующем тике.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "assassin-break-fever") return;
          s.watches = diseaseWatches(
            livingFoes(b).map(unit => ({ unit }))
          );
        },
        tick(b, s, c) {
          if (!s.watches?.some(w => matches(b, w, c.id))) return;
          s.watches = [];
          if (!plague(b)) bumpGauge(b, "plaguebearer", 1, 5);
        }
      }
    }
  ]);
})();

