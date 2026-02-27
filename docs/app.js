/*
  Hunter System (static, GitHub Pages friendly)
  Pages: index.html, hunters.html, training.html, direction.html, cults.html
  Storage: localStorage
*/

(function () {
  "use strict";

  const CFG = {
    MAX_HUNTERS: 5,

    // Timers (REAL)
    GEN_COOLDOWN_MS: 12 * 60 * 60 * 1000,        // 12h generation cooldown
    TRAIN_COOLDOWN_MS: 14 * 60 * 60 * 1000,      // 12h training + 2h rest,      // 12h training + 2h rest
    TRAIT_GAIN_COOLDOWN_MS: 30 * 60 * 1000,      // 30m get a trait,      // 30m get a trait
    TRAIT_TRAIN_COOLDOWN_MS: 14 * 60 * 60 * 1000,      // 12h training + 2h rest,     // 30m train a trait
    CULT_UP_COOLDOWN_MS: 24 * 60 * 60 * 1000,    // 24h cult rank up

    // Training
    CYCLES_PER_TRAIN: 3,                         // 12h / 4h
    CYCLE_POINTS_MIN: 2,
    CYCLE_POINTS_MAX: 5,

    EXP_BASE: 1.06,

    // Traits
    MAX_TRAITS_PER_HUNTER: 5,

    // Risk threshold
    RISK_THRESHOLD: 45,
  };

  const LS = {
    HUNTERS: "hs_hunters_v3",
    NEXT_GEN: "hs_next_gen_v3",
    SELECTED_HUNTER: "hs_selected_hunter_v3",
  };

  const STATS = [
    { key: "str", name: "Сила" },
    { key: "agi", name: "Ловкість" },
    { key: "sta", name: "Витривалість" },
    { key: "rea", name: "Реакція" },
    { key: "int", name: "Інтелект" },
    { key: "per", name: "Сприйняття" },
    { key: "wil", name: "Воля" },
  ];

  // ===== Trait stat modifiers (separate from training/base stats) =====
  // Good traits: +2% per level, Bad traits: -4% per level
  // Level is 1..5 (rank 0..4)
  const TRAIT_PCT_GOOD_PER_LVL = 2;
  const TRAIT_PCT_BAD_PER_LVL  = -4;

  // Training complexes: 60/30/10
  const COMPLEXES = [
    { id: "power",      name: "Силовий комплекс",        weights: [["str", 0.6], ["sta", 0.3], ["wil", 0.1]] },
    { id: "functional", name: "Функціональний комплекс", weights: [["sta", 0.6], ["agi", 0.3], ["wil", 0.1]] },
    { id: "reflex",     name: "Рефлекси комплекс",       weights: [["rea", 0.6], ["agi", 0.3], ["per", 0.1]] },
    { id: "precision",  name: "Точність комплекс",       weights: [["per", 0.6], ["rea", 0.3], ["int", 0.1]] },
    { id: "tactical",   name: "Тактичний комплекс",      weights: [["int", 0.6], ["per", 0.3], ["wil", 0.1]] },
    { id: "stability",  name: "Нервова стабільність",    weights: [["wil", 0.6], ["int", 0.3], ["rea", 0.1]] },
    { id: "motor",      name: "Рухова техніка",          weights: [["agi", 0.6], ["rea", 0.3], ["sta", 0.1]] },
  ];

  // Specializations
  const SPECS = [
    { id:"fighter",   name:"Фізовик",  param:"Ярість",       keys:[["str",0.6],["sta",0.3],["wil",0.1]] },
    { id:"shooter",   name:"Стрілець", param:"Точність",     keys:[["per",0.6],["rea",0.3],["agi",0.1]] },
    { id:"assassin",  name:"Вбивця",   param:"Скритність",   keys:[["agi",0.6],["per",0.3],["rea",0.1]] },
    { id:"elemental", name:"Маг",      param:"Магічна сила", keys:[["int",0.6],["per",0.3],["wil",0.1]] },
  ];


  // ===== Branches & Skills =====
  // One branch per hunter, cannot be changed.
  // Branch level: 1..5, upgrade once per 12h
  const BRANCH = {
    MAX_LEVEL: 5,
    UPGRADE_COOLDOWN_MS: 12 * 60 * 60 * 1000,
  };

  // Which specs are "magical" (spend mana)
  // Final build: only Mag is mana-based
  const MAGIC_SPECS = new Set(["elemental"]);

  function isMagicSpec(specId){ return MAGIC_SPECS.has(specId); }

  // Skill cooldown reduction: -10% per branch level (Lv1=100%, Lv5=60%)
  function cdMultiplier(branchLevel){
    const lv = Math.max(1, Math.min(BRANCH.MAX_LEVEL, Number(branchLevel)||1));
    return 1 - 0.10 * (lv - 1);
  }

  // Skills database is loaded from skills.js as window.SKILLS_DB (final).

  // Branches list (5 per specialization). Skills are reused packs but named with branch.
  const SPEC_BRANCHES = {
    fighter: [
      {id:"unarmed", name:"Рукопаш"},
      {id:"blade", name:"Холодна зброя"},
      {id:"heavy", name:"Важка зброя"},
      {id:"armor", name:"Броньований стиль"},
      {id:"rage", name:"Ярість"},
    ],
    assassin: [
      {id:"stealth", name:"Скритність"},
      {id:"burst", name:"Швидке усунення"},
      {id:"poison", name:"Отрути"},
      {id:"shadow", name:"Тіньовий стиль"},
      {id:"range", name:"Тихий дальній бій"},
    ],
    shooter: [
      {id:"assault", name:"Штурмовик"},
      {id:"sniper", name:"Снайпер"},
      {id:"support", name:"Підтримка"},
      {id:"marksman", name:"Маршал"},
      {id:"breach", name:"Пробиття"},
    ],
    elemental: [
      {id:"fire", name:"Вогонь"},
      {id:"ice", name:"Лід"},
      {id:"storm", name:"Блискавка"},
      {id:"earth", name:"Земля"},
      {id:"air", name:"Повітря"},
    ],
    necromancer: [
      {id:"raise", name:"Підняття"},
      {id:"curse", name:"Прокляття"},
      {id:"souls", name:"Душі"},
      {id:"corpse", name:"Трупна магія"},
      {id:"form", name:"Темна форма"},
    ],
    warlock: [
      {id:"sigils", name:"Печаті"},
      {id:"hex", name:"Прокляття"},
      {id:"chains", name:"Ланцюги"},
      {id:"ritual", name:"Ритуали"},
      {id:"doom", name:"Вироки"},
    ],
    illusionist: [
      {id:"images", name:"Образи"},
      {id:"smoke", name:"Дим"},
      {id:"trick", name:"Фокуси"},
      {id:"mask", name:"Маски"},
      {id:"chaos", name:"Хаос"},
    ],
    witcher: [
      {id:"signs", name:"Знаки"},
      {id:"alchemy", name:"Алхімія"},
      {id:"sword", name:"Меч"},
      {id:"hunt", name:"Полювання"},
      {id:"duel", name:"Дуель"},
    ],
    guardian: [
      {id:"shield", name:"Щит"},
      {id:"stance", name:"Стійка"},
      {id:"taunt", name:"Провокація"},
      {id:"wall", name:"Стіна"},
      {id:"oath", name:"Клятва"},
    ],
    raider: [
      {id:"mobility", name:"Мобільність"},
      {id:"ambush", name:"Засідка"},
      {id:"hitrun", name:"Удар-відхід"},
      {id:"control", name:"Контроль"},
      {id:"escape", name:"Відхід"},
    ],
    seer: [
      {id:"sense", name:"Чуття"},
      {id:"mark", name:"Мітки"},
      {id:"vision", name:"Видіння"},
      {id:"time", name:"Мить"},
      {id:"fate", name:"Доля"},
    ],
    manipulator: [
      {id:"pressure", name:"Тиск"},
      {id:"fear", name:"Паніка"},
      {id:"control", name:"Контроль"},
      {id:"shield", name:"Щит"},
      {id:"puppet", name:"Ляльковод"},
    ],
  };

  function getBranchesForSpec(specId){
    const db = (typeof window !== "undefined") ? window.SKILLS_DB : null;
    if (db && db[specId] && Array.isArray(db[specId].branches)){
      return db[specId].branches.map(b=>({id:b.id, name:b.name}));
    }
    return SPEC_BRANCHES[specId] || [
      {id:"b1", name:"Шлях I"},
      {id:"b2", name:"Шлях II"},
      {id:"b3", name:"Шлях III"},
      {id:"b4", name:"Шлях IV"},
      {id:"b5", name:"Шлях V"},
    ];
  }

  function getBranchDisplayName(specId, branchId){
    const branches = getBranchesForSpec(specId);
    const b = (branches||[]).find(x=>x.id===branchId);
    return b ? b.name : branchId;
  }

  function buildBranchSkills(specId, branchId){
    const db = (typeof window !== "undefined") ? window.SKILLS_DB : null;
    const isMagic = isMagicSpec(specId);

    if (db && db[specId]){
      const br = (db[specId].branches||[]).find(b=>b.id===branchId);
      const list = br ? (br.skills||[]) : [];
      return list.map((sk, idx)=>({
        id: `${specId}:${branchId}:${idx}`,
        name: sk.name,
        desc: sk.desc,
        cd: Number(sk.cd)||0,
        mana: Number(sk.mana)||0,
        type: isMagic ? "mana" : "cd",
        levelReq: Number(sk.levelReq)||1,
      }));
    }

    // fallback: should never happen in final
    return [];
  }

  // Minion degree (necromancer): starts at 5, improves with branch level, never below 1 by default
  function minionTierForBranchLevel(branchLevel){
    const lv = Math.max(1, Math.min(5, Number(branchLevel)||1));
    return Math.max(1, 5 - (lv - 1)); // Lv1->5 ... Lv5->1
  }

  function formatSecCd(sec){
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s/60);
    const r = s%60;
    return m>0 ? `${m}м ${r}с` : `${r}с`;
  }

  function branchUpgradeLeftMs(h){
    if (!h.specBranchId) return 0;
    const last = Number(h.branchLastUpgradeAt||0);
    const left = (last + BRANCH.UPGRADE_COOLDOWN_MS) - Date.now();
    return Math.max(0, left);
  }

  function skillLeftMs(h, skillId){
    const map = h.skillCooldowns || {};
    const ts = Number(map[skillId]||0);
    const left = ts - Date.now();
    return Math.max(0, left);
  }

  function renderBranchBlock(h){
    // Only if specialization chosen
    if (!h.specId){
      return `<div class="branchBox">
        <div class="branchHead">
          <div>
            <div class="branchTitle">Гілка спеціалізації</div>
            <div class="branchMeta">Спочатку обери спеціалізацію на сторінці “Напрям”.</div>
          </div>
        </div>
      </div>`;
    }

    const spec = SPECS.find(s=>s.id===h.specId);
    const branches = getBranchesForSpec(h.specId);

    const isMagic = isMagicSpec(h.specId);

    // Mana line for magic
    const manaLine = isMagicSpec(h.specId)
      ? `<div class="branchPills">
          <span class="pill pill--good">Мана: <b>${Math.round(h.manaCur||0)}</b>/<b>${Math.round(h.mana||0)}</b></span>
          ${h.souls ? `<span class="pill">Душі: <b>${h.souls}</b></span>` : `<span class="pill">Душі: <b>${h.souls||0}</b></span>`}
        </div>`
      : "";

    if (!h.specBranchId){
      return `<div class="branchBox">
        <div class="branchHead">
          <div>
            <div class="branchTitle">Гілка спеціалізації</div>
            <div class="branchMeta">${escapeHtml(spec?spec.name:h.specId)} • обирається <b>1 раз</b> і не змінюється.</div>
          </div>
        </div>
        ${manaLine}
        <div class="skills" style="margin-top:10px">
          ${branches.map(b=>`
            <button class="btn btn--primary" type="button" data-branchpick="${escapeHtml(h.id)}" data-branchid="${escapeHtml(b.id)}">
              Вибрати: ${escapeHtml(b.name)}
            </button>
          `).join("")}
        </div>
      </div>`;
    }

    const b = branches.find(x=>x.id===h.specBranchId) || {id:h.specBranchId, name:h.specBranchId};
    const lvl = Math.max(1, Math.min(BRANCH.MAX_LEVEL, Number(h.branchLevel||1)));
    const upLeft = branchUpgradeLeftMs(h);
    const canUp = upLeft<=0 && lvl < BRANCH.MAX_LEVEL;

    const skills = buildBranchSkills(h.specId, h.specBranchId);
    const unlocked = skills.filter(s=>s.levelReq<=lvl);

    // group by level
    const blocks = [];
    for (let lv=1; lv<=lvl; lv++){
      const group = unlocked.filter(s=>s.levelReq===lv);
      if (!group.length) continue;
      blocks.push(`
        <div class="note" style="margin-top:10px">
          <div class="note__title">Рівень ${lv}</div>
          <div class="skills">
            ${group.map(sk=>{
              const left = skillLeftMs(h, sk.id);
              const cdMult = cdMultiplier(lvl);
              const effCd = Math.max(1, Math.round(sk.cd * cdMult));
              const readyTxt = left>0 ? `КД: ${hms(left)}` : `КД: ${formatSecCd(effCd)}`;
              const costTxt = sk.type==="mana" ? `Мана: ${sk.mana}` : "Без мани";
              // no "use" button in final UI; we only show costs and cooldown numbers.
              const extra = (h.specId==="elemental" && h.specBranchId==="necro" && sk.name==="Підняття")
                ? ` • Міньйони масштабуються від рівня гілки.`
                : "";
              return `
                <div class="skill" data-skillwrap="${escapeHtml(sk.id)}">
                  <button class="skill__btn" type="button" data-skilltoggle="${escapeHtml(sk.id)}" data-hid="${escapeHtml(h.id)}">
                    <div class="skill__name">${escapeHtml(sk.name)}</div>
                    <div class="skill__right">${costTxt} • ${readyTxt}</div>
                  </button>
                  <div class="skill__body">
                    <div class="skill__desc">${escapeHtml(sk.desc)}${extra}</div>
                    <div class="skill__actions">
                      <span class="pill">${costTxt}</span>
                      <span class="pill">${readyTxt}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `);
    }

    return `<div class="branchBox">
      <div class="branchHead">
        <div>
          <div class="branchTitle">Гілка: ${escapeHtml(b.name)}</div>
          <div class="branchMeta">${escapeHtml(spec?spec.name:h.specId)} • Рівень: <b>${lvl}</b> / ${BRANCH.MAX_LEVEL} • ${isMagic ? `Мана відновлення: <b>2%</b> / <b>5с</b>` : `КД навиків: <b>${Math.round(cdMultiplier(lvl)*100)}%</b>`}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end">
          <button class="btn btn--primary btn--mini" type="button" data-branchup="${escapeHtml(h.id)}" ${canUp ? "" : "disabled"}>
            Підвищити
          </button>
          <span class="pill pill--warn">${upLeft>0 ? `Доступно через ${hms(upLeft)}` : (lvl<BRANCH.MAX_LEVEL ? "Готово" : "Макс")}</span>
        </div>
      </div>
      ${manaLine}
      ${blocks.join("")}
    </div>`;
  }

  // ===== Traits (very many, random) =====
  // type: "skill" (Початківець...) or "vice" (Легка...)
  const TRAITS = [
    // bad habits / vices
    {id:"alcohol", name:"Алкоголізм", type:"vice"},
    {id:"drugs", name:"Наркоманія", type:"vice"},
    {id:"smoker", name:"Курець", type:"vice"},
    {id:"gambler", name:"Ігроманія", type:"vice"},
    {id:"rage", name:"Агресія", type:"vice"},
    {id:"insomnia", name:"Безсоння", type:"vice"},
    {id:"paranoia", name:"Параноя", type:"vice"},
    {id:"greed", name:"Жадібність", type:"vice"},
    {id:"gluttony", name:"Переїдання", type:"vice"},
    {id:"impulsive", name:"Імпульсивність", type:"vice"},
    {id:"reckless", name:"Безрозсудність", type:"vice"},
    {id:"phobia", name:"Фобія", type:"vice"},
    {id:"panic", name:"Паніка", type:"vice"},
    {id:"coward", name:"Боягузтво", type:"vice"},
    {id:"cruel", name:"Жорстокість", type:"vice"},
    {id:"liar", name:"Брехун", type:"vice"},
    {id:"klepto", name:"Клептоманія", type:"vice"},
    {id:"pyro", name:"Піроманія", type:"vice"},
    {id:"controlfreak", name:"Контроль", type:"vice"},
    {id:"cold", name:"Холодність", type:"vice"},

    // skills / backgrounds (lots)
    {id:"soulless", name:"Бездушний", type:"skill"},
    {id:"shooter", name:"Стрілець", type:"skill"},
    {id:"sniper", name:"Снайпер", type:"skill"},
    {id:"scout", name:"Скаут", type:"skill"},
    {id:"tracker", name:"Слідопит", type:"skill"},
    {id:"veteran", name:"Ветеран", type:"skill"},
    {id:"military", name:"Військовий", type:"skill"},
    {id:"guard", name:"Охоронець", type:"skill"},
    {id:"brawler", name:"Боєць", type:"skill"},
    {id:"boxer", name:"Боксер", type:"skill"},
    {id:"wrestler", name:"Борець", type:"skill"},
    {id:"knife", name:"Ніж", type:"skill"},
    {id:"thief", name:"Злодій", type:"skill"},
    {id:"hacker", name:"Хакер", type:"skill"},
    {id:"tactician", name:"Тактик", type:"skill"},
    {id:"leader", name:"Лідер", type:"skill"},
    {id:"medic", name:"Лікар", type:"skill"},
    {id:"paramedic", name:"Парамедик", type:"skill"},
    {id:"fieldmed", name:"Польовий медик", type:"skill"},
    {id:"firstaid", name:"Перша допомога", type:"skill"},
    {id:"chemist", name:"Хімік", type:"skill"},
    {id:"engineer", name:"Інженер", type:"skill"},
    {id:"mechanic", name:"Механік", type:"skill"},
    {id:"driver", name:"Водій", type:"skill"},
    {id:"pilot", name:"Пілот", type:"skill"},
    {id:"cook", name:"Кухар", type:"skill"},
    {id:"survivor", name:"Виживальник", type:"skill"},
    {id:"climber", name:"Альпініст", type:"skill"},
    {id:"swimmer", name:"Плавець", type:"skill"},
    {id:"runner", name:"Бігун", type:"skill"},
    {id:"athlete", name:"Атлет", type:"skill"},
    {id:"acrobat", name:"Акробат", type:"skill"},
    {id:"parkour", name:"Паркур", type:"skill"},
    {id:"stealth", name:"Тіньовик", type:"skill"},
    {id:"lockpick", name:"Відмички", type:"skill"},
    {id:"explorer", name:"Дослідник", type:"skill"},
    {id:"negotiator", name:"Перемовник", type:"skill"},
    {id:"merchant", name:"Торгівець", type:"skill"},
    {id:"dealer", name:"Круп’є", type:"skill"},
    {id:"carder", name:"Картяр", type:"skill"},
    {id:"cheater", name:"Шулер", type:"skill"},
    {id:"actor", name:"Актор", type:"skill"},
    {id:"illusion", name:"Ілюзіоніст", type:"skill"},
    {id:"focus", name:"Фокус", type:"skill"},
    {id:"aim", name:"Приціл", type:"skill"},
    {id:"reflex", name:"Рефлекс", type:"skill"},
    {id:"balance", name:"Баланс", type:"skill"},
    {id:"discipline", name:"Дисципліна", type:"skill"},
    {id:"intuition", name:"Інтуїція", type:"skill"},
    {id:"memory", name:"Памʼять", type:"skill"},
    {id:"strategy", name:"Стратег", type:"skill"},
    {id:"observer", name:"Спостерігач", type:"skill"},
    {id:"forager", name:"Збирач", type:"skill"},
    {id:"smith", name:"Коваль", type:"skill"},
    {id:"carpenter", name:"Тесля", type:"skill"},
    {id:"tailor", name:"Кравець", type:"skill"},
    {id:"archer", name:"Лучник", type:"skill"},
    {id:"crossbow", name:"Арбалет", type:"skill"},
    {id:"gunsmith", name:"Зброяр", type:"skill"},
    {id:"sapper", name:"Сапер", type:"skill"},
    {id:"responder", name:"Рятувальник", type:"skill"},
    {id:"fireman", name:"Пожежник", type:"skill"},
    {id:"police", name:"Поліцейський", type:"skill"},
    {id:"bodyguard", name:"Охорона", type:"skill"},
    {id:"chef", name:"Шеф", type:"skill"},
    {id:"botanist", name:"Ботанік", type:"skill"},
    {id:"psych", name:"Психолог", type:"skill"},
    {id:"teacher", name:"Вчитель", type:"skill"},
    {id:"priest", name:"Служитель", type:"skill"},
    {id:"monk", name:"Монах", type:"skill"},
    {id:"scholar", name:"Вчений", type:"skill"},
    {id:"scribe", name:"Писар", type:"skill"},
    {id:"linguist", name:"Лінгвіст", type:"skill"},
    {id:"runner2", name:"Курʼєр", type:"skill"},
    {id:"navigator", name:"Навігатор", type:"skill"},
    {id:"ship", name:"Моряк", type:"skill"},
    {id:"diplomat", name:"Дипломат", type:"skill"},
    {id:"judge", name:"Суддя", type:"skill"},
    {id:"lawyer", name:"Юрист", type:"skill"},
    {id:"surgeon", name:"Хірург", type:"skill"},
    {id:"nurse", name:"Медсестра", type:"skill"},
    {id:"pharmacist", name:"Фармацевт", type:"skill"},
    {id:"researcher", name:"Дослідник", type:"skill"},
    {id:"sniffer", name:"Слідчий", type:"skill"},
    {id:"spy", name:"Шпигун", type:"skill"},
    {id:"saboteur", name:"Диверсант", type:"skill"},
    {id:"interrogator", name:"Допит", type:"skill"},
    {id:"planner", name:"Планер", type:"skill"},
    {id:"runner3", name:"Спринтер", type:"skill"},
    {id:"sprinter", name:"Швидкість", type:"skill"},
    {id:"endurance", name:"Тривалість", type:"skill"},
    {id:"iron", name:"Сталевий", type:"skill"},
    {id:"calm", name:"Спокійний", type:"skill"},
    {id:"brave", name:"Сміливий", type:"skill"},
    {id:"fearless", name:"Безстрашний", type:"skill"},
    {id:"stubborn", name:"Впертий", type:"skill"},
    {id:"patient", name:"Терплячий", type:"skill"},
    {id:"sharp", name:"Гострий", type:"skill"},
    {id:"fastlearner", name:"Схоплює", type:"skill"},
    {id:"analyst", name:"Аналітик", type:"skill"},
    {id:"planner2", name:"Планування", type:"skill"},
  ];

  function getTraitMeta(id){
    return TRAITS.find(t => t.id === id) || null;
  }
  function traitRankName(type, r){
    const idx = Math.max(0, Math.min(4, Number(r)||0));
    if (type === "vice") return ["Легка","Середня","Сильна","Хронічна","Критична"][idx];
    return ["Початківець","Практикант","Любитель","Вмілий","Професійний"][idx];
  }

  
// ===== Trait effects (apply directly to stats; no base/final) =====
const TRAIT_STAT_MAP = {
  // good / skill
  shooter: {main:"per"},
  sniper: {main:"per", sub:"rea"},
  boxer: {main:"str", sub:"rea"},
  brawler: {main:"str"},
  athlete: {main:"sta", sub:"agi"},
  runner: {main:"agi", sub:"sta"},
  tactician: {main:"int", sub:"per"},
  leader: {main:"wil", sub:"per"},
  mechanic: {main:"int"},
  engineer: {main:"int", sub:"wil"},
  scout: {main:"per"},
  tracker: {main:"per", sub:"sta"},
  reflex: {main:"rea", sub:"agi"},
  balance: {main:"agi", sub:"rea"},
  endurance: {main:"sta"},
  power: {main:"str"},
  discipline: {main:"wil"},
  memory: {main:"int"},
  intuition: {main:"per", sub:"wil"},
  // vices (bad habits)
  alcohol: {main:"rea"},
  drugs: {main:"sta"},
  smoker: {main:"sta"},
  insomnia: {main:"int"},
  paranoia: {main:"wil"},
  rage: {main:"wil"},
  impulsive: {main:"rea"},
  reckless: {main:"wil"},
};

function inferMainStatFromTraitMeta(meta){
  if (!meta || !meta.name) return null;
  const n = String(meta.name).toLowerCase();

  // Perception (точність/спостереження/навігація)
  if (/(стрілець|снайпер|скаут|слідопит|спостерігач|приціл|навігатор|слідчий|шпигун|диверсант|гострий|інтуїц)/.test(n)) return "per";

  // Reaction (рефлекси/миттєвість)
  if (/(рефлекс|реакц|баланс)/.test(n)) return "rea";

  // Agility (рух/спритність/взлом/скритність)
  if (/(ловк|акробат|паркур|тіньовик|відмичк|злодій|курʼєр|кур'єр|спринтер|швидкіст|альпініст|плавець|бігун|лучник|арбалет)/.test(n)) return "agi";

  // Strength (силові/бій)
  if (/(сила|боєць|боксер|борець|ніж|охоронец|охорона|пожежник|коваль|тесля|сталев)/.test(n)) return "str";

  // Endurance (витривалість/виживання/робота тілом довго)
  if (/(витрив|триваліст|атлет|виживальник|моряк|рятувальник)/.test(n)) return "sta";

  // Will (воля/контроль/соціалка/спокій)
  if (/(воля|дисциплін|лідер|спокійн|смілив|безстрашн|впертий|терпляч|монах|служитель|дипломат|перемовник|торгівець|шулер|актор|ілюзіоніст|фокус|допит)/.test(n)) return "wil";

  // Intellect (інтелект/наука/ремесло/медицина/право)
  if (/(інтелект|хакер|тактик|хімік|інженер|механік|водій|пілот|кухар|дослідник|стратег|пам|аналітик|плануван|вчений|писар|лінгвіст|юрист|суддя|вчитель|психолог|хірург|медсестра|фармацевт|зброяр|сапер|ботанік)/.test(n)) return "int";

  return null;
}

function getTraitEffect(id){
  // Determine which BASE stat the trait modifies (as %), applied separately at the end.
  const meta = getTraitMeta(id);
  const cfg = TRAIT_STAT_MAP[id] || null;
  if (cfg && cfg.main) return cfg;

  const inferred = inferMainStatFromTraitMeta(meta);
  if (inferred) return { main: inferred };

  // Fallbacks: keep them balanced (NOT all into perception)
  if (meta && meta.type === "vice") return { main: "wil" };
  return { main: "int" };
}

function normalizeTraits(h){
  if (!Array.isArray(h.traits)) h.traits = [];
  h.traits.forEach(tr=>{
    if (!tr) return;
    const meta = getTraitMeta(tr.id);
    tr.type = (meta && meta.type) ? meta.type : (tr.type || "skill");
    tr.rank = Math.max(0, Math.min(4, Number(tr.rank)||0));
    tr.rankName = traitRankName(tr.type, tr.rank);
  });
}

// Returns percent modifiers per stat from traits. Example: {str: +6, sta: -8, ...}
function traitPctByStat(h){
  const out = {};
  STATS.forEach(s=>out[s.key]=0);
  if (!Array.isArray(h.traits) || !h.traits.length) return out;

  h.traits.forEach(tr=>{
    if (!tr) return;
    const meta = getTraitMeta(tr.id);
    const type = (meta && meta.type) ? meta.type : (tr.type || "skill");
    const lvl = Math.max(1, Math.min(5, (Number(tr.rank)||0) + 1));
    const eff = getTraitEffect(tr.id);
    const k = eff?.main;
    if (!k || !(k in out)) return;
    const perLvl = (type === "vice") ? TRAIT_PCT_BAD_PER_LVL : TRAIT_PCT_GOOD_PER_LVL;
    out[k] += perLvl * lvl;
  });

  return out;
}

// Tier affects skill cooldown and mana cost: -5% per better tier step (7->0)
function tierSkillMult(tier){
  const steps = Math.max(0, Math.min(7, 7 - Number(tier||7))); // tier7=0 .. tier0=7
  const mult = 1 - (0.05 * steps);
  return Math.max(0.2, mult);
}

// ===== Cults =====
  const CULTS = [
    {
      id: "yar",
      name: "Бог Яр",
      ranks: ["Віруючий","Адепт","Священик","Архієпископ","Полусвятий","Святий"],
      describe(rank){
        const dmg = [20,35,50,70,90,120][rank] || 20;
        const lines = [
          `Сила проти нежиті: +${dmg}%`,
          "Освяченість",
          "Світла душа",
        ];
        if (rank >= 0) lines.push("Ментальний захист (легкий)");
        if (rank >= 2) lines[lines.length-1] = "Ментальний захист (середній)";
        if (rank >= 3) lines[lines.length-1] = "Ментальний захист (сильний)";
        if (rank >= 4) lines.push("Очищення (пасивно)");
        if (rank >= 5) lines.push("Крила (візуал)");
        return lines;
      }
          ,onJoin(h){
        if (!h.baseStats) h.baseStats = {};
        h.baseStats.int = (Number(h.baseStats.int)||0) + 3;
        h.baseStats.wil = (Number(h.baseStats.wil)||0) + 3;
        h.baseStats.per = (Number(h.baseStats.per)||0) + 3;
        return { msg: "Вступ успішний: +3 Інтелект, +3 Воля, +3 Сприйняття" };
      }
          
    },
    {
      id: "baal",
      name: "Баал",
      ranks: ["Єретик","Апостол","Кровний","Демонізований","Пожирач Душ","Аватар"],
      describe(rank){
        const regen = [10,20,30,40,50,70][rank] || 10;
        const mins = [0,0,10,15,20,25][rank] || 0;
        const lines = [
          "Єретик",
          "Демонічна кров",
          "Гаряче тіло",
          "Вени проступають",
          `Регенерація: +${regen}%`,
          "Контроль лави (малий)",
        ];
        if (mins > 0) lines.push(`Останній Вздох: ${mins} хв`);
        if (rank >= 2) lines.push("На 3 ранзі: 5 душ → воскресіння");
        return lines;
      },
      onJoin(h, choice){
        // Баал: 50% смерть / 50% вступ. Далі гравець обирає шлях: Сила або Розум.
        if (Math.random() < 0.50){
          return { dead: true, msg: "Баал відкинув. Хант помер." };
        }
        if (!h.baseStats) h.baseStats = {};
        const ch = (choice === "mind" || choice === "rozum") ? "mind" : "power";
        if (ch === "power"){
          // Сила: +10 до Сили, Ловкості, Витривалості, Реакції; Воля -5
          ["str","agi","sta","rea"].forEach(k=>{
            h.baseStats[k] = (Number(h.baseStats[k])||0) + 10;
          });
          h.baseStats.wil = (Number(h.baseStats.wil)||0) - 5;
          if (!Array.isArray(h.cultMarks)) h.cultMarks = [];
          if (!h.cultMarks.includes("Бездушний")) h.cultMarks.push("Бездушний");
          return { dead:false, msg:"Вступ успішний (Сила): +10 Сила/Ловкість/Витривалість/Реакція, Воля -5" };
        } else {
          // Розум: +20 до Інтелекту, +10 до Сприйняття; Воля -5
          h.baseStats.int = (Number(h.baseStats.int)||0) + 20;
          h.baseStats.per = (Number(h.baseStats.per)||0) + 10;
          h.baseStats.wil = (Number(h.baseStats.wil)||0) - 5;
          if (!Array.isArray(h.cultMarks)) h.cultMarks = [];
          if (!h.cultMarks.includes("Бездушний")) h.cultMarks.push("Бездушний");
          return { dead:false, msg:"Вступ успішний (Розум): +20 Інтелект, +10 Сприйняття, Воля -5" };
        }
      }
    },
    {
      id: "york",
      name: "Йорк",
      ranks: ["Послідовник","Шалений","Берсеркер","Кат","Безумний","Пророк Люті"],
      describe(rank){
        const cap = [100,150,200,250,300,300][rank] || 100;
        const dur = (rank >= 5) ? 20 : 15;
        return [
          "Лють Йорка",
          "За вбивство в бою: +2% до всіх статів",
          `Ліміт накопичення: +${cap}%`,
          `Тривалість бафу: ${dur} хв`,
        ];
      }
          ,onJoin(h){
        if (!h.baseStats) h.baseStats = {};
        h.baseStats.str = (Number(h.baseStats.str)||0) + 3;
        h.baseStats.sta = (Number(h.baseStats.sta)||0) + 3;
        h.baseStats.agi = (Number(h.baseStats.agi)||0) + 2;
        return { msg: "Вступ успішний: +3 Сила, +3 Витривалість, +2 Ловкість" };
      }
    },
    {
      id: "shadow",
      name: "Бог Тіней",
      ranks: ["Тіньовик","Ступаючий","Примара","Темний Агент","Володар Тіні","Архітінь"],
      describe(rank){
        // Контроль тіней: базово 1 хв тривалості і 5 хв відкат.
        // Кожен ранг: +100% тривалості (×2 від бази), та -20% КД від МАКСИМАЛЬНОГО (лінійно).
        const durMin = 1 * Math.pow(2, rank);            // 1,2,4,8,16,32 хв
        const cdMinRaw = 5 * (1 - 0.20 * rank);          // 5,4,3,2,1,0
        const cdMin = Math.max(1, cdMinRaw);             // мінімум 1 хв, щоб не було 0
        const lines = [
          "Контроль тіней",
          `Тривалість: ${durMin} хв`,
          `Відкат: ${cdMin} хв`,
          "У тіні: коротка невидимість / маскування",
        ];
        if (rank >= 3) lines.push("Атака з тіні: бонус");
        return lines;
      },
      onJoin(h){
        if (!h.baseStats) h.baseStats = {};
        h.baseStats.agi = (Number(h.baseStats.agi)||0) + 3;
        h.baseStats.per = (Number(h.baseStats.per)||0) + 3;
        h.baseStats.rea = (Number(h.baseStats.rea)||0) + 3;
        return { msg: "Вступ успішний: +3 Ловкість, +3 Сприйняття, +3 Реакція" };
      }
    },
  ];

  function getCult(id){ return CULTS.find(c=>c.id===id) || null; }

  // ===== Math / Tier =====
  function tierBonus(tier){
    const pct = (8 - tier) * 0.10; // tier7 => +10% ... tier0 => +80%
    return 1 + pct;
  }

  function calcTier(avg){
    if (avg >= 38) return 0;
    if (avg >= 34) return 1;
    if (avg >= 30) return 2;
    if (avg >= 26) return 3;
    if (avg >= 22) return 4;
    if (avg >= 18) return 5;
    if (avg >= 14) return 6;
    return 7;
  }

  function efficiency(statValue){
    if (statValue >= 60) return 0.2;
    if (statValue >= 50) return 0.5;
    if (statValue >= 41) return 0.6;
    if (statValue >= 35) return 0.8;
    return 1.0;
  }

  function mul(statValue){
    return Math.pow(CFG.EXP_BASE, statValue - 10);
  }

  // ===== Utils =====
  function pad2(n){ return String(n).padStart(2,"0"); }
  function hms(ms){
    if (ms <= 0) return "00:00:00";
    const t = Math.floor(ms/1000);
    const h = Math.floor(t/3600);
    const m = Math.floor((t%3600)/60);
    const s = t%60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function randInt(min,max){
    return Math.floor(Math.random()*(max-min+1))+min;
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  
  // ===== Export (.txt) =====
  
function getUnlockedSkills(h){
  // Returns skills unlocked by current branch level.
  if (!h || !h.specId || !h.specBranchId) return [];
  const lvl = Math.max(0, Math.min(5, Number(h.branchLevel)||0));
  const all = buildBranchSkills(h.specId, h.specBranchId);
  const unlocked = (all||[]).filter(sk => (Number(sk.levelReq)||1) <= lvl);

  const mult = tierSkillMult(h.tier); // -5% per better tier step
  return unlocked.map(sk=>{
    const out = Object.assign({}, sk);
    if (out.type === "cd" && typeof out.cd === "number"){
      out.cd = Math.max(1, Math.round(out.cd * mult));
    }
    if (out.type === "mana" && typeof out.mana === "number"){
      out.mana = Math.max(0, Math.round(out.mana * mult));
    }
    out._tierMult = mult;
    return out;
  });
}

  function hunterToTxt(h){
    const lines = [];

    const name = h.name ? h.name : 'Без імені';
    lines.push('== Хант ==');
    lines.push(`Ім'я: ${name}`);
    lines.push(`ID: ${h.id}`);
    lines.push(`Ступінь: ${h.tier}`);
    lines.push(`Середній стат: ${h.avg}`);
    lines.push('');

    lines.push('== Стати (з розшифровкою) ==');
    const pct = traitPctByStat(h);
    STATS.forEach(s=>{
      const vFinal = Number((h.stats||{})[s.key]) || 0;
      const vBase  = Number((h.baseStats||{})[s.key]) || 0;
      const p = Number(pct[s.key]) || 0;
      const pTxt = (p === 0) ? "" : ` (особливості ${p>0?"+":""}${p.toFixed(1)}%)`;
      lines.push(`${s.name}: ${vFinal.toFixed(2)}${pTxt} | ${statMeaning(s.key, vFinal)}`);
      lines.push(`  база: ${vBase.toFixed(2)}`);
    });

    lines.push('');
lines.push("== Очки розуму ==");
lines.push(`Очки розуму: ${Number(h.mind||0).toFixed(2)}`);
lines.push("");

    lines.push("== Мана ==");
    lines.push(`Максимум: ${Number(h.mana||0).toFixed(2)} | Поточна: ${Number(h.manaCur||0).toFixed(2)}`);
    lines.push("Відновлення: +2% від максимуму кожні 5 секунд");
    lines.push("");

    lines.push("== Спеціалізація ==");
    if (h.specId){
      const sp = SPECS.find(s=>s.id===h.specId);
      lines.push(`Спец: ${sp ? sp.name : h.specId}`);
      if (h.specBranchId){
        lines.push(`Гілка: ${getBranchDisplayName(h.specId, h.specBranchId)}`);
        lines.push(`Рівень гілки: ${Number(h.branchLevel)||0}`);
      } else {
        lines.push("Гілка: —");
      }
      if (typeof h.specPower === "number"){
        lines.push(`${h.specParamName || "Профільна сила"}: ${h.specPower}`);
      }
    } else {
      lines.push("—");
    }
    lines.push("");

    lines.push("== Навики ==");
    const skills = getUnlockedSkills(h);
    if (!skills.length){
      lines.push("—");
    } else {
      skills.forEach(sk=>{
        lines.push(`• ${sk.name}`);
        if (sk.desc) lines.push(`  ${sk.desc}`);
        if (sk.type === "mana") lines.push(`  Мана: ${Math.round(Number(sk.mana)||0)}`);
        if (sk.type === "cd") lines.push(`  КД: ${Math.round(Number(sk.cd)||0)} с`);
      });
    }
    lines.push("");

    
lines.push("== Особливості ==");
if (Array.isArray(h.traits) && h.traits.length){
  h.traits.forEach(tr=>{
    const meta = getTraitMeta(tr.id);
    const eff = getTraitEffect(tr.id);
    const type = meta ? meta.type : (tr.type||"skill");
    const rn = traitRankName(type, tr.rank);
    const mainName = (STATS.find(s=>s.key===eff.main)?.name) || eff.main;
    const subName = eff.sub ? ((STATS.find(s=>s.key===eff.sub)?.name) || eff.sub) : "";
    lines.push(`• ${tr.name || (meta?meta.name:tr.id)} (${rn})`);
    const lvl = (Number(tr.rank)||0) + 1;
    if (type==="vice"){
      lines.push(`  Ефект: -4% ×${lvl} до ${mainName} (сумується; застосовується окремо від тренування)`);
    } else {
      lines.push(`  Ефект: +2% ×${lvl} до ${mainName} (сумується; застосовується окремо від тренування)`);
    }
  });
} else lines.push("—");
lines.push("");

    lines.push("== Культ ==");
    if ((h.status||"")==="Атеїст"){
      lines.push("Атеїст");
    } else if (h.cultId){
      lines.push(`${h.cultName} — ${h.cultRankName}`);
      const st = Array.isArray(h.cultStatuses) ? h.cultStatuses : [];
      if (st.length) lines.push("Статуси: " + st.join(" • "));
    } else lines.push("—");
    lines.push("");

    
lines.push("== Зовнішність ==");
const A = h.appearance || {};
lines.push(`Вік: ${A.age || "—"}`);
lines.push(`Вага: ${A.weight || "—"}`);
lines.push(`Ріст: ${A.height || "—"}`);
lines.push(`Волосся: ${A.hair || "—"}`);
lines.push(`Очі: ${A.eyes || "—"}`);
lines.push(`Одяг: ${A.clothes || "—"}`);
lines.push(`Спорядження: ${A.gear || "—"}`);
lines.push("");

lines.push("== Лор ==");
lines.push(h.lore ? h.lore : "—");
lines.push("");

lines.push("== Зовнішність (текст) ==");
lines.push(h.appearanceText ? h.appearanceText : "—");
lines.push("");

lines.push("== Важливо ==");
lines.push(h.importantText ? h.importantText : "—");

    return lines.join("\n");
  }

  function downloadHunterTxt(h){
    recomputeHunter(h); // актуалізуємо manaCur/cultStatuses
    const txt = hunterToTxt(h);
    const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (h.name ? h.name : "hunter").replace(/[^a-zA-Z0-9_\-а-яА-ЯіІїЇєЄ]+/g, "_");
    a.href = url;
    a.download = `${safeName}_${h.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    toast("Файл завантажено");
  }

  // ===== Storage =====
  function loadHunters(){
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LS.HUNTERS) || "[]"); }
    catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.forEach(normalizeHunter);
    return arr;
  }
  function saveHunters(arr){
    localStorage.setItem(LS.HUNTERS, JSON.stringify(arr));
  }

  function getNextGen(){
    const v = localStorage.getItem(LS.NEXT_GEN);
    return v ? Number(v) : 0;
  }
  function setNextGen(ts){ localStorage.setItem(LS.NEXT_GEN, String(ts)); }

  function getSelectedHunterId(){ return localStorage.getItem(LS.SELECTED_HUNTER) || ""; }
  function setSelectedHunterId(id){ localStorage.setItem(LS.SELECTED_HUNTER, id); }

  // ===== Normalization / Migration =====
  function ensureRiskState(h){
    if (!h.riskPassed || typeof h.riskPassed !== "object") h.riskPassed = {};
    if (typeof h.permaDebuff !== "number") h.permaDebuff = 0;
  }

  function normalizeHunter(h){
    if (!h || typeof h !== "object") return;

    // Base stats migration:
    // - New format: h.baseStats = base (training changes this), h.stats = final (computed)
    // - Old format: only h.stats existed => treat it as base
    if (!h.baseStats || typeof h.baseStats !== "object"){
      const old = (h.stats && typeof h.stats === "object") ? h.stats : {};
      h.baseStats = {};
      STATS.forEach(s=>{ h.baseStats[s.key] = Number(old[s.key]) || 0; });
    }
    // Ensure baseStats has keys
    STATS.forEach(s => {
      if (typeof h.baseStats[s.key] !== "number") h.baseStats[s.key] = Number(h.baseStats[s.key]) || 0;
    });
    // Ensure stats object exists (will be overwritten by recomputeHunter)
    if (!h.stats || typeof h.stats !== "object") h.stats = {};

    // traits migration: old single traitId/traitRank -> traits[]
    if (!Array.isArray(h.traits)) h.traits = [];
    if (h.traitId && !h.traits.some(x=>x.id===h.traitId)){
      const meta = getTraitMeta(h.traitId);
      h.traits.push({
        id: h.traitId,
        type: meta ? meta.type : "skill",
        rank: Number(h.traitRank)||0,
      });
    }
    // cleanup old fields (keep if you want; harmless)
    if (typeof h.traitLastGainAt !== "number") h.traitLastGainAt = Number(h.traitLastPickAt)||0;
    if (typeof h.traitLastTrainAt !== "number") h.traitLastTrainAt = Number(h.traitLastTrainAt)||0;

    normalizeTraits(h);

    // cult fields
    if (typeof h.cultId !== "string") h.cultId = h.cultId ? String(h.cultId) : "";
    if (typeof h.cultRank !== "number") h.cultRank = Number(h.cultRank)||0;
    if (typeof h.cultLastUpgradeAt !== "number") h.cultLastUpgradeAt = Number(h.cultLastUpgradeAt)||0;

    // other fields defaults
    if (typeof h.lastTrainAt !== "number") h.lastTrainAt = Number(h.lastTrainAt)||0;
    if (typeof h.profile !== "number") h.profile = Number(h.profile)||0;
    if (typeof h.specId !== "string") h.specId = h.specId ? String(h.specId) : "";
    if (typeof h.lore !== "string") h.lore = h.lore ? String(h.lore) : "";
    if (typeof h.loreSetAt !== "number") h.loreSetAt = Number(h.loreSetAt)||0;

    if (typeof h.appearanceText !== "string") h.appearanceText = h.appearanceText ? String(h.appearanceText) : "";
    if (typeof h.importantText !== "string") h.importantText = h.importantText ? String(h.importantText) : "";

    
// appearance (free editable)
if (!h.appearance || typeof h.appearance !== "object") h.appearance = {};
const A = h.appearance;
if (typeof A.age !== "string") A.age = A.age ? String(A.age) : "";
if (typeof A.weight !== "string") A.weight = A.weight ? String(A.weight) : "";
if (typeof A.height !== "string") A.height = A.height ? String(A.height) : "";
if (typeof A.hair !== "string") A.hair = A.hair ? String(A.hair) : "";
if (typeof A.eyes !== "string") A.eyes = A.eyes ? String(A.eyes) : "";
if (typeof A.clothes !== "string") A.clothes = A.clothes ? String(A.clothes) : "";
if (typeof A.gear !== "string") A.gear = A.gear ? String(A.gear) : "";

ensureRiskState(h);
    recomputeHunter(h);
  }

  // ===== Risk mechanics =====
  function rollRiskOutcome(){
    const r = Math.random();
    if (r < 0.60) return "death";
    if (r < 0.80) return "debuff";
    return "ok";
  }

  function applyPermanentDebuffAll(h){
    ensureRiskState(h);
    if (h.permaDebuff >= 0.30) return;
    if (!h.baseStats) h.baseStats = {};
    STATS.forEach(s => { h.baseStats[s.key] = (Number(h.baseStats[s.key])||0) * 0.70; });
    h.permaDebuff = 0.30;
  }

  function clampUnpassedTo45(h, beforeStats){
    // Prevent unintended "reset" of stats already above the threshold.
    // If beforeStats is provided, we only clamp stats that *crossed* the threshold in this action
    // and do not have riskPassed.
    ensureRiskState(h);
    STATS.forEach(s=>{
      const k = s.key;
      const v = Number((h.baseStats||{})[k])||0;
      const before = beforeStats ? (Number(beforeStats[k])||0) : null;
      const shouldCheck = (beforeStats ? (before < CFG.RISK_THRESHOLD) : true);
      if (shouldCheck && !h.riskPassed[k] && v > CFG.RISK_THRESHOLD){
        h.baseStats[k] = CFG.RISK_THRESHOLD;
      }
    });
  }

  function detectNewCrossings(beforeStats, afterStats, h){
    // Risk check triggers ONLY when a stat crosses the 45 threshold in this action:
    // before <= 45  AND  after > 45
    const crossed = [];
    STATS.forEach(s=>{
      const k = s.key;
      const before = Number(beforeStats[k])||0;
      const after  = Number(afterStats[k])||0;
      if (before <= CFG.RISK_THRESHOLD && after > CFG.RISK_THRESHOLD){
        crossed.push(k);
      }
    });
    return crossed;
  }

  // ===== Core recompute =====
  function recomputeHunter(h){
    normalizeTraits(h);
    if (!h.baseStats || typeof h.baseStats !== "object"){
      // fallback (old saves)
      h.baseStats = {};
      STATS.forEach(s=>{ h.baseStats[s.key] = Number((h.stats||{})[s.key]) || 0; });
    }

    // 1) Base stats are what training & permanent systems modify.
    // 2) Final stats are base stats after trait percent modifiers (applied last).
    const pct = traitPctByStat(h);
    STATS.forEach(s=>{
      const base = Number(h.baseStats[s.key]) || 0;
      const p = Number(pct[s.key]) || 0;
      // keep decimals; allow decrease; no rounding
      h.stats[s.key] = base * (1 + (p / 100));
    });

    const sum = STATS.reduce((a,s)=>a + (Number(h.stats[s.key])||0), 0);
    h.avg = +(sum / STATS.length).toFixed(2);
    h.tier = calcTier(h.avg);
    h.mana = (Number(h.stats.int)||0) * 5;
    // mana current + regen (only for magic specs, but we keep pool for all)
    if (typeof h.manaCur !== "number") h.manaCur = h.mana;
    if (!h.manaLastTickAt) h.manaLastTickAt = Date.now();
    const now = Date.now();
    const dt = now - h.manaLastTickAt;
    if (dt > 0){
      // regen: +2% max mana each 5 seconds (continuous)
      const regen = (h.mana * 0.02) * (dt / 5000);
      if (regen > 0){
        h.manaCur = Math.min(h.mana, h.manaCur + regen);
        h.manaLastTickAt = now;
      }
    }
    // clamp
    h.manaCur = Math.max(0, Math.min(h.mana, h.manaCur));

    // Mind points (Очки розуму): based on FINAL WIL + INT, plus bonuses from vices
    const wil = Number(h.stats.wil)||0;
    const intel = Number(h.stats.int)||0;
    const mindBase = (wil + intel) * 5; // stable scale
    const vices = Array.isArray(h.traits) ? h.traits.filter(t => (getTraitMeta(t.id)?.type||t.type)==="vice") : [];
    const viceRanks = vices.reduce((a,t)=>a + (Number(t.rank)||0) + 1, 0); // each vice counts from 1..5
    const viceMult = 1 + Math.min(0.50, vices.length * 0.05); // up to +50%
    const viceFlat = viceRanks * 10; // flat bonus per vice level
    h.mind = mindBase * viceMult + viceFlat;


    if (h.specId){
      const spec = SPECS.find(x=>x.id===h.specId);
      if (spec){
        const P = spec.keys.reduce((a,[k,w]) => a + (Number(h.stats[k])||0)*w, 0);
        const baseProfile = (P + (Number(h.profile)||0)) * tierBonus(h.tier);
        h.specParamName = spec.param;
        h.specPower = +baseProfile.toFixed(2);
      }
    } else {
      delete h.specParamName;
      delete h.specPower;
    }

    if (h.cultId){
      const cult = getCult(h.cultId);
      h.cultName = cult ? cult.name : h.cultId;
      h.cultRankName = cult ? (cult.ranks[h.cultRank] || cult.ranks[0]) : String(h.cultRank);
      h.cultStatuses = cult ? cult.describe(h.cultRank) : [];
      if (Array.isArray(h.cultMarks) && h.cultMarks.length){
        // Додаткові мітки культу (не займають слоти особливостей)
        h.cultStatuses = h.cultStatuses.concat(h.cultMarks);
      }
    } else {
      delete h.cultName;
      delete h.cultRankName;
      h.cultStatuses = [];
    }
    return h;
  }

  function createHunterRaw(){
    const baseStats = {};
    STATS.forEach(s => baseStats[s.key] = randInt(6,18)); // stats now 6..18
    const h = {
      id: "h_" + Math.random().toString(16).slice(2) + "_" + Date.now(),
      name: null,
      baseStats,
      stats: {},

      lastTrainAt: 0,

      specId: "",
      profile: 0,
      // branch (one-time)
      specBranchId: "",
      branchLevel: 0,
      branchLastUpgradeAt: 0,
      // skills cooldowns
      skillCooldowns: {},
      // mana pool (for magic)
      // Start full (max). We keep it null so recomputeHunter sets manaCur = mana.
      manaCur: null,
      manaLastTickAt: Date.now(),
      // necro souls
      souls: 0,

      // traits
      traits: [],
      traitLastGainAt: 0,
      traitLastTrainAt: 0,

      // cult
      cultId: "",
      cultRank: 0,
      cultLastUpgradeAt: 0,

      // lore
      lore: "",
      loreSetAt: 0,

      // extra notes
      appearanceText: "",
      importantText: "",

      status: "",
      createdAt: Date.now(),

      riskPassed: {},
      permaDebuff: 0,
    };
  // status on creation: 80% atheist
    if (Math.random()<0.8){ h.status = "Атеїст"; }

    return recomputeHunter(h);
  }

  // ===== UI helpers =====
  function toast(msg){
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("toast--show");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(()=>t.classList.remove("toast--show"), 1800);
  }

  function setupNavActive(){
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav__link").forEach(a=>{
      const href = (a.getAttribute("href")||"").toLowerCase();
      if (href === path) a.classList.add("nav__link--active");
    });

    const menuBtn = document.getElementById("menuBtn");
    const mobileNav = document.getElementById("mobileNav");
    if (menuBtn && mobileNav){
      menuBtn.addEventListener("click", ()=>{
        const open = mobileNav.classList.toggle("nav--open");
        menuBtn.setAttribute("aria-expanded", String(open));
      });
      mobileNav.querySelectorAll("a").forEach(a=>a.addEventListener("click", ()=>{
        mobileNav.classList.remove("nav--open");
        menuBtn.setAttribute("aria-expanded","false");
      }));
    }
  }

  function canGenerate(){
    const hunters = loadHunters();
    if (hunters.length >= CFG.MAX_HUNTERS) return {ok:false, reason:"MAX"};
    const next = getNextGen();
    if (Date.now() < next) return {ok:false, reason:"CD", left: next - Date.now()};
    return {ok:true, reason:"OK", left:0};
  }

  // ===== Stat meanings =====
  function statMeaning(key, value){
    const m = mul(value);

    // Base values at stat = 10
    const base = {
      str: { liftKg: 120, punchN: 1600 },
      sta: { runKm: 10, workH: 3.0, painPct: 100 },
      agi: { sprint: 8.0, turnSec: 0.55, jumpM: 0.55 },
      rea: { rtSec: 0.24 },
      int: { cogPct: 100, learnPct: 100 },
      per: { detectM: 45, accPct: 100 },
      wil: { mindPct: 100, fearPct: 100 },
    };

    if (key==="str"){
      const lift = Math.round(base.str.liftKg*m);
      const punch = Math.round(base.str.punchN*m);
      return `Підйом: ~${lift} кг • Удар: ~${punch} Н`;
    }
    if (key==="sta"){
      const run = (base.sta.runKm*m).toFixed(1);
      const work = (base.sta.workH*m).toFixed(1);
      const pain = Math.round(base.sta.painPct*m);
      return `Біг без зупинки: ~${run} км • Робота: ~${work} год • Стійкість: ~${pain}%`;
    }
    if (key==="agi"){
      const sp = (base.agi.sprint*m).toFixed(1);
      const turn = (base.agi.turnSec/Math.max(0.2,m)).toFixed(2);
      const jump = (base.agi.jumpM*m).toFixed(2);
      return `Спринт: ~${sp} м/с • Розворот: ~${turn} с • Стрибок: ~${jump} м`;
    }
    if (key==="rea"){
      const rt = (base.rea.rtSec/Math.max(0.2,m)).toFixed(3);
      return `Час реакції: ~${rt} с`;
    }
    if (key==="int"){
      const cog = Math.round(base.int.cogPct*m);
      const learn = Math.round(base.int.learnPct*m);
      return `Мислення: ~${cog}% • Навчання: ~${learn}% • Мана: ${Math.round(value*5)}`;
    }
    if (key==="per"){
      const det = Math.round(base.per.detectM*m);
      const acc = Math.round(base.per.accPct*m);
      return `Помітити рух: ~${det} м • Точність: ~${acc}%`;
    }
    if (key==="wil"){
      const mind = Math.round(base.wil.mindPct*m);
      const fear = Math.round(base.wil.fearPct*m);
      return `Психостійкість: ~${mind}% • Опір тиску: ~${fear}%`;
    }
    return "";
  }

  // ===== Traits mechanics =====
  function addTrait(h, traitId){
    if (!Array.isArray(h.traits)) h.traits = [];
    if (h.traits.some(t=>t.id===traitId)) return false;
    const meta = getTraitMeta(traitId);
    h.traits.push({ id: traitId, type: meta ? meta.type : "skill", rank: 0 });
    return true;
  }

  function getTraitCooldownLeft(h, kind){
    const now = Date.now();
    if (kind === "gain"){
      const left = (Number(h.traitLastGainAt)||0) + CFG.TRAIT_GAIN_COOLDOWN_MS - now;
      return Math.max(0, left);
    }
    const left = (Number(h.traitLastTrainAt)||0) + CFG.TRAIT_TRAIN_COOLDOWN_MS - now;
    return Math.max(0, left);
  }

  function gainRandomTrait(h){
    if (!Array.isArray(h.traits)) h.traits = [];
    if (h.traits.length >= CFG.MAX_TRAITS_PER_HUNTER) return {ok:false, msg:"Ліміт особливостей"};
    const left = getTraitCooldownLeft(h, "gain");
    if (left>0) return {ok:false, msg:`КД: ${hms(left)}`};

    const owned = new Set(h.traits.map(t=>t.id));
    const pool = TRAITS.filter(t=>!owned.has(t.id));
    if (!pool.length) return {ok:false, msg:"Нема доступних"};
    const pick = pool[Math.floor(Math.random()*pool.length)];
    addTrait(h, pick.id);
    h.traitLastGainAt = Date.now();
    return {ok:true, msg:`Особливість: ${pick.name}`};
  }

  function trainRandomTrait(h){
    if (!Array.isArray(h.traits) || !h.traits.length) return {ok:false, msg:"Нема особливостей"};
    const left = getTraitCooldownLeft(h, "train");
    if (left>0) return {ok:false, msg:`КД: ${hms(left)}`};

    const upgradable = h.traits.filter(t => (Number(t.rank)||0) < 4);
    if (!upgradable.length) return {ok:false, msg:"Всі на максимумі"};
    const pick = upgradable[Math.floor(Math.random()*upgradable.length)];
    pick.rank = Math.min(4, (Number(pick.rank)||0) + 1);
    h.traitLastTrainAt = Date.now();

    const meta = getTraitMeta(pick.id);
    const name = meta ? meta.name : pick.id;
    return {ok:true, msg:`Прокачано: ${name} → ${traitRankName(pick.type, pick.rank)}`};
  }

  function formatTraits(h){
    if (!Array.isArray(h.traits) || !h.traits.length) return "—";
    return h.traits.map(t=>{
      const meta = getTraitMeta(t.id);
      const name = meta ? meta.name : t.id;
      return `${name} (${traitRankName(t.type, t.rank)})`;
    }).join(" • ");
  }

  // ===== Cult mechanics =====
  function cultUpgradeLeft(h){
    if (!h.cultId) return 0;
    const left = (Number(h.cultLastUpgradeAt)||0) + CFG.CULT_UP_COOLDOWN_MS - Date.now();
    return Math.max(0, left);
  }

  function joinCult(h, cultId, choice){
    if ((h.status||"")==="Атеїст") return {ok:false, msg:"Атеїст не може вступити в культ"};
    if (h.cultId) return {ok:false, msg:"Вступ незворотній: культ вже є"};
    const cult = getCult(cultId);
    if (!cult) return {ok:false, msg:"Невідомий культ"};
    h.cultId = cultId;
    h.cultRank = 0;
    h.cultLastUpgradeAt = Date.now(); // lock for 24h from join
    let joinMsg = `Вступив: ${cult.name}`;
    if (cult.onJoin){
      const out = cult.onJoin(h, choice);
      if (out && out.dead){
        // mark for caller to delete hunter
        return {ok:false, dead:true, msg: out.msg || "Хант помер"};
      }
      if (out && out.msg) joinMsg = out.msg;
    }
    recomputeHunter(h);
    return {ok:true, msg: joinMsg};
  }

  function upgradeCult(h){
    if (!h.cultId) return {ok:false, msg:"Нема культу"};
    const cult = getCult(h.cultId);
    if (!cult) return {ok:false, msg:"Невідомий культ"};
    const left = cultUpgradeLeft(h);
    if (left>0) return {ok:false, msg:`КД: ${hms(left)}`};
    if (h.cultRank >= cult.ranks.length-1) return {ok:false, msg:"Макс ранг"};
    h.cultRank += 1;
    h.cultLastUpgradeAt = Date.now();
    recomputeHunter(h);
    return {ok:true, msg:`Ранг культу: ${cult.ranks[h.cultRank]}`};
  }

  // ====== Risk modal (training.html) ======
  function openRiskModal({title, text, onStop, onContinue}){
    const modal = document.getElementById("riskModal");
    const titleEl = document.getElementById("riskTitle");
    const textEl = document.getElementById("riskText");
    const stopBtn = document.getElementById("riskStopBtn");
    const contBtn = document.getElementById("riskContinueBtn");
    if (!modal || !titleEl || !textEl || !stopBtn || !contBtn){
      // fallback
      const ok = confirm(text || "Ризик. Продовжити?");
      if (ok) onContinue && onContinue();
      else onStop && onStop();
      return;
    }

    titleEl.textContent = title || "Ризик";
    textEl.textContent = text || "—";

    const close = ()=>{
      modal.classList.remove("modal--open");
      modal.setAttribute("aria-hidden","true");
      stopBtn.onclick = null;
      contBtn.onclick = null;
    };

    stopBtn.onclick = ()=>{
      close();
      onStop && onStop();
    };
    contBtn.onclick = ()=>{
      close();
      onContinue && onContinue();
    };

    modal.classList.add("modal--open");
    modal.setAttribute("aria-hidden","false");
  }

  // ===== Hunters page =====
  function initHuntersPage(){
    const list = document.getElementById("hunterList");
    const empty = document.getElementById("emptyState");
    const count = document.getElementById("huntersCount");
    const maxText = document.getElementById("maxHuntersText");
    const maxKpi = document.getElementById("huntersMax");
    if (maxText) maxText.textContent = String(CFG.MAX_HUNTERS);
    if (maxKpi) maxKpi.textContent = String(CFG.MAX_HUNTERS);

    const cd = document.getElementById("cooldownText");
    const genBtn = document.getElementById("generateBtn");

    const modal = document.getElementById("nameModal");
    const nameInput = document.getElementById("nameInput");
    const saveNameBtn = document.getElementById("saveNameBtn");
    const cancelNameBtn = document.getElementById("cancelNameBtn");

    if (!list || !genBtn) return;

    let pendingId = "";

    function openNameModal(){
      if (!modal) return;
      modal.classList.add("modal--open");
      modal.setAttribute("aria-hidden","false");
      if (nameInput){
        nameInput.value = "";
        nameInput.focus();
      }
    }
    function closeNameModal(){
      if (!modal) return;
      modal.classList.remove("modal--open");
      modal.setAttribute("aria-hidden","true");
      pendingId = "";
    }

    modal && modal.addEventListener("click",(e)=>{
      if (e.target && e.target.dataset && ("close" in e.target.dataset)) closeNameModal();
    });
    cancelNameBtn && cancelNameBtn.addEventListener("click", closeNameModal);

    saveNameBtn && saveNameBtn.addEventListener("click", ()=>{
      const name = (nameInput?.value || "").trim();
      if (!name) return;
      const hunters = loadHunters();
      const h = hunters.find(x=>x.id===pendingId);
      if (!h) return;
      if (h.name) return;
      h.name = name;
      recomputeHunter(h);
      saveHunters(hunters);
      closeNameModal();
      render();
      toast("Ім'я збережено");
    });

    function toggleItem(item){
      const isOpen = item.classList.contains("item--open");
      document.querySelectorAll(".item.item--open").forEach(x=>{
        if (x !== item){
          x.classList.remove("item--open");
          const btn = x.querySelector(".item__head");
          if (btn) btn.setAttribute("aria-expanded","false");
        }
      });
      item.classList.toggle("item--open", !isOpen);
      const btn = item.querySelector(".item__head");
      btn && btn.setAttribute("aria-expanded", String(!isOpen));
    }

    function render(){
      const hunters = loadHunters();
      count && (count.textContent = String(hunters.length));
      empty && (empty.style.display = hunters.length ? "none" : "block");
      list.innerHTML = "";

      hunters.forEach(h=>{
        normalizeHunter(h);
        const item = document.createElement("div");
        item.className = "item";
        const name = h.name ? escapeHtml(h.name) : "Без імені";

        const specLine = h.specId ? (() => {
          const spec = SPECS.find(s=>s.id===h.specId);
          if (!spec) return "";
          return `<span class="dot">•</span><span>${escapeHtml(spec.name)}: <b>${escapeHtml(h.specParamName || spec.param)}</b> <b>${h.specPower ?? "—"}</b></span>`;
        })() : "";

        const cultLine = h.cultId
          ? `${escapeHtml(h.cultName)} • <b>${escapeHtml(h.cultRankName)}</b>`
          : "—";

        const cultCd = h.cultId ? hms(cultUpgradeLeft(h)) : "—";

        const traitGainCd = hms(getTraitCooldownLeft(h, "gain"));
        const traitTrainCd = hms(getTraitCooldownLeft(h, "train"));

        const canGainTrait = (Array.isArray(h.traits) ? h.traits.length : 0) < CFG.MAX_TRAITS_PER_HUNTER;

        item.innerHTML = `
          <button class="item__head" aria-expanded="false">
            <div>
              <div class="item__name">${name}</div>
              <div class="item__meta">
                <span>Ступінь: <b>${h.tier}</b></span>
                <span class="dot">•</span>
                <span>Середній: <b>${h.avg}</b></span>
                <span class="dot">•</span>
                <span>Розум: <b>${Math.round(Number(h.mind)||0)}</b></span>
                ${specLine}
              </div>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>

          <div class="item__body" role="region" aria-label="Деталі ханта">
            <div class="note" style="margin-top:10px">
              <div class="note__title">Культ</div>
              <div class="note__text">${cultLine}<br><span style="color:var(--muted)">Підвищення через:</span> <b>${cultCd}</b></div>
              <div class="actions" style="justify-content:flex-start; margin-top:10px; gap:8px; flex-wrap:wrap">
                <a class="btn btn--primary" href="cults.html" data-setsel="${escapeHtml(h.id)}">Культи</a>
              </div>
            </div>

            <div class="note" style="margin-top:10px">
              <div class="note__title">Статуси культу</div>
              <div class="note__text">${(h.cultStatuses && h.cultStatuses.length) ? escapeHtml(h.cultStatuses.join(" • ")) : "—"}</div>
            </div>

            <div class="note" style="margin-top:10px">
              <div class="note__title">Особливості</div>
              <div class="note__text">${escapeHtml(formatTraits(h))}</div>
              <div class="note__text" style="color:var(--muted); margin-top:6px">КД отримання: <b>${traitGainCd}</b> • КД прокачки: <b>${traitTrainCd}</b></div>
              <div class="actions" style="justify-content:flex-start; margin-top:10px; gap:8px; flex-wrap:wrap">
                ${canGainTrait ? `<button class="btn btn--primary" type="button" data-traitgain="${escapeHtml(h.id)}">Отримати (рандом)</button>` : ``}
                <button class="btn" type="button" data-traittrain="${escapeHtml(h.id)}">Прокачати (рандом)</button>
              </div>
            </div>

            <div class="note" style="margin-top:10px">
              <div class="note__title">Спеціалізація</div>
              <div class="note__text">
                ${h.specId ? (()=>{ const sp=SPECS.find(s=>s.id===h.specId); return `${escapeHtml(sp?sp.name:h.specId)} • ${escapeHtml(h.specParamName|| (sp?sp.param:""))}: <b>${h.specPower ?? "—"}</b>`; })() : "—"}
              </div>
            </div>

            ${renderBranchBlock(h)}


<div class="note" style="margin-top:10px">
  <div class="note__title">Зовнішність</div>
  <div class="note__text" style="color:var(--muted)">Заповнюй як хочеш — зберігається і піде в .txt.</div>
  <div class="formGrid" style="margin-top:10px">
    <label class="field">Вік<input class="input" data-app="age" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.age)||"")}" placeholder="—"></label>
    <label class="field">Вага<input class="input" data-app="weight" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.weight)||"")}" placeholder="—"></label>
    <label class="field">Ріст<input class="input" data-app="height" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.height)||"")}" placeholder="—"></label>
    <label class="field">Волосся<input class="input" data-app="hair" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.hair)||"")}" placeholder="—"></label>
    <label class="field">Очі<input class="input" data-app="eyes" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.eyes)||"")}" placeholder="—"></label>
    <label class="field">Одяг<input class="input" data-app="clothes" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.clothes)||"")}" placeholder="—"></label>
    <label class="field">Спорядження<input class="input" data-app="gear" data-hid="${escapeHtml(h.id)}" value="${escapeHtml((h.appearance&&h.appearance.gear)||"")}" placeholder="—"></label>
  </div>
</div>

<div class="note" style="margin-top:10px">
  <div class="note__title">Зовнішність (текст)</div>
  <div class="note__text" style="color:var(--muted)">Вільний опис. Впливає тільки на запис/експорт.</div>
  <textarea class="input" style="min-height:90px; padding:10px 12px; width:100%; resize:vertical" data-extra="appearanceText" data-hid="${escapeHtml(h.id)}" placeholder="Опиши зовнішність...">${escapeHtml(h.appearanceText||"")}</textarea>
</div>

<div class="note" style="margin-top:10px">
  <div class="note__title">Важливо</div>
  <div class="note__text" style="color:var(--muted)">Будь-які нотатки (тригери, слабкості, правила, тощо).</div>
  <textarea class="input" style="min-height:90px; padding:10px 12px; width:100%; resize:vertical" data-extra="importantText" data-hid="${escapeHtml(h.id)}" placeholder="Що важливо пам’ятати...">${escapeHtml(h.importantText||"")}</textarea>
</div>

            <div class="statsGrid">
              ${STATS.map(s => {
                const val = Number(h.stats[s.key]) || 0;
                const meaning = statMeaning(s.key, val);
                return `
                  <div class="kv">
                    <div class="kv__k">${s.name}</div>
                    <div class="kv__v">${val.toFixed(2)} <span style="color:var(--muted); font-size:12px; font-weight:800">×${mul(val).toFixed(2)}</span></div>
                    <div style="color:var(--muted); font-size:12px; line-height:1.35; margin-top:6px">${escapeHtml(meaning)}</div>
                  </div>
                `;
              }).join("")}
            </div>

            <div class="actions" style="justify-content:flex-start; margin-top:12px">
              <button class="btn" type="button" data-export="${escapeHtml(h.id)}">Завантажити .txt</button>
              <button class="btn btn--danger" type="button" data-del="${escapeHtml(h.id)}">Видалити ханта</button>
            </div>
          </div>
        `;

        item.querySelector(".item__head")?.addEventListener("click", ()=>toggleItem(item));
        list.appendChild(item);
      });

      const c = canGenerate();
      genBtn.disabled = !c.ok;
      genBtn.textContent = (!c.ok && c.reason==="MAX") ? `Ліміт ${CFG.MAX_HUNTERS} хантів` : "Згенерувати ханта";

      // store selected hunter when clicking Cults link
      list.querySelectorAll("[data-setsel]").forEach(a=>{
        a.addEventListener("click", ()=>{
          const id = a.getAttribute("data-setsel") || "";
          if (id) setSelectedHunterId(id);
        });
      });
    }

    function tick(){
      const left = getNextGen() - Date.now();
      cd && (cd.textContent = hms(left));
      const c = canGenerate();
      genBtn.disabled = !c.ok;
    }

    list.addEventListener("click", (e)=>{
      const t = e.target;
      if (!t || !t.getAttribute) return;

      const idDel = t.getAttribute("data-del");
      if (idDel){
        if (!confirm("Точно видалити ханта? Це незворотно.")) return;
        const hs = loadHunters();
        const idx = hs.findIndex(x=>x.id===idDel);
        if (idx>=0) hs.splice(idx,1);
        saveHunters(hs);
        toast("Хант видалений");
        render();
        return;
      }

      const idGain = t.getAttribute("data-traitgain");
      if (idGain){
        const hs = loadHunters();
        const h = hs.find(x=>x.id===idGain);
        if (!h) return;
        const res = gainRandomTrait(h);
        recomputeHunter(h);
        saveHunters(hs);
        toast(res.msg);
        render();
        return;
      }

      const idTrain = t.getAttribute("data-traittrain");
      if (idTrain){
        const hs = loadHunters();
        const h = hs.find(x=>x.id===idTrain);
        if (!h) return;
        const res = trainRandomTrait(h);
        recomputeHunter(h);
        saveHunters(hs);
        toast(res.msg);
        render();
        return;
      }

      const idExport = t.getAttribute("data-export");
      if (idExport){
        const hs = loadHunters();
        const h = hs.find(x=>x.id===idExport);
        if (!h){ toast("Ханта не знайдено"); return; }
        try { downloadHunterTxt(h); }
        catch (err){ console.error(err); toast("Помилка експорту"); }
        return;
      }


      const idPick = t.getAttribute("data-branchpick");
      if (idPick){
        const branchId = t.getAttribute("data-branchid") || "";
        const hs = loadHunters();
        const h = hs.find(x=>x.id===idPick);
        if (!h) return;
        if (!h.specId){ toast("Спочатку обери спеціалізацію"); return; }
        if (h.specBranchId){ toast("Гілка вже вибрана (1 раз)"); return; }
        if (!branchId){ toast("Нема гілки"); return; }
        h.specBranchId = branchId;
        h.branchLevel = 1;
        h.branchLastUpgradeAt = Date.now(); // next upgrade in 12h
        if (!h.skillCooldowns) h.skillCooldowns = {};
        recomputeHunter(h);
        saveHunters(hs);
        toast("Гілка вибрана");
        render();
        return;
      }

      const idUp = t.getAttribute("data-branchup");
      if (idUp){
        const hs = loadHunters();
        const h = hs.find(x=>x.id===idUp);
        if (!h) return;
        if (!h.specBranchId){ toast("Нема гілки"); return; }
        const left = branchUpgradeLeftMs(h);
        if (left>0){ toast(`Ще: ${hms(left)}`); return; }
        const lvl = Math.max(1, Number(h.branchLevel||1));
        if (lvl >= BRANCH.MAX_LEVEL){ toast("Макс рівень"); return; }
        h.branchLevel = lvl + 1;
        h.branchLastUpgradeAt = Date.now();
        recomputeHunter(h);
        saveHunters(hs);
        toast(`Рівень гілки: ${h.branchLevel}`);
        render();
        return;
      }

      const skToggle = t.getAttribute("data-skilltoggle");
      if (skToggle){
        const wrap = t.closest ? t.closest("[data-skillwrap]") : null;
        if (wrap) wrap.classList.toggle("skill--open");
        return;
      }

      // Final: skills are informational cards (no "use" button).


// Save appearance inputs live
list.addEventListener("input", (e)=>{
  const t = e.target;
  if (!t || !t.getAttribute) return;

  const hid = t.getAttribute("data-hid");
  if (!hid) return;

  const extra = t.getAttribute("data-extra");
  if (extra){
    const hs = loadHunters();
    const h = hs.find(x=>x.id===hid);
    if (!h) return;
    if (extra === "appearanceText") h.appearanceText = String(t.value || "");
    if (extra === "importantText") h.importantText = String(t.value || "");
    saveHunters(hs);
    return;
  }

  const field = t.getAttribute("data-app");
  if (!field) return;

  const hs = loadHunters();
  const h = hs.find(x=>x.id===hid);
  if (!h) return;
  if (!h.appearance || typeof h.appearance!=="object") h.appearance = {};
  h.appearance[field] = String(t.value || "");
  saveHunters(hs);
});

    });

    genBtn.addEventListener("click", ()=>{
      const c = canGenerate();
      if (!c.ok){
        toast(c.reason==="CD" ? `Чекай: ${hms(c.left)}` : "Ліміт хантів");
        return;
      }
      const hunters = loadHunters();
      const h = createHunterRaw();
      hunters.push(h);
      saveHunters(hunters);

      setNextGen(Date.now() + CFG.GEN_COOLDOWN_MS);

      pendingId = h.id;
      openNameModal();
      render();
      toast("Хант створений");
    });

    render();
    tick();
    setInterval(tick, 1000);
  }

  // ===== Training page =====
  function initTrainingPage(){
    const hunterSelect = document.getElementById("hunterSelect");
    const hunterHint = document.getElementById("hunterHint");
    const complexList = document.getElementById("complexList");
    const trainBtn = document.getElementById("trainBtn");
    const cd = document.getElementById("trainCooldown");
    const details = document.getElementById("trainDetails");
    if (!hunterSelect || !complexList || !trainBtn) return;

    let selectedComplex = COMPLEXES[0].id;

    function fillHunters(){
      const hunters = loadHunters();
      hunterSelect.innerHTML = "";

      if (!hunters.length){
        hunterHint && (hunterHint.textContent = "Нема хантів. Спочатку створи ханта.");
        trainBtn.disabled = true;
        return;
      }
      hunterHint && (hunterHint.textContent = "Тренування зараховує 12 год прогресу (3 цикли). Кнопка знову активна через 14 год.");

      hunters.forEach(h=>{
        recomputeHunter(h);
        const opt = document.createElement("option");
        opt.value = h.id;
        const name = h.name ? h.name : "Без імені";
        opt.textContent = `${name} (ступінь ${h.tier}, avg ${h.avg})`;
        hunterSelect.appendChild(opt);
      });

      const saved = getSelectedHunterId();
      hunterSelect.value = hunters.some(h=>h.id===saved) ? saved : hunters[0].id;
      setSelectedHunterId(hunterSelect.value);

      trainBtn.disabled = false;
      renderCooldown();
      renderDetails();
    }

    function renderComplexes(){
      complexList.innerHTML = "";
      COMPLEXES.forEach(c=>{
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.type = "button";
        btn.textContent = c.name;
        btn.addEventListener("click", ()=>{
          selectedComplex = c.id;
          complexList.querySelectorAll(".btn").forEach(x=>x.classList.remove("btn--primary"));
          btn.classList.add("btn--primary");
          renderDetails();
        });
        if (c.id === selectedComplex) btn.classList.add("btn--primary");
        complexList.appendChild(btn);
      });
    }

    function canTrain(h){
      const left = (Number(h.lastTrainAt)||0) + CFG.TRAIN_COOLDOWN_MS - Date.now();
      return { ok: left <= 0, left: Math.max(0,left) };
    }

    function simulateTrainingResult(h, complex, rolls){
      const before={}; STATS.forEach(s=>before[s.key]=Number((h.baseStats||{})[s.key])||0);
      const after={...before};
      for (let i=0;i<rolls.length;i++){
        const pts=rolls[i]*0.5; // nerf training points x0.5
        complex.weights.forEach(([statKey,w])=>{
          const rawGain=pts*w;
          const eff=efficiency(Number(after[statKey])||0);
          after[statKey]=(Number(after[statKey])||0)+rawGain*eff;
        });
      }
      return {before, after};
    }

    function applyTrainingWithRolls(h, complex, rolls){
      if (!h.baseStats) h.baseStats = {};
      for (let i=0;i<rolls.length;i++){
        const pts=rolls[i]*0.5; // nerf training points x0.5

        complex.weights.forEach(([statKey,w])=>{
          const rawGain=pts*w;
          const eff=efficiency(Number(h.baseStats[statKey])||0);
          h.baseStats[statKey]=(Number(h.baseStats[statKey])||0)+rawGain*eff;
        });

        if (h.specId){
          const spec=SPECS.find(s=>s.id===h.specId);
          if (spec){
            const mainSpecStat = spec.keys[0][0];
            const mainComplexStat = complex.weights[0][0];
            if (mainSpecStat===mainComplexStat){
              const rawProf=pts*0.6;
              const profEff=efficiency(Number(h.profile||0));
              h.profile=(Number(h.profile)||0)+rawProf*profEff;
            }
          }
        }
      }
      h.lastTrainAt = Date.now();
      recomputeHunter(h);
    }

    function getHunter(){
      const hunters = loadHunters();
      return hunters.find(h=>h.id===hunterSelect.value) || null;
    }

    function renderDetails(){
      const h = getHunter();
      if (!h){ details && (details.textContent="—"); return; }
      const complex = COMPLEXES.find(c=>c.id===selectedComplex) || COMPLEXES[0];
      const lines = complex.weights.map(([k,w])=>{
        const s = STATS.find(x=>x.key===k);
        return `${s.name} ${Math.round(w*100)}%`;
      }).join(" • ");
      const spec = h.specId ? SPECS.find(s=>s.id===h.specId) : null;
      const specLine = spec
        ? `Спец: ${spec.name} (${spec.param}) • профіль: ${Number(h.profile||0).toFixed(2)} • ступінь: ${h.tier}`
        : `Спец: нема`;
      details && (details.textContent = `${complex.name}: ${lines} | ${specLine}`);
    }

    function renderCooldown(){
      const h = getHunter();
      if (!h){ cd && (cd.textContent="—"); return; }
      const c = canTrain(h);
      cd && (cd.textContent = hms(c.left));
      trainBtn.disabled = !c.ok;
    }

    trainBtn.addEventListener("click", ()=>{
      const hunters = loadHunters();
      const h = hunters.find(x=>x.id===hunterSelect.value);
      if (!h){ toast("Ханта не знайдено"); return; }
      normalizeHunter(h);

      const c = canTrain(h);
      if (!c.ok){ toast(`Відкат: ${hms(c.left)}`); return; }

      const complex = COMPLEXES.find(x=>x.id===selectedComplex) || COMPLEXES[0];

      const rolls = [];
      for (let i=0;i<CFG.CYCLES_PER_TRAIN;i++) rolls.push(randInt(CFG.CYCLE_POINTS_MIN, CFG.CYCLE_POINTS_MAX));

      const sim = simulateTrainingResult(h, complex, rolls);
      const crossed = detectNewCrossings(sim.before, sim.after, h);

      const doApply = ()=>{
        if (crossed.length){
          const out = rollRiskOutcome();
          if (out === "death"){
            const idx = hunters.findIndex(x=>x.id===h.id);
            if (idx>=0) hunters.splice(idx,1);
            saveHunters(hunters);
            toast("Ризик: смерть. Хант втрачений.");
            fillHunters();
            return;
          }
          if (out === "debuff"){
            applyPermanentDebuffAll(h);
            toast("Ризик: -30% до всього назавжди.");
          } else {
            toast("Ризик: вижив.");
          }
        }

        applyTrainingWithRolls(h, complex, rolls);

        recomputeHunter(h);
        saveHunters(hunters);
        toast("Тренування зараховано");
        renderCooldown();
        renderDetails();
      };

      if (crossed.length){
        openRiskModal({
          title: "Перехід 45+ — ризик",
          text: `Тренування підніме стат(и) понад 45: ${crossed.join(", ")}.\nПродовжити?\n60% смерть • 20% -30% до всього • 20% вижив.`,
          onStop: ()=>toast("Зупинився."),
          onContinue: doApply
        });
      } else {
        doApply();
      }
    });

    hunterSelect.addEventListener("change", ()=>{
      setSelectedHunterId(hunterSelect.value);
      renderCooldown();
      renderDetails();
    });

    fillHunters();
    renderComplexes();
    renderCooldown();
    setInterval(renderCooldown, 1000);
  }

  // ===== Direction page =====
  function initDirectionPage(){
    const hunterSelect = document.getElementById("dirHunterSelect");
    const currentBox = document.getElementById("currentSpecBox");
    const specList = document.getElementById("specList");
    const applyBtn = document.getElementById("applySpecBtn");
    if (!hunterSelect || !specList || !applyBtn) return;

    let chosenSpecId = "";

    function fillHunters(){
      const hunters = loadHunters();
      hunterSelect.innerHTML = "";
      if (!hunters.length){
        currentBox && (currentBox.textContent = "Нема хантів. Спочатку створи ханта.");
        applyBtn.disabled = true;
        return;
      }
      hunters.forEach(h=>{
        recomputeHunter(h);
        const opt = document.createElement("option");
        opt.value = h.id;
        const name = h.name ? h.name : "Без імені";
        opt.textContent = `${name} (ступінь ${h.tier})`;
        hunterSelect.appendChild(opt);
      });
      const saved = getSelectedHunterId();
      hunterSelect.value = hunters.some(h=>h.id===saved) ? saved : hunters[0].id;
      setSelectedHunterId(hunterSelect.value);
      applyBtn.disabled = false;
      renderCurrent();
    }

    function renderCurrent(){
      const h = loadHunters().find(x=>x.id===hunterSelect.value);
      if (!h){ currentBox && (currentBox.textContent="—"); return; }
      if (!h.specId){ currentBox && (currentBox.textContent="Спеціалізація не вибрана."); return; }
      const spec = SPECS.find(s=>s.id===h.specId);
      currentBox && (currentBox.textContent =
        `Поточна: ${spec ? spec.name : h.specId} • ${h.specParamName||""}: ${h.specPower ?? "—"} • профіль: ${Number(h.profile||0).toFixed(2)}`
      );
    }

    function toggleItem(item){
      const isOpen = item.classList.contains("item--open");
      document.querySelectorAll(".item.item--open").forEach(x=>{
        if (x!==item){
          x.classList.remove("item--open");
          const btn=x.querySelector(".item__head");
          btn && btn.setAttribute("aria-expanded","false");
        }
      });
      item.classList.toggle("item--open", !isOpen);
      const btn=item.querySelector(".item__head");
      btn && btn.setAttribute("aria-expanded", String(!isOpen));
    }

    function renderSpecs(){
      specList.innerHTML = "";
      SPECS.forEach(s=>{
        const card=document.createElement("div");
        card.className="item";
        card.innerHTML=`
          <button class="item__head" aria-expanded="false">
            <div>
              <div class="item__name">${escapeHtml(s.name)}</div>
              <div class="item__meta">
                <span>Параметр: <b>${escapeHtml(s.param)}</b></span>
                <span class="dot">•</span>
                <span>Ключі: <b>${s.keys.map(k=>STATS.find(x=>x.key===k[0]).name+" "+Math.round(k[1]*100)+"%").join(" • ")}</b></span>
              </div>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>
          <div class="item__body">
            <div class="actions" style="justify-content:flex-start; margin-top:10px">
              <button class="btn btn--primary" type="button" data-pick="${escapeHtml(s.id)}">Вибрати</button>
            </div>
          </div>
        `;
        card.querySelector(".item__head")?.addEventListener("click", ()=>toggleItem(card));
        card.querySelector("[data-pick]")?.addEventListener("click", ()=>{
          chosenSpecId=s.id;
          toast(`Обрано: ${s.name}`);
        });
        specList.appendChild(card);
      });
    }

    applyBtn.addEventListener("click", ()=>{
      const hunters = loadHunters();
      const h = hunters.find(x=>x.id===hunterSelect.value);
      if (!h) return;
      if (h.specId){ toast("Спец вже вибрана (1 раз)"); return; }
      if (!chosenSpecId){ toast("Обери спец"); return; }
      h.specId = chosenSpecId;
      h.profile = 0;
      recomputeHunter(h);
      saveHunters(hunters);
      renderCurrent();
      toast("Застосовано");
    });

    hunterSelect.addEventListener("change", ()=>{
      setSelectedHunterId(hunterSelect.value);
      chosenSpecId="";
      renderCurrent();
    });

    fillHunters();
    renderSpecs();
  }

  // ===== Cults page =====
  function initCultsPage(){
    const hunterSelect = document.getElementById("cultHunterSelect");
    const currentBox = document.getElementById("currentCultBox");
    const cdEl = document.getElementById("cultCooldownText");
    const list = document.getElementById("cultList");
    const upBtn = document.getElementById("cultUpgradeBtn");
    if (!hunterSelect || !currentBox || !cdEl || !list || !upBtn) return;

    function fillHunters(){
      const hunters = loadHunters();
      hunterSelect.innerHTML = "";
      if (!hunters.length){
        currentBox.textContent = "Нема хантів. Спочатку створи ханта.";
        upBtn.disabled = true;
        list.innerHTML = "";
        return;
      }
      hunters.forEach(h=>{
        const opt = document.createElement("option");
        opt.value = h.id;
        const name = h.name ? h.name : "Без імені";
        opt.textContent = `${name} (ступінь ${h.tier})`;
        hunterSelect.appendChild(opt);
      });
      const saved = getSelectedHunterId();
      hunterSelect.value = hunters.some(h=>h.id===saved) ? saved : hunters[0].id;
      setSelectedHunterId(hunterSelect.value);
      render();
    }

    function getHunter(){
      const hs = loadHunters();
      return hs.find(h=>h.id===hunterSelect.value) || null;
    }

    function render(){
      const h = getHunter();
      if (!h){
        currentBox.textContent = "—";
        cdEl.textContent = "—";
        upBtn.disabled = true;
        return;
      }
      normalizeHunter(h);

      if ((h.status||"")==="Атеїст"){
        currentBox.textContent = "Атеїст";
        cdEl.textContent = "—";
        upBtn.disabled = true;
      } else if (!h.cultId){
        currentBox.textContent = "Культ не вибраний (вступ незворотній).";
        cdEl.textContent = "—";
        upBtn.disabled = true;
      } else {
        const left = cultUpgradeLeft(h);
        cdEl.textContent = hms(left);
        upBtn.disabled = left > 0 || h.cultRank >= (getCult(h.cultId)?.ranks.length-1 || 0);
        currentBox.textContent = `${h.cultName} • ${h.cultRankName}`;
      }

      list.innerHTML = "";
      CULTS.forEach(c=>{
        const card = document.createElement("div");
        card.className = "item";
        const desc = c.describe(0).slice(0,3).join(" • ");
        card.innerHTML = `
          <button class="item__head" aria-expanded="false">
            <div>
              <div class="item__name">${escapeHtml(c.name)}</div>
              <div class="item__meta"><span>${escapeHtml(desc)}</span></div>
            </div>
            <div class="chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>
          <div class="item__body">
            <div class="note">
              <div class="note__title">Ранги</div>
              <div class="note__text">${escapeHtml(c.ranks.join(" → "))}</div>
            </div>
            <div class="note" style="margin-top:10px">
              <div class="note__title">Базові ефекти</div>
              <div class="note__text">${escapeHtml(c.describe(0).join(" • "))}</div>
            </div>
            <div class="actions" style="justify-content:flex-start; margin-top:10px">
              ${c.id==="baal"
                ? `<button class="btn btn--primary" type="button" data-join="baal" data-choice="power" ${(h.cultId || (h.status||"")==="Атеїст") ? "disabled" : ""}>Сила</button>
                   <button class="btn btn--primary" type="button" data-join="baal" data-choice="mind" ${(h.cultId || (h.status||"")==="Атеїст") ? "disabled" : ""}>Розум</button>`
                : `<button class="btn btn--primary" type="button" data-join="${escapeHtml(c.id)}" ${(h.cultId || (h.status||"")==="Атеїст") ? "disabled" : ""}>Вступити (незворотно)</button>`}
            </div>
          </div>
        `;
        card.querySelector(".item__head")?.addEventListener("click", ()=>{
          const isOpen = card.classList.contains("item--open");
          document.querySelectorAll("#cultList .item.item--open").forEach(x=>{
            if (x!==card){
              x.classList.remove("item--open");
              const btn=x.querySelector(".item__head"); btn && btn.setAttribute("aria-expanded","false");
            }
          });
          card.classList.toggle("item--open", !isOpen);
          const btn = card.querySelector(".item__head");
          btn && btn.setAttribute("aria-expanded", String(!isOpen));
        });

        card.querySelectorAll("[data-join]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const choice = btn.getAttribute("data-choice") || null;
            const hs = loadHunters();
            const hh = hs.find(x=>x.id===h.id);
            if (!hh) return;
            if (hh.cultId){ toast("Культ вже є. Вступ незворотній."); return; }
            // Extra warning for Baal: 50/50 death on join
            const warn = (c.id === "baal")
              ? `Вступити в культ "${c.name}"? Це НЕЗВОРОТНО.\n\nУВАГА: при вступі 50% шанс СМЕРТІ ханта.`
              : `Вступити в культ "${c.name}"? Це незворотно.`;
            if (!confirm(warn)) return;
            const res = joinCult(hh, c.id, choice);
            if (res && res.dead){
              const idx = hs.findIndex(x=>x.id===hh.id);
              if (idx>=0) hs.splice(idx,1);
              // If the removed hunter was selected, clear/retarget selection
              const removedId = hh.id;
              const next = hs[0]?.id || "";
              if (hunterSelect.value === removedId){
                hunterSelect.value = next;
                setSelectedHunterId(next);
              }
            }
            saveHunters(hs);
            toast(res.msg);
            render();
          });
        });

        list.appendChild(card);
      });
    }

    upBtn.addEventListener("click", ()=>{
      const hs = loadHunters();
      const h = hs.find(x=>x.id===hunterSelect.value);
      if (!h) return;
      normalizeHunter(h);
      if ((h.status||"")==="Атеїст"){
        currentBox.textContent = "Атеїст";
        cdEl.textContent = "—";
        upBtn.disabled = true;
      } else if (!h.cultId){ toast("Нема культу"); return; }
      const left = cultUpgradeLeft(h);
      if (left>0){ toast(`КД: ${hms(left)}`); return; }
      if (!confirm("Підвищити ранг культу? (раз на добу)")) return;
      const res = upgradeCult(h);
      saveHunters(hs);
      toast(res.msg);
      render();
    });

    hunterSelect.addEventListener("change", ()=>{
      setSelectedHunterId(hunterSelect.value);
      render();
    });

    // Important: do NOT rerender the whole list every tick,
    // otherwise opened cards will instantly collapse.
    function tickCooldown(){
      const h = getHunter();
      if (!h){
        cdEl.textContent = "—";
        return;
      }
      normalizeHunter(h);
      if ((h.status||"")==="Атеїст"){
        currentBox.textContent = "Атеїст";
        cdEl.textContent = "—";
        upBtn.disabled = true;
      } else if (!h.cultId){
        cdEl.textContent = "—";
        upBtn.disabled = true;
        currentBox.textContent = "Культ не вибраний (вступ незворотній).";
        return;
      }
      const left = cultUpgradeLeft(h);
      cdEl.textContent = hms(left);
      const maxRank = (getCult(h.cultId)?.ranks.length ?? 1) - 1;
      upBtn.disabled = left > 0 || h.cultRank >= maxRank;
      currentBox.textContent = `${h.cultName} • ${h.cultRankName}`;
    }

    fillHunters();
    tickCooldown();
    setInterval(tickCooldown, 1000);
  }

  // ===== Home page =====
  function initHomePage(){
    const a = document.getElementById("homeHunters");
    const b = document.getElementById("homeTier");
    const c = document.getElementById("homeTrain");
    if (!a) return;

    const hunters = loadHunters();
    a.textContent = `${hunters.length}/${CFG.MAX_HUNTERS}`;
    if (!hunters.length){
      b && (b.textContent = "—");
      c && (c.textContent = "—");
      return;
    }
    const bestTier = Math.min(...hunters.map(h=>h.tier));
    b && (b.textContent = String(bestTier));
    const trained = hunters.filter(h=>h.lastTrainAt).length;
    c && (c.textContent = String(trained));
  }

  function init(){
    setupNavActive();

    if (document.getElementById("hunterList")) initHuntersPage();
    if (document.getElementById("trainingPageRoot")) initTrainingPage();
    if (document.getElementById("directionPageRoot")) initDirectionPage();
    if (document.getElementById("cultsPageRoot")) initCultsPage();
    if (document.getElementById("homeRoot")) initHomePage();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
