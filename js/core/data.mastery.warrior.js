// Mastery of the warrior skills: at level V each skill offers three upgrades of its own (designed with Codex).
(() => {
  const drive = b => b.hero.currentMana;
  const gauge = (b, id) => Number(b.mech?.[id]?.value || 0);

  const mana = (b, amount) => {
    const old = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, old + Math.round(amount));
    if (b.hero.currentMana > old) {
      emit(b, "mana", {
        target: "hero",
        amount: b.hero.currentMana - old
      });
    }
  };

  // Читаем подготовку исходного навыка до её сброса в afterAction.
  const ready = (b, id) =>
    Boolean(b.fxList?.find(e => e.def.id === "tree-" + id)?.state.ready);

  const record = (b, s, c) => {
    if (c.proc || c.noEcho) return;
    s.hits ||= new Map();
    const row = s.hits.get(b.enemy) || {
      foe: b.enemy,
      count: 0,
      damage: 0,
      killed: false
    };
    row.count += 1;
    row.damage += c.hpDamage;
    row.killed ||= c.hpDamage > 0 && b.enemy.currentHp <= 0;
    s.hits.set(b.enemy, row);
  };

  const flush = s => {
    const rows = [...(s.hits?.values() || [])];
    s.hits = new Map();
    return rows;
  };

  // Один дополнительный ход за жизнь объекта эффекта.
  const prolong = (s, effect) => {
    if (!effect) return;
    s.extended ||= new WeakSet();
    if (s.extended.has(effect)) return;
    s.extended.add(effect);
    effect.duration += 1;
  };

  // Усиливаем только добавляемый запас, не умножая существующий щит повторно.
  // Уже существующий щит выше общего ограничения не уменьшаем.
  const shield = (b, amount, duration = 2) => {
    if (b.hero.currentHp <= 0 || amount <= 0) return;
    const old = effectValue(b.hero, "shield");
    const bonus = Math.round(
      amount *
      (1 + tm(b.hero, "val:shield")) *
      (1 + tm(b.hero, "shield")) *
      (b.firstShieldBoost ? 1.5 : 1)
    );
    const e = fx(b, "shield", duration, amount, { self: true });
    if (e) {
      e.value = Math.max(
        old,
        Math.min(Math.round(b.hero.maxHp * 0.6), old + bonus)
      );
    }
  };

  const heal = (b, ratio, label) => {
    if (b.hero.currentHp > 0) {
      healUnit(b, b.hero, b.hero.maxHp * ratio, label);
    }
  };

  const atFoe = (b, foe, run) => {
    const old = b.enemy;
    const focus = b.focus;
    try {
      b.enemy = foe;
      return run();
    } finally {
      b.enemy = old;
      b.focus = focus;
    }
  };

  const chip = (b, rows, ratio, label) => {
    const source = rows.find(r => r.damage > 0);
    const foe = source && livingFoes(b).find(f => f !== source.foe);
    if (foe) {
      atFoe(b, foe, () =>
        procDamage(b, source.damage * ratio, label)
      );
    }
  };

  const strengthen = (s, e, amount, cap) => {
    if (!e) return;
    s.strengthened ||= new WeakSet();
    if (s.strengthened.has(e)) return;
    s.strengthened.add(e);
    e.value = Math.max(e.value, Math.min(cap, e.value + amount));
  };

  // Сила уже содержит расход камней и долю попадания по соседней цели.
  const spentStones = (b, c) => {
    const splash = b.focus != null && b.enemy.slot !== b.focus
      ? Number(c.skill.aoe || 1)
      : 1;
    const scale = c.power /
      Math.max(0.001, getSkillPower(c.skill, b.hero) * splash);
    return Math.max(0, Math.min(5, Math.round((scale - 1) / 0.22)));
  };

  // Раскол: запас за лезвием, возврат за добивание, скол во вторую цель.
  defineSkillMastery("warrior-raskol", [
    {
      id: "heavy_edge",
      name: "Вес лезвия",
      description: "При напоре от 70 перед попаданием Раскол бьёт на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-raskol") return;
          if (!c.proc && !c.noEcho && drive(b) >= 70) c.mult *= 1.18;
        }
      }
    },
    {
      id: "split_reward",
      name: "Разбитый заслон",
      description: "Убийство Расколом возвращает 8 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-raskol") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-raskol") return;
          if (flush(s).some(r => r.killed)) mana(b, 8);
        }
      }
    },
    {
      id: "flying_chip",
      name: "Летящий скол",
      description: "Один другой живой враг получает 18% суммарного урона, нанесённого первой раненой цели за применение. Скол не запускает эффекты попадания.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-raskol") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-raskol") return;
          chip(b, flush(s), 0.18, "Летящий скол");
        }
      }
    }
  ]);

  // Обухом в грудь: разгон с нуля, сбитое дыхание, быстрый выход из разгона.
  defineSkillMastery("warrior-blunt-drive", [
    {
      id: "cold_start",
      name: "Первый толчок",
      description: "При напоре ниже 40 перед попаданием удар дополнительно даёт 6 напора, один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          if (!c.proc && !c.noEcho && drive(b) < 40) s.low = true;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          if (flush(s).length && s.low) mana(b, 6);
          s.low = false;
        }
      }
    },
    {
      id: "short_breath",
      name: "Сбитый вдох",
      description: "Попадание по врагу с физическим замахом или зарядом ослабляет его на 15% на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          if (
            !c.proc && !c.noEcho &&
            (b.enemy.charge || b.enemy.intent?.kind === "physical")
          ) {
            fx(b, "weaken", 1, 0.15);
          }
        }
      }
    },
    {
      id: "start_step",
      name: "Шаг разгона",
      description: "Если после попавшего приёма напор ещё ниже 70, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blunt-drive") return;
          if (flush(s).length && drive(b) < 70) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Кромка щита: энергия блока, ответ кромкой, защита от тяжёлого удара.
  defineSkillMastery("warrior-shield-edge", [
    {
      id: "ringing_rim",
      name: "Звонкая кромка",
      description: "Первый блок до твоего следующего хода возвращает ещё 6 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-edge") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.blocked <= 0) return;
          s.armed = false;
          mana(b, 6);
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "rim_reply",
      name: "Ответ кромкой",
      description: "Первый блок до твоего следующего хода наносит врагу 25% снятого стойкой урона, максимум 35% твоего физического урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-edge") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.blocked <= 0) return;
          s.armed = false;
          if (b.hero.currentHp > 0) {
            procDamage(
              b,
              Math.min(c.blocked * 0.25, b.hero.physicalDamage * 0.35),
              "Ответ кромкой"
            );
          }
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "braced_rim",
      name: "Подпёртый край",
      description: "До твоего следующего хода первый тяжёлый физический удар по стойке наносит на 18% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-edge") return;
          s.armed = true;
        },
        incoming(b, s, c) {
          if (
            !s.armed || !b.guard || c.parried ||
            !c.heavy || c.kind !== "physical"
          ) return;
          s.armed = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Дуга меча: ширина дуги, темп при запасе, отдача от двух целей.
  defineSkillMastery("warrior-sword-arc", [
    {
      id: "wide_tip",
      name: "Дальний кончик",
      description: "Доля силы Дуги по остальным врагам увеличивается на 25% относительно текущей.",
      patch: s => ({ aoe: Number(s.aoe || 0) * 1.25 })
    },
    {
      id: "held_arc",
      name: "Натянутая дуга",
      description: "Если после попавшей Дуги у тебя от 70 напора, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-sword-arc") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-sword-arc") return;
          if (flush(s).length && drive(b) >= 70) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "paired_ring",
      name: "Двойной звон",
      description: "Попадание хотя бы по двум разным врагам возвращает ещё 7 напора за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-sword-arc") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-sword-arc") return;
          if (flush(s).length >= 2) mana(b, 7);
        }
      }
    }
  ]);

  // Пролом строя: боковой нажим, оплата прорыва убийством, прикрытие в толпе.
  defineSkillMastery("warrior-break-ranks", [
    {
      id: "side_pressure",
      name: "Боковой нажим",
      description: "Доля силы Пролома по остальным врагам увеличивается на 25% относительно текущей.",
      patch: s => ({ aoe: Number(s.aoe || 0) * 1.25 })
    },
    {
      id: "opened_rank",
      name: "Разомкнутый ряд",
      description: "Убийство Проломом возвращает 12 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-break-ranks") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-break-ranks") return;
          if (flush(s).some(r => r.killed)) mana(b, 12);
        }
      }
    },
    {
      id: "crowd_cover",
      name: "Прикрытие обломками",
      description: "Попадание по трём разным врагам даёт щит на 3% твоего здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-break-ranks") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-break-ranks") return;
          if (flush(s).length >= 3) shield(b, b.hero.maxHp * 0.03);
        }
      }
    }
  ]);

  // Подсечь шаг: долгое замедление, усиление против замаха, напор за срыв шага.
  defineSkillMastery("warrior-cut-step", [
    {
      id: "caught_heel",
      name: "Зацепленная пятка",
      description: "Замедление от приёма длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          flush(s).forEach(r => prolong(s, getEffect(r.foe, "slow")));
        }
      }
    },
    {
      id: "trip_windup",
      name: "Сломанный шаг",
      description: "Против заряда замедление усиливается ещё на 5 процентных пунктов, до 40%. При обновлении прибавка не накапливается.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          if (!c.proc && !c.noEcho && b.enemy.charge) {
            s.charged ||= new Set();
            s.charged.add(b.enemy);
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          flush(s).forEach(r => {
            if (s.charged?.has(r.foe)) {
              strengthen(s, getEffect(r.foe, "slow"), 0.05, 0.4);
            }
          });
          s.charged = new Set();
        }
      }
    },
    {
      id: "stolen_step",
      name: "Украденный шаг",
      description: "Если после приёма напор ниже 70 и на поражённой цели есть замедление, ты получаешь ещё 4 напора за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-cut-step") return;
          if (
            flush(s).some(r => getEffect(r.foe, "slow")) &&
            drive(b) < 70
          ) mana(b, 4);
        }
      }
    }
  ]);

  // Держать линию: пробой при запасе, щит из стойки, ровный темп линии.
  defineSkillMastery("warrior-hold-line", [
    {
      id: "straight_point",
      name: "Прямое остриё",
      description: "При напоре от 70 перед попаданием ты игнорируешь ещё 20% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-hold-line") return;
          if (!c.proc && !c.noEcho && drive(b) >= 70) c.pierce += 0.2;
        }
      }
    },
    {
      id: "guarded_line",
      name: "Прикрытая линия",
      description: "Попадание из стойки даёт щит в 30% твоей физической защиты на 2 хода, один раз за применение. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-hold-line") return;
          if (!c.proc && !c.noEcho && b.guard) s.guarded = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-hold-line") return;
          if (s.guarded) shield(b, b.hero.physicalDefense * 0.3);
          s.guarded = false;
        }
      }
    },
    {
      id: "even_line",
      name: "Ровный нажим",
      description: "Если после попавшего приёма у тебя от 70 напора, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-hold-line") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-hold-line") return;
          if (flush(s).length && drive(b) >= 70) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Двойной нажим: второй удар в стык, возврат за пару, нарушение равновесия.
  defineSkillMastery("warrior-double-pressure", [
    {
      id: "same_seam",
      name: "Повторный стык",
      description: "Если первое попадание по цели состоялось, следующие удары этого применения игнорируют ещё 30% её брони.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          if (!c.proc && !c.noEcho && s.hits?.has(b.enemy)) {
            c.pierce += 0.3;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          flush(s);
        }
      }
    },
    {
      id: "paired_drive",
      name: "Сцепленный нажим",
      description: "Два попадания по одной цели возвращают ещё 6 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          if (flush(s).some(r => r.count >= 2)) mana(b, 6);
        }
      }
    },
    {
      id: "broken_balance",
      name: "Сбитый упор",
      description: "Два попадания по одной цели замедляют её на 15% на 1 ход.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-double-pressure") return;
          flush(s).forEach(r => {
            if (r.count >= 2 && r.foe.currentHp > 0) {
              atFoe(b, r.foe, () => fx(b, "slow", 1, 0.15));
            }
          });
        }
      }
    }
  ]);

  // Клятва бастиона: длительность поддержки, оплата блока, запас при высоком здоровье.
  defineSkillMastery("warrior-bastion-oath", [
    {
      id: "lasting_oath",
      name: "Долгое эхо",
      description: "Регенерация или закалка от Клятвы длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-bastion-oath") return;
          (c.skill.appliedEffects || [])
            .filter(e => ["regeneration", "fortify"].includes(e.id))
            .forEach(e => prolong(s, getEffect(b.hero, e.id)));
        }
      }
    },
    {
      id: "kept_word",
      name: "Сдержанное слово",
      description: "Первый блок после Клятвы до твоего следующего хода возвращает 8 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-bastion-oath") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.blocked <= 0) return;
          s.armed = false;
          mana(b, 8);
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "spare_bastion",
      name: "Запас бастиона",
      description: "При здоровье от 80% после Клятвы ты получаешь дополнительный щит на 4% здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-bastion-oath") return;
          if (hpRatio(b.hero) >= 0.8) shield(b, b.hero.maxHp * 0.04);
        }
      }
    }
  ]);

  // Срезать замах: долгая слабость, глубокое ослабление заряда, напор за блок ослабленной цели.
  defineSkillMastery("warrior-clip-windup", [
    {
      id: "lost_swing",
      name: "Потерянный замах",
      description: "Слабость от приёма длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          if (!c.proc && !c.noEcho) {
            prolong(s, getEffect(b.enemy, "weaken"));
          }
        }
      }
    },
    {
      id: "cut_tension",
      name: "Срезанное усилие",
      description: "При ударе по заряду слабость усиливается ещё на 5 процентных пунктов, до 45%. При обновлении прибавка не накапливается.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          if (!c.proc && !c.noEcho && b.enemy.charge) {
            s.charged ||= new Set();
            s.charged.add(b.enemy);
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          if (!c.proc && !c.noEcho && s.charged?.has(b.enemy)) {
            strengthen(s, getEffect(b.enemy, "weaken"), 0.05, 0.45);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          s.charged = new Set();
        }
      }
    },
    {
      id: "stolen_effort",
      name: "Чужое усилие",
      description: "До твоего следующего хода первый блок ослабленного этим приёмом врага возвращает 6 напора.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-clip-windup") return;
          s.targets = new Set(
            flush(s)
              .filter(r => getEffect(r.foe, "weaken"))
              .map(r => r.foe)
          );
          s.armed = true;
        },
        hurt(b, s, c) {
          if (
            !s.armed || c.blocked <= 0 ||
            !s.targets?.has(b.enemy) || !getEffect(b.enemy, "weaken")
          ) return;
          s.armed = false;
          mana(b, 6);
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Череполом: вклад в срыв заряда, долгое ошеломление, напор за добивание.
  defineSkillMastery("warrior-skullbreaker", [
    {
      id: "cracked_windup",
      name: "Треснувший замах",
      description: "Урон Череполома учитывается для срыва заряда на 20% сильнее. Дополнительного урона здоровью это не наносит.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-skullbreaker") return;
          if (
            c.proc || c.noEcho || c.hpDamage <= 0 ||
            !b.enemy.charge || b.enemy.currentHp <= 0
          ) return;
          b.enemy.charge.taken += c.hpDamage * 0.2;
          if (b.enemy.charge.taken >= b.enemy.charge.need) breakCharge(b);
        }
      }
    },
    {
      id: "ringing_skull",
      name: "Звон в черепе",
      description: "Ошеломление от Череполома длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-skullbreaker") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-skullbreaker") return;
          flush(s).forEach(r => prolong(s, getEffect(r.foe, "stagger")));
        }
      }
    },
    {
      id: "fallen_weight",
      name: "Рухнувшая тяжесть",
      description: "Убийство Череполомом возвращает 10 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-skullbreaker") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-skullbreaker") return;
          if (flush(s).some(r => r.killed)) mana(b, 10);
        }
      }
    }
  ]);

  // Удар из стойки: пробой после блока, щит за ответ, быстрый выход из стойки.
  defineSkillMastery("warrior-guard-strike", [
    {
      id: "open_after_block",
      name: "Открытая брешь",
      description: "Подготовленный блоком Удар из стойки игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-guard-strike") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            c.pierce += 0.25;
          }
        }
      }
    },
    {
      id: "shield_rebound",
      name: "Упругий заслон",
      description: "Попадание подготовленным блоком приёмом даёт щит на 3% здоровья на 2 хода, один раз за применение. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-guard-strike") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            s.answer = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-guard-strike") return;
          if (s.answer) shield(b, b.hero.maxHp * 0.03);
          s.answer = false;
        }
      }
    },
    {
      id: "guard_exit",
      name: "Выход из стойки",
      description: "Если подготовленный блоком приём попал, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-guard-strike") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            s.answer = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-guard-strike") return;
          if (s.answer) c.tempo *= 0.85;
          s.answer = false;
        }
      }
    }
  ]);

  // Клинок на весу: точка пробоя, плавный возврат, защита при сохранённом запасе.
  defineSkillMastery("warrior-poised-blade", [
    {
      id: "hanging_point",
      name: "Остриё на весу",
      description: "При напоре от 70 перед попаданием Клинок игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-poised-blade") return;
          if (!c.proc && !c.noEcho && drive(b) >= 70) c.pierce += 0.25;
        }
      }
    },
    {
      id: "smooth_return",
      name: "Плавный возврат",
      description: "Если после попавшего Клинка у тебя от 70 напора, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-poised-blade") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-poised-blade") return;
          if (flush(s).length && drive(b) >= 70) c.tempo *= 0.85;
        }
      }
    },
    {
      id: "quiet_guard",
      name: "Тихая гарда",
      description: "Если после Клинка у тебя от 70 напора, первый физический удар до твоего следующего хода наносит на 15% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-poised-blade") return;
          s.armed = drive(b) >= 70;
        },
        incoming(b, s, c) {
          if (!s.armed || c.parried || c.kind !== "physical") return;
          s.armed = false;
          c.amount *= 0.85;
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Выдох стали: отдача выпущенного напора, пробой заряда, возврат за убийство.
  defineSkillMastery("warrior-steel-exhale", [
    {
      id: "deep_exhale",
      name: "Глубокий выдох",
      description: "Каждая единица выпущенного остатка напора даёт на 50% больше прибавки к силе относительно текущей.",
      patch: s => ({ driveScale: Number(s.driveScale || 0) * 1.5 })
    },
    {
      id: "through_windup",
      name: "Сквозь замах",
      description: "Против заряда Выдох игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-steel-exhale") return;
          if (!c.proc && !c.noEcho && b.enemy.charge) c.pierce += 0.25;
        }
      }
    },
    {
      id: "second_breath",
      name: "Второе дыхание",
      description: "Убийство Выдохом возвращает 12 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-steel-exhale") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-steel-exhale") return;
          if (flush(s).some(r => r.killed)) mana(b, 12);
        }
      }
    }
  ]);

  // Поднять забрало: заживление после ранения, дополнительный напор, быстрый ответ.
  defineSkillMastery("warrior-lift-visor", [
    {
      id: "fresh_air",
      name: "Свежий воздух",
      description: "Если приём подготовлен прошлым ранением и попал, ты лечишь 3% здоровья один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            s.wounded = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (s.wounded) heal(b, 0.03, "Свежий воздух");
          s.wounded = false;
        }
      }
    },
    {
      id: "angry_breath",
      name: "Сердитый вдох",
      description: "Если приём подготовлен прошлым ранением и попал, ты получаешь ещё 6 напора за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            s.wounded = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (s.wounded) mana(b, 6);
          s.wounded = false;
        }
      }
    },
    {
      id: "quick_visor",
      name: "Ответ без паузы",
      description: "Если приём подготовлен прошлым ранением и попал, время действия уменьшается на 15%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            s.wounded = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-lift-visor") return;
          if (s.wounded) c.tempo *= 0.85;
          s.wounded = false;
        }
      }
    }
  ]);

  // Несломленная линия: удержанный пробой, щит за полный нажим, быстрый выход после убийства.
  defineSkillMastery("warrior-unbroken-line", [
    {
      id: "unyielding_point",
      name: "Несгибаемое остриё",
      description: "При напоре от 70 перед попаданием Линия игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          if (!c.proc && !c.noEcho && drive(b) >= 70) c.pierce += 0.25;
        }
      }
    },
    {
      id: "line_anchor",
      name: "Якорь линии",
      description: "Попадание при напоре от 70 перед ударом даёт щит на 4% здоровья на 2 хода, один раз за применение. Общий запас щита ограничен 60% здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          if (!c.proc && !c.noEcho && drive(b) >= 70) {
            s.full ||= new Set();
            s.full.add(b.enemy);
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          if (!c.proc && !c.noEcho && s.full?.has(b.enemy)) {
            s.landed = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          if (s.landed) shield(b, b.hero.maxHp * 0.04);
          s.landed = false;
          s.full = new Set();
        }
      }
    },
    {
      id: "free_line",
      name: "Свободный рубеж",
      description: "Если Линия убивает цель, время действия уменьшается на 18%.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-unbroken-line") return;
          if (flush(s).some(r => r.killed)) c.tempo *= 0.82;
        }
      }
    }
  ]);

  // Последний довод: глубина выпуска, напор за добивание, широкая ударная волна.
  defineSkillMastery("warrior-last-blow", [
    {
      id: "last_reserve",
      name: "Последний запас",
      description: "Каждая единица выпущенного остатка напора даёт на 50% больше прибавки к силе относительно текущей.",
      patch: s => ({ driveScale: Number(s.driveScale || 0) * 1.5 })
    },
    {
      id: "finished_argument",
      name: "Закрытый спор",
      description: "Убийство Последним доводом возвращает 15 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-last-blow") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-last-blow") return;
          if (flush(s).some(r => r.killed)) mana(b, 15);
        }
      }
    },
    {
      id: "far_argument",
      name: "Дальний довод",
      description: "Доля силы Последнего довода по остальным врагам увеличивается на 30% относительно текущей.",
      patch: s => ({ aoe: Number(s.aoe || 0) * 1.3 })
    }
  ]);

  // Вернуть удар: усиленный ответ после блока, контрудар новой стойки, напор за повторный блок.
  defineSkillMastery("warrior-return-blow", [
    {
      id: "remembered_weight",
      name: "Память тяжести",
      description: "Подготовленный блоком ответ бьёт на 15% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-return-blow") return;
          if (!c.proc && !c.noEcho && ready(b, c.skill.id)) {
            c.mult *= 1.15;
          }
        }
      }
    },
    {
      id: "return_echo",
      name: "Эхо возврата",
      description: "Первый блок новой стойкой до твоего следующего хода наносит врагу 25% снятого стойкой урона, максимум 40% твоего физического урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-return-blow") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.blocked <= 0) return;
          s.armed = false;
          if (b.hero.currentHp > 0) {
            procDamage(
              b,
              Math.min(c.blocked * 0.25, b.hero.physicalDamage * 0.4),
              "Эхо возврата"
            );
          }
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "closed_circle",
      name: "Замкнутый круг",
      description: "Первый блок после приёма до твоего следующего хода возвращает ещё 8 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-return-blow") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.blocked <= 0) return;
          s.armed = false;
          mana(b, 8);
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Свирепый замах: длительность раны или толчка, ярость за охват, давление на поражённую цель.
  defineSkillMastery("warrior-savage-swing", [
    {
      id: "lasting_trace",
      name: "Долгий след",
      description: "Рана или ошеломление от Замаха длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-savage-swing") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-savage-swing") return;
          const ids = (c.skill.appliedEffects || [])
            .filter(e => ["bleed", "stagger"].includes(e.id))
            .map(e => e.id);
          flush(s).forEach(r =>
            ids.forEach(id => prolong(s, getEffect(r.foe, id)))
          );
        }
      }
    },
    {
      id: "crowd_fury",
      name: "Ярость размаха",
      description: "Каждая отдельная поражённая Замахом цель даёт ещё 2 ярости, максимум 6 за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-savage-swing") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-savage-swing") return;
          bumpGauge(b, "fury", Math.min(6, flush(s).length * 2), 100);
        }
      }
    },
    {
      id: "press_trace",
      name: "По живому следу",
      description: "Если перед попаданием цель уже под раной или ошеломлением, Замах бьёт на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-savage-swing") return;
          if (
            !c.proc && !c.noEcho &&
            (getEffect(b.enemy, "bleed") || getEffect(b.enemy, "stagger"))
          ) c.mult *= 1.18;
        }
      }
    }
  ]);

  // Рубить с плеча: отдача потраченной ярости, возврат за убийство, пробой по ране.
  defineSkillMastery("warrior-shoulder-cut", [
    {
      id: "full_shoulder",
      name: "Всей тяжестью",
      description: "Каждая потраченная единица ярости даёт на 65% больше прибавки к силе относительно текущей.",
      patch: s => ({ furyScale: Number(s.furyScale || 0) * 1.65 })
    },
    {
      id: "hot_finish",
      name: "Горячая развязка",
      description: "Убийство этим приёмом возвращает 10 ярости, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-shoulder-cut") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shoulder-cut") return;
          if (flush(s).some(r => r.killed)) bumpGauge(b, "fury", 10, 100);
        }
      }
    },
    {
      id: "wound_seam",
      name: "Шов раны",
      description: "По цели с кровотечением удар игнорирует ещё 25% брони.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shoulder-cut") return;
          if (!c.proc && !c.noEcho && getEffect(b.enemy, "bleed")) {
            c.pierce += 0.25;
          }
        }
      }
    }
  ]);

  // Раззадорить: ярость за попадание, защита от тяжёлого ответа, пробой на разгоне.
  defineSkillMastery("warrior-provoke", [
    {
      id: "sharp_taunt",
      name: "Острая насмешка",
      description: "Если приём попал, ты получаешь ещё 4 ярости за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-provoke") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-provoke") return;
          if (flush(s).length) bumpGauge(b, "fury", 4, 100);
        }
      }
    },
    {
      id: "expected_rush",
      name: "Ожидаемый выпад",
      description: "Первый тяжёлый удар после приёма до твоего следующего хода наносит на 18% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-provoke") return;
          s.armed = true;
        },
        incoming(b, s, c) {
          if (!s.armed || c.parried || !c.heavy) return;
          s.armed = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "boiling_point",
      name: "Точка кипения",
      description: "При ярости от 50 перед попаданием приём игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-provoke") return;
          if (!c.proc && !c.noEcho && gauge(b, "fury") >= 50) {
            c.pierce += 0.25;
          }
        }
      }
    }
  ]);

  // Отдать ярость: сила расхода, тлеющая ярость за убийство, ударная отдача соседу.
  defineSkillMastery("warrior-anger-release", [
    {
      id: "burning_release",
      name: "Жгучая отдача",
      description: "Каждая потраченная единица ярости даёт на 40% больше прибавки к силе относительно текущей.",
      patch: s => ({ furyScale: Number(s.furyScale || 0) * 1.4 })
    },
    {
      id: "live_ember",
      name: "Живой уголёк",
      description: "Убийство этим приёмом возвращает 12 ярости, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-anger-release") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-anger-release") return;
          if (flush(s).some(r => r.killed)) bumpGauge(b, "fury", 12, 100);
        }
      }
    },
    {
      id: "anger_shard",
      name: "Осколок ярости",
      description: "Один другой живой враг получает 18% суммарного урона, нанесённого первой раненой цели за применение. Осколок не запускает эффекты попадания.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-anger-release") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-anger-release") return;
          chip(b, flush(s), 0.18, "Осколок ярости");
        }
      }
    }
  ]);

  // Кровавый размах: долгая рана, вскрытие двойным ударом, ярость от разных целей.
  defineSkillMastery("warrior-blood-sweep", [
    {
      id: "ragged_track",
      name: "Рваный след",
      description: "Рана от Размаха длится на 1 ход дольше. Продление не накапливается при обновлении эффекта.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          flush(s).forEach(r => prolong(s, getEffect(r.foe, "bleed")));
        }
      }
    },
    {
      id: "crossed_wound",
      name: "Поперёк раны",
      description: "Два попадания по одной цели после применения дополнительно наносят ей половину текущего урона её раны. Рана сохраняется; выплата одна на цель.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          flush(s).forEach(r => {
            const e = getEffect(r.foe, "bleed");
            if (r.count >= 2 && e && r.foe.currentHp > 0) {
              atFoe(b, r.foe, () =>
                procDamage(b, e.value * 0.5, "Поперёк раны", "blood")
              );
            }
          });
        }
      }
    },
    {
      id: "blood_chorus",
      name: "Кровавый отклик",
      description: "Каждая отдельная поражённая Размахом цель даёт ещё 3 ярости, максимум 9 за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-sweep") return;
          bumpGauge(b, "fury", Math.min(9, flush(s).length * 3), 100);
        }
      }
    }
  ]);

  // Унять дрожь: плотность щита, возобновление ярости после раны, снятие замедления.
  defineSkillMastery("warrior-steady-hands", [
    {
      id: "steady_cover",
      name: "Ровный заслон",
      description: "Если после приёма на тебе есть щит, его запас растёт на 15%, суммарно до 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-steady-hands") return;
          const e = getEffect(b.hero, "shield");
          if (e) {
            e.value = Math.max(
              e.value,
              Math.min(
                Math.round(b.hero.maxHp * 0.6),
                Math.round(e.value * 1.15)
              )
            );
          }
        }
      }
    },
    {
      id: "rekindled_anger",
      name: "Скрытая искра",
      description: "Первая рана после приёма до твоего следующего хода возвращает ещё 8 ярости.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-steady-hands") return;
          s.armed = true;
        },
        hurt(b, s, c) {
          if (!s.armed || c.hpDamage <= 0) return;
          s.armed = false;
          bumpGauge(b, "fury", 8, 100);
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "steady_step",
      name: "Твёрдый шаг",
      description: "Приём снимает с тебя замедление. Если оно было, время действия уменьшается на 15%.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-steady-hands") return;
          if (getEffect(b.hero, "slow")) {
            removeFx(b.hero, "slow");
            c.tempo *= 0.85;
          }
        }
      }
    }
  ]);

  // Удар щитом: пробой тяжёлого замаха, напор за контроль или камень формы, защита стены.
  defineSkillMastery("warrior-shield-bash", [
    {
      id: "siege_rim",
      name: "Осадный кант",
      description: "По врагу с зарядом или тяжёлым намерением удар игнорирует ещё 30% брони.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shield-bash") return;
          if (
            !c.proc && !c.noEcho &&
            (b.enemy.charge || b.enemy.intent?.heavy)
          ) c.pierce += 0.3;
        }
      }
    },
    {
      id: "ringing_payment",
      name: "Отдача щита",
      description: "Оглушение или ошеломление поражённой цели возвращает 6 напора за применение. Форма «Подпереть стену» вместо этого даёт 6 напора при непустой стене.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-shield-bash") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-bash") return;
          const rows = flush(s);
          const wall = getHeroSkillForm(b.hero, c.skill.id)?.id ===
            "warrior-shield-bash#wall";
          if (
            (wall && gauge(b, "bulwark") > 0) ||
            rows.some(r =>
              getEffect(r.foe, "stun") || getEffect(r.foe, "stagger")
            )
          ) mana(b, 6);
        }
      }
    },
    {
      id: "wall_recoil",
      name: "Упор в стену",
      description: "Если после приёма есть хотя бы один камень стены, первый физический удар до твоего следующего хода наносит на 15% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-bash") return;
          s.armed = gauge(b, "bulwark") > 0;
        },
        incoming(b, s, c) {
          if (!s.armed || c.parried || c.kind !== "physical") return;
          s.armed = false;
          c.amount *= 0.85;
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Шаг за щитом: щит полной стены, пробой под прикрытием, сохранение одного камня.
  defineSkillMastery("warrior-shield-step", [
    {
      id: "full_masonry",
      name: "Полная кладка",
      description: "При пяти камнях после Шага ты получаешь щит на 3% здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-step") return;
          if (gauge(b, "bulwark") >= 5) shield(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "covered_point",
      name: "Прикрытое остриё",
      description: "При трёх камнях стены перед попаданием Шаг игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shield-step") return;
          if (!c.proc && !c.noEcho && gauge(b, "bulwark") >= 3) {
            c.pierce += 0.25;
          }
        }
      }
    },
    {
      id: "held_stone",
      name: "Придержанный камень",
      description: "Первая рана до твоего следующего хода возвращает 1 потерянный от неё камень стены.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-step") return;
          s.armed = true;
          s.wall = 0;
        },
        incoming(b, s, c) {
          if (s.armed && !c.parried) s.wall = gauge(b, "bulwark");
        },
        hurt(b, s, c) {
          if (!s.armed || c.hpDamage <= 0) return;
          s.armed = false;
          if (s.wall > 0 && gauge(b, "bulwark") < s.wall) {
            bumpGauge(b, "bulwark", 1, 5);
          }
        },
        turnStart(b, s) { s.armed = false; }
      }
    }
  ]);

  // Каменная пятка: отдача каждого камня, защитный скол, осколки во вторую цель.
  defineSkillMastery("warrior-stone-heel", [
    {
      id: "dense_heel",
      name: "Плотный камень",
      description: "Прибавка к силе за каждый камень перед ударом увеличивается на 40% относительно обычных 10% за камень.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          if (c.proc || c.noEcho) return;
          const n = gauge(b, "bulwark");
          c.mult *= (1 + n * 0.14) / (1 + n * 0.1);
        }
      }
    },
    {
      id: "safe_chip",
      name: "Защитный скол",
      description: "Попадание при хотя бы одном камне перед ударом даёт щит на 3% здоровья на 2 хода, один раз за применение. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          if (!c.proc && !c.noEcho && gauge(b, "bulwark") > 0) {
            s.stone = true;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          if (s.stone) shield(b, b.hero.maxHp * 0.03);
          s.stone = false;
        }
      }
    },
    {
      id: "heel_shards",
      name: "Брызги камня",
      description: "При трёх камнях перед попаданием один другой живой враг получает 18% урона приёма по первой раненой цели. Осколки не запускают эффекты попадания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          if (!c.proc && !c.noEcho && gauge(b, "bulwark") >= 3) {
            s.scatter = true;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-stone-heel") return;
          const rows = flush(s);
          if (s.scatter) chip(b, rows, 0.18, "Брызги камня");
          s.scatter = false;
        }
      }
    }
  ]);

  // Залатать брешь: защита при ране, напор полной кладки, быстрый ремонт прочной стены.
  defineSkillMastery("warrior-mend-breach", [
    {
      id: "fresh_patch",
      name: "Свежая заплата",
      description: "Если после ремонта здоровье ниже 50%, ты получаешь щит на 3% здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-mend-breach") return;
          if (hpRatio(b.hero) < 0.5) shield(b, b.hero.maxHp * 0.03);
        }
      }
    },
    {
      id: "finished_masonry",
      name: "Завершённая кладка",
      description: "При пяти камнях стены после ремонта ты получаешь ещё 6 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-mend-breach") return;
          if (gauge(b, "bulwark") >= 5) mana(b, 6);
        }
      }
    },
    {
      id: "quick_mortar",
      name: "Быстрый раствор",
      description: "Если после ремонта в стене хотя бы 3 камня, время действия уменьшается на 15%.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-mend-breach") return;
          if (gauge(b, "bulwark") >= 3) c.tempo *= 0.85;
        }
      }
    }
  ]);

  // Обрушить стену: сила потраченных камней, сохранённое основание, напор за убийство.
  defineSkillMastery("warrior-falling-wall", [
    {
      id: "heavy_rubble",
      name: "Тяжёлый завал",
      description: "Каждый потраченный камень даёт ещё 6 процентных пунктов прибавки к силе: 28% вместо 22%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          if (c.proc || c.noEcho) return;
          const n = spentStones(b, c);
          c.mult *= (1 + n * 0.28) / (1 + n * 0.22);
        }
      }
    },
    {
      id: "kept_foundation",
      name: "Целое основание",
      description: "Если ты тратишь хотя бы 3 камня и приём попадает, после обрушения возвращается 1 камень.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          if (!c.proc && !c.noEcho) {
            s.stones = Math.max(Number(s.stones || 0), spentStones(b, c));
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          if (flush(s).length && s.stones >= 3) {
            bumpGauge(b, "bulwark", 1, 5);
          }
          s.stones = 0;
        }
      }
    },
    {
      id: "rubble_drive",
      name: "Пролом под завалом",
      description: "Убийство этим приёмом возвращает 10 напора, один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          record(b, s, c);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-falling-wall") return;
          if (flush(s).some(r => r.killed)) mana(b, 10);
        }
      }
    }
  ]);

  // Крепкий стык: добавочный щит камней, напор за поглощение, пробой с прочной стены.
  defineSkillMastery("warrior-firm-joint", [
    {
      id: "tight_joint",
      name: "Плотный стык",
      description: "За каждый сохранённый камень после приёма ты получаешь дополнительный щит на 0,45% здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-firm-joint") return;
          shield(b, b.hero.maxHp * gauge(b, "bulwark") * 0.0045);
        }
      }
    },
    {
      id: "joint_resonance",
      name: "Отклик стыка",
      description: "Первое поглощение урона щитом после приёма до твоего следующего хода возвращает 6 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-firm-joint") return;
          s.armed = Boolean(getEffect(b.hero, "shield"));
        },
        hurt(b, s, c) {
          if (!s.armed || c.absorbed <= 0) return;
          s.armed = false;
          mana(b, 6);
        },
        turnStart(b, s) { s.armed = false; }
      }
    },
    {
      id: "wall_point",
      name: "Остриё стены",
      description: "При трёх камнях стены перед попаданием приём игнорирует ещё 25% брони цели.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-firm-joint") return;
          if (!c.proc && !c.noEcho && gauge(b, "bulwark") >= 3) {
            c.pierce += 0.25;
          }
        }
      }
    }
  ]);
})();

(() => {
  const gauge = (b, id) => Number(b.mech?.[id]?.value || 0);
  const low = b => b.hero.currentHp < b.hero.maxHp * 0.3;
  const heavy = b => Boolean(b.enemy.charge || b.enemy.intent?.heavy);
  const primary = b => b.focus == null || b.enemy.slot === b.focus;

  const mana = (b, amount) => {
    const before = b.hero.currentMana;
    b.hero.currentMana = Math.min(b.hero.maxMana, before + amount);
    if (b.hero.currentMana > before) {
      emit(b, "mana", {
        target: "hero",
        amount: b.hero.currentMana - before
      });
    }
  };

  const extend = (unit, id) => {
    const e = getEffect(unit, id);
    if (e) e.duration += 1;
  };

  const shield = (b, amount) => {
    if (b.hero.currentHp <= 0 || amount <= 0) return;
    const cap = Math.round(b.hero.maxHp * 0.6);
    const e = getEffect(b.hero, "shield");
    if (e) {
      e.value = Math.max(e.value, Math.min(cap, e.value + Math.round(amount)));
      e.duration = Math.max(e.duration, 2);
    } else {
      const added = fx(b, "shield", 2, Math.round(amount), { self: true });
      if (added) added.value = Math.min(cap, added.value);
    }
  };

  const other = (b, run) => {
    const target = b.enemy;
    const foe = livingFoes(b).find(unit => unit !== target);
    if (!foe) return;
    const focus = b.focus;
    try {
      b.focus = focus ?? target.slot;
      b.enemy = foe;
      run(foe);
    } finally {
      b.enemy = target;
      b.focus = focus;
    }
  };

  const broke = (b, s) => Boolean(
    s.breaks &&
    gauge(b, "breaker") === 0 &&
    getEffect(b.enemy, "armor_break")
  );

  const watchShield = (b, s) => {
    s.covered = Boolean(
      s.ready &&
      s.shield &&
      getEffect(b.hero, "shield") === s.shield
    );
  };

  // Рваная рана: длинный надрез, ярость у кровавого порога или перенос крови на соседнюю цель.
  defineSkillMastery("warrior-rend", [
    {
      id: "ragged",
      name: "Зазубренный край",
      description: "После попадания ты продлеваешь оставшуюся рану на 1 ход. Если форма снимает рану, вместо продления она наносит ещё 50% одного прежнего тика, максимум 15% урона попадания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          s.old = effectValue(b.enemy, "bleed");
          s.damage = 0;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          if (!c.proc) s.damage += c.hpDamage;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          if (!(s.damage > 0)) return;
          if (getEffect(b.enemy, "bleed")) {
            extend(b.enemy, "bleed");
          } else if (!(c.skill.appliedEffects || []).some(e => e.id === "bleed")) {
            procDamage(
              b,
              Math.min(s.old * 0.5, s.damage * 0.15),
              "Зазубренный край",
              "blood"
            );
          }
        }
      }
    },
    {
      id: "red_threshold",
      name: "Алая черта",
      description: "Если перед попаданием у тебя меньше 30% здоровья, ты получаешь ещё 8 ярости один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          s.low = low(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          if (!c.proc && s.low && c.hpDamage > 0) s.reward = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          if (s.reward) bumpGauge(b, "fury", 8, 100);
          s.reward = false;
        }
      }
    },
    {
      id: "blood_trace",
      name: "Кровавый след",
      description: "После попадания ты переносишь на одного другого врага рану с 50% её силы на 2 хода. Можно перенести и прежнюю рану, снятую формой.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          s.old = effectValue(b.enemy, "bleed");
          s.hit = false;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          if (!c.proc && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-rend") return;
          const value = effectValue(b.enemy, "bleed") || s.old;
          if (s.hit && value > 0) {
            other(b, () => fx(b, "bleed", 2, Math.max(1, Math.round(value * 0.5))));
          }
          s.hit = false;
        }
      }
    }
  ]);

  // Опасная близость: жертва открывает порог, страхует тело или возвращает напор через рану.
  defineSkillMastery("warrior-danger-close", [
    {
      id: "edge",
      name: "У края",
      description: "Если после жертвы, перед попаданием у тебя меньше 30% здоровья, этот удар бьёт на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-danger-close") return;
          if (low(b)) c.mult *= 1.18;
        }
      }
    },
    {
      id: "blood_crust",
      name: "Кровяная корка",
      description: "После жертвы ты получаешь щит на 2 хода в размере 1,6% максимального здоровья. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-danger-close") return;
          shield(b, b.hero.maxHp * 0.016);
        }
      }
    },
    {
      id: "reckless_wound",
      name: "Кровавый отлив",
      description: "Первый тик раны на этой цели после приёма возвращает тебе 8 напора. Срабатывает один раз до следующего применения.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-danger-close") return;
          s.target = getEffect(b.enemy, "bleed") ? b.enemy : null;
        },
        tick(b, s, c) {
          if (
            !s.target ||
            s.target !== b.enemy ||
            c.id !== "bleed" ||
            !(c.amount > 0) ||
            !getEffect(b.enemy, "bleed")
          ) return;
          s.target = null;
          mana(b, 8);
        }
      }
    }
  ]);

  // Сорвать рубцы: усиление старой раны, её длительность у порога или ярость после опасного попадания.
  defineSkillMastery("warrior-rip-scar", [
    {
      id: "old_scar",
      name: "Старая трещина",
      description: "Если перед ударом на цели уже есть рана, ты бьёшь на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          if (getEffect(b.enemy, "bleed")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "unhealed",
      name: "Не заживает",
      description: "Если перед попаданием у тебя меньше 30% здоровья, ты продлеваешь оставшуюся на цели рану на 1 ход.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          s.low = low(b);
          s.hit = false;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          if (!c.proc && c.hpDamage > 0 && s.low) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          if (s.hit) extend(b.enemy, "bleed");
          s.hit = false;
        }
      }
    },
    {
      id: "scar_rage",
      name: "Память боли",
      description: "Попадание при здоровье ниже 30% даёт тебе 10 ярости. Срабатывает один раз за применение; здоровье проверяется до попадания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          s.low = low(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          if (!c.proc && s.low && c.hpDamage > 0) s.reward = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-rip-scar") return;
          if (s.reward) bumpGauge(b, "fury", 10, 100);
          s.reward = false;
        }
      }
    }
  ]);

  // Перевязка на зубах: долечивание у порога, укороченная собственная рана или напор за добивание.
  defineSkillMastery("warrior-teeth-bandage", [
    {
      id: "tight_knot",
      name: "Тугой узел",
      description: "Если перед попаданием у тебя меньше 30% здоровья, после приёма ты получаешь регенерацию: 2% максимального здоровья за ход, 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          s.low = low(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          if (!c.proc && s.low && c.hpDamage > 0) s.mend = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          if (s.mend) {
            fx(b, "regeneration", 2, Math.round(b.hero.maxHp * 0.02), { self: true });
          }
          s.mend = false;
        }
      }
    },
    {
      id: "clot",
      name: "Прижать рану",
      description: "После приёма ты сокращаешь собственное кровотечение на 1 ход.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          const e = getEffect(b.hero, "bleed");
          if (e) e.duration = Math.max(0, e.duration - 1);
        }
      }
    },
    {
      id: "last_strip",
      name: "Последняя полоска",
      description: "Если попадание этим приёмом добивает врага, ты возвращаешь 8 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-teeth-bandage") return;
          if (s.kill) mana(b, 8);
          s.kill = false;
        }
      }
    }
  ]);

  // Бойня: вскрытая цель, возврат напора за убийство или защита после жертвы у порога.
  defineSkillMastery("warrior-carnage", [
    {
      id: "open_flesh",
      name: "Открытая плоть",
      description: "Если до попадания на цели есть рана, ты наносишь этим ударом на 18% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-carnage") return;
          if (getEffect(b.enemy, "bleed")) c.mult *= 1.18;
        }
      }
    },
    {
      id: "red_payment",
      name: "Кровавый расчёт",
      description: "Если попадание Бойни добивает врага, ты возвращаешь 12 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-carnage") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-carnage") return;
          if (s.kill) mana(b, 12);
          s.kill = false;
        }
      }
    },
    {
      id: "blood_shell",
      name: "Багровый панцирь",
      description: "Если после жертвы, перед ударом у тебя меньше 30% здоровья, ты получаешь щит на 2% максимального здоровья на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-carnage") return;
          s.low = low(b);
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-carnage") return;
          if (s.low) shield(b, b.hero.maxHp * 0.02);
        }
      }
    }
  ]);

  // Кровь в ладони: третий взмах, ярость у порога или рана после трёх попаданий.
  defineSkillMastery("warrior-blood-palm", [
    {
      id: "third_finger",
      name: "Третий заруб",
      description: "Третий удар серии бьёт на 40% сильнее, если первые два попали и сняли здоровье. Бонус срабатывает один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          s.swings = (s.swings || 0) + 1;
          if (!s.used && s.swings === 3 && s.hits === 2) {
            c.mult *= 1.4;
            s.used = true;
          }
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          if (!c.proc && c.hpDamage > 0) s.hits = (s.hits || 0) + 1;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          s.swings = 0;
          s.hits = 0;
          s.used = false;
        }
      }
    },
    {
      id: "hot_palm",
      name: "Горячая ладонь",
      description: "Первое попадание серии при здоровье ниже 30% даёт тебе 10 ярости после приёма. Здоровье проверяется до попадания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          s.low = low(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          if (!c.proc && s.low && c.hpDamage > 0) s.reward = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          if (s.reward) bumpGauge(b, "fury", 10, 100);
          s.reward = false;
        }
      }
    },
    {
      id: "three_cuts",
      name: "Три борозды",
      description: "Если за применение ты снимаешь здоровье тремя попаданиями, оставшаяся на цели рана держится на 1 ход дольше.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          if (!c.proc && c.hpDamage > 0) s.hits = (s.hits || 0) + 1;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-blood-palm") return;
          if (s.hits >= 3) extend(b.enemy, "bleed");
          s.hits = 0;
        }
      }
    }
  ]);

  // Удар молота: тяжёлый замах, долгий надлом или трещина, сохранённая после обрушения.
  defineSkillMastery("warrior-hammer-blow", [
    {
      id: "windup_crusher",
      name: "Разбить замах",
      description: "По цели, которая готовит тяжёлый удар, ты бьёшь на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-hammer-blow") return;
          if (heavy(b)) c.mult *= 1.18;
        }
      }
    },
    {
      id: "lasting_fault",
      name: "Глубокий разлом",
      description: "Если приём доводит трещины до обрушения брони, ты продлеваешь полученный надлом на 1 ход.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-hammer-blow") return;
          if (primary(b)) {
            s.breaks = gauge(b, "breaker") + Number(c.skill.cracks || 1) >= 5;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-hammer-blow") return;
          if (broke(b, s)) extend(b.enemy, "armor_break");
          s.breaks = false;
        }
      }
    },
    {
      id: "keystone",
      name: "Выбитый камень",
      description: "Если приём обрушает броню, после обнуления шкалы ты получаешь 1 трещину для следующего разгона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-hammer-blow") return;
          if (primary(b)) {
            s.breaks = gauge(b, "breaker") + Number(c.skill.cracks || 1) >= 5;
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-hammer-blow") return;
          if (broke(b, s)) bumpGauge(b, "breaker", 1, 5);
          s.breaks = false;
        }
      }
    }
  ]);

  // Найти шов: точнее использовать трещины, ускорить подготовленный выпад или удержать надлом.
  defineSkillMastery("warrior-find-seam", [
    {
      id: "needle",
      name: "Игла в шве",
      description: "Ты получаешь ещё 3% пробивания за каждую накопленную перед попаданием трещину, максимум 15%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          c.pierce += Math.min(0.15, gauge(b, "breaker") * 0.03);
        }
      }
    },
    {
      id: "known_seam",
      name: "Знакомый шов",
      description: "Если перед ударом накоплено хотя бы 3 трещины, темп этого применения уменьшается на 15%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          s.quick = gauge(b, "breaker") >= 3;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          if (s.quick) c.tempo *= 0.85;
          s.quick = false;
        }
      }
    },
    {
      id: "hold_seam",
      name: "Развести края",
      description: "Если ты попадаешь по уже надломленной броне, оставшийся надлом держится на 1 ход дольше.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          s.open = Boolean(getEffect(b.enemy, "armor_break"));
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          if (!c.proc && s.open && c.hpDamage > 0) s.extend = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-find-seam") return;
          if (s.extend) extend(b.enemy, "armor_break");
          s.extend = false;
        }
      }
    }
  ]);

  const spentCracks = (b, c) => Math.max(0, Math.min(5,
    Math.round((c.power / Math.max(0.001, getSkillPower(c.skill, b.hero)) - 1) / 0.35)
  ));

  // Обрушение: три потраченные трещины дают слабость, сохраняют задел или посылают осколок в другую цель.
  defineSkillMastery("warrior-shatter-armor", [
    {
      id: "buckled",
      name: "Сбитый каркас",
      description: "Если ты тратишь хотя бы 3 трещины и попадаешь, цель получает слабость 15% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          s.loaded = spentCracks(b, c) >= 3;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          if (!c.proc && s.loaded && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          if (s.hit) fx(b, "weaken", 2, 0.15);
          s.hit = false;
        }
      }
    },
    {
      id: "remaining_crack",
      name: "Незакрытый скол",
      description: "После траты хотя бы 3 трещин ты возвращаешь 1 трещину. Попадание для возврата не требуется.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          s.loaded = spentCracks(b, c) >= 3;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          if (s.loaded) bumpGauge(b, "breaker", 1, 5);
          s.loaded = false;
        }
      }
    },
    {
      id: "flying_shard",
      name: "Летящий осколок",
      description: "При трате хотя бы 3 трещин ты поражаешь одного другого врага на 15% урона попадания. Срабатывает один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          s.loaded = spentCracks(b, c) >= 3;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          if (!c.proc && s.loaded) {
            s.damage = Math.max(s.damage || 0, c.hpDamage);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shatter-armor") return;
          if (s.damage > 0) {
            other(b, () => procDamage(b, s.damage * 0.15, "Летящий осколок"));
          }
          s.damage = 0;
        }
      }
    }
  ]);

  // Расклинить: более глубокий надлом, быстрый выход из удачного клина или защита от тяжёлого ответа.
  defineSkillMastery("warrior-wedge", [
    {
      id: "split_wide",
      name: "Развести плиты",
      description: "Если приём обрушает броню, ты усиливаешь надлом на 8 процентных пунктов, максимум до 65%. Уже более сильный надлом сохраняется.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          s.breaks = gauge(b, "breaker") + Number(c.skill.cracks || 1) >= 5;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          if (broke(b, s)) {
            const e = getEffect(b.enemy, "armor_break");
            e.value = Math.max(e.value, Math.min(0.65, e.value + 0.08));
          }
          s.breaks = false;
        }
      }
    },
    {
      id: "free_wedge",
      name: "Выдернуть клин",
      description: "Если приём обрушает броню, темп этого применения уменьшается на 15%.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          s.breaks = gauge(b, "breaker") + Number(c.skill.cracks || 1) >= 5;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          if (broke(b, s)) c.tempo *= 0.85;
          s.breaks = false;
        }
      }
    },
    {
      id: "loose_grip",
      name: "Разжатый хват",
      description: "После обрушения брони этим приёмом первый тяжёлый удар этой цели по тебе слабее на 18%. Бонус ждёт до следующего применения.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          s.breaks = gauge(b, "breaker") + Number(c.skill.cracks || 1) >= 5;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-wedge") return;
          s.target = broke(b, s) ? b.enemy : null;
          s.breaks = false;
        },
        incoming(b, s, c) {
          if (!s.target || b.enemy !== s.target || !c.heavy || c.parried) return;
          s.target = null;
          c.amount *= 0.82;
        }
      }
    }
  ]);

  // Осыпь железа: добить боковую цель под надломом, разнести надлом или вернуть напор за охват.
  defineSkillMastery("warrior-iron-scree", [
    {
      id: "sidefall",
      name: "Боковой обвал",
      description: "По дополнительным целям с надломом брони ты наносишь этим приёмом на 35% больше урона.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-iron-scree") return;
          if (!primary(b) && getEffect(b.enemy, "armor_break")) c.mult *= 1.35;
        }
      }
    },
    {
      id: "spreading_fault",
      name: "Ползущий разлом",
      description: "Если после попадания основная цель остаётся под надломом, ты накладываешь надлом 15% на одного другого врага на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-iron-scree") return;
          if (!c.proc && primary(b) && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-iron-scree") return;
          if (s.hit && getEffect(b.enemy, "armor_break")) {
            other(b, () => fx(b, "armor_break", 2, 0.15));
          }
          s.hit = false;
        }
      }
    },
    {
      id: "scrap_rhythm",
      name: "Ритм осыпи",
      description: "Если приём снимает здоровье хотя бы двум разным врагам, ты возвращаешь 10 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-iron-scree") return;
          if (!c.proc && c.hpDamage > 0) {
            s.targets ||= new Set();
            s.targets.add(b.enemy);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-iron-scree") return;
          if (s.targets?.size >= 2) mana(b, 10);
          s.targets = new Set();
        }
      }
    }
  ]);

  // Снять пластины: удар в тяжёлый замах, трофей за убийство или удержание оголённой брони.
  defineSkillMastery("warrior-strip-plate", [
    {
      id: "raised_arm",
      name: "Поднятая пластина",
      description: "Если цель готовит тяжёлый удар, ты получаешь ещё 20% пробивания для этого попадания.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          if (heavy(b)) c.pierce += 0.2;
        }
      }
    },
    {
      id: "ringing_spoil",
      name: "Звенящий трофей",
      description: "Если попадание этим приёмом добивает врага, ты возвращаешь ещё 10 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          if (s.kill) mana(b, 10);
          s.kill = false;
        }
      }
    },
    {
      id: "bare_rivets",
      name: "Голые заклёпки",
      description: "После попадания по уже надломленной броне ты продлеваешь оставшийся надлом на 1 ход.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          s.open = Boolean(getEffect(b.enemy, "armor_break"));
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          if (!c.proc && s.open && c.hpDamage > 0) s.extend = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-strip-plate") return;
          if (s.extend) extend(b.enemy, "armor_break");
          s.extend = false;
        }
      }
    }
  ]);

  // Стена щитов: длительность любой защитной формы, страховка от тяжёлого удара или напор за прикрытие.
  defineSkillMastery("warrior-shield-wall", [
    {
      id: "long_masonry",
      name: "Длинная кладка",
      description: "После приёма ты продлеваешь его щит на 1 ход. У формы с укреплением вместо щита на 1 ход продлевается укрепление.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-wall") return;
          extend(
            b.hero,
            c.skill.specialAction === "light_shield" ? "shield" : "fortify"
          );
        }
      }
    },
    {
      id: "earth_brace",
      name: "Упор в землю",
      description: "После приёма первый тяжёлый удар по тебе до следующего твоего хода наносит на 18% меньше урона.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-wall") return;
          s.ready = true;
        },
        incoming(b, s, c) {
          if (!s.ready || !c.heavy || c.parried) return;
          s.ready = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "shelter_breath",
      name: "Вдох за стеной",
      description: "До следующего твоего хода первый удар, дошедший до твоего щита или укрепления после приёма, возвращает 8 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-shield-wall") return;
          s.ready = Boolean(
            getEffect(b.hero, "shield") || getEffect(b.hero, "fortify")
          );
        },
        incoming(b, s, c) {
          if (
            !s.ready ||
            c.parried ||
            !(getEffect(b.hero, "shield") || getEffect(b.hero, "fortify"))
          ) return;
          s.ready = false;
          mana(b, 8);
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    }
  ]);

  // Принять на обод: первый блок быстрее копит Возмездие, страхует тяжёлый ответ или режет ободом.
  defineSkillMastery("warrior-catch-rim", [
    {
      id: "deep_rim",
      name: "Глубокий обод",
      description: "Первый блок стойкой после приёма добавляет Возмездие в размере ещё 15% заблокированного урона, максимум 3% твоего максимального здоровья. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-catch-rim") return;
          s.ready = true;
        },
        hurt(b, s, c) {
          if (!s.ready || !(c.blocked > 0)) return;
          s.ready = false;
          bumpGauge(
            b,
            "guardian",
            Math.min(c.blocked * 0.15, b.hero.maxHp * 0.03),
            b.hero.maxHp
          );
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "brace_rim",
      name: "Подпереть обод",
      description: "Первый тяжёлый удар по тебе в стойке после приёма слабее на 18%. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-catch-rim") return;
          s.ready = true;
        },
        incoming(b, s, c) {
          if (!s.ready || !b.guard || !c.heavy || c.parried) return;
          s.ready = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "cutting_rim",
      name: "Режущий обод",
      description: "Первый блок после приёма наносит атакующему 20% заблокированного урона, максимум 40% твоей физической силы. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-catch-rim") return;
          s.ready = true;
        },
        hurt(b, s, c) {
          if (!s.ready || !(c.blocked > 0)) return;
          s.ready = false;
          procDamage(
            b,
            Math.min(c.blocked * 0.2, b.hero.physicalDamage * 0.4),
            "Режущий обод"
          );
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    }
  ]);

  // Малая расплата: вес потраченного долга, возврат напора или щит от удачного взыскания.
  defineSkillMastery("warrior-small-reckoning", [
    {
      id: "exact_due",
      name: "Точный расчёт",
      description: "Ты превращаешь потраченное Возмездие в урон на 18% эффективнее: 94,4% вместо 80%.",
      patch: s => ({ debtScale: Number(s.debtScale || 0) * 1.18 })
    },
    {
      id: "paid_breath",
      name: "Оплаченный вдох",
      description: "Если приём тратит Возмездие и попадание снимает здоровье, ты возвращаешь 8 напора один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          s.loaded = c.flat > 0;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          if (!c.proc && s.loaded && c.hpDamage > 0) s.paid = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          if (s.paid) mana(b, 8);
          s.paid = false;
        }
      }
    },
    {
      id: "receipt",
      name: "Железная расписка",
      description: "При попадании ты получаешь щит на 20% базового урона от потраченного Возмездия, максимум 3% твоего максимального здоровья, на 2 хода. Общий запас щита ограничен 60% здоровья.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          s.flat = Math.max(0, c.flat);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          if (!c.proc && c.hpDamage > 0) {
            s.cover = Math.max(
              s.cover || 0,
              Math.min(s.flat * 0.2, b.hero.maxHp * 0.03)
            );
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-small-reckoning") return;
          shield(b, s.cover || 0);
          s.cover = 0;
        }
      }
    }
  ]);

  // Глухой заслон: усиленный щит при большом долге, напор за поглощение или короткий ответ из-за щита.
  defineSkillMastery("warrior-closed-bulwark", [
    {
      id: "double_board",
      name: "Двойная доска",
      description: "При запасе Возмездия от 20% твоего здоровья ты добавляешь к существующему после приёма щиту ещё 2,5% максимального здоровья. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-closed-bulwark") return;
          if (
            gauge(b, "guardian") >= b.hero.maxHp * 0.2 &&
            getEffect(b.hero, "shield")
          ) {
            shield(b, b.hero.maxHp * 0.025);
          }
        }
      }
    },
    {
      id: "sheltered_step",
      name: "Шаг под щитом",
      description: "Первое поглощение щитом после приёма возвращает тебе 8 напора. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-closed-bulwark") return;
          s.shield = getEffect(b.hero, "shield");
          s.ready = Boolean(s.shield);
        },
        incoming(b, s) {
          watchShield(b, s);
        },
        hurt(b, s, c) {
          if (!s.ready || !s.covered || !(c.absorbed > 0)) return;
          s.ready = false;
          s.covered = false;
          mana(b, 8);
        },
        turnStart(b, s) {
          s.ready = false;
          s.covered = false;
        }
      }
    },
    {
      id: "blind_answer",
      name: "Ответ из тени",
      description: "Первое поглощение щитом после приёма наносит атакующему 20% поглощённого урона, максимум 40% твоей физической силы. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-closed-bulwark") return;
          s.shield = getEffect(b.hero, "shield");
          s.ready = Boolean(s.shield);
        },
        incoming(b, s) {
          watchShield(b, s);
        },
        hurt(b, s, c) {
          if (!s.ready || !s.covered || !(c.absorbed > 0)) return;
          s.ready = false;
          s.covered = false;
          procDamage(
            b,
            Math.min(c.absorbed * 0.2, b.hero.physicalDamage * 0.4),
            "Ответ из тени"
          );
        },
        turnStart(b, s) {
          s.ready = false;
          s.covered = false;
        }
      }
    }
  ]);

  // Кара стража: больший вес долга, возврат напора за казнь или осколок расплаты во вторую цель.
  defineSkillMastery("warrior-retribution", [
    {
      id: "full_due",
      name: "Полный счёт",
      description: "Ты превращаешь потраченное Возмездие в урон на 15% эффективнее: 115% вместо 100%.",
      patch: s => ({ debtScale: Number(s.debtScale || 0) * 1.15 })
    },
    {
      id: "settled",
      name: "Счёт закрыт",
      description: "Если попадание Кары стража добивает врага, ты возвращаешь 12 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-retribution") return;
          if (!c.proc && c.hpDamage > 0 && b.enemy.currentHp <= 0) s.kill = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-retribution") return;
          if (s.kill) mana(b, 12);
          s.kill = false;
        }
      }
    },
    {
      id: "shared_due",
      name: "Общий счёт",
      description: "Если удар тратит Возмездие, один другой враг получает 15% урона попадания. Срабатывает один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-retribution") return;
          s.loaded = c.flat > 0;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-retribution") return;
          if (!c.proc && s.loaded) {
            s.damage = Math.max(s.damage || 0, c.hpDamage);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-retribution") return;
          if (s.damage > 0) {
            other(b, () => procDamage(b, s.damage * 0.15, "Общий счёт"));
          }
          s.damage = 0;
        }
      }
    }
  ]);

  // Длинный долг: удар при большом запасе, новый вклад в Возмездие или слабость должника.
  defineSkillMastery("warrior-long-debt", [
    {
      id: "overdue",
      name: "Просроченный счёт",
      description: "При запасе Возмездия от 40% твоего здоровья ты бьёшь этим приёмом на 18% сильнее, сохраняя накопленное.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          if (gauge(b, "guardian") >= b.hero.maxHp * 0.4) c.mult *= 1.18;
        }
      }
    },
    {
      id: "new_entry",
      name: "Новая запись",
      description: "После попадания ты добавляешь в Возмездие 15% снятого здоровья, максимум 3% твоего максимального здоровья за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          if (!c.proc) s.damage = (s.damage || 0) + c.hpDamage;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          bumpGauge(
            b,
            "guardian",
            Math.min((s.damage || 0) * 0.15, b.hero.maxHp * 0.03),
            b.hero.maxHp
          );
          s.damage = 0;
        }
      }
    },
    {
      id: "debtor",
      name: "Тяжесть долга",
      description: "Если перед попаданием в Возмездии есть хотя бы 20% твоего здоровья, после попадания цель получает слабость 12% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          s.loaded = gauge(b, "guardian") >= b.hero.maxHp * 0.2;
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          if (!c.proc && s.loaded && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-long-debt") return;
          if (s.hit) fx(b, "weaken", 2, 0.12);
          s.hit = false;
        }
      }
    }
  ]);

  // Выпад с отходом: прикрытие от магии, напор за парирование или слабость тяжёлого замаха.
  defineSkillMastery("warrior-riposte", [
    {
      id: "off_line",
      name: "Вне линии",
      description: "Если после приёма взведено парирование или есть хотя бы 1 темп, первый магический удар по тебе слабее на 18%. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-riposte") return;
          s.ready = Boolean(
            b.mech.duelist?.armed || gauge(b, "duelist") >= 1
          );
        },
        incoming(b, s, c) {
          if (!s.ready || c.kind !== "magic" || c.parried) return;
          s.ready = false;
          c.amount *= 0.82;
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "return_breath",
      name: "Вернуть дыхание",
      description: "Первое парирование после приёма до следующего твоего хода возвращает 8 напора. Если форма заменяет парирование темпом, ты получаешь 8 напора сразу.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-riposte") return;
          s.ready = Boolean(c.skill.armParry && b.mech.duelist?.armed);
          if (!c.skill.armParry) mana(b, 8);
        },
        parried(b, s) {
          if (!s.ready) return;
          s.ready = false;
          mana(b, 8);
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "caught_windup",
      name: "Пойманный замах",
      description: "Если перед попаданием цель готовит тяжёлый удар, после попадания ты накладываешь слабость 15% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-riposte") return;
          s.heavy = heavy(b);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-riposte") return;
          if (!c.proc && s.heavy && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-riposte") return;
          if (s.hit) fx(b, "weaken", 2, 0.15);
          s.hit = false;
        }
      }
    }
  ]);

  // Снять мерку: подготовленный выпад, возврат напора за полный темп или чтение физического намерения.
  defineSkillMastery("warrior-take-measure", [
    {
      id: "measured_lunge",
      name: "Выверенный выпад",
      description: "При запасе от 2 темпа перед попаданием ты бьёшь этим приёмом на 18% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-take-measure") return;
          if (gauge(b, "duelist") >= 2) c.mult *= 1.18;
        }
      }
    },
    {
      id: "full_measure",
      name: "Полная мерка",
      description: "Если после приёма у тебя 3 темпа, ты возвращаешь 8 напора.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-take-measure") return;
          if (gauge(b, "duelist") >= 3) mana(b, 8);
        }
      }
    },
    {
      id: "read_shoulder",
      name: "Прочитать плечо",
      description: "Попадание по цели, готовящей физический удар, накладывает метку 12% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-take-measure") return;
          s.physical = (
            b.enemy.charge?.kind || b.enemy.intent?.kind
          ) === "physical";
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-take-measure") return;
          if (!c.proc && s.physical && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-take-measure") return;
          if (s.hit) fx(b, "mark", 2, 0.12);
          s.hit = false;
        }
      }
    }
  ]);

  // Вихрь клинка: вес добавленных темпом ударов, темп за длинную серию или слабость после трёх попаданий.
  defineSkillMastery("warrior-flurry-blades", [
    {
      id: "late_blades",
      name: "Поздние клинки",
      description: "Четвёртый и последующие удары серии бьют на 30% сильнее.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          s.swings = (s.swings || 0) + 1;
          if (s.swings >= 4) c.mult *= 1.3;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          s.swings = 0;
        }
      }
    },
    {
      id: "kept_rhythm",
      name: "Удержать ритм",
      description: "Если за применение ты снимаешь здоровье хотя бы 5 попаданиями, после серии ты получаешь 1 темп.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          if (!c.proc && c.hpDamage > 0) s.hits = (s.hits || 0) + 1;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          if (s.hits >= 5) bumpGauge(b, "duelist", 1, 3);
          s.hits = 0;
        }
      }
    },
    {
      id: "tangled_guard",
      name: "Спутанная защита",
      description: "Если за применение ты снимаешь здоровье хотя бы 3 попаданиями, цель получает слабость 15% на 2 хода.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          if (!c.proc && c.hpDamage > 0) s.hits = (s.hits || 0) + 1;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-flurry-blades") return;
          if (s.hits >= 3) fx(b, "weaken", 2, 0.15);
          s.hits = 0;
        }
      }
    }
  ]);

  // Острие встречи: пробивание из взведённой защиты, напор за верное окно или замедление на следующем парировании.
  defineSkillMastery("warrior-meeting-point", [
    {
      id: "narrow_point",
      name: "Узкое острие",
      description: "Со взведённым парированием ты получаешь ещё 25% пробивания для этого удара.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          if (b.mech.duelist?.armed) c.pierce += 0.25;
        }
      }
    },
    {
      id: "right_moment",
      name: "Верное мгновение",
      description: "Попадание со взведённым парированием возвращает тебе 8 напора один раз за применение.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          s.armed = Boolean(b.mech.duelist?.armed);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          if (!c.proc && s.armed && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          if (s.hit) mana(b, 8);
          s.hit = false;
        }
      }
    },
    {
      id: "snagged_step",
      name: "Зацепить шаг",
      description: "После попадания со взведённым парированием следующее парирование замедляет атакующего на 20% на 2 хода. Бонус ждёт до следующего твоего хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          s.armed = Boolean(b.mech.duelist?.armed);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          if (!c.proc && s.armed && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-meeting-point") return;
          s.ready = Boolean(s.hit && b.mech.duelist?.armed);
          s.hit = false;
        },
        parried(b, s) {
          if (!s.ready) return;
          s.ready = false;
          fx(b, "slow", 2, 0.2);
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    }
  ]);

  // Закрыть линию: плотность щита, темп за парирование под щитом или лечение от спокойно истёкшего щита.
  defineSkillMastery("warrior-close-line", [
    {
      id: "overlap",
      name: "Перехлёст стали",
      description: "Если после приёма у тебя есть щит, ты добавляешь 15% его запаса, максимум 3% максимального здоровья. Общий запас щита ограничен 60% здоровья.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-close-line") return;
          const e = getEffect(b.hero, "shield");
          if (e) shield(b, Math.min(e.value * 0.15, b.hero.maxHp * 0.03));
        }
      }
    },
    {
      id: "closed_circle",
      name: "Замкнутый круг",
      description: "Первое парирование после приёма, пока твой щит ещё действует, даёт ещё 1 темп. Бонус ждёт до следующего твоего хода.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-close-line") return;
          s.shield = getEffect(b.hero, "shield");
          s.ready = Boolean(s.shield);
        },
        parried(b, s) {
          if (!s.ready || getEffect(b.hero, "shield") !== s.shield) return;
          s.ready = false;
          bumpGauge(b, "duelist", 1, 3);
        },
        turnStart(b, s) {
          s.ready = false;
        }
      }
    },
    {
      id: "safe_exhale",
      name: "Тихий выдох",
      description: "Если щит после приёма истекает с остатком, ты лечишься на 20% остатка, максимум 2% максимального здоровья. Срабатывает один раз до следующего применения.",
      on: {
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-close-line") return;
          s.shield = getEffect(b.hero, "shield");
        },
        expired(b, s, c) {
          if (
            !s.shield ||
            c.unit !== b.hero ||
            c.id !== "shield" ||
            s.shield.duration > 0 ||
            !(b.hero.effects || []).includes(s.shield)
          ) return;
          s.shield = null;
          if (c.value > 0 && b.hero.currentHp > 0) {
            healUnit(
              b,
              b.hero,
              Math.min(c.value * 0.2, b.hero.maxHp * 0.02),
              "Тихий выдох"
            );
          }
        }
      }
    }
  ]);

  // Проход под рукой: боковой удар при сохранённом темпе, напор за охват или надлом из взведённой защиты.
  defineSkillMastery("warrior-under-arm", [
    {
      id: "wide_pass",
      name: "Широкий проход",
      description: "Если перед попаданием у тебя хотя бы 2 темпа, дополнительные цели получают на 35% больше урона от этого приёма.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          if (!primary(b) && gauge(b, "duelist") >= 2) c.mult *= 1.35;
        }
      }
    },
    {
      id: "through_ranks",
      name: "Сквозь строй",
      description: "Если приём снимает здоровье хотя бы двум разным врагам, ты возвращаешь 10 напора один раз за применение.",
      on: {
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          if (!c.proc && c.hpDamage > 0) {
            s.targets ||= new Set();
            s.targets.add(b.enemy);
          }
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          if (s.targets?.size >= 2) mana(b, 10);
          s.targets = new Set();
        }
      }
    },
    {
      id: "under_plate",
      name: "Под пластину",
      description: "Если ты попадаешь по основной цели со взведённым парированием, после приёма её броня надломлена на 15% на 2 хода.",
      on: {
        beforeHit(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          s.armed = Boolean(primary(b) && b.mech.duelist?.armed);
        },
        afterHit(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          if (!c.proc && s.armed && c.hpDamage > 0) s.hit = true;
        },
        afterAction(b, s, c) {
          if (c.skill?.id !== "warrior-under-arm") return;
          if (s.hit) fx(b, "armor_break", 2, 0.15);
          s.hit = false;
        }
      }
    }
  ]);
})();

