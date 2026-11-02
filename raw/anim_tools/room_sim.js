// 无界面跑 room.js 的逻辑：桩掉绘制与输入，用简单机器人打 90 秒，统计击杀/受伤/完美闪避/各状态是否都走到
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Promise, Set, Map,
  W: 1280, H: 720, VW: 1280,
  window: {},
  document: { createElement: () => ({ getContext: () => ctxStub, width: 0, height: 0 }) },
  params: new Map([['demo', null]]),
  ctx: ctxStub,
  img: () => ({ complete: true, naturalWidth: 64, width: 64, height: 64 }),
  ready: () => true, preload: () => Promise.resolve(),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), rnd: (a, b) => a + Math.random() * (b - a),
  lerp: (a, b, t) => a + (b - a) * t, sign: (v) => (v < 0 ? -1 : 1),
  pressed: new Set(), pulse: new Set(), virt: {}, keys: new Set(),
  drawText: noop, setScene: noop, titleScene: {},
};
sandbox.window.HERO2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/hero2/manifest.js'), 'utf8').replace(/^window\.HERO2 = /, '').replace(/;\s*$/, ''));
sandbox.input = {
  act: (n) => !!sandbox.virt[n],
  hit: (n) => sandbox.pulse.has(n),
};
sandbox.params.get = () => null;
vm.createContext(sandbox);
// R 在闭包里拿不到：加载时替换出口那一行，顺带把 R 挂出来
const src = fs.readFileSync(process.env.ROOM_JS || path.join(ROOT, 'js/room.js'), 'utf8').replace('window.roomScene = roomScene;', 'window.roomScene = roomScene; window.__R = R; window.__ROOM = ROOM;');
vm.runInContext(src, sandbox, { filename: 'room.js' });
const scene = sandbox.window.roomScene;
scene.enter();
const R = sandbox.window.__R;
const seen = new Set(), stats = { perfect: 0, hurt: 0, hits: 0 };
let lastBanner = 0, lastHp = 100, kills = 0, dmg = 0, atkFrames = 0, near = 0;
const hpPrev = new Map(), cnt = {}, msgs = {};
let lastSt = '', maxSoul = 0, lastMsg = null, crits = 0;
const DT = 1 / 60;
const SECS = Number(process.env.SECS) || 90;
for (let f = 0; f < 60 * SECS; f++) {
  for (const k of Object.keys(sandbox.virt)) delete sandbox.virt[k];
  sandbox.pulse.clear();
  const p = R.p;
  if (R.dead) { sandbox.pulse.add('restart'); }
  const tgt = R.en.slice().sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y))[0];
  if (tgt) {
    let dx = tgt.x - p.x, dy = tgt.y - p.y;
    // 目标高出一层以上：先去够得着的那层平台当台阶
    if (dy < -100) {
      const steps = sandbox.window.__ROOM.plats.filter((q) => q.y < p.y - 20 && q.y > p.y - 120);
      const st = steps.sort((a, b) => Math.abs(a.x + a.w / 2 - tgt.x) - Math.abs(b.x + b.w / 2 - tgt.x))[0];
      if (st) { dx = st.x + st.w / 2 - p.x; dy = st.y - p.y; }
    }
    const danger = R.en.find((e) => e.st === 'windup' && e.t > 0.42 && Math.abs(e.x - p.x) < 100 && Math.abs(e.y - p.y) < 40);
    if (danger && f % 2 === 0) sandbox.pulse.add('dodge');
    else if (Math.abs(dx) > 30) sandbox.virt[dx > 0 ? 'right' : 'left'] = true;
    if (dy < -40 && p.ground && f % 20 === 0) sandbox.pulse.add('jump');
    if (dy < -40 && !p.ground && p.vy < 0) sandbox.virt.jump = true;
    if (dy < -40 && !p.ground && p.vy > 0 && !p.dj) sandbox.pulse.add('jump');
    if (dy > 30 && p.ground && f % 30 === 0) { sandbox.virt.down = true; sandbox.pulse.add('jump'); }
    if (Math.abs(dx) < 50 && Math.abs(dy) < 30 && f % 5 === 0) sandbox.pulse.add('attack');
    if (!p.ground && Math.abs(dx) < 16 && dy > 10) { sandbox.virt.down = true; sandbox.pulse.add('attack'); }
    // 技能：常态 掷碑→瞬身→突刺→（断裂中）瞬狱，魂够 3 格变身；变身后碑落/血爪拖行/裂地，血契剩三成时「葬」
    if (p.cd && f % 6 === 0) {
      const ahead = (e, r) => (e.x - p.x) * Math.sign(dx || 1) > -6 && Math.abs(e.x - p.x) < r && Math.abs(e.y - p.y) < 24;
      const live = R.en.filter((e) => e.st !== 'dead');
      const blade = R.blade;
      if (p.form === 'normal') {
        if (p.soul >= 3) sandbox.pulse.add('s4');
        else if (blade && (blade.phase === 'hover' || (dy < -50 && blade.y < p.y - 60))) sandbox.pulse.add('s2');   // 瞬身过去
        else if (!blade && p.cd.i <= 0 && dy < -50 && (p.ground ? dy > -110 : p.dj && p.vy > -60)) { sandbox.virt.up = true; sandbox.pulse.add('s2'); }   // 斜上扔，瞬身上高台（太高就先二段跳到顶点再扔）
        else if (R.witch > 0 && p.cd.o <= 0) sandbox.pulse.add('s3');   // 瞬狱
        else if (!blade && p.cd.i <= 0 && live.some((e) => ahead(e, 170))) sandbox.pulse.add('s2');
        else if (p.cd.u <= 0 && live.some((e) => e.st === 'stun' && ahead(e, 160))) sandbox.pulse.add('s1');
        else if (p.cd.o <= 0 && live.some((e) => ahead(e, 140))) sandbox.pulse.add('s3');
      } else if (p.form === 'blood') {
        if (p.pact < p.pactMax * 0.3) sandbox.pulse.add('s4');
        else if (p.cd.u <= 0 && live.some((e) => e.mark > 0)) sandbox.pulse.add('s1');
        else if (p.cd.i <= 0 && live.some((e) => ahead(e, 120))) sandbox.pulse.add('s2');
        else if (p.cd.o <= 0 && live.some((e) => ahead(e, 160))) sandbox.pulse.add('s3');
      }
    }
  }
  scene.update(DT);
  for (const e of R.en) { const h = hpPrev.get(e) ?? e.hp; if (e.hp < h) dmg += h - e.hp; hpPrev.set(e, e.hp); }
  if (p.st === 'atk') atkFrames++;
  if (f % 900 === 0) console.log(`t=${f/60}s hero(${p.x|0},${p.y|0}) ${p.st} ground=${p.ground} | target ${tgt ? `(${tgt.x|0},${tgt.y|0}) ${tgt.st}` : '-'} | enemies ${R.en.length}`);
  if (tgt && Math.abs(tgt.x - p.x) < 50 && Math.abs(tgt.y - p.y) < 30) near++;
  if (p.st !== lastSt) { cnt[p.st] = (cnt[p.st] || 0) + 1; lastSt = p.st; }
  if (p.soul > maxSoul) maxSoul = p.soul;
  if (R.msg && R.msg !== lastMsg) { lastMsg = R.msg; msgs[R.msg.text] = (msgs[R.msg.text] || 0) + 1; }
  for (const n of R.nums) if (n.big && !n.seen) { n.seen = true; crits++; }
  seen.add(p.st + (p.form === 'blood' ? '(血)' : ''));
  for (const e of R.en) seen.add('hound:' + e.st);
  if (R.banner > lastBanner + 0.5) stats.perfect++;
  lastBanner = R.banner;
  if (p.hp < lastHp) stats.hurt++;
  lastHp = p.hp;
}
console.log('waves', R.wave, 'kills', R.kills, 'hp', R.p.hp, 'dead', R.dead);
console.log('damage dealt', dmg, 'frames attacking', atkFrames, 'frames near target', near);
console.log('perfect dodges', stats.perfect, 'times hurt', stats.hurt);
console.log('states seen', [...seen].sort().join(' '));
console.log('state entries', JSON.stringify(cnt));
console.log('max soul', maxSoul.toFixed(2), 'crits', crits, 'messages', JSON.stringify(msgs));
