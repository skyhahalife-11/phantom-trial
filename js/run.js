'use strict';
/* 一局流程：地图 → 战斗 → 评分 → 强化三选一 → 下一格 / 下一关。
   规则见《肉鸽重设计方案》。阶段 1：3 关、每关 2~3 列格子 + Boss。 */

const RUN_STAGES = 3;
const BOSS_BY_STAGE = ['skelcap', 'dragon', 'dragon'];
const BOSS_HP = [1150, 2000, 2700, 3400, 4100, 4800, 5600];
const BOSS_TIPS = {
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
function startNodeBattle(n) {
  run.node = n;
  const waves = genWaves(n);
  resetWorld(run.hero, { mods: runMods(), hp: run.hp });
  world.waves = waves;
  world.eMul = n.type === 'boss' ? { hp: 1, dmg: STAGE_MUL[run.stage].dmg, spd: 1 } : Object.assign({}, STAGE_MUL[run.stage]);
  world.hint = n === run.map.columns[0][0] && run.stage === 0 ? 8 : 0;
  if (run.godAssist) { run.godAssist = false; later(3.5, godStrike); }
  paused = false;
  setScene(n.type === 'boss' ? bossPreviewScene(n.boss, () => setScene(battleScene)) : battleScene);
}

function onBattleEnd(win) {
  const p = world.player;
  if (!win) { endRun(false); return; }
  const n = run.node;
  run.hp = Math.max(1, Math.round(p.hp));
  run.kills += world.kills;
  run.battles++;
  const mx = runMaxHp();
  const pct = clamp(world.endHpPct, 0, 1);
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
function drawBackdrop(dim = 0.72) {
  ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, W, H);
  drawLayer('v2/bg/dungeon_far.png', H, 0, 300);
  drawLayer('v2/bg/dungeon_mid.png', 330, FLOOR - 330 + 22, 600);
  drawLayer('v2/bg/dungeon_ground.png', 126, FLOOR - 24, 0);
  ctx.fillStyle = `rgba(10,10,18,${dim})`; ctx.fillRect(0, 0, W, H);
}
function chipBox(x, y, h, w, border = UI.c.edge) { ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, y - 2, w + 4, h + 4); ctx.fillStyle = border; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#12121b'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); }
function coinChip(x, y) {
  const t = String(run.coins);
  const w = 56 + textW(t, 24);
  chipBox(x - w, y, 40, w);
  drawIcon('coins', 3, x - w + 22, y + 20, 1, 32);
  drawText(t, x - 12, y + 29, 24, '#fff', 'right');
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
  return {
    enter() { this.t = 0; },
    update(dt) { this.t += dt; if (bot.on || (this.t > 0.5 && (input.hit('confirm') || mouse.clicked))) nextStep(); },
    draw() {
      drawBackdrop(0.78);
      drawText('战斗胜利', W / 2, 90, 48, '#fff', 'center');
      pxPanel(300, 120, 680, 500);
      drawText('战斗评分', W / 2, 176, 24, UI.c.mut, 'center');
      const k = Math.min(1, this.t / 0.35);
      ctx.save(); ctx.translate(W / 2, 312); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      ctx.font = '192px FP, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = o.rank.color; ctx.shadowColor = o.rank.color; ctx.shadowBlur = 40;
      ctx.fillText(o.rank.k, 0, 70); ctx.restore();
      drawText(`剩余生命 ${o.hp} / ${o.mx}　${Math.round(o.pct * 100)}%`, W / 2, 430, 36, '#fff', 'center');
      let x = 392;
      for (const r of RANK) { const t = r.k === 'C' ? 'C' : `${r.k} ≥${Math.round(r.min * 100)}%`; const w = textW(t, 24) + 24; chipBox(x, 452, 36, w, o.rank.k === r.k ? r.color : '#2a2a38'); drawText(t, x + w / 2, 478, 24, o.rank.k === r.k ? r.color : '#5a5f70', 'center', false); x += w + 14; }
      ctx.fillStyle = UI.c.edge; ctx.fillRect(340, 510, 600, 2);
      let line = `试炼币 +${o.gain}`;
      if (o.healed) line += `　战后回复 +${o.healed}`;
      drawText(line, W / 2, 556, 24, UI.c.txt, 'center');
      if (o.rank.k === 'S') drawText('探索门已出现 · 领完强化后可以进入', W / 2, 594, 24, UI.Q[3], 'center');
      drawText('Enter 继续', W / 2, 668, 24, UI.c.accent, 'center');
    },
  };
}

/* ---------------- 强化三选一 ---------------- */
/* 获得强化的过场：卡片消失后给一次明确的「变强」反馈，而不是直接跳下一场 */
function boonGetScene(b, next) {
  const col = UI.Q[b.q];
  return {
    enter() { this.t = 0; this.out = false; },
    close() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.1) this.close(); return; }
      if (this.t > 0.45 && (mouse.clicked || pressed.has('Space') || pressed.has('Enter') || pressed.has('Digit1'))) this.close();
    },
    draw() {
      const k = clamp(this.t / 0.22, 0, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      ctx.fillStyle = `rgba(6,6,12,${0.86 * k})`; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 - 40;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 460 * ease);
      g.addColorStop(0, UI.QG[b.q]);
      g.addColorStop(0.45, 'rgba(255,210,58,.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5 * (1 - k * 0.6); ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const r = (ease * 1 + i * 0.28) * 260;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      drawIcon(b.icon, b.q, cx, cy, 2 + 4 * ease, 48);
      drawText('获得强化', cx, cy + 118, 24, col, 'center');
      drawText(b.name, cx, cy + 186, 48, '#fff', 'center');
      wrapText(b.desc, 640, 24).slice(0, 3).forEach((ln, i) => drawText(ln, cx, cy + 236 + i * 32, 24, UI.c.txt, 'center', false));
      if (b.school) drawText(`${SCHOOLS[b.school].name} · 后续该流派强化出现率提升`, cx, cy + 340, 24, SCHOOLS[b.school].color, 'center', false);
      if (this.t > 0.45) drawText('点击 / 空格 继续', cx, H - 64, 24, UI.c.mut, 'center', false);
    },
  };
}

function pickScene(cfg) {
  return {
    enter() { this.t = 0; this.cands = cfg.cands ? cfg.cands() : rollCands(cfg.kind, cfg.minPurple); this.hover = -1; this.done = false; if (!this.cands.length) { run.coins += 40; setTimeout(cfg.onDone || nextStep, 0); } },
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
    cardRect(i) { const n = this.cands.length; const w = 340, g = 40; const x0 = (W - (n * w + (n - 1) * g)) / 2; return { x: x0 + i * (w + g), y: 112, w, h: 500 }; },
    draw() {
      drawBackdrop(0.78);
      drawText(cfg.title, W / 2, 80, 48, '#fff', 'center');
      if (cfg.sub) drawText(cfg.sub, W / 2, 102, 24, UI.c.mut, 'center', false);
      if (cfg.rank) { chipBox(32, 36, 44, 44, cfg.rank.color); drawText(cfg.rank.k, 54, 70, 36, cfg.rank.color, 'center', false); }
      coinChip(W - 24, 28);
      this.cands.forEach((b, i) => {
        const c = this.cardRect(i);
        const k = clamp((this.t - i * 0.08) / 0.2, 0, 1);
        const yo = (1 - k) * 40;
        ctx.save(); ctx.globalAlpha = k; ctx.translate(0, yo);
        drawBoonCard(b, c.x, c.y, c.w, c.h, this.hover === i, i + 1);
        ctx.restore();
      });
      // 已有强化
      pxPanel(24, H - 92, W - 48, 76, { fill: 'rgba(14,14,22,.92)' });
      drawText('已有强化', 48, H - 44, 24, UI.c.mut);
      let x = 190;
      const uniq = [...new Set(run.boons)];
      for (const id of uniq.slice(0, 9)) {
        const b = BOON[id]; const n = count(id);
        const t = b.name + (n > 1 ? `×${n}` : '');
        const w = textW(t, 24) + 56;
        if (x + w > W - 440) { drawText(`+${uniq.length - uniq.indexOf(id)}`, x, H - 44, 24, UI.c.mut); break; }
        chipBox(x, H - 78, 44, w, '#2a2a38');
        drawIcon(b.icon, b.q, x + 22, H - 56, 1, 32);
        drawText(t, x + 44, H - 46, 24, UI.Q[b.q], 'left', false);
        x += w + 10;
      }
      const rr = run.refresh > 0;
      if (!cfg.noReroll) {
        pxPanel(W - 400, H - 80, 190, 44, { edge: rr ? UI.c.accent : '#2a2a38' });
        drawText(`R 刷新 ${run.refresh}`, W - 305, H - 49, 24, rr ? UI.c.accent : '#5a5f70', 'center', false);
      }
      drawText('Tab 构筑', W - 112, H - 49, 24, UI.c.mut, 'center', false);
    },
  };
}

function drawBoonCard(b, x, y, w, h, hover, num) {
  const col = UI.Q[b.q];
  const lift = hover ? -8 : 0;
  y += lift;
  pxPanel(x, y, w, h, { edge: col, fill: '#1a1a28', glow: UI.QG[b.q].replace(/[\d.]+\)$/, hover ? '0.7)' : '0.4)'), glowBlur: hover ? 36 : 24 });
  pxCorners(x, y, w, h, col);
  // 顶部：品质与类型、所属流派
  const isEffect = b.type !== 'stat' && b.type !== 'myriad';
  drawText(QUAL[b.q].name, x + 24, y + 46, 24, col, 'left', false);
  const tag = b.type === 'core' ? '流派核心' : isEffect ? '质变强化' : '数值强化';
  drawText(tag, x + 30 + textW(QUAL[b.q].name, 24), y + 46, 24, isEffect || b.type === 'core' ? UI.c.accent : UI.c.mut, 'left', false);
  if (b.school) drawText(`${SCHOOLS[b.school].name}${b.type === 'core' ? '' : ' +0.5'}`, x + w - 24, y + 46, 24, SCHOOLS[b.school].color, 'right', false);
  // 图标
  const g = ctx.createRadialGradient(x + w / 2, y + 150, 4, x + w / 2, y + 150, 90);
  g.addColorStop(0, UI.QG[b.q]); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x + w / 2 - 100, y + 60, 200, 180);
  drawIcon(b.icon, b.q, x + w / 2, y + 150, 3, 48);
  drawText(b.name, x + w / 2, y + 272, 36, '#fff', 'center');
  let sub = '';
  if (b.skill === 'normal') sub = '作用：普通技能';
  else if (b.skill === 'basic') sub = '作用：普攻';
  else if (b.skill === 'pet') sub = '作用：宠物';
  else if (typeof b.skill === 'number') sub = `作用：${HEROES[run.hero].skills[b.skill].name}`;
  else if (b.type === 'stat' || b.type === 'myriad') sub = b.type === 'myriad' ? '作用：全部技能' : '作用：属性';
  if (sub) drawText(sub, x + w / 2, y + 308, 24, UI.c.mut, 'center', false);
  wrapText(b.desc, w - 48, 24).slice(0, 5).forEach((ln, i) => drawText(ln, x + w / 2, y + 346 + i * 31, 24, UI.c.txt, 'center', false));
  // 底部提示
  ctx.fillStyle = UI.c.edge; ctx.fillRect(x + 24, y + h - 56, w - 48, 2);
  const have = count(b.id);
  let foot = '', fcol = UI.c.mut;
  if (b.type === 'stat') foot = have ? `已叠加 ${have} 次` : '新获得';
  else if (b.req) { const rid = [].concat(b.req)[0].split('|')[0]; foot = b.reqText || `需要「${BOON[rid].name}」`; fcol = UI.c.mut; }
  else if (b.type === 'link') { foot = '联动强化'; fcol = UI.Q[2]; }
  else foot = '新获得';
  drawText(foot, x + 24, y + h - 20, 24, fcol, 'left', false);
  drawText(String(num), x + w - 24, y + h - 20, 24, UI.c.accent, 'right', false);
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
        { name: '普通技能（流派）', icon: 'scroll-unfurled', bb: run.boons.map((id) => BOON[id]).filter((b) => b.skill === 'normal') },
        { name: '宠物', icon: 'wolf-head', bb: run.boons.map((id) => BOON[id]).filter((b) => b.skill === 'pet') }];
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
  if (g) (g === 'all' ? BOONS.filter((b) => b.type !== 'cost' && !b.hero || b.hero === 'knight' && b.type !== 'cost').map((b) => b.id) : g.split(',')).forEach((id) => { if (BOON[id]) grantBoon(id); });
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
