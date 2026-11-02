// 针对性单测：机器人整局里不容易碰到的技能分支，直接摆好局面按键，检查结果
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const sb = {
  console, Math, JSON, Object, Array, String, Number, Promise, Set, Map,
  W: 1280, H: 720, VW: 1280, window: {},
  document: { createElement: () => ({ getContext: () => ctxStub, width: 0, height: 0 }) },
  params: { get: () => null }, ctx: ctxStub,
  img: () => ({ complete: true, naturalWidth: 64, width: 64, height: 64 }),
  ready: () => true, preload: () => Promise.resolve(),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), rnd: (a, b) => a + Math.random() * (b - a),
  lerp: (a, b, t) => a + (b - a) * t, sign: (v) => (v < 0 ? -1 : 1),
  pressed: new Set(), pulse: new Set(), virt: {}, keys: new Set(),
  drawText: noop, setScene: noop, titleScene: {},
};
sb.window.HERO2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/hero2/manifest.js'), 'utf8').replace(/^window\.HERO2 = /, '').replace(/;\s*$/, ''));
sb.input = { act: (n) => !!sb.virt[n], hit: (n) => sb.pulse.has(n) };
vm.createContext(sb);
const src = fs.readFileSync(path.join(ROOT, 'js/room.js'), 'utf8').replace('window.roomScene = roomScene;', 'window.roomScene = roomScene; window.__R = R;');
vm.runInContext(src, sb, { filename: 'room.js' });
const scene = sb.window.roomScene, R = () => sb.window.__R;

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
function fresh() {
  scene.enter();
  for (const k of Object.keys(sb.virt)) delete sb.virt[k];
  const r = R(); r.waveT = 999;   // 不刷波次，局面自己摆
  r.p.x = 200; r.p.face = 1;
  return r;
}
function hound(x, extra = {}) {
  const r = R();
  const e = { x, y: 500, vx: 0, vy: 0, face: -1, hp: 60, st: 'patrol', t: 0, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0, stunT: 0.28, ...extra };
  r.en.push(e); return e;
}
// 站着不动的木桩狗：一直眩晕，不会跑开干扰判定
const dummy = (x, extra = {}) => hound(x, { st: 'stun', stunT: 99, hp: 600, ...extra });
function step(sec, press) {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    sb.pulse.clear();
    if (press && i === 0) for (const k of [].concat(press)) sb.pulse.add(k);
    scene.update(1 / 60);
  }
}
function toBlood(r, pact = 60) { r.p.form = 'blood'; r.p.pact = r.p.pactMax = pact; }

// 1 掷碑：剑飞出去打中敌人并钉住，飞回手里后才开始冷却
{
  const r = fresh();
  const e = hound(330);
  step(0.15, 's2');
  check('掷碑 剑飞出', !!r.blade && r.blade.x > 220, `剑 x ${r.blade && r.blade.x.toFixed(0)}`);
  step(0.25);
  check('掷碑 去程打中并钉住', e.hp < 60 && e.st === 'stun', `hp ${e.hp} st ${e.st}`);
  check('剑在外面时不算冷却', r.p.cd.i === 0);
  step(1.2);
  check('剑飞回手里', !r.blade && r.p.cd.i > 0, `冷却 ${r.p.cd.i.toFixed(2)}`);
}
// 2 按住上：斜着往上扔
{
  const r = fresh();
  sb.virt.up = true;
  step(0.3, 's2');
  sb.virt.up = false;
  check('按住上 斜上扔', r.blade && r.blade.y < r.p.y - 60, `剑 y ${r.blade && r.blade.y.toFixed(0)} 主角 y ${r.p.y}`);
}
// 3 瞬身：瞬移到剑的位置，路径上的敌人挨一刀，被钉住的必定暴击
{
  const r = fresh();
  const e = dummy(300);
  step(0.3, 's2');
  const hp0 = e.hp, bx = r.blade.x;
  step(0.05, 's2');
  check('瞬身 移到剑的位置', Math.abs(r.p.x - bx) < 20 && !r.blade, `主角 x ${r.p.x.toFixed(0)} 剑 x ${bx.toFixed(0)}`);
  check('瞬身 路径上的敌人挨刀且暴击', hp0 - e.hp === 28, `掉 ${hp0 - e.hp}（暴击应为 28）`);
  check('瞬身后冷却开始', r.p.cd.i > 0);
}
// 4 瞬身穿过正在扑击的敌人：算完美闪避，进入时空断裂
{
  const r = fresh();
  step(0.3, 's2');
  const bx = r.blade.x;
  hound((r.p.x + bx) / 2, { st: 'leap', t: 0.1, ground: false, y: 490, vy: 0, face: -1 });
  step(0.05, 's2');
  check('瞬身穿过扑击 = 完美闪避', r.witch > 0 && r.p.soul >= 1, `断裂 ${r.witch.toFixed(2)} 魂 ${r.p.soul}`);
}
// 5 断空：前方区域 0.3 秒后才爆；屏幕里带墓志的远处敌人也挨一道
{
  const r = fresh();
  const near = dummy(290), far = dummy(460, { mark: 6 }), plain = dummy(520);
  step(0.3, 's3');
  check('断空 0.3 秒前还没爆', near.hp === 600, `hp ${near.hp}`);
  step(0.4);
  check('断空 前方区域爆开', near.hp < 600, `掉 ${600 - near.hp}`);
  check('断空 带墓志的远处敌人也挨一道', far.hp < 600, `掉 ${600 - far.hp}`);
  check('断空 远处无墓志的不受影响', plain.hp === 600);
}
// 6 瞬狱：时空断裂中按 O，穿梭屏幕内所有敌人，每只 3 道，收刀后断裂结束
{
  const r = fresh();
  r.witch = 2;
  const es = [dummy(260), dummy(380), dummy(520)];
  step(0.05, 's3');
  check('断裂中 O 变成瞬狱', r.p.st === 'storm');
  step(1.0);
  check('瞬狱 每只敌人挨 3 道', es.every((e) => 600 - e.hp >= 42), es.map((e) => 600 - e.hp).join(' / '));
  check('瞬狱后断裂结束', r.witch <= 0.3, `剩 ${r.witch.toFixed(2)}`);
  check('瞬狱后回到可操作状态', ['idle', 'fall', 'sheathe', 'land'].includes(r.p.st), r.p.st);
}
// 7 血爪拖行：冲过去铲起敌人，冲完甩向身后上方
{
  const r = fresh(); toBlood(r);
  const e = hound(250);
  const x0 = r.p.x;
  step(0.2, 's2');
  check('拖行 铲起敌人', e.st === 'carried', e.st);
  step(0.3);
  check('拖行 冲出一段距离', r.p.x - x0 > 100, `位移 ${(r.p.x - x0).toFixed(0)}`);
  check('拖行 甩向身后上方', e.st === 'air' && e.vx < 0 && 60 - e.hp === 26, `st ${e.st} vx ${e.vx} 掉 ${60 - e.hp}`);
}
// 8 裂地：地裂往前连爆三下
{
  const r = fresh(); toBlood(r);
  const es = [hound(250), hound(298), hound(346)];
  step(0.7, 's3');
  check('裂地 三处都被挑飞', es.every((e) => e.hp < 60), es.map((e) => 60 - e.hp).join(' / '));
}
// 9 碑落：带墓志的敌人挨砸、墓志消失；眩晕中的目标伤害翻倍
{
  const r = fresh(); toBlood(r);
  const a = hound(300, { mark: 5, st: 'stun', stunT: 9 }), b = hound(400, { mark: 5 });
  step(0.5, 's1');
  check('碑落 命中带墓志的敌人', a.hp < 60 && b.hp < 60, `a ${a.hp} b ${b.hp}`);
  check('碑落 结算后墓志消失', a.mark === 0 && b.mark === 0);
  check('碑落 眩晕目标伤害 ×2', 60 - a.hp === 2 * (60 - b.hp), `a 掉 ${60 - a.hp} b 掉 ${60 - b.hp}`);
}
// 10 碑守：变身后挥砍时正面被扑，挡下并反震
{
  const r = fresh(); toBlood(r);
  hound(240, { st: 'windup', t: 0.54, face: -1 });
  step(0.02, 'attack');
  const before = r.p.pact;
  step(0.3);
  check('碑守 挥砍时正面挡下', r.p.pact > before - 2 && r.p.hp === 100, `血契 ${before.toFixed(1)} → ${r.p.pact.toFixed(1)}`);
}
// 11 血契被打空：碑碎，回常态并硬直 1 秒，本体生命不变
{
  const r = fresh(); toBlood(r, 5);
  r.p.face = -1;   // 背对狗，不触发格挡
  hound(240, { st: 'windup', t: 0.54, face: -1 });
  step(0.4);
  check('血契打空 → 碑碎硬直', r.p.form === 'normal' && r.p.st === 'tbreak', `form ${r.p.form} st ${r.p.st}`);
  check('变身中挨打不扣本体生命', r.p.hp === 100, `hp ${r.p.hp}`);
}
// 12 突刺对被钉住的敌人必定暴击；穿过的敌人刻墓志
{
  const r = fresh();
  const e = hound(330);
  step(0.35, 's2');
  const hp0 = e.hp;
  step(0.3, 's1');
  check('突刺 对钉住的敌人暴击', hp0 - e.hp === 36, `掉 ${hp0 - e.hp}`);
  check('突刺 刻墓志', e.mark > 0);
}
// 13 魂：不足 2 格不能变身；变身吞掉全部魂换血契
{
  const r = fresh();
  r.p.soul = 1.5; step(0.05, 's4');
  check('魂不足不能变身', r.p.st !== 'transform' && r.p.form === 'normal');
  r.p.soul = 4; step(0.05, 's4');
  check('变身吞掉全部魂', r.p.soul === 0 && Math.abs(r.p.pactMax - 60) < 0.01, `血契上限 ${r.p.pactMax}`);
  step(0.8);
  check('变身完成', r.p.form === 'blood');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
