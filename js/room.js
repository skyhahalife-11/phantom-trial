'use strict';
/* 大房间试玩（切片 1～3）：卷轴房间 + 酒红剑客全套操作。独立场景，不接肉鸽流程。
   世界画在 640×360 的低分辨率缓冲上，再整数放大 2 倍到 1280×720，保证像素清晰。
   坐标单位都是缓冲像素；y 向下，角色的 y 是脚底。
   技能设计见设计文档 §8.8：常态 U 送葬突刺 / I 掷碑·瞬身 / O 断空（时空断裂中为瞬狱），每招都带着主角动起来；
   P 葬碑·血契 变身，变身后技能换成 碑落 / 血爪拖行 / 裂地 / 葬。
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
/* 开源特效精灵（assets/vfx，CC0，见 CREDITS）：常态技能用青蓝「魂火」配色，变身后用猩红「血焰」 */
const VFX = window.VFX || {};
const COMBO_STEP = [{ f0: 0, hit: 2 }, { f0: 4, hit: 1 }, { f0: 8, hit: 1 }];
// 变身后普攻：巨刃横扫 → 反扫 → 巨爪拍地；攻速 -15%
const T_FPS = 12 * 1.3;   // 暴走中攻速 +30%
const TCOMBO = [{ a: 't_sweep', f0: 0, n: 2, hit: 1 }, { a: 't_sweep', f0: 2, n: 2, hit: 0 }, { a: 't_clawslam', f0: 0, n: 4, hit: 2 }];
const ARC = {
  c0: [-110, 45, 1], c1: [-75, 55, 0.38], c2: [70, -100, 1], air: [-80, 60, 0.9],
  tc0: [-80, 50, 0.45], tc1: [50, -80, 0.45], tc2: [-120, 60, 1],
};

const P_RUN = 150, P_ACC = 1400, P_GRAV = 1000, P_JUMP = 360, P_DJUMP = 320, P_MAXFALL = 520;
const DASH_V = 430, DASH_T = 0.2, DASH_INV = 0.24, DASH_CD = 0.32;
/* 完美闪避 → 时空断裂（崩坏3式）：敌人降到 0.2 倍速 2.2 秒，主角照常行动；断裂期间不能再次触发，避免无限续 */
const WITCH_SLOW = 0.2, WITCH_T = 2.2, WITCH_FADE = 0.3;
const BUF = 0.12, COYOTE = 0.08;   // 预输入：按键提前 0.12 秒也算数；土狼时间：走出平台边 0.08 秒内还能起跳

/* 技能数值（文档 §8.8，数值为拟定） */
const CD = { u: 5, i: 4.5, o: 6 };   // 常态与变身共用同一套冷却；掷碑的冷却从剑回到手里才开始算
const SK = {
  u: { dist: 140, t: 0.15, dmg: 18, mark: 10 },   // 一口气穿过去；冲完离敌人不远，方便回身接普攻
  // 掷碑：飞出 0.34 秒（约 175 像素）→ 悬停 → 飞回；去程回程各打一次并钉住；剑在外面时再按瞬身过去斩一刀
  i: { speed: 520, out: 0.34, hover: 0.12, back: 640, dmg: 10, pin: 0.6, slash: 14 },
  // 断空：前方区域 0.3 秒后爆出斩痕，屏幕里带墓志的敌人身上也各爆一道；瞬狱：在屏幕内所有敌人之间穿梭，每只 3 道斩痕
  o: { delay: 0.3, dmg: 16, markDmg: 12, stun: 0.4, stormCuts: 3, stormDmg: 14, stormStep: 0.07, stormMax: 8 },
};
const SOUL_MAX = 5, SOUL_HIT = 0.125, LINK_T = 6;
/* P 葬碑·血契 = 暴走：魂 ≥3 才能开，每格魂 2.5 秒。暴走中真正无敌、全场敌人半速、移动更快；
   普攻每刀甩出血色月牙刀气，闪避变成几乎无冷却的血影闪，四个技能都是全屏级；每击杀 +0.5 秒；时间到自动「葬」收尾 */
const RAGE = { minSoul: 3, perSoul: 2.5, killAdd: 0.5, slow: 0.5, run: 1.25, wave: 20 };
const CD_RAGE = { u: 2.5, i: 2, o: 4 };
// 变身：碑落 / 血爪拖行（冲 0.35 秒，沿途铲起敌人，冲完甩向身后上方）/ 裂地（地裂往前连爆 3 下）/ 葬
const TSK = {
  waveDmg: 10, waveV: 460, waveLife: 0.5,              // 普攻刀气
  shadowV: 900, shadowT: 0.14, shadowDmg: 12,           // 血影闪
  rainT: 1.5, rainGap: 0.05, rainDmg: 14,               // U 碑雨
  maulSlams: 4, maulGap: 0.13, maulDmg: 14, maulAoe: 10, tossDmg: 24,   // I 血爪乱舞
  stormDmg: 18,                                         // O 血狱（每道）
  finBase: 30, finCombo: 1.5,                           // P 葬：基础 + 每连击
};

const touchOn = () => !!(window.touchUI && touchUI.on);
const assistOn = () => touchOn() && touchUI.opt.assist;
const buzz = (ms) => { if (window.touchUI) touchUI.buzz(ms); };
const HOUND = {
  hp: 60, dmg: 14, walk: 40, run: 120, sight: 240, windup: 0.55, leapVx: 280, leapVy: -230, recover: 0.7,
  anim: { idle: [6, 64, 32], walk: [12, 64, 32], run: [5, 67, 32], jump: [6, 65, 48] },
};
// 骷髅兵：从土里爬出来，慢慢逼近，贴脸后仰一下再前扑抓一把；血少，成群出现
// 重甲兵：慢、血厚、平时吃 35% 伤害且不被打断；它出招落空的破绽期、被完美闪避 / 突刺打晕时才吃全伤
const BRUTE = { hp: 120, dmg: 20, walk: 38, reach: 60, windup: 0.85, slamT: 0.2, recover: 1.0, armor: 0.35, scale: 1.45 };
const SKEL = { hp: 30, dmg: 10, walk: 52, reach: 46, windup: 0.6, lungeV: 150, lungeT: 0.2, recover: 0.6, rise: 0.6 };
// 幽灵：飘着穿过平台；隐身（抓不到）→ 在主角背后现身 → 蓄力尖啸，打一圈
const GHOST = { hp: 40, dmg: 12, drift: 55, sight: 300, cd: 2.6, vanish: 0.5, hidden: 0.35, appear: 0.43, behind: 46, windup: 0.6, shriek: 0.3, radius: 58, hover: 16 };
// 火焰巫师：站在高台上远程丢火球；手里聚火就是预警。普攻打中火球会把它反弹回去
const WIZ = { hp: 40, dmg: 12, sight: 400, cd: 2.4, castFps: 10, release: 6, ballV: 170, ballLife: 3.5, reflectV: 340, reflectDmg: 24 };
// 墓渊魔：大房间第一个 Boss。三招都有明显前摇、都能完美闪避；出完招有破绽（受伤 +25%）；
// 霸体（不被击退 / 挑飞 / 眩晕 / 抓取）；半血后狂怒：前摇缩短到 0.8 倍，并定期召唤骷髅
const BOSS = {
  hp: 1400, name: '墓渊魔', wave: 4, walk: 70, near: 110, gap: 0.9, gap2: 0.55, weak: 1.25, phase2: 0.5, fast: 0.8,
  charge: { windup: 0.7, v: 380, t: 0.4, dmg: 18, recover: 0.9 },
  breath: { crouch: 0.35, rear: 0.5, fire: 0.5, dmg: 16, recover: 0.8, reach: 136 },
  dive: { rise: 0.45, h: 165, track: 0.9, fall: 900, dmg: 22, radius: 70, recover: 1.0 },
  summon: { cd: 14, t: 0.9, n: 3 },
};
const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42], boss: [30, 96], brute: [16, 58] };   // 受击框：半宽、高
const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp, boss: BOSS.hp, brute: BRUTE.hp };
const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50, boss: 118, brute: 70 };   // 血条 / 预警 / 眩晕星画在脚底往上多少
const etype = (e) => e.type || 'hound';
const snd = (n, o) => { if (window.sfx) sfx.play(n, o); };
const mv = (k, d = 0) => (R.M && R.M[k] != null ? R.M[k] : d);   // 肉鸽强化汇总出的属性；自由试玩时没有

/* 地面 500；四层平台每层高 64，单跳 65 像素、二段跳合计约 115 像素 */
const ROOM = {
  w: 1280, h: 540, ground: 500,
  plats: [
    { x: 100, y: 436, w: 160 }, { x: 300, y: 372, w: 128 }, { x: 440, y: 308, w: 128 }, { x: 560, y: 436, w: 192 },
    { x: 780, y: 372, w: 160 }, { x: 900, y: 308, w: 128 }, { x: 1020, y: 436, w: 160 },
  ],
  props: [
    ['tree-1', 80], ['stone-1', 250], ['statue', 420], ['bush-large', 600], ['tree-2', 760], ['stone-2', 900],
    ['bush-small', 1020], ['statue', 1100], ['tree-3', 1180], ['stone-3', 1240],
  ],
};

const R = {};
let pendingCfg = null;   // 肉鸽流程传来的战斗配置，enter() 时取走

function rImg(p) { return img(p); }
function rReset() {
  R.p = {
    x: 120, y: ROOM.ground, vx: 0, vy: 0, face: 1, ground: true, dj: false, airDash: true, drop: 0,
    st: 'idle', t: 0, hp: 100, mx: 100, inv: 0, dashCd: 0, combo: -1, queued: false, comboGap: 9, hitDone: false,
    runT: 0, dashEnd: 9, airCd: 0, perfectUsed: false, coy: 0,
    buf: { dodge: 0, jump: 0, attack: 0, s1: 0, s2: 0, s3: 0, s4: 0 },
    soul: Math.min(5, (Number(params.get('soul')) || 0) + ((R.cfg && R.cfg.startSoul) || 0)),   // soul=n：调试用；startSoul：幻之屋「魂引」
    cd: { u: 0, i: 0, o: 0 }, link: { u: -99, i: -99, o: -99 },
    form: 'normal', rage: 0, rageMax: 1, hitSet: null, aimUp: false, storm: null, maul: null,
  };
  R.cam = { x: 0, y: ROOM.h - RB_H }; R.pend = [];
  R.M = R.cfg ? R.cfg.mods : null; R.endT = 0; R.ended = false; R.godDone = false;
  if (R.cfg) { R.p.mx = R.cfg.maxHp; R.p.hp = R.cfg.hp; }
  Object.assign(R.p, { pdStacks: 0, pdT: 0, pdEye: 0, shield: 0, chainT: 0, dblT: 0, chainDmg: 0, chainCd: false, twoCritOn: false,
    lastSk: '', lastSkT: -9, ultAfterT: 0, streak: 0, chargeT: -9, stunHits: 0 });
  R.en = []; R.fx = []; R.nums = []; R.cuts = []; R.blade = null; R.shots = []; R.drops = []; R.rain = null; R.rcombo = 0; R.shade = null; R.eshots = [];
  R.wave = params.get('boss') ? BOSS.wave - 1 : 0; R.kills = 0; R.waveT = 1.2;   // boss=1：调试用，开局直接打 Boss
  R.stop = 0; R.shake = 0; R.witch = Number(params.get('witch')) || 0; R.banner = 0;   // witch=秒：调试用，开局直接进时空断裂
  R.msg = null; R.cutin = null; R.soulWarn = 0; R.flash = 0; R.afterT = 0;
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
const eBox = (e) => { const [w, h] = EBOX[etype(e)]; return { x0: e.x - w, x1: e.x + w, y0: e.y - h, y1: e.y }; };
/* 相对脚底、朝右为正的框，按朝向翻成世界坐标 */
const faceBox = (p, h) => (p.face > 0
  ? { x0: p.x + h.x0, x1: p.x + h.x1, y0: p.y + h.y0, y1: p.y + h.y1 }
  : { x0: p.x - h.x1, x1: p.x - h.x0, y0: p.y + h.y0, y1: p.y + h.y1 });
// 在镜头画面内（镜头会往朝向那边偏，按镜头算才是真正的「屏幕内」）
const onScreen = (p, e) => e.x > R.cam.x - 8 && e.x < R.cam.x + RB_W + 8 && Math.abs(e.y - p.y) < 200;
const alive = () => R.en.filter((e) => e.st !== 'dead' && !e.hide);   // hide：幽灵隐身中，打不到也锁不到
/* 点到线段的距离（瞬身路径判定用） */
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const k = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k));
}

/* ---------- 玩家：状态分组 ---------- */
// 这些状态里能放技能（含取消普攻后摇）
const FREE = ['idle', 'run', 'jump', 'djump', 'fall', 'land', 'atk', 'runatk', 'airatk'];
// 这些状态里普攻/跳跃不响应（按键留在预输入里，动作结束接上）
const LOCK = ['hurt', 'dash', 'thrust', 'throw', 'blink', 'iai', 'storm', 'sheathe', 'transform',
  'rdash', 'train', 'tmaul', 'tfinish', 'dead'];

function setSt(p, st) { p.st = st; p.t = 0; p.hitDone = false; }
function setSt2(p, st) { if (p.st !== st) setSt(p, st); }

function startCombo(p, step) {
  setSt(p, 'atk'); p.combo = step; p.queued = false; p.vx = p.face * 70;
}

/* 预输入在顿帧/慢动作之前收集，按键不会因为卡肉的那几帧被吞掉 */
function bufferInput(p, dt) {
  // 冲刺 / 突刺 / 瞬身过程中按的键一直排队，动作一结束立刻接出（鬼泣式预输入，连招不断）
  const hold = ['dash', 'thrust', 'blink', 'rdash'].includes(p.st);
  for (const k of Object.keys(p.buf)) p.buf[k] = input.hit(k) ? BUF : (hold && p.buf[k] > 0 ? p.buf[k] : p.buf[k] - dt);
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

function say(text, color = '#f0e6f6') { R.msg = { text, color, t: 1.2 }; }
function vfx(name, x, y, o = {}) {
  const m = VFX[name];
  const f = { k: 'spr', name, x, y, t: 0, life: m ? (m.n - (m.s || 0)) / m.fps : 0.5, ...o };
  if (o.hold) f.life = 3;   // 循环到 releaseFx 为止；忘了放开也最多留 3 秒
  R.fx.push(f);
  return f;
}
function releaseFx(f) {
  if (!f || f.rel !== undefined) return;
  const m = VFX[f.name];
  f.rel = f.t; f.life = m ? f.t + (m.n - f.hold[1] - 1) / m.fps : f.t;
}
/* ---------- 血契之影：暴走期间常驻主角身后的死神，主角普攻时跟着挥爪 ---------- */
const SHADE = { dx: -34, follow: 10, bob: 2, alpha: 0.9 };
function summonShade(p) {
  R.shade = { st: 'shade_in', t: 0, x: p.x + SHADE.dx * p.face, y: p.y, face: p.face };
}
function shadeAct(name) {
  if (R.shade && R.shade.st !== 'shade_in') { R.shade.st = name; R.shade.t = 0; }
}
function updateShade(p, dt) {
  const s = R.shade;
  if (!s) return;
  s.t += dt;
  if (s.st !== 'shade_swipe') s.face = p.face;   // 挥爪途中不转身
  const k = 1 - Math.exp(-SHADE.follow * dt);
  s.x += (p.x + SHADE.dx * s.face - s.x) * k;
  s.y += (p.y - s.y) * k;
  const m = VFX[s.st];
  if (s.st === 'shade_out') { if (s.t >= 0.3) R.shade = null; return; }
  if (s.st !== 'shade_idle' && m && s.t >= m.n / m.fps) { s.st = 'shade_idle'; s.t = 0; }
}
function drawShade(cx, cy) {
  const s = R.shade;
  if (!s) return;
  const m = VFX[s.st], im = rImg(`vfx/${s.st}.png`);
  if (!m || !ready(im)) return;
  const i = s.st === 'shade_idle' ? Math.floor(s.t * m.fps) % m.n : Math.min(m.n - 1, Math.floor(s.t * m.fps));
  rx.save();
  rx.translate(Math.round(s.x - cx), Math.round(s.y - cy + Math.sin(R.time * 3) * SHADE.bob));
  if (s.face < 0) rx.scale(-1, 1);
  rx.globalAlpha = s.st === 'shade_out' ? SHADE.alpha * (1 - s.t / 0.3) : SHADE.alpha;
  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -m.ax, -m.ay, m.fw, m.fh);
  rx.restore();
}
const tint = () => (R.p.form === 'blood' ? 'blood' : 'soul');
const PART_COL = {
  blood: ['#ff4a5a', '#c01830', '#ff9a8a', '#7a0818', '#ffd0c0'],
  stone: ['#8a7a8a', '#5a4e5e', '#b0a4b4', '#ff4a5a', '#3a3040'],
};
/* 像素碎粒：从一点向四周炸开，受重力下落（变身、葬、碑碎） */
function burst(x, y, n, o = {}) {
  const cols = PART_COL[o.col || 'blood'];
  const ps = [];
  for (let k = 0; k < n; k++) {
    const a = rnd(o.a0 ?? 0, o.a1 ?? Math.PI * 2), v = rnd(o.v0 ?? 60, o.v1 ?? 240);
    ps.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 80), c: cols[k % cols.length], s: k % 4 === 0 ? 3 : 2 });
  }
  R.fx.push({ k: 'parts', x, y, t: 0, life: o.life ?? 0.7, ps, g: o.g ?? 520 });
}
function afterImage(p, x, y) {
  const [name, i] = heroFrame(p);
  R.fx.push({ k: 'after', x: x ?? p.x, y: y ?? p.y, face: p.face, name, i, t: 0, red: p.form === 'blood' });
}

/* ---------- 魂 ---------- */
function gainSoul(v) {
  const p = R.p;
  if (p.form !== 'normal') return;   // 变身期间不获得魂
  p.soul = Math.min(SOUL_MAX, p.soul + v);
}
/* 三技能联动：6 秒内三个普通技能各命中至少一个敌人 → +1 魂 */
function noteLink(k) {
  const p = R.p;
  if (p.form !== 'normal') return;
  p.link[k] = R.time;
  if (Object.values(p.link).every((t) => R.time - t <= LINK_T)) {
    gainSoul(1);
    p.link = { u: -99, i: -99, o: -99 };
    say('三技联动　魂 +1', '#8fd8ff'); snd('soul');
  }
}

/* 主角对敌人造成伤害的统一入口：暴击、墓志灌魂、联动记录都在这里结算 */
function strike(e, dmg, o = {}) {
  if (e.st === 'dead' || e.hide) return;
  const p = R.p, M = R.M;
  let crit = !!o.critStun && e.st === 'stun';
  if (crit) dmg *= 2;
  if (e.boss && e.st === 'recover') dmg *= BOSS.weak;   // Boss 破绽
  const brute = etype(e) === 'brute';
  if (brute && !['stun', 'recover'].includes(e.st)) dmg *= BRUTE.armor;   // 重甲：平时只吃 35%
  if (M) {   // 肉鸽强化：伤害倍率、暴击、命中后的附带效果
    const blood = p.form === 'blood';
    dmg *= M.dmg;
    if (o.basic) {
      dmg *= mv('basicMul', 1);
      if (o.third && mv('heavy3')) dmg *= 1.4;
      if (mv('frenzy')) dmg *= 1 + Math.min(0.25, 0.05 * Math.floor(p.streak / 10));
    } else { dmg *= M.skillAll; if (!blood) dmg *= mv('normMul', 1); }
    if (blood) dmg *= mv('ultAmp', 1);
    if (!blood && p.ultAfterT > 0) dmg *= 1.25;
    if (o.skill && p.chainDmg > R.time) dmg *= 1.2;
    if (!o.basic && p.pdStacks > 0) dmg *= 1 + 0.1 * p.pdStacks;
    if (e.boss) dmg *= 1 + M.bossDmg;
    if (e.mark > 0 && mv('markAmp')) dmg *= 1.1;
    if (e.armorT > 0) dmg *= 1.08;
    if (!crit) {
      const forced = (!o.basic && p.pdEye > 0) || (o.skill && p.twoCritOn) || (o.third && mv('basicCore'));
      if (forced || Math.random() < M.crit) { crit = true; dmg *= 1.5 + M.critDmg; }
    }
    if (o.basic) {
      p.streak++;
      if (mv('armorBreak')) e.armorT = 3;
      if (mv('basicCd')) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - mv('basicCd'));
    }
    if (o.skill && mv('ultCharge') && R.time - p.chargeT > 0.3) { p.chargeT = R.time; gainSoul(mv('ultCharge')); }
  }
  if (o.basic && e.mark > 0) gainSoul(SOUL_HIT);
  if (o.mark) e.mark = o.mark + mv('markExtra');
  if (o.skill) noteLink(o.skill);
  if (p.form === 'blood') R.rcombo++;
  hurtEnemy(e, Math.max(1, Math.round(dmg)), o.kb || 0, o.launch, { crit, stun: o.stun, breakArmor: brute && o.skill === 'u' ? 1.4 : 0 });
}

/* ---------- 肉鸽强化用到的小工具 ---------- */
function cdRate() {
  if (!R.M) return 1;
  const blood = R.p.form === 'blood';
  return 1 / Math.max(0.35, 1 - Math.min(0.6, R.M.cdr + (blood ? 0 : mv('normCd'))) + (blood ? 0 : mv('normCdPlus')));
}
function setCd(p, k, extra = 0) {   // 常态三个技能的冷却：疾葬、秘卷连环、双发都在这里结算
  let v = CD[k] + extra;
  if (k === 'u') v *= 1 - mv('uCdr');
  if (p.chainCd) { v *= 0.7; p.chainCd = false; }
  if (R.M && Math.random() < mv('noCdProb')) v = 0;
  p.cd[k] = v;
}
function noteCast(p, k) {   // 记录上一个释放的技能：秘卷·连环、双技
  if (!R.M) return;
  const t = R.time, diff = p.lastSk && p.lastSk !== k;
  p.twoCritOn = !!(mv('twoCrit') && diff && t - p.lastSkT <= 1.5);
  const chain = !!(mv('scroll') && diff && t - p.lastSkT <= 4);
  p.chainDmg = chain ? t + 1.2 : 0; p.chainCd = chain;
  p.lastSk = k; p.lastSkT = t;
}
const rageNeed = () => Math.max(2, RAGE.minSoul - (mv('soulCore') ? 1 : 0) - (mv('pact') ? 1 : 0));
const ragePer = () => (RAGE.perSoul + mv('perSoulAdd') - (mv('pact') ? 0.5 : 0)) * mv('ultDur', 1) * (mv('soloRage') ? 0.5 : 1);
function thrustEcho(p) {
  const box = { x0: p.x - 50, x1: p.x + 50, y0: p.y - 50, y1: p.y + 6 };
  vfx('exp2_' + tint(), p.x, p.y - 10, { ground: true }); R.shake = Math.max(R.shake, 3);
  for (const e of alive()) if (overlap(box, eBox(e))) strike(e, 20, { skill: 'u', launch: -160 });
}

/* ---------- 肉鸽战斗：按配置刷波次，打完 / 倒下后回调 ---------- */
const waveLabel = () => (R.cfg ? (R.cfg.boss ? 'BOSS' : `第 ${Math.min(R.wave, R.cfg.waves.length)} / ${R.cfg.waves.length} 波`) : `第 ${R.wave} 波`);
function runWaves(dt) {
  const cfg = R.cfg;
  if (R.dead) { R.endT += dt; if (R.endT > 1.4) finishRun(false); return; }
  if (R.cfg.god && !R.godDone && R.time > 3.5 && R.en.length) {   // 幻神回应：下一战开场 3.5 秒后全屏打击
    R.godDone = true; say('幻神降临', '#ffd23a'); R.flash = 0.15; R.shake = 6;
    for (const e of alive()) if (onScreen(R.p, e)) strike(e, 70 * (e.boss ? 0.3 : 1), { launch: e.boss ? 0 : -200 });
  }
  const left = R.en.length + R.pend.length;
  if (R.wave < cfg.waves.length) {
    if (left > (cfg.trigger || 0)) return;
    R.waveT -= dt; if (R.waveT <= 0) { R.wave++; spawnList(cfg.waves[R.wave - 1]); R.waveT = 1.2; }
    return;
  }
  if (left) return;
  R.endT += dt;
  if (R.endT > 1.6) finishRun(true);
}
function finishRun(win) {
  if (R.ended) return;
  R.ended = true;
  snd(win ? 'victory' : 'defeat');
  const cfg = R.cfg, p = R.p;
  R.cfg = null;
  cfg.onEnd(win, { hp: Math.max(0, p.hp), mx: p.mx, kills: R.kills });
}
function scaleNew(n0) {
  if (!R.cfg) return;
  for (const e of R.en.slice(n0)) {
    if (e.boss) {
      e.hp = e.maxHp = Math.round(BOSS.hp * R.cfg.bossMul);
      // 第 2、3 关的 Boss 变体（由血量倍数区分）：孽生=开场就持续召唤骷髅；狂化=一开场就是狂怒形态
      e.variant = R.cfg.bossMul >= 2 ? 'fury' : R.cfg.bossMul >= 1.5 ? 'brood' : '';
      if (e.variant === 'fury') e.p2 = true;
      if (e.variant === 'brood') e.sumT = 5;
    }
    else e.hp = e.maxHp = Math.round(e.maxHp * R.cfg.eMul.hp * (e.elite ? 1.8 : 1));
  }
}

function playerUpdate(p, dt) {
  const L = input.act('left'), Rt = input.act('right'), D = input.act('down');
  const dir = (Rt ? 1 : 0) - (L ? 1 : 0);
  const blood = p.form === 'blood';
  p.t += dt; p.inv = Math.max(0, p.inv - dt); p.catchT = (p.catchT || 0) - dt; p.dashCd -= dt; p.comboGap += dt; p.dashEnd += dt; p.airCd -= dt; p.drop -= dt;
  const cr = cdRate();
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt * cr);
  p.chainT -= dt; p.scrollT -= dt; p.ultAfterT -= dt; p.pdEye -= dt; p.pdT -= dt;
  if (p.pdT <= 0) p.pdStacks = 0;
  if (p.dblT > 0) { p.dblT -= dt; if (p.dblT <= 0) setCd(p, 'u'); }
  if (p.st === 'dead') { p.vx *= 0.9; phys(p, dt); return; }

  // 暴走倒计时，到点自动「葬」收尾
  if (blood && !['tfinish', 'storm'].includes(p.st)) {
    p.rage -= dt;
    if (p.rage <= 0) { p.rage = 0; startFinisher(p); }
  }

  const busy = ['atk', 'airatk', 'runatk', 'land', 'plunge'].includes(p.st) || LOCK.includes(p.st);
  // 冲刺（带无敌，完美闪避在敌人攻击判定里结算）；暴走中变成血影闪
  if (want(p, 'dodge') && p.dashCd <= 0 && !mv('noDodge')) {
    const dd = virt.dodgeDir || dir;   // 触屏滑动闪避带方向
    if (!blood && !['hurt', 'dash', 'thrust', 'blink', 'storm', 'transform'].includes(p.st) && (p.ground || p.airDash)) {
      use(p, 'dodge'); virt.dodgeDir = 0;
      if (dd) p.face = dd;
      if (!p.ground) p.airDash = false;
      snd('dash'); setSt(p, 'dash'); p.vx = p.face * DASH_V; p.vy = 0; p.inv = DASH_INV; p.dashCd = DASH_CD * (1 - Math.min(0.6, mv('dodgeCdr'))); p.perfectUsed = false;
      R.fx.push({ k: 'ghost', x: p.x, y: p.y, face: p.face, t: 0 });
      checkPerfect(p);
    } else if (blood && (FREE.includes(p.st) || p.st === 'rdash')) {
      use(p, 'dodge'); virt.dodgeDir = 0;
      if (dd) p.face = dd;
      snd('dash', { rate: 1.3 }); setSt(p, 'rdash'); p.hitSet = new Set(); p.vx = p.face * TSK.shadowV; p.vy = 0; p.dashCd = 0.12;
    }
  }
  // 技能（扔剑的收招也能接技能，扔完马上瞬身过去最顺手）
  if (FREE.includes(p.st) || p.st === 'throw' || (blood && p.st === 'rdash')) castSkills(p, dir, blood);
  // 跳跃 / 二段跳 / 穿落
  if (want(p, 'jump') && !LOCK.includes(p.st)) {
    if (p.ground && D && standingOnPlat(p)) { use(p, 'jump'); p.drop = 0.25; p.ground = false; p.coy = 0; p.vy = 40; setSt(p, 'fall'); }
    else if (p.ground || p.coy > 0) {
      use(p, 'jump'); p.vy = -P_JUMP; p.ground = false; p.coy = 0; setSt(p, 'jump');
    } else if (!p.dj) { use(p, 'jump'); p.dj = true; p.vy = -P_DJUMP; setSt(p, 'djump'); }
  }
  // 攻击
  if (want(p, 'attack') && !LOCK.includes(p.st)) {
    let done = true;   // 没出成的按键留在预输入里，当前动作一结束就接上
    if (blood) {   // 暴走：地面空中都直接出巨刃三连，每刀带刀气
      if (p.st === 'atk') p.queued = true;
      else if (!busy) { autoFace(p, dir); startCombo(p, p.comboGap < 0.4 && p.combo >= 0 && p.combo < 2 ? p.combo + 1 : 0); }
      else done = false;
    } else if (!p.ground) {
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
      const s = blood ? TCOMBO[p.combo] : COMBO_STEP[p.combo], fps = blood ? T_FPS : 14, n = blood ? s.n : 4;
      p.vx *= Math.pow(0.002, dt);
      if (!p.hitDone && p.t >= s.hit / fps) { p.hitDone = true; doHit(p, (blood ? 'tc' : 'c') + p.combo); }
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
    // ---- 常态技能 ----
    case 'thrust':
      p.vy = 0;
      if (p.t < SK.u.t) thrustHits(p);
      else p.vx *= Math.pow(0.0005, dt);   // 冲完短暂滑行
      if (p.t >= SK.u.t + 0.06) {
        if (mv('thrustEcho') && p.stunHits >= 2) thrustEcho(p);
        p.stunHits = 0;
        // 刚穿过的敌人就在身后 100 像素内：自动回身面向它，排队的普攻直接接上
        const back = [...p.hitSet].filter((e) => e.st !== 'dead' && (e.x - p.x) * p.face < 0 && Math.abs(e.x - p.x) < 100);
        if (back.length) p.face = -p.face;
        p.comboGap = 9; setSt(p, p.ground ? 'idle' : 'fall');
      }
      break;
    case 'throw':
      if (p.ground) p.vx *= Math.pow(0.01, dt);
      if (!p.hitDone && p.t >= 1 / 12) { p.hitDone = true; throwBlade(p); }
      if (p.t >= 4 / 12) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    case 'blink':
      p.vy = 0;
      if (p.t >= 0.14) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    case 'iai':
      p.vx *= Math.pow(0.001, dt);
      if (!p.ground) p.vy = Math.min(p.vy, 40);   // 空中拔刀稍微滞空
      if (!p.hitDone && p.t >= 1 / 14) { p.hitDone = true; doIai(p); }
      if (p.t >= 4 / 14 + 0.12) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    case 'storm':
      updateStorm(p, dt);
      break;
    case 'sheathe':
      p.vx = 0;
      if (p.t >= 0.35) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    case 'transform':
      p.vx = 0;
      if (!p.hitDone && p.t >= 5 / 12) { p.hitDone = true; transformWave(p); }
      if (p.t >= 8 / 12) { p.form = 'blood'; p.cd = { u: 0, i: 0, o: 0 }; R.rcombo = 0; setSt(p, 'idle'); }
      break;
    // ---- 暴走 ----
    case 'rdash':
      p.vy = 0;
      shadowHits(p);
      if (Math.floor(p.t / 0.03) !== Math.floor((p.t - dt) / 0.03)) afterImage(p);
      if (p.t >= TSK.shadowT) { p.vx = p.face * P_RUN; setSt(p, p.ground ? 'idle' : 'fall'); }
      break;
    case 'train':
      p.vx *= Math.pow(0.01, dt);
      if (!p.hitDone && p.t >= 2 / T_FPS) { p.hitDone = true; R.rain = { t: 0, acc: 0, k: 0 }; R.shake = Math.max(R.shake, 3); }
      if (p.t >= 4 / T_FPS + 0.05) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    case 'tmaul':
      updateMaul(p, dt);
      break;
    case 'tfinish':
      p.vx = 0; p.vy = Math.min(p.vy, 0);
      if (!p.hitDone && p.t >= FIN.hitT) { p.hitDone = true; doFinisher(p); }
      if (p.t >= FIN.hitT + FIN.after) { p.form = 'normal'; p.rage = 0; p.ultAfterT = mv('ultAfter') ? 4 : 0; if (mv('soulCore')) p.soul = 1; p.inv = 0.6; p.cd = { u: 0, i: 0, o: 0 }; setSt(p, 'idle'); }
      break;
    default: {
      // 自由移动：idle / run / jump / djump / fall
      const tv = dir * P_RUN * (blood ? RAGE.run : 1) * (1 + (R.M ? R.M.spd : 0));
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

function castSkills(p, dir, blood) {
  const ready = (key, k) => want(p, key) && p.cd[k] <= 0;
  if (!blood) {
    if (ready('s1', 'u')) {   // U 送葬突刺：地面空中都能用
      use(p, 's1'); noteCast(p, 'u'); if (dir) p.face = dir;
      if (mv('blinkChain') && p.chainT > 0) { p.chainT = 0; p.cd.u = 0; }
      else if (mv('thrust2') && p.dblT <= 0) { p.cd.u = 0; p.dblT = 1; }
      else { p.dblT = 0; setCd(p, 'u'); }
      p.stunHits = 0;
      setSt(p, 'thrust'); snd('thrust'); p.hitSet = new Set(); p.inv = 0.22; p.perfectUsed = false;
      p.vx = p.face * SK.u.dist / SK.u.t; p.vy = 0;
      R.fx.push({ k: 'ghost', x: p.x, y: p.y, face: p.face, t: 0 });
      vfx('trail_soul', p.x + p.face * 26, p.y - 20, { rot: p.face > 0 ? Math.PI / 4 : -Math.PI / 4, flip: p.face < 0 });
      checkPerfect(p);
    } else if (want(p, 's2') && R.blade) {   // I 再按：瞬身到剑的位置
      use(p, 's2'); blink(p);
    } else if (ready('s2', 'i') && p.st !== 'throw') {   // I 掷碑：按住上斜着往上扔
      use(p, 's2'); noteCast(p, 'i'); if (dir) p.face = dir;
      p.aimUp = input.act('up');
      setSt(p, 'throw'); if (!p.ground) p.vy = Math.min(p.vy, 0) * 0.3;
    } else if (ready('s3', 'o') && !(mv('iaiOnly') && R.witch <= 0)) {   // O 断空；时空断裂中变成瞬狱
      use(p, 's3'); noteCast(p, 'o'); setCd(p, 'o'); if (dir) p.face = dir;
      if (R.witch > 0 && startStorm(p)) return;
      setSt(p, 'iai');
    } else if (want(p, 's4')) {   // P 葬碑·血契
      use(p, 's4');
      if (mv('sealIdx', -1) === 3) { say('奥义已封印', '#ff8a8a'); return; }
      if (p.soul < rageNeed()) { R.soulWarn = 0.8; say(`魂不足（需要 ${rageNeed()} 格）`, '#ff8a8a'); return; }
      p.rageMax = p.rage = p.soul * ragePer();   // 每格魂 2.5 秒
      p.soul = 0; p.inv = 0.75; p.vx = 0; p.vy = Math.min(p.vy, 0);
      if (R.blade) R.blade = null;   // 变身时剑收回手里
      setSt(p, 'transform');
      R.cutin = { t: 0 };
      snd('transform');
      say('葬碑·血契', '#ff6a6a');
    }
    return;
  }
  if (ready('s1', 'u')) { use(p, 's1'); p.cd.u = CD_RAGE.u; if (dir) p.face = dir; setSt(p, 'train'); }   // U 碑雨
  else if (ready('s2', 'i')) { use(p, 's2'); p.cd.i = CD_RAGE.i; if (dir) p.face = dir; startMaul(p); }   // I 血爪乱舞
  else if (ready('s3', 'o')) { use(p, 's3'); if (startStorm(p, true)) p.cd.o = CD_RAGE.o; }   // O 血狱：随时能放
  else if (want(p, 's4')) { use(p, 's4'); startFinisher(p); }   // P 提前收尾
}

function phys(p, dt) {
  if (p.st === 'storm') return;   // 瞬狱中位置由穿梭本身决定
  const prevY = p.y;
  if (!['dash', 'thrust', 'blink', 'rdash'].includes(p.st)) p.vy = Math.min(P_MAXFALL, p.vy + P_GRAV * dt);
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
  } else if (was && p.st !== 'jump' && p.st !== 'djump' && p.vy >= 0 && !LOCK.includes(p.st)) {
    setSt(p, 'fall');
  }
}

/* 攻击判定框（相对脚底，朝右为正）。tc* 是变身后普攻：范围约 1.5 倍、伤害约 1.4 倍 */
const HITBOX = {
  c0: { x0: 2, x1: 52, y0: -46, y1: -2, dmg: 10, kb: 70 },
  c1: { x0: 2, x1: 56, y0: -38, y1: -8, dmg: 12, kb: 90 },
  c2: { x0: -4, x1: 46, y0: -66, y1: 0, dmg: 16, kb: 40, launch: -290 },
  air: { x0: 0, x1: 50, y0: -46, y1: 6, dmg: 9, kb: 60 },
  run: { x0: 0, x1: 70, y0: -34, y1: -10, dmg: 14, kb: 140 },
  tc0: { x0: -6, x1: 70, y0: -48, y1: 0, dmg: 18, kb: 100 },
  tc1: { x0: -6, x1: 70, y0: -48, y1: 0, dmg: 18, kb: 100 },
  tc2: { x0: 0, x1: 72, y0: -40, y1: 6, dmg: 28, kb: 60, launch: -240 },
};

function doHit(p, kind) {
  const h = HITBOX[kind], box = faceBox(p, h), red = kind[0] === 't';
  snd(red ? 'rageSwing' : kind === 'c2' ? 'atk3' : kind === 'c0' || kind === 'air' ? 'atk1' : 'atk2');
  const arc = ARC[kind === 'run' ? 'c1' : kind];
  if (arc) R.fx.push({ k: 'arc', x: p.x, y: p.y, face: p.face, arc, r: red ? 52 : 40, red, t: 0 });
  if (kind === 'run') R.fx.push({ k: 'streak', x: p.x, y: p.y - 22, face: p.face, t: 0 });
  if (red) shadeAct('shade_swipe');
  if (red) R.shots.push({ x: p.x + p.face * 24, y: p.y - 22, vx: p.face * TSK.waveV, t: 0, hit: new Set(), big: kind === 'tc2' });
  if (red && mv('waveDouble')) R.shots.push({ x: p.x + p.face * 24, y: p.y - 38, vx: p.face * TSK.waveV, t: 0, hit: new Set(), big: false });
  let n = 0;
  for (const e of alive()) {
    if (!overlap(box, eBox(e))) continue;
    strike(e, h.dmg, { kb: p.face * h.kb, launch: h.launch, basic: true, third: kind === 'c2' });
    n++;
  }
  if (n) { R.stop = 0.06; R.shake = Math.max(R.shake, kind === 'c2' || kind === 'tc2' ? 3 : 2); }
  reflectBalls(p, box);
  if (kind === 'tc2') R.shake = Math.max(R.shake, 2);
}

function plungeHit(p) {
  const box = { x0: p.x - 14, x1: p.x + 14, y0: p.y - 14, y1: p.y + 10 };
  for (const e of alive()) {
    if (!overlap(box, eBox(e))) continue;
    strike(e, 14, { launch: -120, basic: true });
    p.vy = -330; p.dj = false; p.airDash = true; setSt(p, 'jump');
    R.stop = 0.05; R.shake = Math.max(R.shake, 2);
    R.fx.push({ k: 'spark', x: p.x, y: p.y, t: 0, n: 7 });
    vfx('exp1_soul', p.x, p.y);
    return;
  }
}

/* ---------- 常态技能 ---------- */
// U 送葬突刺：穿过的敌人受伤并刻墓志；对眩晕中的敌人必定暴击
function thrustHits(p) {
  const box = { x0: p.x - 16, x1: p.x + 16, y0: p.y - 36, y1: p.y };
  for (const e of alive()) {
    if (p.hitSet.has(e) || !overlap(box, eBox(e))) continue;
    p.hitSet.add(e);
    if (e.st === 'stun') p.stunHits++;
    p.vx *= 0.75;   // 穿过一个敌人只略微减速，保留冲劲（不急停）
    vfx('exp1_soul', e.x, e.y - 16);
    strike(e, SK.u.dmg, { critStun: true, mark: SK.u.mark, skill: 'u', kb: p.face * 40 });
    R.stop = Math.max(R.stop, 0.03); R.shake = Math.max(R.shake, 2);
  }
}

// I 掷碑：墓碑巨剑像回旋镖一样飞出、悬停、飞回；去程回程各打一次，打中的敌人被钉住（算眩晕）
function throwBlade(p) {
  snd('throw');
  const a = p.aimUp ? -Math.PI / 4 : 0;
  R.blade = {
    x: p.x + p.face * 14, y: p.y - 22, vx: Math.cos(a) * SK.i.speed * p.face, vy: Math.sin(a) * SK.i.speed,
    phase: 'out', t: 0, hit: new Set(), spin: 0,
  };
  R.shake = Math.max(R.shake, 1);
}
function updateBlade(dt) {
  const b = R.blade, p = R.p;
  if (!b) return;
  b.t += dt; b.spin += dt * 26;
  if (b.phase === 'out') {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.t >= SK.i.out * (1 + mv('bladeFar')) || b.x < 8 || b.x > ROOM.w - 8 || b.y < 24) { b.phase = 'hover'; b.t = 0; }
  } else if (b.phase === 'hover') {
    if (b.t >= (mv('bladeStay') ? 3 : SK.i.hover)) { b.phase = 'back'; b.t = 0; b.hit = new Set(); }
  } else {
    const dx = p.x - b.x, dy = p.y - 22 - b.y, d = Math.hypot(dx, dy);
    const v = SK.i.back + b.t * 500;
    if (d < 14 || d < v * dt) { R.blade = null; setCd(p, 'i', mv('bladeStay') ? 3 : 0); p.catchT = 0.18; return; }   // 接住，冷却从这时开始
    b.vx = dx / d * v; b.vy = dy / d * v;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  if (b.phase === 'hover') return;
  const box = { x0: b.x - 12, x1: b.x + 12, y0: b.y - 12, y1: b.y + 12 };
  for (const e of alive()) {
    if (b.hit.has(e) || !overlap(box, eBox(e))) continue;
    b.hit.add(e);
    vfx('exp1_soul', b.x, b.y);
    strike(e, SK.i.dmg * (1 + mv('bladeDmg')), { skill: 'i', stun: SK.i.pin + mv('bladePin'), kb: sign(b.vx) * 20 });
    R.shake = Math.max(R.shake, 1);
  }
}
// I 瞬身：瞬移到剑的位置，路径上的敌人各斩一刀（钉住的必定暴击）；瞬移带无敌，穿过正在出招的敌人算完美闪避
function blink(p) {
  const b = R.blade;
  snd('blink');
  const x0 = p.x, y0 = p.y, x1 = clamp(b.x, 10, ROOM.w - 10), y1 = Math.min(b.y + 22, ROOM.ground);
  p.face = sign(x1 - x0) || p.face;
  p.perfectUsed = false;
  checkPerfect(p);
  for (const e of alive()) {
    if (segDist(e.x, e.y - 12, x0, y0 - 18, x1, y1 - 18) > 26) continue;
    if (enemyDanger(e, p, eBox(e), 0.2, true)) triggerPerfect(p, e);   // 瞬身路线穿过它本身，判定框用它自己的
    strike(e, SK.i.slash, { skill: 'i', critStun: true, kb: p.face * 60 });
  }
  for (let k = 0; k < 4; k++) afterImage(p, lerp(x0, x1, k / 4), lerp(y0, y1, k / 4));
  R.fx.push({ k: 'line', x: x0, y: y0 - 20, x1, y1: y1 - 20, t: 0 });
  vfx('exp6_soul', x1, y1 - 18);
  p.x = x1; p.y = y1; p.vx = p.face * 60; p.vy = 0; p.ground = y1 >= ROOM.ground; p.inv = 0.25; p.dj = false; p.airDash = true;
  if (!mv('bladeStay')) { R.blade = null; setCd(p, 'i'); }
  p.chainT = 1;
  setSt(p, 'blink');
  R.stop = Math.max(R.stop, 0.05); R.shake = Math.max(R.shake, 2);
}

// O 断空：拔刀一闪，前方区域延迟爆出斩痕；屏幕里带墓志的敌人身上也各爆一道
function doIai(p) {
  snd('iai');
  const c = { x: p.x + p.face * 90, y: p.y - 24, w: 120 * (1 + mv('iaiWide') + mv('normRange')), h: 70, area: true, t: 0, delay: mv('iaiFast') ? 0.15 : SK.o.delay, dmg: SK.o.dmg };
  c.lines = Array.from({ length: 5 }, () => ({ dx: rnd(-50, 50), dy: rnd(-24, 24), a: rnd(0, Math.PI), l: rnd(22, 40) }));
  R.cuts.push(c);
  for (const e of alive()) {
    if (e.mark > 0 && onScreen(p, e)) R.cuts.push(cutOn(e, c.delay, SK.o.markDmg));
  }
  R.fx.push({ k: 'streak', x: p.x, y: p.y - 22, face: p.face, t: 0 });
  R.shake = Math.max(R.shake, 1);
}
function cutOn(e, delay, dmg, wait = false) {
  return { e, x: e.x, y: e.y - 14, t: 0, delay, dmg, wait, lines: [{ dx: 0, dy: 0, a: rnd(0, Math.PI), l: rnd(26, 36) }] };
}
function updateCuts(dt) {
  for (const c of R.cuts) {
    if (c.e && c.e.st !== 'dead') { c.x = c.e.x; c.y = c.e.y - 14; }
    if (c.wait) continue;
    c.t += dt;
    if (c.done || c.t < c.delay) continue;
    c.done = true; snd('iaiCut');
    const col = c.red ? 'blood' : 'soul';
    for (const ln of c.lines) vfx('cut_' + col, c.x + ln.dx, c.y + ln.dy, { rot: ln.a + Math.PI / 4 });
    vfx((c.area || c.big ? 'exp2_' : 'exp1_') + col, c.x, c.y);
    if (c.area) {
      const box = { x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: c.y - c.h / 2, y1: c.y + c.h / 2 };
      for (const e of alive()) if (overlap(box, eBox(e))) strike(e, c.dmg, { skill: 'o', stun: SK.o.stun });
    } else if (c.e) strike(c.e, c.dmg, { skill: 'o', stun: SK.o.stun, mark: c.mk ? SK.u.mark : 0 });
    R.shake = Math.max(R.shake, 2);
  }
  R.cuts = R.cuts.filter((c) => !c.done || c.t < c.delay + 0.25);
}

// O 瞬狱（时空断裂中）：在屏幕内所有敌人之间来回穿梭，每只留下 3 道斩痕，收刀时一起爆开；之后断裂结束
function startStorm(p, red = false) {
  const list = alive().filter((e) => onScreen(p, e)).sort((a, b) => a.x - b.x).slice(0, SK.o.stormMax);
  if (!list.length) return false;
  if (Math.abs(list[list.length - 1].x - p.x) < Math.abs(list[0].x - p.x)) list.reverse();   // 从近的一端开始
  p.storm = { list, i: 0, t: 0, red, cages: [], w0: R.witch };
  snd('storm', red ? { rate: 0.8 } : undefined);
  setSt(p, 'storm'); p.inv = 9; p.vx = 0; p.vy = 0;
  if (R.blade) R.blade = null;
  R.flash = 0.12; if (red) R.flashCol = '255,60,70';
  say(red ? '血狱' : '瞬狱', red ? '#ff6a6a' : '#8fd8ff');
  return true;
}
function updateStorm(p, dt) {
  const s = p.storm;
  s.t += dt;
  while (s.i < s.list.length && s.t >= s.i * SK.o.stormStep) {
    const e = s.list[s.i++];
    const nx = clamp(e.x + (s.i % 2 ? -22 : 22), 10, ROOM.w - 10);
    afterImage(p);
    R.fx.push({ k: 'line', x: p.x, y: p.y - 20, x1: nx, y1: e.y - 20, t: 0 });
    p.x = nx; p.y = e.y; p.face = sign(e.x - p.x) || p.face;
    if (s.red) s.cages.push(vfx('prison', e.x, e.y, { ground: true, hold: [2, 3] }));   // 血狱：脚下炸出血棘牢笼，收刀时一起斩碎
    const nCuts = s.red ? (mv('rageStormCuts') ? 5 : SK.o.stormCuts) : (mv('stormCuts5') ? 5 : SK.o.stormCuts);
    for (let k = 0; k < nCuts; k++) {
      const c = cutOn(e, 0, (s.red ? TSK.stormDmg : SK.o.stormDmg) * (!s.red && mv('iaiOnly') ? 1.6 : 1), true);
      c.big = k === nCuts - 1;   // 每只敌人最后一道带大爆炸
      c.red = s.red; c.mk = !!mv('stormMark');
      R.cuts.push(c);
    }
    R.shake = Math.max(R.shake, 1);
  }
  if (s.i >= s.list.length && s.t >= s.list.length * SK.o.stormStep + 0.25) {
    // 收刀：全部斩痕依次爆开
    let k = 0;
    for (const c of R.cuts) if (c.wait) { c.wait = false; c.t = 0; c.delay = 0.1 + (k++ % SK.o.stormCuts) * 0.06; }
    s.cages.forEach(releaseFx);
    p.inv = p.form === 'blood' ? p.inv : 0.4; p.storm = null;
    R.witch = !s.red && mv('stormKeep') ? Math.max(0.3, s.w0 * 0.5) : Math.min(R.witch, 0.3); R.stop = 0.08; R.shake = 5;
    buzz(80);
    p.ground = landOn(p, p.y, true) || p.y >= ROOM.ground;
    setSt(p, 'sheathe');
  }
}

/* ---------- 变身 ---------- */
// 变身瞬间的冲击波：屏幕内所有敌人挨一下并被掀飞，带墓志的额外翻倍
function transformWave(p) {
  summonShade(p);
  burst(p.x, p.y - 20, 70, { up: 120, v1: 260 });
  vfx('exp2_blood', p.x, p.y - 24);
  R.flash = 0.12; R.flashCol = '255,60,70';
  R.shake = Math.max(R.shake, 4); R.stop = 0.08;
  buzz(60);
  for (const e of alive()) if (onScreen(p, e)) strike(e, RAGE.wave * (e.mark > 0 ? (mv('markBurst') ? 3 : 2) : 1), { launch: e.mark > 0 && mv('markBurst') ? -360 : -200, kb: sign(e.x - p.x) * 120 });
}

// 普攻刀气：血色月牙横穿半个屏幕，穿透
function updateShots(dt) {
  for (const s2 of R.shots) {
    s2.t += dt; s2.x += s2.vx * dt;
    const r = s2.big ? 20 : 14;
    const box = { x0: s2.x - 10, x1: s2.x + 10, y0: s2.y - r, y1: s2.y + r };
    for (const e of alive()) {
      if (s2.hit.has(e) || !overlap(box, eBox(e))) continue;
      s2.hit.add(e);
      vfx('wave_hit', e.x, e.y - 16, { flip: s2.vx < 0 });
      strike(e, TSK.waveDmg * (s2.big ? 1.5 : 1), { kb: sign(s2.vx) * 60 });
    }
  }
  R.shots = R.shots.filter((s2) => s2.t < TSK.waveLife);
}

// 血影闪：几乎无冷却的瞬移冲刺，路径上的敌人各挨一刀
function shadowHits(p) {
  const box = { x0: p.x - 18, x1: p.x + 18, y0: p.y - 38, y1: p.y + 2 };
  for (const e of alive()) {
    if (p.hitSet.has(e) || !overlap(box, eBox(e))) continue;
    p.hitSet.add(e);
    strike(e, TSK.shadowDmg, { kb: p.face * 80 });
  }
}

// U 碑雨：1.5 秒内墓碑砸满全屏，一半瞄准敌人、一半随机
function updateRain(dt) {
  const r = R.rain;
  if (r) {
    r.t += dt; r.acc += dt;
    while (r.acc >= TSK.rainGap && r.t < TSK.rainT + mv('rainExtra')) {
      r.acc -= TSK.rainGap; r.k++;
      const tg = alive().filter((e) => onScreen(R.p, e));
      let x, y;
      if (r.k % 2 && tg.length) { const e = tg[Math.floor(Math.random() * tg.length)]; x = e.x + rnd(-10, 10); y = e.y; }
      else { x = R.cam.x + rnd(20, RB_W - 20); y = ROOM.ground; }
      R.drops.push({ x, y, t: 0 });
      R.fx.push({ k: 'drop', x, y, t: 0, v: r.k % 3 });
    }
    if (r.t >= TSK.rainT + mv('rainExtra')) R.rain = null;
  }
  for (const d of R.drops) {
    d.t += dt;
    if (d.done || d.t < 0.1) continue;   // 墓碑落地那一刻才结算
    d.done = true; snd('rain');
    vfx('grave_break', d.x, d.y, { ground: true, delay: 0.1 });   // 插地 0.1 秒后碎开
    burst(d.x, d.y - 4, 6, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 120 });
    const box = { x0: d.x - 14, x1: d.x + 14, y0: d.y - 34, y1: d.y + 4 };
    let n = 0;
    for (const e of alive()) if (overlap(box, eBox(e))) { strike(e, TSK.rainDmg, { launch: -160 }); n++; }
    if (n) vfx('grave_hands', d.x, d.y, { ground: true });   // 砸中了，地里伸出亡魂手
    R.shake = Math.max(R.shake, 1.5);
  }
  R.drops = R.drops.filter((d) => !d.done);
}

// I 血爪乱舞：抓住前方一只敌人，左右来回砸地 4 下（每下波及周围），最后甩飞；前面没敌人就原地挥爪一记
function startMaul(p) {
  const box = faceBox(p, { x0: -6, x1: 90, y0: -50, y1: 8 });
  const e = alive().filter((o) => overlap(box, eBox(o))).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
  setSt(p, 'tmaul'); p.vx = 0;
  p.maul = e ? { e, i: 0, t: 0 } : null;
  if (e) { strike(e, TSK.maulDmg, {}); if (e.st !== 'dead' && !e.boss) { e.st = 'carried'; e.t = 0; p.maul.side0 = p.face; } else p.maul = null; }
  const cx0 = e ? e.x : p.x + p.face * 40;   // 地底血爪从敌人脚下破土
  vfx('claw_up', cx0, p.y, { ground: true, flip: p.face < 0 });
  burst(cx0, p.y - 2, 10, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 140 });
  if (!p.maul) { doHit(p, 'tc2'); vfx('claw_toss', cx0, p.y, { ground: true, flip: p.face < 0, delay: 0.18 }); }
}
function updateMaul(p, dt) {
  const m = p.maul;
  if (!m) { if (p.t >= 0.3) setSt(p, 'idle'); return; }
  m.t += dt;
  const e = m.e;
  if (e.st === 'dead') { endMaul(p); setSt(p, 'idle'); return; }
  while (m.i < TSK.maulSlams && m.t >= (m.i + 1) * TSK.maulGap) {
    m.i++;
    const side = (m.i % 2 ? -1 : 1) * m.side0;
    e.x = clamp(p.x + side * 30, 16, ROOM.w - 16); e.y = p.y;
    p.face = side;
    strike(e, TSK.maulDmg, {});
    for (const o of alive()) if (o !== e && Math.abs(o.x - e.x) < 80 && Math.abs(o.y - e.y) < 40) strike(o, TSK.maulAoe, { launch: -150, kb: sign(o.x - e.x) * 120 });
    vfx('claw_slam', e.x - side * 7, p.y, { ground: true, flip: side < 0 });   // 巨爪攥着敌人砸下去
    burst(e.x, e.y - 4, 14, { a0: Math.PI, a1: Math.PI * 2, v1: 160 });
    R.shake = Math.max(R.shake, 3); R.stop = Math.max(R.stop, 0.04);
    buzz(25);
    if (e.st === 'dead') { endMaul(p); setSt(p, 'idle'); return; }
  }
  if (e.st === 'carried' && m.i < TSK.maulSlams) {   // 两次砸地之间，敌人被巨爪拎在头顶
    const side = (m.i % 2 ? -1 : 1) * m.side0;
    e.x = p.x + side * 14; e.y = p.y - 34;
  }
  if (m.i >= TSK.maulSlams && !m.thrown) {
    m.thrown = true;
    strike(e, TSK.tossDmg, { launch: -360, kb: p.face * 320 });
    vfx('claw_toss', e.x, p.y, { ground: true, flip: p.face < 0 });
    R.stop = 0.08; R.shake = 5;
  }
  if (m.thrown && m.t >= (TSK.maulSlams + 1) * TSK.maulGap + 0.15) { p.maul = null; setSt(p, 'idle'); }
}
function endMaul(p) {
  const m = p.maul;
  if (m && m.e.st === 'carried') { m.e.st = 'stun'; m.e.t = 0; m.e.stunT = 0.4; m.e.y = p.y; }
  p.maul = null;
}

// P 葬：血契之影捧起巨碑砸地（burial 第 5 帧落地），主角同步砸下；伤害 = 基础 + 本次暴走连击数 × 1.5
const FIN = { hitT: 4 / 12, after: 0.5, heroFps: 6, back: -8, land: 40 };   // hitT 对齐 burial 落地帧；heroFps 让主角第 2 帧同时砸下
function startFinisher(p) {
  endMaul(p); setSt(p, 'tfinish');
  R.shade = null;   // 常驻的影子换成捧碑的那一套
  vfx('burial', p.x + FIN.back * p.face, p.y, { ground: true, flip: p.face < 0, back: true });
}
function doFinisher(p) {
  snd('finisher');
  const dmg = TSK.finBase + R.rcombo * (mv('finFull') ? 2.5 : TSK.finCombo);
  for (const e of alive()) if (onScreen(p, e)) strike(e, dmg, { launch: -260, kb: sign(e.x - p.x) * 120 });
  const fx0 = p.x + (FIN.back + FIN.land) * p.face;
  burst(fx0, p.y - 6, 110, { a0: Math.PI, a1: Math.PI * 2, up: 60, v0: 80, v1: 320, life: 0.9 });
  for (const dx of [-40, 0, 40]) vfx('exp2_blood', fx0 + dx, p.y + 4, { ground: true, delay: Math.abs(dx) / 400 });
  R.flash = 0.15; R.flashCol = '255,60,70';
  R.shake = 6; R.stop = 0.12;
  buzz(80);
  say(`葬　连击 ×${R.rcombo}`, '#ff6a6a');
}

function hurtPlayer(p, dmg, fromX, src) {
  if (p.inv > 0 || p.st === 'dead') return false;
  if (p.form === 'blood') return true;   // 暴走中真正无敌：攻击直接无效（返回 true 让敌人这一扑算结算过）
  if (R.M || R.cfg || (src && src.elite)) {
    const skilling = ['thrust', 'throw', 'blink', 'iai', 'storm'].includes(p.st);
    dmg = Math.max(1, Math.round(dmg * (R.cfg ? R.cfg.eMul.dmg : 1) * (src && src.elite ? 1.3 : 1) * (1 - Math.min(0.5, mv('reduce'))) * (skilling ? 1 - mv('castReduce') : 1)));
  }
  if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; }
  p.pdStacks = 0; p.streak = 0;
  p.hp = Math.max(0, p.hp - dmg); snd('hurt');
  p.soul = Math.max(0, p.soul - 1);   // 挨打掉 1 格魂
  const away = p.x < fromX ? -1 : 1;
  p.vx = away * 160; p.vy = -150; p.ground = false; p.coy = 0; p.inv = 0.9; p.combo = -1;
  setSt(p, 'hurt');
  buzz(60);
  R.shake = 4; R.stop = 0.08;
  R.nums.push({ x: p.x, y: p.y - 44, v: dmg, c: '#ff6a6a', t: 0 });
  if (p.hp <= 0) { setSt(p, 'dead'); R.dead = true; }
  return true;
}

/* 完美闪避：冲刺/突刺/瞬身起手时，若有敌人正处在出招判定中、或蓄力只剩最后 0.15 秒且在攻击范围内。
   触屏开了「完美闪避辅助」时窗口放宽到 0.24 秒、范围 110（约 1.5 倍）。 */
function checkPerfect(p) {
  const pb = pBox(p), win = assistOn() ? 0.24 : 0.15, reach = assistOn() ? 110 : 90;
  for (const e of R.en) {
    if (e.st === 'dead') continue;
    const near = Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < 50;
    if (enemyDanger(e, p, pb, win, near)) { triggerPerfect(p, e); return; }
  }
  // 火球就要撞上（约 0.25 秒内到）也算
  for (const b of R.eshots) {
    if (b.refl) continue;
    const dx = p.x - b.x, dy = p.y - 18 - b.y, d = Math.hypot(dx, dy);
    if (d < (assistOn() ? 60 : 46) && dx * b.vx + dy * b.vy > 0) { triggerPerfect(p, null); return; }
  }
}
// 敌人「正在出招 / 马上出招」：出招判定已经罩住主角，或蓄力只剩最后 win 秒且离得近
function enemyDanger(e, p, pb, win, near) {
  switch (etype(e)) {
    case 'hound': return (e.st === 'leap' && overlap(pb, leapBox(e))) || (e.st === 'windup' && e.t > HOUND.windup - win && near);
    case 'skel': return (e.st === 'lunge' && overlap(pb, skelBox(e))) || (e.st === 'windup' && e.t > SKEL.windup - win && near);
    case 'brute': return (e.st === 'slam' && overlap(pb, bruteBox(e))) || (e.st === 'windup' && e.t > BRUTE.windup - win && near);
    case 'ghost': return (e.st === 'shriek' && overlap(pb, shriekBox(e))) || (e.st === 'windup' && e.t > GHOST.windup - win && overlap(pb, shriekBox(e, 20)));
    case 'boss': return bossDanger(e, p, pb, win);
  }
  return false;
}
function triggerPerfect(p, e) {
  if (p.perfectUsed) return;
  p.perfectUsed = true;
  if (e) e.dodged = true;
  if (e && etype(e) === 'brute' && e.st !== 'stun') {   // 完美闪避重甲兵：护甲被晃开，晕 2.2 秒
    e.st = 'stun'; e.t = 0; e.stunT = 2.2; e.vx = 0; R.fx.push({ k: 'spark', x: e.x, y: e.y - 30, t: 0, n: 12 });
  }
  gainSoul(1); snd('perfect');
  if (p.st === 'thrust' && mv('thrustParry')) { gainSoul(1); p.cd.u = 0; }
  if (mv('pdStack')) { p.pdStacks = Math.min(3, p.pdStacks + 1); p.pdT = 8; }
  if (mv('pdCrit')) p.pdEye = 3;
  if (mv('pdShield') && !mv('noShield')) p.shield = Math.round(p.mx * mv('pdShield'));
  R.fx.push({ k: 'ring', x: p.x, y: p.y - 18, t: 0 });
  buzz(40);
  if (R.witch > 0) return;
  R.witch = WITCH_T + mv('pdSlow'); R.banner = 1.2; R.stop = 0.06; R.flash = 0.15;
  R.fx.push({ k: 'pulse', x: p.x, y: p.y - 18, t: 0 });
}

/* ---------- 敌人 ---------- */
function spawnEnemy(type, x, y, o = {}) {
  const e = { type, x, y, vx: 0, vy: 0, face: -1, hp: EMAX[type], maxHp: EMAX[type], st: 'patrol', t: 0, flash: 0, home: x, pdir: -1, ground: true,
    hitPlayer: false, an: rnd(0, 1), mark: 0, stunT: 0.28, cd: rnd(0.6, 1.6), ...o };
  if (type === 'skel') { e.st = 'rise'; e.skin = Math.random() < 0.5 ? 'skelc' : 'skel'; }
  else if (type === 'brute') { e.st = 'rise'; e.skin = 'skelc'; }
  else if (type === 'ghost') { e.st = 'drift'; e.ground = false; }
  else if (type === 'wiz') e.st = 'idle';
  R.en.push(e);
  return e;
}
function spawnHound(x, y) { return spawnEnemy('hound', x, y); }
const leapBox = (e) => ({ x0: e.x - 20, x1: e.x + 20, y0: e.y - 28, y1: e.y });

function hurtEnemy(e, dmg, kb, launch, o = {}) {
  e.hp -= dmg; e.flash = 0.12;
  if (e.hp > 0) snd(o.crit ? 'hitCrit' : 'hit'); else if (!e.boss) snd('kill');
  R.nums.push({ x: e.x + rnd(-10, 10), y: e.y - 34 - rnd(0, 8), v: dmg, c: o.crit ? '#ffd23a' : '#fff2c0', big: o.crit, t: 0 });   // 抖开，挤在一起的敌人数字不糊成一团
  vfx('hit_' + tint(), e.x + rnd(-4, 4), e.y - 14 + rnd(-4, 4), { rot: rnd(0, 6.28) });
  if (o.crit) vfx('exp1_' + tint(), e.x, e.y - 16);
  if (e.hp <= 0 && e.boss) { bossDown(e); return; }
  if (e.hp <= 0) {
    e.st = 'dead'; R.kills++;
    R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });
    vfx('exp6_' + tint(), e.x, e.y - 16);
    if (e.elite) { gainSoul(1); say('精英击破　魂 +1', '#ffd23a'); }
    if (R.p.form === 'blood') R.p.rage = Math.min(R.p.rageMax, R.p.rage + (mv('soloRage') ? 0 : RAGE.killAdd + mv('killAddPlus')));   // 暴走中越杀越久
    if (mv('killHeal')) R.p.hp = Math.min(R.p.mx, R.p.hp + Math.round(R.p.mx * mv('killHeal') / 100));
    return;
  }
  if (e.boss) return;   // 霸体
  if (etype(e) === 'brute') {   // 重甲兵不被打断；突刺穿过去能把护甲打碎、晃晕一会儿
    if (o.breakArmor && e.st !== 'stun') { e.st = 'stun'; e.t = 0; e.stunT = o.breakArmor; e.vx = 0; R.fx.push({ k: 'spark', x: e.x, y: e.y - 30, t: 0, n: 9 }); }
    return;
  }
  e.vx = kb;
  if (launch) { e.vy = launch; e.ground = false; e.st = 'air'; e.t = 0; }
  else if (e.st === 'air') { e.vy = Math.min(e.vy, -120); }
  else if (e.st === 'carried') { /* 被血爪拖着走，不打断 */ }
  else {
    const left = e.st === 'stun' ? e.stunT - e.t : 0;
    e.st = 'stun'; e.t = 0; e.stunT = Math.max(left, o.stun || 0.28);
  }
}

// 敌人出招判定碰到主角：冲刺 / 突刺 / 瞬身的无敌中算完美闪避，否则挨打
function enemyHits(e, p, box, dmg) {
  if (e.hitPlayer || !overlap(pBox(p), box)) return;
  if (['dash', 'thrust', 'blink'].includes(p.st) && p.inv > 0) { triggerPerfect(p, e); e.hitPlayer = true; }
  else if (hurtPlayer(p, dmg, e.x, e)) e.hitPlayer = true;
}
// 预警闪白那一刻手机轻震，眼睛没盯着也能靠手感反应
function tellBuzz(e, p, windup) {
  if (!e.buzzed && e.t > windup * 0.72 && Math.abs(p.x - e.x) < 160 && Math.abs(p.y - e.y) < 60) { e.buzzed = true; buzz(20); snd('tell'); }
}
// 受击共用状态：眩晕 / 被血爪拎着 / 被打飞。返回 true 表示这一帧已处理完
function sharedState(e, dt, wake) {
  switch (e.st) {
    case 'stun':
      e.vx *= Math.pow(0.01, dt);
      if (e.t >= e.stunT) { e.st = wake; e.t = 0; }
      return true;
    case 'carried':   // 被血爪拎着：位置由主角那边每帧摆好
      e.vx = 0; e.vy = 0;
      return true;
    case 'air':
      e.vx *= Math.pow(0.3, dt);
      if (e.ground && e.t > 0.05) { e.st = 'stun'; e.t = 0; e.stunT = 0.28; R.shake = Math.max(R.shake, 1); }
      return true;
  }
  return false;
}

function enemyUpdate(e, p, dt) {
  e.t += dt; e.flash -= dt; e.an += dt; e.cd -= dt; e.mark = Math.max(0, e.mark - dt); e.armorT = Math.max(0, (e.armorT || 0) - dt);
  const T = etype(e);
  if (T === 'hound') houndAI(e, p, dt);
  else if (T === 'skel') skelAI(e, p, dt);
  else if (T === 'brute') bruteAI(e, p, dt);
  else if (T === 'ghost') ghostAI(e, p, dt);
  else if (T === 'wiz') wizAI(e, p, dt);
  else if (T === 'boss') bossAI(e, p, dt);
  if (e.st === 'dead' || e.st === 'carried') return;
  if (T === 'ghost' || bossFlying(e)) floatPhys(e, dt);
  else groundPhys(e, dt);
}

function houndAI(e, p, dt) {
  const dx = p.x - e.x, dy = p.y - e.y, adx = Math.abs(dx);
  const seen = adx < HOUND.sight && Math.abs(dy) < 60 && !R.dead;
  if (sharedState(e, dt, 'chase')) return;
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
      tellBuzz(e, p, HOUND.windup);
      if (e.t >= HOUND.windup) { snd('houndLeap'); e.st = 'leap'; e.t = 0; e.vx = e.face * HOUND.leapVx; e.vy = HOUND.leapVy; e.ground = false; e.hitPlayer = false; }
      break;
    case 'leap':
      enemyHits(e, p, leapBox(e), HOUND.dmg);
      if (e.ground && e.t > 0.1) { e.st = 'recover'; e.t = 0; e.vx = 0; }
      break;
    case 'recover':
      e.vx *= 0.8;
      if (e.t >= HOUND.recover) { e.st = seen ? 'chase' : 'patrol'; e.t = 0; }
      break;
  }
}

const skelBox = (e) => ({ x0: e.x + (e.face > 0 ? -4 : -32), x1: e.x + (e.face > 0 ? 32 : 4), y0: e.y - 38, y1: e.y });
function skelAI(e, p, dt) {
  const dx = p.x - e.x, dy = p.y - e.y;
  if (sharedState(e, dt, 'chase')) return;
  switch (e.st) {
    case 'rise':   // 从土里爬出来，这段时间不动
      e.vx = 0;
      if (e.t >= SKEL.rise) { e.st = 'chase'; e.t = 0; }
      break;
    case 'chase':
      e.face = sign(dx) || e.face;
      e.vx = Math.abs(dx) > 8 && !R.dead ? e.face * SKEL.walk : 0;
      if (Math.abs(dx) < SKEL.reach && Math.abs(dy) < 30 && e.cd <= 0) { e.st = 'windup'; e.t = 0; e.vx = 0; e.dodged = false; e.buzzed = false; }
      break;
    case 'windup':
      e.vx = 0; e.face = sign(dx) || e.face;
      tellBuzz(e, p, SKEL.windup);
      if (e.t >= SKEL.windup) { snd('skelLunge'); e.st = 'lunge'; e.t = 0; e.vx = e.face * SKEL.lungeV; e.hitPlayer = false; }
      break;
    case 'lunge':
      enemyHits(e, p, skelBox(e), SKEL.dmg);
      if (e.t >= SKEL.lungeT) { e.st = 'recover'; e.t = 0; }
      break;
    case 'recover':
      e.vx *= Math.pow(0.001, dt);
      if (e.t >= SKEL.recover) { e.st = 'chase'; e.t = 0; e.cd = 0.5; }
      break;
  }
}

const bruteBox = (e) => ({ x0: e.x + (e.face > 0 ? -10 : -72), x1: e.x + (e.face > 0 ? 72 : 10), y0: e.y - 44, y1: e.y });
function bruteAI(e, p, dt) {
  const dx = p.x - e.x, dy = p.y - e.y;
  if (sharedState(e, dt, 'chase')) return;
  switch (e.st) {
    case 'rise':
      e.vx = 0;
      if (e.t >= SKEL.rise) { e.st = 'chase'; e.t = 0; }
      break;
    case 'chase':
      e.face = sign(dx) || e.face;
      e.vx = Math.abs(dx) > 8 && !R.dead ? e.face * BRUTE.walk : 0;
      if (Math.abs(dx) < BRUTE.reach && Math.abs(dy) < 30 && e.cd <= 0) { e.st = 'windup'; e.t = 0; e.vx = 0; e.dodged = false; e.buzzed = false; }
      break;
    case 'windup':
      e.vx = 0; e.face = sign(dx) || e.face;
      tellBuzz(e, p, BRUTE.windup);
      if (e.t >= BRUTE.windup) {
        e.st = 'slam'; e.t = 0; e.hitPlayer = false; R.shake = Math.max(R.shake, 3); snd('bossLand', { gain: 0.55, rate: 1.25 });
        burst(e.x + e.face * 40, e.y - 4, 22, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 220 });
      }
      break;
    case 'slam':
      enemyHits(e, p, bruteBox(e), BRUTE.dmg);
      if (e.t >= BRUTE.slamT) { e.st = 'recover'; e.t = 0; }
      break;
    case 'recover':   // 落空后的破绽：护甲失效，吃全伤
      e.vx = 0;
      if (e.t >= BRUTE.recover) { e.st = 'chase'; e.t = 0; e.cd = 0.8; }
      break;
  }
}

const shriekBox = (e, pad = 0) => { const r = GHOST.radius + pad; return { x0: e.x - r, x1: e.x + r, y0: e.y - 24 - r, y1: e.y - 24 + r }; };
function ghostAI(e, p, dt) {
  if (e.st === 'air') { e.st = 'stun'; e.t = 0; e.stunT = 0.45; e.vy = 0; }   // 幽灵不受重力，打飞改成定身
  if (['stun', 'carried'].includes(e.st)) e.hide = false;
  if (sharedState(e, dt, 'drift')) return;
  const dx = p.x - e.x, ty = p.y - GHOST.hover;
  switch (e.st) {
    case 'drift': {
      e.face = sign(dx) || e.face;
      e.vx = Math.abs(dx) > 30 ? e.face * GHOST.drift : e.vx * 0.9;
      e.vy = clamp((ty - e.y) * 2, -70, 70);
      if (Math.hypot(dx, ty - e.y) < GHOST.sight && e.cd <= 0 && !R.dead) { e.st = 'vanish'; e.t = 0; e.vx = 0; e.vy = 0; }
      break;
    }
    case 'vanish':   // 化成烟，前 0.15 秒还打得到
      e.hide = e.t > 0.15;
      if (e.t >= GHOST.vanish) { e.st = 'hidden'; e.t = 0; }
      break;
    case 'hidden':
      e.hide = true;
      if (e.t >= GHOST.hidden) {   // 绕到主角背后现身
        e.x = clamp(p.x - p.face * GHOST.behind, 20, ROOM.w - 20); e.y = p.y - 4;
        e.face = sign(p.x - e.x) || 1;
        e.st = 'appear'; e.t = 0;
      }
      break;
    case 'appear':
      e.hide = e.t < GHOST.appear * 0.6;
      if (e.t >= GHOST.appear) { e.st = 'windup'; e.t = 0; e.hide = false; e.dodged = false; e.buzzed = false; }
      break;
    case 'windup':
      tellBuzz(e, p, GHOST.windup);
      if (e.t >= GHOST.windup) { e.st = 'shriek'; e.t = 0; e.hitPlayer = false; R.fx.push({ k: 'shriek', x: e.x, y: e.y - 24, t: 0 }); snd('ghostShriek'); }
      break;
    case 'shriek':
      enemyHits(e, p, shriekBox(e), GHOST.dmg);
      if (e.t >= GHOST.shriek) { e.st = 'drift'; e.t = 0; e.cd = GHOST.cd; }
      break;
  }
}

function wizAI(e, p, dt) {
  if (sharedState(e, dt, 'idle')) return;
  const dx = p.x - e.x;
  switch (e.st) {
    case 'idle':
      e.vx = 0; e.face = sign(dx) || e.face;
      if (Math.abs(dx) < WIZ.sight && Math.abs(p.y - e.y) < 220 && e.cd <= 0 && !R.dead) { e.st = 'cast'; e.t = 0; e.fired = false; e.buzzed = false; }
      break;
    case 'cast':   // 第 1~6 帧手里聚火（预警），第 7 帧甩出火球
      e.vx = 0;
      if (!e.fired) { e.face = sign(dx) || e.face; tellBuzz(e, p, WIZ.release / WIZ.castFps); }
      if (!e.fired && e.t >= WIZ.release / WIZ.castFps) { e.fired = true; fireball(e, p); }
      if (e.t >= 10 / WIZ.castFps) { e.st = 'idle'; e.t = 0; e.cd = WIZ.cd; }
      break;
  }
}

/* ---------- Boss：墓渊魔 ---------- */
const bossF = (e) => (e.p2 ? BOSS.fast : 1);   // 狂怒后前摇倍率
const bossFlying = (e) => e.boss && e.st === 'dive' && e.sub < 2;
const bossBody = (e, pad = 0) => ({ x0: e.x + e.face * 10 - 34 - pad, x1: e.x + e.face * 10 + 34 + pad, y0: e.y - 96, y1: e.y });
const breathBox = (e, pad = 0) => {
  const a = e.x + e.face * 16, b = e.x + e.face * (BOSS.breath.reach + pad);
  return { x0: Math.min(a, b), x1: Math.max(a, b), y0: e.y - 64, y1: e.y + 4 };
};
const diveBox = (e, pad = 0) => ({ x0: e.x - BOSS.dive.radius - pad, x1: e.x + BOSS.dive.radius + pad, y0: e.y - 70, y1: e.y + 6 });
function spawnBoss() {
  const x = clamp(R.p.x + 240, 200, ROOM.w - 200);
  const e = spawnEnemy('boss', x, ROOM.ground, { boss: true, st: 'intro', sub: 0, face: sign(R.p.x - x), sumT: 0 });
  say(`${BOSS.name}　降临`, '#ff6a6a'); snd('bossRoar');
  R.shake = 5; R.flash = 0.15; R.flashCol = '255,60,70'; buzz(80);
  burst(e.x, e.y - 4, 40, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 260 });
  return e;
}
function bossDanger(e, p, pb, win) {
  const B = BOSS, f = bossF(e);
  if (e.st === 'charge') return e.sub === 1 ? overlap(pb, bossBody(e, 20)) : e.t > B.charge.windup * f - win && Math.abs(p.x - e.x) < 170 && Math.abs(p.y - e.y) < 60;
  if (e.st === 'breath') return e.sub === 1 ? overlap(pb, breathBox(e)) : e.t > (B.breath.crouch + B.breath.rear) * f - win && overlap(pb, breathBox(e, 20));
  if (e.st === 'dive') return e.sub === 2 && overlap(pb, diveBox(e, 16));
  return false;
}
function bossIdle(e) { e.st = 'idle'; e.t = 0; e.sub = 0; }
function bossRecover(e, t) { e.st = 'recover'; e.t = 0; e.recT = t; e.vx = 0; }
function bossStart(e, st) { if (st === 'charge') snd('bossCharge'); e.lastMove = st; e.st = st; e.t = 0; e.sub = 0; e.vx = 0; e.dodged = false; e.buzzed = false; e.hitPlayer = false; }
// 选招：同一层且贴近 → 吐息 / 冲撞；离得远或不在同一层 → 天降 / 冲撞；狂怒后定期召唤
function bossPick(e, p) {
  const adx = Math.abs(p.x - e.x), same = Math.abs(p.y - e.y) < 40;
  if ((e.p2 || e.variant === 'brood') && e.sumT <= 0) return bossStart(e, 'summon');
  e.face = sign(p.x - e.x) || e.face;
  const r = Math.random();
  if (same && adx < 150) bossStart(e, r < 0.6 ? 'breath' : 'charge');
  else if (same && adx < 320) bossStart(e, r < 0.5 ? 'charge' : 'dive');
  else bossStart(e, 'dive');
}
function bossAI(e, p, dt) {
  const B = BOSS, f = bossF(e), dx = p.x - e.x;
  e.sumT -= dt;
  if (!e.p2 && e.hp <= e.maxHp * B.phase2) { e.p2 = true; e.sumT = 0; say(`${B.name}　狂怒`, '#ff6a6a'); R.shake = 4; snd('bossRoar', { rate: 0.85 }); }
  switch (e.st) {
    case 'intro':
      e.vx = 0;
      if (e.t >= 1.2) bossIdle(e);
      break;
    case 'idle':
      e.face = sign(dx) || e.face;
      e.vx = Math.abs(dx) > B.near ? e.face * B.walk : 0;
      if (e.t >= (e.p2 ? B.gap2 : B.gap) && !R.dead) bossPick(e, p);
      break;
    case 'charge':   // 伏低蓄力 → 冲撞
      if (e.sub === 0) {
        e.vx = 0;
        tellBuzz(e, p, B.charge.windup * f);
        if (e.t >= B.charge.windup * f) { e.sub = 1; e.t = 0; e.vx = e.face * B.charge.v; }
      } else {
        enemyHits(e, p, bossBody(e), B.charge.dmg);
        if (e.t >= B.charge.t) bossRecover(e, B.charge.recover);
      }
      break;
    case 'breath': {   // 伏低 → 展翅后仰（预警）→ 贴地喷火
      const wind = (B.breath.crouch + B.breath.rear) * f;
      if (e.sub === 0) {
        e.vx = 0;
        tellBuzz(e, p, wind);
        if (e.t >= wind) { e.sub = 1; e.t = 0; R.shake = Math.max(R.shake, 2); snd('bossBreath'); }
      } else {
        if (e.t > 0.08 && e.t < B.breath.fire - 0.1) enemyHits(e, p, breathBox(e), B.breath.dmg);
        if (e.t >= B.breath.fire) bossRecover(e, B.breath.recover);
      }
      break;
    }
    case 'dive':   // 飞起 → 盯着主角（地上红圈）→ 砸下震地
      if (e.sub === 0) {
        e.vx = 0; e.vy = -B.dive.h / B.dive.rise;
        if (e.t >= B.dive.rise) { e.sub = 1; e.t = 0; e.vy = 0; }
      } else if (e.sub === 1) {
        e.vy = 0;
        e.x += (p.x - e.x) * Math.min(1, dt * 5);
        e.face = sign(dx) || e.face;
        e.markY = p.ground ? p.y : e.markY ?? ROOM.ground;
        tellBuzz(e, p, B.dive.track * f);
        if (e.t >= B.dive.track * f) { e.sub = 2; e.t = 0; e.vy = B.dive.fall; }
      } else if (e.ground) {
        enemyHits(e, p, diveBox(e), B.dive.dmg);
        R.shake = 6; R.stop = Math.max(R.stop, 0.05); buzz(60); snd('bossLand');
        for (const k of [-1, 0, 1]) vfx('exp2_blood', e.x + k * 44, e.y + 4, { ground: true, delay: Math.abs(k) * 0.05 });
        burst(e.x, e.y - 4, 50, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 300 });
        bossRecover(e, B.dive.recover);
      }
      break;
    case 'summon':   // 后仰召唤：主角身边的地里爬出骷髅
      e.vx = 0;
      if (e.sub === 0 && e.t >= 0.4) {
        e.sub = 1; e.sumT = e.variant === 'brood' ? 9 : B.summon.cd;
        for (let k = 0; k < B.summon.n; k++) spawnEnemy('skel', clamp(p.x + (k - 1) * 70 + 35, 40, ROOM.w - 40), ROOM.ground);
        R.shake = 3;
      }
      if (e.t >= B.summon.t) bossIdle(e);
      break;
    case 'recover':   // 破绽
      e.vx *= Math.pow(0.001, dt);
      if (e.t >= e.recT) bossIdle(e);
      break;
  }
}
function bossDown(e) {
  snd('bossDown');
  e.st = 'dead'; R.kills++;
  R.stop = 0.35; R.shake = 8; R.flash = 0.15; R.flashCol = '255,220,160'; buzz(120);
  for (let k = 0; k < 5; k++) vfx('exp2_blood', e.x + rnd(-40, 40), e.y - rnd(10, 90), { delay: k * 0.08 });
  burst(e.x, e.y - 50, 120, { col: 'stone', v1: 360, life: 1.1 });
  R.fx.push({ k: 'bdead', x: e.x, y: e.y, face: e.face, t: 0, life: 2.4 });
  say(`击败 ${BOSS.name}`, '#ffd23a');
  if (mv('ultKill')) gainSoul(2);
  R.waveT = 4;
  for (const o of R.en) if (o !== e && o.type === 'skel') hurtEnemy(o, o.hp, 0, -200);   // 召来的骷髅一起散架
}

/* 火球：朝主角当前位置直线飞；普攻打中会反弹，反弹后专打敌人 */
function fireball(e, p) {
  snd('fireball');
  const x = e.x + e.face * 16, y = e.y - 36, tx = p.x, ty = p.y - 18, d = Math.hypot(tx - x, ty - y) || 1;
  R.eshots.push({ x, y, vx: (tx - x) / d * WIZ.ballV, vy: (ty - y) / d * WIZ.ballV, t: 0, refl: false });
}
function reflectBalls(p, box) {
  for (const b of R.eshots) {
    if (b.refl || !overlap(box, { x0: b.x - 8, x1: b.x + 8, y0: b.y - 8, y1: b.y + 8 })) continue;
    b.refl = true; b.t = 0; b.vx = p.face * WIZ.reflectV; b.vy = 0; snd('reflect');
    vfx('hit_' + tint(), b.x, b.y);
    R.stop = Math.max(R.stop, 0.06); buzz(20);
  }
}
function updateFireballs(dt, p) {
  for (const b of R.eshots) {
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    const box = { x0: b.x - 6, x1: b.x + 6, y0: b.y - 6, y1: b.y + 6 };
    if (b.refl) {
      const e = alive().find((o) => overlap(box, eBox(o)));
      if (e) { strike(e, WIZ.reflectDmg, { kb: sign(b.vx) * 120 }); b.dead = true; }
    } else if (overlap(box, pBox(p))) {
      if (['dash', 'thrust', 'blink'].includes(p.st) && p.inv > 0) { if (!b.dodged) { b.dodged = true; triggerPerfect(p, null); } }
      else if (hurtPlayer(p, WIZ.dmg, b.x, null)) b.dead = true;
    }
    if (b.y >= ROOM.ground - 2 || b.x < 0 || b.x > ROOM.w || b.t > WIZ.ballLife) b.dead = true;
    if (b.dead) vfx('exp1_blood', b.x, b.y);
  }
  R.eshots = R.eshots.filter((b) => !b.dead);
}

function groundPhys(e, dt) {
  const prevY = e.y;
  e.vy = Math.min(P_MAXFALL, e.vy + P_GRAV * (e.st === 'air' ? 0.75 : 1) * dt);
  e.x = clamp(e.x + e.vx * dt, 16, ROOM.w - 16);
  e.y += e.vy * dt;
  e.ground = e.boss ? e.y >= ROOM.ground : landOn(e, prevY, false);   // Boss 不踩平台，天降一律砸在地面
  if (e.boss && e.y >= ROOM.ground) e.y = ROOM.ground;
  if (e.ground) e.vy = 0;
  // 平台边缘：巡逻时掉头，不主动跳下
  if (e.ground && e.st === 'patrol' && e.y < ROOM.ground) {
    const pl = ROOM.plats.find((q) => e.y === q.y && e.x >= q.x - 4 && e.x <= q.x + q.w + 4);
    if (pl && (e.x < pl.x + 8 || e.x > pl.x + pl.w - 8)) { e.pdir = e.x < pl.x + 8 ? 1 : -1; e.home = pl.x + pl.w / 2; }
  }
}
function floatPhys(e, dt) {
  if (e.st === 'stun') e.vy *= Math.pow(0.05, dt);
  e.x = clamp(e.x + e.vx * dt, 16, ROOM.w - 16);
  e.y = clamp(e.y + e.vy * dt, 60, ROOM.ground);
}

// 第几波出什么：前几波逐个引入新敌人，之后混编
const WAVES = [
  ['skel', 'skel', 'skel', 'hound'],
  ['hound', 'skel', 'skel', 'wiz', 'wiz'],
  ['ghost', 'skel', 'skel', 'skel', 'hound', 'wiz'],
];   // 第 4 波是 Boss，之后混编
const MIX = ['skel', 'hound', 'skel', 'ghost', 'wiz', 'skel', 'hound'];
function spawnWave() {
  R.wave++;
  if (R.wave === BOSS.wave) { spawnBoss(); return; }
  spawnList(WAVES[R.wave - 1] || Array.from({ length: 2 + Math.min(R.wave, 8) }, (_, i) => MIX[(i + R.wave) % MIX.length]));
}
function spawnList(list) {   // 肉鸽战斗里分批刷出，不是一股脑全出现；自由试玩立刻刷
  list.forEach((type, i) => { if (R.cfg) R.pend.push({ t: 0.15 + i * 0.35, type, i }); else spawnOne(type, i); });
}
function spawnOne(type, i) {
  const n0 = R.en.length;
  const el = type[0] === '*';   // 星号 = 精英：血 ×1.8、伤害 ×1.3、金边，击杀 +1 魂
  if (el) type = type.slice(1);
  {
    if (type === 'boss') { spawnBoss(); scaleNew(n0); return; }
    const pl = ROOM.plats[(i * 3 + R.wave) % ROOM.plats.length];
    if (type === 'wiz') {   // 巫师站高台
      const hi = ROOM.plats.filter((q) => q.y < 400);
      const q = hi[(i * 5 + R.wave * 3) % hi.length];
      spawnEnemy('wiz', q.x + q.w / 2, q.y);
    } else if (type === 'skel') {   // 骷髅在主角附近的地里爬出来
      const side = i % 2 ? 1 : -1;
      spawnEnemy('skel', clamp(R.p.x + side * (110 + i * 36), 40, ROOM.w - 40), ROOM.ground);
    } else if (type === 'brute') {   // 重甲兵：离主角远一点的地里爬出来
      const side = i % 2 ? 1 : -1;
      spawnEnemy('brute', clamp(R.p.x + side * (170 + i * 30), 40, ROOM.w - 40), ROOM.ground);
    } else if (type === 'ghost') {
      spawnEnemy('ghost', 300 + ((i * 613 + R.wave * 251) % (ROOM.w - 600)), ROOM.ground - 90);
    } else {
      const useP = i % 2 === 1;
      spawnHound(useP ? pl.x + pl.w / 2 : 500 + ((i * 457 + R.wave * 211) % (ROOM.w - 700)), useP ? pl.y : ROOM.ground);
    }
  }
  if (el) for (const e of R.en.slice(n0)) e.elite = true;
  scaleNew(n0);
}

/* ---------- 绘制 ---------- */
function heroFrame(p) {
  const T = p.t, blood = p.form === 'blood';
  const f = (name, fps, loop, offset = 0, count) => {
    const m = HERO_A[name]; if (!m) return [name, 0];
    const n = count || m.n;
    let i = Math.floor(T * fps);
    i = loop ? i % n : Math.min(i, n - 1);
    return [name, offset + i];
  };
  // 剑刚飞回手里：站着或跑着时先播一下接剑
  if (p.catchT > 0 && !blood && ['idle', 'run', 'land'].includes(p.st)) return ['i_catch', p.catchT > 0.09 ? 0 : 1];
  switch (p.st) {
    case 'idle': return blood ? f('t_idle', 6, true) : f('idle', 6, true);
    case 'run': return blood ? f('t_run', 15, true) : f('run', 14, true);   // 暴走跑得快 1.25 倍，步频跟着提
    case 'jump': return blood ? ['t_idle', 0] : ['jump', p.vy < -150 ? 2 : 3];
    case 'djump': return blood ? ['t_idle', 0] : f('djump', 10, false);
    case 'fall': return blood ? ['t_idle', 0] : ['jump', 4];
    case 'land': return blood ? ['t_stomp', 3] : ['jump', 5];
    case 'dash': return f('dash', 20, false);
    case 'atk': {
      if (!blood) return f('combo', 14, false, COMBO_STEP[p.combo].f0, 4);
      const s = TCOMBO[p.combo];
      return f(s.a, T_FPS, false, s.f0, s.n);
    }
    case 'runatk': return f('runatk', 14, false);
    case 'airatk': return f('airatk', 16, false);
    case 'plunge': return ['plunge', p.t < 0.06 ? 0 : 1];
    case 'hurt': return f('hurt', 10, false, 2, 2);
    case 'dead': return f('death', 6, false);
    case 'thrust': return f('u_thrust', 38, false);
    case 'throw': return f('i_throw', 24, false);
    case 'blink': return f('blink', 28, false);
    case 'iai': return f('o_iai', 29, false);
    case 'storm': return blood ? ['t_sweep', 1 + (Math.floor(p.t * 20) % 2)] : ['blink', 0];
    case 'sheathe': return blood ? ['t_idle', 0] : ['o_iai', 11];
    case 'transform': return f('transform', 12, false);
    case 'rdash': return ['t_sweep', 0];
    case 'train': return f('t_drop', T_FPS, false);
    case 'tmaul': return p.maul && p.maul.i < TSK.maulSlams ? ['t_clawslam', p.maul.t % TSK.maulGap < TSK.maulGap / 2 ? 1 : 3] : f('t_grab', 12, false);
    case 'tfinish': return f('t_finisher', FIN.heroFps, false);
  }
  return ['idle', 0];
}

function drawHero(p, cx, cy) {
  const [name, i] = heroFrame(p);
  const m = HERO_A[name]; const im = rImg(`hero2/hero_${name}.png`);
  if (!m || !ready(im)) return;
  if (p.inv > 0 && p.form !== 'blood' && !['dash', 'thrust', 'blink', 'storm', 'sheathe', 'transform'].includes(p.st) && Math.floor(R.time * 20) % 2 === 0) return;
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
  else if (e.st === 'leap' || e.st === 'air' || e.st === 'carried') { a = 'jump'; fps = 10; }
  const [n, fw, fh] = HOUND.anim[a];
  const im = rImg(`gv/hound/hell-hound-${a}.png`);
  if (!ready(im)) return;
  const i = a === 'jump' ? Math.min(n - 1, Math.floor(e.t * fps)) : Math.floor(e.an * fps) % n;
  const bx = Math.round(e.x - cx), by = Math.round(e.y - cy);
  rx.save();
  rx.translate(bx, by + 1);
  if (e.face > 0) rx.scale(-1, 1);
  if (e.st === 'windup') {
    const k = e.t / HOUND.windup;
    rx.filter = k > 0.72 ? 'brightness(2.6)' : `sepia(1) saturate(6) hue-rotate(-30deg) brightness(${1 + 0.6 * Math.abs(Math.sin(e.t * 18))})`;
  } else if (e.flash > 0) rx.filter = 'brightness(3)';
  rx.drawImage(im, i * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
  rx.restore();
  if (e.st === 'windup') {
    rx.fillStyle = e.t > HOUND.windup * 0.72 ? '#fff' : '#ff3a2a';
    rx.fillRect(bx - 1, by - 48, 3, 6); rx.fillRect(bx - 1, by - 40, 3, 3);
  }
  if (e.st === 'stun') {   // 眩晕：头顶转圈的小星
    rx.fillStyle = '#ffe680';
    for (let s = 0; s < 3; s++) {
      const a2 = R.time * 8 + s * 2.1;
      rx.fillRect(Math.round(bx + Math.cos(a2) * 8), Math.round(by - 30 + Math.sin(a2) * 2), 2, 2);
    }
  }
  if (e.mark > 0 && (e.mark > 2 || Math.floor(R.time * 8) % 2 === 0)) drawMark(bx + 14, by - 34);
  const hpW = 24;
  if (e.hp < HOUND.hp) {
    rx.fillStyle = '#1a0f14'; rx.fillRect(bx - hpW / 2, by - 30, hpW, 3);
    rx.fillStyle = '#d0384a'; rx.fillRect(bx - hpW / 2, by - 30, Math.round(hpW * e.hp / HOUND.hp), 3);
  }
}

/* 新敌人：选帧 → 画精灵（蓄力时变红、最后 28% 闪白）→ 头顶预警 / 眩晕星 / 墓志 / 血条 */
const EANIM = {   // 帧数、帧宽、帧高
  'skel-walk': [8, 44, 52], 'skel-rise': [6, 44, 52], 'skelc-walk': [8, 44, 52], 'skelc-rise': [6, 44, 52],
  'skel-atk': [4, 50, 47, 21], 'skelc-atk': [4, 50, 47, 21],   // 第 4 个数：锚点（脚下）在帧内的 x，缺省取帧中心
  'ghost-idle': [7, 64, 80], 'ghost-appears': [6, 64, 48], 'ghost-shriek': [4, 64, 80], 'ghost-vanish': [7, 64, 64],
  'wiz-idle': [5, 81, 66], 'wiz-fire': [10, 81, 66], fireball: [3, 26, 26],
  'boss-idle': [6, 160, 144, 62, 127], 'boss-atk': [8, 192, 176, 87, 168], 'boss-fire': [5, 160, 96],
  // 专属招式帧（朝右，第 6 个数 1 = 朝右素材，画的时候再镜像）
  'boss-charge': [8, 149, 132, 75, 131, 1], 'boss-breath': [8, 138, 143, 75, 142, 1], 'boss-dive': [8, 183, 149, 99, 148, 1],
  'boss-summon': [4, 198, 146, 99, 144, 1], 'boss-stagger': [2, 198, 146, 99, 145, 1], 'boss-hit': [2, 198, 146, 99, 144, 1], 'boss-dead': [4, 198, 146, 99, 145, 1],   // 第 5 个数：脚底在帧内的 y
};
function enemyFrame(e) {
  const run = (n, fps) => Math.floor(e.an * fps) % n, once = (n, fps) => Math.min(n - 1, Math.floor(e.t * fps));
  switch (etype(e)) {
    case 'brute': {
      const k = e.skin || 'skelc';
      if (e.st === 'rise') return [k + '-rise', once(6, 6 / SKEL.rise)];
      if (e.st === 'chase') return [k + '-walk', run(8, 6)];
      if (e.st === 'windup') return [k + '-atk', e.t < BRUTE.windup * 0.5 ? 0 : 1];
      if (e.st === 'slam') return [k + '-atk', 2];
      if (e.st === 'recover' && e.t < 0.3) return [k + '-atk', 3];
      return [k + '-walk', 2];
    }
    case 'skel': {
      const k = e.skin || 'skel';
      if (e.st === 'rise') return [k + '-rise', once(6, 6 / SKEL.rise)];
      if (e.st === 'chase') return [k + '-walk', run(8, 10)];
      if (e.st === 'windup') return [k + '-atk', e.t < SKEL.windup * 0.5 ? 0 : 1];   // 举爪 → 后仰蓄力
      if (e.st === 'lunge') return [k + '-atk', 2];
      if (e.st === 'recover' && e.t < 0.3) return [k + '-atk', 3];
      return [k + '-walk', 2];
    }
    case 'ghost':
      if (e.st === 'vanish') return ['ghost-vanish', once(7, 7 / GHOST.vanish)];
      if (e.st === 'hidden') return null;
      if (e.st === 'appear') return ['ghost-appears', once(6, 6 / GHOST.appear)];
      if (e.st === 'windup') return ['ghost-shriek', e.t < GHOST.windup * 0.5 ? 0 : 1];
      if (e.st === 'shriek') return ['ghost-shriek', 2 + (Math.floor(e.t * 16) % 2)];
      return ['ghost-idle', run(7, 10)];
    case 'wiz':
      if (e.st === 'cast') return ['wiz-fire', once(10, WIZ.castFps)];
      return ['wiz-idle', run(5, 8)];
    case 'boss': {
      const f = bossF(e), B = BOSS, prog = (d) => Math.min(0.999, e.t / d);
      switch (e.st) {
        case 'charge':
          if (e.sub === 0) return ['boss-charge', Math.min(2, Math.floor(prog(B.charge.windup * f) * 3))];
          return ['boss-charge', 3 + (Math.floor(e.t * 12) % 2)];
        case 'breath':
          if (e.sub === 0) return ['boss-breath', Math.min(3, Math.floor(prog((B.breath.crouch + B.breath.rear) * f) * 4))];
          return ['boss-breath', e.t < 0.15 ? 4 : 5];
        case 'dive':
          if (e.sub === 0) return ['boss-dive', e.t < B.dive.rise * 0.5 ? 0 : 1];
          if (e.sub === 1) return ['boss-dive', 2 + (Math.floor(e.t * 8) % 2)];
          return ['boss-dive', 4];
        case 'summon': return ['boss-summon', e.sub === 0 ? Math.min(2, Math.floor(e.t / 0.4 * 3)) : 3];
        case 'recover': {   // 先播刚才那招的收势，再进入「破绽」喘息
          const lm = e.lastMove;
          if (lm === 'charge' && e.t < 0.45) return ['boss-charge', 5 + Math.min(2, Math.floor(e.t / 0.15))];
          if (lm === 'breath' && e.t < 0.3) return ['boss-breath', 6 + Math.min(1, Math.floor(e.t / 0.15))];
          if (lm === 'dive' && e.t < 0.45) return ['boss-dive', 5 + Math.min(2, Math.floor(e.t / 0.15))];
          return ['boss-stagger', Math.floor(e.t * 4) % 2];
        }
      }
      if (e.flash > 0 && e.st === 'idle') return ['boss-hit', 0];
      return ['boss-idle', run(6, 8)];
    }
  }
  return null;
}
const EWIND = {
  skel: () => SKEL.windup, brute: () => BRUTE.windup, ghost: () => GHOST.windup, wiz: () => WIZ.release / WIZ.castFps,
  boss: (e) => bossF(e) * (e.st === 'charge' ? BOSS.charge.windup : e.st === 'breath' ? BOSS.breath.crouch + BOSS.breath.rear : BOSS.dive.track),
};
function enemyTelling(e) {
  if (e.boss) return ['charge', 'breath'].includes(e.st) ? e.sub === 0 : e.st === 'dive' && e.sub === 1;
  return e.st === 'windup' || (e.st === 'cast' && !e.fired);
}
function drawEnemy(e, cx, cy) {
  const T = etype(e);
  if (T === 'hound') return drawHound(e, cx, cy);
  const fr = enemyFrame(e);
  if (!fr) return;
  const [name, i] = fr, [, fw, fh, ax = fw / 2, ay = fh, right] = EANIM[name], im = rImg(`gv/enemies/${name}.png`);
  if (!ready(im)) return;
  const bx = Math.round(e.x - cx), by = Math.round(e.y - cy), win = EWIND[T](e), tell = enemyTelling(e);
  if (T === 'boss' && e.st === 'dive' && e.sub === 1) drawDiveMark(e, bx, Math.round((e.markY ?? ROOM.ground) - cy), win);
  rx.save();
  rx.translate(bx, by + 1);
  const sc = T === 'brute' ? BRUTE.scale : 1;
  rx.scale(e.face > 0 ? -sc : sc, sc);   // 素材都朝左
  if (tell) {
    const k = e.t / win;
    rx.filter = k > 0.72 ? 'brightness(2.6)' : `sepia(1) saturate(6) hue-rotate(-30deg) brightness(${1 + 0.6 * Math.abs(Math.sin(e.t * 18))})`;
  } else if (e.flash > 0) rx.filter = 'brightness(3)';
  else if (T === 'brute') rx.filter = ['stun', 'recover'].includes(e.st) ? 'brightness(1.15) saturate(1.2)' : 'brightness(0.8) saturate(0.4) drop-shadow(0 0 2px rgba(140,180,255,0.95))';   // 带甲：灰蓝描边；破甲后恢复本色
  else if (e.elite) rx.filter = 'brightness(1.25) drop-shadow(0 0 2px rgba(255,210,60,0.95))';
  else if (T === 'ghost') rx.filter = 'brightness(1.5) drop-shadow(0 0 2px rgba(120,220,255,0.9))';   // 黑袍贴着暗背景看不清，描一圈青光
  else if (T === 'boss') rx.filter = e.st === 'recover' ? 'brightness(1.4) drop-shadow(0 0 3px rgba(255,220,120,0.95))' : 'brightness(1.3) drop-shadow(0 0 2px rgba(255,60,70,0.9))';   // 黑身子描红边；破绽时描金边
  if (right) rx.scale(-1, 1);   // 新招式帧朝右：在「朝左」的局部坐标里再镜像一次
  rx.drawImage(im, i * fw, 0, fw, fh, -ax, -ay, fw, fh);
  if (right) rx.scale(-1, 1);
  if (T === 'boss' && e.st === 'breath' && e.sub === 1) {   // 贴地喷火：火焰条右端接在嘴边
    const fim = rImg('gv/enemies/boss-fire.png'), k = Math.min(4, Math.floor(e.t / BOSS.breath.fire * 5));
    if (ready(fim)) rx.drawImage(fim, k * 160, 0, 160, 96, -142, -95, 92, 96);   // 从新喷火帧的嘴边出发，长度与判定框 136 对齐
  }
  rx.restore();
  if (T === 'boss') { drawBossTell(e, bx, by, tell, win); return; }
  const top = ETOP[T];
  if (T === 'brute' && e.st === 'windup') {   // 砸地范围：脚下一片闪烁的红色
    rx.fillStyle = e.t > BRUTE.windup * 0.72 ? 'rgba(255,255,255,0.7)' : `rgba(255,50,50,${0.25 + 0.25 * Math.abs(Math.sin(e.t * 18))})`;
    rx.fillRect(e.face > 0 ? bx - 10 : bx - 72, by - 44, 82, 44);
  }
  if (T === 'skel' && e.st === 'windup') {   // 地上一道闪烁的红线：前扑会扑到哪
    rx.fillStyle = e.t > SKEL.windup * 0.72 ? 'rgba(255,255,255,0.8)' : `rgba(255,50,50,${0.35 + 0.3 * Math.abs(Math.sin(e.t * 18))})`;
    rx.fillRect(e.face > 0 ? bx : bx - 40, by - 1, 40, 2);
  }
  if (tell) {
    rx.fillStyle = e.t > win * 0.72 ? '#fff' : '#ff3a2a';
    rx.fillRect(bx - 1, by - top - 18, 3, 6); rx.fillRect(bx - 1, by - top - 10, 3, 3);
  }
  if (e.st === 'stun') {
    rx.fillStyle = '#ffe680';
    for (let s2 = 0; s2 < 3; s2++) {
      const a2 = R.time * 8 + s2 * 2.1;
      rx.fillRect(Math.round(bx + Math.cos(a2) * 8), Math.round(by - top + Math.sin(a2) * 2), 2, 2);
    }
  }
  if (e.mark > 0 && (e.mark > 2 || Math.floor(R.time * 8) % 2 === 0)) drawMark(bx + 14, by - top - 4);
  if (e.hp < e.maxHp) {
    const hpW = 24;
    rx.fillStyle = '#1a0f14'; rx.fillRect(bx - hpW / 2, by - top, hpW, 3);
    rx.fillStyle = '#d0384a'; rx.fillRect(bx - hpW / 2, by - top, Math.round(hpW * e.hp / e.maxHp), 3);
  }
}
// Boss 头顶预警（同小怪：红 → 最后 28% 白）；血条画在 HUD 上
function drawBossTell(e, bx, by, tell, win) {
  if (!tell) return;
  rx.fillStyle = e.t > win * 0.72 ? '#fff' : '#ff3a2a';
  rx.fillRect(bx - 2, by - 136, 5, 10); rx.fillRect(bx - 2, by - 123, 5, 4);
}
// 天降：落点一圈闪烁的红色地标，最后 28% 闪白
function drawDiveMark(e, bx, gy, win) {
  const k = e.t / win, r = BOSS.dive.radius;
  rx.strokeStyle = k > 0.72 ? 'rgba(255,255,255,0.9)' : `rgba(255,50,60,${0.45 + 0.35 * Math.abs(Math.sin(e.t * 16))})`;
  rx.lineWidth = 2;
  rx.beginPath(); rx.ellipse(bx, gy, r, 8, 0, 0, Math.PI * 2); rx.stroke();
  rx.fillStyle = 'rgba(255,40,50,0.18)';
  rx.beginPath(); rx.ellipse(bx, gy, r * Math.min(1, k), 8 * Math.min(1, k), 0, 0, Math.PI * 2); rx.fill();
}
function drawFireballs(cx, cy) {
  const im = rImg('gv/enemies/fireball.png');
  if (!ready(im)) return;
  for (const b of R.eshots) {
    const i = Math.floor(b.t * 12) % 3;
    rx.save();
    rx.translate(Math.round(b.x - cx), Math.round(b.y - cy));
    if (b.refl) rx.filter = 'hue-rotate(-20deg) saturate(2) brightness(1.3)';   // 反弹后更红更亮，一眼看出是自己的
    rx.drawImage(im, i * 26, 0, 26, 26, -13, -13, 26, 26);
    rx.restore();
  }
}
/* 墓志：金色小墓碑，快消失时闪烁 */
function drawMark(x, y) {
  rx.fillStyle = '#2a1a10'; rx.fillRect(x - 3, y - 4, 7, 9);
  rx.fillStyle = '#e8c25a'; rx.fillRect(x - 2, y - 3, 5, 7); rx.fillRect(x - 1, y - 4, 3, 1);
  rx.fillStyle = '#7a4a1a'; rx.fillRect(x, y - 2, 1, 4); rx.fillRect(x - 1, y - 1, 3, 1);
}
/* 飞出去的墓碑巨剑：按 45° 一档旋转，保持像素感 */
function drawBlade(cx, cy) {
  const b = R.blade;
  if (!b) return;
  const a = Math.round(b.spin / (Math.PI / 4)) * (Math.PI / 4);
  rx.save();
  rx.translate(Math.round(b.x - cx), Math.round(b.y - cy));
  rx.rotate(a);
  rx.fillStyle = '#1a1420'; rx.fillRect(-18, -5, 32, 10);
  rx.fillStyle = '#5a5262'; rx.fillRect(-17, -4, 30, 8);
  rx.fillStyle = '#8a8092'; rx.fillRect(-17, -4, 30, 2);
  rx.fillStyle = '#c9a24a'; rx.fillRect(-15, 0, 26, 1); rx.fillRect(12, -6, 3, 12);
  rx.fillStyle = '#3a2418'; rx.fillRect(15, -2, 6, 4);
  rx.restore();
  // 旋转的残光圈
  rx.strokeStyle = 'rgba(255,230,190,0.35)'; rx.lineWidth = 1;
  rx.beginPath(); rx.arc(Math.round(b.x - cx), Math.round(b.y - cy), 17, 0, Math.PI * 2); rx.stroke();
}
/* 暴走普攻的血色月牙刀气 */
function drawShots(cx, cy) {
  const m = VFX.wave_fly, im = rImg('vfx/wave_fly.png');
  if (!m || !ready(im)) return;
  for (const s2 of R.shots) {
    const i = Math.min(s2.t * m.fps, 1) < 1 ? 0 : 1 + Math.floor(s2.t * m.fps) % (m.n - 1);   // 第 0 帧是成形，之后循环
    const sc = s2.big ? 1.35 : 1;
    rx.save();
    rx.globalAlpha = 1 - Math.max(0, s2.t / TSK.waveLife - 0.6) / 0.4;
    rx.translate(Math.round(s2.x - cx), Math.round(s2.y - cy));
    rx.scale(sign(s2.vx) * sc, sc);
    rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -m.ax, -m.ay, m.fw, m.fh);
    rx.restore();
  }
}

/* 断空/瞬狱的斩痕：爆开前是细线逐渐浮现，爆开时变粗发白再淡出 */
function drawCuts(cx, cy) {
  for (const c of R.cuts) {
    const x = c.x - cx, y = c.y - cy;
    const pre = c.wait ? 0.6 : Math.min(1, c.t / Math.max(0.01, c.delay));
    const post = c.done ? (c.t - c.delay) / 0.25 : -1;
    for (const ln of c.lines) {
      const ax = Math.cos(ln.a) * ln.l / 2, ay = Math.sin(ln.a) * ln.l / 2;
      const px = x + ln.dx, py = y + ln.dy;
      if (post < 0) {
        rx.strokeStyle = c.red ? `rgba(255,120,120,${0.25 + 0.6 * pre})` : `rgba(200,235,255,${0.25 + 0.6 * pre})`; rx.lineWidth = 1;
      } else {
        rx.strokeStyle = `rgba(255,255,255,${1 - post})`; rx.lineWidth = 3 * (1 - post) + 1;
      }
      rx.beginPath(); rx.moveTo(px - ax, py - ay); rx.lineTo(px + ax, py + ay); rx.stroke();
    }
  }
}

function drawArc(fx, cx, cy) {
  const [a0, a1, flat] = fx.arc;
  const life = 0.16, k = fx.t / life;
  if (k >= 1) return;
  const ox = fx.x - cx, oy = fx.y - cy - 24, r = fx.r || 40;
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
    const al = (1 - k) * (0.25 + 0.75 * t1);
    rx.fillStyle = fx.red
      ? `rgba(255,${Math.round(90 - 50 * t1)},${Math.round(90 - 50 * t1)},${al})`
      : `rgba(255,${Math.round(235 - 60 * t1)},${Math.round(220 - 120 * t1)},${al})`;
    rx.fill();
  }
  rx.restore();
}

// 精灵帧号。hold=[a,b]：放开（f.rel）前在 a..b 间循环，放开后从 b+1 往后播完
function sprFrame(f, m, t) {
  const i = (m.s || 0) + Math.floor(t * m.fps);   // s：跳过素材开头的实心闪光帧
  if (!f.hold) return i;
  const [a, b] = f.hold;
  if (f.rel === undefined) return i <= b ? i : a + (i - a) % (b - a + 1);
  return b + 1 + Math.floor((f.t - f.rel) * m.fps);
}
function drawFx(cx, cy, back = false) {
  for (const f of R.fx) {
    if (!!f.back !== back) continue;   // back：画在主角身后（召唤物）
    const x = Math.round(f.x - cx), y = Math.round(f.y - cy);
    if (f.k === 'spr') {
      const m = VFX[f.name], im = rImg(`vfx/${f.name}.png`), t = f.t - (f.delay || 0);
      if (!m || !ready(im) || t < 0) continue;
      const i = sprFrame(f, m, t);
      if (i >= m.n) continue;
      rx.save();
      rx.translate(x, y);
      if (f.rot) rx.rotate(f.rot);
      if (f.flip) rx.scale(-1, 1);
      if (f.alpha) rx.globalAlpha = f.alpha;
      const ax = m.ax ?? Math.round(m.fw / 2), ay = m.ay ?? (f.ground ? m.fh : Math.round(m.fh / 2));   // ax/ay：召唤物素材自带锚点
      rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -ax, -ay, m.fw, m.fh);
      rx.restore();
    } else if (f.k === 'parts') {
      const k = f.t / f.life; if (k >= 1) continue;
      rx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      for (const q of f.ps) {
        rx.fillStyle = q.c;
        rx.fillRect(Math.round(x + q.vx * f.t), Math.round(y + q.vy * f.t + 0.5 * f.g * f.t * f.t), q.s, q.s);
      }
      rx.globalAlpha = 1;
    } else if (f.k === 'arc') drawArc(f, cx, cy);
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
    } else if (f.k === 'pulse') {   // 时空断裂触发：全屏扩散的冲击环
      const k = f.t / 0.45; if (k >= 1) continue;
      rx.strokeStyle = `rgba(170,230,255,${0.9 * (1 - k)})`; rx.lineWidth = 3;
      rx.beginPath(); rx.arc(x, y, 12 + 360 * k * (2 - k), 0, Math.PI * 2); rx.stroke();
    } else if (f.k === 'after') {   // 主角残影（时空断裂中移动、瞬身、瞬狱）
      const k = f.t / 0.3; if (k >= 1) continue;
      const m = HERO_A[f.name], im = rImg(`hero2/hero_${f.name}.png`);
      if (!m || !ready(im)) continue;
      rx.save(); rx.globalAlpha = 0.5 * (1 - k);
      rx.filter = f.red ? 'brightness(0.8) sepia(1) hue-rotate(-40deg) saturate(6)' : 'brightness(0.7) sepia(1) hue-rotate(150deg) saturate(4)';
      rx.translate(x, y + 1); if (f.face < 0) rx.scale(-1, 1);
      rx.drawImage(im, f.i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
      rx.restore();
    } else if (f.k === 'line') {   // 瞬身 / 瞬狱穿梭的一道白光
      const k = f.t / 0.2; if (k >= 1) continue;
      rx.strokeStyle = `rgba(230,245,255,${1 - k})`; rx.lineWidth = 2;
      rx.beginPath(); rx.moveTo(x, y); rx.lineTo(Math.round(f.x1 - cx), Math.round(f.y1 - cy)); rx.stroke();
    } else if (f.k === 'shriek') {
      const k = f.t / GHOST.shriek; if (k >= 1) continue;
      rx.strokeStyle = `rgba(150,230,255,${0.9 * (1 - k)})`; rx.lineWidth = 3;
      rx.beginPath(); rx.arc(x, y, 10 + (GHOST.radius - 10) * k, 0, Math.PI * 2); rx.stroke();
    } else if (f.k === 'spike') {   // 裂地：地面裂开冒出血红碑刺
      const k = f.t / 0.4; if (k >= 1) continue;
      const hgt = Math.round(30 * Math.min(1, k * 5) * (1 - Math.max(0, k - 0.6) / 0.4));
      rx.fillStyle = '#2a0a10'; rx.fillRect(x - 16, y - 2, 32, 3);
      rx.fillStyle = '#c02838';
      rx.fillRect(x - 3, y - hgt, 6, hgt); rx.fillRect(x - 10, y - hgt * 0.6, 4, hgt * 0.6); rx.fillRect(x + 7, y - hgt * 0.5, 4, hgt * 0.5);
      rx.fillStyle = '#ff7080'; rx.fillRect(x - 1, y - hgt, 2, Math.max(0, hgt - 4));
    } else if (f.k === 'dust') {   // 血爪拖行扬起的土
      const k = f.t / 0.3; if (k >= 1) continue;
      rx.fillStyle = `rgba(120,90,80,${0.7 * (1 - k)})`;
      rx.fillRect(x - 3 - k * 6, y - 3 - k * 8, 4, 4); rx.fillRect(x + 2 + k * 4, y - 2 - k * 5, 3, 3);
    } else if (f.k === 'drop') {   // 碑雨：墓碑从天而降，插地一下再碎（碎裂另播 grave_break）
      const m = VFX.grave_fall, im = rImg('vfx/grave_fall.png');
      if (f.t >= 0.2 || !m || !ready(im)) continue;
      const yy = Math.round(y - 90 * (1 - Math.min(1, f.t / 0.1)));
      rx.drawImage(im, (f.v || 0) * m.fw, 0, m.fw, m.fh, x - m.ax, yy - m.ay, m.fw, m.fh);
    } else if (f.k === 'ghost') {
      const k = f.t / 0.25; if (k >= 1) continue;
      const m = HERO_A.dash, im = rImg('hero2/hero_dash.png');
      if (!m || !ready(im)) continue;
      rx.save(); rx.globalAlpha = 0.45 * (1 - k); rx.filter = 'brightness(0.6) sepia(1) hue-rotate(160deg) saturate(3)';
      rx.translate(x, y + 1); if (f.face < 0) rx.scale(-1, 1);
      rx.drawImage(im, m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
      rx.restore();
    } else if (f.k === 'bdead') {
      const im = rImg('gv/enemies/boss-dead.png'), m = EANIM['boss-dead'];
      if (!ready(im)) continue;
      rx.save(); rx.globalAlpha = clamp((f.life - f.t) / 0.6, 0, 1);
      rx.translate(x, y + 1); if (f.face < 0) rx.scale(-1, 1);   // 素材朝右
      rx.drawImage(im, Math.min(3, Math.floor(f.t * 6)) * m[1], 0, m[1], m[2], -m[3], -m[4], m[1], m[2]);
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

/* ---------- HUD ---------- */
/* 变身切入：左下角一块碎玻璃形状的画框，装着变身后的脸部特写；甩入 → 停留 → 碎成十几片飞散 */
const CUTIN = { s: 0.85, w: 520, h: 236, inT: 0.16, holdT: 1.1, outT: 0.5, pts: [[0, 34], [300, 0], [470, 22], [520, 196], [210, 236], [24, 214]] };
const CUTIN_C = [260, 118];
const CUTIN_TRIS = (() => {   // 中心点连到每条边，再从边中点切一刀，得到 12 片三角碎片
  const out = [], P = CUTIN.pts;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], m = [(a[0] + b[0]) / 2 + (i % 2 ? 14 : -10), (a[1] + b[1]) / 2 + (i % 2 ? -8 : 10)];
    out.push([CUTIN_C, a, m], [CUTIN_C, m, b]);
  }
  return out;
})();
function polyPath(poly) {
  ctx.beginPath();
  poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
}
function paintCutin(im, t) {
  ctx.fillStyle = '#1a0408'; ctx.fillRect(-20, -20, CUTIN.w + 40, CUTIN.h + 40);
  for (let k = 0; k < 9; k++) {   // 往左划过的红色速度线
    const y = (k * 29 + 13) % CUTIN.h, x = ((t * 900 + k * 137) % (CUTIN.w + 220)) - 110;
    ctx.fillStyle = `rgba(255,60,70,${0.25 + (k % 3) * 0.15})`;
    ctx.fillRect(CUTIN.w - x, y, 60 + k * 8, 2);
  }
  ctx.imageSmoothingEnabled = true;   // 高清立绘，平滑缩放
  const sx = -44 + t * 14, sy = -14;   // 慢慢推近
  ctx.drawImage(im, sx, sy);
  ctx.imageSmoothingEnabled = false;
  if (t > 0.22 && t < 0.5) {   // 眼睛闪一下
    const k = Math.sin((t - 0.22) / 0.28 * Math.PI), ex = sx + 282, ey = sy + 100;
    ctx.fillStyle = `rgba(255,240,240,${k})`;
    ctx.fillRect(ex - 18 * k, ey - 1, 36 * k, 3); ctx.fillRect(ex - 1, ey - 9 * k, 3, 18 * k);
  }
}
function drawCutin(x0, y0) {
  const c = R.cutin;
  if (!c) return;
  const im = rImg('hero2/cutin_laugh.png');
  if (!ready(im)) return;
  const t = c.t, hold = CUTIN.inT + CUTIN.holdT;
  if (t >= hold + CUTIN.outT) { R.cutin = null; return; }
  ctx.save();
  if (t < hold) {
    const k = Math.min(1, t / CUTIN.inT), e = 1 - Math.pow(1 - k, 3);
    ctx.translate(x0 - (1 - e) * 640, y0);
    ctx.rotate(-0.04);
    ctx.scale(CUTIN.s, CUTIN.s);
    ctx.save(); polyPath(CUTIN.pts); ctx.clip(); paintCutin(im, t);
    if (k < 1) { ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(0, 0, CUTIN.w, CUTIN.h); }
    ctx.restore();
    // 白边 + 从右上角裂开的红色裂纹
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 5; ctx.strokeStyle = '#0d0a12'; polyPath(CUTIN.pts); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#f4e8ec'; polyPath(CUTIN.pts); ctx.stroke();
    const grow = Math.min(1, Math.max(0, (t - 0.5) / 0.6));
    if (grow > 0) {
      ctx.strokeStyle = 'rgba(255,90,100,.9)'; ctx.lineWidth = 2;
      for (const [x1, y1] of [[300, 0], [520, 196], [210, 236], [24, 214], [0, 34]]) {
        ctx.beginPath(); ctx.moveTo(CUTIN_C[0], CUTIN_C[1]);
        ctx.lineTo(lerp(CUTIN_C[0], x1, grow * 0.55) + 6, lerp(CUTIN_C[1], y1, grow * 0.55) - 4);
        ctx.lineTo(lerp(CUTIN_C[0], x1, grow), lerp(CUTIN_C[1], y1, grow));
        ctx.stroke();
      }
    }
  } else {
    // 碎裂：每片带着脸的局部向外飞、旋转、下落、淡出
    const k = (t - hold) / CUTIN.outT;
    ctx.translate(x0, y0); ctx.rotate(-0.04); ctx.scale(CUTIN.s, CUTIN.s);
    CUTIN_TRIS.forEach((tri, i) => {
      const cxm = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cym = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const dx = cxm - CUTIN_C[0], dy = cym - CUTIN_C[1], d = Math.hypot(dx, dy) || 1;
      const sp = 180 + (i * 37) % 120;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(dx / d * sp * k, dy / d * sp * k + 260 * k * k);
      ctx.translate(cxm, cym); ctx.rotate((i % 2 ? 1 : -1) * k * (0.6 + (i % 3) * 0.3)); ctx.translate(-cxm, -cym);
      ctx.save(); polyPath(tri); ctx.clip(); paintCutin(im, hold); ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = '#f4e8ec'; polyPath(tri); ctx.stroke();
      ctx.restore();
    });
  }
  ctx.restore();
}


/* 按键状态（触屏按键和电脑技能栏共用）：标签、冷却比例、是否不可用 */
function btnState(id) {
  const p = R.p; if (!p) return null;
  const b = p.form === 'blood', cdk = (k) => clamp(p.cd[k] / (b ? CD_RAGE : CD)[k], 0, 1);
  switch (id) {
    case 's1': return { label: b ? '雨' : '刺', cd: cdk('u') };
    case 's2':
      if (b) return { label: '乱', cd: cdk('i') };
      return R.blade ? { label: '瞬', cd: 0 } : { label: '掷', cd: cdk('i') };
    case 's3':
      if (b) return { label: '狱', cd: cdk('o') };
      return R.witch > 0 ? { label: '狱', cd: cdk('o') } : { label: '断', cd: cdk('o') };
    case 's4': return b ? { label: '葬' } : { label: '契', off: p.soul < rageNeed() || mv('sealIdx', -1) === 3 };
    case 'dodge': return { label: b ? '影' : '闪' };
  }
  return null;
}

function drawSouls(x, y, p) {
  const w = 44, gap = 8, warn = R.soulWarn > 0 && Math.floor(R.time * 12) % 2 === 0;
  for (let i = 0; i < SOUL_MAX; i++) {
    const fill = clamp(p.soul - i, 0, 1), bx = x + i * (w + gap);
    ctx.fillStyle = '#0d0a12'; ctx.fillRect(bx - 2, y - 2, w + 4, 18);
    ctx.fillStyle = warn ? '#5a1a22' : '#26203a'; ctx.fillRect(bx, y, w, 14);
    if (fill > 0) { ctx.fillStyle = fill >= 1 ? '#8fd8ff' : '#4a7a9a'; ctx.fillRect(bx, y, Math.round(w * fill), 14); }
  }
  drawText('魂', x + SOUL_MAX * (w + gap) + 6, y + 14, 24, '#8fd8ff');
}

/* 电脑上的技能栏：四格，带冷却遮罩 */
function drawSkillBar(x, y) {
  const keys = [['s1', 'U'], ['s2', 'I'], ['s3', 'O'], ['s4', 'P']];
  keys.forEach(([id, key], i) => {
    const st = btnState(id), bx = x + i * 68;
    ctx.fillStyle = '#0d0a12'; ctx.fillRect(bx - 2, y - 2, 60, 60);
    ctx.fillStyle = st.off ? '#2a1a22' : '#211c2b'; ctx.fillRect(bx, y, 56, 56);
    drawText(st.label, bx + 28, y + 40, 36, st.off ? '#6a5a6a' : (id === 's4' ? '#ff8a8a' : '#f0e6f6'), 'center');
    if (st.cd > 0) { ctx.fillStyle = 'rgba(8,6,14,.7)'; ctx.fillRect(bx, y, 56, Math.round(56 * st.cd)); }
    drawText(key, bx + 4, y + 18, 12, '#c8bcd8', 'left');
  });
}

/* ---------- 场景 ---------- */
const roomScene = {
  wide: true, touch: true, btnState,
  enter() {
    R.cfg = pendingCfg; pendingCfg = null;
    rReset();
    preload(['gv/cemetery/background.png', 'gv/cemetery/mountains.png', 'gv/cemetery/graveyard.png', 'gv/cemetery/tileset.png',
      'gv/enemy-death.png', ...Object.keys(HOUND.anim).map((a) => `gv/hound/hell-hound-${a}.png`), ...Object.keys(EANIM).map((n) => `gv/enemies/${n}.png`),
      ...Object.keys(HERO_A).map((n) => `hero2/hero_${n}.png`), ...ROOM.props.map(([n]) => `gv/cemetery/${n}.png`),
      ...Object.keys(VFX).map((n) => `vfx/${n}.png`), 'hero2/cutin_laugh.png']);
  },
  update(dt) {
    if (input.hit('pause') && !R.cfg) { setScene(titleScene); return; }
    if (R.dead && !R.cfg && (input.hit('restart') || pulse.has('tap'))) { rReset(); return; }
    if (window.touchUI && touchUI.menu) return;
    if (params.get('demo')) demoInput(dt);
    syncWidth();
    R.time += dt;
    R.banner -= dt; R.soulWarn -= dt; R.flash -= dt;
    if (R.cutin && !R.cutin.freeze) R.cutin.t += dt;   // freeze：截图调试用，定格在某一刻
    if (R.msg && (R.msg.t -= dt) <= 0) R.msg = null;
    bufferInput(R.p, dt);
    if (R.stop > 0) { R.stop -= dt; return; }
    const p = R.p;
    const w0 = R.witch;
    if (p.st !== 'storm') R.witch = Math.max(0, R.witch - dt);   // 瞬狱穿梭期间断裂时间暂停
    if (w0 > 0 && R.witch <= 0) snd('witchEnd');
    const edt = dt * (R.witch > 0 ? WITCH_SLOW : 1) * (p.form === 'blood' ? RAGE.slow : 1);   // 暴走中全场敌人半速
    playerUpdate(p, dt);
    updateBlade(dt);
    updateCuts(dt);
    updateShots(dt);
    updateRain(dt);
    updateShade(R.p, dt);
    if ((R.witch > 0 || p.form === 'blood') && (R.afterT -= dt) <= 0 && (Math.abs(p.vx) > 40 || !p.ground) && p.st !== 'storm') {
      R.afterT = 0.05;
      afterImage(p);
    }
    for (const e of R.en) if (e.st !== 'dead') enemyUpdate(e, p, edt);
    updateFireballs(edt, p);
    R.en = R.en.filter((e) => e.st !== 'dead');
    for (const f of R.fx) f.t += dt;
    R.fx = R.fx.filter((f) => f.t < (f.life ? f.life + (f.delay || 0) : 0.6));
    for (const n of R.nums) n.t += dt;
    R.nums = R.nums.filter((n) => n.t < 0.7);
    if (R.pend.length) { for (const q of R.pend) q.t -= dt; for (const q of R.pend.filter((q) => q.t <= 0)) spawnOne(q.type, q.i); R.pend = R.pend.filter((q) => q.t > 0); }
    if (R.cfg) runWaves(dt);
    else if (!R.en.length && !R.dead) { R.waveT -= dt; if (R.waveT <= 0) { spawnWave(); R.waveT = 2; } }
    // 镜头：朝向前方留出视野，纵向只在离开中间区域时才跟
    const c = R.cam;
    const tx = p.x - RB_W / 2 + p.face * 50;
    const ty = p.y - RB_H * 0.62;
    c.x += (tx - c.x) * Math.min(1, dt * 6);
    if (Math.abs(ty - c.y) > 24 || p.st === 'blink') c.y += (ty - c.y) * Math.min(1, dt * 4);
    c.x = clamp(c.x, 0, ROOM.w - RB_W); c.y = clamp(c.y, 0, ROOM.h - RB_H);
    R.shake = Math.max(0, R.shake - dt * 20);
  },
  draw() {
    const p = R.p;
    syncWidth();
    const sx = R.shake > 0 ? Math.round(rnd(-R.shake, R.shake)) : 0, sy = R.shake > 0 ? Math.round(rnd(-R.shake, R.shake)) : 0;
    const cx = Math.round(R.cam.x) + sx, cy = Math.round(R.cam.y) + sy;
    rx.setTransform(1, 0, 0, 1, 0, 0);
    // 时空断裂：画面整体偏冷（蓝紫）但不褪色，四周压蓝色暗角；主角留青色残影（敌人蓄力的红光/闪白照样看得清）
    const wk = clamp(R.witch / WITCH_FADE, 0, 1);
    rx.filter = wk > 0 ? `hue-rotate(${-30 * wk}deg) saturate(${1 + 0.3 * wk}) contrast(${1 + 0.1 * wk})` : 'none';
    drawBack(cx, cy);
    drawProps(cx, cy);
    drawTiles(cx, cy);
    for (const e of R.en) drawEnemy(e, cx, cy);
    drawFireballs(cx, cy);
    rx.filter = 'none';
    if (wk > 0) {
      const g = rx.createRadialGradient(RB_W / 2, RB_H / 2, RB_H * 0.35, RB_W / 2, RB_H / 2, RB_W * 0.62);
      g.addColorStop(0, 'rgba(20,40,120,0)'); g.addColorStop(1, `rgba(20,50,150,${0.55 * wk})`);
      rx.fillStyle = g; rx.fillRect(0, 0, RB_W, RB_H);
    }
    if (p.form === 'blood') {   // 暴走：世界染血，四周压暗红暗角
      rx.fillStyle = 'rgba(120,10,20,0.14)'; rx.fillRect(0, 0, RB_W, RB_H);
      const g = rx.createRadialGradient(RB_W / 2, RB_H / 2, RB_H * 0.3, RB_W / 2, RB_H / 2, RB_W * 0.6);
      g.addColorStop(0, 'rgba(80,0,10,0)'); g.addColorStop(1, 'rgba(90,0,15,0.6)');
      rx.fillStyle = g; rx.fillRect(0, 0, RB_W, RB_H);
    }
    drawShade(cx, cy);
    drawFx(cx, cy, true);
    drawHero(p, cx, cy);
    drawBlade(cx, cy);
    drawShots(cx, cy);
    drawFx(cx, cy);
    drawCuts(cx, cy);
    if (R.flash > 0) { rx.fillStyle = `rgba(${R.flashCol || '230,245,255'},${R.flash / 0.15 * (R.flashCol ? 0.35 : 0.7)})`; rx.fillRect(0, 0, RB_W, RB_H); }
    else R.flashCol = null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rbuf, 0, 0, RB_W, RB_H, 0, 0, RB_W * RB_S, H);
    // HUD 用原分辨率画，字清楚
    for (const n of R.nums) drawText(String(n.v), (n.x - cx) * RB_S, (n.y - cy - n.t * 30) * RB_S, n.big ? 36 : 24, n.c, 'center');
    const tc = touchOn(), sl = tc ? touchUI.safe.l : 0;
    pxBar(24 + sl, 20, 300, 18, p.hp / p.mx, '#d0384a');
    drawText(`生命 ${p.hp}/${p.mx}`, 24 + sl, 64, 24, '#f0e6f6');
    if (p.shield > 0) drawText(`盾 ${p.shield}`, 24 + sl + 220, 64, 24, '#8fd8ff');
    if (p.form === 'blood') {
      pxBar(24 + sl, 82, 300, 14, p.rage / p.rageMax, '#ff3a5a');
      drawText(`暴走 ${p.rage.toFixed(1)} 秒`, 24 + sl + 312, 98, 24, '#ff8a9a');
      if (R.rcombo > 0) drawText(`×${R.rcombo}`, VW / 2, 118, 48, '#ff5a6a', 'center');
    } else drawSouls(24 + sl, 82, p);
    if (!tc) drawSkillBar(24, 118);
    // 触屏时右上角是返回/设置键，波次挪到顶部中间
    if (tc) drawText(`${waveLabel()}　击杀 ${R.kills}`, VW / 2, 40, 24, '#c8bcd8', 'center');
    else drawText(`${waveLabel()}　击杀 ${R.kills}`, VW - 24, 40, 24, '#c8bcd8', 'right');
    const boss = R.en.find((e) => e.boss && e.st !== 'dead');
    if (boss) {
      pxBar(VW / 2 - 240, 62, 480, 14, boss.hp / boss.maxHp, boss.p2 ? '#ff3a4a' : '#c03040');
      drawText(BOSS.name + ({ brood: '·孽生', fury: '·狂化' }[boss.variant] || ''), VW / 2 - 256, 78, 24, '#ffb0b8', 'right');
      if (boss.st === 'recover') drawText('破绽', (boss.x - cx) * RB_S, (boss.y - 128 - cy) * RB_S, 36, '#ffd23a', 'center');
    }
    if (R.banner > 0) drawText('时空断裂', VW / 2, 140, 48, `rgba(160,225,255,${clamp(R.banner, 0, 1)})`, 'center');
    if (R.witch > 0) {
      pxBar(VW / 2 - 120, 160, 240, 8, R.witch / WITCH_T, '#8fd8ff');
      if (p.cd.o <= 0 && p.form === 'normal' && Math.floor(R.time * 4) % 2 === 0) drawText(tc ? '按「狱」瞬狱' : '按 O 瞬狱', VW / 2, 196, 24, '#c8f0ff', 'center');
    }
    if (R.msg) drawText(R.msg.text, VW / 2, 240, 36, R.msg.color, 'center');
    drawCutin(8 + sl, H - Math.round(CUTIN.h * CUTIN.s) + 2);   // 贴着左下角最底边，少挡战斗画面
    if (!tc) {
      const l2 = p.form === 'blood'
        ? '暴走中（无敌）：J 刀气三连　空格 血影闪　U 碑雨　I 血爪乱舞　O 血狱　P 葬（提前收尾）'
        : 'J 普攻　U 送葬突刺　I 掷碑（再按瞬身，按住 W 斜上扔）　O 断空（断裂中为瞬狱）　P 血契';
      drawText(R.cfg ? 'A/D 移动　K 跳（按住跳高，空中二段跳，下+K 穿落）　空格 冲刺　空中下+J 下劈' : 'A/D 移动　K 跳（按住跳高，空中二段跳，下+K 穿落）　空格 冲刺　空中下+J 下劈　Esc 返回', VW / 2, H - 44, 24, 'rgba(220,210,235,.75)', 'center');
      drawText(l2, VW / 2, H - 14, 24, 'rgba(220,210,235,.75)', 'center');
    }
    if (R.dead) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, VW, H);
      drawText('倒下了', VW / 2, H / 2 - 20, 48, '#ff8a8a', 'center');
      drawText(R.cfg ? '试炼失败' : tc ? '轻点屏幕重来' : '按 R 重来', VW / 2, H / 2 + 30, 24, '#f0e6f6', 'center');
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
roomScene.start = (cfg) => { pendingCfg = cfg; setScene(roomScene); };
roomScene.debugWin = () => { if (!R.cfg) return; R.en.length = 0; R.wave = R.cfg.waves.length; R.endT = 5; };   // 调试：直接通关当前战斗
if (params.get('dbg')) window.__R = R;   // dbg=1：调试/截图脚本直接摆局面
})();
