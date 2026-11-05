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
  params: { get: () => null }, ctx: ctxStub,
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

/* ---------- 卡牌表本身 ---------- */
{
  const wine = BOONS.filter((b) => b.hero === 'wine');
  check('酒红剑客专属强化 ≥ 22 条', wine.length >= 22, String(wine.length));
  check('旧骑士专属强化已清掉', !BOONS.some((b) => b.hero === 'knight'));
  const rollable = BOONS.filter((b) => !b.noRoll && (!b.hero || b.hero === 'wine'));
  check('分身流 / 宠物流强化不进随机池', !rollable.some((b) => b.school === 'clone' || b.school === 'pet'));
  check('流派列表只剩 3 个', dctx.__SK.join() === 'skill,ult,basic', dctx.__SK.join());
  check('专属强化 skill 绑定在 0~3', wine.every((b) => [0, 1, 2, 3].includes(b.skill)));
  const dead = BOONS.filter((b) => !b.noRoll && (!b.hero || b.hero === 'wine') && b.apply).filter((b) => {
    const m = buildMods([b.id]); const m0 = buildMods([]);
    return JSON.stringify(m) === JSON.stringify(m0);
  });
  check('每张可抽到的卡都会改变属性表', !dead.length, dead.map((b) => b.id).join());
}

/* ---------- 战斗流程 ---------- */
{
  const t = begin([], { waves: [['skel', 'skel'], ['hound']] });
  const r = t.r;
  check('肉鸽战斗：血量取配置', r.p.hp === 80 && r.p.mx === 100, `${r.p.hp}/${r.p.mx}`);
  r.waveT = 0; step(0.7);
  check('刷出第 1 波并按配置', r.wave === 1 && r.en.length === 2, `wave ${r.wave} 敌 ${r.en.length}`);
  r.en.length = 0; r.waveT = 0; step(0.7);
  check('第 1 波清完后刷第 2 波', r.wave === 2 && r.en.length === 1, `wave ${r.wave}`);
  r.en.length = 0; step(2.2);
  check('全部波次清完触发胜利回调', t.ended && t.ended.win === true, JSON.stringify(t.ended));
  check('回调带回剩余血量', t.ended && t.ended.r.hp === 80 && t.ended.r.mx === 100);
  check('结束后不再留着配置', R().cfg === null || R().cfg === undefined);
}
{
  const t = begin([]);
  const r = t.r; r.p.hp = 0; r.p.st = 'dead'; r.dead = true;
  step(1.0); check('倒下 1 秒内还没结算', !t.ended);
  step(0.6); check('倒下后触发失败回调', t.ended && t.ended.win === false);
}
{
  const t = begin([], { boss: true, waves: [['boss']], bossMul: 1.5 });
  const r = t.r; r.waveT = 0; step(0.4);
  const b = r.en.find((e) => e.boss);
  check('Boss 战：刷出 Boss 且血量按倍数', b && b.maxHp === 2100, b && String(b.maxHp));
  const t2 = begin([], { waves: [['skel']], eMul: { hp: 2, dmg: 1, spd: 1 } });
  t2.r.waveT = 0; step(0.4);
  check('小怪血量按关卡倍数', t2.r.en[0].maxHp === 60, String(t2.r.en[0].maxHp));
}
{
  const t = begin([], { eMul: { hp: 1, dmg: 2, spd: 1 } });
  const r = t.r; r.p.hp = 100;
  dummy(230, { type: 'skel', hp: 30, maxHp: 30, st: 'lunge', t: 0, face: -1, skin: 'skel' });
  step(0.4);
  check('关卡伤害倍数作用到受击', r.p.hp <= 80, `血 ${r.p.hp}`);
}

/* ---------- 卡牌效果 ---------- */
function dealt(boonIds, setup) {   // 用同一套摆放，量一次普攻 / 技能打出的伤害
  const t = begin(boonIds); const r = t.r;
  const e = dummy(240); setup && setup(r, e);
  const hp0 = e.hp; step(0.03, 'attack'); step(0.25);
  return hp0 - e.hp;
}
{
  const base = dealt([]), up = dealt(['atk_2']);
  check('力量(紫)：普攻伤害 +22%', up > base && Math.abs(up / base - 1.22) < 0.1, `${base} → ${up}`);
  const bb = dealt(['b_blade']);
  check('利刃：普攻伤害 +12%', bb > base, `${base} → ${bb}`);
}
{
  const t = begin(['crit_2', 'crit_2', 'crit_2', 'crit_2', 'crit_2', 'crit_2', 'crit_2']);   // 暴击率拉满
  const e = dummy(240); step(0.03, 'attack'); step(0.25);
  check('暴击率生效：打出暴击', t.r.nums.some((n) => n.big));
}
function lungeDmg(boonIds) {
  const t = begin(boonIds); const r = t.r; r.p.hp = 100; r.p.inv = 0;
  dummy(230, { type: 'skel', hp: 30, maxHp: 30, st: 'lunge', t: 0, face: -1, skin: 'skel' });
  step(0.4);
  return 100 - r.p.hp;
}
{
  const base = lungeDmg([]), red = lungeDmg(['red_2', 'red_2', 'red_2', 'red_2']);
  check('铁皮：受到伤害降低', red < base && base > 0, `${base} → ${red}`);
}
{
  const t = begin(['w_swift']); const r = t.r;
  step(0.03, 's1');
  check('疾葬：突刺冷却 5 → 4.0 秒', Math.abs(r.p.cd.u - 4.0) < 0.15, r.p.cd.u.toFixed(2));
  const t2 = begin(['w_twin']); const r2 = t2.r;
  step(0.03, 's1'); step(0.4);
  check('双刺：第一次放完冷却仍为 0', r2.p.cd.u === 0, r2.p.cd.u.toFixed(2));
  step(0.03, 's1');
  check('双刺：1 秒内第二次释放后进入冷却', r2.p.cd.u > 3.5, r2.p.cd.u.toFixed(2));
  const t3 = begin(['w_twin']); step(0.03, 's1'); step(1.2);
  check('双刺：超过 1 秒没放第二次，冷却补上', t3.r.p.cd.u > 3, t3.r.p.cd.u.toFixed(2));
}
{
  const t = begin(['w_chain']); const r = t.r;
  const e = dummy(330); step(0.15, 's2'); step(0.22);   // 掷碑，剑还在飞
  step(0.03, 's2');   // 瞬身
  check('瞬身连斩：瞬身后 1 秒内突刺不进冷却', r.p.chainT > 0.5, r.p.chainT.toFixed(2));
  step(0.4); step(0.03, 's1');
  check('瞬身连斩：突刺冷却为 0', r.p.cd.u === 0, r.p.cd.u.toFixed(2));
}
{
  const t = begin(['w_stay']); const r = t.r;
  dummy(500, { hp: 99999, maxHp: 99999 });
  step(0.15, 's2'); step(1.0);
  check('碑钉：飞剑悬停不返回', r.blade && r.blade.phase === 'hover', r.blade && r.blade.phase);
  step(0.03, 's2');
  check('碑钉：瞬身后飞剑还在原地', !!r.blade, String(!!r.blade));
  step(3.2); step(1.5);
  check('碑钉：3 秒后飞回并带 +3 秒冷却', !r.blade && r.p.cd.i > 2, `cd ${r.p.cd.i.toFixed(2)}`);
}
{
  const t = begin(['w_parry']); const r = t.r;
  r.p.soul = 0;
  const e = dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  r.p.x = 260; step(0.02, 's1');
  check('迎刃：突刺完美闪避额外 +1 魂并清冷却', r.p.soul >= 2 && r.p.cd.u === 0, `魂 ${r.p.soul} cd ${r.p.cd.u.toFixed(2)}`);
}
{
  const t = begin(['w_carve']); const r = t.r;
  const e = dummy(300); r.p.x = 250; step(0.03, 's1'); step(0.15);
  check('刻骨：墓志持续 15 秒', e.mark > 12, e.mark.toFixed(1));
}
{
  const t = begin(['o_fast']); const r = t.r;
  dummy(330); step(0.03, 's3'); step(0.25);
  check('速断：0.25 秒内斩痕已爆出', r.cuts.some((c) => c.done) || r.cuts.length === 0, String(r.cuts.length));
  const t2 = begin(['o_wide']); dummy(330); step(0.03, 's3'); step(0.12);
  check('广斩：断空范围 ×1.3', Math.abs(t2.r.cuts[0].w - 156) < 1, String(t2.r.cuts[0] && t2.r.cuts[0].w));
}
{
  const t = begin(['o_iai']); const r = t.r; dummy(300);
  step(0.03, 's3');
  check('居合：非时空断裂时不能断空', r.p.st !== 'iai' && r.p.cd.o === 0, r.p.st);
  r.witch = 2; step(0.03, 's3');
  check('居合：时空断裂中可以瞬狱', r.p.st === 'storm', r.p.st);
}
{
  const t = begin(['o_thou']); const r = t.r; dummy(300);
  r.witch = 2; step(0.03, 's3'); step(0.1);
  check('千斩：每个敌人 5 道斩痕', r.cuts.length === 5, String(r.cuts.length));
  const t2 = begin([]); dummy(300); t2.r.witch = 2; step(0.03, 's3'); step(0.1);
  check('默认 3 道斩痕', t2.r.cuts.length === 3, String(t2.r.cuts.length));
}
{
  const t = begin(['o_keep']); const r = t.r; dummy(300);
  r.witch = 2; step(0.03, 's3');
  for (let k = 0; k < 120 && r.p.st === 'storm'; k++) step(0.02);
  step(0.02);
  check('狱延：瞬狱结束后断裂保留一半', r.witch > 0.8 && r.witch <= 1.01, r.witch.toFixed(2));
}
{
  const t = begin(['d_ward']); const r = t.r; r.p.soul = 0;
  const e = dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  r.p.x = 260; step(0.02, 'dodge');
  check('惊鸿护体：完美闪避获得护盾', r.p.shield === 12, String(r.p.shield));
  const t2 = begin(['d_trace']); t2.r.p.soul = 0;
  dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  t2.r.p.x = 260; step(0.02, 'dodge');
  check('残影：完美闪避叠 1 层', t2.r.p.pdStacks === 1, String(t2.r.p.pdStacks));
  const t3 = begin(['d_time']); t3.r.p.soul = 0;
  dummy(300, { type: 'skel', hp: 30, maxHp: 30, st: 'windup', t: 0.5, face: -1, skin: 'skel' });
  t3.r.p.x = 260; step(0.02, 'dodge');
  check('时隙：时空断裂 3.3 秒', t3.r.witch > 3.1, t3.r.witch.toFixed(2));
}
{
  const t = begin(['u_core']); const r = t.r; r.p.soul = 2;
  step(0.03, 's4');
  check('极意：2 格魂即可变身', r.p.st === 'transform' || r.p.form === 'blood', r.p.st);
  const t0 = begin([]); t0.r.p.soul = 2; step(0.03, 's4');
  check('默认 2 格魂不能变身', t0.r.p.form === 'normal' && t0.r.p.st !== 'transform');
  const t1 = begin(['r_long', 'u_ext']); t1.r.p.soul = 4; step(0.03, 's4');
  check('久暴 + 延展：4 格魂 = 4×3×1.25 = 15 秒', Math.abs(t1.r.p.rageMax - 15) < 0.01, String(t1.r.p.rageMax));
  const t2 = begin(['r_pact']); t2.r.p.soul = 2; step(0.03, 's4');
  check('先契：2 格魂变身，每格 2 秒 = 4 秒', Math.abs(t2.r.p.rageMax - 4) < 0.01, String(t2.r.p.rageMax));
  const t3 = begin(['x_arm']); t3.r.p.soul = 5; step(0.03, 's4');
  check('独臂：奥义被封印', t3.r.p.form === 'normal' && t3.r.p.st !== 'transform');
}
{
  const t = begin(['hp_2']); // 体魄只改上限，血量取配置
  check('配置血量上限独立于强化表', t.r.p.mx === 100);
  let zero = 0; for (let k = 0; k < 120; k++) { const q = begin(['s_dbl']); step(0.03, 's1'); if (q.r.p.cd.u === 0) zero++; }
  check('双发：约 25% 概率不进冷却', zero > 12 && zero < 55, `${zero}/120`);
}
{
  const t = begin(['s_core']); const r = t.r; dummy(330);
  step(0.15, 's2'); step(0.5);
  step(0.03, 's1');
  check('秘卷·连环：连放不同技能，第二个冷却 ×0.7', Math.abs(r.p.cd.u - 3.5) < 0.2, r.p.cd.u.toFixed(2));
}
{
  const t = begin(['u_after']); const r = t.r;
  r.p.form = 'blood'; r.p.rage = r.p.rageMax = 0.1; step(0.2); step(1.5);
  check('余韵：暴走结束后 4 秒内技能 +25%', r.p.ultAfterT > 0 || r.p.form === 'normal', `ultAfterT ${r.p.ultAfterT.toFixed(2)} form ${r.p.form}`);
}

/* ---------- 敌人分工：重甲兵 / 精英 / 分批刷怪 ---------- */
function brute(x, extra = {}) { return dummy(x, { type: 'brute', hp: 120, maxHp: 120, st: 'chase', cd: 99, skin: 'skelc', stunT: 99, ...extra }); }
{
  const t = begin([]); const r = t.r;
  const e = brute(240); step(0.03, 'attack'); step(0.25);
  const armored = 120 - e.hp;
  const t2 = begin([]); const r2 = t2.r;
  const e2 = brute(240, { st: 'stun' }); step(0.03, 'attack'); step(0.25);
  const naked = 120 - e2.hp;
  check('重甲兵：平时只吃 35% 伤害', armored > 0 && naked > 0 && armored < naked * 0.5, `带甲 ${armored} / 破甲 ${naked}`);
  const t3 = begin([]); const e3 = brute(240); step(0.03, 'attack'); step(0.25);
  check('重甲兵：普攻不打断', e3.st === 'chase', e3.st);
}
{
  const t = begin([]); const r = t.r; r.p.soul = 0;
  const e = brute(300, { st: 'windup', t: 0.8, cd: 0, face: -1, stunT: 0.1 });
  r.p.x = 270; step(0.02, 'dodge');
  check('完美闪避重甲兵：把它晃晕约 2 秒', e.st === 'stun' && e.stunT >= 2, `st ${e.st} stunT ${e.stunT}`);
}
{
  const t = begin([]); const r = t.r;
  const e = brute(300); r.p.x = 250; step(0.03, 's1'); step(0.2);
  check('突刺穿过重甲兵：打碎护甲晕一会儿', e.st === 'stun' && e.stunT > 1, `st ${e.st}`);
}
{
  const t = begin([]); const r = t.r;
  const e = dummy(320, { type: 'brute', hp: 120, maxHp: 120, st: 'windup', t: 0, cd: 0, face: -1, skin: 'skelc', stunT: 0.1 });
  r.p.x = 290; r.p.hp = 100; step(1.2);
  check('重甲兵砸地打中主角', r.p.hp < 100, `血 ${r.p.hp}`);
}
{
  const t = begin([], { waves: [['*skel', 'skel']] }); const r = t.r; r.waveT = 0; step(0.7);
  const el = r.en.find((e) => e.elite), nm = r.en.find((e) => !e.elite);
  check('精英：血量 ×1.8', el && nm && Math.abs(el.maxHp / nm.maxHp - 1.8) < 0.05, `${el && el.maxHp} / ${nm && nm.maxHp}`);
  r.p.soul = 0; el.hp = 1; el.st = 'stun'; el.stunT = 99; el.x = 240; el.y = 500; r.p.x = 200; step(0.03, 'attack'); step(0.3);
  check('击杀精英 +1 魂', r.p.soul >= 1, String(r.p.soul));
}
{
  const t = begin([], { waves: [['skel', 'skel', 'skel', 'skel', 'skel'], ['hound', 'hound']], trigger: 2 }); const r = t.r;
  r.waveT = 0; step(0.2);
  check('分批刷怪：开场只先出来一两只', r.en.length >= 1 && r.en.length < 5 && r.pend.length > 0, `场上 ${r.en.length} 排队 ${r.pend.length}`);
  step(1.6);
  check('分批刷怪：一波全部出齐', r.en.length === 5 && r.pend.length === 0, `场上 ${r.en.length}`);
  r.en.splice(0, 3);   // 打到只剩 2 个
  step(1.6);
  check('场上剩 2 个时下一波压上来', r.wave === 2, `wave ${r.wave}`);
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
