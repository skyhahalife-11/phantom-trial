'use strict';
/* 切片 1：大房间试玩。独立场景，不接肉鸽流程。
   世界画在 640×360 的低分辨率缓冲上，再整数放大 2 倍到 1280×720，保证像素清晰。
   坐标单位都是缓冲像素；y 向下，角色的 y 是脚底。
   整个文件包在闭包里：各脚本共用全局作用域，避免和 combat.js 的同名函数互相覆盖。 */
(() => {

const RB_H = 360, RB_S = H / RB_H;
let RB_W = 640;   // 宽屏手机上随 VW 变宽，见 syncWidth
const rbuf = document.createElement('canvas');
rbuf.width = RB_W; rbuf.height = RB_H;
const rx = rbuf.getContext('2d');
rx.imageSmoothingEnabled = false;
function syncWidth() {
  const w = Math.round(VW / RB_S);
  if (w !== RB_W) { RB_W = w; rbuf.width = w; rx.imageSmoothingEnabled = false; }
}

const HERO_A = window.HERO2 || {};
const COMBO_STEP = [{ f0: 0, hit: 2 }, { f0: 4, hit: 1 }, { f0: 8, hit: 1 }];
const ARC = { c0: [-110, 45, 1], c1: [-75, 55, 0.38], c2: [70, -100, 1], air: [-80, 60, 0.9], t_sweep: [-80, 50, 0.45] };

const P_RUN = 150, P_ACC = 1400, P_GRAV = 1000, P_JUMP = 360, P_DJUMP = 320, P_MAXFALL = 520;
const DASH_V = 430, DASH_T = 0.2, DASH_INV = 0.24, DASH_CD = 0.32;
/* 完美闪避 → 时空断裂（崩坏3式）：敌人降到 0.2 倍速 2.2 秒，主角照常行动；断裂期间不能再次触发，避免无限续 */
const WITCH_SLOW = 0.2, WITCH_T = 2.2, WITCH_FADE = 0.3;
const BUF = 0.12, COYOTE = 0.08;   // 预输入：按键提前 0.12 秒也算数；土狼时间：走出平台边 0.08 秒内还能起跳
const touchOn = () => !!(window.touchUI && touchUI.on);
const assistOn = () => touchOn() && touchUI.opt.assist;
const buzz = (ms) => { if (window.touchUI) touchUI.buzz(ms); };
const HOUND = {
  hp: 60, dmg: 14, walk: 40, run: 120, sight: 240, windup: 0.55, leapVx: 280, leapVy: -230, recover: 0.7,
  anim: { idle: [6, 64, 32], walk: [12, 64, 32], run: [5, 67, 32], jump: [6, 65, 48] },
};

/* 地面 500；四层平台每层高 64，单跳 65 像素、二段跳合计约 115 像素 */
const ROOM = {
  w: 2560, h: 540, ground: 500,
  plats: [
    { x: 260, y: 436, w: 160 }, { x: 520, y: 372, w: 128 }, { x: 760, y: 436, w: 192 },
    { x: 1040, y: 372, w: 160 }, { x: 1290, y: 308, w: 128 }, { x: 1520, y: 436, w: 224 },
    { x: 1830, y: 372, w: 160 }, { x: 2080, y: 308, w: 128 }, { x: 2280, y: 436, w: 160 },
  ],
  props: [
    ['tree-1', 120], ['stone-1', 470], ['statue', 700], ['bush-large', 980], ['tree-2', 1250], ['stone-2', 1450],
    ['bush-small', 1700], ['statue', 1900], ['tree-3', 2150], ['stone-3', 2380], ['bush-large', 2500],
  ],
};

const R = {};

function rImg(p) { return img(p); }
function rReset() {
  R.p = {
    x: 120, y: ROOM.ground, vx: 0, vy: 0, face: 1, ground: true, dj: false, airDash: true, drop: 0,
    st: 'idle', t: 0, hp: 100, mx: 100, inv: 0, dashCd: 0, combo: -1, queued: false, comboGap: 9, hitDone: false,
    runT: 0, dashEnd: 9, airCd: 0, perfectUsed: false, coy: 0, buf: { dodge: 0, jump: 0, attack: 0 },
  };
  R.cam = { x: 0, y: ROOM.h - RB_H };
  R.en = []; R.fx = []; R.nums = [];
  R.wave = 0; R.kills = 0; R.waveT = 1.2;
  R.stop = 0; R.shake = 0; R.witch = Number(params.get('witch')) || 0; R.banner = 0;   // witch=秒：调试用，开局直接进时空断裂
  R.time = 0; R.dead = false;
}

/* ---------- 碰撞 ---------- */
function landOn(o, prevY, canDrop) {
  if (o.y >= ROOM.ground) { o.y = ROOM.ground; return true; }
  if (o.vy < 0 || (canDrop && o.drop > 0)) return false;
  for (const pl of ROOM.plats) {
    if (o.x >= pl.x - 4 && o.x <= pl.x + pl.w + 4 && prevY <= pl.y + 0.5 && o.y >= pl.y) { o.y = pl.y; return true; }
  }
  return false;
}
function standingOnPlat(o) { return ROOM.plats.some((pl) => o.y === pl.y && o.x >= pl.x - 4 && o.x <= pl.x + pl.w + 4); }
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const pBox = (p) => ({ x0: p.x - 8, x1: p.x + 8, y0: p.y - 36, y1: p.y });
const eBox = (e) => ({ x0: e.x - 18, x1: e.x + 18, y0: e.y - 24, y1: e.y });

/* ---------- 玩家 ---------- */
function setSt(p, st) { p.st = st; p.t = 0; p.hitDone = false; }

function startCombo(p, step) {
  setSt(p, 'atk'); p.combo = step; p.queued = false; p.vx = p.face * 70;
}

/* 预输入在顿帧/慢动作之前收集，按键不会因为卡肉的那几帧被吞掉 */
function bufferInput(p, dt) {
  for (const k of ['dodge', 'jump', 'attack']) p.buf[k] = input.hit(k) ? BUF : p.buf[k] - dt;
}
const want = (p, k) => p.buf[k] > 0;
const use = (p, k) => { p.buf[k] = 0; };

/* 没按方向时出手，自动转向身边最近的敌人（崩坏3式） */
function autoFace(p, dir) {
  if (dir) return;
  let best = null;
  for (const e of R.en) {
    const dx = e.x - p.x;
    if (e.st === 'dead' || Math.abs(e.y - p.y) > 48 || Math.abs(dx) > 110) continue;
    if (best === null || Math.abs(dx) < Math.abs(best)) best = dx;
  }
  if (best !== null && Math.abs(best) > 4) p.face = sign(best);
}

function playerUpdate(p, dt) {
  const L = input.act('left'), Rt = input.act('right'), D = input.act('down');
  const dir = (Rt ? 1 : 0) - (L ? 1 : 0);
  p.t += dt; p.inv = Math.max(0, p.inv - dt); p.dashCd -= dt; p.comboGap += dt; p.dashEnd += dt; p.airCd -= dt; p.drop -= dt;
  if (p.st === 'dead') { p.vx *= 0.9; phys(p, dt); return; }

  const busy = ['atk', 'airatk', 'runatk', 'dash', 'hurt', 'plunge', 'land'].includes(p.st);
  // 冲刺（带无敌，完美闪避在敌人攻击判定里结算）
  if (want(p, 'dodge') && p.dashCd <= 0 && p.st !== 'hurt' && (p.ground || p.airDash)) {
    use(p, 'dodge');
    const dd = virt.dodgeDir || dir;   // 触屏滑动闪避带方向
    virt.dodgeDir = 0;
    if (dd) p.face = dd;
    if (!p.ground) p.airDash = false;
    setSt(p, 'dash'); p.vx = p.face * DASH_V; p.vy = 0; p.inv = DASH_INV; p.dashCd = DASH_CD; p.perfectUsed = false;
    R.fx.push({ k: 'ghost', x: p.x, y: p.y, face: p.face, t: 0 });
    checkPerfect(p);
  }
  // 跳跃 / 二段跳 / 穿落
  if (want(p, 'jump') && !['hurt', 'dash'].includes(p.st)) {
    if (p.ground && D && standingOnPlat(p)) { use(p, 'jump'); p.drop = 0.25; p.ground = false; p.coy = 0; p.vy = 40; setSt(p, 'fall'); }
    else if (p.ground || p.coy > 0) { use(p, 'jump'); p.vy = -P_JUMP; p.ground = false; p.coy = 0; setSt(p, 'jump'); }
    else if (!p.dj) { use(p, 'jump'); p.dj = true; p.vy = -P_DJUMP; setSt(p, 'djump'); }
  }
  // 攻击
  if (want(p, 'attack') && p.st !== 'hurt' && p.st !== 'dash') {
    let done = true;   // 没出成的按键留在预输入里，当前动作一结束就接上
    if (!p.ground) {
      if (D && p.st !== 'plunge') { setSt(p, 'plunge'); p.vy = 420; p.vx *= 0.3; }
      else if (p.st !== 'plunge' && p.st !== 'airatk' && p.airCd <= 0) { autoFace(p, dir); setSt(p, 'airatk'); p.airCd = 0.12; }
      else done = false;
    } else if (p.st === 'atk') {
      p.queued = true;
    } else if (!busy && (p.runT > 0.25 || p.dashEnd < 0.2)) {
      setSt(p, 'runatk'); p.vx = p.face * 230;
    } else if (!busy) {
      autoFace(p, dir);
      startCombo(p, p.comboGap < 0.4 && p.combo >= 0 && p.combo < 2 ? p.combo + 1 : 0);
    } else done = false;
    if (done) use(p, 'attack');
  }

  // 各状态
  switch (p.st) {
    case 'dash':
      p.vy = 0;
      if (p.t >= DASH_T) { p.vx = p.face * P_RUN * 0.6; p.dashEnd = 0; setSt(p, p.ground ? 'idle' : 'fall'); }
      break;
    case 'atk': {
      const s = COMBO_STEP[p.combo], fps = 14, n = 4;
      p.vx *= Math.pow(0.002, dt);
      if (!p.hitDone && p.t >= s.hit / fps) { p.hitDone = true; doHit(p, 'c' + p.combo); }
      if (p.t >= n / fps) {
        p.comboGap = 0;
        if (p.queued && p.combo < 2) startCombo(p, p.combo + 1);
        else { setSt(p, 'idle'); if (p.combo === 2) p.combo = -1; }
      }
      break;
    }
    case 'runatk':
      p.vx *= Math.pow(0.02, dt);
      if (!p.hitDone && p.t >= 1 / 14) { p.hitDone = true; doHit(p, 'run'); }
      if (p.t >= 4 / 14) setSt(p, 'idle');
      break;
    case 'airatk':
      if (!p.hitDone && p.t >= 2 / 16) { p.hitDone = true; doHit(p, 'air'); }
      if (p.t >= 4 / 16) setSt(p, 'fall');
      break;
    case 'plunge':
      p.vy = 420;
      plungeHit(p);
      break;
    case 'land':
      if (p.t >= 0.12) setSt(p, 'idle');
      break;
    case 'hurt':
      if (p.t >= 0.3) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    default: {
      // 自由移动：idle / run / jump / djump / fall
      const tv = dir * P_RUN;
      p.vx += clamp(tv - p.vx, -P_ACC * dt, P_ACC * dt);
      if (dir) p.face = dir;
      if (p.ground) setSt2(p, dir ? 'run' : 'idle');
      else if (p.vy > 0 && p.st !== 'djump') setSt2(p, 'fall');
      if (!input.act('jump') && p.vy < -120) p.vy += P_GRAV * dt * 1.2;   // 松开跳跃键提前下落，跳的高度可控
    }
  }
  p.runT = p.st === 'run' ? p.runT + dt : 0;
  phys(p, dt);
}
function setSt2(p, st) { if (p.st !== st) setSt(p, st); }

function phys(p, dt) {
  const prevY = p.y;
  if (p.st !== 'dash') p.vy = Math.min(P_MAXFALL, p.vy + P_GRAV * dt);
  p.x = clamp(p.x + p.vx * dt, 10, ROOM.w - 10);
  p.y += p.vy * dt;
  const was = p.ground;
  p.ground = landOn(p, prevY, true);
  p.coy = p.ground ? COYOTE : p.coy - dt;
  if (p.ground) {
    p.vy = 0; p.dj = false; p.airDash = true;
    if (!was) {
      if (p.st === 'plunge') { setSt(p, 'land'); R.shake = Math.max(R.shake, 2); }
      else if (['jump', 'djump', 'fall', 'airatk'].includes(p.st)) setSt(p, 'land');
    }
  } else if (was && p.st !== 'jump' && p.st !== 'djump' && p.vy >= 0 && !['dash', 'hurt'].includes(p.st)) {
    setSt(p, 'fall');
  }
}

/* 攻击判定框（相对脚底，朝右为正） */
const HITBOX = {
  c0: { x0: 2, x1: 52, y0: -46, y1: -2, dmg: 10, kb: 70 },
  c1: { x0: 2, x1: 56, y0: -38, y1: -8, dmg: 12, kb: 90 },
  c2: { x0: -4, x1: 46, y0: -66, y1: 0, dmg: 16, kb: 40, launch: -290 },
  air: { x0: 0, x1: 50, y0: -46, y1: 6, dmg: 9, kb: 60 },
  run: { x0: 0, x1: 70, y0: -34, y1: -10, dmg: 14, kb: 140 },
};

function doHit(p, kind) {
  const h = HITBOX[kind];
  const box = p.face > 0
    ? { x0: p.x + h.x0, x1: p.x + h.x1, y0: p.y + h.y0, y1: p.y + h.y1 }
    : { x0: p.x - h.x1, x1: p.x - h.x0, y0: p.y + h.y0, y1: p.y + h.y1 };
  const arc = ARC[kind === 'run' ? 'c1' : kind];
  if (arc) R.fx.push({ k: 'arc', x: p.x, y: p.y, face: p.face, arc, t: 0 });
  if (kind === 'run') R.fx.push({ k: 'streak', x: p.x, y: p.y - 22, face: p.face, t: 0 });
  let n = 0;
  for (const e of R.en) {
    if (e.st === 'dead' || !overlap(box, eBox(e))) continue;
    hurtEnemy(e, h.dmg, p.face * h.kb, h.launch);
    n++;
  }
  if (n) { R.stop = 0.06; R.shake = Math.max(R.shake, kind === 'c2' ? 3 : 2); }
}

function plungeHit(p) {
  const box = { x0: p.x - 14, x1: p.x + 14, y0: p.y - 14, y1: p.y + 10 };
  for (const e of R.en) {
    if (e.st === 'dead' || !overlap(box, eBox(e))) continue;
    hurtEnemy(e, 14, 0, -120);
    p.vy = -330; p.dj = false; p.airDash = true; setSt(p, 'jump');
    R.stop = 0.05; R.shake = Math.max(R.shake, 2);
    R.fx.push({ k: 'spark', x: p.x, y: p.y, t: 0, n: 7 });
    return;
  }
}

function hurtPlayer(p, dmg, fromX) {
  if (p.inv > 0 || p.st === 'dead') return false;
  p.hp = Math.max(0, p.hp - dmg);
  const away = p.x < fromX ? -1 : 1;
  p.vx = away * 160; p.vy = -150; p.ground = false; p.coy = 0; p.inv = 0.9; p.combo = -1;
  setSt(p, 'hurt');
  buzz(60);
  R.shake = 4; R.stop = 0.08;
  R.nums.push({ x: p.x, y: p.y - 44, v: dmg, c: '#ff6a6a', t: 0 });
  if (p.hp <= 0) { setSt(p, 'dead'); R.dead = true; }
  return true;
}

/* 完美闪避：冲刺起手时，若有敌人正处在出招判定中、或蓄力只剩最后 0.15 秒且在攻击范围内。
   触屏开了「完美闪避辅助」时窗口放宽到 0.24 秒、范围 110（约 1.5 倍）。 */
function checkPerfect(p) {
  const pb = pBox(p), win = assistOn() ? 0.24 : 0.15, reach = assistOn() ? 110 : 90;
  for (const e of R.en) {
    if (e.st === 'dead') continue;
    const near = Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < 50;
    const danger = (e.st === 'leap' && overlap(pb, leapBox(e))) || (e.st === 'windup' && e.t > HOUND.windup - win && near);
    if (danger) { triggerPerfect(p, e); return; }
  }
}
function triggerPerfect(p, e) {
  if (p.perfectUsed) return;
  p.perfectUsed = true;
  if (e) e.dodged = true;
  if (R.witch > 0) return;
  R.witch = WITCH_T; R.banner = 1.2; R.stop = 0.06;
  R.fx.push({ k: 'ring', x: p.x, y: p.y - 18, t: 0 });
  buzz(40);
  if (e) e.dodged = true;
}

/* ---------- 地狱犬 ---------- */
function spawnHound(x, y) {
  R.en.push({ x, y, vx: 0, vy: 0, face: -1, hp: HOUND.hp, st: 'patrol', t: 0, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0 });
}
const leapBox = (e) => ({ x0: e.x - 20, x1: e.x + 20, y0: e.y - 28, y1: e.y });

function hurtEnemy(e, dmg, kb, launch) {
  e.hp -= dmg; e.flash = 0.12;
  R.nums.push({ x: e.x, y: e.y - 34, v: dmg, c: '#fff2c0', t: 0 });
  R.fx.push({ k: 'spark', x: e.x, y: e.y - 16, t: 0, n: 5 });
  if (e.hp <= 0) {
    e.st = 'dead'; R.kills++;
    R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });
    return;
  }
  e.vx = kb;
  if (launch) { e.vy = launch; e.ground = false; e.st = 'air'; e.t = 0; }
  else if (e.st === 'air') { e.vy = Math.min(e.vy, -120); }
  else { e.st = 'stun'; e.t = 0; }
}

function houndUpdate(e, p, dt) {
  e.t += dt; e.flash -= dt; e.an += dt;
  const dx = p.x - e.x, dy = p.y - e.y, adx = Math.abs(dx);
  const seen = adx < HOUND.sight && Math.abs(dy) < 60 && !R.dead;
  switch (e.st) {
    case 'patrol':
      e.vx = e.pdir * HOUND.walk; e.face = e.pdir;
      if (Math.abs(e.x - e.home) > 80) e.pdir = sign(e.home - e.x);
      if (seen) { e.st = 'chase'; e.t = 0; }
      break;
    case 'chase':
      e.face = sign(dx); e.vx = e.face * HOUND.run;
      if (!seen) { e.st = 'patrol'; e.t = 0; e.home = e.x; }
      else if (adx < 115) { e.st = 'windup'; e.t = 0; e.vx = 0; e.dodged = false; e.buzzed = false; }
      break;
    case 'windup':
      e.vx = 0; e.face = sign(dx) || e.face;
      // 闪白那一刻手机轻震，眼睛没盯着也能靠手感反应
      if (!e.buzzed && e.t > HOUND.windup * 0.72 && adx < 160 && Math.abs(dy) < 60) { e.buzzed = true; buzz(20); }
      if (e.t >= HOUND.windup) { e.st = 'leap'; e.t = 0; e.vx = e.face * HOUND.leapVx; e.vy = HOUND.leapVy; e.ground = false; e.hitPlayer = false; }
      break;
    case 'leap':
      if (!e.hitPlayer && overlap(pBox(p), leapBox(e))) {
        if (p.st === 'dash' && p.inv > 0) { triggerPerfect(p, e); e.hitPlayer = true; }
        else if (hurtPlayer(p, HOUND.dmg, e.x)) e.hitPlayer = true;
      }
      if (e.ground && e.t > 0.1) { e.st = 'recover'; e.t = 0; e.vx = 0; }
      break;
    case 'recover':
      e.vx *= 0.8;
      if (e.t >= HOUND.recover) { e.st = seen ? 'chase' : 'patrol'; e.t = 0; }
      break;
    case 'stun':
      e.vx *= Math.pow(0.01, dt);
      if (e.t >= 0.28) { e.st = 'chase'; e.t = 0; }
      break;
    case 'air':
      e.vx *= Math.pow(0.3, dt);
      if (e.ground && e.t > 0.1) { e.st = 'stun'; e.t = 0; R.shake = Math.max(R.shake, 1); }
      break;
  }
  const prevY = e.y;
  e.vy = Math.min(P_MAXFALL, e.vy + P_GRAV * (e.st === 'air' ? 0.75 : 1) * dt);
  e.x = clamp(e.x + e.vx * dt, 16, ROOM.w - 16);
  e.y += e.vy * dt;
  e.ground = landOn(e, prevY, false);
  if (e.ground) e.vy = 0;
  // 平台边缘：巡逻时掉头，不主动跳下
  if (e.ground && e.st === 'patrol' && e.y < ROOM.ground) {
    const pl = ROOM.plats.find((q) => e.y === q.y && e.x >= q.x - 4 && e.x <= q.x + q.w + 4);
    if (pl && (e.x < pl.x + 8 || e.x > pl.x + pl.w - 8)) { e.pdir = e.x < pl.x + 8 ? 1 : -1; e.home = pl.x + pl.w / 2; }
  }
}

function spawnWave() {
  R.wave++;
  const n = 3 + R.wave;
  for (let i = 0; i < n; i++) {
    const useP = i % 2 === 1;
    const pl = ROOM.plats[(i * 3 + R.wave) % ROOM.plats.length];
    const x = useP ? pl.x + pl.w / 2 : 500 + ((i * 457 + R.wave * 211) % (ROOM.w - 700));
    spawnHound(x, useP ? pl.y : ROOM.ground);
  }
}

/* ---------- 绘制 ---------- */
function heroFrame(p) {
  const T = p.t;
  const f = (name, fps, loop, offset = 0, count) => {
    const m = HERO_A[name]; if (!m) return [name, 0];
    const n = count || m.n;
    let i = Math.floor(T * fps);
    i = loop ? i % n : Math.min(i, n - 1);
    return [name, offset + i];
  };
  switch (p.st) {
    case 'idle': return f('idle', 6, true);
    case 'run': return f('run', 14, true);
    case 'jump': return ['jump', p.vy < -150 ? 2 : 3];
    case 'djump': return f('djump', 10, false);
    case 'fall': return ['jump', 4];
    case 'land': return ['jump', 5];
    case 'dash': return f('dash', 20, false);
    case 'atk': return f('combo', 14, false, COMBO_STEP[p.combo].f0, 4);
    case 'runatk': return f('runatk', 14, false);
    case 'airatk': return f('airatk', 16, false);
    case 'plunge': return ['plunge', p.t < 0.06 ? 0 : 1];
    case 'hurt': return f('hurt', 10, false, 2, 2);
    case 'dead': return f('death', 6, false);
  }
  return ['idle', 0];
}

function drawHero(p, cx, cy) {
  const [name, i] = heroFrame(p);
  const m = HERO_A[name]; const im = rImg(`hero2/hero_${name}.png`);
  if (!m || !ready(im)) return;
  if (p.inv > 0 && p.st !== 'dash' && Math.floor(R.time * 20) % 2 === 0) return;
  rx.save();
  rx.translate(Math.round(p.x - cx), Math.round(p.y - cy) + 1);
  if (p.face < 0) rx.scale(-1, 1);
  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
  rx.restore();
}

function drawHound(e, cx, cy) {
  let a = 'idle', fps = 8;
  if (e.st === 'patrol') { a = 'walk'; fps = 10; }
  else if (e.st === 'chase') { a = 'run'; fps = 12; }
  else if (e.st === 'leap' || e.st === 'air') { a = 'jump'; fps = 10; }
  const [n, fw, fh] = HOUND.anim[a];
  const im = rImg(`gv/hound/hell-hound-${a}.png`);
  if (!ready(im)) return;
  const i = a === 'jump' ? Math.min(n - 1, Math.floor(e.t * fps)) : Math.floor(e.an * fps) % n;
  rx.save();
  rx.translate(Math.round(e.x - cx), Math.round(e.y - cy) + 1);
  if (e.face > 0) rx.scale(-1, 1);
  if (e.st === 'windup') {
    const k = e.t / HOUND.windup;
    rx.filter = k > 0.72 ? 'brightness(2.6)' : `sepia(1) saturate(6) hue-rotate(-30deg) brightness(${1 + 0.6 * Math.abs(Math.sin(e.t * 18))})`;
  } else if (e.flash > 0) rx.filter = 'brightness(3)';
  rx.drawImage(im, i * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
  rx.restore();
  if (e.st === 'windup') {
    rx.fillStyle = e.t > HOUND.windup * 0.72 ? '#fff' : '#ff3a2a';
    const bx = Math.round(e.x - cx), by = Math.round(e.y - cy) - 40;
    rx.fillRect(bx - 1, by - 8, 3, 6); rx.fillRect(bx - 1, by, 3, 3);
  }
  const hpW = 24;
  if (e.hp < HOUND.hp) {
    rx.fillStyle = '#1a0f14'; rx.fillRect(Math.round(e.x - cx - hpW / 2), Math.round(e.y - cy) - 30, hpW, 3);
    rx.fillStyle = '#d0384a'; rx.fillRect(Math.round(e.x - cx - hpW / 2), Math.round(e.y - cy) - 30, Math.round(hpW * e.hp / HOUND.hp), 3);
  }
}

function drawArc(fx, cx, cy) {
  const [a0, a1, flat] = fx.arc;
  const life = 0.16, k = fx.t / life;
  if (k >= 1) return;
  const ox = fx.x - cx, oy = fx.y - cy - 24, r = 40;
  rx.save();
  rx.translate(Math.round(ox), Math.round(oy));
  if (fx.face < 0) rx.scale(-1, 1);
  const steps = 14;
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps, t1 = (s + 1) / steps, th = 0.15 + 0.85 * t1;
    const pt = (t, rr) => { const a = (a0 + (a1 - a0) * t) * Math.PI / 180; return [6 + rr * Math.cos(a), rr * Math.sin(a) * flat]; };
    rx.beginPath();
    const p1 = pt(t0, r), p2 = pt(t1, r), p3 = pt(t1, r * (1 - 0.35 * th)), p4 = pt(t0, r * (1 - 0.35 * (0.15 + 0.85 * t0)));
    rx.moveTo(...p1); rx.lineTo(...p2); rx.lineTo(...p3); rx.lineTo(...p4); rx.closePath();
    rx.fillStyle = `rgba(255,${Math.round(235 - 60 * t1)},${Math.round(220 - 120 * t1)},${(1 - k) * (0.25 + 0.75 * t1)})`;
    rx.fill();
  }
  rx.restore();
}

function drawFx(cx, cy) {
  for (const f of R.fx) {
    const x = Math.round(f.x - cx), y = Math.round(f.y - cy);
    if (f.k === 'arc') drawArc(f, cx, cy);
    else if (f.k === 'streak') {
      const k = f.t / 0.15; if (k >= 1) continue;
      rx.fillStyle = `rgba(255,240,210,${1 - k})`;
      rx.fillRect(f.face > 0 ? x : x - 80, y - 1, 80, 2);
    } else if (f.k === 'spark') {
      const k = f.t / 0.22; if (k >= 1) continue;
      rx.fillStyle = `rgba(255,236,170,${1 - k})`;
      for (let i = 0; i < f.n; i++) {
        const a = i / f.n * Math.PI * 2 + f.x, d = 4 + 18 * k;
        rx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 2, 2);
      }
    } else if (f.k === 'ring') {
      const k = f.t / 0.5; if (k >= 1) continue;
      rx.strokeStyle = `rgba(150,220,255,${1 - k})`; rx.lineWidth = 2;
      rx.beginPath(); rx.arc(x, y, 8 + 40 * k, 0, Math.PI * 2); rx.stroke();
    } else if (f.k === 'ghost') {
      const k = f.t / 0.25; if (k >= 1) continue;
      const m = HERO_A.dash, im = rImg('hero2/hero_dash.png');
      if (!m || !ready(im)) continue;
      rx.save(); rx.globalAlpha = 0.45 * (1 - k); rx.filter = 'brightness(0.6) sepia(1) hue-rotate(160deg) saturate(3)';
      rx.translate(x, y + 1); if (f.face < 0) rx.scale(-1, 1);
      rx.drawImage(im, m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
      rx.restore();
    } else if (f.k === 'death') {
      const im = rImg('gv/enemy-death.png'); const i = Math.floor(f.t * 14);
      if (i >= 5 || !ready(im)) continue;
      rx.drawImage(im, i * 44, 0, 44, 52, x - 22, y - 46, 44, 52);
    }
  }
}

function drawTiles(cx, cy) {
  const ts = rImg('gv/cemetery/tileset.png');
  if (!ready(ts)) return;
  // 地面：32×48 的草皮土块平铺，下面用深色补满
  const gy = Math.round(ROOM.ground - cy);
  for (let x = Math.floor(cx / 32) * 32; x < cx + RB_W + 32; x += 32) rx.drawImage(ts, 16, 64, 32, 48, Math.round(x - cx), gy - 6, 32, 48);
  rx.fillStyle = '#1b1422'; rx.fillRect(0, gy + 42, RB_W, RB_H);
  // 平台：同一块土，只取上半截做成悬空的台子
  for (const pl of ROOM.plats) {
    const px = Math.round(pl.x - cx), py = Math.round(pl.y - cy);
    if (px > RB_W || px + pl.w < 0) continue;
    for (let x = 0; x < pl.w; x += 32) {
      const w = Math.min(32, pl.w - x);
      rx.drawImage(ts, 16, 64, w, 26, px + x, py - 6, w, 26);
    }
  }
}

function drawBack(cx, cy) {
  const bg = rImg('gv/cemetery/background.png'), mt = rImg('gv/cemetery/mountains.png'), gv = rImg('gv/cemetery/graveyard.png');
  rx.fillStyle = '#1e1430'; rx.fillRect(0, 0, RB_W, RB_H);
  if (ready(bg)) {
    const sx = -((cx * 0.05) % (bg.width * 2));
    for (let x = sx; x < RB_W; x += bg.width * 2) rx.drawImage(bg, Math.round(x), Math.round(-20 - cy * 0.05), bg.width * 2, bg.height * 2);
  }
  if (ready(mt)) {
    const sx = -((cx * 0.25) % mt.width);
    for (let x = sx - mt.width; x < RB_W; x += mt.width) rx.drawImage(mt, Math.round(x), Math.round(RB_H - mt.height - 10 - (cy - (ROOM.h - RB_H)) * 0.25));
  }
  if (ready(gv)) {
    const sx = -((cx * 0.55) % gv.width);
    for (let x = sx - gv.width; x < RB_W; x += gv.width) rx.drawImage(gv, Math.round(x), Math.round(ROOM.ground - cy - gv.height + 12 - (cy - (ROOM.h - RB_H)) * -0.1));
  }
}

function drawProps(cx, cy) {
  for (const [n, x] of ROOM.props) {
    const im = rImg(`gv/cemetery/${n}.png`);
    if (!ready(im)) continue;
    const px = Math.round(x - cx - im.width / 2);
    if (px > RB_W || px + im.width < 0) continue;
    rx.drawImage(im, px, Math.round(ROOM.ground - cy - im.height + 6));
  }
}

/* ---------- 场景 ---------- */
const roomScene = {
  wide: true, touch: true,
  enter() {
    rReset();
    preload(['gv/cemetery/background.png', 'gv/cemetery/mountains.png', 'gv/cemetery/graveyard.png', 'gv/cemetery/tileset.png',
      'gv/enemy-death.png', ...Object.keys(HOUND.anim).map((a) => `gv/hound/hell-hound-${a}.png`),
      ...Object.keys(HERO_A).map((n) => `hero2/hero_${n}.png`), ...ROOM.props.map(([n]) => `gv/cemetery/${n}.png`)]);
  },
  update(dt) {
    if (input.hit('pause')) { setScene(titleScene); return; }
    if (R.dead && (input.hit('restart') || pulse.has('tap'))) { rReset(); return; }
    if (window.touchUI && touchUI.menu) return;
    if (params.get('demo')) demoInput(dt);
    syncWidth();
    R.time += dt;
    R.banner -= dt;
    bufferInput(R.p, dt);
    if (R.stop > 0) { R.stop -= dt; return; }
    R.witch = Math.max(0, R.witch - dt);
    const p = R.p, edt = R.witch > 0 ? dt * WITCH_SLOW : dt;
    playerUpdate(p, dt);
    for (const e of R.en) if (e.st !== 'dead') houndUpdate(e, p, edt);
    R.en = R.en.filter((e) => e.st !== 'dead');
    for (const f of R.fx) f.t += dt;
    R.fx = R.fx.filter((f) => f.t < 0.6);
    for (const n of R.nums) n.t += dt;
    R.nums = R.nums.filter((n) => n.t < 0.7);
    if (!R.en.length && !R.dead) { R.waveT -= dt; if (R.waveT <= 0) { spawnWave(); R.waveT = 2; } }
    // 镜头：朝向前方留出视野，纵向只在离开中间区域时才跟
    const c = R.cam;
    const tx = p.x - RB_W / 2 + p.face * 50;
    const ty = p.y - RB_H * 0.62;
    c.x += (tx - c.x) * Math.min(1, dt * 6);
    if (Math.abs(ty - c.y) > 24) c.y += (ty - c.y) * Math.min(1, dt * 4);
    c.x = clamp(c.x, 0, ROOM.w - RB_W); c.y = clamp(c.y, 0, ROOM.h - RB_H);
    R.shake = Math.max(0, R.shake - dt * 20);
  },
  draw() {
    const p = R.p;
    syncWidth();
    const sx = R.shake > 0 ? Math.round(rnd(-R.shake, R.shake)) : 0, sy = R.shake > 0 ? Math.round(rnd(-R.shake, R.shake)) : 0;
    const cx = Math.round(R.cam.x) + sx, cy = Math.round(R.cam.y) + sy;
    rx.setTransform(1, 0, 0, 1, 0, 0);
    // 时空断裂：场景和敌人褪色发蓝，主角和刀光保持原色（敌人蓄力的红光/闪白仍会盖过褪色，预警照样看得清）
    const wk = clamp(R.witch / WITCH_FADE, 0, 1);
    rx.filter = wk > 0 ? `saturate(${1 - 0.8 * wk}) brightness(${1 - 0.2 * wk})` : 'none';
    drawBack(cx, cy);
    drawProps(cx, cy);
    drawTiles(cx, cy);
    for (const e of R.en) drawHound(e, cx, cy);
    rx.filter = 'none';
    if (wk > 0) { rx.fillStyle = `rgba(70,130,220,${0.18 * wk})`; rx.fillRect(0, 0, RB_W, RB_H); }
    drawHero(p, cx, cy);
    drawFx(cx, cy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rbuf, 0, 0, RB_W, RB_H, 0, 0, RB_W * RB_S, H);
    // HUD 用原分辨率画，字清楚
    for (const n of R.nums) drawText(String(n.v), (n.x - cx) * RB_S, (n.y - cy - n.t * 30) * RB_S, 24, n.c, 'center');
    const tc = touchOn(), sl = tc ? touchUI.safe.l : 0;
    pxBar(24 + sl, 20, 300, 18, p.hp / p.mx, '#d0384a');
    drawText(`生命 ${p.hp}/${p.mx}`, 24 + sl, 64, 24, '#f0e6f6');
    // 触屏时右上角是返回/设置键，波次挪到顶部中间
    if (tc) drawText(`第 ${R.wave} 波　击杀 ${R.kills}`, VW / 2, 40, 24, '#c8bcd8', 'center');
    else drawText(`第 ${R.wave} 波　击杀 ${R.kills}`, VW - 24, 40, 24, '#c8bcd8', 'right');
    if (R.banner > 0) drawText('时空断裂', VW / 2, 140, 48, `rgba(160,225,255,${clamp(R.banner, 0, 1)})`, 'center');
    if (R.witch > 0) pxBar(VW / 2 - 120, 160, 240, 8, R.witch / WITCH_T, '#8fd8ff');
    if (!tc) {
      drawText('A/D 移动　K 跳（按住跳得高，空中再按二段跳，下+K 穿落）　空格 冲刺　Esc 返回', VW / 2, H - 44, 24, 'rgba(220,210,235,.75)', 'center');
      drawText('J 三连击　跑动中 J 跑攻　空中 J 空斩　空中下+J 下劈（踩怪弹起）', VW / 2, H - 14, 24, 'rgba(220,210,235,.75)', 'center');
    }
    if (R.dead) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, VW, H);
      drawText('倒下了', VW / 2, H / 2 - 20, 48, '#ff8a8a', 'center');
      drawText(tc ? '轻点屏幕重来' : '按 R 重来', VW / 2, H / 2 + 30, 24, '#f0e6f6', 'center');
    }
  },
};

function pxBar(x, y, w, h, k, col) {
  ctx.fillStyle = '#0d0a12'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = '#3a2a3a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(k, 0, 1)), h);
}

/* 截图自测用的脚本输入：跑、跳、上平台、连招、冲刺、下劈 */
function demoInput() {
  const t = R.time;
  for (const k of Object.keys(virt)) delete virt[k];
  const seg = [
    [0.0, 1.2, ['right']], [1.2, 1.25, ['jump', 'right']], [1.25, 1.6, ['right']], [1.6, 1.65, ['jump', 'right']],
    [1.65, 2.4, ['right']], [2.5, 2.55, ['attack']], [2.75, 2.8, ['attack']], [3.0, 3.05, ['attack']],
    [3.4, 3.45, ['dodge', 'right']], [3.6, 4.4, ['right']], [4.4, 4.45, ['jump']], [4.7, 4.75, ['down', 'attack']],
    [4.75, 5.2, ['down']], [5.4, 6.4, ['right']], [6.4, 6.45, ['attack']], [6.6, 6.65, ['attack']], [6.8, 6.85, ['attack']],
  ];
  const loopT = t % 8, prevT = (t - 1 / 60 + 8) % 8;
  for (const [a, b, ks] of seg) {
    if (loopT < a || loopT >= b) continue;
    const first = !(prevT >= a && prevT < b);
    for (const k of ks) { if (k === 'down' || k === 'left' || k === 'right') virt[k] = true; else if (first) pulse.add(k); }
  }
}

window.roomScene = roomScene;
})();
