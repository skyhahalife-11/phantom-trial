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
sb.window.VFX = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/vfx/manifest.js'), 'utf8').replace(/^window\.VFX = /, '').replace(/;\s*$/, ''));
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
function toBlood(r, sec = 10) { r.p.form = 'blood'; r.p.rage = r.p.rageMax = sec; r.rcombo = 0; }

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
// 7 暴走真正无敌：被扑中不掉血、不被打断
{
  const r = fresh(); toBlood(r);
  hound(240, { st: 'windup', t: 0.54, face: -1 });
  step(0.5);
  check('暴走 被扑不掉血', r.p.hp === 100 && r.p.st !== 'hurt', `hp ${r.p.hp} st ${r.p.st}`);
}
// 8 普攻刀气：远处的敌人也挨到
{
  const r = fresh(); toBlood(r);
  const far = dummy(380);
  step(0.5, 'attack');
  check('刀气 打到远处敌人', far.hp < 600, `掉 ${600 - far.hp}`);
}
// 9 血影闪：几乎无冷却，路径上的敌人挨刀
{
  const r = fresh(); toBlood(r);
  const e = dummy(260); const x0 = r.p.x;
  step(0.2, 'dodge');
  check('血影闪 位移并砍中路径敌人', r.p.x - x0 > 100 && e.hp < 600, `位移 ${(r.p.x - x0).toFixed(0)} 掉 ${600 - e.hp}`);
  step(0.05, 'dodge');
  check('血影闪 马上能再闪', r.p.st === 'rdash', r.p.st);
}
// 10 碑雨：全屏墓碑砸下
{
  const r = fresh(); toBlood(r);
  const es = [dummy(260), dummy(420), dummy(560)];
  step(2.0, 's1');
  check('碑雨 屏幕内敌人都挨砸', es.every((e) => e.hp < 600), es.map((e) => 600 - e.hp).join(' / '));
}
// 11 血爪乱舞：抓一只来回砸 4 下（波及旁边的），最后甩飞
{
  const r = fresh(); toBlood(r);
  const e = hound(250, { hp: 300 }), side = hound(300, { hp: 300 });
  step(0.9, 's2');
  check('血爪乱舞 抓住的敌人挨 5 下以上', 300 - e.hp >= 14 * 5, `掉 ${300 - e.hp}`);
  check('血爪乱舞 波及旁边的敌人', side.hp < 300, `掉 ${300 - side.hp}`);
  check('血爪乱舞 结束后甩飞', e.st === 'air' || e.st === 'stun', e.st);
}
// 12b 血狱：暴走中随时能放，不需要时空断裂
{
  const r = fresh(); toBlood(r);
  const es = [dummy(260), dummy(380)];
  step(0.05, 's3');
  check('血狱 不需要断裂也能放', r.p.st === 'storm', r.p.st);
  step(1.0);
  check('血狱 每只挨 3 道', es.every((e) => 600 - e.hp >= 54), es.map((e) => 600 - e.hp).join(' / '));
  check('血狱 牢笼全部斩碎消失', !r.fx.some((f) => f.name === 'prison'), r.fx.filter((f) => f.name === 'prison').length);
}
// 12c 时间到自动「葬」：全屏伤害按连击数加成，之后回常态
{
  const r = fresh(); toBlood(r, 0.3);
  const e = dummy(500);
  r.rcombo = 20;
  step(1.5);   // 0.3 秒暴走 + 葬的捧碑砸地约 0.85 秒
  check('时间到自动葬并回常态', r.p.form === 'normal', r.p.form);
  check('葬 全屏伤害含连击加成', 600 - e.hp >= 30 + 20 * 1.5, `掉 ${600 - e.hp}`);
}
// 12d 葬：伤害和捧碑砸地的落地帧对齐，影子换成捧碑那一套
{
  const r = fresh(); toBlood(r); r.shade = { st: 'shade_idle', t: 0, x: 180, y: r.p.y, face: 1 };
  const e = dummy(400);
  step(0.05, 's4');
  check('葬 影子换成捧碑', !r.shade && r.fx.some((f) => f.name === 'burial'));
  step(0.2);
  check('葬 落地前不结算', e.hp === 600, `掉 ${600 - e.hp}`);
  step(0.2);
  check('葬 落地帧结算', e.hp < 600, `掉 ${600 - e.hp}`);
}
// 12d 暴走中击杀加时；敌人半速
{
  const r = fresh(); toBlood(r, 5);
  r.p.rage = 3;
  const e = hound(250, { hp: 1 });
  step(0.3, 'attack');
  check('击杀 +0.5 秒', e.st === 'dead' || !r.en.includes(e) ? r.p.rage > 3 - 0.3 + 0.4 : false, `剩 ${r.p.rage.toFixed(2)}`);
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
// 12e 突刺 → 普攻：一口气穿过敌人不急停，冲完自动回身，突刺中途按的攻击排队，结束立刻接上普攻并砍中
{
  const r = fresh();
  const e = dummy(300);
  step(0.08, 's1');
  step(0.04, 'attack');   // 突刺途中按攻击
  const hp1 = e.hp;
  step(0.3);
  check('突刺穿过敌人、冲完离它不远', r.p.x > 310 && r.p.x < 400, `主角 x ${r.p.x.toFixed(0)}`);
  check('突刺后回身面向敌人', r.p.face === -1, `face ${r.p.face}`);
  step(0.25);
  check('排队的普攻接上并砍中', e.hp < hp1, `st ${r.p.st} 掉 ${hp1 - e.hp} 距离 ${Math.abs(e.x - r.p.x).toFixed(0)}`);
}
// 13 魂：不足 3 格不能变身；变身吞掉全部魂换暴走时长
{
  const r = fresh();
  r.p.soul = 2.5; step(0.05, 's4');
  check('魂不足不能变身', r.p.st !== 'transform' && r.p.form === 'normal');
  r.p.soul = 4; step(0.05, 's4');
  check('变身吞掉全部魂', r.p.soul === 0 && Math.abs(r.p.rageMax - 10) < 0.01, `暴走 ${r.p.rageMax} 秒`);
  step(0.8);
  check('变身完成', r.p.form === 'blood');
  check('变身召出血契之影', !!r.shade, r.shade && r.shade.st);
  step(0.5);
  check('影子跟在主角身后', r.shade && (r.shade.x - r.p.x) * r.p.face < 0 && Math.abs(r.shade.x - r.p.x) < 45, r.shade && (r.shade.x - r.p.x).toFixed(1));
  step(0.05, 'attack'); step(0.12);   // 等到普攻出判定那一帧
  check('普攻时影子挥爪', r.shade && r.shade.st === 'shade_swipe', r.shade && r.shade.st);
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
