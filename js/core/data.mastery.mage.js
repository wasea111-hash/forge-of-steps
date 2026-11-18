// Mastery of the mage skills: at level V each skill offers three upgrades of its own (designed with Codex).
(() => {
  const heat = b => Number(coreState(b)?.value || 0);
  const resonance = b => Number(b.mech?.elemental?.value || 0);
  const army = b => (b.hero.summonedUnits || []).filter(u => u.hp > 0);
  const cool = (b, n) => {
    const core = coreState(b);
    const used = Math.min(heat(b), Math.max(0, n));
    if (core) core.value -= used;
    return used;
  };
  const snapshot = b => ({
    heat: heat(b),
    resonance: resonance(b),
    units: army(b).slice(),
    shield: effectValue(b.hero, "shield"),
    side: b.mech?.light_dark?.side
  });
  const prepareWith = (skill, fn) => function (b, current) {
    const before = snapshot(b);
    const plan = skill.prepare?.call(this, b, current) || {};
    return { ...plan, ...(fn(b, current, plan, before) || {}) };
  };
  const resolveWith = (skill, fn) => function (b, current, plan) {
    const before = snapshot(b);
    skill.resolve?.call(this, b, current, plan);
    fn(b, current, plan || {}, before);
  };
  const withTarget = (b, target, fn) => {
    const previous = b.enemy;
    const focus = b.focus;
    try {
      b.enemy = target;
      return fn();
    } finally {
      b.enemy = previous;
      b.focus = focus;
    }
  };
  const gainShield = (b, amount) => {
    if (!(amount > 0)) return;
    const old = effectValue(b.hero, "shield");
    const cap = Math.max(old, Math.round(b.hero.maxHp * 0.6));
    const e = getEffect(b.hero, "shield");
    if (e) {
      e.value = Math.min(cap, old + Math.round(amount));
      e.duration = Math.max(e.duration, 2);
    } else {
      const added = fx(b, "shield", 2, Math.round(amount), { self: true });
      if (added) added.value = Math.min(cap, added.value);
    }
  };
  const prolong = (u, id, n = 1) => {
    const e = getEffect(u, id);
    if (e) e.duration += n;
  };
  const refund = (b, skill, fraction) => procMana(
    b,
    getSkillResourceCost(skill, b.hero) * fraction / Math.max(1, b.hero.maxMana)
  );
  const healSummon = (u, fraction) => {
    u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * fraction));
  };
  const newest = (b, config) => army(b).filter(
    u => u.type === config?.type && u.role === config?.role && !u.persistent
  ).slice(-1)[0];
  const summonPatch = (s, field, factor) => ({
    summonUnitConfig: {
      ...s.summonUnitConfig,
      [field]: {
        ...s.summonUnitConfig[field],
        multiplier: s.summonUnitConfig[field].multiplier * factor
      }
    }
  });
  const remember = (s, target) => {
    (s.targets ||= new Set()).add(target);
  };
  const drainTargets = s => {
    const result = [...(s.targets || [])];
    s.targets = new Set();
    return result;
  };
  const shard = (b, amount, label) => {
    const other = livingFoes(b).find(u => u !== b.enemy);
    if (other && amount > 0) {
      withTarget(b, other, () => procDamage(b, amount, label, "arcane"));
    }
  };

  // Луч эфира: горячее пробивание, возврат за добивание, осколок во вторую цель.
  defineSkillMastery("mage-ether-beam", [
    {
      id: "hot_thread",
      name: "Горячая нить",
      description: "При 45 жара и выше луч пробивает ещё 15% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam") return;
          if (!c.proc && heat(b) >= 45) c.pierce += 0.15;
        }
      }
    },
    {
      id: "last_letter",
      name: "Последняя буква",
      description: "Добивание лучом возвращает ману в размере 20% его текущей цены, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam") return;
          if (!c.proc && !s.paid && b.enemy.currentHp <= 0) {
            s.paid = true;
            refund(b, c.skill, 0.2);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam") return;
          s.paid = false;
        }
      }
    },
    {
      id: "split_ray",
      name: "Осколок луча",
      description: "Первое попадание лучом наносит другому врагу дополнительный урон: 15% урона здоровью основной цели.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam") return;
          if (c.proc || s.sent) return;
          s.sent = true;
          shard(b, c.hpDamage * 0.15, "Осколок луча");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ether-beam") return;
          s.sent = false;
        }
      }
    }
  ]);

  // Стынущая искра: глубина охлаждения, мана за теплосъём, защитный конденсат.
  defineSkillMastery("mage-cooling-spark", [
    {
      id: "deep_cooling",
      name: "Холодный корешок",
      description: "После искры ты отводишь ещё до 4 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, b => cool(b, 4))
      })
    },
    {
      id: "cold_ink",
      name: "Холодные чернила",
      description: "Если искра отвела не меньше 18 жара, ты возвращаешь 2% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 18) procMana(b, 0.02);
        })
      })
    },
    {
      id: "condensate",
      name: "Конденсат",
      description: "Если искра отвела не меньше 18 жара, ты получаешь щит на 2% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 18) gainShield(b, b.hero.maxHp * 0.02);
        })
      })
    }
  ]);

  // Печать жара: стойкость метки, повторное продавливание, перенос после гибели.
  defineSkillMastery("mage-heat-seal", [
    {
      id: "deep_stamp",
      name: "Глубокий оттиск",
      description: "Попадание печатью продлевает имеющуюся метку цели на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-heat-seal") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-heat-seal") return;
          drainTargets(s).forEach(u => prolong(u, "mark"));
        }
      }
    },
    {
      id: "overprint",
      name: "Повторный оттиск",
      description: "Если перед ударом на цели уже есть метка, печать бьёт на 16% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-heat-seal") return;
          if (!c.proc && getEffect(b.enemy, "mark")) c.mult *= 1.16;
        }
      }
    },
    {
      id: "inherit_stamp",
      name: "Наследие печати",
      description: "После применения смерть выбранной цели под меткой переносит слабую метку на другого врага: +8% входящего урона на 1 ход. Один перенос за применение.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-heat-seal") return;
          s.target = b.enemy;
          s.armed = true;
        },
        foeDown(b, s, c) {
          if (!s.armed || c.foe !== s.target) return;
          s.armed = false;
          if (!getEffect(c.foe, "mark")) return;
          const next = livingFoes(b)[0];
          if (next) withTarget(b, next, () => fx(b, "mark", 1, 0.08));
        }
      }
    }
  ]);

  // Веер из тома: края веера, охлаждение за охват, поддержка горения.
  defineSkillMastery("mage-book-fan", [
    {
      id: "wide_pages",
      name: "Широкие страницы",
      description: "Побочные попадания веера бьют на 20% сильнее; удар по выбранной цели сохраняет свою силу.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-book-fan") return;
          if (!c.proc && b.focus != null && b.enemy.slot !== b.focus) c.mult *= 1.2;
        }
      }
    },
    {
      id: "crossdraft",
      name: "Сквозняк",
      description: "Если веер попал хотя бы по двум разным врагам, после применения ты отводишь до 6 жара.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-book-fan") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-book-fan") return;
          if (drainTargets(s).length >= 2) cool(b, 6);
        }
      }
    },
    {
      id: "ember_fan",
      name: "Раздуть угли",
      description: "На каждой задетой цели веер продлевает уже имеющееся горение на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-book-fan") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-book-fan") return;
          drainTargets(s).forEach(u => prolong(u, "burn"));
        }
      }
    }
  ]);

  // Закалка эфира: холодный пробой, защитная обложка, темп холодного старта.
  defineSkillMastery("mage-ether-temper", [
    {
      id: "cold_edge",
      name: "Холодная грань",
      description: "При жаре не выше 20 закалка пробивает ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-temper") return;
          if (!c.proc && heat(b) <= 20) c.pierce += 0.2;
        }
      }
    },
    {
      id: "annealed_cover",
      name: "Закалённая обложка",
      description: "Если ты применяешь закалку при жаре не выше 20, получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat <= 20) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    },
    {
      id: "cold_rhythm",
      name: "Ритм закалки",
      description: "При жаре не выше 20 применение закалки занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-ether-temper") return;
          if (!c.proc && !s.seen) {
            s.seen = true;
            s.cold = heat(b) <= 20;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ether-temper") return;
          if (s.cold) c.tempo *= 0.85;
          s.cold = false;
          s.seen = false;
        }
      }
    }
  ]);

  // Статический захват: тяжёлый ответ, боковая дуга, возврат удержанного заряда.
  defineSkillMastery("mage-static-clasp", [
    {
      id: "heavy_ground",
      name: "Заземлить замах",
      description: "После захвата следующий тяжёлый удар выбранной цели по тебе слабее на 18%. Защита действует до твоего следующего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-static-clasp") return;
          s.target = b.enemy;
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || b.enemy !== s.target || !c.heavy || c.parried) return;
          s.armed = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    },
    {
      id: "stored_arc",
      name: "Остаточная дуга",
      description: "Если захват разрядил шок, первое такое попадание наносит другому врагу 18% урона здоровью цели.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-static-clasp") return;
          if (c.proc || !c.shockUsed || s.sent) return;
          s.sent = true;
          shard(b, c.hpDamage * 0.18, "Остаточная дуга");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-static-clasp") return;
          s.sent = false;
        }
      }
    },
    {
      id: "held_charge",
      name: "Удержанный заряд",
      description: "Если после захвата на выбранной цели есть оглушение, ошеломление или шок, ты возвращаешь 3% максимальной маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-static-clasp") return;
          if (["stun", "stagger", "shock"].some(id => getEffect(b.enemy, id))) {
            procMana(b, 0.03);
          }
        }
      }
    }
  ]);

  // Раскалённый том: награда порога, поддержка горения, защита горячей серии.
  defineSkillMastery("mage-heated-tome", [
    {
      id: "threshold",
      name: "Порог полудня",
      description: "Если дополнительный нагрев тома поднимает жар с уровня ниже 45 до 45 или выше, ты возвращаешь 3% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat < 45 && heat(b) >= 45) procMana(b, 0.03);
        })
      })
    },
    {
      id: "living_coal",
      name: "Живая закладка",
      description: "Попадание томом продлевает уже имеющееся горение цели на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-heated-tome") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-heated-tome") return;
          drainTargets(s).forEach(u => prolong(u, "burn"));
        }
      }
    },
    {
      id: "hot_cover",
      name: "Жаркая обложка",
      description: "При применении тома с 45–75 жара ты получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat >= 45 && before.heat <= 75) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    }
  ]);

  // Теплосъём: глубина отвода, защитный конденсат, темп полного слива.
  defineSkillMastery("mage-heat-siphon", [
    {
      id: "deep_siphon",
      name: "Глубокий сток",
      description: "Теплосъём отводит ещё до 5 жара; каждая дополнительно отведённая единица возвращает 0,3% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, b => procMana(b, cool(b, 5) * 0.003))
      })
    },
    {
      id: "siphon_shell",
      name: "Тёплый конденсат",
      description: "Если основной теплосъём отвёл не меньше 25 жара, ты получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 25) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    },
    {
      id: "swift_drain",
      name: "Быстрый слив",
      description: "При 30 жара и выше применение теплосъёма занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-heat-siphon") return;
          if (!c.proc && !s.seen) {
            s.seen = true;
            s.full = heat(b) >= 30;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-heat-siphon") return;
          if (s.full) c.tempo *= 0.85;
          s.full = false;
          s.seen = false;
        }
      }
    }
  ]);

  // Рунный затвор: длительность немоты, второй слой щита, контрудар поглощённым уроном.
  defineSkillMastery("mage-rune-shutter", [
    {
      id: "sealed_voice",
      name: "Запертый голос",
      description: "Попадание затвором продлевает имеющуюся немоту цели на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-rune-shutter") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rune-shutter") return;
          drainTargets(s).forEach(u => prolong(u, "silence"));
        }
      }
    },
    {
      id: "rune_layer",
      name: "Второй слой",
      description: "За каждую единицу жара перед первым ударом затвора сохранившийся щит пополняется на 0,05% максимального здоровья. Учитывается до 40 жара.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-rune-shutter") return;
          if (!c.proc && !s.seen) {
            s.seen = true;
            s.spent = Math.min(40, heat(b));
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rune-shutter") return;
          if (getEffect(b.hero, "shield")) {
            gainShield(b, (s.spent || 0) * b.hero.maxHp * 0.0005);
          }
          s.seen = false;
          s.spent = 0;
        }
      }
    },
    {
      id: "rebound_rune",
      name: "Обратная руна",
      description: "До твоего следующего хода первый удар по щиту после затвора возвращает врагу 20% поглощённого урона, не больше 4% твоего максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rune-shutter") return;
          s.armed = Boolean(getEffect(b.hero, "shield"));
        },
        hurt(b, s, c) {
          if (!s.armed || !(c.absorbed > 0)) return;
          s.armed = false;
          procDamage(
            b,
            Math.min(c.absorbed * 0.2, b.hero.maxHp * 0.04),
            "Обратная руна",
            "arcane"
          );
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    }
  ]);

  // Игла полудня: уязвимый шов, горячее раскрытие защиты, отвод жара после прокола.
  defineSkillMastery("mage-noon-needle", [
    {
      id: "open_seam",
      name: "Открытый шов",
      description: "По цели под надломом брони или открытой защитой игла бьёт на 16% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-noon-needle") return;
          if (!c.proc && ["armor_break", "exposed"].some(id => getEffect(b.enemy, id))) {
            c.mult *= 1.16;
          }
        }
      }
    },
    {
      id: "sun_puncture",
      name: "Солнечный прокол",
      description: "При применении иглы с 50 жара и выше выбранная цель получает открытую защиту: +6 к шансу крита по ней на 2 хода.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat >= 50) fx(b, "exposed", 2, 6);
        })
      })
    },
    {
      id: "venting_eye",
      name: "Ушко иглы",
      description: "Если перед применением иглы было не меньше 50 жара, после удара ты отводишь до 5 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat >= 50) cool(b, 5);
        })
      })
    }
  ]);

  // Резкий перепад: стойкость инея, темп холодного окна, осколок во вторую цель.
  defineSkillMastery("mage-thermal-drop", [
    {
      id: "lasting_rime",
      name: "Стойкий иней",
      description: "Попадание перепадом при жаре не выше 25 продлевает появившийся на цели иней на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          if (!c.proc && heat(b) <= 25) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          drainTargets(s).forEach(u => prolong(u, "frost"));
        }
      }
    },
    {
      id: "cold_step",
      name: "Холодный шаг",
      description: "При жаре не выше 25 применение перепада занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          if (!c.proc && !s.seen) {
            s.seen = true;
            s.cold = heat(b) <= 25;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          if (s.cold) c.tempo *= 0.85;
          s.cold = false;
          s.seen = false;
        }
      }
    },
    {
      id: "rime_shard",
      name: "Осколок перепада",
      description: "При жаре не выше 25 первое попадание перепадом наносит другому врагу 15% урона здоровью цели.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          if (c.proc || s.sent || heat(b) > 25) return;
          s.sent = true;
          shard(b, c.hpDamage * 0.15, "Осколок перепада");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thermal-drop") return;
          s.sent = false;
        }
      }
    }
  ]);

  // Запас в переплёте: плотность щита, мана при готовой защите, лечение под ударом.
  defineSkillMastery("mage-binding-reserve", [
    {
      id: "thick_binding",
      name: "Плотный переплёт",
      description: "Если после запаса у тебя есть щит, он пополняется ещё на 3% максимального здоровья, до общего предела 60%.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-binding-reserve") return;
          if (getEffect(b.hero, "shield")) gainShield(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "spare_margin",
      name: "Запас на полях",
      description: "Если перед созданием запаса у тебя уже был щит, ты возвращаешь ещё 3% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.shield > 0) procMana(b, 0.03);
        })
      })
    },
    {
      id: "soft_binding",
      name: "Мягкий переплёт",
      description: "До твоего следующего хода первый удар по щиту после запаса лечит тебя на 20% поглощённого урона, максимум на 3% максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-binding-reserve") return;
          s.armed = Boolean(getEffect(b.hero, "shield"));
        },
        hurt(b, s, c) {
          if (!s.armed || !(c.absorbed > 0)) return;
          s.armed = false;
          healUnit(
            b,
            b.hero,
            Math.min(c.absorbed * 0.2, b.hero.maxHp * 0.03),
            "Мягкий переплёт"
          );
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    }
  ]);

  // Красная строка: ширина рабочего окна, возврат за удержание, заряд продолжения.
  defineSkillMastery("mage-red-line", [
    {
      id: "wide_margin",
      name: "Широкое поле",
      description: "Красная строка отводит жар своей цены при 40–80 жара вместо 45–75.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          held: p.held || (before.heat >= 40 && before.heat <= 80)
        }))
      })
    },
    {
      id: "saved_ink",
      name: "Сбережённые чернила",
      description: "Если строка удержала жар своей цены, ты возвращаешь ману в размере 20% её текущей цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p) => {
          if (p.held) refund(b, skill, 0.2);
        })
      })
    },
    {
      id: "charged_line",
      name: "Заряженная строка",
      description: "Если строка удержала жар своей цены, на выбранной цели появляется шок: следующее попадание сильнее на 8%, заряд держится 2 хода.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p) => {
          if (p.held) fx(b, "shock", 2, 0.08);
        })
      })
    }
  ]);

  // Паровой круг: охлаждение, паровая завеса, сила внешнего кольца.
  defineSkillMastery("mage-steam-circle", [
    {
      id: "deep_steam",
      name: "Глубокий выдох",
      description: "Паровой круг отводит ещё до 6 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, b => cool(b, 6))
      })
    },
    {
      id: "steam_veil",
      name: "Паровая завеса",
      description: "Если круг отвёл не меньше 25 жара, выбранная цель получает ошеломление на 1 ход: её урон ниже на 12%.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 25) fx(b, "stagger", 1, 0.12);
        })
      })
    },
    {
      id: "outer_ring",
      name: "Внешнее кольцо",
      description: "Доля урона круга по остальным целям возрастает на 10 процентных пунктов, максимум до 100% силы основного удара.",
      patch: s => ({
        aoe: Math.max(
          Number(s.aoe || 0),
          Math.min(1, Number(s.aoe || 0) + 0.1)
        )
      })
    }
  ]);

  // Продавить печать: отдача полного расхода, возврат маны, трещина после пробоя.
  defineSkillMastery("mage-seal-press", [
    {
      id: "full_imprint",
      name: "Полный оттиск",
      description: "Если ты тратишь на продавливание 40 жара, итоговая сила удара возрастает ещё на 15%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => (
          before.heat >= 40 ? { scale: (p.scale ?? 1) * 1.15 } : {}
        ))
      })
    },
    {
      id: "seal_rebate",
      name: "Возврат чернил",
      description: "Расход 40 жара на продавливание возвращает 3% максимальной маны.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          if (before.heat >= 40) procMana(b, 0.03);
        })
      })
    },
    {
      id: "seal_crack",
      name: "Трещина печати",
      description: "После расхода 40 жара выбранная цель получает надлом брони на 2 хода: защита ниже на 10%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masterySpent: before.heat - heat(b)
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          if (p.masterySpent >= 40) fx(b, "armor_break", 2, 0.1);
        })
      })
    }
  ]);

  // Белый накал: ранний порог, глубокое охлаждение, брызги белого пламени.
  defineSkillMastery("mage-white-heat", [
    {
      id: "early_white",
      name: "Раннее побеление",
      description: "Особый бонус накала к силе в 12% начинает действовать с 45 жара вместо 55.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-white-heat") return;
          if (!c.proc && heat(b) >= 45 && heat(b) < 55) c.mult *= 1.12;
        }
      }
    },
    {
      id: "white_ash",
      name: "Белый пепел",
      description: "Если перед охлаждением было больше 35 жара, накал снижает жар до 30 вместо 35, затем добавляется жар цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat > 35) cool(b, 5);
        })
      })
    },
    {
      id: "white_splash",
      name: "Белые брызги",
      description: "При 55 жара и выше первое попадание накалом наносит другому врагу 15% урона здоровью цели.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-white-heat") return;
          if (c.proc || s.sent || heat(b) < 55) return;
          s.sent = true;
          shard(b, c.hpDamage * 0.15, "Белые брызги");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-white-heat") return;
          s.sent = false;
        }
      }
    }
  ]);

  // Нулевой всплеск: отдача сброшенного жара, защитный остаток, возврат за полный сброс.
  defineSkillMastery("mage-zero-burst", [
    {
      id: "zero_pressure",
      name: "Нулевое давление",
      description: "Каждая единица сброшенного жара усиливает итоговый удар ещё на 0,25%, максимум на 15%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          scale: (p.scale ?? 1) * (
            1 + Math.min(0.15, Math.max(0, before.heat - heat(b)) * 0.0025)
          )
        }))
      })
    },
    {
      id: "zero_shell",
      name: "Оболочка нуля",
      description: "За каждую единицу сброшенного жара ты получаешь щит на 0,05% максимального здоровья, максимум на 3%. Новый щит держится 2 хода.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          gainShield(
            b,
            b.hero.maxHp * Math.min(0.03, Math.max(0, before.heat - heat(b)) * 0.0005)
          );
        })
      })
    },
    {
      id: "zero_rebate",
      name: "Чистые поля",
      description: "Если всплеск сбросил не меньше 40 жара, ты возвращаешь ману в размере 20% его текущей цены.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 40) refund(b, skill, 0.2);
        })
      })
    }
  ]);

  // Поле запрета: стойкость немоты, заслон из жара, быстрый полный пробой.
  defineSkillMastery("mage-ban-field", [
    {
      id: "long_ban",
      name: "Долгий запрет",
      description: "На каждой задетой цели поле продлевает имеющуюся немоту на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ban-field") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ban-field") return;
          drainTargets(s).forEach(u => prolong(u, "silence"));
        }
      }
    },
    {
      id: "ban_wall",
      name: "Стена запрета",
      description: "Каждая единица жара, потраченная полем, даёт щит на 0,05% максимального здоровья, максимум на 2,5%. Новый щит держится 2 хода.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          gainShield(
            b,
            b.hero.maxHp * Math.min(0.025, Math.max(0, before.heat - heat(b)) * 0.0005)
          );
        })
      })
    },
    {
      id: "quick_seal",
      name: "Быстрая вязь",
      description: "Если перед первым ударом поле имеет не меньше 40% пробивания, его применение занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-ban-field") return;
          if (c.proc || s.seen) return;
          s.seen = true;
          s.quick = c.pierce >= 0.4;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ban-field") return;
          if (s.quick) c.tempo *= 0.85;
          s.quick = false;
          s.seen = false;
        }
      }
    }
  ]);

  // Вспышка стихий: зрелый резонанс, польза переполнения, поддержка разных стихий.
  defineSkillMastery("mage-elemental-surge", [
    {
      id: "mature_surge",
      name: "Зрелая вспышка",
      description: "При 3 резонанса и выше вспышка бьёт на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-elemental-surge") return;
          if (!c.proc && resonance(b) >= 3) c.mult *= 1.15;
        }
      }
    },
    {
      id: "overflow_ink",
      name: "Чернила избытка",
      description: "Применение вспышки при 5 резонанса возвращает 3% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.resonance >= 5) procMana(b, 0.03);
        })
      })
    },
    {
      id: "mixed_weather",
      name: "Смешанная погода",
      description: "На задетой цели с двумя разными эффектами из горения, инея, шока и влаги вспышка продлевает самый короткий из них на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-elemental-surge") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-elemental-surge") return;
          drainTargets(s).forEach(u => {
            const effects = ["burn", "frost", "shock", "soaked"]
              .map(id => getEffect(u, id)).filter(Boolean);
            if (effects.length >= 2) {
              effects.sort((a, z) => a.duration - z.duration)[0].duration += 1;
            }
          });
        }
      }
    }
  ]);

  // Проводник: быстрый набор шкалы, защита полной цепи, отвод разряда в соседа.
  defineSkillMastery("mage-conductor", [
    {
      id: "low_current",
      name: "Первый виток",
      description: "Если до применения было не больше 2 резонанса, проводник даёт ещё 1 резонанс, до общего предела 5.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.resonance <= 2) bumpGauge(b, "elemental", 1, 5);
        })
      })
    },
    {
      id: "closed_chain",
      name: "Замкнутая цепь",
      description: "При применении проводника с 4 резонанса и выше ты получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.resonance >= 4) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    },
    {
      id: "branch_current",
      name: "Боковой провод",
      description: "Если проводник разрядил шок, первое такое попадание наносит другому врагу 18% урона здоровью цели.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-conductor") return;
          if (c.proc || !c.shockUsed || s.sent) return;
          s.sent = true;
          shard(b, c.hpDamage * 0.18, "Боковой провод");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-conductor") return;
          s.sent = false;
        }
      }
    }
  ]);

  // Снять резонанс: полный разряд, старт следующей серии, остаточный заряд на цели.
  defineSkillMastery("mage-resonance-release", [
    {
      id: "deep_chord",
      name: "Глубокий аккорд",
      description: "Расход хотя бы 3 резонанса усиливает итоговый удар снятия ещё на 15%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => (
          before.resonance - resonance(b) >= 3
            ? { scale: (p.scale ?? 1) * 1.15 }
            : {}
        ))
      })
    },
    {
      id: "chord_seed",
      name: "Зерно аккорда",
      description: "После расхода хотя бы 3 резонанса ты получаешь 1 дополнительный резонанс для следующей серии, до предела 5.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masterySpent: before.resonance - resonance(b)
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          if (p.masterySpent >= 3) bumpGauge(b, "elemental", 1, 5);
        })
      })
    },
    {
      id: "hanging_note",
      name: "Зависшая нота",
      description: "Расход хотя бы 3 резонанса оставляет на выбранной цели шок на 2 хода: следующее попадание сильнее на 10%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masterySpent: before.resonance - resonance(b)
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          if (p.masterySpent >= 3) fx(b, "shock", 2, 0.1);
        })
      })
    }
  ]);

  // Контур тишины: глубина охлаждения, резонанс от отвода жара, восстановление.
  defineSkillMastery("mage-quiet-circuit", [
    {
      id: "deep_circuit",
      name: "Глубокий контур",
      description: "Контур отводит ещё до 4 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, b => cool(b, 4))
      })
    },
    {
      id: "quiet_note",
      name: "Тихая нота",
      description: "Если контур отвёл не меньше 20 жара, ты получаешь 1 дополнительный резонанс, до предела 5.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 20) bumpGauge(b, "elemental", 1, 5);
        })
      })
    },
    {
      id: "quiet_breath",
      name: "Тихое дыхание",
      description: "Отвод хотя бы 20 жара контуром даёт регенерацию на 2 хода: по 1,5% твоего максимального здоровья за тик.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.heat - heat(b) >= 20) {
            fx(b, "regeneration", 2, Math.round(b.hero.maxHp * 0.015), { self: true });
          }
        })
      })
    }
  ]);

  // Пять граней: внешние грани, поддержка стихий, полезное переполнение шкалы.
  defineSkillMastery("mage-five-facets", [
    {
      id: "outer_facets",
      name: "Внешние грани",
      description: "При 4 резонанса и выше побочные попадания пяти граней бьют на 20% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-five-facets") return;
          if (!c.proc && resonance(b) >= 4 && b.focus != null && b.enemy.slot !== b.focus) {
            c.mult *= 1.2;
          }
        }
      }
    },
    {
      id: "lasting_facet",
      name: "Несмываемая грань",
      description: "При 4 резонанса и выше на каждой задетой цели ты продлеваешь самый короткий из имеющихся эффектов горения, инея и влаги на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-five-facets") return;
          if (!c.proc && resonance(b) >= 4) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-five-facets") return;
          drainTargets(s).forEach(u => {
            const effects = ["burn", "frost", "soaked"]
              .map(id => getEffect(u, id)).filter(Boolean);
            if (effects.length) {
              effects.sort((a, z) => a.duration - z.duration)[0].duration += 1;
            }
          });
        }
      }
    },
    {
      id: "fifth_return",
      name: "Возврат пятой",
      description: "Применение пяти граней при 5 резонанса возвращает 3% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.resonance >= 5) procMana(b, 0.03);
        })
      })
    }
  ]);

  // Обратный ток: отдача маны, удар полным током, защитный остаток разряда.
  defineSkillMastery("mage-reverse-current", [
    {
      id: "clear_current",
      name: "Чистый ток",
      description: "Каждая потраченная обратным током единица резонанса возвращает ещё 0,5% максимальной маны.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          procMana(b, Math.max(0, before.resonance - resonance(b)) * 0.005);
        })
      })
    },
    {
      id: "full_reversal",
      name: "Полный разворот",
      description: "Расход хотя бы 3 резонанса усиливает итоговый удар обратного тока на 15%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => (
          before.resonance - resonance(b) >= 3
            ? { scale: (p.scale ?? 1) * 1.15 }
            : {}
        ))
      })
    },
    {
      id: "current_shell",
      name: "Оболочка тока",
      description: "Каждая потраченная единица резонанса даёт щит на 0,6% максимального здоровья, максимум на 3%. Новый щит держится 2 хода.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => {
          gainShield(
            b,
            b.hero.maxHp * Math.min(
              0.03,
              Math.max(0, before.resonance - resonance(b)) * 0.006
            )
          );
        })
      })
    }
  ]);

  // Нить души: охлаждение через связь, здоровье существ, темп живого круга.
  defineSkillMastery("mage-soul-tether", [
    {
      id: "cool_threads",
      name: "Прохладные нити",
      description: "Каждое твоё живое существо отводит нитью ещё 1 жар, максимум 5 дополнительного жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, b => cool(b, Math.min(5, army(b).length)))
      })
    },
    {
      id: "mend_threads",
      name: "Сшить связь",
      description: "При применении нити до трёх твоих самых раненых существ восстанавливают по 10% своего максимального здоровья.",
      patch: s => ({
        resolve: resolveWith(s, b => {
          army(b)
            .sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)
            .slice(0, 3)
            .forEach(u => healSummon(u, 0.1));
        })
      })
    },
    {
      id: "taut_threads",
      name: "Натянутые нити",
      description: "Если перед ударом рядом хотя бы два твоих живых существа, применение нити занимает на 15% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-soul-tether") return;
          if (!c.proc && !s.seen) {
            s.seen = true;
            s.quick = army(b).length >= 2;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-soul-tether") return;
          if (s.quick) c.tempo *= 0.85;
          s.quick = false;
          s.seen = false;
        }
      }
    }
  ]);

  // Фамильяр: прочность хранителя, мана от поглощения, немедленный вклад в щит.
  defineSkillMastery("mage-familiar", [
    {
      id: "sturdy_familiar",
      name: "Крепкая оболочка",
      description: "Множитель здоровья призываемого фамильяра возрастает на 20%.",
      patch: s => summonPatch(s, "hpFormula", 1.2)
    },
    {
      id: "ward_refund",
      name: "Эхо оберега",
      description: "До твоего следующего хода первый удар по щиту при живом фамильяре возвращает ману: 15% поглощённого урона, максимум 3% максимальной маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-familiar") return;
          s.unit = newest(b, c.skill.summonUnitConfig);
          s.armed = Boolean(s.unit && getEffect(b.hero, "shield"));
        },
        hurt(b, s, c) {
          if (!s.armed || !(c.absorbed > 0) || !army(b).includes(s.unit)) return;
          s.armed = false;
          procMana(b, Math.min(c.absorbed * 0.15 / Math.max(1, b.hero.maxMana), 0.03));
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    },
    {
      id: "first_ward",
      name: "Первый оберег",
      description: "Новый фамильяр сразу пополняет твой щит на 50% своей силы действия. Новый щит держится 2 хода.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masteryUnits: before.units
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          const u = newest(b, skill.summonUnitConfig);
          if (u && !p.masteryUnits.includes(u)) gainShield(b, u.power * 0.5);
        })
      })
    }
  ]);

  // Искра призыва: первый выпад духа, охлаждение за новую роль, живучесть бойца.
  defineSkillMastery("mage-summoning-spark", [
    {
      id: "first_strike",
      name: "Первый выпад",
      description: "Новый боевой дух сразу наносит выбранной цели дополнительный урон в размере 50% своей силы действия.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masteryUnits: before.units
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          const u = newest(b, skill.summonUnitConfig);
          if (u && !p.masteryUnits.includes(u)) {
            procDamage(b, u.power * 0.5, "Первый выпад", "arcane");
          }
        })
      })
    },
    {
      id: "fresh_pact",
      name: "Свежий договор",
      description: "Если искра добавляет в твой круг новую роль существа, ты отводишь до 6 жара до нагрева от цены.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masteryUnits: before.units
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          const u = newest(b, skill.summonUnitConfig);
          if (
            u && !p.masteryUnits.includes(u) &&
            !p.masteryUnits.some(old => old.role === u.role)
          ) cool(b, 6);
        })
      })
    },
    {
      id: "bright_shell",
      name: "Яркая оболочка",
      description: "Множитель здоровья призываемого искрой духа возрастает на 25%.",
      patch: s => summonPatch(s, "hpFormula", 1.25)
    }
  ]);

  // Набат связи: первый импульс энергии, новая роль в круге, длительность службы.
  defineSkillMastery("mage-bond-bell", [
    {
      id: "first_chime",
      name: "Первый перезвон",
      description: "Новый дух энергии сразу возвращает тебе ману в размере 50% своей силы действия.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masteryUnits: before.units
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          const u = newest(b, skill.summonUnitConfig);
          if (u && !p.masteryUnits.includes(u)) {
            procMana(b, u.power * 0.5 / Math.max(1, b.hero.maxMana));
          }
        })
      })
    },
    {
      id: "new_voice",
      name: "Новый голос",
      description: "Если набат добавляет в твой круг новую роль существа, ты отводишь до 6 жара до нагрева от цены.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          masteryUnits: before.units
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          const u = newest(b, skill.summonUnitConfig);
          if (
            u && !p.masteryUnits.includes(u) &&
            !p.masteryUnits.some(old => old.role === u.role)
          ) cool(b, 6);
        })
      })
    },
    {
      id: "long_chime",
      name: "Долгий перезвон",
      description: "Призываемый набатом дух энергии служит на 1 ход дольше.",
      patch: s => ({
        summonUnitConfig: {
          ...s.summonUnitConfig,
          duration: Number(s.summonUnitConfig.duration || 3) + 1
        }
      })
    }
  ]);

  // Приказ связи: разные роли, восстановление круга, возврат за общий приказ.
  defineSkillMastery("mage-command", [
    {
      id: "many_voices",
      name: "Разные голоса",
      description: "Каждая разная роль твоих живых существ усиливает итоговый удар приказа ещё на 4%, максимум на 12%.",
      patch: s => ({
        prepare: prepareWith(s, (b, skill, p, before) => ({
          scale: (p.scale ?? 1) * (
            1 + Math.min(3, new Set(before.units.map(u => u.role)).size) * 0.04
          )
        }))
      })
    },
    {
      id: "rally_circle",
      name: "Собрать круг",
      description: "Приказ восстанавливает каждому твоему живому существу 15% его максимального здоровья.",
      patch: s => ({
        resolve: resolveWith(s, b => army(b).forEach(u => healSummon(u, 0.15)))
      })
    },
    {
      id: "shared_order",
      name: "Общий приказ",
      description: "Если при применении приказа рядом хотя бы два твоих живых существа, ты возвращаешь ману в размере 20% его текущей цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.units.length >= 2) refund(b, skill, 0.2);
        })
      })
    }
  ]);

  // Отпустить связь: своевременный возврат, прощальный щит, передача сил кругу.
  defineSkillMastery("mage-release-bond", [
    {
      id: "timely_farewell",
      name: "Точный срок",
      description: "Если отпущенному существу оставался 1 ход службы, ты возвращаешь ещё 2,5% максимальной маны.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          const u = before.units.find(old => !army(b).includes(old));
          if (u && u.duration <= 1) procMana(b, 0.025);
        })
      })
    },
    {
      id: "farewell_cover",
      name: "Прощальный покров",
      description: "Отпущенное существо оставляет щит на 20% своего оставшегося здоровья, максимум на 3% твоего максимального здоровья. Новый щит держится 2 хода.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          const u = before.units.find(old => !army(b).includes(old));
          if (u) gainShield(b, Math.min(u.hp * 0.2, b.hero.maxHp * 0.03));
        })
      })
    },
    {
      id: "passed_thread",
      name: "Передать нить",
      description: "Если ты отпускаешь существо, самое раненое из оставшихся восстанавливает 20% своего максимального здоровья.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (!before.units.some(old => !army(b).includes(old))) return;
          const u = army(b).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
          if (u) healSummon(u, 0.2);
        })
      })
    }
  ]);

  // Сумеречный луч: смена стороны для обеих форм, отвод жара через печать, защита повторения.
  defineSkillMastery("mage-dusk-ray", [
    {
      id: "twilight_crossing",
      name: "Пересечь сумерки",
      description: "После света прямой удар лучом сильнее ещё на 16%. Лечебная форма после тьмы дополнительно лечит на 16% своего обычного лечения.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (!skill.attackType && skill.selfHealMultiplier && before.side === "dark") {
            healUnit(
              b,
              b.hero,
              getSkillSelfHealAmount(skill, b.hero) * 0.16,
              "Пересечь сумерки"
            );
          }
        })
      }),
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-dusk-ray") return;
          if (!c.proc && b.mech?.light_dark?.side === "light") c.mult *= 1.16;
        }
      }
    },
    {
      id: "cool_verdict",
      name: "Остывший приговор",
      description: "Если после применения луча на выбранной цели есть слабость или метка, ты отводишь до 6 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, b => {
          if (["weaken", "mark"].some(id => getEffect(b.enemy, id))) cool(b, 6);
        })
      })
    },
    {
      id: "twilight_shelter",
      name: "Приют сумерек",
      description: "Повтор луча со стороны тьмы даёт щит на 3% максимального здоровья; лечебная форма даёт его при повторе со стороны света. Новый щит держится 2 хода.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side === (skill.attackType ? "dark" : "light")) {
            gainShield(b, b.hero.maxHp * 0.03);
          }
        })
      })
    }
  ]);

  // Первая заря: плотность щита, очищение после тьмы, заслон от магического ответа.
  defineSkillMastery("mage-first-dawn", [
    {
      id: "dense_dawn",
      name: "Плотный рассвет",
      description: "Если после зари у тебя есть щит, он пополняется ещё на 2,7% максимального здоровья, до общего предела 60%.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-first-dawn") return;
          if (getEffect(b.hero, "shield")) gainShield(b, b.hero.maxHp * 0.027);
        }
      }
    },
    {
      id: "dawn_cleansing",
      name: "Смыть ночь",
      description: "После тьмы заря сокращает на 1 ход самый короткий из твоих эффектов яда, горения и порчи; эффект с оставшимся 1 ходом снимается.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side !== "dark") return;
          const e = ["poison", "burn", "corruption"]
            .map(id => getEffect(b.hero, id))
            .filter(Boolean)
            .sort((a, z) => a.duration - z.duration)[0];
          if (e && --e.duration <= 0) {
            b.hero.effects = b.hero.effects.filter(old => old !== e);
          }
        })
      })
    },
    {
      id: "dawn_screen",
      name: "Утренняя завеса",
      description: "До твоего следующего хода первый магический удар по тебе при сохранившемся щите зари слабее на 15%, но не более чем на 3% твоего максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-first-dawn") return;
          s.ward = getEffect(b.hero, "shield");
          s.armed = Boolean(s.ward);
        },
        incoming(b, s, c) {
          if (
            !s.armed || c.kind !== "magic" || c.parried ||
            getEffect(b.hero, "shield") !== s.ward
          ) return;
          s.armed = false;
          c.amount -= Math.min(c.amount * 0.15, b.hero.maxHp * 0.03);
        },
        turnStart(b, s) {
          s.armed = false;
        }
      }
    }
  ]);

  // Между строк: страховка тяжёлых ран, охлаждение перехода, пауза ослабленной цели.
  defineSkillMastery("mage-between-lines", [
    {
      id: "safe_margin",
      name: "Спасительное поле",
      description: "Если после лечения между строк у тебя меньше половины здоровья, ты получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, b => {
          if (b.hero.currentHp < b.hero.maxHp * 0.5) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    },
    {
      id: "cool_transition",
      name: "Прохладный переход",
      description: "Если ты применяешь навык со стороны тьмы, он отводит до 6 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side === "dark") cool(b, 6);
        })
      })
    },
    {
      id: "between_pause",
      name: "Пауза между строк",
      description: "Если после применения на выбранной цели есть слабость или метка, ты замедляешь её на 12% на 1 ход.",
      patch: s => ({
        resolve: resolveWith(s, b => {
          if (["weaken", "mark"].some(id => getEffect(b.enemy, id))) {
            fx(b, "slow", 1, 0.12);
          }
        })
      })
    }
  ]);

  // Ночь в полдень: пробой перехода, отвод жара при смене, раскрытие цели при повторе.
  defineSkillMastery("mage-midday-night", [
    {
      id: "midday_rift",
      name: "Полуденный разлом",
      description: "При переходе со стороны света ночь пробивает ещё 15% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-midday-night") return;
          if (!c.proc && b.mech?.light_dark?.side === "light") c.pierce += 0.15;
        }
      }
    },
    {
      id: "cool_midnight",
      name: "Прохладная полночь",
      description: "При применении ночи со стороны света ты отводишь до 6 жара до нагрева от цены.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side === "light") cool(b, 6);
        })
      })
    },
    {
      id: "night_sight",
      name: "Ночное зрение",
      description: "Повтор ночи со стороны тьмы раскрывает защиту выбранной цели на 2 хода: шанс крита по ней выше на 6.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side === "dark") fx(b, "exposed", 2, 6);
        })
      })
    }
  ]);

  // Затмение: длительность слабости, удар по подготовленной цели, мана за охват группы.
  defineSkillMastery("mage-eclipse", [
    {
      id: "long_shadow",
      name: "Длинная тень",
      description: "На каждой задетой цели затмение продлевает имеющуюся слабость на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-eclipse") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-eclipse") return;
          drainTargets(s).forEach(u => prolong(u, "weaken"));
        }
      }
    },
    {
      id: "prepared_eclipse",
      name: "Подготовить затмение",
      description: "При переходе со стороны света удары затмения по уже ослабленным целям сильнее ещё на 16%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-eclipse") return;
          if (
            !c.proc && b.mech?.light_dark?.side === "light" &&
            getEffect(b.enemy, "weaken")
          ) c.mult *= 1.16;
        }
      }
    },
    {
      id: "gather_shadows",
      name: "Собрать тени",
      description: "Если затмение попало хотя бы по двум разным врагам, ты возвращаешь 3% максимальной маны после применения.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-eclipse") return;
          if (!c.proc) remember(s, b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-eclipse") return;
          if (drainTargets(s).length >= 2) procMana(b, 0.03);
        }
      }
    }
  ]);

  // Поворот страницы: ответ после тьмы, мана за существенное лечение, покров полного здоровья.
  defineSkillMastery("mage-page-turn", [
    {
      id: "afterlight",
      name: "Послесвет",
      description: "При применении со стороны тьмы после обычного ответа ты посылаешь дополнительный магический луч силой 0,18; он не запускает повторов.",
      patch: s => ({
        resolve: resolveWith(s, (b, skill, p, before) => {
          if (before.side === "dark" && b.enemy.currentHp > 0) {
            performHeroHit(b, {
              kind: "magic",
              power: 0.18,
              element: "holy",
              label: "Послесвет",
              skill,
              proc: true,
              noEcho: true,
              sure: true
            });
          }
        })
      })
    },
    {
      id: "renewed_ink",
      name: "Обновить чернила",
      description: "Если поворот восстановил не меньше 10% твоего максимального здоровья, ты возвращаешь 3% максимальной маны.",
      patch: s => ({
        prepare: prepareWith(s, b => ({
          masteryHp: b.hero.currentHp
        })),
        resolve: resolveWith(s, (b, skill, p) => {
          if (b.hero.currentHp - p.masteryHp >= b.hero.maxHp * 0.1) procMana(b, 0.03);
        })
      })
    },
    {
      id: "clean_page",
      name: "Чистая страница",
      description: "Если после поворота у тебя полное здоровье, ты получаешь щит на 3% максимального здоровья на 2 хода; имеющийся щит пополняется.",
      patch: s => ({
        resolve: resolveWith(s, b => {
          if (b.hero.currentHp >= b.hero.maxHp) gainShield(b, b.hero.maxHp * 0.03);
        })
      })
    }
  ]);
})();

(() => {
  // Изменяемые данные хранятся в состоянии выбранного мастерства на текущий бой.
  const gauge = (b, id) => Number(b.mech?.[id]?.value || 0);
  const mana = (b, amount) => {
    if (amount > 0) procMana(b, amount / Math.max(1, b.hero.maxMana));
  };
  const heat = b => Number(coreState(b)?.value || 0);
  const cool = (b, n) => {
    const core = coreState(b);
    if (core) core.value = Math.max(0, core.value - n);
  };
  const cold = unit =>
    ["frost", "frostbite", "freeze"].some(id => getEffect(unit, id));
  const burnStacks = unit => {
    const e = getEffect(unit, "burn");
    return e ? getEffectStacks(e) : 0;
  };
  const at = (b, target, fn) => {
    const previous = b.enemy;
    const focus = b.focus;
    b.enemy = target;
    b.focus = focus ?? previous.slot;
    try {
      return fn();
    } finally {
      b.enemy = previous;
      b.focus = focus;
    }
  };
  const other = (b, target, test = () => true) =>
    livingFoes(b).find(unit => unit !== target && test(unit));

  const row = (s, target) => {
    if (!s.hits) s.hits = new Map();
    if (!s.hits.has(target)) {
      s.hits.set(target, { target, hits: 0, damage: 0, killed: false });
    }
    return s.hits.get(target);
  };
  const record = (b, s, c) => {
    const r = row(s, b.enemy);
    r.hits += 1;
    r.damage += Math.max(0, c.hpDamage);
    r.killed ||= c.hpDamage > 0 && b.enemy.currentHp <= 0;
  };
  const take = s => {
    const result = [...(s.hits?.values() || [])].filter(r => r.hits > 0);
    delete s.hits;
    return result;
  };

  // Снимок делается перед исходным prepare; повтор воздуха prepare не вызывает.
  const capture = (skill, choice, snapshot) => ({
    prepare(b, current) {
      const entry = (b.fxList || []).find(e =>
        e.def.id === "mastery-" + current.id + "-" + choice
      );
      if (entry) snapshot(b, entry.state, current);
      return skill.prepare?.(b, current) || {};
    }
  });

  const extend = (unit, id, n = 1) => {
    const e = getEffect(unit, id);
    if (e) e.duration += n;
    return e;
  };
  const strengthen = (e, key, amount) => {
    if (!e) return;
    e.meta ||= {};
    if (e.meta[key]) return;
    e.meta[key] = true;
    e.value += amount;
  };
  const ward = (b, amount) => {
    if (amount <= 0 || b.hero.currentHp <= 0) return;
    let e = getEffect(b.hero, "shield");
    const before = Number(e?.value || 0);
    if (e) {
      e.value += Math.round(amount);
      e.duration = Math.max(e.duration, 2);
    } else {
      e = fx(b, "shield", 2, Math.round(amount), { self: true });
    }
    if (e) {
      e.value = Math.max(
        before,
        Math.min(e.value, Math.round(b.hero.maxHp * 0.6))
      );
    }
  };
  const spill = (b, target, amount, label, element) => {
    if (target && target.currentHp > 0 && amount > 0) {
      at(b, target, () => procDamage(b, Math.round(amount), label, element));
    }
  };
  const echoSpent = (b, s, skill) =>
    s.flowBefore + 1 + Number(skill.flow || 0) >= 5 &&
    gauge(b, "air") === 0;

  // Огненный снаряд: поддерживает угли, пробивает разгоревшуюся цель или возвращает ману за добивание.
  defineSkillMastery("mage-firebolt", [
    {
      id: "live_coal",
      name: "Живой уголёк",
      description: "После попадания горение на каждой задетой цели держится на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-firebolt") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-firebolt") return;
          take(s).forEach(r => extend(r.target, "burn"));
        }
      }
    },
    {
      id: "hot_needle",
      name: "Раскалённое острие",
      description: "Если перед попаданием на цели есть хотя бы 2 стака горения, снаряд игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-firebolt") return;
          if (!c.proc && burnStacks(b.enemy) >= 2) c.pierce += 0.25;
        }
      }
    },
    {
      id: "ash_payment",
      name: "Пепельная сдача",
      description: "Если снаряд убивает хотя бы одного врага, ты возвращаешь ману в размере 20% текущей цены навыка с округлением до целого. Один возврат за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-firebolt") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-firebolt") return;
          if (take(s).some(r => r.killed)) {
            mana(b, Math.round(getSkillResourceCost(c.skill, b.hero) * 0.2));
          }
        }
      }
    }
  ]);

  // Дымные буквы: дым мешает прицелиться, старое пламя усиливает начертание, группа возвращает часть маны.
  defineSkillMastery("mage-smoke-letter", [
    {
      id: "soot_veil",
      name: "Сажа в глазах",
      description: "Каждая задетая цель, на которой осталось горение, получает ослепление на 8 на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-smoke-letter") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-smoke-letter") return;
          take(s).forEach(r => {
            if (getEffect(r.target, "burn")) {
              at(b, r.target, () => fx(b, "blind", 1, 8));
            }
          });
        }
      }
    },
    {
      id: "overprint",
      name: "Поверх строки",
      description: "Буквы наносят на 18% больше урона целям, которые уже горят перед попаданием.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-smoke-letter") return;
          if (!c.proc && getEffect(b.enemy, "burn")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "shared_ink",
      name: "Общие чернила",
      description: "Если после попаданий горят хотя бы 2 задетые цели, ты возвращаешь 3 маны. Один возврат за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-smoke-letter") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-smoke-letter") return;
          const burning = take(s).filter(r =>
            r.target.currentHp > 0 && getEffect(r.target, "burn")
          );
          if (burning.length >= 2) mana(b, 3);
        }
      }
    }
  ]);

  // Волна углей: готовит детонацию, отводит жар при накрытии группы или собирает искры во второй удар.
  defineSkillMastery("mage-cinder-wave", [
    {
      id: "packed_coals",
      name: "Плотные угли",
      description: "На задетых целях с 3 и более стаками горения множитель детонации получает ещё 15 процентных пунктов. Одно и то же горение усиливается так только раз.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          take(s).forEach(r => {
            const e = getEffect(r.target, "burn");
            if (!e || getEffectStacks(e) < 3 || e.meta.masteryPackedCoals) return;
            e.meta.masteryPackedCoals = true;
            e.meta.detonationMultiplier =
              Number(e.meta.detonationMultiplier || 0) + 0.15;
          });
        }
      }
    },
    {
      id: "wide_breath",
      name: "Широкий выдох",
      description: "Если волна попадает хотя бы по 2 врагам, после применения ты сбрасываешь ещё 6 жара.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          if (take(s).length >= 2) cool(b, 6);
        }
      }
    },
    {
      id: "gathered_sparks",
      name: "Сход искр",
      description: "Если после волны горят хотя бы 2 задетых врага, один горящий враг кроме основной цели получает ещё 15% суммарного урона попаданий волны.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-cinder-wave") return;
          const hits = take(s);
          const burning = hits.filter(r =>
            r.target.currentHp > 0 && getEffect(r.target, "burn")
          );
          if (burning.length < 2) return;
          spill(
            b,
            other(b, b.enemy, u => getEffect(u, "burn")),
            hits.reduce((n, r) => n + r.damage, 0) * 0.15,
            "Сход искр",
            "fire"
          );
        }
      }
    }
  ]);

  // Снять копоть: снятые стаки оголяют броню, возвращают ману или оставляют угли на соседней цели.
  defineSkillMastery("mage-strip-soot", [
    {
      id: "bare_metal",
      name: "Голый металл",
      description: "Если ты снимаешь хотя бы 2 стака горения, после попадания цель теряет 15% защиты на 2 хода.",
      patch: skill => capture(skill, "bare_metal", (b, s) => {
        s.stacks = Math.min(4, burnStacks(b.enemy));
      }),
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-strip-soot") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-strip-soot") return;
          const hits = take(s);
          if (s.stacks >= 2) {
            hits.forEach(r =>
              at(b, r.target, () => fx(b, "armor_break", 2, 0.15))
            );
          }
        }
      }
    },
    {
      id: "ash_change",
      name: "Зольная мелочь",
      description: "За каждые 2 снятых стака горения ты возвращаешь 1 ману, максимум 2 маны за применение.",
      patch: skill => capture(skill, "ash_change", (b, s) => {
        s.stacks = Math.min(4, burnStacks(b.enemy));
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-strip-soot") return;
          mana(b, Math.floor(Number(s.stacks || 0) / 2));
        }
      }
    },
    {
      id: "loose_coal",
      name: "Слетевший уголёк",
      description: "Половина силы снятого горения переходит одному другому врагу: 1 стак на 2 хода.",
      patch: skill => capture(skill, "loose_coal", (b, s) => {
        s.ember = Number(getEffect(b.enemy, "burn")?.value || 0);
        s.target = b.enemy;
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-strip-soot") return;
          const target = other(b, s.target);
          if (s.ember > 0 && target) {
            at(b, target, () =>
              fx(b, "burn", 2, Math.max(1, Math.round(s.ember * 0.5)), {
                stacks: 1
              })
            );
          }
        }
      }
    }
  ]);

  // Солнечная топка: долго держит закладку, оплачивает первую детонацию или прожигает старые угли.
  defineSkillMastery("mage-sun-furnace", [
    {
      id: "deep_firebox",
      name: "Глубокая топка",
      description: "После попадания горение с 2 и более стаками держится на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-sun-furnace") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-sun-furnace") return;
          take(s).forEach(r => {
            if (burnStacks(r.target) >= 2) extend(r.target, "burn");
          });
        }
      }
    },
    {
      id: "furnace_dividend",
      name: "Плата топки",
      description: "Первая детонация горения, оставшегося на задетой цели после этого применения, возвращает тебе 5 маны.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-sun-furnace") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-sun-furnace") return;
          s.armed = new Map(
            take(s)
              .map(r => [r.target, getEffect(r.target, "burn")])
              .filter(([, e]) => e)
          );
        },
        detonated(b, s) {
          const e = s.armed?.get(b.enemy);
          if (!e || !(b.enemy.effects || []).includes(e)) return;
          s.armed.clear();
          mana(b, 5);
        }
      }
    },
    {
      id: "white_core",
      name: "Белая сердцевина",
      description: "Если перед попаданием на цели есть хотя бы 2 стака горения, топка игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-sun-furnace") return;
          if (!c.proc && burnStacks(b.enemy) >= 2) c.pierce += 0.25;
        }
      }
    }
  ]);

  // Тихое горение: ускоряет один зрелый тик, вознаграждает охлаждение или поддерживает пламя на соседях.
  defineSkillMastery("mage-quiet-embers", [
    {
      id: "hidden_breath",
      name: "Скрытый вздох",
      description: "Если горение основной цели уже тикало, его ближайший тик после применения наносит на 75% больше урона. Только один тик за применение.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-quiet-embers") return;
          const e = getEffect(b.enemy, "burn");
          s.target = b.enemy;
          s.burn = e && Number(e.meta?.elapsedTicks || 0) >= 1 ? e : null;
        },
        beforeTick(b, s, c) {
          if (
            !s.burn ||
            c.id !== "burn" ||
            b.enemy !== s.target ||
            getEffect(b.enemy, "burn") !== s.burn
          ) return;
          s.burn = null;
          c.amount *= 1.75;
        }
      }
    },
    {
      id: "cool_ash",
      name: "Прохладная зола",
      description: "Если перед применением у тебя хотя бы 30 жара, тихое горение дополнительно возвращает 3 маны.",
      patch: skill => capture(skill, "cool_ash", (b, s) => {
        s.hot = heat(b) >= 30;
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-quiet-embers") return;
          if (s.hot) mana(b, 3);
        }
      }
    },
    {
      id: "quiet_circle",
      name: "Круг тления",
      description: "Если после применения основная цель горит, горение на всех остальных живых врагах держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-quiet-embers") return;
          if (!getEffect(b.enemy, "burn")) return;
          livingFoes(b)
            .filter(u => u !== b.enemy)
            .forEach(u => extend(u, "burn"));
        }
      }
    }
  ]);

  // Ледяное копьё: удерживает доступный холод, пробивает остывшую цель или возвращает ману при обморожении.
  defineSkillMastery("mage-ice-lance", [
    {
      id: "ice_barb",
      name: "Ледяная зазубрина",
      description: "После попадания иней на цели держится на 1 ход дольше; если инея нет, на 1 ход продлевается её обморожение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ice-lance") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ice-lance") return;
          take(s).forEach(r => {
            if (!extend(r.target, "frost")) extend(r.target, "frostbite");
          });
        }
      }
    },
    {
      id: "cold_point",
      name: "Холодное остриё",
      description: "По цели под инеем, обморожением или заморозкой копьё игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-ice-lance") return;
          if (!c.proc && cold(b.enemy)) c.pierce += 0.25;
        }
      }
    },
    {
      id: "rime_return",
      name: "Возврат инея",
      description: "Если после попаданий хотя бы одна задетая цель обморожена, ты возвращаешь 3 маны. Один возврат за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ice-lance") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ice-lance") return;
          if (take(s).some(r =>
            r.target.currentHp > 0 && getEffect(r.target, "frostbite")
          )) mana(b, 3);
        }
      }
    }
  ]);

  // Игла оттепели: холод оставляет лечебный след, обморожение возвращает ману, а попадание смягчает ответ.
  defineSkillMastery("mage-thaw-needle", [
    {
      id: "meltwater",
      name: "Талая капля",
      description: "Если ты попадаешь по цели под холодом, получаешь регенерацию на 1 ход с силой 18% твоей силы лечения.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (!c.proc && cold(b.enemy)) row(s, b.enemy).cold = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (take(s).some(r => r.cold)) {
            fx(b, "regeneration", 1, Math.round(b.hero.healingPower * 0.18), {
              self: true
            });
          }
        }
      }
    },
    {
      id: "thaw_spring",
      name: "Родник оттепели",
      description: "Если после попаданий хотя бы одна задетая цель обморожена, игла возвращает тебе 3 маны. Один возврат за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (take(s).some(r =>
            r.target.currentHp > 0 && getEffect(r.target, "frostbite")
          )) mana(b, 3);
        }
      }
    },
    {
      id: "gentle_thaw",
      name: "Мягкая оттепель",
      description: "После попадания по основной цели под холодом её следующий удар по тебе наносит на 15% меньше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (!c.proc && cold(b.enemy)) row(s, b.enemy).cold = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-thaw-needle") return;
          s.target = take(s).find(r =>
            r.target === b.enemy && r.cold
          )?.target || null;
        },
        incoming(b, s, c) {
          if (!s.target || b.enemy !== s.target) return;
          s.target = null;
          c.amount *= 0.85;
        }
      }
    }
  ]);

  // Ледяная темница: сохраняет обморожение, ускоряет успешное сковывание или бросает холод на соседа.
  defineSkillMastery("mage-ice-prison", [
    {
      id: "cold_mortar",
      name: "Холодный раствор",
      description: "После попадания обморожение задетой цели держится на 1 ход дольше, даже если заморозка не сработала.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-ice-prison") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ice-prison") return;
          take(s).forEach(r => extend(r.target, "frostbite"));
        }
      }
    },
    {
      id: "closed_lock",
      name: "Щёлкнул замок",
      description: "Если после применения основная цель заморожена, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ice-prison") return;
          if (getEffect(b.enemy, "freeze")) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "cold_splinters",
      name: "Осколки темницы",
      description: "Если после применения основная цель заморожена, один другой враг получает иней с замедлением 15% на 2 хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-ice-prison") return;
          if (!getEffect(b.enemy, "freeze")) return;
          const target = other(b, b.enemy);
          if (target) at(b, target, () => fx(b, "frost", 2, 0.15));
        }
      }
    }
  ]);

  // Скользящий след: делает иней цепким, оплачивает порог обморожения или сильнее задевает холодных соседей.
  defineSkillMastery("mage-icy-trail", [
    {
      id: "black_ice",
      name: "Чёрный лёд",
      description: "Иней на задетых целях замедляет ещё на 4 процентных пункта. Одно и то же обледенение усиливается так только раз.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-icy-trail") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-icy-trail") return;
          take(s).forEach(r =>
            strengthen(getEffect(r.target, "frost"), "masteryBlackIce", 0.04)
          );
        }
      }
    },
    {
      id: "rime_turn",
      name: "Поворот инея",
      description: "Если след заполняет шкалу холода и вызывает обморожение основной цели, ты возвращаешь 3 маны.",
      patch: skill => capture(skill, "rime_turn", (b, s) => {
        s.chillBefore = gauge(b, "water");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-icy-trail") return;
          if (
            s.chillBefore + Number(c.skill.chill || 0) >= 3 &&
            gauge(b, "water") === 0 &&
            getEffect(b.enemy, "frostbite")
          ) mana(b, 3);
        }
      }
    },
    {
      id: "side_slide",
      name: "Боковой занос",
      description: "Второстепенные цели, уже покрытые холодом перед попаданием, получают от следа на 20% больше урона.",
      patch: skill => capture(skill, "side_slide", (b, s) => {
        s.primary = b.enemy;
      }),
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-icy-trail") return;
          if (
            !c.proc &&
            s.primary &&
            b.enemy !== s.primary &&
            cold(b.enemy)
          ) c.mult *= 1.2;
        }
      }
    }
  ]);

  // Раскол льда: находит трещины в обморожении, использует окно заморозки или разбрасывает холодные осколки.
  defineSkillMastery("mage-shatter", [
    {
      id: "fault_point",
      name: "Точка раскола",
      description: "По обмороженной цели раскол игнорирует ещё 30% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (!c.proc && getEffect(b.enemy, "frostbite")) c.pierce += 0.3;
        }
      }
    },
    {
      id: "frozen_moment",
      name: "Застывший миг",
      description: "Если хотя бы одно попадание раскола задевает замороженную цель, действие занимает на 20% меньше времени.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (!c.proc && getEffect(b.enemy, "freeze")) {
            row(s, b.enemy).frozen = true;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (take(s).some(r => r.frozen)) c.tempo *= 0.8;
        }
      }
    },
    {
      id: "flying_ice",
      name: "Летучий лёд",
      description: "После попадания по основной цели под холодом один другой враг под холодом получает ещё 20% урона этих попаданий.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (!c.proc && cold(b.enemy)) row(s, b.enemy).cold = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-shatter") return;
          const primary = take(s).find(r =>
            r.target === b.enemy && r.cold
          );
          if (primary) {
            spill(
              b,
              other(b, b.enemy, cold),
              primary.damage * 0.2,
              "Летучий лёд",
              "frost"
            );
          }
        }
      }
    }
  ]);

  // Прилив сил: холод усиливает лечебный хвост, глубокое охлаждение возвращает ману, регенерация прикрывает от удара.
  defineSkillMastery("mage-tidal-mend", [
    {
      id: "cold_spring",
      name: "Холодный родник",
      description: "Если после применения основная цель под холодом, сила твоей регенерации возрастает на 20%. Один и тот же эффект усиливается так только раз.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tidal-mend") return;
          const e = getEffect(b.hero, "regeneration");
          if (cold(b.enemy) && e) {
            strengthen(e, "masteryColdSpring", e.value * 0.2);
          }
        }
      }
    },
    {
      id: "deep_tide",
      name: "Глубокий прилив",
      description: "Если перед приливом у тебя хотя бы 30 жара, охлаждение дополнительно возвращает 3 маны.",
      patch: skill => capture(skill, "deep_tide", (b, s) => {
        s.hot = heat(b) >= 30;
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tidal-mend") return;
          if (s.hot) mana(b, 3);
        }
      }
    },
    {
      id: "tidal_cover",
      name: "Приливное укрытие",
      description: "Пока сохраняется регенерация после прилива, первый удар по тебе наносит на 15% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tidal-mend") return;
          s.regen = getEffect(b.hero, "regeneration");
        },
        incoming(b, s, c) {
          if (!s.regen || getEffect(b.hero, "regeneration") !== s.regen) return;
          s.regen = null;
          c.amount *= 0.85;
        }
      }
    }
  ]);

  // Каменный кулак: удерживает ошеломление, смягчает тяжёлый ответ или возвращает ману за сломанную оборону.
  defineSkillMastery("mage-stone-fist", [
    {
      id: "heavy_imprint",
      name: "Тяжёлый отпечаток",
      description: "После применения ошеломление основной цели держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-stone-fist") return;
          if (b.enemy.currentHp > 0) extend(b.enemy, "stagger");
        }
      }
    },
    {
      id: "broken_swing",
      name: "Сбитый замах",
      description: "Первый тяжёлый удар основной цели, пока сохраняется её ошеломление после кулака, наносит тебе на 18% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-stone-fist") return;
          s.target = b.enemy;
          s.stagger = getEffect(b.enemy, "stagger");
        },
        incoming(b, s, c) {
          if (
            !s.stagger ||
            b.enemy !== s.target ||
            !c.heavy ||
            getEffect(b.enemy, "stagger") !== s.stagger
          ) return;
          s.stagger = null;
          c.amount *= 0.82;
        }
      }
    },
    {
      id: "stone_due",
      name: "Каменный оброк",
      description: "Если после кулака основная цель оглушена или её броня надломлена, ты возвращаешь 3 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-stone-fist") return;
          if (
            b.enemy.currentHp > 0 &&
            (getEffect(b.enemy, "stun") || getEffect(b.enemy, "armor_break"))
          ) mana(b, 3);
        }
      }
    }
  ]);

  // Шов породы: углубляет ошеломление, наращивает давление по уже шаткой цели или входит в надлом.
  defineSkillMastery("mage-rock-seam", [
    {
      id: "loose_joint",
      name: "Шаткий стык",
      description: "Ошеломление основной цели после шва снижает её урон ещё на 5 процентных пунктов. Один и тот же эффект усиливается так только раз.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rock-seam") return;
          if (b.enemy.currentHp > 0) {
            strengthen(getEffect(b.enemy, "stagger"), "masteryLooseJoint", 0.05);
          }
        }
      }
    },
    {
      id: "driven_wedge",
      name: "Загнанный клин",
      description: "Если до применения основная цель уже ошеломлена и остаётся жива, ты получаешь ещё 4 давления после применения. Этот бонус сам не вызывает оглушение.",
      patch: skill => capture(skill, "driven_wedge", (b, s) => {
        s.unsteady = Boolean(getEffect(b.enemy, "stagger"));
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rock-seam") return;
          if (s.unsteady && b.enemy.currentHp > 0) {
            bumpGauge(b, "earth", 4, 99);
          }
        }
      }
    },
    {
      id: "open_seam",
      name: "Открытый шов",
      description: "По цели под надломом брони шов игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-rock-seam") return;
          if (!c.proc && getEffect(b.enemy, "armor_break")) c.pierce += 0.25;
        }
      }
    }
  ]);

  // Трещина в земле: углубляет старый надлом, ускоряет накрытие группы или заставляет соседа пошатнуться.
  defineSkillMastery("mage-tremor", [
    {
      id: "old_fault",
      name: "Старый разлом",
      description: "Если до попадания броня цели уже надломлена, после применения надлом держится на 1 ход дольше и снимает ещё 5 процентных пунктов защиты. Дополнительная глубина не складывается сама с собой.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          if (!c.proc && getEffect(b.enemy, "armor_break")) {
            row(s, b.enemy).broken = true;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          take(s).filter(r => r.broken).forEach(r =>
            strengthen(
              extend(r.target, "armor_break"),
              "masteryOldFault",
              0.05
            )
          );
        }
      }
    },
    {
      id: "running_fault",
      name: "Бегущий разлом",
      description: "Если трещина попадает хотя бы по 2 врагам, действие занимает на 15% меньше времени.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          if (take(s).length >= 2) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "shifting_edge",
      name: "Подвижный край",
      description: "После попаданий один задетый враг кроме основной цели, чья броня надломлена, получает ошеломление на 10% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tremor") return;
          const r = take(s).find(r =>
            r.target !== b.enemy &&
            r.target.currentHp > 0 &&
            getEffect(r.target, "armor_break")
          );
          if (r) at(b, r.target, () => fx(b, "stagger", 2, 0.1));
        }
      }
    }
  ]);

  // Подпереть свод: укрепляет добавленный щит, оплачивает оглушение или возвращает часть поглощённого удара.
  defineSkillMastery("mage-vault-prop", [
    {
      id: "keystone",
      name: "Замковый камень",
      description: "Добавленная этим навыком прочность щита возрастает на 15%, с общим пределом 60% твоего здоровья.",
      patch: skill => capture(skill, "keystone", (b, s) => {
        s.oldShield = effectValue(b.hero, "shield");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-vault-prop") return;
          const e = getEffect(b.hero, "shield");
          if (!e) return;
          const bonus = Math.round(
            Math.max(0, e.value - Number(s.oldShield || 0)) * 0.15
          );
          e.value = Math.max(
            e.value,
            Math.min(Math.round(b.hero.maxHp * 0.6), e.value + bonus)
          );
        }
      }
    },
    {
      id: "held_weight",
      name: "Принятый вес",
      description: "Если после подпорки основная цель оглушена, ты возвращаешь 2 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-vault-prop") return;
          if (b.enemy.currentHp > 0 && getEffect(b.enemy, "stun")) mana(b, 2);
        }
      }
    },
    {
      id: "rebounding_stone",
      name: "Отскок камня",
      description: "Первый удар, поглощённый щитом после подпорки, возвращает нападающему 20% поглощённого урона. Возврат не превышает 20% твоей силы щита.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-vault-prop") return;
          s.shield = getEffect(b.hero, "shield");
          s.blocking = false;
        },
        incoming(b, s) {
          s.blocking = Boolean(
            s.shield && getEffect(b.hero, "shield") === s.shield
          );
        },
        hurt(b, s, c) {
          if (!s.blocking || !(c.absorbed > 0)) return;
          s.blocking = false;
          s.shield = null;
          spill(
            b,
            b.enemy,
            Math.min(c.absorbed * 0.2, b.hero.shieldPower * 0.2),
            "Отскок камня",
            "earth"
          );
        }
      }
    }
  ]);

  // Камнепад: вдавливает шаткую цель, быстрее завершает успешное оглушение или возвращает ману за обвал.
  defineSkillMastery("mage-landslide", [
    {
      id: "loose_slope",
      name: "Рыхлый склон",
      description: "По ошеломлённой цели камнепад игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-landslide") return;
          if (!c.proc && getEffect(b.enemy, "stagger")) c.pierce += 0.25;
        }
      }
    },
    {
      id: "settled_rocks",
      name: "Улеглись камни",
      description: "Если после камнепада основная цель оглушена, действие занимает на 15% меньше времени.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-landslide") return;
          if (getEffect(b.enemy, "stun")) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "quarry_yield",
      name: "Добыча обвала",
      description: "Если хотя бы одно попадание камнепада убивает врага, ты возвращаешь 4 маны. Один возврат за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-landslide") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-landslide") return;
          if (take(s).some(r => r.killed)) mana(b, 4);
        }
      }
    }
  ]);

  // Сейсмический сброс: награждает большой расход, сохраняет часть давления или посылает вторую волну.
  defineSkillMastery("mage-seismic-release", [
    {
      id: "deep_focus",
      name: "Глубокий очаг",
      description: "При расходе хотя бы 50 давления сброс наносит на 15% больше урона.",
      patch: skill => capture(skill, "deep_focus", (b, s) => {
        s.spent = gauge(b, "earth");
      }),
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-seismic-release") return;
          if (!c.proc && s.spent >= 50) c.mult *= 1.15;
        }
      }
    },
    {
      id: "residual_pressure",
      name: "Остаточный напор",
      description: "При расходе хотя бы 40 давления ты возвращаешь 15% потраченного давления с округлением вниз. Возврат сам не вызывает оглушение.",
      patch: skill => capture(skill, "residual_pressure", (b, s) => {
        s.spent = gauge(b, "earth");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-seismic-release") return;
          if (s.spent >= 40) {
            bumpGauge(b, "earth", Math.floor(s.spent * 0.15), 99);
          }
        }
      }
    },
    {
      id: "second_wave",
      name: "Вторая волна",
      description: "При расходе хотя бы 60 давления один другой враг получает ещё 20% суммарного урона попаданий сброса по основной цели.",
      patch: skill => capture(skill, "second_wave", (b, s) => {
        s.spent = gauge(b, "earth");
        s.primary = b.enemy;
      }),
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-seismic-release") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-seismic-release") return;
          const primary = take(s).find(r => r.target === s.primary);
          if (s.spent >= 60 && primary) {
            spill(
              b,
              other(b, s.primary),
              primary.damage * 0.2,
              "Вторая волна",
              "earth"
            );
          }
        }
      }
    }
  ]);

  // Разрез ветра: использует ускорение для пробития, оплачивает повтор или превращает ослепление в прикрытие.
  defineSkillMastery("mage-gust-blade", [
    {
      id: "swift_edge",
      name: "Быстрое лезвие",
      description: "Пока на тебе есть ускорение, разрез игнорирует ещё 25% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-gust-blade") return;
          if (!c.proc && getEffect(b.hero, "haste")) c.pierce += 0.25;
        }
      }
    },
    {
      id: "echo_change",
      name: "Сдача потока",
      description: "Если разрез запускает повтор потока, ты возвращаешь 2 маны. Один возврат за применение.",
      patch: skill => capture(skill, "echo_change", (b, s) => {
        s.flowBefore = gauge(b, "air");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-gust-blade") return;
          if (echoSpent(b, s, c.skill)) mana(b, 2);
        }
      }
    },
    {
      id: "veiled_cut",
      name: "Прикрытый разрез",
      description: "Если после попадания основная цель ослеплена, её следующий удар по тебе наносит на 20% меньше урона.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-gust-blade") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-gust-blade") return;
          s.target = take(s).find(r =>
            r.target === b.enemy && getEffect(r.target, "blind")
          )?.target || null;
        },
        incoming(b, s, c) {
          if (!s.target || b.enemy !== s.target) return;
          s.target = null;
          c.amount *= 0.8;
        }
      }
    }
  ]);

  // Пауза в потоке: остужает собранный ветер, ускоряет его повтор или сбивает прицел соседу.
  defineSkillMastery("mage-flow-pause", [
    {
      id: "cool_gap",
      name: "Прохладный просвет",
      description: "Если до применения у тебя хотя бы 3 потока, пауза сбрасывает 6 жара после урона и до нагрева от цены навыка.",
      patch: skill => ({
        resolve(b, current, plan) {
          const gathered = gauge(b, "air") >= 3;
          skill.resolve?.(b, current, plan);
          if (gathered) cool(b, 6);
        }
      })
    },
    {
      id: "caught_rhythm",
      name: "Пойманный ритм",
      description: "Если пауза запускает повтор потока, действие занимает ещё на 15% меньше времени.",
      patch: skill => capture(skill, "caught_rhythm", (b, s) => {
        s.flowBefore = gauge(b, "air");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-flow-pause") return;
          if (echoSpent(b, s, c.skill)) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "side_draft",
      name: "Боковой сквозняк",
      description: "Если после паузы у тебя хотя бы 3 потока, один враг кроме основной цели получает ослепление на 10 на 2 хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-flow-pause") return;
          if (gauge(b, "air") < 3) return;
          const target = other(b, b.enemy);
          if (target) at(b, target, () => fx(b, "blind", 2, 10));
        }
      }
    }
  ]);

  // Попутный ветер: продлевает разогнанное ускорение, возвращает ману за уклонение или прикрывает тяжёлый удар.
  defineSkillMastery("mage-tailwind", [
    {
      id: "long_wake",
      name: "Долгий след",
      description: "Если после попутного ветра у тебя хотя бы 4 потока, ускорение держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tailwind") return;
          if (gauge(b, "air") >= 4) extend(b.hero, "haste");
        }
      }
    },
    {
      id: "wind_catch",
      name: "Улов ветра",
      description: "Первое уклонение, пока сохраняется ускорение после попутного ветра, возвращает тебе 3 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tailwind") return;
          s.haste = getEffect(b.hero, "haste");
        },
        dodged(b, s) {
          if (!s.haste || getEffect(b.hero, "haste") !== s.haste) return;
          s.haste = null;
          mana(b, 3);
        }
      }
    },
    {
      id: "wind_brace",
      name: "Упор ветра",
      description: "Первый тяжёлый удар по тебе, пока сохраняется ускорение после попутного ветра, наносит на 15% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-tailwind") return;
          s.haste = getEffect(b.hero, "haste");
        },
        incoming(b, s, c) {
          if (
            !s.haste ||
            !c.heavy ||
            getEffect(b.hero, "haste") !== s.haste
          ) return;
          s.haste = null;
          c.amount *= 0.85;
        }
      }
    }
  ]);

  // Удержать вихрь: расход потока создаёт щит, сильнее охлаждает или отправляет сжатый ветер в соседа.
  defineSkillMastery("mage-hold-gale", [
    {
      id: "coiled_wind",
      name: "Свитый ветер",
      description: "Если вихрь расходует 2 потока, после применения ты получаешь щит на 20% своей силы магии на 2 хода. Общий предел щита — 60% твоего здоровья.",
      patch: skill => capture(skill, "coiled_wind", (b, s) => {
        s.held = gauge(b, "air") >= 3;
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-hold-gale") return;
          if (s.held) ward(b, b.hero.skillDamage * 0.2);
        }
      }
    },
    {
      id: "cold_coil",
      name: "Холодный виток",
      description: "Если вихрь расходует 2 потока, он сбрасывает ещё 5 жара после урона и до нагрева от цены навыка.",
      patch: skill => ({
        prepare(b, current) {
          const held = gauge(b, "air") >= 3;
          const plan = skill.prepare?.(b, current) || {};
          return { ...plan, masteryColdCoil: held };
        },
        resolve(b, current, plan) {
          skill.resolve?.(b, current, plan);
          if (plan.masteryColdCoil) cool(b, 5);
        }
      })
    },
    {
      id: "loose_turn",
      name: "Сорвавшийся виток",
      description: "Если вихрь расходует 2 потока, один другой враг получает ещё 20% суммарного урона его попаданий по основной цели.",
      patch: skill => capture(skill, "loose_turn", (b, s) => {
        s.held = gauge(b, "air") >= 3;
        s.primary = b.enemy;
      }),
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-hold-gale") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-hold-gale") return;
          const primary = take(s).find(r => r.target === s.primary);
          if (s.held && primary) {
            spill(
              b,
              other(b, s.primary),
              primary.damage * 0.2,
              "Сорвавшийся виток",
              "air"
            );
          }
        }
      }
    }
  ]);

  // Цепь молний: третий разряд пробивает защиту, полная серия возвращает ману или оставляет заряд для следующего удара.
  defineSkillMastery("mage-storm-chain", [
    {
      id: "third_arc",
      name: "Третья дуга",
      description: "Каждый третий удар цепи по одной цели игнорирует ещё 35% защиты. Удары повтора продолжают этот счёт.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          if (c.proc) return;
          const r = row(s, b.enemy);
          r.attempts = Number(r.attempts || 0) + 1;
          if (r.attempts % 3 === 0) c.pierce += 0.35;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          take(s);
        }
      }
    },
    {
      id: "closed_circuit",
      name: "Замкнутая цепь",
      description: "Если за применение цепь попадает хотя бы 3 раза, ты возвращаешь 4 маны. Попадания повтора учитываются; возврат только один.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          if (take(s).reduce((n, r) => n + r.hits, 0) >= 3) mana(b, 4);
        }
      }
    },
    {
      id: "last_charge",
      name: "Последний заряд",
      description: "Цель, получившая хотя бы 3 попадания цепи за применение, получает шок на 2 хода: следующее прямое попадание по ней наносит на 25% больше урона.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-storm-chain") return;
          take(s).filter(r => r.hits >= 3).forEach(r =>
            at(b, r.target, () => fx(b, "shock", 2, 0.25))
          );
        }
      }
    }
  ]);

  // Обратный ветер: использует снятый жар для темпа, прикрывает группу дымкой или защищает после повтора.
  defineSkillMastery("mage-backwind", [
    {
      id: "cool_return",
      name: "Прохладный возврат",
      description: "Если перед применением у тебя хотя бы 25 жара, обратный ветер занимает на 15% меньше времени.",
      patch: skill => capture(skill, "cool_return", (b, s) => {
        s.hot = heat(b) >= 25;
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-backwind") return;
          if (s.hot) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "dust_wake",
      name: "Пыльный след",
      description: "Каждая задетая второстепенная цель получает ослепление на 8 на 1 ход.",
      patch: skill => capture(skill, "dust_wake", (b, s) => {
        s.primary = b.enemy;
      }),
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-backwind") return;
          if (!c.proc) record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-backwind") return;
          take(s).filter(r => r.target !== s.primary).forEach(r =>
            at(b, r.target, () => fx(b, "blind", 1, 8))
          );
        }
      }
    },
    {
      id: "return_cover",
      name: "Возвратное укрытие",
      description: "Если обратный ветер запускает повтор потока, следующий удар по тебе наносит на 15% меньше урона.",
      patch: skill => capture(skill, "return_cover", (b, s) => {
        s.flowBefore = gauge(b, "air");
      }),
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-backwind") return;
          s.ready = echoSpent(b, s, c.skill);
        },
        incoming(b, s, c) {
          if (!s.ready) return;
          s.ready = false;
          c.amount *= 0.85;
        }
      }
    }
  ]);
})();

(() => {
  const army = b => (b.hero.summonedUnits || []).filter(u => u.hp > 0);
  const spirits = b => army(b).filter(u => u.type === "spirit");
  const roles = b => new Set(spirits(b).map(u => u.role));
  const gauge = (b, id) => Number(b.mech?.[id]?.value || 0);

  const cool = (b, n) => {
    const core = coreState(b);
    if (core) core.value = Math.max(0, core.value - n);
  };

  const mana = (b, n) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + Math.round(n));
    if (b.hero.currentMana > before) {
      emit(b, "mana", {
        target: "hero",
        amount: b.hero.currentMana - before
      });
    }
  };

  const ward = (b, amount) => {
    if (amount <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const e = fx(
      b, "shield", 3,
      Math.min(cap, effectValue(b.hero, "shield") + Math.round(amount)),
      { self: true }
    );
    if (e) e.value = Math.min(cap, e.value);
  };

  const mend = (u, amount) => {
    if (u?.hp > 0) u.hp = Math.min(u.maxHp, u.hp + Math.round(amount));
  };

  const bolster = (u, ratio) => {
    const extra = Math.round(u.maxHp * ratio);
    u.maxHp += extra;
    u.hp += extra;
  };

  const newest = (b, skill) => {
    const u = army(b).at(-1);
    const cfg = skill.summonUnitConfig;
    return u && !u.persistent && cfg &&
      u.type === cfg.type && u.role === cfg.role ? u : null;
  };

  const watch = (b, s, skill) => {
    const u = newest(b, skill);
    if (u) (s.units ||= new Set()).add(u);
  };

  const alive = (b, u) => u && army(b).includes(u);

  // Снимок относится только к текущему применению.
  // Исходные prepare и resolve, включая изменения формы, сохраняются.
  const around = (skill, capture, finish, changePlan) => ({
    prepare(b, actual) {
      const m = capture(b, actual);
      const p = { ...(skill.prepare?.(b, actual) || {}) };
      changePlan?.(b, actual, m, p);
      return { ...p, masteryData: m };
    },
    resolve(b, actual, p) {
      skill.resolve?.(b, actual, p);
      finish?.(b, actual, p.masteryData, p);
    }
  });

  const fresh = (b, old) => army(b).filter(u => !old.includes(u));

  // Дополнительный урон не порождает afterHit и цепочки повторных ударов.
  const echo = (b, target, amount, label, element = "arcane") => {
    if (!target || target.currentHp <= 0 || amount <= 0) return;
    const previous = b.enemy;
    const focus = b.focus;
    try {
      b.focus = focus ?? previous.slot;
      b.enemy = target;
      const result = dealDamage(b, target, amount);
      emit(b, "hit", {
        target: "enemy",
        ...result,
        crit: false,
        kind: "magic",
        element,
        label
      });
    } finally {
      b.enemy = previous;
      b.focus = focus;
    }
  };

  const other = b => livingFoes(b).find(u => u !== b.enemy);
  const badCount = u => (u.effects || []).filter(e =>
    e.duration > 0 && STATUS_EFFECT_DEFINITIONS[e.id]?.tone === "bad"
  ).length;

  // Дух-хранитель: крепость рядом с иной ролью, разовый заслон и возврат за полную службу; учитывается форма целителя.
  defineSkillMastery("mage-spirit-attendant", [
    {
      id: "kindred_wall",
      name: "Родственная стена",
      description: "Если при призыве рядом есть дух другой роли, запас здоровья нового духа растёт на 18%.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        for (const u of fresh(b, old)) {
          if (old.some(v =>
            alive(b, v) && v.type === "spirit" && v.role !== u.role
          )) bolster(u, 0.18);
        }
      })
    },
    {
      id: "first_shelter",
      name: "Первый заслон",
      description: "Пока призванный дух жив, следующий удар по тебе слабее на 18%. Поглощается не больше 18% максимального здоровья этого духа.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-spirit-attendant") return;
          s.unit = newest(b, c.skill);
          s.armed = Boolean(s.unit);
        },
        incoming(b, s, c) {
          if (!s.armed || !alive(b, s.unit) || c.amount <= 0) return;
          s.armed = false;
          c.amount -= Math.min(c.amount * 0.18, s.unit.maxHp * 0.18);
        }
      }
    },
    {
      id: "completed_watch",
      name: "Полная стража",
      description: "Если призванный дух доживает до конца службы, ты возвращаешь 3 маны. Досрочный отзыв возврата не даёт.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-spirit-attendant") return;
          watch(b, s, c.skill);
        },
        summonDeath(b, s, c) {
          if (!s.units?.delete(c.summon)) return;
          if (c.summon.hp > 0 && c.summon.duration <= 0) mana(b, 3);
        }
      }
    }
  ]);

  // Искра договора: пробивание щита, приветственный удар рядом с иной ролью и возврат за добивание.
  defineSkillMastery("mage-pact-spark", [
    {
      id: "seal_needle",
      name: "Игла договора",
      description: "Против цели под щитом Искра игнорирует ещё 20% защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-pact-spark") return;
          if (!c.proc && getEffect(b.enemy, "shield")) c.pierce += 0.2;
        }
      }
    },
    {
      id: "greeting",
      name: "Встречная искра",
      description: "Если рядом есть дух другой роли, новый боевой дух сразу наносит дополнительный урон в размере 100% своей силы.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        const u = fresh(b, old).find(v =>
          v.type === "spirit" && v.role === "attacker"
        );
        if (u && old.some(v =>
          alive(b, v) && v.type === "spirit" && v.role !== u.role
        )) echo(b, b.enemy, u.power, "Встречная искра");
      })
    },
    {
      id: "closed_deal",
      name: "Закрытый договор",
      description: "Если удар Искры добивает цель, ты возвращаешь 3 маны. Не больше одного возврата за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-pact-spark") return;
          if (!c.proc && !s.paid &&
              c.hpDamage > 0 && b.enemy.currentHp <= 0) {
            s.paid = true;
            mana(b, 3);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-pact-spark") return;
          s.paid = false;
        }
      }
    }
  ]);

  // Дух-целитель: долгая помощь при тяжёлой ране, лечение другого духа и разовая экстренная перевязка.
  defineSkillMastery("mage-spirit-healer", [
    {
      id: "long_vigil",
      name: "Долгое бдение",
      description: "Если перед применением у тебя не больше 60% здоровья, новый целитель служит на 1 ход дольше.",
      patch: skill => around(
        skill,
        b => ({
          old: army(b),
          wounded: b.hero.currentHp <= b.hero.maxHp * 0.6
        }),
        (b, k, m) => {
          if (m.wounded) {
            fresh(b, m.old)
              .filter(u => u.type === "spirit" && u.role === "healer")
              .forEach(u => { u.duration += 1; });
          }
        }
      )
    },
    {
      id: "circle_mending",
      name: "Перевязка круга",
      description: "При призыве целителя ты восстанавливаешь самому раненому другому духу 30% его максимального здоровья.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        if (!fresh(b, old).length) return;
        const u = old.filter(v =>
          alive(b, v) && v.type === "spirit" && v.hp < v.maxHp
        ).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
        if (u) mend(u, u.maxHp * 0.3);
      })
    },
    {
      id: "emergency_thread",
      name: "Спасительная нить",
      description: "Пока новый целитель жив, первый удар, оставляющий тебе не больше 50% здоровья, вызывает дополнительное лечение на 80% силы духа.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-spirit-healer") return;
          s.unit = newest(b, c.skill);
          s.armed = Boolean(s.unit);
        },
        hurt(b, s, c) {
          if (!s.armed || !alive(b, s.unit) || c.hpDamage <= 0 ||
              b.hero.currentHp <= 0 ||
              b.hero.currentHp > b.hero.maxHp * 0.5) return;
          s.armed = false;
          healUnit(b, b.hero, s.unit.power * 0.8, "Спасительная нить");
        }
      }
    }
  ]);

  // Дух энергии: охлаждение горячего призыва, продление при Гармонии и немедленная мана за добивание.
  defineSkillMastery("mage-spirit-energy", [
    {
      id: "cool_source",
      name: "Прохладный источник",
      description: "Если перед призывом у тебя хотя бы 45 жара, дух снимает ещё 5 жара до нагрева ценой навыка.",
      patch: skill => around(
        skill,
        b => gauge(b, "core_mage") >= 45,
        (b, k, hot) => { if (hot) cool(b, 5); }
      )
    },
    {
      id: "third_stream",
      name: "Третий ручей",
      description: "Если после призыва в круге есть хотя бы 3 разные роли духов, новый дух энергии служит на 1 ход дольше.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        if (roles(b).size >= 3) {
          fresh(b, old)
            .filter(u => u.role === "energy" && u.type === "spirit")
            .forEach(u => { u.duration += 1; });
        }
      })
    },
    {
      id: "last_sip",
      name: "Последний глоток",
      description: "Если начальный удар добивает цель, новый дух энергии сразу возвращает ману в размере 100% своей силы.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        const u = fresh(b, old).find(v =>
          v.role === "energy" && v.type === "spirit"
        );
        if (u && b.enemy.currentHp <= 0) mana(b, u.power);
      })
    }
  ]);

  // Третий договор: крепкий недостающий дух, усиление собранной Гармонии и поддержка истекающей службы.
  defineSkillMastery("mage-third-pact", [
    {
      id: "firm_signature",
      name: "Крепкая подпись",
      description: "Если договор призывает недостающего духа, его максимальное и текущее здоровье растут на 20%.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        fresh(b, old).filter(u => u.type === "spirit")
          .forEach(u => bolster(u, 0.2));
      })
    },
    {
      id: "three_voices",
      name: "Три голоса",
      description: "При 3 или более разных ролях духов удар Третьего договора становится ещё на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-third-pact") return;
          if (!c.proc && roles(b).size >= 3) c.mult *= 1.15;
        }
      }
    },
    {
      id: "renewed_word",
      name: "Продлённое слово",
      description: "Если перед применением есть 3 разные роли духов, ты продлеваешь службу одного духа с 1 оставшимся ходом на 1 ход.",
      patch: skill => around(
        skill,
        b => roles(b).size >= 3
          ? spirits(b).find(u => !u.persistent && u.duration === 1)
          : null,
        (b, k, u) => { if (alive(b, u)) u.duration += 1; }
      )
    }
  ]);

  // Роспуск круга: мана за полный круг, щит из ран отозванных духов и отголосок по второй цели.
  defineSkillMastery("mage-circle-dismissal", [
    {
      id: "returned_pledge",
      name: "Возврат залога",
      description: "Если ты отзываешь хотя бы 2 духов, каждый из них возвращает 1 ману, максимум 3 маны за применение.",
      patch: skill => around(
        skill,
        b => Math.min(3, spirits(b).filter(u => !u.persistent).length),
        (b, k, n) => { if (n >= 2) mana(b, n); }
      )
    },
    {
      id: "woven_scars",
      name: "Сплетённые шрамы",
      description: "Отзыв даёт тебе щит на 3 хода: 15% суммарного потерянного здоровья отозванных духов, но не больше 4% твоего максимального здоровья.",
      patch: skill => around(
        skill,
        b => spirits(b).filter(u => !u.persistent)
          .reduce((n, u) => n + u.maxHp - u.hp, 0),
        (b, k, lost) => {
          ward(b, Math.min(lost * 0.15, b.hero.maxHp * 0.04));
        }
      )
    },
    {
      id: "parting_ring",
      name: "Прощальный звон",
      description: "Если ты отзываешь духов, одна другая цель получает дополнительный урон: 30% силы магии и ещё 4% за духа, до 3 духов.",
      patch: skill => around(
        skill,
        b => Math.min(3, spirits(b).filter(u => !u.persistent).length),
        (b, k, n) => {
          if (n) {
            echo(b, other(b), b.hero.skillDamage * (0.3 + n * 0.04),
              "Прощальный звон");
          }
        }
      )
    }
  ]);

  // Костяной слуга: крепость в строю, посмертная перевязка и темп рядом с другой нежитью; обе формы сохраняются.
  defineSkillMastery("mage-undead-thrall", [
    {
      id: "close_ribs",
      name: "Сомкнутые рёбра",
      description: "Если при призыве рядом есть другая нежить, здоровье нового слуги растёт на 18%.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        if (old.some(u => u.type === "undead" && alive(b, u))) {
          fresh(b, old).filter(u => u.type === "undead")
            .forEach(u => bolster(u, 0.18));
        }
      })
    },
    {
      id: "grave_bandage",
      name: "Могильная перевязка",
      description: "Естественная гибель призванного слуги лечит тебя на 18% его максимального здоровья, но не больше 3% твоего. Отзыв и жертва лечения не дают.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-undead-thrall") return;
          watch(b, s, c.skill);
        },
        summonDeath(b, s, c) {
          if (!s.units?.delete(c.summon) || b.hero.currentHp <= 0) return;
          healUnit(
            b, b.hero,
            Math.min(c.summon.maxHp * 0.18, b.hero.maxHp * 0.03),
            "Могильная перевязка"
          );
        }
      }
    },
    {
      id: "march_step",
      name: "Шаг строя",
      description: "Если после призыва рядом есть хотя бы 2 существа нежити, применение приближает твой следующий ход на 15%.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-undead-thrall") return;
          if (army(b).filter(u => u.type === "undead").length >= 2) {
            c.tempo *= 0.85;
          }
        }
      }
    }
  ]);

  // Зомби: тело для тяжёлой раны, ремонт соседа и разовый физический заслон после гибели.
  defineSkillMastery("mage-zombie", [
    {
      id: "borrowed_body",
      name: "Заёмное тело",
      description: "Если перед применением у тебя не больше 50% здоровья, здоровье нового зомби растёт на 20%.",
      patch: skill => around(
        skill,
        b => ({
          old: army(b),
          wounded: b.hero.currentHp <= b.hero.maxHp * 0.5
        }),
        (b, k, m) => {
          if (m.wounded) {
            fresh(b, m.old).filter(u => u.type === "undead")
              .forEach(u => bolster(u, 0.2));
          }
        }
      )
    },
    {
      id: "spare_flesh",
      name: "Запасная плоть",
      description: "При призыве зомби ты восстанавливаешь самой раненой другой нежити 20% её максимального здоровья.",
      patch: skill => around(skill, b => army(b), (b, k, old) => {
        if (!fresh(b, old).length) return;
        const u = old.filter(v =>
          alive(b, v) && v.type === "undead" && v.hp < v.maxHp
        ).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
        if (u) mend(u, u.maxHp * 0.2);
      })
    },
    {
      id: "fallen_screen",
      name: "Павший заслон",
      description: "После естественной гибели твоего зомби следующий физический удар по тебе слабее на 20%. Несколько гибелей не складывают заслоны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-zombie") return;
          watch(b, s, c.skill);
        },
        summonDeath(b, s, c) {
          if (!s.units?.delete(c.summon)) return;
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || c.kind !== "physical" || c.amount <= 0) return;
          s.armed = false;
          c.amount *= 0.8;
        }
      }
    }
  ]);

  // Костяной шов: награда за две кости, возврат кости за добивание и ремонт армии при расходе.
  defineSkillMastery("mage-bone-stitch", [
    {
      id: "double_seam",
      name: "Двойной шов",
      description: "Если ты расходуешь 2 кости, удар Костяного шва становится ещё на 15% сильнее.",
      patch: skill => around(
        skill,
        b => Math.min(2, gauge(b, "undead")),
        null,
        (b, k, n, p) => {
          if (n >= 2) p.scale = (p.scale ?? 1) * 1.15;
        }
      )
    },
    {
      id: "closed_suture",
      name: "Замкнутый шов",
      description: "Если ты расходуешь хотя бы 1 кость и начальный удар добивает цель, ты возвращаешь 1 кость.",
      patch: skill => around(
        skill,
        b => Math.min(2, gauge(b, "undead")),
        (b, k, n) => {
          if (n > 0 && b.enemy.currentHp <= 0) {
            bumpGauge(b, "undead", 1, 6);
          }
        }
      )
    },
    {
      id: "living_stitch",
      name: "Шов для строя",
      description: "Если ты расходуешь хотя бы 1 кость, самая раненая нежить восстанавливает 20% своего максимального здоровья.",
      patch: skill => around(
        skill,
        b => Math.min(2, gauge(b, "undead")),
        (b, k, n) => {
          if (!n) return;
          const u = army(b).filter(v =>
            v.type === "undead" && v.hp < v.maxHp
          ).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
          if (u) mend(u, u.maxHp * 0.2);
        }
      )
    }
  ]);

  // Короткий приказ: добавочный приказной удар, мана за последний ход и щит из изношенной кости.
  defineSkillMastery("mage-brief-command", [
    {
      id: "hard_syllable",
      name: "Твёрдый слог",
      description: "Если приказ находит нежить, её дополнительный приказной удар наносит ещё 30% её силы.",
      patch: skill => around(
        skill,
        b => army(b).find(u => u.type === "undead" && !u.persistent),
        (b, k, u) => {
          if (u) echo(b, b.enemy, u.power * 0.3, "Твёрдый слог", "dark");
        }
      )
    },
    {
      id: "last_order",
      name: "Последний приказ",
      description: "Если у выбранной приказом нежити перед применением остаётся не больше 1 хода службы, ты возвращаешь 2 маны.",
      patch: skill => around(
        skill,
        b => army(b).find(u =>
          u.type === "undead" && !u.persistent
        )?.duration <= 1,
        (b, k, last) => { if (last) mana(b, 2); }
      )
    },
    {
      id: "bone_dust",
      name: "Костяная пыль",
      description: "Приказ живой нежити даёт щит на 3 хода: 15% потерянного ею здоровья, до 4% твоего максимального здоровья.",
      patch: skill => around(
        skill,
        b => {
          const u = army(b).find(v =>
            v.type === "undead" && !v.persistent
          );
          return u ? u.maxHp - u.hp : 0;
        },
        (b, k, lost) => {
          ward(b, Math.min(lost * 0.15, b.hero.maxHp * 0.04));
        }
      )
    }
  ]);

  // Взрыв костей: усиление вклада армии, кость за добивание и осколки по второй цели без цепочек.
  defineSkillMastery("mage-bone-burst", [
    {
      id: "dense_fragments",
      name: "Плотные осколки",
      description: "Если вклад распущенной армии превышает 50% твоей силы магии, эта добавочная часть урона Взрыва растёт на 15%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-bone-burst") return;
          if (!c.proc && c.flat > b.hero.skillDamage * 0.5) {
            c.flat *= 1.15;
          }
        }
      }
    },
    {
      id: "last_fragment",
      name: "Последняя кость",
      description: "Если Взрыв добивает цель, ты получаешь 1 кость. Не больше одной за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-bone-burst") return;
          if (!c.proc && !s.paid &&
              c.hpDamage > 0 && b.enemy.currentHp <= 0) {
            s.paid = true;
            bumpGauge(b, "undead", 1, 6);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-bone-burst") return;
          s.paid = false;
        }
      }
    },
    {
      id: "splinter_fan",
      name: "Веер осколков",
      description: "Первое попадание Взрыва по здоровью наносит одной другой цели ещё 15% этого урона. Осколки не вызывают новые осколки.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-bone-burst") return;
          if (c.proc || s.spent || c.hpDamage <= 0) return;
          s.spent = true;
          echo(b, other(b), c.hpDamage * 0.15, "Веер осколков", "dark");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-bone-burst") return;
          s.spent = false;
        }
      }
    }
  ]);

  // Строй из костей: крепость новых рядов за кости, сохранение запаса и дополнительный ход прежней нежити.
  defineSkillMastery("mage-bone-ranks", [
    {
      id: "reinforced_ranks",
      name: "Укреплённые ряды",
      description: "Если перед применением у тебя хотя бы 2 кости, здоровье всей нежити, призванной этим Строем, растёт на 18%.",
      patch: skill => around(
        skill,
        b => ({ old: army(b), ready: gauge(b, "undead") >= 2 }),
        (b, k, m) => {
          if (m.ready) {
            fresh(b, m.old).filter(u => u.type === "undead")
              .forEach(u => bolster(u, 0.18));
          }
        }
      )
    },
    {
      id: "spare_joint",
      name: "Запасной сустав",
      description: "Если Строй расходует хотя бы 4 кости, после призыва ты возвращаешь 1 кость.",
      patch: skill => around(
        skill,
        b => gauge(b, "undead") >= 4,
        (b, k, ready) => { if (ready) bumpGauge(b, "undead", 1, 6); }
      )
    },
    {
      id: "veteran_rank",
      name: "Место ветерана",
      description: "Строй продлевает службу старейшей прежней нежити на 1 ход, если она остаётся в армии после призыва.",
      patch: skill => around(
        skill,
        b => army(b).find(u => u.type === "undead" && !u.persistent),
        (b, k, u) => { if (alive(b, u)) u.duration += 1; }
      )
    }
  ]);

  // Касание света: очищение, запас сияния и страховка тяжёлой раны работают с лечением, щитом и регенерацией.
  defineSkillMastery("mage-light-touch", [
    {
      id: "clean_touch",
      name: "Чистое касание",
      description: "Ты сокращаешь на 1 ход одну свою беду: сначала рану, а если её нет — яд.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-light-touch") return;
          const e = getEffect(b.hero, "wound") || getEffect(b.hero, "poison");
          if (e) e.duration = Math.max(0, e.duration - 1);
        }
      }
    },
    {
      id: "saved_dawn",
      name: "Сбережённый рассвет",
      description: "После Касания ты дополнительно копишь сияние в размере 15% силы лечения, до общего предела 60% максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-light-touch") return;
          bumpGauge(
            b, "light",
            Math.round(b.hero.healingPower * 0.15),
            Math.round(b.hero.maxHp * 0.6)
          );
        }
      }
    },
    {
      id: "gentle_palm",
      name: "Бережная ладонь",
      description: "До твоего следующего хода первый удар при здоровье не выше 50% слабее на 18%. Снижение ограничено 18% силы лечения.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-light-touch") return;
          s.armed = true;
        },
        turnStart(b, s) {
          s.armed = false;
        },
        incoming(b, s, c) {
          if (!s.armed || c.amount <= 0 ||
              b.hero.currentHp > b.hero.maxHp * 0.5) return;
          s.armed = false;
          c.amount -= Math.min(c.amount * 0.18, b.hero.healingPower * 0.18);
        }
      }
    }
  ]);

  // Свет в ране: наступление при тяжёлой ране, лечение от нанесённого урона и щит при накопленном сиянии.
  defineSkillMastery("mage-wound-light", [
    {
      id: "wound_beacon",
      name: "Маяк в ране",
      description: "Если перед ударом у тебя не больше 50% здоровья, удар Света в ране сильнее на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-wound-light") return;
          if (!c.proc && b.hero.currentHp <= b.hero.maxHp * 0.5) {
            c.mult *= 1.18;
          }
        }
      }
    },
    {
      id: "warm_suture",
      name: "Тёплый шов",
      description: "Первый удар по здоровью дополнительно лечит тебя на 18% нанесённого урона, до 30% силы лечения за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-wound-light") return;
          if (c.proc || s.spent || c.hpDamage <= 0) return;
          s.spent = true;
          healUnit(
            b, b.hero,
            Math.min(c.hpDamage * 0.18, b.hero.healingPower * 0.3),
            "Тёплый шов"
          );
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-wound-light") return;
          s.spent = false;
        }
      }
    },
    {
      id: "scar_glass",
      name: "Стекло шрама",
      description: "Если после применения у тебя неполное здоровье и сияние не ниже 5% максимального здоровья, ты получаешь щит на 3 хода в размере 20% силы лечения.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-wound-light") return;
          if (b.hero.currentHp < b.hero.maxHp &&
              gauge(b, "light") >= b.hero.maxHp * 0.05) {
            ward(b, b.hero.healingPower * 0.2);
          }
        }
      }
    }
  ]);

  // Суд: особый вклад сияния против бед, новый запас за казнь и отблеск по соседней цели.
  defineSkillMastery("mage-judgement", [
    {
      id: "witnesses",
      name: "Свидетели бед",
      description: "Против цели с 2 или более бедами урон Суда от потраченного сияния растёт на 18%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-judgement") return;
          if (!c.proc && badCount(b.enemy) >= 2) c.flat *= 1.18;
        }
      }
    },
    {
      id: "new_verdict",
      name: "Новый приговор",
      description: "Добивание Судом возвращает сияние в размере 15% урона по здоровью, до 3% твоего максимального здоровья. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-judgement") return;
          if (c.proc || s.paid || c.hpDamage <= 0 ||
              b.enemy.currentHp > 0) return;
          s.paid = true;
          bumpGauge(
            b, "light",
            Math.round(Math.min(c.hpDamage * 0.15, b.hero.maxHp * 0.03)),
            Math.round(b.hero.maxHp * 0.6)
          );
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-judgement") return;
          s.paid = false;
        }
      }
    },
    {
      id: "verdict_echo",
      name: "Отзвук приговора",
      description: "Если у основной цели есть хотя бы 1 беда, одна другая цель получает 15% урона Суда по здоровью. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-judgement") return;
          if (c.proc || s.spent || c.hpDamage <= 0 ||
              badCount(b.enemy) < 1) return;
          s.spent = true;
          echo(
            b, other(b), c.hpDamage * 0.15,
            "Отзвук приговора", "holy"
          );
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-judgement") return;
          s.spent = false;
        }
      }
    }
  ]);

  // Зеркало рассвета: более ранний порог щита, разовое отражение и дополнительное сияние от первого поглощения.
  defineSkillMastery("mage-dawn-mirror", [
    {
      id: "early_dawn",
      name: "Ранний рассвет",
      description: "Зеркало создаёт свой щит уже при сиянии от 8,5% максимального здоровья вместо 10%.",
      patch: skill => around(
        skill,
        () => null,
        null,
        (b, k, m, p) => {
          if (!p.ready && gauge(b, "light") >= b.hero.maxHp * 0.085) {
            p.ready = true;
          }
        }
      )
    },
    {
      id: "mirror_shard",
      name: "Ответ зеркала",
      description: "Первое поглощение щитом Зеркала отражает во врага 30% поглощённого урона, до 25% силы магии.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-dawn-mirror") return;
          s.shield = gauge(b, "light") >= b.hero.maxHp * 0.1
            ? getEffect(b.hero, "shield") : null;
          s.armed = Boolean(s.shield);
        },
        incoming(b, s) {
          if (s.armed) s.covered = getEffect(b.hero, "shield") === s.shield;
        },
        hurt(b, s, c) {
          if (!s.armed || !s.covered || c.absorbed <= 0) return;
          s.armed = false;
          echo(
            b, b.enemy,
            Math.min(c.absorbed * 0.3, b.hero.skillDamage * 0.25),
            "Ответ зеркала", "holy"
          );
        }
      }
    },
    {
      id: "caught_ray",
      name: "Пойманный луч",
      description: "Первое поглощение щитом Зеркала даёт ещё 20% поглощённого урона в виде сияния, до 2% максимального здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-dawn-mirror") return;
          s.shield = gauge(b, "light") >= b.hero.maxHp * 0.1
            ? getEffect(b.hero, "shield") : null;
          s.armed = Boolean(s.shield);
        },
        incoming(b, s) {
          if (s.armed) s.covered = getEffect(b.hero, "shield") === s.shield;
        },
        hurt(b, s, c) {
          if (!s.armed || !s.covered || c.absorbed <= 0) return;
          s.armed = false;
          bumpGauge(
            b, "light",
            Math.round(Math.min(c.absorbed * 0.2, b.hero.maxHp * 0.02)),
            Math.round(b.hero.maxHp * 0.6)
          );
        }
      }
    }
  ]);

  // Световой затвор: дополнительный отвод жара, долгий щит при тяжёлой ране и возврат маны от поглощения.
  defineSkillMastery("mage-light-shutter", [
    {
      id: "cool_hinge",
      name: "Холодная петля",
      description: "Если перед применением было хотя бы 25 жара, Затвор снимает ещё до 5 жара до нагрева ценой навыка.",
      patch: skill => around(
        skill,
        b => gauge(b, "core_mage") >= 25,
        (b, k, hot) => { if (hot) cool(b, 5); }
      )
    },
    {
      id: "held_shutter",
      name: "Удержанный затвор",
      description: "Если перед применением у тебя не больше 40% здоровья, созданный Затвором щит держится на 1 ход дольше.",
      patch: skill => around(
        skill,
        b => b.hero.currentHp <= b.hero.maxHp * 0.4,
        (b, k, wounded) => {
          const e = getEffect(b.hero, "shield");
          if (wounded && e) e.duration += 1;
        }
      )
    },
    {
      id: "light_rebate",
      name: "Световой вычет",
      description: "Первое поглощение щитом Затвора возвращает ману в размере 10% поглощённого урона, до 3 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-light-shutter") return;
          s.shield = getEffect(b.hero, "shield");
          s.armed = Boolean(s.shield);
        },
        incoming(b, s) {
          if (s.armed) s.covered = getEffect(b.hero, "shield") === s.shield;
        },
        hurt(b, s, c) {
          if (!s.armed || !s.covered || c.absorbed <= 0) return;
          s.armed = false;
          mana(b, Math.min(3, c.absorbed * 0.1));
        }
      }
    }
  ]);

  // Хрустальный полдень: защита остатком сияния, усиление боковых лучей и пробивание из-под щита.
  defineSkillMastery("mage-crystal-noon", [
    {
      id: "noon_shell",
      name: "Оболочка полдня",
      description: "После применения оставшееся сияние даёт щит на 3 хода: 15% запаса, до 4% максимального здоровья. Сияние сохраняется.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-crystal-noon") return;
          ward(b, Math.min(gauge(b, "light") * 0.15, b.hero.maxHp * 0.04));
        }
      }
    },
    {
      id: "wide_refraction",
      name: "Широкая грань",
      description: "Если после расхода осталось сияние, боковые удары Полдня сильнее на 20%: 60% основного удара вместо 50%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-crystal-noon") return;
          if (!c.proc && gauge(b, "light") > 0 &&
              b.focus != null && b.enemy.slot !== b.focus) {
            c.mult *= 1.2;
          }
        }
      }
    },
    {
      id: "shield_prism",
      name: "Щитовая призма",
      description: "Если во время удара на тебе есть щит и осталось сияние, Полдень игнорирует ещё 20% защиты цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-crystal-noon") return;
          if (!c.proc && gauge(b, "light") > 0 &&
              getEffect(b.hero, "shield")) {
            c.pierce += 0.2;
          }
        }
      }
    }
  ]);

  // Теневой слуга: долгая слабость, плоть от порчи и возврат за гибель связанного слуги; учитываются обе формы.
  defineSkillMastery("mage-shadow-servant", [
    {
      id: "long_shadow",
      name: "Длинная тень",
      description: "Если на цели после призыва есть и слабость, и порча, слабость держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-shadow-servant") return;
          const e = getEffect(b.enemy, "weaken");
          if (e && getEffect(b.enemy, "corruption")) e.duration += 1;
        }
      }
    },
    {
      id: "blighted_vessel",
      name: "Порченый сосуд",
      description: "Если перед призывом цель уже под порчей, здоровье нового слуги растёт на 20%.",
      patch: skill => around(
        skill,
        b => ({
          old: army(b),
          blighted: Boolean(getEffect(b.enemy, "corruption"))
        }),
        (b, k, m) => {
          if (m.blighted) {
            fresh(b, m.old).filter(u => u.type === "minion")
              .forEach(u => bolster(u, 0.2));
          }
        }
      )
    },
    {
      id: "shadow_debt",
      name: "Долг тени",
      description: "Естественная гибель призванного слуги возвращает 3 маны, если исходная цель ещё жива и под порчей. Жертва и отзыв возврата не дают.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-shadow-servant") return;
          const u = newest(b, c.skill);
          if (u) (s.targets ||= new Map()).set(u, b.enemy);
        },
        summonDeath(b, s, c) {
          const target = s.targets?.get(c.summon);
          if (!target) return;
          s.targets.delete(c.summon);
          if (target.currentHp > 0 && getEffect(target, "corruption")) {
            mana(b, 3);
          }
        }
      }
    }
  ]);

  // Проклятие порчи: продление существующей порчи, пробивание при повторной слабости и мана за три беды.
  defineSkillMastery("mage-curse", [
    {
      id: "deep_root",
      name: "Глубокий корень",
      description: "Если после Проклятия на цели есть порча, она держится на 1 ход дольше.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-curse") return;
          const e = getEffect(b.enemy, "corruption");
          if (e) e.duration += 1;
        }
      }
    },
    {
      id: "old_hex",
      name: "Старый наговор",
      description: "Если цель уже под слабостью до удара, Проклятие игнорирует ещё 20% её защиты.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-curse") return;
          if (!c.proc && getEffect(b.enemy, "weaken")) c.pierce += 0.2;
        }
      }
    },
    {
      id: "three_knots",
      name: "Три узла",
      description: "Если после Проклятия на цели есть хотя бы 3 беды, ты возвращаешь 3 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-curse") return;
          if (badCount(b.enemy) >= 3) mana(b, 3);
        }
      }
    }
  ]);

  // Ночной разряд: награда за три беды, вскрытие порчи и перескок по второй цели без повторных срабатываний.
  defineSkillMastery("mage-night-bolt", [
    {
      id: "heavy_night",
      name: "Тяжёлая ночь",
      description: "Против цели с 3 или более бедами Ночной разряд бьёт на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-night-bolt") return;
          if (!c.proc && badCount(b.enemy) >= 3) c.mult *= 1.15;
        }
      }
    },
    {
      id: "blight_flash",
      name: "Вспышка порчи",
      description: "Первое попадание Разряда по здоровью цели под порчей сразу вызывает 150% урона одного её тика, сохраняя длительность порчи.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-night-bolt") return;
          const e = getEffect(b.enemy, "corruption");
          if (c.proc || s.spent || c.hpDamage <= 0 ||
              b.enemy.currentHp <= 0 || !e) return;
          s.spent = true;
          tickDamageEffect(b, b.enemy, e, e.value * 1.5, "Вспышка порчи");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-night-bolt") return;
          s.spent = false;
        }
      }
    },
    {
      id: "night_arc",
      name: "Ночная дуга",
      description: "Если у цели есть хотя бы 2 беды, одна другая цель получает 20% урона Разряда по здоровью. Один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-night-bolt") return;
          if (c.proc || s.spent || c.hpDamage <= 0 ||
              badCount(b.enemy) < 2) return;
          s.spent = true;
          echo(b, other(b), c.hpDamage * 0.2, "Ночная дуга", "dark");
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-night-bolt") return;
          s.spent = false;
        }
      }
    }
  ]);

  // Переписать порчу: продление повторной записи, усиление раскрытия и мана за заражённую группу.
  defineSkillMastery("mage-rewrite-blight", [
    {
      id: "second_edition",
      name: "Вторая редакция",
      description: "На каждой задетой цели, которая уже была под порчей перед ударом, оставшаяся порча держится на 1 ход дольше. Не больше 1 добавочного хода на цель за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          if (c.proc) return;
          s.old ||= new Set();
          if (getEffect(b.enemy, "corruption")) s.old.add(b.enemy);
          else s.old.delete(b.enemy);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          if (!c.proc && s.old?.has(b.enemy)) {
            (s.targets ||= new Set()).add(b.enemy);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          for (const u of s.targets || []) {
            const e = getEffect(u, "corruption");
            if (u.currentHp > 0 && e) e.duration += 1;
          }
          s.old?.clear();
          s.targets?.clear();
        }
      }
    },
    {
      id: "open_margin",
      name: "Открытые поля",
      description: "На задетых целях под порчей раскрытие как минимум на 18% сильнее обычного раскрытия этого навыка. Уже более сильное раскрытие сохраняется.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          if (!c.proc) (s.targets ||= new Set()).add(b.enemy);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          const spec = (c.skill.appliedEffects || []).find(e =>
            e.id === "exposed" && e.target !== "self"
          );
          if (spec) {
            const base = resolveSkillEffectValue(b.hero, spec, c.skill) *
              (1 + tm(b.hero, "val:exposed"));
            for (const u of s.targets || []) {
              const e = getEffect(u, "exposed");
              if (u.currentHp > 0 && e && getEffect(u, "corruption")) {
                e.value = Math.max(
                  e.value, base * getEnemyResist(u, "exposed") * 1.18
                );
              }
            }
          }
          s.targets?.clear();
        }
      }
    },
    {
      id: "shared_ink",
      name: "Общие чернила",
      description: "Если после применения под порчей остаются хотя бы 2 живых врага, ты возвращаешь 3 маны.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-rewrite-blight") return;
          if (livingFoes(b).filter(u =>
            getEffect(u, "corruption")
          ).length >= 2) mana(b, 3);
        }
      }
    }
  ]);

  // Жертвенный ритуал: усиление жертвы на порченой цели, частичный возврат платы здоровьем и щит от сосуда.
  defineSkillMastery("mage-ritual-sacrifice", [
    {
      id: "tainted_altar",
      name: "Порченый алтарь",
      description: "Если ты жертвуешь слугу, а цель уже под порчей, удар Ритуала становится ещё на 15% сильнее.",
      patch: skill => around(
        skill,
        b => Boolean(
          army(b).find(u => u.type === "minion" && !u.persistent) &&
          getEffect(b.enemy, "corruption")
        ),
        null,
        (b, k, ready, p) => {
          if (ready) p.scale = (p.scale ?? 1) * 1.15;
        }
      )
    },
    {
      id: "returned_blood",
      name: "Возврат крови",
      description: "При Ритуале без слуги ты после удара лечишься на половину здоровья, фактически уплаченного самим Ритуалом.",
      patch: skill => around(
        skill,
        b => ({
          empty: !army(b).some(u =>
            u.type === "minion" && !u.persistent
          ),
          hp: b.hero.currentHp
        }),
        (b, k, m) => {
          if (m.empty && m.paid > 0) {
            healUnit(b, b.hero, m.paid * 0.5, "Возврат крови");
          }
        },
        (b, k, m) => {
          m.paid = Math.max(0, m.hp - b.hero.currentHp);
        }
      )
    },
    {
      id: "vessel_shell",
      name: "Скорлупа сосуда",
      description: "Жертва слуги даёт щит на 3 хода: 15% его максимального здоровья, но не больше 4% твоего максимального здоровья.",
      patch: skill => around(
        skill,
        b => army(b).find(u =>
          u.type === "minion" && !u.persistent
        )?.maxHp || 0,
        (b, k, hp) => {
          ward(b, Math.min(hp * 0.15, b.hero.maxHp * 0.04));
        }
      )
    }
  ]);

  // Страница бед: промежуточный порог, добавочная выплата за три беды и перенос порчи на одну чистую цель.
  defineSkillMastery("mage-page-of-woes", [
    {
      id: "unfinished_page",
      name: "Неполная страница",
      description: "При ровно 2 бедах на цели удар Страницы сильнее на 18%. При 3 бедах действует обычное усиление навыка.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "mage-page-of-woes") return;
          if (!c.proc && badCount(b.enemy) === 2) c.mult *= 1.18;
        }
      }
    },
    {
      id: "ink_dividend",
      name: "Доля чернил",
      description: "Если перед применением у основной цели есть хотя бы 3 беды, Страница возвращает ещё 2% максимальной маны сверх своей обычной выплаты.",
      patch: skill => around(
        skill,
        b => badCount(b.enemy) >= 3,
        (b, k, paid) => {
          if (paid) mana(b, b.hero.maxMana * 0.02);
        }
      )
    },
    {
      id: "loose_leaf",
      name: "Летучий лист",
      description: "При 3 бедах на основной цели её порча копируется на одну другую живую цель без порчи: 100% силы на 2 хода. Исходная порча сохраняется.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "mage-page-of-woes") return;
          const e = getEffect(b.enemy, "corruption");
          const target = livingFoes(b).find(u =>
            u !== b.enemy && !getEffect(u, "corruption")
          );
          if (!e || !target || badCount(b.enemy) < 3) return;
          const old = b.enemy;
          const focus = b.focus;
          try {
            b.focus = focus ?? old.slot;
            b.enemy = target;
            fx(b, "corruption", 2, e.value);
          } finally {
            b.enemy = old;
            b.focus = focus;
          }
        }
      }
    }
  ]);
})();

