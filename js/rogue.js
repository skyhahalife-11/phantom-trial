'use strict';

/* ================= 局外成长 ================= */
const META_KEY = 'phantom_trial_meta_v1';
function defaultMeta() { return { souls: 0, up: { hp: 0, atk: 0, coin: 0, heal: 0, cand: 0 }, unlocked: {}, clears: 0, bestLayer: 0, runs: 0 }; }
function loadMeta() {
  const m = defaultMeta();
  try {
    const s = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    if (typeof s.souls === 'number') m.souls = s.souls;
    Object.assign(m.up, s.up || {});
    Object.assign(m.unlocked, s.unlocked || {});
    for (const k of ['clears', 'bestLayer', 'runs']) if (typeof s[k] === 'number') m[k] = s[k];
  } catch (e) { /* 首次运行没有存档 */ }
  return m;
}
let META = loadMeta();
function saveMeta() { if (bot.on) return; try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { /* 忽略 */ } }

const META_UPS = [
  { id: 'hp', name: '体魄', max: 5, desc: '每级：最大生命 +6%', cost: (lv) => 20 + 15 * lv },
  { id: 'atk', name: '锋芒', max: 5, desc: '每级：攻击 +4%', cost: (lv) => 20 + 15 * lv },
  { id: 'coin', name: '行囊', max: 5, desc: '每级：开局试炼币 +20', cost: (lv) => 15 + 10 * lv },
  { id: 'heal', name: '调息', max: 3, desc: '每级：战后回复 +2% 最大生命', cost: (lv) => 30 + 25 * lv },
  { id: 'cand', name: '慧眼', max: 1, desc: '词条选择多一个候选（三选一变四选一）', cost: () => 80 },
];

/* ================= 词条 ================= */
const ARCH = {
  skill: { name: '技能流', color: '#ff9a4a' },
  crit: { name: '暴击普攻流', color: '#ffd23a' },
  summon: { name: '召唤流', color: '#9fe8ff' },
  guard: { name: '护盾反伤流', color: '#7ab8ff' },
  gen: { name: '通用', color: '#cfd8e6' },
};

const AFFIX_LIST = [
  { id: 'g1', name: '锋刃', arch: 'gen', max: 3, desc: '攻击 +12%', apply: (m, s) => { m.atkPct += 0.12 * s; } },
  { id: 'g2', name: '坚韧', arch: 'gen', max: 3, desc: '最大生命 +15%', apply: (m, s) => { m.hpPct += 0.15 * s; } },
  { id: 'g3', name: '迅疾', arch: 'gen', max: 3, desc: '移速与攻速 +8%', apply: (m, s) => { m.spd += 0.08 * s; } },
  { id: 'g4', name: '疾风步', arch: 'gen', max: 2, desc: '闪避冷却 -25%', apply: (m, s) => { m.dodgeCdr += 0.25 * s; } },
  { id: 'g5', name: '财运', arch: 'gen', max: 3, desc: '试炼币收益 +30%', apply: (m, s) => { m.coin += 0.3 * s; } },
  { id: 'g6', name: '探索者', arch: 'gen', max: 2, lock: 30, desc: '词条选择多一个候选', apply: (m, s) => { m.cand += s; } },
  { id: 'g7', name: '无畏', arch: 'gen', max: 3, desc: '对精英与 Boss 伤害 +15%', apply: (m, s) => { m.bossDmg += 0.15 * s; } },
  { id: 'g8', name: '战地回复', arch: 'gen', max: 2, desc: '每次击杀回复 1% 最大生命', apply: (m, s) => { m.killHeal += s; } },

  { id: 's1', name: '奥义精通', arch: 'skill', max: 3, desc: '技能伤害 +20%', apply: (m, s) => { m.skillDmg += 0.2 * s; } },
  { id: 's2', name: '连携强化', arch: 'skill', max: 2, desc: '连携加成 +20%（普攻打中后接技能）', apply: (m, s) => { m.link += 0.2 * s; } },
  { id: 's3', name: '余烬', arch: 'skill', max: 2, desc: '放技能后 3 秒内，全部伤害 +15%', apply: (m, s) => { m.ember += s; } },
  { id: 's4', name: '急速循环', arch: 'skill', max: 3, desc: '技能冷却 -8%', apply: (m, s) => { m.cdr += 0.08 * s; } },
  { id: 's5', name: '冷却返还', arch: 'skill', max: 2, lock: 30, desc: '放技能时 20% 几率返还一半冷却', apply: (m, s) => { m.refund += s; } },
  { id: 's6', name: '二连', arch: 'skill', max: 2, lock: 40, desc: '攻击型技能 15% 几率再释放一次', apply: (m, s) => { m.dbl += s; } },

  { id: 'c1', name: '锐眼', arch: 'crit', max: 3, desc: '暴击率 +8%', apply: (m, s) => { m.crit += 0.08 * s; } },
  { id: 'c2', name: '致命', arch: 'crit', max: 3, desc: '暴击伤害 +35%', apply: (m, s) => { m.critDmg += 0.35 * s; } },
  { id: 'c3', name: '连击大师', arch: 'crit', max: 3, desc: '普攻暴击率 +12%', apply: (m, s) => { m.basicCrit += 0.12 * s; } },
  { id: 'c4', name: '重击', arch: 'crit', max: 3, desc: '普攻第三下伤害 +40%', apply: (m, s) => { m.fin += 0.4 * s; } },
  { id: 'c5', name: '狂热', arch: 'crit', max: 2, desc: '连击数每满 10，伤害 +5%（上限 +25%）', apply: (m, s) => { m.frenzy += s; } },
  { id: 'c6', name: '破甲', arch: 'crit', max: 1, lock: 40, desc: '暴击使目标易伤 3 秒（受到伤害 +20%）', apply: (m, s) => { m.mark += s; } },
  { id: 'c7', name: '追击', arch: 'crit', max: 3, lock: 30, desc: '普攻 20% 几率追加 50% 伤害', apply: (m, s) => { m.chase += s; } },

  { id: 'm1', name: '魂火', arch: 'summon', max: 1, desc: '召唤 1 个魂火，每 1.1 秒自动攻击最近的敌人', apply: (m, s) => { m.wisps += s; } },
  { id: 'm2', name: '魂火增殖', arch: 'summon', max: 2, req: 'm1', desc: '魂火数量 +1', apply: (m, s) => { m.wisps += s; } },
  { id: 'm3', name: '魂火共鸣', arch: 'summon', max: 3, req: 'm1', desc: '魂火伤害 +50%', apply: (m, s) => { m.wispDmg += 0.5 * s; } },
  { id: 'm4', name: '亡魂爆裂', arch: 'summon', max: 2, lock: 50, desc: '击杀时 25% 几率引发小范围爆炸', apply: (m, s) => { m.killBlast += s; } },
  { id: 'm5', name: '魂火护体', arch: 'summon', max: 2, req: 'm1', desc: '每个魂火提供 4% 减伤', apply: (m, s) => { m.wispRed += 0.04 * s; } },

  { id: 'd1', name: '铁壁', arch: 'guard', max: 3, desc: '每场战斗开始获得相当于 15% 生命的护盾', apply: (m, s) => { m.startShield += 0.15 * s; } },
  { id: 'd2', name: '荆棘', arch: 'guard', max: 3, desc: '受到伤害时，反弹 50% 给最近的敌人', apply: (m, s) => { m.reflect += 0.5 * s; } },
  { id: 'd3', name: '格挡', arch: 'guard', max: 3, desc: '受到伤害 -8%', apply: (m, s) => { m.reduce += 0.08 * s; } },
  { id: 'd4', name: '护盾崩裂', arch: 'guard', max: 2, lock: 50, desc: '护盾被击破时，引发冲击波击飞周围敌人', apply: (m, s) => { m.breakBlast += s; } },
  { id: 'd5', name: '反击姿态', arch: 'guard', max: 2, lock: 30, desc: '完美闪避后，下一次攻击伤害 +60%', apply: (m, s) => { m.counter += s; } },
];
const AFFIX = Object.fromEntries(AFFIX_LIST.map((a) => [a.id, a]));
const LOCKED_AFFIXES = AFFIX_LIST.filter((a) => a.lock);

/* ================= 局内状态 ================= */
let run = { active: false };

const START_BLESSINGS = [
  { name: '试炼补给', desc: '开局获得 120 试炼币', apply: (r) => { r.coins += 120; } },
  { name: '战神之血', desc: '本局最大生命 +20%', apply: (r) => { r.bonus.hpPct += 0.2; } },
  { name: '破阵之力', desc: '本局攻击 +10%', apply: (r) => { r.bonus.atkPct += 0.1; } },
  { name: '灵动之风', desc: '本局技能冷却 -8%', apply: (r) => { r.bonus.cdr += 0.08; } },
  { name: '守护灵光', desc: '每场战斗开始获得 15% 生命护盾', apply: (r) => { r.bonus.startShield += 0.15; } },
  { name: '先行者', desc: '开局获得 1 个随机词条', apply: (r) => { const ids = rollAffixes(1); if (ids.length) grantAffix(ids[0]); } },
];

function newRun(hero) {
  META.runs++;
  const r = {
    active: true, hero, layer: 1, coins: 30 + META.up.coin * 20, hp: 0, aff: {}, bonus: { atkPct: 0, hpPct: 0, cdr: 0, startShield: 0 },
    path: [], opts: null, node: null, queue: [], kills: 0, clearedLayers: 0, endless: false, nextAtk: 0, curse: null,
    hiddenDone: false, cleared: false, firstBattle: true, log: [],
  };
  run = r;
  r.hp = runMaxHp();
  return r;
}

function runMods() {
  const m = emptyMods();
  for (const id in run.aff) AFFIX[id].apply(m, run.aff[id]);
  const b = run.bonus;
  m.atkPct += b.atkPct + META.up.atk * 0.04;
  m.hpPct += b.hpPct + META.up.hp * 0.06;
  m.cdr += b.cdr;
  m.startShield += b.startShield;
  m.cand += META.up.cand;
  m.dmg = 1 + m.atkPct;
  m.cdr = Math.min(0.6, m.cdr);
  m.reduce = Math.min(0.5, m.reduce);
  m.dodgeCdr = Math.min(0.6, m.dodgeCdr);
  return m;
}
const runMaxHp = () => Math.round(HEROES[run.hero].hp * (1 + runMods().hpPct));

function changeMaxHp(fn) {
  const before = runMaxHp();
  fn();
  const after = runMaxHp();
  run.hp = clamp(run.hp + (after - before), 1, after);
}
function grantAffix(id) { changeMaxHp(() => { run.aff[id] = (run.aff[id] || 0) + 1; }); run.log.push(AFFIX[id].name); }
function removeAffixStack(id) { changeMaxHp(() => { run.aff[id]--; if (run.aff[id] <= 0) delete run.aff[id]; }); }
function healRun(pct) { const mx = runMaxHp(); const h = Math.min(mx - run.hp, Math.round(mx * pct)); run.hp += h; return h; }

const archCount = (arch) => Object.keys(run.aff).filter((id) => AFFIX[id].arch === arch).reduce((a, id) => a + run.aff[id], 0);
function affixPool() {
  return AFFIX_LIST.filter((a) => (run.aff[a.id] || 0) < a.max && (!a.req || run.aff[a.req]) && (!a.lock || META.unlocked[a.id]));
}
function rollAffixes(n, exclude = []) {
  const pool = affixPool().filter((a) => !exclude.includes(a.id));
  const out = [];
  while (out.length < n && pool.length) {
    const ws = pool.map((a) => 1 + (a.arch === 'gen' ? 0 : 0.6 * archCount(a.arch)));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}

/* ================= 节点与路线 ================= */
const NODE = {
  battle: { name: '战斗', color: '#e6e6e6', glyph: '战', desc: '三波敌人。胜利后三选一词条。' },
  elite: { name: '精英', color: '#ffb347', glyph: '精', desc: '两波敌人，第二波有强化精英怪（生命 ×2.6）。奖励更丰厚。' },
  chest: { name: '宝箱', color: '#ffd23a', glyph: '箱', desc: '三选一：一个词条 / 一笔试炼币 / 回复生命。' },
  shop: { name: '商店', color: '#7de0a0', glyph: '店', desc: '用试炼币购买词条，或花钱回血、刷新货架。' },
  altar: { name: '献祭', color: '#c58bff', glyph: '祭', desc: '用试炼币或已有词条，换取一次稀有的词条选择。' },
  event: { name: '事件', color: '#8ad0ff', glyph: '？', desc: '未知的遭遇，福祸难料。' },
  challenge: { name: '挑战', color: '#ff6a6a', glyph: '挑', desc: '带有特殊规则的战斗，奖励两次词条选择。' },
  boss: { name: 'Boss', color: '#ff7a4a', glyph: '王', desc: '本层的守关者。' },
  gauntlet: { name: '隐藏试炼', color: '#ffe27a', glyph: '隐', desc: '三场精英战，奖励两次词条选择。' },
};
const CHALLENGE_MODS = [
  { id: 'iron', name: '铁甲试炼', desc: '敌人生命 +50%', eMul: { hp: 1.5 } },
  { id: 'rage', name: '狂怒试炼', desc: '敌人伤害 +40%', eMul: { dmg: 1.4 } },
  { id: 'swift', name: '疾风试炼', desc: '敌人移动与攻击节奏更快（速度 +30%）', eMul: { spd: 1.3 } },
];
const BATTLE_TYPES = ['battle', 'elite', 'challenge', 'gauntlet', 'boss'];

const slotOf = (L) => ((L - 1) % 7) + 1;
function pickWeighted(pairs, n) {
  const pool = pairs.slice();
  const out = [];
  while (out.length < n && pool.length) {
    let r = Math.random() * pool.reduce((a, p) => a + p[1], 0);
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i][1]; if (r <= 0) break; }
    out.push(pool[i][0]);
    pool.splice(i, 1);
  }
  return out;
}
function genOptions(L) {
  const s = slotOf(L);
  const bossLayer = s === 7 && (run.endless || L === 7);
  if (bossLayer) return [{ type: 'boss', final: !run.endless }];
  let types;
  if (s === 1) types = ['battle', 'chest', 'event'];
  else if (s === 6) types = pickWeighted([['shop', 3], ['altar', 2], ['chest', 2], ['event', 2]], 3);
  else {
    types = pickWeighted([['battle', 4], ['elite', s >= 3 ? 2 : 0.001], ['chest', 1.5], ['shop', 1.5], ['altar', 1], ['event', 2], ['challenge', s >= 3 ? 1.5 : 0.001]], 3);
    if (!types.some((t) => ['battle', 'elite', 'challenge'].includes(t))) types[types.length - 1] = 'battle';
  }
  return types.map((t) => (t === 'challenge' ? { type: t, mod: CHALLENGE_MODS[Math.floor(Math.random() * CHALLENGE_MODS.length)] } : { type: t }));
}

function genWaves(node, L) {
  const pool = L < 2 ? ['skeleton', 'skeleton', 'imp'] : L < 4 ? ['skeleton', 'skeleton', 'imp', 'reaper'] : ['skeleton', 'imp', 'imp', 'reaper', 'reaper'];
  const n = clamp(2 + Math.floor((L + 1) / 3), 2, 5);
  const wave = (cnt, elites = 0) => {
    const list = [];
    let reapers = 0;
    for (let i = 0; i < cnt; i++) {
      let k = pool[Math.floor(Math.random() * pool.length)];
      if (k === 'reaper' && ++reapers > 2) k = 'skeleton';
      list.push(i < elites ? { k: k === 'imp' ? 'skeleton' : k, elite: true } : k);
    }
    return list;
  };
  const names = ['第一波', '第二波', '第三波'];
  switch (node.type) {
    case 'elite': return [{ name: names[0], list: wave(n - 1) }, { name: '精英', title: '精英来袭', list: wave(n - 1, 1) }];
    case 'boss': return [{ name: 'BOSS', list: ['dragon'] }];
    case 'gauntlet': return [{ name: names[0], title: '隐藏试炼 · 一', list: wave(n, 1) }, { name: names[1], title: '隐藏试炼 · 二', list: wave(n, 2) }, { name: names[2], title: '隐藏试炼 · 三', list: wave(n + 1, 2) }];
    default: return [{ name: names[0], list: wave(n - 1) }, { name: names[1], list: wave(n) }, { name: names[2], list: wave(n) }];
  }
}

const BOSS_INFO = {
  lines: [
    ['尾扫', '近身挥尾，判定矮，起跳即可躲过。'],
    ['龙息', '前方一整条火焰，带竖向光柱，跳不过，只能闪避或走开。'],
    ['俯冲', '冲向场地另一端，同样只能闪避。'],
    ['召唤', '生命低于 60% 和 30% 时各召唤一次小恶魔。'],
    ['破绽', '龙息、俯冲之后会露出破绽：受到伤害 +25%，重斩直接处决。'],
  ],
  tip: '抓破绽输出，别在它出招时硬站着。保留战吼（骑士）或控制技，留给破绽期接处决。',
};

/* ================= 战斗接入 ================= */
function startNodeBattle(node) {
  resetWorld(run.hero);
  const L = run.layer;
  const m = { hp: 1 + 0.1 * (L - 1), dmg: 1 + 0.06 * (L - 1), spd: 1 + 0.01 * (L - 1) };
  if (node.mod) for (const k in node.mod.eMul) m[k] *= node.mod.eMul[k];
  if (run.curse) { m.hp *= 1 + (run.curse.hp || 0); m.dmg *= 1 + (run.curse.dmg || 0); run.curse = null; }
  world.eMul = m;
  world.waves = genWaves(node, L);
  const p = world.player;
  const mods = runMods();
  p.mods = mods;
  p.maxHp = runMaxHp();
  p.hp = clamp(run.hp, 1, p.maxHp);
  if (mods.startShield) { p.shield = p.maxHp * mods.startShield; p.shieldT = 999; }
  if (run.nextAtk) { p.buffs.push({ atk: run.nextAtk, t: 9999 }); run.nextAtk = 0; }
  p.wisps = mods.wisps;
  p.wispT = 0.6;
  world.hint = run.firstBattle ? 12 : 0;
  run.firstBattle = false;
  run.node = node;
  paused = false;
  setScene(battleScene);
}

const REWARD = { battle: [10, 2, 1], elite: [25, 3, 1], challenge: [30, 3, 2], boss: [60, 0, 1], gauntlet: [50, 0, 2] };
function onBattleEnd(win) {
  const p = world.player;
  run.hp = p.hp;
  run.kills += world.kills;
  if (!win) { endRun(false); return; }
  const node = run.node;
  const [base, perL, picks] = REWARD[node.type] || REWARD.battle;
  const gained = world.coins + base + perL * run.layer;
  run.coins += gained;
  const healed = healRun(0.08 + META.up.heal * 0.02);
  const total = picks + (node.double ? 1 : 0);
  run.queue = [];
  for (let i = 0; i < total; i++) {
    run.queue.push(() => pickAffixScene({
      title: i === 0 ? '战斗胜利' : '额外奖励',
      sub: i === 0 ? `获得 ${gained} 试炼币  ·  战后恢复 ${healed} 生命` : '再选一个词条',
    }));
  }
  nextStep();
}
function nextStep() { const f = run.queue.shift(); if (f) f(); else afterNode(); }

function afterNode() {
  const t = run.node.type;
  if (t === 'gauntlet') { run.hiddenDone = true; bossVictory(); return; }
  run.clearedLayers++;
  if (t === 'boss' && run.node.final) { bossVictory(); return; }
  advanceLayer();
}
function advanceLayer() {
  run.layer++;
  run.opts = null;
  showRoute();
}
function pickNode(n) {
  run.node = n;
  run.path.push(n.type);
  switch (n.type) {
    case 'chest': chestScene(); break;
    case 'shop': shopScene(); break;
    case 'altar': altarScene(); break;
    case 'event': eventScene(); break;
    case 'boss': bossPreviewScene(() => startNodeBattle(n), true); break;
    default: startNodeBattle(n);
  }
}

function bossVictory() {
  if (!run.cleared) { run.cleared = true; META.clears++; META.bestLayer = Math.max(META.bestLayer, 7); saveMeta(); }
  const hpPct = run.hp / runMaxHp();
  const gate = hpPct >= 0.5;
  const cards = [
    {
      name: '隐藏试炼', tag: '额外关卡', tagColor: '#ffe27a', glyph: '隐',
      desc: run.hiddenDone ? '已经完成。' : '三场精英战，胜利后获得两次词条选择，并额外获得 20 试炼之魂。\n\n开启条件：当前生命不低于 50%。',
      foot: run.hiddenDone ? '已完成' : `当前生命 ${Math.round(hpPct * 100)}%  ${gate ? '· 可以开启' : '· 未达标'}`,
      disabled: run.hiddenDone || !gate,
      botFirst: true,
      onPick() { const n = { type: 'gauntlet' }; run.node = n; run.path.push('gauntlet'); startNodeBattle(n); },
    },
    {
      name: '继续无尽', tag: '无尽模式', tagColor: '#ff9a4a', glyph: '∞', noBot: true,
      desc: '继续向上攀登。敌人逐层变强，每 7 层出现一次 Boss。每多通过一层，额外获得 8 试炼之魂。',
      foot: '没有终点，打到倒下为止',
      onPick() { run.endless = true; advanceLayer(); },
    },
    {
      name: '领取奖励', tag: '结算', tagColor: '#7de0a0', glyph: '结',
      desc: '带着这一局的成果离场，换取试炼之魂，用来强化角色与解锁词条。',
      foot: '结算本局',
      onPick() { endRun(true); },
    },
  ];
  setScene(chooser({ title: 'Boss 已被击败', sub: '试炼通过。接下来怎么走？', cards, cardY: 250, cardH: 330 }));
}

/* ================= 结算 ================= */
function endRun(win) {
  const layers = run.clearedLayers;
  let souls = layers * 6 + (win ? 40 : 0) + (run.hiddenDone ? 20 : 0) + Math.floor(run.kills / 5) + Math.max(0, layers - 7) * 8;
  souls = Math.max(souls, 3);
  META.souls += souls;
  META.bestLayer = Math.max(META.bestLayer, layers);
  saveMeta();
  run.result = { win, souls, layers };
  run.active = false;
  if (bot.on) {
    const mx = HEROES[run.hero].hp;
    botState.results.push({ hero: run.hero, win });
    console.log(`[RESULT] hero=${run.hero} win=${win} layers=${layers} kills=${run.kills} hp=${Math.round(run.hp)}/${mx} coins=${run.coins} aff=${Object.entries(run.aff).map(([k, v]) => AFFIX[k].name + '×' + v).join(',')}`);
    botAfterRun();
    return;
  }
  setScene(runResultScene);
}

const runResultScene = {
  t: 0,
  enter() { this.t = 0; },
  update(dt) {
    this.t += dt;
    if (this.t > 0.5 && (input.hit('confirm') || mouse.clicked)) setScene(titleScene);
  },
  draw() {
    drawBackdrop();
    const r = run.result;
    drawText(r.win ? '试炼通过' : '试炼失败', W / 2, 130, 72, r.win ? '#ffe9b0' : '#ff8a7a', 'center');
    drawText(`通过 ${r.layers} 层    击败 ${run.kills} 个敌人    ${run.hiddenDone ? '已完成隐藏试炼' : ''}`, W / 2, 190, 26, '#dfe6ee', 'center');
    drawText(`获得试炼之魂 ${r.souls}`, W / 2, 250, 36, '#c9a6ff', 'center');
    drawText(`累计 ${META.souls}    通关 ${META.clears} 次    最高 ${META.bestLayer} 层`, W / 2, 288, 20, '#8fa0b0', 'center');
    drawText('本局词条', W / 2, 350, 22, '#ffe27a', 'center');
    const ids = Object.keys(run.aff);
    if (!ids.length) drawText('（没有获得词条）', W / 2, 390, 18, '#8fa0b0', 'center');
    drawAffixChips(180, 372, 920, 18);
    drawText('Enter / 点击 返回', W / 2, H - 50, 22, '#aab4c2', 'center');
  },
};

/* ================= UI 公用 ================= */
function drawBackdrop() {
  ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H);
  drawLayer('v2/bg/dungeon_far.png', H, 0, 300);
  ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(0, 0, W, H);
}

function drawAffixChips(x, y, maxW, size) {
  let cx = x, cy = y;
  ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
  for (const id in run.aff) {
    const a = AFFIX[id];
    const s = a.name + (run.aff[id] > 1 ? '×' + run.aff[id] : '');
    const w = ctx.measureText(s).width + 16;
    if (cx + w > x + maxW) { cx = x; cy += size + 12; }
    ctx.fillStyle = 'rgba(14,14,22,.88)'; ctx.fillRect(cx, cy, w, size + 8);
    ctx.strokeStyle = ARCH[a.arch].color; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, w, size + 8);
    drawText(s, cx + 8, cy + size + 1, size, ARCH[a.arch].color, 'left', false);
    cx += w + 6;
  }
  return cy + size + 8;
}

function drawRunBar() {
  const mx = runMaxHp();
  panel(18, 16, 400, 78);
  drawText(HEROES[run.hero].name, 32, 46, 24, '#ffe9b0');
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(32, 56, 360, 24);
  ctx.fillStyle = '#d94848'; ctx.fillRect(32, 56, 360 * clamp(run.hp / mx, 0, 1), 24);
  drawText(`${Math.ceil(run.hp)} / ${mx}`, 212, 76, 18, '#fff', 'center');
  drawText(`试炼币 ${run.coins}`, W - 30, 42, 24, '#ffd264', 'right');
  drawText(run.endless ? `无尽 · 第 ${run.layer} 层` : `第 ${run.layer} / 7 层`, W - 30, 72, 20, '#cfd8e6', 'right');
  drawAffixChips(436, 20, 600, 14);
}

function drawRunHud() {
  drawText(`试炼币 ${run.coins + world.coins}`, W - 30, 42, 24, '#ffd264', 'right');
  drawText(run.endless ? `无尽 · 第 ${run.layer} 层` : `第 ${run.layer} / 7 层  ·  ${NODE[run.node.type].name}`, W - 30, 70, 20, '#cfd8e6', 'right');
  if (run.node.mod) drawText(run.node.mod.name + '：' + run.node.mod.desc, W - 30, 96, 16, '#ff9a8a', 'right');
  drawAffixChips(18, 104, 400, 14);
}

function affixSummaryLines() {
  return Object.keys(run.aff).map((id) => `${AFFIX[id].name}${run.aff[id] > 1 ? ' ×' + run.aff[id] : ''}：${AFFIX[id].desc}`);
}

function chooser(cfg) {
  const sc = {
    t: 0, hover: 0,
    cards() { return typeof cfg.cards === 'function' ? cfg.cards() : cfg.cards; },
    rect(i, n) {
      const gap = 22;
      const w = Math.min(cfg.cardW || 300, Math.floor((W - 100 - (n - 1) * gap) / n));
      const total = n * w + (n - 1) * gap;
      return { x: Math.round((W - total) / 2) + i * (w + gap), y: cfg.cardY || 232, w, h: cfg.cardH || 340 };
    },
    footRect() { return { x: W / 2 - 160, y: H - 76, w: 320, h: 44 }; },
    enter() { this.t = 0; this.hover = 0; },
    pick(i) {
      const c = this.cards()[i];
      if (!c || c.disabled) return;
      this.hover = i;
      if (c.onPick() === true) this.t = 0.1;
    },
    update(dt) {
      this.t += dt;
      const cs = this.cards();
      const n = cs.length;
      if (this.hover >= n) this.hover = Math.max(0, n - 1);
      if (bot.on) {
        if (this.t < 0.3) return;
        const first = cs.findIndex((c) => c.botFirst && !c.disabled);
        if (first >= 0) { this.pick(first); return; }
        const opts = cs.map((c, i) => i).filter((i) => !cs[i].disabled && !cs[i].noBot && !cs[i].noBotRepeat);
        if (opts.length && !(cfg.botLeave && cfg.botLeave())) { this.pick(opts[Math.floor(Math.random() * opts.length)]); this.t = 0; } else if (cfg.footer) cfg.footer.onPick();
        else if (cs.length) { const any = cs.findIndex((c) => !c.disabled); if (any >= 0) this.pick(any); }
        return;
      }
      const live = this.t > 0.2;
      for (let i = 0; i < n; i++) {
        const r = this.rect(i, n);
        if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
          this.hover = i;
          if (mouse.clicked && live) { this.pick(i); return; }
        }
      }
      if (cfg.footer) {
        const f = this.footRect();
        if (live && mouse.clicked && mouse.x >= f.x && mouse.x <= f.x + f.w && mouse.y >= f.y && mouse.y <= f.y + f.h) { cfg.footer.onPick(); return; }
      }
      if (input.hit('left')) this.hover = (this.hover + n - 1) % n;
      if (input.hit('right')) this.hover = (this.hover + 1) % n;
      if (live && input.hit('confirm')) { this.pick(this.hover); return; }
      for (let i = 0; i < Math.min(n, 9); i++) if (live && pressed.has('Digit' + (i + 1))) { this.pick(i); return; }
      if (cfg.footer && live && pressed.has('Escape')) { cfg.footer.onPick(); return; }
      if (cfg.onKey) cfg.onKey();
    },
    draw() {
      drawBackdrop();
      if (cfg.bar !== false) drawRunBar();
      drawText(cfg.title, W / 2, 142, 44, '#ffe9b0', 'center');
      if (cfg.sub) drawText(cfg.sub, W / 2, 180, 20, '#c8d0dc', 'center');
      if (cfg.deco) cfg.deco();
      const cs = this.cards();
      cs.forEach((c, i) => {
        const r = this.rect(i, cs.length);
        const sel = i === this.hover && !c.disabled;
        panel(r.x, r.y, r.w, r.h, sel ? '#ffd264' : 'rgba(255,255,255,.22)', sel ? 'rgba(44,36,22,.94)' : 'rgba(14,14,22,.86)');
        ctx.save();
        if (c.disabled) ctx.globalAlpha = 0.45;
        if (c.tag) drawText(c.tag, r.x + r.w / 2, r.y + 30, 16, c.tagColor || '#aab4c2', 'center', false);
        const gy = r.y + 78;
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.strokeStyle = c.tagColor || '#aab4c2'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x + r.w / 2, gy, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        drawText(c.glyph || c.name[0], r.x + r.w / 2, gy + 11, 32, c.tagColor || '#fff', 'center');
        drawText(c.name, r.x + r.w / 2, r.y + 148, 26, sel ? '#ffe9b0' : '#ffffff', 'center');
        let y = r.y + 182;
        for (const para of String(c.desc || '').split('\n')) {
          if (!para) { y += 10; continue; }
          for (const ln of wrapText(para, r.w - 32, 16)) { drawText(ln, r.x + 16, y, 16, '#cdd6e2', 'left', false); y += 22; }
        }
        if (c.foot) drawText(c.foot, r.x + r.w / 2, r.y + r.h - 16, 17, c.footColor || '#ffd264', 'center', false);
        ctx.restore();
        drawText(String(i + 1), r.x + 10, r.y + 22, 15, '#6f7b8c', 'left', false);
      });
      if (cfg.footer) {
        const f = this.footRect();
        panel(f.x, f.y, f.w, f.h, 'rgba(255,255,255,.3)');
        drawText(cfg.footer.label, W / 2, f.y + 29, 20, '#dfe6ee', 'center', false);
        drawText('Esc', f.x + 12, f.y + 28, 14, '#6f7b8c', 'left', false);
      }
    },
  };
  return sc;
}

function noteScene(title, lines, next) {
  setScene({
    t: 0,
    update(dt) {
      this.t += dt;
      if (bot.on ? this.t > 0.3 : this.t > 0.4 && (input.hit('confirm') || mouse.clicked)) next();
    },
    draw() {
      drawBackdrop();
      if (run.active) drawRunBar();
      drawText(title, W / 2, 260, 52, '#ffe9b0', 'center');
      let y = 330;
      for (const ln of lines) for (const w of wrapText(ln, 820, 24)) { drawText(w, W / 2, y, 24, '#dfe6ee', 'center', false); y += 36; }
      drawText('Enter / 点击 继续', W / 2, H - 70, 20, '#8fa0b0', 'center');
    },
  });
}

/* ================= 路线 ================= */
function nodeCard(n) {
  const d = NODE[n.type];
  let desc = d.desc;
  let foot = '';
  if (n.type === 'challenge') { desc = `${n.mod.name}：${n.mod.desc}。\n${d.desc}`; foot = '高风险 · 高回报'; }
  if (n.type === 'elite') foot = '高风险 · 高回报';
  if (n.type === 'boss') { desc = run.endless ? `第 ${run.layer} 层的守关者，比之前更强。` : '翡翠幼龙。击败它即通关。\n进入前可以查看 Boss 预览。'; foot = '最终战'; }
  return { name: n.type === 'challenge' ? n.mod.name : d.name, tag: d.name, tagColor: d.color, glyph: d.glyph, desc, foot, onPick: () => pickNode(n) };
}

function drawRouteTrack() {
  if (run.endless) return;
  const x0 = 330, dx = 103, y = 244;
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + dx * 6, y); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const x = x0 + i * dx;
    const past = i < run.layer - 1, cur = i === run.layer - 1;
    const type = past ? run.path[i] : i === 6 ? 'boss' : null;
    const col = type ? NODE[type].color : '#5a6372';
    ctx.fillStyle = past ? col : 'rgba(14,14,22,.9)';
    ctx.strokeStyle = col; ctx.lineWidth = cur ? 4 : 2;
    const rad = 17 + (cur ? 3 + 2 * Math.sin(performance.now() / 300) : 0);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (type) drawText(NODE[type].glyph, x, y + 7, 18, past ? '#111' : col, 'center', false);
    else if (cur) drawText(String(i + 1), x, y + 7, 18, '#ffe27a', 'center', false);
    else drawText(String(i + 1), x, y + 7, 16, '#6f7b8c', 'center', false);
  }
  drawText('B  查看 Boss 预览', W - 30, 244, 16, '#8fa0b0', 'right', false);
}

function showRoute() {
  if (!run.opts) run.opts = genOptions(run.layer);
  const L = run.layer;
  setScene(chooser({
    title: run.endless ? `无尽 · 第 ${L} 层` : `第 ${L} 层  ·  选择前进的道路`,
    sub: '每一步都不能回头。生命值是你这一局的表现。',
    cardY: 290, cardH: 300,
    cards: () => run.opts.map(nodeCard),
    deco: drawRouteTrack,
    onKey() { if (pressed.has('KeyB')) bossPreviewScene(() => showRoute(), false); },
  }));
}

function bossPreviewScene(next, fight) {
  const d = ENEMIES.dragon;
  setScene({
    t: 0,
    update(dt) {
      this.t += dt;
      if (bot.on ? this.t > 0.3 : this.t > 0.3 && (input.hit('confirm') || mouse.clicked)) next();
    },
    draw() {
      drawBackdrop();
      drawSprite(d.img, 1010, 560, 360, false);
      drawText('Boss 预览', 90, 110, 24, '#ff9a6a', 'left');
      drawText(d.name, 90, 170, 56, '#ffe9b0', 'left');
      const L = run.endless ? run.layer : 7;
      drawText(`生命约 ${Math.round(d.hp * (1 + 0.1 * (L - 1)))}    伤害 ×${(1 + 0.06 * (L - 1)).toFixed(2)}`, 90, 208, 22, '#cfd8e6', 'left');
      let y = 270;
      for (const [name, text] of BOSS_INFO.lines) {
        drawText(name, 90, y, 24, '#ffd264', 'left');
        for (const ln of wrapText(text, 500, 18)) { drawText(ln, 190, y, 18, '#dfe6ee', 'left', false); y += 26; }
        y += 14;
      }
      for (const ln of wrapText('建议：' + BOSS_INFO.tip, 620, 18)) { drawText(ln, 90, y + 10, 18, '#8affd0', 'left', false); y += 26; }
      drawText(fight ? 'Enter / 点击  迎战' : 'Enter / 点击  返回', W / 2, H - 50, 24, '#aab4c2', 'center');
    },
  });
}

/* ================= 词条选择 ================= */
function pickAffixScene(o) {
  const m = runMods();
  const n = 3 + m.cand + (o.extra || 0);
  const ids = rollAffixes(n);
  if (!ids.length) { run.coins += 40; noteScene(o.title || '词条已满', ['已经没有可选的词条，换成 40 试炼币。'], nextStep); return; }
  const cards = ids.map((id) => {
    const a = AFFIX[id];
    const have = run.aff[id] || 0;
    return {
      name: a.name, tag: ARCH[a.arch].name, tagColor: ARCH[a.arch].color, glyph: a.name[0], desc: a.desc,
      foot: have ? `已有 ${have} → ${have + 1} / ${a.max}` : `新词条 · 上限 ${a.max}`, footColor: have ? '#8affd0' : '#ffd264',
      onPick() { grantAffix(id); nextStep(); },
    };
  });
  setScene(chooser({
    title: o.title || '选择一个词条', sub: o.sub || '', cards, cardW: 260, cardY: 250, cardH: 320,
    footer: { label: '放弃（+15 试炼币）', onPick() { run.coins += 15; nextStep(); } },
  }));
}

/* ================= 宝箱 / 商店 / 献祭 / 事件 ================= */
function chestScene() {
  const L = run.layer;
  const ids = rollAffixes(1);
  const coin = 60 + 6 * L;
  const cards = [];
  if (ids.length) {
    const a = AFFIX[ids[0]];
    cards.push({ name: a.name, tag: '词条', tagColor: ARCH[a.arch].color, glyph: a.name[0], desc: `${ARCH[a.arch].name}\n${a.desc}`, foot: '直接获得', onPick() { grantAffix(ids[0]); noteScene('获得词条', [`${a.name}：${a.desc}`], afterNode); } });
  }
  cards.push({ name: `${coin} 试炼币`, tag: '钱财', tagColor: '#ffd264', glyph: '币', desc: '一笔不小的试炼币。', foot: '直接获得', onPick() { run.coins += coin; noteScene('获得试炼币', [`+${coin}`], afterNode); } });
  cards.push({ name: '回复生命', tag: '补给', tagColor: '#7dff9a', glyph: '血', desc: '回复 35% 最大生命。', foot: `当前 ${Math.round(run.hp)} / ${runMaxHp()}`, onPick() { const h = healRun(0.35); noteScene('生命回复', [`回复了 ${h} 点生命。`], afterNode); } });
  setScene(chooser({ title: '宝箱', sub: '三选一', cards }));
}

function shopScene() {
  const L = run.layer;
  const st = { items: [], reroll: 0 };
  const stock = () => { st.items = rollAffixes(3).map((id) => ({ id, price: 50 + 3 * L + Math.floor(Math.random() * 14), sold: false })); };
  stock();
  let healBought = false;
  const cards = () => {
    const cs = st.items.map((it) => {
      const a = AFFIX[it.id];
      const have = run.aff[it.id] || 0;
      const poor = run.coins < it.price;
      return {
        name: a.name, tag: ARCH[a.arch].name, tagColor: ARCH[a.arch].color, glyph: a.name[0], desc: a.desc,
        foot: it.sold ? '已售出' : `${it.price} 试炼币${have ? `  ·  已有 ${have}` : ''}`, footColor: it.sold ? '#6f7b8c' : poor ? '#ff8a7a' : '#ffd264',
        disabled: it.sold || poor || have >= a.max,
        onPick() { run.coins -= it.price; it.sold = true; grantAffix(it.id); return true; },
      };
    });
    const hp = Math.round(runMaxHp() * 0.3);
    cs.push({
      name: '疗伤药', tag: '补给', tagColor: '#7dff9a', glyph: '药', desc: `回复 30% 最大生命（${hp} 点）。`, foot: healBought ? '已购买' : '35 试炼币', footColor: run.coins < 35 ? '#ff8a7a' : '#ffd264',
      disabled: healBought || run.coins < 35 || run.hp >= runMaxHp(), noBotRepeat: false,
      onPick() { run.coins -= 35; healBought = true; healRun(0.3); return true; },
    });
    const rp = 20 + 10 * st.reroll;
    cs.push({
      name: '刷新货架', tag: '服务', tagColor: '#8ad0ff', glyph: '刷', desc: '重新进货三个词条。每刷新一次，价格上涨。', foot: `${rp} 试炼币`, footColor: run.coins < rp ? '#ff8a7a' : '#ffd264',
      disabled: run.coins < rp, noBot: true,
      onPick() { run.coins -= rp; st.reroll++; stock(); return true; },
    });
    return cs;
  };
  setScene(chooser({ title: '商店', sub: '用试炼币购买。离开后不能回头。', cards, cardW: 220, footer: { label: '离开商店', onPick: afterNode } }));
}

function altarScene() {
  const coinsOk = run.coins >= 40;
  const hasAff = Object.keys(run.aff).length > 0;
  const cards = [
    {
      name: '献祭试炼币', tag: '祭品：钱财', tagColor: '#ffd264', glyph: '币',
      desc: '献出全部试炼币（至少 40）。随后进行一次词条选择，候选额外 +2。', foot: `当前 ${run.coins}`, footColor: coinsOk ? '#ffd264' : '#ff8a7a', disabled: !coinsOk,
      onPick() { run.coins = 0; run.queue = []; pickAffixScene({ title: '祭坛回应', sub: '候选更多了', extra: 2 }); },
    },
    {
      name: '献祭词条', tag: '祭品：词条', tagColor: '#c58bff', glyph: '祭',
      desc: '随机失去 1 层已持有词条，换取一次词条选择，并获得 25 试炼币。', foot: hasAff ? `持有 ${Object.keys(run.aff).length} 种` : '没有可献祭的词条', footColor: hasAff ? '#ffd264' : '#ff8a7a', disabled: !hasAff,
      onPick() {
        const ids = Object.keys(run.aff);
        const lose = ids[Math.floor(Math.random() * ids.length)];
        const name = AFFIX[lose].name;
        removeAffixStack(lose);
        run.coins += 25;
        run.queue = [];
        noteScene('献祭', [`${name} 化作灰烬。`, '获得 25 试炼币，祭坛为你展开一次选择。'], () => pickAffixScene({ title: '祭坛回应', sub: `失去了 ${name}`, extra: 1 }));
      },
    },
  ];
  setScene(chooser({ title: '献祭祭坛', sub: '祭坛只回应真正的牺牲。', cards, footer: { label: '转身离开', onPick: afterNode } }));
}

function grantRandomText() {
  const ids = rollAffixes(1);
  if (!ids.length) { run.coins += 40; return '没有可获得的词条，换成 40 试炼币。'; }
  grantAffix(ids[0]);
  return `获得词条：${AFFIX[ids[0]].name}（${AFFIX[ids[0]].desc}）`;
}
const EVENTS = [
  {
    name: '神秘商人', sub: '披斗篷的商人拦住了你：「只要 40 个币，给你一件好东西。」',
    opts: [
      { name: '购买', desc: '花 40 试炼币，获得 1 个随机词条。', need: 40, run: () => { run.coins -= 40; return grantRandomText(); } },
      { name: '离开', desc: '不理会商人。', run: () => '你绕开了商人。' },
    ],
  },
  {
    name: '治愈之泉', sub: '一汪清澈的泉水，散发着微光。',
    opts: [
      { name: '痛饮', desc: '回复 40% 最大生命。', run: () => `回复了 ${healRun(0.4)} 点生命。` },
      { name: '灌满水囊', desc: '下一场战斗攻击 +25%。', run: () => { run.nextAtk = 0.25; return '你带走了泉水，下一场战斗攻击 +25%。'; } },
    ],
  },
  {
    name: '受伤的旅人', sub: '一个旅人倒在路边，伸手向你求助。',
    opts: [
      { name: '施舍', desc: '给他 30 试炼币。他会指点你，送上一次词条选择。', need: 30, run: () => { run.coins -= 30; return { text: '旅人感激地留下了他的馈赠。', then: () => pickAffixScene({ title: '旅人的馈赠', sub: '' }) }; } },
      { name: '抢走钱袋', desc: '获得 25 试炼币，但下一场战斗敌人伤害 +15%。', run: () => { run.coins += 25; run.curse = { hp: 0, dmg: 0.15 }; return '你拿走了钱袋。前方的敌人似乎更躁动了。'; } },
      { name: '无视', desc: '继续赶路。', run: () => '你径直走过。' },
    ],
  },
  {
    name: '诅咒宝箱', sub: '箱盖上刻满暗红的符文，隐隐发烫。',
    opts: [
      { name: '打开', desc: '获得 90 试炼币，但下一场战斗敌人生命 +30%。', run: () => { run.coins += 90; run.curse = { hp: 0.3, dmg: 0 }; return '符文熄灭了。你得到了 90 试炼币，也招来了诅咒。'; } },
      { name: '离开', desc: '不碰它。', run: () => '你转身离开。' },
    ],
  },
  {
    name: '赌徒', sub: '一个赌徒晃着骰子：「来一把？押 40 个币，赢了翻倍还多。」',
    opts: [
      { name: '押注', desc: '花 40 试炼币。50% 赢得 110 试炼币，50% 血本无归。', need: 40, run: () => { run.coins -= 40; if (Math.random() < 0.5) { run.coins += 110; return '骰子停下。你赢了，净赚 70 试炼币。'; } return '骰子停下。你输光了。'; } },
      { name: '离开', desc: '不赌。', run: () => '你摆了摆手。' },
    ],
  },
  {
    name: '古战场', sub: '断刃与白骨散落一地，值钱的东西还在泥里。',
    opts: [
      { name: '搜刮战场', desc: '触发一场精英战，胜利后获得两次词条选择。', run: () => ({ text: '亡灵从地下爬了出来……', then: () => { const n = { type: 'elite', double: true }; run.node = n; startNodeBattle(n); } }) },
      { name: '绕行', desc: '不惹麻烦。', run: () => '你绕开了古战场。' },
    ],
  },
  {
    name: '铁匠', sub: '废墟里还有一座没熄的炉子，一个铁匠在敲打。',
    opts: [
      { name: '锻造武器', desc: '花 35 试炼币，本局攻击 +12%。', need: 35, run: () => { run.coins -= 35; run.bonus.atkPct += 0.12; return '武器锋利了许多。攻击 +12%。'; } },
      { name: '加固铠甲', desc: '花 35 试炼币，本局最大生命 +15%。', need: 35, run: () => { run.coins -= 35; changeMaxHp(() => { run.bonus.hpPct += 0.15; }); return '铠甲更厚实了。最大生命 +15%。'; } },
      { name: '离开', desc: '不打扰他。', run: () => '你向铁匠点了点头，继续前行。' },
    ],
  },
];

function eventScene(ev) {
  ev = ev || EVENTS[Math.floor(Math.random() * EVENTS.length)];
  const cards = ev.opts.map((o) => {
    const poor = o.need && run.coins < o.need;
    return {
      name: o.name, tag: ev.name, tagColor: '#8ad0ff', glyph: o.name[0], desc: o.desc, foot: o.need ? `需要 ${o.need} 试炼币` : '', footColor: poor ? '#ff8a7a' : '#ffd264', disabled: poor,
      onPick() {
        const r = o.run();
        const out = typeof r === 'string' ? { text: r } : r;
        noteScene(ev.name, [out.text], out.then || afterNode);
      },
    };
  });
  setScene(chooser({ title: ev.name, sub: ev.sub, cards, cardW: 320 }));
}

/* ================= 局外强化界面 ================= */
const metaScene = {
  hover: 0, t: 0,
  rows() {
    const rows = META_UPS.map((u) => {
      const lv = META.up[u.id];
      const maxed = lv >= u.max;
      const cost = maxed ? 0 : u.cost(lv);
      return { name: u.name, desc: u.desc, state: maxed ? '已满级' : `${lv}/${u.max}`, cost: maxed ? '' : `${cost} 魂`, ok: !maxed && META.souls >= cost, group: '永久强化', buy() { META.souls -= cost; META.up[u.id]++; } };
    });
    for (const a of LOCKED_AFFIXES) {
      const own = META.unlocked[a.id];
      rows.push({ name: a.name, desc: `${ARCH[a.arch].name} · ${a.desc}`, state: own ? '已解锁' : '未解锁', cost: own ? '' : `${a.lock} 魂`, ok: !own && META.souls >= a.lock, group: '解锁词条', buy() { META.souls -= a.lock; META.unlocked[a.id] = true; } });
    }
    return rows;
  },
  enter() { this.hover = 0; this.t = 0; },
  rowRect(i) { return { x: 150, y: 150 + i * 37 + (i >= META_UPS.length ? 34 : 0), w: 980, h: 33 }; },
  update(dt) {
    this.t += dt;
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const r = this.rowRect(i);
      if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
        this.hover = i;
        if (mouse.clicked && this.t > 0.2 && rows[i].ok) { rows[i].buy(); saveMeta(); }
      }
    }
    if (pressed.has('ArrowUp') || pressed.has('KeyW')) this.hover = (this.hover + rows.length - 1) % rows.length;
    if (pressed.has('ArrowDown') || pressed.has('KeyS')) this.hover = (this.hover + 1) % rows.length;
    if (this.t > 0.2 && input.hit('confirm') && rows[this.hover].ok) { rows[this.hover].buy(); saveMeta(); }
    if (this.t > 0.2 && pressed.has('Escape')) setScene(titleScene);
  },
  draw() {
    drawBackdrop();
    drawText('局外强化', W / 2, 78, 50, '#ffe9b0', 'center');
    drawText(`试炼之魂 ${META.souls}`, W - 60, 78, 28, '#c9a6ff', 'right');
    drawText('通关与探索获得试炼之魂，永久生效。', W / 2, 112, 20, '#aab4c2', 'center');
    const rows = this.rows();
    rows.forEach((row, i) => {
      const r = this.rowRect(i);
      if (i === 0 || row.group !== rows[i - 1].group) drawText(row.group, r.x, r.y - 8, 18, '#ffd264', 'left', false);
      const sel = i === this.hover;
      panel(r.x, r.y, r.w, r.h, sel ? '#ffd264' : 'rgba(255,255,255,.15)', sel ? 'rgba(44,36,22,.9)' : 'rgba(14,14,22,.8)');
      drawText(row.name, r.x + 16, r.y + 24, 20, row.ok ? '#fff' : '#9aa4b4', 'left', false);
      drawText(row.desc, r.x + 150, r.y + 23, 16, '#aab4c2', 'left', false);
      drawText(row.state, r.x + r.w - 190, r.y + 24, 17, row.state === '已满级' || row.state === '已解锁' ? '#7de0a0' : '#cfd8e6', 'right', false);
      drawText(row.cost, r.x + r.w - 16, r.y + 24, 18, row.ok ? '#c9a6ff' : '#ff8a7a', 'right', false);
    });
    drawText('点击 / Enter 购买    ↑↓ 选择    Esc 返回', W / 2, H - 28, 18, '#8fa0b0', 'center');
  },
};

/* ================= 入口 ================= */
function startRun(hero) {
  newRun(hero);
  const picks = START_BLESSINGS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  setScene(chooser({
    title: '开局增益', sub: `${HEROES[hero].name} · 7 层试炼，从三个祝福中选择一个`, bar: false,
    cards: picks.map((b) => ({ name: b.name, tag: '祝福', tagColor: '#ffe27a', glyph: b.name[0], desc: b.desc, onPick() { b.apply(run); run.hp = runMaxHp(); showRoute(); } })),
  }));
}

function startGame() {
  if (bot.on && !params.get('run')) startBattle();
  else startRun(selectedHero);
}

function debugJump(which) {
  newRun(selectedHero);
  run.coins = 160;
  run.layer = Number(params.get('layer')) || 3;
  for (const id of ['g1', 's1', 'c1', 'm1', 'd1', 'g2']) grantAffix(id);
  run.path = ['battle', 'event'];
  ({
    route: showRoute, shop: shopScene, altar: altarScene, chest: chestScene, event: () => eventScene(EVENTS[Number(params.get('ev')) || 0]),
    pick: () => pickAffixScene({ title: '战斗胜利', sub: '获得 52 试炼币  ·  战后恢复 22 生命' }),
    boss: () => bossPreviewScene(() => showRoute(), true), meta: () => setScene(metaScene),
    victory: () => { run.node = { type: 'boss', final: true }; run.hp = run.hp * 0.9; bossVictory(); },
    result: () => { run.kills = 63; run.clearedLayers = 7; run.result = { win: true, souls: 92, layers: 7 }; run.active = false; setScene(runResultScene); },
  }[which] || showRoute)();
}
