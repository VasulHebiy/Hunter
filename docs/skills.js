(function(){
  "use strict";

  /*
    skills.js (final)
    - Спеціалізації: Фізовик, Стрілець, Вбивця, Маг
    - Кожна НЕ-маг має 3 гілки, 5 рівнів, 2 навики на рівень (10/гілка)
    - Маг має більше гілок (школи). Так само 5 рівнів і 2 закляття на рівень.

    Важливо:
    - Це лише ДОВІДКА (інтерфейс не має кнопки "використати")
    - CD = відкат у секундах (для воїнів/вбивці/стрільця)
    - Мана = витрата за закляття (для мага)
  */

  const m = (n)=>`${n} м`;
  const r = (n)=>`${n} м`;
  const s = (n)=>`${n} с`;

  const cd = (base, lvl)=>Math.max(4, Math.round(base * Math.pow(0.90, (lvl-1)))); // -10%/lvl
  // Mana cost: gets cheaper with level (same -10%/lvl). Minimum keeps spells meaningful.
  const mana = (base, lvl)=>Math.max(3, Math.round(base * Math.pow(0.90, (lvl-1))));

  function makeSkill(name, levelReq, {range, radius, duration, effect, cdSec=0, manaCost=0}){
    const parts = [];
    if (range) parts.push(`Дистанція: ${range}`);
    if (radius) parts.push(`Радіус: ${radius}`);
    if (duration) parts.push(`Тривалість: ${duration}`);
    parts.push(effect);
    return {
      name,
      levelReq,
      cd: cdSec,
      mana: manaCost,
      desc: parts.join(" • "),
    };
  }

  function twoPerLevel(build){
    const out = [];
    for (let lv=1; lv<=5; lv++){
      out.push(...build(lv));
    }
    return out;
  }

  // ===== Фізовик =====
  const fighter = {
    branches: [
      {
        id:"brawl",
        name:"Рукопаш",
        skills: twoPerLevel((lv)=>[
          makeSkill("Сокрушення", lv, {
            range: "Контакт",
            effect:`Сильний удар по цілі. Якщо ціль легша/слабша — коротке приголомшення ${s(0.6 + lv*0.2)}.` ,
            cdSec: cd(18, lv),
          }),
          makeSkill("Клінч", lv, {
            range:"Контакт",
            duration: s(1.5 + lv*0.5),
            effect:`Захоплення: швидкість цілі -${10+lv*6}%. Ти отримуєш +${6+lv*4}% до витривалості на час клінчу.`,
            cdSec: cd(26, lv),
          }),
        ])
      },
      {
        id:"heavy",
        name:"Важка зброя",
        skills: twoPerLevel((lv)=>[
          makeSkill("Розруб", lv, {
            range:m(2),
            effect:`Мах важкою зброєю по дузі. Пробиття броні +${10+lv*6}%.`,
            cdSec: cd(22, lv),
          }),
          makeSkill("Таран", lv, {
            range:m(6+lv*2),
            effect:`Ривок і удар плечем/щитком. Відкидання на ${m(1+lv)}.`,
            cdSec: cd(30, lv),
          }),
        ])
      },
      {
        id:"rage",
        name:"Ярість",
        skills: twoPerLevel((lv)=>[
          makeSkill("Бойовий транс", lv, {
            duration:s(6+lv*2),
            effect:`Тимчасово: сила +${8+lv*4}%, витривалість +${6+lv*3}%.`,
            cdSec: cd(45, lv),
          }),
          makeSkill("Крик", lv, {
            radius:r(4+lv),
            duration:s(3+lv),
            effect:`Вороги у радіусі: точність -${8+lv*4}%, воля -${6+lv*3}%.`,
            cdSec: cd(38, lv),
          }),
        ])
      },
    ]
  };

  // ===== Стрілець =====
  const shooter = {
    branches: [
      {
        id:"assault",
        name:"Штурм",
        skills: twoPerLevel((lv)=>[
          makeSkill("Ривковий постріл", lv, {
            range:m(20+lv*6),
            effect:`Швидкий постріл на ходу. Влучність +${20+lv*6}% на цей постріл.`,
            cdSec: cd(24, lv),
          }),
          makeSkill("Пробивна куля", lv, {
            range:m(30+lv*6),
            effect:`Пробиття: +${15+lv*6}%. Може пройти крізь 1 ціль (якщо слабка броня).`,
            cdSec: cd(34, lv),
          }),
        ])
      },
      {
        id:"sniper",
        name:"Снайп",
        skills: twoPerLevel((lv)=>[
          makeSkill("Приціл", lv, {
            duration:s(6+lv*2),
            effect:`Поки стоїш/повільно рухаєшся: точність +${25+lv*7}%, крит. шанс +${10+lv*4}%.`,
            cdSec: cd(40, lv),
          }),
          makeSkill("Точний постріл", lv, {
            range:m(45+lv*8),
            effect:`Один постріл з бонусом шкоди +${15+lv*7}% і точності +${30+lv*8}%.`,
            cdSec: cd(30, lv),
          }),
        ])
      },
      {
        id:"support",
        name:"Підтримка",
        skills: twoPerLevel((lv)=>[
          makeSkill("Пригнічення", lv, {
            range:m(22+lv*5),
            radius:r(5+lv),
            duration:s(4+lv),
            effect:`Зона вогню: вороги в зоні мають швидкість -${10+lv*5}% і точність -${8+lv*4}%.`,
            cdSec: cd(55, lv),
          }),
          makeSkill("Димова граната", lv, {
            range:m(18+lv*4),
            radius:r(4+lv),
            duration:s(6+lv*2),
            effect:`Дим: вороги гірше бачать (-${20+lv*5}% до сприйняття). Ти отримуєш +${10+lv*4}% до скритності в диму.`,
            cdSec: cd(60, lv),
          }),
        ])
      },
    ]
  };

  // ===== Вбивця =====
  const assassin = {
    branches: [
      {
        id:"stealth",
        name:"Стелс",
        skills: twoPerLevel((lv)=>[
          makeSkill("Зникнення", lv, {
            duration:s(2+lv),
            effect:`Коротка невидимість/маскування. Перший удар після виходу: крит. шанс +${25+lv*8}%.`,
            cdSec: cd(50, lv),
          }),
          makeSkill("Крок тіні", lv, {
            range:m(6+lv*3),
            effect:`Телепорт у межах дистанції за спину/бік цілі (якщо є тінь/укриття).`,
            cdSec: cd(40, lv),
          }),
        ])
      },
      {
        id:"poison",
        name:"Отрути",
        skills: twoPerLevel((lv)=>[
          makeSkill("Отруєний клинок", lv, {
            range:"Контакт",
            duration:s(4+lv*2),
            effect:`Наступний удар накладає отруту: -${8+lv*4}% витривалості і слабкий дот.`,
            cdSec: cd(36, lv),
          }),
          makeSkill("Порошок", lv, {
            range:m(8+lv*2),
            radius:r(2+lv*0.5),
            duration:s(3+lv),
            effect:`Хмара: вороги кашляють — реакція -${10+lv*4}% і точність -${10+lv*4}%.`,
            cdSec: cd(58, lv),
          }),
        ])
      },
      {
        id:"throw",
        name:"Метання",
        skills: twoPerLevel((lv)=>[
          makeSkill("Три клинки", lv, {
            range:m(14+lv*4),
            effect:`Кидаєш 3 ножі: кожен по ${50+lv*8}% шкоди.`,
            cdSec: cd(30, lv),
          }),
          makeSkill("Якір", lv, {
            range:m(16+lv*4),
            duration:s(2+lv),
            effect:`Метальний трос/дротик: ціль сповільнюється на ${15+lv*6}% і не може різко рвати дистанцію.`,
            cdSec: cd(52, lv),
          }),
        ])
      },
    ]
  };

  // ===== Маг (школи) =====
  function mageSchool(id, name, kind){
    // kind: "fire" | "ice" | "storm" | "earth" | "arcane" | "necro" | "shadow"
    const base = {
      fire:   {a:"Фаєрбол", b:"Стіна вогню"},
      ice:    {a:"Льодяний уламок", b:"Крижаний щит"},
      storm:  {a:"Блискавка", b:"Електро-дуга"},
      earth:  {a:"Камʼяний шип", b:"Барʼєр землі"},
      arcane: {a:"Аркан-імпульс", b:"Граві-хват"},
      shadow: {a:"Тіньовий дротик", b:"Поглинання"},
      necro:  {a:"Підняття", b:"Кислотна куля"},
    }[kind];

    return {
      id,
      name,
      skills: twoPerLevel((lv)=>{
        // некро: на кожному рівні "Підняття" масштабує міньйонів (ступені)
        if (kind === "necro"){
          const zombies = lv===1?1: (lv===2?2:(lv===3?2:(lv===4?3:3)));
          const zTier = lv<=2 ? 5 : (lv===3?4:(lv===4?3:2));
          const extra = lv>=3 ? ` + 1 скелет (ступінь ${Math.max(1,zTier-1)})` : "";
          return [
            makeSkill(`${base.a}`, lv, {
              range:m(18+lv*3),
              effect:`Виклик міньйонів: ${zombies} зомбі (ступінь ${zTier})${extra}. Міньйони живуть поки не знищені або поки ти їх не відпустиш.`,
              cdSec: 0,
              manaCost: mana(24, lv),
            }),
            makeSkill(`${base.b}`, lv, {
              range:m(24+lv*4),
              radius:r(2+lv),
              effect:`Отруйний/кислотний вибух у зоні. Дебаф: витривалість -${10+lv*5}% на ${s(4+lv)}.`,
              cdSec: 0,
              manaCost: mana(20, lv),
            }),
          ];
        }

        // інші школи
        const aName = base.a;
        const bName = base.b;
        const rangeA = m(22 + lv*4);
        const rangeB = m(18 + lv*3);
        const radiusA = r(2 + lv);
        const durationB = s(4 + lv*2);

        let aEff = "";
        let bEff = "";

        if (kind === "fire"){
          aEff = `Вибух вогню у радіусі ${radiusA}. Підпал на ${s(2+lv)}.`;
          bEff = `Стіна: блокує прохід і палить ворогів у зоні.`;
        } else if (kind === "ice"){
          aEff = `Снаряд льоду: сповільнення -${12+lv*6}% на ${s(3+lv)}.`;
          bEff = `Щит: зменшує шкоду -${10+lv*5}% на час дії.`;
        } else if (kind === "storm"){
          aEff = `Блискавка по цілі: шанс короткого "оглушення" ${s(0.2+lv*0.15)}.`;
          bEff = `Дуга по 2-3 цілях у радіусі ${r(3+lv)}.`;
        } else if (kind === "earth"){
          aEff = `Шип з землі: відкидання на ${m(0.5+lv*0.4)}.`;
          bEff = `Барʼєр: прикриття, дає бонус до захисту.`;
        } else if (kind === "arcane"){
          aEff = `Імпульс: поштовх по зоні ${radiusA} і збиває приціл.`;
          bEff = `Граві-хват: притягує ціль/слабких ворогів ближче.`;
        } else if (kind === "shadow"){
          aEff = `Тіньова шкода: знижує волю -${10+lv*5}% на ${s(4+lv)}.`;
          bEff = `Поглинання: відновлює трохи мани від шкоди (пасивний ефект на час дії).`;
        }

        return [
          makeSkill(aName, lv, {
            range: rangeA,
            radius: (kind==="storm"?"":radiusA),
            effect: aEff,
            cdSec: 0,
            manaCost: mana(18, lv),
          }),
          makeSkill(bName, lv, {
            range: rangeB,
            duration: durationB,
            effect: bEff,
            cdSec: 0,
            manaCost: mana(22, lv),
          }),
        ];
      })
    };
  }

  const elemental = {
    branches: [
      mageSchool("fire","Вогонь","fire"),
      mageSchool("ice","Лід","ice"),
      mageSchool("storm","Гроза","storm"),
      mageSchool("earth","Земля","earth"),
      mageSchool("arcane","Аркана","arcane"),
      mageSchool("shadow","Тінь","shadow"),
      mageSchool("necro","Некромантія","necro"),
    ]
  };

  // Export for app.js
  window.SKILLS_DB = {
    fighter,
    shooter,
    assassin,
    elemental,
  };
})();
