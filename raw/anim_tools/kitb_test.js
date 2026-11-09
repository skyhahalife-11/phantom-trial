// 肉鸽接入单测：大房间按配置刷波次 / 结算回调，以及卡牌效果是否真的作用到大房间里
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });

// 数据与卡牌表
const dctx = vm.createContext({ console, Math, window: {}, Object, Array, Set });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), dctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/boons.js'), 'utf8'), dctx);
vm.runInContext('globalThis.__bm = buildMods; globalThis.__BOON = BOON; globalThis.__BOONS = BOONS; globalThis.__SK = SCHOOL_KEYS;', dctx);
const buildMods = dctx.__bm, BOON = dctx.__BOON, BOONS = dctx.__BOONS;

const sb = {
  console, Math, JSON, Object, Array, String, Number, Promise, Set, Map,
  W: 1280, H: 720, VW: 1280, window: {},
  document: { createElement: () => ({ getContext: () => ctxStub, width: 0, height: 0 }) },
  params: { get: (k) => (k === 'kit' ? 'b' : null) }, ctx: ctxStub,
  img: () => ({ complete: true, naturalWidth: 64, width: 64, height: 64 }),
  ready: () => true, preload: () => Promise.resolve(),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), rnd: (a, b) => a + Math.random() * (b - a),
  lerp: (a, b, t) => a + (b - a) * t, sign: (v) => (v < 0 ? -1 : 1),
  pressed: new Set(), pulse: new Set(), virt: {}, keys: new Set(),
  drawText: noop, titleScene: {},
};
sb.setScene = (s) => { sb.cur = s; if (s.enter) s.enter(); };
sb.window.HERO2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/hero2/manifest.js'), 'utf8').replace(/^window\.HERO2 = /, '').replace(/;\s*$/, ''));
sb.window.VFX = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/vfx/manifest.js'), 'utf8').replace(/^window\.VFX = /, '').replace(/;\s*$/, ''));
sb.input = { act: (n) => !!sb.virt[n], hit: (n) => sb.pulse.has(n) };
vm.createContext(sb);
const src = fs.readFileSync(path.join(ROOT, 'js/room.js'), 'utf8').replace('window.roomScene = roomScene;', 'window.roomScene = roomScene; window.__R = R;');
vm.runInContext(src, sb, { filename: 'room.js' });
const KC0 = () => 0.05 + 0.035 + 0.13;
const scene = sb.window.roomScene, R = () => sb.window.__R;

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
function step(sec, press) {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    sb.pulse.clear();
    if (press && i === 0) for (const k of [].concat(press)) sb.pulse.add(k);
    sb.cur.update(1 / 60);
  }
}
const ids = (...a) => a;
function begin(boonIds, over = {}) {   // 开一场肉鸽战斗：不刷怪（waveT 拉满），局面自己摆
  const mods = buildMods(boonIds);
  let ended = null;
  const cfg = Object.assign({ waves: [['skel']], mods, hp: 80, maxHp: 100, eMul: { hp: 1, dmg: 1, spd: 1 }, bossMul: 1, boss: false, onEnd: (win, r) => { ended = { win, r }; } }, over);
  scene.start(cfg);
  for (const k of Object.keys(sb.virt)) delete sb.virt[k];
  const r = R(); r.waveT = 999; r.p.x = 200; r.p.face = 1;
  return { r, cfg, get ended() { return ended; } };
}
function dummy(x, extra = {}) {
  const e = { x, y: 500, vx: 0, vy: 0, face: -1, hp: 6000, maxHp: 6000, st: 'stun', t: 0, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0, stunT: 99, ...extra };
  R().en.push(e); return e;
}


/* ---------- kit=b ---------- */
{
  const t = begin([]); const r = t.r; const e = dummy(330); r.p.y = 500;
  step(0.03, 's2');
  check('葬轮：先蹲一下', r.p.st === 'wheel' && r.p.vy === 0, r.p.st);
  step(0.08);
  check('葬轮：起跳并出上挑刀光', r.p.vy < 0 && r.fx.some((f) => f.name === 'b_sl2'), `vy ${r.p.vy.toFixed(0)}`);
  let land = false;
  for (let k = 0; k < 60; k++) { step(1 / 60); if (r.p.wheel && r.p.wheel.sub === 2) { land = true; break; } }
  check('葬轮：斜着落地并重砸', land, `x ${r.p.x.toFixed(0)}`);
  check('葬轮：往前移动了 100~220 像素', r.p.x - 200 > 100 && r.p.x - 200 < 220, (r.p.x - 200).toFixed(0));
  check('葬轮：打中敌人（kit=b 不刻墓志）', e.hp < 6000 && e.mark === 0, `${6000 - e.hp} mark ${e.mark}`);
  check('葬轮：冷却 4.5', r.p.cd.i > 3.5, r.p.cd.i.toFixed(2));
  step(0.4); check('葬轮：收招回到 idle', r.p.st === 'idle', r.p.st);
}
{
  const t = begin([]); const r = t.r; const e = dummy(230);
  step(0.03, 's2'); step(0.08);
  check('葬轮：起跳上挑打中贴身敌人并挑起', 6000 - e.hp === 8 && e.st === 'air', `伤 ${6000 - e.hp} ${e.st}`);
}
{
  const t = begin([]); const r = t.r; r.p.soul = 0;
  step(0.03, 's3');
  check('招架：架刀、带无敌', r.p.st === 'phase' && r.p.inv > 0.2 && r.fx.some((f) => f.k === 'kstance'), r.p.st);
  step(0.5);
  check('招架：人不动', Math.abs(r.p.x - 200) < 3, (r.p.x - 200).toFixed(1));
  check('招架落空：没有后续、冷却 3 秒、回到 idle', r.witch === 0 && r.p.cd.o > 2.4 && r.p.cd.o <= 3 && r.p.st === 'idle', `witch ${r.witch} cd ${r.p.cd.o.toFixed(2)} ${r.p.st}`);
  step(0.03, 's3');
  check('招架：冷却中再按 O 没反应', r.p.st !== 'phase' && r.p.st !== 'storm', r.p.st);
}
function perfect() {
  const t = begin([]); const r = t.r; r.p.soul = 0;
  dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  dummy(420);
  r.p.x = 260; step(0.02, 's3');
  return r;
}
{
  const r = perfect();
  check('招架成立：时空断裂+魂+刀身星芒', r.witch > 1 && r.p.soul >= 1 && r.fx.some((f) => f.k === 'kstar'), `witch ${r.witch.toFixed(2)} soul ${r.p.soul}`);
  check('招架成立：定格中不用再按键', r.p.phasePerf && r.p.st === 'phase', r.p.st);
  step(0.3);
  check('招架成立：自动瞬狱', r.p.st === 'storm', r.p.st);
  check('瞬狱后冷却 8 秒', r.p.cd.o > 7.5, r.p.cd.o.toFixed(2));
  check('瞬狱开场：眼睛特写、全场定格、不出「时空断裂」横幅', r.eye && r.stop > 0.3 && !(r.banner > 0), `eye ${!!r.eye} stop ${r.stop.toFixed(2)} banner ${r.banner.toFixed(2)}`);
  const E0 = r.en.slice(), hp0 = E0.map((e) => e.hp);
  step(0.5);
  check('特写期间敌人不掉血、主角不动', r.p.st === 'storm' && E0.every((e, i) => e.hp === hp0[i]), r.p.st);
  step(0.3);
  check('穿梭斩：酒红拖线 + 大刀弧 + 刀口挂着', r.fx.some((f) => f.k === 'kslash') && r.fx.some((f) => f.k === 'karc' && f.big) && r.cuts.some((c) => c.kb), `cuts ${r.cuts.length}`);
  for (let i = 0; i < 40 && r.p.st === 'storm'; i++) step(0.02);
  check('收刀：先停一下，刀口还没炸', r.p.st === 'sheathe' && r.cuts.some((c) => c.kb && !c.done) && E0.every((e, i) => e.hp === hp0[i]), r.p.st);
  step(0.5);
  check('收刀 0.3 秒后刀口一起炸：掉血 + 全屏斩线', E0.every((e, i) => e.hp < hp0[i]) && r.fx.some((f) => f.k === 'kboom'), E0.map((e) => e.hp).join(','));
}
{
  const t = begin([]); const r = t.r; dummy(240, { hp: 99999, maxHp: 99999 });
  step(0.03, 'attack'); step(0.05);
  const c = r.p.st;
  step(0.02, 's3');
  check('招架：普攻打到一半能直接按 O 取消进架势', c === 'atk' && r.p.st === 'phase', `${c} → ${r.p.st}`);
}
{
  const base = (() => { const t = begin([]); const e = dummy(240); step(0.03, 'attack'); step(0.25); return 6000 - e.hp; })();
  const r = perfect(); step(2.5); r.p.x = 200; r.p.face = 1; r.p.st = 'idle'; const e = dummy(240);
  step(0.03, 'attack'); step(0.25);
  check('普攻不强化', 6000 - e.hp <= base * 1.3, `${base} / ${6000 - e.hp}`);
}
{
  const t = begin([]); const r = t.r;
  step(0.03, 'dodge');
  check('空格：平时是冲刺、没有无敌', r.p.st === 'dash' && r.p.inv === 0, `${r.p.st} inv ${r.p.inv}`);
  step(0.45); step(0.03, 'dodge');
  check('空格：冲刺冷却很短（0.4 秒内能再冲）', r.p.st === 'dash', r.p.st);
  check('空格：冲刺不消耗替身', r.p.subN === 2, String(r.p.subN));
}
{
  const t = begin([]); const r = t.r; r.p.soul = 0;
  dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  r.p.x = 260; step(0.02, 'dodge');
  check('空格：冲刺不触发完美闪避', r.witch === 0, String(r.witch));
}
{
  const t = begin([]); const r = t.r; r.p.hp = 100; r.p.inv = 0;
  dummy(230, { type: 'skel', hp: 30, maxHp: 30, st: 'lunge', t: 0, face: -1, skin: 'skel' });
  step(0.2);
  const hit = 100 - r.p.hp;
  step(0.03, 'dodge');
  check('替身：挨打后马上按空格，挡回一半伤害', hit > 0 && r.p.hp === 100 - hit + Math.round(hit * 0.5), `挨 ${hit} 现在 ${r.p.hp}`);
  check('替身：后跳+无敌+次数减 1', r.p.st === 'sub' && r.p.inv > 0.3 && r.p.subN === 1, `${r.p.st} ${r.p.subN}`);
  check('替身：原地留墓碑', r.fx.some((f) => f.k === 'tomb'));
  step(8.4);
  check('替身：8 秒回复一次', r.p.subN === 2, `${r.p.subN} subT ${r.p.subT.toFixed(2)} st ${r.p.st} hp ${r.p.hp}`);
}
{
  const t = begin([]); const r = t.r; r.p.hp = 100; r.p.inv = 0;
  step(0.03, 's2'); step(0.2);
  r.p.inv = 0; const hp0 = r.p.hp;
  dummy(r.p.x + 45, { type: 'skel', hp: 9999, maxHp: 9999, st: 'lunge', t: 0, face: -1, skin: 'skel' });
  for (let k = 0; k < 12 && r.p.hp === hp0; k++) step(1 / 60);
  check('葬轮中受伤减半', hp0 - r.p.hp > 0 && hp0 - r.p.hp <= 5, `${hp0 - r.p.hp} st ${r.p.st}`);
}
{
  const t = begin([]); const r = t.r; const e = dummy(260);
  step(0.03, 's1'); step(0.06);
  const cone = r.fx.find((f) => f.name === 'u_cone');
  check('U 突刺：剑尖冲击波跟着人走', cone && Math.abs(cone.x - (r.p.x + 26)) < 2, cone ? `${cone.x.toFixed(0)} / ${r.p.x.toFixed(0)}` : 'none');
  check('U 突刺：贯穿爆点 + 酒红残影、不刻墓志', r.fx.some((f) => f.name === 'u_pierce') && r.fx.some((f) => f.k === 'after' && f.red) && e.mark === 0 && e.hp < 6000, `mark ${e.mark}`);
}
{
  const t = begin([]); const r = t.r;
  step(0.03, 'attack'); let rec = false;
  for (let j = 0; j < 30; j++) { step(1 / 60); if (r.p.st === 'atk' && r.p.t >= KC0()) rec = true; }
  check('普攻：没接下一刀时播收招过渡、然后回到 idle', rec && r.p.st === 'idle', r.p.st);
}
/* ---------- kit=b 普攻四段 ---------- */
{
  const t = begin([]); const r = t.r; const x0 = r.p.x; const seen = [];
  sb.pulse.add('attack');
  for (let j = 0; j < 200; j++) {   // 一直按住连点，直到打完一轮
    sb.pulse.clear(); if (j % 5 === 0) sb.pulse.add('attack'); sb.cur.update(1 / 60);
    if (r.p.st === 'atk' && seen[seen.length - 1] !== r.p.combo) seen.push(r.p.combo);
    if (seen.length === 4 && r.p.combo === 3 && r.p.hitDone) break;
  }
  step(0.8);
  check('普攻：连按打出四段', seen.join() === '0,1,2,3', seen.join());
  check('普攻：没敌人时四段只小步前进（约 106 像素）', r.p.x - x0 > 95 && r.p.x - x0 < 120, (r.p.x - x0).toFixed(0));
}
{
  const t = begin([]); const r = t.r; const e = dummy(240);
  step(0.03, 'attack'); step(0.09);
  const sl = r.fx.some((f) => f.name === 'b_sl0'), hit = r.fx.some((f) => f.name === 'b_hit'), arc = r.fx.some((f) => f.k === 'karc'), spk = r.fx.some((f) => f.k === 'kspark');
  step(0.25);
  check('普攻：前方有敌人只贴到身前', r.p.x < e.x - 15 && r.p.x > 200, `${r.p.x.toFixed(0)} / ${e.x}`);
  check('普攻：打中并出刀弧、刀光、爆点、火星', 6000 - e.hp > 0 && sl && hit && arc && spk, `${6000 - e.hp} 刀弧 ${arc} 刀光 ${sl} 爆点 ${hit} 火星 ${spk}`);
}
{
  const t = begin([]); const r = t.r; const e = dummy(300);
  step(0.03, 'attack'); step(0.2);
  check('普攻：前方 100 像素的敌人会被吸过去打中', 6000 - e.hp > 0 && r.p.x > 255 && r.p.x < 290, `${r.p.x.toFixed(0)} 伤 ${6000 - e.hp}`);
}
{
  const t = begin([]); const r = t.r; const e = dummy(250, { hp: 99999, maxHp: 99999 });
  let slow = false;
  for (let k = 0; k < 4; k++) { step(0.03, 'attack'); for (let j = 0; j < 22; j++) { step(1 / 60); if (r.slowT > 0 && r.fx.some((f) => f.k === 'kcrack')) slow = true; if (j % 3 === 0) sb.pulse.add('attack'); } }
  check('普攻：第 4 段命中有慢动作 + 落地裂纹', slow && r.fx.some((f) => f.k === 'kcrack'));
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
