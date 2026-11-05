'use strict';
/* 一局流程：地图 → 战斗 → 评分 → 强化三选一 → 下一格 / 下一关。
   规则见《肉鸽重设计方案》。阶段 1：3 关、每关 2~3 列格子 + Boss。 */

const RUN_STAGES = 3;
const BOSS_BY_STAGE = ['tombfiend', 'tombfiend', 'tombfiend'];
const BOSS_HP = [1400, 2100, 2800, 3500, 4200, 4900, 5600];   // 第 1 关 = 墓渊魔基础血量，之后按倍数放大
const BOSS_TIPS = {
  tombfiend: ['冲撞：伏低蓄力，头顶红光闪白的瞬间冲刺闪过去', '吐息：展翅后仰就是预警，贴地喷火，往上跳可躲', '天降：飞起后地上出现红圈，盯着你落点，落下前闪开', '出招结束后有「破绽」，此时伤害 +25%', '血量低于一半会狂怒：出招更快，并召唤骷髅兵'],
  skelcap: ['三连劈：每一劈前都有红色预警，连续闪避或跳过（劈砍矮，可跳）', '冲锋：整条地面预警，矮，可跳过', '震地：脚下椭圆预警，矮，可跳过', '血量低于 60% / 30% 会召唤骷髅兵', '招式结束后出现「破绽」，此时重斩触发处决'],
  dragon: ['龙息：整排竖向光柱，只能闪避或走开', '俯冲：竖向光柱，只能闪避', '尾扫：矮，可跳过', '血量低于 60% / 30% 会召唤小恶魔', '龙息、俯冲结束后出现「破绽」，伤害提高，重斩触发处决'],
};
/* 每关敌人生命 / 伤害 / 移速倍率（第 1~7 关） */
const STAGE_MUL = [
  { hp: 1.0, dmg: 0.9, spd: 0.94 }, { hp: 1.35, dmg: 1.15, spd: 1.0 }, { hp: 1.75, dmg: 1.4, spd: 1.05 }, { hp: 2.1, dmg: 1.7, spd: 1.08 },
  { hp: 2.5, dmg: 2.0, spd: 1.11 }, { hp: 2.9, dmg: 2.3, spd: 1.14 }, { hp: 3.3, dmg: 2.6, spd: 1.17 },
];
const POST_HEAL = 0.12;
const TIER_W = [[70, 30, 0, 0, 0], [55, 35, 10, 0, 0], [40, 40, 20, 0, 0], [40, 40, 20, 0, 0], [20, 35, 40, 0, 5], [20, 35, 40, 0, 5], [20, 35, 40, 0, 5]];
const AFFIXES = { rage: '狂暴', heavy: '重甲', swift: '迅捷' };
const REWARD_NAME = { boon: '强化', coin: '币', purple: '紫强化', heal: '恢复' };
const REWARD_CLS = { boon: 1, coin: 3, purple: 2, heal: 4 };
const REWARD_ICON = { boon: 'scroll-unfurled', coin: 'crown-coin', purple: 'sparkles', heal: 'heart-bottle' };

let run = { active: false };

function newRun(hero) {
  run = {
    active: true, hero, stage: 0, map: null, cur: null, path: [], boons: [], schoolW: Object.fromEntries(SCHOOL_KEYS.map((k) => [k, 1])),
    coins: 0, hp: 0, refresh: 1, kills: 0, battles: 0, ranks: [], bosses: 0, result: null, t0: performance.now(), queue: [],
  };
  run.hp = runMaxHp();
  genStageMap();
  return run;
}
const runMods = () => buildMods(run.boons);
const runMaxHp = () => Math.round(HEROES[run.hero].hp * (1 + runMods().hpPct));
const count = (id) => run.boons.filter((b) => b === id).length;
function healRun(pct) { const mx = runMaxHp(); const h = Math.min(mx - run.hp, Math.round(mx * pct)); run.hp += h; return h; }

function grantBoon(id) {
  if (window.sfx) sfx.play('pick');
  const before = runMaxHp();
  run.boons.push(id);
  const after = runMaxHp();
  run.hp = clamp(run.hp + (after - before), 1, after);
  const b = BOON[id];
  if (b.school) run.schoolW[b.school] = Math.min(4, run.schoolW[b.school] + 0.5);
}

/* ---------------- 地图生成 ---------------- */
function genStageMap() {
  const st = run.stage;
  const cols = st < 2 ? 2 : 3;
  const columns = [];
  let id = 0;
  for (let c = 0; c < cols; c++) {
    const n = Math.random() < 0.5 ? 2 : 3;
    const nodes = [];
    for (let r = 0; r < n; r++) {
      const type = st >= 1 && Math.random() < 0.23 ? 'elite' : 'battle';
      let reward = 'purple';
      if (type === 'battle') reward = pickW([['boon', 5], ['coin', 2], ['purple', 1.5], ['heal', 1.5]]);
      nodes.push({ id: id++, type, reward, col: c, row: r, next: [], state: c === 0 ? 'avail' : 'lock' });
    }
    if (nodes.every((nd) => nd.type === 'elite')) nodes[0].type = 'battle', nodes[0].reward = 'boon';
    columns.push(nodes);
  }
  const boss = { id: id++, type: 'boss', reward: 'purple', col: cols, row: 0, next: [], state: 'lock', boss: BOSS_BY_STAGE[st] };
  columns.push([boss]);
  for (let c = 0; c < cols; c++) {
    const A = columns[c], B = columns[c + 1];
    A.forEach((nd, i) => {
      const t = B.length === 1 ? 0 : Math.round((i * (B.length - 1)) / Math.max(1, A.length - 1));
      nd.next.push(B[t].id);
      if (B.length > 1 && Math.random() < 0.5) { const t2 = clamp(t + (Math.random() < 0.5 ? -1 : 1), 0, B.length - 1); if (t2 !== t) nd.next.push(B[t2].id); }
    });
    B.forEach((nd) => { if (!A.some((a) => a.next.includes(nd.id))) A[Math.floor(Math.random() * A.length)].next.push(nd.id); });
  }
  run.map = { columns, boss, cols };
  run.cur = null; run.path = [];
  run.refresh = 1;
  run.doors = { shop: 0, mystery: 0 };
}
function pickW(pairs) {
  const tot = pairs.reduce((a, p) => a + p[1], 0);
  let r = Math.random() * tot;
  for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
  return pairs[0][0];
}
const allNodes = () => run.map.columns.flat();
const nodeById = (i) => allNodes().find((n) => n.id === i);

function chooseNode(n) {
  if (window.sfx) sfx.play('ui');
  const cols = run.map.columns;
  for (const o of cols[n.col]) if (o !== n) o.state = 'dim';
  n.state = 'done';
  run.cur = n; run.path.push(n.id);
  const nxt = cols[n.col + 1];
  if (nxt) for (const o of nxt) o.state = n.next.includes(o.id) ? 'avail' : 'dim';
  startNodeBattle(n);
}

/* ---------------- 战斗生成 ---------------- */
function enemyPool(st) { return st === 0 ? ['skeleton', 'skeleton', 'imp'] : ['skeleton', 'skeleton', 'imp', 'imp', 'reaper']; }
function genWaves(n) {
  const st = run.stage;
  const pool = enemyPool(st);
  const pk = () => pool[Math.floor(Math.random() * pool.length)];
  if (n.rob) return [{ name: '劫道', title: '劫道 · 流浪商人', list: [{ k: 'merchant', elite: true, baseHp: 120 }] }];
  if (n.type === 'boss') return [{ name: 'BOSS', title: `BOSS  ${ENEMIES[n.boss].name}`, list: [{ k: n.boss, baseHp: BOSS_HP[st] }] }];
  if (n.type === 'elite') {
    const keys = Object.keys(AFFIXES);
    const el = { k: pk(), elite: true, affix: keys[Math.floor(Math.random() * keys.length)] };
    const list = [el];
    for (let i = 0; i < 2 + (st > 1 ? 1 : 0); i++) list.push({ k: pk() });
    return [{ name: '强敌', title: `强敌 · ${AFFIXES[el.affix]}`, list }];
  }
  const waves = [];
  const nw = st < 2 ? 1 : 2;
  for (let w = 0; w < nw; w++) {
    const cnt = 2 + Math.floor(Math.random() * 2) + (st > 0 ? 1 : 0);
    const list = [];
    for (let i = 0; i < cnt; i++) list.push({ k: pk() });
    waves.push({ name: nw === 1 ? '遭遇战' : `第 ${w + 1} 波`, list });
  }
  return waves;
}
/* 大房间战斗的敌人编组：每场 2 批、合计 11 只上下，场上剩 2 只时下一批就压上来；星号 = 精英 */
function roomWaves(n) {
  const st = run.stage;
  const rep = (t, c) => Array(c).fill(t);
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const air = st ? 'ghost' : 'wiz';
  if (n.type === 'boss') return [['boss']];
  if (n.rob) return [shuffle([...rep('skel', 3), 'hound', 'hound', 'brute'])];
  if (n.type === 'elite') return [shuffle(['*brute', ...rep('skel', 3), 'hound', 'wiz']), shuffle(['*wiz', ...rep('skel', 3 + st), ...rep('hound', 2), 'brute'])];
  return [
    shuffle([...rep('skel', 3), 'hound', air]),
    shuffle([...rep('skel', 2 + st), ...rep('hound', 2), 'brute', ...rep(air, 1 + (st > 0 ? 1 : 0)), ...(st > 1 ? ['brute'] : [])]),
  ];
}
function startNodeBattle(n) {
  run.node = n;
  const st = run.stage;
  const mul = STAGE_MUL[st];
  const go = () => roomScene.start({
    waves: roomWaves(n), mods: runMods(), hp: run.hp, maxHp: runMaxHp(), boss: n.type === 'boss',
    eMul: { hp: mul.hp * (n.type === 'elite' ? 1.3 : 1), dmg: mul.dmg, spd: mul.spd }, bossMul: BOSS_HP[st] / BOSS_HP[0],
    trigger: n.type === 'boss' ? 0 : 2, god: !!run.godAssist, onEnd: (win, r) => onBattleEnd(win, r),
  });
  run.godAssist = false;
  if (n.type === 'boss') setScene(bossPreviewScene(n.boss, go)); else go();
}

function onBattleEnd(win, r) {
  if (!win) { endRun(false); return; }
  const n = run.node;
  run.hp = Math.max(1, Math.round(r.hp));
  run.kills += r.kills;
  run.battles++;
  const mx = runMaxHp();
  const pct = clamp(r.hp / r.mx, 0, 1);
  const rank = rankOf(pct);
  run.ranks.push(rank.k);
  const M = runMods();
  const base = n.type === 'boss' ? 40 : (8 + 2 * (run.stage + 1)) * (n.type === 'elite' ? 2 : 1);
  const gain = Math.round((base + (n.reward === 'coin' ? 10 : 0)) * (1 + M.coin));
  run.coins += gain;
  let healed = 0;
  if (M.postHeal) healed += healRun(M.postHeal);
  healed += healRun(POST_HEAL);
  if (n.reward === 'heal') healed += healRun(0.25);
  if (n.type === 'boss') run.bosses++;
  const q = [];
  if (n.type === 'boss' && run.stage === 0) q.push(() => pickScene({ kind: 'core', title: '击败 Boss · 选择一个流派核心' }));
  q.push(() => pickScene({ kind: 'boon', title: n.type === 'boss' ? '击败 Boss · 选择一项强化' : '战斗胜利 · 选择一项强化', minPurple: n.reward === 'purple' || n.type === 'boss' ? 1 : 0, rank }));
  if (rank.k === 'S' && !n.extra) q.push(() => doorScene());
  if (n.rob) { q.length = 0; q.push(() => robRewardScene(n.robStock)); }
  run.queue = q;
  setScene(ratingScene({ rank, pct, hp: run.hp, mx, gain, healed, boss: n.type === 'boss' }));
}
function nextStep() {
  const f = run.queue.shift();
  if (f) { setScene(f()); return; }
  afterNode();
}
function afterNode() {
  if (run.nodeBack) { run.node = run.nodeBack; run.nodeBack = null; }
  if (run.node.type === 'boss') {
    run.stage++;
    if (run.stage >= RUN_STAGES) { endRun(true); return; }
    genStageMap();
  }
  setScene(mapScene);
}
function endRun(win) {
  run.active = false;
  run.result = { win, stage: Math.min(run.stage + (win ? 0 : 1), RUN_STAGES), time: Math.round((performance.now() - run.t0) / 1000) };
  if (bot.on) console.log(`[RESULT] win=${win} stage=${run.result.stage}/${RUN_STAGES} battles=${run.battles} boons=${run.boons.length} ranks=${run.ranks.join('')} hp=${run.hp}`);
  setScene(runResultScene);
}

/* ---------------- 强化候选 ---------------- */
function eligible(b, core) {
  if (b.hero && b.hero !== run.hero) return false;
  if (b.noRoll) return false;
  if (count(b.id) >= b.max) return false;
  if ((b.type === 'core') !== !!core) return false;
  const reqs = b.req ? [].concat(b.req) : [];
  if (!reqs.every((r) => r.split('|').some((x) => count(x) > 0))) return false;
  if (b.excl && b.excl.some((x) => count(x) > 0)) return false;
  for (const id of run.boons) { const ob = BOON[id]; if (ob.excl && ob.excl.includes(b.id)) return false; }
  return true;
}
const weightOf = (b) => (b.school ? run.schoolW[b.school] : 1);
function wpick(list) {
  const tot = list.reduce((a, b) => a + weightOf(b), 0);
  let r = Math.random() * tot;
  for (const b of list) { r -= weightOf(b); if (r <= 0) return b; }
  return list[list.length - 1];
}
function rollCands(kind, minPurple = 0) {
  if (kind === 'core') {
    const cs = BOONS.filter((b) => eligible(b, true) && !count(b.id));
    const out = [];
    while (out.length < 3 && cs.length) { const b = wpick(cs); out.push(b); cs.splice(cs.indexOf(b), 1); }
    return out;
  }
  const pool = BOONS.filter((b) => eligible(b, false));
  const tw = TIER_W[Math.min(run.stage, TIER_W.length - 1)];
  const out = [];
  const groups = new Set();
  const take = (tier) => {
    let c = pool.filter((b) => b.q === tier && !out.includes(b) && !(b.group && groups.has(b.group)));
    if (!c.length) c = pool.filter((b) => !out.includes(b) && !(b.group && groups.has(b.group)));
    if (!c.length) return null;
    const b = wpick(c);
    out.push(b); if (b.group) groups.add(b.group);
    return b;
  };
  // 每轮至少一张「改变行为」的强化，否则三张全是 +8% 数值，玩家感觉不到变强
  const effectPool = pool.filter((b) => b.type !== 'stat' && b.type !== 'myriad' && !(b.group && groups.has(b.group)));
  if (effectPool.length) { const b = wpick(effectPool); out.push(b); if (b.group) groups.add(b.group); }
  for (let i = out.length; i < 3; i++) {
    let tier = 0;
    let r = Math.random() * tw.reduce((a, b) => a + b, 0);
    for (let q = 0; q < tw.length; q++) { r -= tw[q]; if (r <= 0) { tier = q; break; } }
    if (minPurple && !out.some((b) => b.q >= 2)) tier = Math.max(tier, 2);
    take(tier);
  }
  return out.slice(0, 3);
}

/* ---------------- 绘制公共 ---------------- */
function chipBox(x, y, h, w, border = UI.c.edge) { ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, y - 2, w + 4, h + 4); ctx.fillStyle = border; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#150f22'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); }
function coinChip(x, y) {
  const t = String(run.coins);
  const w = 64 + textW(t, 36);
  ctx.save(); ctx.shadowColor = 'rgba(255,210,58,.45)'; ctx.shadowBlur = 16; chipBox(x - w, y, 44, w, '#B8902A'); ctx.restore();
  drawIcon('coins', 3, x - w + 26, y + 22, 1, 32);
  drawText(t, x - 14, y + 34, 36, '#FFE08A', 'right');
}
function hpPanel(x, y) {
  const hero = HEROES[run.hero];
  const mx = runMaxHp();
  pxPanel(x, y, 96, 76, { fill: '#0e0e16' });
  const im = img(`v2/heroes/${run.hero}.png`);
  if (ready(im)) { ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 4, 88, 68); ctx.clip(); ctx.drawImage(im, x - 10, y - 6, 120, 140); ctx.restore(); }
  drawText(hero.name, x + 116, y + 24, 24, UI.c.txt);
  drawText(`倾向：${dominantSchool()}`, x + 116 + textW(hero.name, 24) + 16, y + 24, 24, UI.c.mut);
  drawHpBar(x + 116, y + 36, 400, 32, run.hp, mx);
}
function dominantSchool() {
  const owned = SCHOOL_KEYS.filter((k) => run.schoolW[k] > 1);
  if (!owned.length) return '尚未成形';
  owned.sort((a, b) => run.schoolW[b] - run.schoolW[a]);
  return SCHOOLS[owned[0]].name;
}
function boundBoons(i) { return run.boons.map((id) => BOON[id]).filter((b) => b.skill === i); }
function buildBar() {
  const hero = HEROES[run.hero];
  const x0 = 24, y0 = H - 148, w = W - 48, h = 132;
  pxPanel(x0, y0, w, h, { fill: 'rgba(14,14,22,.92)' });
  hero.skills.forEach((s, i) => {
    const sx = x0 + 28 + i * 124, sy = y0 + 18;
    const bb = boundBoons(i);
    const q = bb.reduce((a, b) => Math.max(a, b.q), 0);
    const ult = !!s.ult;
    pxPanel(sx, sy, 96, 96, { edge: ult ? UI.Q[3] : UI.c.edge, fill: '#12121b', glow: ult ? 'rgba(255,210,58,.5)' : null, glowBlur: 16 });
    drawIcon(s.glyph || 'sparkles', bb.length ? q : 0, sx + 48, sy + 48, 2, 32);
    drawText(SKILL_KEYS[i], sx + 16, sy + 22, 24, UI.c.accent);
    bb.slice(0, 5).forEach((b, k) => { ctx.fillStyle = UI.c.ink; ctx.fillRect(sx + 6 + k * 18, sy + 100, 18, 18); ctx.fillStyle = UI.Q[b.q]; ctx.fillRect(sx + 8 + k * 18, sy + 102, 14, 14); });
  });
  const bx = x0 + 28 + 4 * 124 + 12;
  ctx.fillStyle = UI.c.edge; ctx.fillRect(bx - 12, y0 + 16, 2, h - 32);
  SCHOOL_KEYS.forEach((k, i) => {
    const col = i < 3 ? 0 : 1, row = i < 3 ? i : i - 3;
    const lx = bx + col * 290, ly = y0 + 26 + row * 34;
    drawText(SCHOOLS[k].name, lx, ly + 6, 24, UI.c.txt);
    ctx.fillStyle = UI.c.ink; ctx.fillRect(lx + 100, ly - 12, 112, 20);
    ctx.fillStyle = '#242434'; ctx.fillRect(lx + 102, ly - 10, 108, 16);
    ctx.fillStyle = SCHOOLS[k].color; ctx.fillRect(lx + 102, ly - 10, Math.round(108 * (run.schoolW[k] - 1 + 0.2) / 3.2), 16);
    drawText(run.schoolW[k].toFixed(1), lx + 222, ly + 6, 24, SCHOOLS[k].color);
  });
  const M = runMods();
  drawText(`攻击 +${Math.round(M.atkPct * 100)}%`, x0 + w - 24, y0 + 40, 24, UI.c.txt, 'right');
  drawText(`强化 ${run.boons.length}`, x0 + w - 24, y0 + 72, 24, UI.c.mut, 'right');
  drawText(`刷新 ${run.refresh} / 1`, x0 + w - 24, y0 + 104, 24, UI.c.mut, 'right');
  const pk = petKinds(M);
  pk.forEach((k, i) => { const px = x0 + w - 232 - i * 60; chipBox(px, y0 + 48, 50, 50); drawIcon({ wolf: 'wolf-head', raven: 'raven', stone: 'rock' }[k], 0, px + 25, y0 + 73, 1, 32); });
}

/* ---------------- 地图 ---------------- */
const mapScene = {
  enter() { this.sel = 0; this.pv = false; this.t = 0; if (bot.on) console.log(`[MAP] enter stage=${run.stage + 1} hp=${run.hp}`); },
  avail() { return allNodes().filter((n) => n.state === 'avail'); },
  pos(n) {
    const m = run.map;
    if (n.type === 'boss') return { x: 1110, y: 358 };
    const xs = 170 + n.col * (600 / (m.cols - 1));
    const col = m.columns[n.col];
    const ys = col.length === 2 ? [286, 442] : [232, 362, 492];
    return { x: xs, y: ys[n.row] };
  },
  update(dt) {
    this.t = (this.t || 0) + (dt || 0.016);
    if (bot.on) { this.bt = (this.bt || 0) + 1; if (this.bt > 20) { this.bt = 0; const a = this.avail(); chooseNode(a[Math.floor(Math.random() * a.length)]); } return; }
    if (pressed.has('KeyB')) this.pv = !this.pv;
    if (this.pv) { if (pressed.has('Escape') || mouse.clicked) this.pv = false; return; }
    if (pressed.has('Tab')) { setScene(buildScene(mapScene)); return; }
    const av = this.avail();
    if (input.hit('left') || input.hit('down')) this.sel = (this.sel + 1) % av.length;
    if (input.hit('right') || input.hit('jump')) this.sel = (this.sel + av.length - 1) % av.length;
    for (let i = 0; i < av.length; i++) {
      const p = this.pos(av[i]);
      if (inRect(p.x - 56, p.y - 56, 112, 112)) { this.sel = i; if (mouse.clicked) { chooseNode(av[i]); return; } }
    }
    if (inRect(1010, 244, 220, 240) && mouse.clicked) this.pv = true;
    if (input.hit('confirm') && av[this.sel]) chooseNode(av[this.sel]);
  },
  draw() {
    drawBackdrop(0.8);
    const m = run.map;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, 92);
    hpPanel(24, 12);
    drawText(`第 ${run.stage + 1} 关 / ${RUN_STAGES}`, W / 2 + 120, 56, 36, UI.c.accent, 'center');
    coinChip(W - 24, 24);
    // 进度
    let px = 100;
    drawText('进度', 32, 126, 24, UI.c.mut);
    for (let i = 0; i < RUN_STAGES; i++) {
      const t = `${i + 1}${i < run.stage ? ' ✓' : ''}${i === RUN_STAGES - 1 ? ' 终局' : ''}`;
      const w = textW(t, 24) + 24;
      chipBox(px, 104, 36, w, i === run.stage ? UI.c.accent : UI.c.edge);
      drawText(t, px + w / 2, 130, 24, i === run.stage ? UI.c.accent : i < run.stage ? UI.c.mut : UI.c.txt, 'center');
      px += w + 12;
    }
    drawText('查看 Boss 预览', W - 24, 130, 24, UI.c.mut, 'right'); drawText('B', W - 24 - textW('查看 Boss 预览', 24) - 30, 130, 24, UI.c.accent);
    // 列标题
    m.columns.slice(0, m.cols).forEach((col, c) => { const p = this.pos(col[0]); drawText(`第 ${c + 1} 列${c === (run.cur ? run.cur.col + 1 : 0) ? '  选一个' : ''}`, p.x - 56, 170, 24, UI.c.mut); });
    // 连线
    for (const n of allNodes()) {
      const a = this.pos(n);
      for (const id of n.next) {
        const t = nodeById(id), b = this.pos(t);
        const on = n.state === 'done' && t.state === 'avail';
        const hit = run.path.includes(n.id) && run.path.includes(t.id);
        ctx.strokeStyle = on || hit ? UI.c.accent : '#4a4a62'; ctx.lineWidth = on || hit ? 5 : 3;
        ctx.setLineDash(on || hit ? [] : [10, 10]);
        const x0 = a.x + 48, x1 = b.x - (t.type === 'boss' ? 104 : 50);
        const mx = (x0 + x1) / 2;
        ctx.beginPath(); ctx.moveTo(x0, a.y); ctx.bezierCurveTo(mx, a.y, mx, b.y, x1, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const av = this.avail();
    this.hover = null;
    for (const n of allNodes()) {
      const p = this.pos(n);
      if (n.type === 'boss') { this.drawBoss(n, p, n.state === 'avail', av[this.sel] === n); continue; }
      const dim = n.state === 'dim' ? 0.32 : n.state === 'lock' ? 0.58 : 1;
      const isAv = n.state === 'avail', sel = isAv && av[this.sel] === n;
      if (isAv && inRect(p.x - 58, p.y - 58, 116, 140)) this.hover = n;
      ctx.save(); ctx.globalAlpha = dim;
      this.drawNode(n, p, isAv, sel);
      ctx.restore();
    }
    if (this.hover) this.drawHover();
    buildBar();
    drawText('A/D 或鼠标选择 · Enter 进入 · Tab 构筑总览', W / 2, H - 156, 24, UI.c.mut, 'center');
    if (this.pv) drawBossPreview(m.boss.boss);
  },
  drawNode(n, p, isAv, sel) {
    const R = 46;
    const elite = n.type === 'elite';
    const col = elite ? UI.Q[2] : UI.c.accent;
    if (isAv) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      const g = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, R * 2.3);
      g.addColorStop(0, elite ? 'rgba(179,107,255,.38)' : 'rgba(255,179,71,.32)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R * 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.t * 0.7);
      ctx.strokeStyle = `rgba(255,255,255,${0.16 + pulse * 0.22})`; ctx.lineWidth = 2; ctx.setLineDash([9, 11]);
      ctx.beginPath(); ctx.arc(0, 0, R + 13, 0, Math.PI * 2); ctx.stroke();
      ctx.restore(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = n.state === 'done' ? '#151019' : '#0d0d15'; ctx.fill();
    ctx.lineWidth = sel ? 6 : 4;
    ctx.strokeStyle = sel ? '#fff' : isAv ? col : n.state === 'done' ? '#5a4a30' : '#32324a';
    ctx.stroke();
    drawIcon(elite ? 'horned-skull' : 'crossed-swords', elite ? 2 : 0, p.x, p.y - 3, 2, 30);
    const rc = UI.Q[REWARD_CLS[n.reward]];
    ctx.beginPath(); ctx.arc(p.x + R * 0.74, p.y + R * 0.74, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0b12'; ctx.fill(); ctx.strokeStyle = rc; ctx.lineWidth = 3; ctx.stroke();
    drawIcon(REWARD_ICON[n.reward], REWARD_CLS[n.reward], p.x + R * 0.74, p.y + R * 0.74, 1, 18);
    drawText(elite ? '强敌' : '遭遇战', p.x, p.y + R + 32, 24, elite ? UI.Q[2] : UI.c.txt, 'center');
    if (n.state === 'done') drawText('✓', p.x + R * 0.78, p.y - R * 0.62, 24, UI.c.accent, 'center');
  },
  drawHover() {
    const n = this.hover, p = this.pos(n);
    const elite = n.type === 'elite';
    const w = 300, h = 112;
    const x = clamp(p.x - w / 2, 16, W - w - 16);
    const y = p.y - 96 - h;
    pxPanel(x, y, w, h, { edge: elite ? UI.Q[2] : UI.c.accent, fill: 'rgba(12,12,20,.96)' });
    drawText(elite ? '强敌 · 随机词缀' : '遭遇战', x + 18, y + 42, 24, elite ? UI.Q[2] : UI.c.txt, 'left', false);
    drawText(`奖励：${REWARD_NAME[n.reward]}`, x + 18, y + 80, 24, UI.c.mut, 'left', false);
  },
  drawBoss(n, p, isAv, sel) {
    const e = ENEMIES[n.boss];
    pxPanel(p.x - 100, p.y - 114, 200, 230, { edge: sel ? '#fff' : isAv ? UI.c.accent : '#7a5a30', fill: '#0e0e16', glow: isAv ? 'rgba(255,179,71,.5)' : null });
    const im = img(e.img);
    if (ready(im)) { ctx.save(); ctx.beginPath(); ctx.rect(p.x - 92, p.y - 106, 184, 150); ctx.clip(); const h = 160, w = im.naturalWidth * h / im.naturalHeight; ctx.drawImage(im, p.x - w / 2, p.y - 104, w, h); ctx.restore(); }
    drawText(e.name, p.x, p.y + 76, 24, UI.c.danger, 'center');
    drawText('Boss · 点击预览', p.x, p.y + 108, 24, UI.c.mut, 'center', false);
  },
};

function drawBossPreview(key) {
  const e = ENEMIES[key];
  ctx.fillStyle = 'rgba(0,0,0,.82)'; ctx.fillRect(0, 0, W, H);
  pxPanel(140, 90, 1000, 540, { edge: '#7a5a30' });
  const im = img(e.img);
  if (ready(im)) { const h = 330, w = im.naturalWidth * h / im.naturalHeight; ctx.drawImage(im, 330 - w / 2, 150, w, h); }
  drawText(e.name, 330, 540, 36, UI.c.danger, 'center');
  drawText(`生命 ${BOSS_HP[run.stage]}`, 330, 584, 24, UI.c.mut, 'center');
  drawText('招式与应对', 560, 160, 36, UI.c.accent);
  (BOSS_TIPS[key] || []).forEach((t, i) => wrapText(t, 540, 24).forEach((ln, j) => drawText(ln, 560, 216 + i * 70 + j * 28, 24, UI.c.txt, 'left', false)));
  drawText('按 B / Esc / 点击 关闭', W / 2, 604, 24, UI.c.mut, 'center');
}
function bossPreviewScene(key, next) {
  return {
    enter() { this.t = 0; },
    update(dt) { this.t += dt; if (bot.on || (this.t > 0.3 && (input.hit('confirm') || mouse.clicked))) next(); },
    draw() { drawBackdrop(0.5); drawBossPreview(key); drawText('Enter 开战', W / 2, 650, 24, UI.c.accent, 'center'); },
  };
}

/* ---------------- 评分结算 ---------------- */
function ratingScene(o) {
  const RK = { S: '#FFD23A', A: '#5AA9FF', B: '#CFD8E6', C: '#FF5A4A' };
  const prev = Math.max(0, o.hp - (o.healed || 0));
  return {
    enter() { this.t = 0; this.stamped = false; },
    update(dt) { this.t += dt; if (bot.on || (this.t > 0.5 && (input.hit('confirm') || mouse.clicked))) nextStep(); },
    draw() {
      drawBackdrop(0.78);
      const t = this.t, col = o.rank.color, cx = 330, cy = 360;
      const ft = clamp(t / 0.35, 0, 1);
      drawText('战斗胜利', W / 2, 78, 48, '#fff', 'center');
      ornament(W / 2, 98, 220 * ft, '#8a5a9a');
      // 左：盖章
      const st = clamp((t - 0.3) / 0.2, 0, 1), sc = st < 1 ? 2.6 - 1.6 * st * st : 1;
      if (st >= 1 && !this.stamped) { this.stamped = true; sparkBurst(cx, cy, 36, o.rank.k === 'S' ? '255,214,90' : o.rank.k === 'A' ? '120,180,255' : o.rank.k === 'B' ? '220,226,240' : '255,100,90'); }
      const shk = this.stamped && t < 0.75 ? (0.75 - t) * 22 : 0;
      ctx.save(); ctx.translate(cx + (Math.random() - 0.5) * shk, cy + (Math.random() - 0.5) * shk);
      const gl = ctx.createRadialGradient(0, 0, 20, 0, 0, 230); gl.addColorStop(0, col + '55'); gl.addColorStop(1, col + '00');
      ctx.globalAlpha = st; ctx.fillStyle = gl; ctx.fillRect(-240, -240, 480, 480);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.setLineDash([18, 10]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(0, 0, 168, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 148, 0, Math.PI * 2); ctx.stroke();
      ctx.scale(sc, sc);
      ctx.font = '192px FP, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 36;
      ctx.fillText(o.rank.k, 0, 66); ctx.restore();
      drawText('战斗评分', cx, 596, 24, UI.c.mut, 'center');
      // 右：数据
      const x0 = 640, w = 540;
      drawText('剩余生命', x0, 220, 24, UI.c.mut);
      const k = clamp((t - 0.6) / 0.9, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const cur = prev + (o.hp - prev) * e;
      ctx.fillStyle = UI.c.ink; ctx.fillRect(x0 - 4, 236, w + 8, 40);
      ctx.fillStyle = '#2b1217'; ctx.fillRect(x0, 240, w, 32);
      ctx.fillStyle = '#d8433a'; ctx.fillRect(x0, 240, Math.round(w * clamp(prev / o.mx, 0, 1)), 32);
      if (o.hp > prev) { ctx.fillStyle = '#7DFF9A'; ctx.fillRect(x0 + Math.round(w * prev / o.mx), 240, Math.round(w * (cur - prev) / o.mx), 32); }
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x0, 240, w, 10);
      for (const r of RANK) if (r.min > 0) { ctx.fillStyle = UI.c.ink; ctx.fillRect(Math.round(x0 + w * r.min) - 2, 232, 4, 48); drawText(r.k, x0 + w * r.min, 304, 24, RK[r.k], 'center', false); }
      drawText(`${Math.round(cur)} / ${o.mx}`, x0 + w, 220, 24, '#fff', 'right');
      drawText(`${Math.round(o.pct * 100)}%`, x0 + w / 2, 266, 24, '#fff', 'center');
      let ty = 360;
      const sk = clamp((t - 0.5) / 0.6, 0, 1), coin = Math.round(o.gain * (1 - Math.pow(1 - sk, 3)));
      drawIcon('coins', 3, x0 + 24, ty - 8, 1, 32); drawText('试炼币', x0 + 56, ty, 24, UI.c.txt);
      drawText(`+${coin}`, x0 + w, ty, 36, '#FFE08A', 'right');
      ty += 52;
      if (o.healed) { drawIcon('heart-bottle', 4, x0 + 24, ty - 8, 1, 32); drawText('战后回复', x0 + 56, ty, 24, UI.c.txt); drawText(`+${o.healed}`, x0 + w, ty, 36, UI.c.heal, 'right'); ty += 52; }
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x0, ty - 20, w, 2);
      // 档位
      let x = x0;
      for (const r of RANK) { const txt = r.k === 'C' ? 'C' : `${r.k} ≥${Math.round(r.min * 100)}%`; const on = o.rank.k === r.k; x += tagChip(txt, x, ty + 8, on ? r.color : '#3a3150', on); }
      if (o.rank.k === 'S') {
        const pulse = 0.6 + 0.4 * Math.sin(t * 4);
        ctx.save(); ctx.shadowColor = `rgba(255,210,58,${pulse})`; ctx.shadowBlur = 18;
        drawText('探索门已出现 · 领完强化后可以进入', x0, ty + 88, 24, UI.Q[3]); ctx.restore();
      }
      drawSparks();
      if (t > 0.5 && Math.floor(t * 2) % 2 === 0) drawText('Enter 继续', W / 2, 676, 24, UI.c.accent, 'center');
    },
  };
}

/* ---------------- 强化三选一 ---------------- */
/* 获得强化的过场：卡片消失后给一次明确的「变强」反馈，而不是直接跳下一场 */
function boonGetScene(b, next) {
  const col = UI.Q[b.q];
  return {
    enter() { this.t = 0; this.out = false; this.burst = false; },
    close() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.1) this.close(); return; }
      if (this.t > 0.45 && (mouse.clicked || pressed.has('Space') || pressed.has('Enter') || pressed.has('Digit1'))) this.close();
    },
    draw() {
      drawBackdrop(0.9);
      const k = clamp(this.t / 0.22, 0, 1), ease = 1 - Math.pow(1 - k, 3);
      const cx = W / 2, cy = H / 2 - 50;
      if (!this.burst) { this.burst = true; sparkBurst(cx, cy, 44, '255,226,140', 520); }
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 460 * ease);
      g.addColorStop(0, UI.QG[b.q]); g.addColorStop(0.45, 'rgba(255,210,58,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (this.t < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - this.t / 0.12)})`; ctx.fillRect(0, 0, W, H); }
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 * (1 - k * 0.6); ctx.beginPath(); ctx.arc(cx, cy, (ease + i * 0.28) * 260, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.t * 0.4); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      drawIcon(b.icon, b.q, cx, cy, 2 + 2 * ease, 48);
      drawText('获得强化', cx, cy + 124, 24, col, 'center');
      ornament(cx, cy + 140, 150, col);
      drawText(b.name, cx, cy + 196, 48, '#fff', 'center');
      wrapText(b.desc, 640, 24).slice(0, 3).forEach((ln, i) => richLine(ln, cx, cy + 244 + i * 32, 24, UI.c.txt));
      if (b.school) drawText(`${SCHOOLS[b.school].name} · 后续该流派强化出现率提升`, cx, cy + 350, 24, SCHOOLS[b.school].color, 'center', false);
      drawSparks();
      if (this.t > 0.45 && Math.floor(this.t * 2) % 2 === 0) drawText('点击 / 空格 继续', cx, H - 64, 24, UI.c.mut, 'center', false);
    },
  };
}

function pickScene(cfg) {
  return {
    enter() { this.t = 0; this.cands = cfg.cands ? cfg.cands() : rollCands(cfg.kind, cfg.minPurple); this.hover = -1; this.done = false; this.hk = [0, 0, 0]; this.last = nowS(); if (!this.cands.length) { run.coins += 40; setTimeout(cfg.onDone || nextStep, 0); } },
    choose(i) {
      const b = this.cands[i];
      if (!b || this.done) return;
      this.done = true;
      grantBoon(b.id);
      setScene(boonGetScene(b, cfg.onDone || nextStep));
    },
    reroll() { if (cfg.noReroll || run.refresh <= 0) return; run.refresh--; this.cands = rollCands(cfg.kind, cfg.minPurple); this.t = 0.2; },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.2) this.choose(Math.floor(Math.random() * this.cands.length)); return; }
      if (this.t < 0.35) return;
      const n = this.cands.length;
      this.hover = -1;
      for (let i = 0; i < n; i++) { const c = this.cardRect(i); if (inRect(c.x, c.y, c.w, c.h)) { this.hover = i; if (mouse.clicked) { this.choose(i); return; } } }
      for (let i = 0; i < n; i++) if (pressed.has('Digit' + (i + 1))) { this.choose(i); return; }
      if (!cfg.noReroll && (pressed.has('KeyR') || (mouse.clicked && inRect(W - 400, H - 80, 190, 44)))) this.reroll();
      if (pressed.has('Tab')) setScene(buildScene(this));
    },
    cardRect(i) { const n = this.cands.length; const w = 340, g = 40; const x0 = (W - (n * w + (n - 1) * g)) / 2; return { x: x0 + i * (w + g), y: 108, w, h: 512 }; },
    draw() {
      drawBackdrop(0.78);
      const now = nowS(), dt = Math.min(0.05, now - this.last); this.last = now;
      drawText(cfg.title, W / 2, 62, 48, '#fff', 'center');
      ornament(W / 2, cfg.sub ? 74 : 82, 260, '#8a5a9a');
      if (cfg.sub) drawText(cfg.sub, W / 2, 98, 24, UI.c.mut, 'center', false);
      if (cfg.rank) { ctx.save(); ctx.shadowColor = cfg.rank.color; ctx.shadowBlur = 14; chipBox(32, 28, 52, 52, cfg.rank.color); ctx.restore(); drawText(cfg.rank.k, 58, 68, 36, cfg.rank.color, 'center', false); }
      coinChip(W - 24, 24);
      this.cands.forEach((b, i) => {
        const c = this.cardRect(i);
        const k = clamp((this.t - i * 0.08) / 0.22, 0, 1), ek = 1 - Math.pow(1 - k, 3);
        this.hk[i] += ((this.hover === i ? 1 : 0) - this.hk[i]) * Math.min(1, dt * 14);
        ctx.save(); ctx.globalAlpha = ek; ctx.translate(0, (1 - ek) * 60);
        drawBoonCard(b, c.x, c.y, c.w, c.h, this.hk[i], i + 1, now + i * 0.7);
        ctx.restore();
      });
      // 已有强化：紧凑徽章
      ctx.fillStyle = 'rgba(12,6,24,.88)'; ctx.fillRect(0, H - 88, W, 88); ctx.fillStyle = '#3a2a4a'; ctx.fillRect(0, H - 88, W, 2);
      drawText('已有强化', 32, H - 38, 24, UI.c.mut);
      let x = 150;
      const uniq = [...new Set(run.boons)];
      for (const id of uniq) {
        const b = BOON[id]; const n = count(id);
        if (x + 40 > W - 440) { drawText(`+${uniq.length - uniq.indexOf(id)}`, x, H - 38, 24, UI.c.mut); break; }
        ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, H - 72, 44, 44); ctx.fillStyle = UI.Q[b.q]; ctx.fillRect(x, H - 70, 40, 40); ctx.fillStyle = '#150f22'; ctx.fillRect(x + 2, H - 68, 36, 36);
        drawIcon(b.icon, b.q, x + 20, H - 50, 1, 32);
        if (n > 1) drawText(`${n}`, x + 38, H - 28, 24, '#fff');
        x += 50;
      }
      if (!cfg.noReroll) {
        const rr = run.refresh > 0, hv = inRect(W - 400, H - 80, 190, 44);
        ctx.save(); if (rr) { ctx.shadowColor = 'rgba(255,179,71,.5)'; ctx.shadowBlur = 16; } ctx.fillStyle = UI.c.ink; ctx.fillRect(W - 404, H - 84, 198, 52); ctx.restore();
        ctx.fillStyle = rr ? (hv ? '#fff2b0' : '#FFB347') : '#2a2438'; ctx.fillRect(W - 400, H - 80, 190, 44);
        ctx.fillStyle = rr ? '#3a2810' : '#1a1428'; ctx.fillRect(W - 396, H - 76, 182, 36);
        drawText(`R 刷新 ${run.refresh}`, W - 305, H - 49, 24, rr ? '#FFD98A' : '#5a5f70', 'center', false);
      }
      drawText('Tab 构筑', W - 112, H - 49, 24, UI.c.mut, 'center', false);
    },
  };
}

const KEY_COL = ['#FF7A6A', '#6AB8FF', '#7DFF9A', '#FFD23A'];
function skillTag(b, cx, y) {
  const keys = ['U', 'I', 'O', 'P'];
  const sq = (k, x, col) => { ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, y - 2, 30, 30); ctx.fillStyle = col; ctx.fillRect(x, y, 26, 26); drawText(k, x + 13, y + 21, 24, '#150f22', 'center', false); };
  let label, ks = [];
  if (typeof b.skill === 'number') { label = HEROES[run.hero].skills[b.skill].name; ks = [b.skill]; }
  else if (b.skill === 'normal') { label = '普通技能'; ks = [0, 1, 2]; }
  else if (b.skill === 'basic') { label = '普攻'; ks = ['J']; }
  else if (b.skill === 'pet') label = '宠物';
  else if (b.type === 'myriad') label = '全部技能';
  else label = '属性';
  const w = ks.length * 32 + textW(label, 24) + 4;
  let x = cx - w / 2;
  for (const k of ks) { if (k === 'J') sq('J', x, '#CFD8E6'); else sq(keys[k], x, KEY_COL[k]); x += 32; }
  drawText(label, x + 2, y + 22, 24, UI.c.mut, 'left', false);
}
/* hv：悬停程度 0~1（平滑）；t：时间，用于高光扫过与图标环旋转 */
function drawBoonCard(b, x, y, w, h, hv, num, t = 0) {
  const col = UI.Q[b.q], qg = UI.QG[b.q];
  y -= Math.round(hv * 12);
  const cx = x + w / 2;
  ctx.save();
  ctx.shadowColor = qg.replace(/[\d.]+\)$/, `${0.35 + 0.45 * hv})`); ctx.shadowBlur = 22 + 22 * hv;
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.restore();
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  const bg = ctx.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#271a3c'); bg.addColorStop(0.5, '#1a1230'); bg.addColorStop(1, '#120c22');
  ctx.fillStyle = bg; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = qg.replace(/[\d.]+\)$/, '0.12)'); ctx.fillRect(x + 4, y + 4, w - 8, 150);
  pxCorners(x, y, w, h, col);
  ctx.fillStyle = UI.c.ink; for (const [px, py] of [[x + 2, y + 2], [x + w - 6, y + 2], [x + 2, y + h - 6], [x + w - 6, y + h - 6]]) ctx.fillRect(px, py, 4, 4);   // 角饰里的镂空点
  // 顶部：品质 + 类型
  const isEffect = b.type !== 'stat' && b.type !== 'myriad';
  let tx = x + 18;
  tx += tagChip(QUAL[b.q].name, tx, y + 16, col, true);
  const tag = b.type === 'core' ? '流派核心' : isEffect ? '质变强化' : '数值强化';
  tagChip(tag, tx, y + 16, isEffect || b.type === 'core' ? UI.c.accent : '#6a6288', false);
  // 图标盘
  const iy = y + 128;
  const g = ctx.createRadialGradient(cx, iy, 4, cx, iy, 74); g.addColorStop(0, qg.replace(/[\d.]+\)$/, '0.75)')); g.addColorStop(0.6, qg); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, iy, 74, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, iy); ctx.rotate(t * 0.5); ctx.strokeStyle = col; ctx.globalAlpha = 0.55 + 0.3 * hv; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  drawIcon(b.icon, b.q, cx, iy, 3 + 0.08 * hv, 48);
  drawText(b.name, cx, y + 248, 36, '#fff', 'center');
  skillTag(b, cx, y + 266);
  ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.fillRect(x + 40, y + 310, w - 80, 2); ctx.globalAlpha = 1;
  wrapText(b.desc, w - 48, 24).slice(0, 5).forEach((ln, i) => richLine(ln, cx, y + 346 + i * 28, 24, UI.c.txt));
  // 底部：状态 + 流派 + 序号
  ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x + 20, y + h - 52, w - 40, 2);
  const have = count(b.id);
  let foot = '新获得', fcol = '#7DFF9A';
  if (b.type === 'stat') { foot = have ? `已叠加 ${have} 次` : '新获得'; fcol = have ? UI.c.accent : '#7DFF9A'; }
  else if (b.req) { const rid = [].concat(b.req)[0].split('|')[0]; foot = b.reqText || `需要「${BOON[rid].name}」`; fcol = UI.c.mut; }
  else if (b.type === 'link') { foot = '联动强化'; fcol = UI.Q[2]; }
  drawText(foot, x + 22, y + h - 18, 24, fcol, 'left', false);
  if (b.school) { const st = `${SCHOOLS[b.school].name}${b.type === 'core' ? '' : ' +0.5'}`; const sw = textW(st, 24) + 16; if (x + 22 + textW(foot, 24) + 12 + sw < x + w - 56) tagChip(st, x + w - 56 - sw, y + h - 42, SCHOOLS[b.school].color, false, 28); }
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x + w - 44, y + h - 42, 30, 30); ctx.fillStyle = UI.c.accent; ctx.fillRect(x + w - 42, y + h - 40, 26, 26);
  drawText(String(num), x + w - 29, y + h - 19, 24, '#150f22', 'center', false);
  // 悬停高光扫过
  if (hv > 0.02) {
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 4, w - 8, h - 8); ctx.clip();
    const sx = x - 120 + ((t * 260) % (w + 360));
    ctx.globalAlpha = 0.16 * hv; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 50, y); ctx.lineTo(sx - 30, y + h); ctx.lineTo(sx - 80, y + h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------------- 构筑总览（Tab） ---------------- */
function buildScene(back) {
  return {
    update() {
      if (bot.on || pressed.has('Tab') || pressed.has('Escape') || mouse.clicked) setScene(back);
    },
    draw() {
      if (back.draw) back.draw();
      ctx.fillStyle = 'rgba(0,0,0,.86)'; ctx.fillRect(0, 0, W, H);
      drawText(`构筑总览 · ${HEROES[run.hero].name} · ${dominantSchool()}`, 48, 70, 36, '#fff');
      drawText('Tab / Esc 关闭', W - 48, 70, 24, UI.c.mut, 'right');
      const hero = HEROES[run.hero];
      let y = 120;
      const rows = [...hero.skills.map((s, i) => ({ name: `${SKILL_KEYS[i]}  ${s.name}`, icon: s.glyph, bb: boundBoons(i), ult: !!s.ult })),
        { name: '普攻', icon: 'sword-brandish', bb: run.boons.map((id) => BOON[id]).filter((b) => b.skill === 'basic') },
        { name: '普通技能（流派）', icon: 'scroll-unfurled', bb: run.boons.map((id) => BOON[id]).filter((b) => b.skill === 'normal') }];
      for (const r of rows) {
        pxPanel(48, y, W - 96, 66, { edge: r.ult ? UI.Q[3] : UI.c.edge, fill: '#12121b' });
        drawIcon(r.icon || 'sparkles', r.bb.length ? r.bb.reduce((a, b) => Math.max(a, b.q), 0) : 0, 88, y + 33, 1, 32);
        drawText(r.name, 124, y + 42, 24, UI.c.txt);
        let x = 420;
        if (!r.bb.length) drawText('（无）', x, y + 42, 24, '#5a5f70');
        for (const b of r.bb) { const w = textW(b.name, 24) + 24; if (x + w > W - 70) break; chipBox(x, y + 14, 38, w, UI.Q[b.q]); drawText(b.name, x + w / 2, y + 40, 24, UI.Q[b.q], 'center', false); x += w + 10; }
        y += 76;
      }
      const stats = run.boons.map((id) => BOON[id]).filter((b) => b.type === 'stat' || b.type === 'myriad' || (b.type === 'cost' && !b.school));
      drawText('属性与代价', 48, y + 36, 24, UI.c.accent);
      let x = 220, yy = y + 14;
      for (const b of stats) { const t = `${b.name} ${b.desc}`; const w = textW(t, 24) + 20; if (x + w > W - 48) { x = 220; yy += 44; } if (yy > H - 20) break; chipBox(x, yy, 36, w, UI.Q[b.q]); drawText(t, x + w / 2, yy + 27, 24, UI.c.txt, 'center', false); x += w + 8; }
    },
  };
}

/* ---------------- 一局结束 ---------------- */
const runResultScene = {
  enter() { this.t = 0; },
  update(dt) {
    this.t += dt;
    if (bot.on) { botAfterRun(); return; }
    if (this.t > 0.6 && (input.hit('confirm') || mouse.clicked)) startRun();
    if (this.t > 0.6 && input.hit('restart')) setScene(titleScene);
  },
  draw() {
    drawBackdrop(0.8);
    const r = run.result;
    drawText(r.win ? '试炼通过' : '挑战失败', W / 2, 150, 48, r.win ? UI.Q[3] : UI.c.danger, 'center');
    drawText(`到达第 ${r.stage} / ${RUN_STAGES} 关　击败 ${run.kills} 个敌人　用时 ${Math.floor(r.time / 60)} 分 ${r.time % 60} 秒`, W / 2, 210, 24, UI.c.txt, 'center');
    drawText(`战斗评分：${run.ranks.join(' ') || '—'}`, W / 2, 252, 24, UI.c.mut, 'center');
    pxPanel(200, 290, W - 400, 300, { fill: 'rgba(14,14,22,.9)' });
    drawText('本局构筑', 232, 330, 24, UI.c.accent);
    let x = 232, y = 350;
    for (const id of [...new Set(run.boons)]) { const b = BOON[id]; const n = count(id); const t = b.name + (n > 1 ? `×${n}` : ''); const w = textW(t, 24) + 24; if (x + w > W - 232) { x = 232; y += 44; } if (y > 560) break; chipBox(x, y, 36, w, UI.Q[b.q]); drawText(t, x + w / 2, y + 27, 24, UI.Q[b.q], 'center', false); x += w + 8; }
    drawText('Enter / 点击 再来一局　　R 返回标题', W / 2, 650, 24, UI.c.mut, 'center');
  },
};

function startRun() {
  newRun(selectedHero);
  const g = params.get('give');   // 调试：直接发放强化（all = 除代价外全部）
  if (g) (g === 'all' ? BOONS.filter((b) => b.type !== 'cost' && !b.noRoll && (!b.hero || b.hero === 'wine')).map((b) => b.id) : g.split(',')).forEach((id) => { if (BOON[id]) grantBoon(id); });
  setScene(mapScene);
}
function startGame() { startRun(); }

function debugJump(which) {
  startRun();
  const give = ['s_core', 'u_core', 'l_break', 'e_charge', 'atk_1', 'c_awe', 'b_core'];
  give.forEach((id) => { if (BOON[id]) grantBoon(id); });
  run.coins = 128;
  run.hp = Math.round(runMaxHp() * 0.83);
  const f = {
    map: () => setScene(mapScene),
    pick: () => { run.stage = 1; setScene(pickScene({ kind: 'boon', title: '战斗胜利 · 选择一项强化', rank: RANK[0], minPurple: 1 })); },
    core: () => setScene(pickScene({ kind: 'core', title: '击败 Boss · 选择一个流派核心' })),
    rating: () => { run.node = run.map.columns[0][0]; setScene(ratingScene({ rank: RANK[0], pct: 0.94, hp: 262, mx: 280, gain: 14, healed: 8 })); },
    boss: () => setScene(bossPreviewScene('skelcap', () => {})),
    door: () => { run.node = run.map.columns[0][0]; run.queue = []; setScene(doorScene()); },
    shop: () => setScene(shopScene(() => setScene(mapScene))),
    bless: () => setScene(mysteryScene(() => setScene(mapScene))),
    room: () => { run.node = run.map.columns[0][0]; run.queue = []; run.stage = Math.max(run.stage, +(params.get('layer') || 1)); ["s_swift", "s_heavy", "atk_0", "atk_0", "crit_1", "crit_1"].forEach((id) => grantBoon(id)); setScene(mysteryScene(nextStep)); },
    petcave: () => setScene(petCaveScene(() => setScene(mapScene))),
    rob: () => { run.node = run.map.columns[0][0]; run.queue = []; setScene(shopScene(nextStep)); },
    mini1: () => setScene(miniChopScene((g) => { console.log('[MINI] chop ' + g); setScene(mapScene); })),
    mini2: () => setScene(miniDodgeScene((g) => { console.log('[MINI] dodge ' + g); setScene(mapScene); })),
    mini3: () => setScene(miniMemoryScene((g) => { console.log('[MINI] memory ' + g); setScene(mapScene); })),
    event: () => setScene(eventScene(() => setScene(mapScene))),
    build: () => setScene(buildScene(mapScene)),
    result: () => { run.kills = 24; run.ranks = ['S', 'A', 'S', 'B']; endRun(true); },
  }[which] || (() => setScene(mapScene));
  f();
}
