"""给 room.js 加三种新敌人（骷髅兵 / 幽灵 / 火焰巫师）+ 火球。一次性补丁脚本。"""
import io, re, sys

P = sys.argv[1]
s = io.open(P, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:80])
    s = s.replace(a, b)


def cut(start, end_marker):
    """返回 s 中从 start 开始、到 end_marker（不含）为止的片段位置"""
    a = s.index(start)
    b = s.index(end_marker, a)
    return a, b


# ---------- 常量 ----------
rep("""  anim: { idle: [6, 64, 32], walk: [12, 64, 32], run: [5, 67, 32], jump: [6, 65, 48] },
};
""", """  anim: { idle: [6, 64, 32], walk: [12, 64, 32], run: [5, 67, 32], jump: [6, 65, 48] },
};
// 骷髅兵：从土里爬出来，慢慢逼近，贴脸后仰一下再前扑抓一把；血少，成群出现
const SKEL = { hp: 30, dmg: 10, walk: 52, reach: 46, windup: 0.5, lungeV: 210, lungeT: 0.2, recover: 0.6, rise: 0.6 };
// 幽灵：飘着穿过平台；隐身（抓不到）→ 在主角背后现身 → 蓄力尖啸，打一圈
const GHOST = { hp: 40, dmg: 12, drift: 55, sight: 300, cd: 2.6, vanish: 0.5, hidden: 0.35, appear: 0.43, behind: 46, windup: 0.6, shriek: 0.3, radius: 58, hover: 16 };
// 火焰巫师：站在高台上远程丢火球；手里聚火就是预警。普攻打中火球会把它反弹回去
const WIZ = { hp: 40, dmg: 12, sight: 400, cd: 2.4, castFps: 10, release: 6, ballV: 170, ballLife: 3.5, reflectV: 340, reflectDmg: 24 };
const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42] };   // 受击框：半宽、高
const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp };
const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50 };   // 血条 / 预警 / 眩晕星画在脚底往上多少
const etype = (e) => e.type || 'hound';
""")
rep("const eBox = (e) => ({ x0: e.x - 18, x1: e.x + 18, y0: e.y - 24, y1: e.y });",
    "const eBox = (e) => { const [w, h] = EBOX[etype(e)]; return { x0: e.x - w, x1: e.x + w, y0: e.y - h, y1: e.y }; };")
rep("const alive = () => R.en.filter((e) => e.st !== 'dead');",
    "const alive = () => R.en.filter((e) => e.st !== 'dead' && !e.hide);   // hide：幽灵隐身中，打不到也锁不到")
rep("""function strike(e, dmg, o = {}) {
  if (e.st === 'dead') return;""", """function strike(e, dmg, o = {}) {
  if (e.st === 'dead' || e.hide) return;""")
rep("R.shots = []; R.drops = []; R.rain = null; R.rcombo = 0; R.shade = null;",
    "R.shots = []; R.drops = []; R.rain = null; R.rcombo = 0; R.shade = null; R.eshots = [];")

# 瞬身路过敌人时的完美闪避判定改走通用函数
rep("    if (e.st === 'leap' || (e.st === 'windup' && e.t > HOUND.windup - 0.2)) triggerPerfect(p, e);",
    "    if (enemyDanger(e, p, pBox(p), 0.2, true)) triggerPerfect(p, e);")

# 普攻打中火球：反弹
rep("""  if (n) { R.stop = 0.06; R.shake = Math.max(R.shake, kind === 'c2' || kind === 'tc2' ? 3 : 2); }""",
    """  if (n) { R.stop = 0.06; R.shake = Math.max(R.shake, kind === 'c2' || kind === 'tc2' ? 3 : 2); }
  reflectBalls(p, box);""")

# 完美闪避：按敌人类型判断 + 火球
rep("""    const near = Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < 50;
    const danger = (e.st === 'leap' && overlap(pb, leapBox(e))) || (e.st === 'windup' && e.t > HOUND.windup - win && near);
    if (danger) { triggerPerfect(p, e); return; }
  }
}""", """    const near = Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < 50;
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
    case 'ghost': return (e.st === 'shriek' && overlap(pb, shriekBox(e))) || (e.st === 'windup' && e.t > GHOST.windup - win && overlap(pb, shriekBox(e, 20)));
  }
  return false;
}""")

# ---------- 地狱犬改造成通用框架 + 三种新敌人 ----------
a, b = cut("/* ---------- 地狱犬 ---------- */\nfunction spawnHound(x, y) {", "const leapBox")
s = s[:a] + """/* ---------- 敌人 ---------- */
function spawnEnemy(type, x, y, o = {}) {
  const e = { type, x, y, vx: 0, vy: 0, face: -1, hp: EMAX[type], maxHp: EMAX[type], st: 'patrol', t: 0, flash: 0, home: x, pdir: -1, ground: true,
    hitPlayer: false, an: rnd(0, 1), mark: 0, stunT: 0.28, cd: rnd(0.6, 1.6), ...o };
  if (type === 'skel') { e.st = 'rise'; e.skin = Math.random() < 0.5 ? 'skelc' : 'skel'; }
  else if (type === 'ghost') { e.st = 'drift'; e.ground = false; }
  else if (type === 'wiz') e.st = 'idle';
  R.en.push(e);
  return e;
}
function spawnHound(x, y) { return spawnEnemy('hound', x, y); }
""" + s[b:]

a, b = cut("function houndUpdate(e, p, dt) {", "function spawnWave() {")
s = s[:a] + """// 敌人出招判定碰到主角：冲刺 / 突刺 / 瞬身的无敌中算完美闪避，否则挨打
function enemyHits(e, p, box, dmg) {
  if (e.hitPlayer || !overlap(pBox(p), box)) return;
  if (['dash', 'thrust', 'blink'].includes(p.st) && p.inv > 0) { triggerPerfect(p, e); e.hitPlayer = true; }
  else if (hurtPlayer(p, dmg, e.x, e)) e.hitPlayer = true;
}
// 预警闪白那一刻手机轻震，眼睛没盯着也能靠手感反应
function tellBuzz(e, p, windup) {
  if (!e.buzzed && e.t > windup * 0.72 && Math.abs(p.x - e.x) < 160 && Math.abs(p.y - e.y) < 60) { e.buzzed = true; buzz(20); }
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
  e.t += dt; e.flash -= dt; e.an += dt; e.cd -= dt; e.mark = Math.max(0, e.mark - dt);
  const T = etype(e);
  if (T === 'hound') houndAI(e, p, dt);
  else if (T === 'skel') skelAI(e, p, dt);
  else if (T === 'ghost') ghostAI(e, p, dt);
  else if (T === 'wiz') wizAI(e, p, dt);
  if (e.st === 'dead' || e.st === 'carried') return;
  if (T === 'ghost') floatPhys(e, dt);
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
      if (e.t >= HOUND.windup) { e.st = 'leap'; e.t = 0; e.vx = e.face * HOUND.leapVx; e.vy = HOUND.leapVy; e.ground = false; e.hitPlayer = false; }
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
      if (e.t >= SKEL.windup) { e.st = 'lunge'; e.t = 0; e.vx = e.face * SKEL.lungeV; e.hitPlayer = false; }
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
      if (e.t >= GHOST.windup) { e.st = 'shriek'; e.t = 0; e.hitPlayer = false; R.fx.push({ k: 'shriek', x: e.x, y: e.y - 24, t: 0 }); }
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

/* 火球：朝主角当前位置直线飞；普攻打中会反弹，反弹后专打敌人 */
function fireball(e, p) {
  const x = e.x + e.face * 16, y = e.y - 36, tx = p.x, ty = p.y - 18, d = Math.hypot(tx - x, ty - y) || 1;
  R.eshots.push({ x, y, vx: (tx - x) / d * WIZ.ballV, vy: (ty - y) / d * WIZ.ballV, t: 0, refl: false });
}
function reflectBalls(p, box) {
  for (const b of R.eshots) {
    if (b.refl || !overlap(box, { x0: b.x - 8, x1: b.x + 8, y0: b.y - 8, y1: b.y + 8 })) continue;
    b.refl = true; b.t = 0; b.vx = p.face * WIZ.reflectV; b.vy = 0;
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
  e.ground = landOn(e, prevY, false);
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
  ['ghost', 'ghost', 'wiz', 'hound', 'hound', 'skel', 'skel'],
];
const MIX = ['skel', 'hound', 'skel', 'ghost', 'wiz', 'skel', 'hound'];
""" + s[b:]

a, b = cut("function spawnWave() {", "/* ---------- 绘制 ---------- */")
s = s[:a] + """function spawnWave() {
  R.wave++;
  const list = WAVES[R.wave - 1] || Array.from({ length: 4 + Math.min(R.wave, 8) }, (_, i) => MIX[(i + R.wave) % MIX.length]);
  list.forEach((type, i) => {
    const pl = ROOM.plats[(i * 3 + R.wave) % ROOM.plats.length];
    if (type === 'wiz') {   // 巫师站高台
      const hi = ROOM.plats.filter((q) => q.y < 400);
      const q = hi[(i * 5 + R.wave * 3) % hi.length];
      spawnEnemy('wiz', q.x + q.w / 2, q.y);
    } else if (type === 'skel') {   // 骷髅在主角附近的地里爬出来
      const side = i % 2 ? 1 : -1;
      spawnEnemy('skel', clamp(R.p.x + side * (110 + i * 36), 40, ROOM.w - 40), ROOM.ground);
    } else if (type === 'ghost') {
      spawnEnemy('ghost', 300 + ((i * 613 + R.wave * 251) % (ROOM.w - 600)), ROOM.ground - 90);
    } else {
      const useP = i % 2 === 1;
      spawnHound(useP ? pl.x + pl.w / 2 : 500 + ((i * 457 + R.wave * 211) % (ROOM.w - 700)), useP ? pl.y : ROOM.ground);
    }
  });
}

""" + s[b:]

# ---------- 绘制 ----------
rep("""  if (e.hp < HOUND.hp) {
    rx.fillStyle = '#1a0f14'; rx.fillRect(bx - hpW / 2, by - 30, hpW, 3);
    rx.fillStyle = '#d0384a'; rx.fillRect(bx - hpW / 2, by - 30, Math.round(hpW * e.hp / HOUND.hp), 3);
  }
}""", """  if (e.hp < HOUND.hp) {
    rx.fillStyle = '#1a0f14'; rx.fillRect(bx - hpW / 2, by - 30, hpW, 3);
    rx.fillStyle = '#d0384a'; rx.fillRect(bx - hpW / 2, by - 30, Math.round(hpW * e.hp / HOUND.hp), 3);
  }
}

/* 新敌人：选帧 → 画精灵（蓄力时变红、最后 28% 闪白）→ 头顶预警 / 眩晕星 / 墓志 / 血条 */
const EANIM = {   // 帧数、帧宽、帧高
  'skel-walk': [8, 44, 52], 'skel-rise': [6, 44, 52], 'skelc-walk': [8, 44, 52], 'skelc-rise': [6, 44, 52],
  'ghost-idle': [7, 64, 80], 'ghost-appears': [6, 64, 48], 'ghost-shriek': [4, 64, 80], 'ghost-vanish': [7, 64, 64],
  'wiz-idle': [5, 81, 66], 'wiz-fire': [10, 81, 66], fireball: [3, 26, 26],
};
function enemyFrame(e) {
  const run = (n, fps) => Math.floor(e.an * fps) % n, once = (n, fps) => Math.min(n - 1, Math.floor(e.t * fps));
  switch (etype(e)) {
    case 'skel': {
      const k = e.skin || 'skel';
      if (e.st === 'rise') return [k + '-rise', once(6, 6 / SKEL.rise)];
      if (e.st === 'chase') return [k + '-walk', run(8, 10)];
      if (e.st === 'windup') return [k + '-walk', 4];
      if (e.st === 'lunge') return [k + '-walk', 0];
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
  }
  return null;
}
const EWIND = { skel: () => SKEL.windup, ghost: () => GHOST.windup, wiz: () => WIZ.release / WIZ.castFps };
function enemyTelling(e) { return e.st === 'windup' || (e.st === 'cast' && !e.fired); }
function drawEnemy(e, cx, cy) {
  const T = etype(e);
  if (T === 'hound') return drawHound(e, cx, cy);
  const fr = enemyFrame(e);
  if (!fr) return;
  const [name, i] = fr, [, fw, fh] = EANIM[name], im = rImg(`gv/enemies/${name}.png`);
  if (!ready(im)) return;
  const bx = Math.round(e.x - cx), by = Math.round(e.y - cy), win = EWIND[T](), tell = enemyTelling(e);
  rx.save();
  rx.translate(bx, by + 1);
  if (e.face > 0) rx.scale(-1, 1);   // 素材都朝左
  if (tell) {
    const k = e.t / win;
    rx.filter = k > 0.72 ? 'brightness(2.6)' : `sepia(1) saturate(6) hue-rotate(-30deg) brightness(${1 + 0.6 * Math.abs(Math.sin(e.t * 18))})`;
  } else if (e.flash > 0) rx.filter = 'brightness(3)';
  rx.drawImage(im, i * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
  rx.restore();
  const top = ETOP[T];
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
}""")

# 尖啸：一圈往外扩的紫色冲击环（敌人招式，不是主角特效）
rep("""    } else if (f.k === 'spike') {""", """    } else if (f.k === 'shriek') {
      const k = f.t / GHOST.shriek; if (k >= 1) continue;
      rx.strokeStyle = `rgba(150,230,255,${0.9 * (1 - k)})`; rx.lineWidth = 3;
      rx.beginPath(); rx.arc(x, y, 10 + (GHOST.radius - 10) * k, 0, Math.PI * 2); rx.stroke();
    } else if (f.k === 'spike') {""")

# ---------- 主循环 / 预载 ----------
rep("    for (const e of R.en) if (e.st !== 'dead') houndUpdate(e, p, edt);",
    "    for (const e of R.en) if (e.st !== 'dead') enemyUpdate(e, p, edt);\n    updateFireballs(edt, p);")
rep("    for (const e of R.en) drawHound(e, cx, cy);", "    for (const e of R.en) drawEnemy(e, cx, cy);\n    drawFireballs(cx, cy);")
rep("...Object.keys(HOUND.anim).map((a) => `gv/hound/hell-hound-${a}.png`),",
    "...Object.keys(HOUND.anim).map((a) => `gv/hound/hell-hound-${a}.png`), ...Object.keys(EANIM).map((n) => `gv/enemies/${n}.png`),")

io.open(P, 'w', encoding='utf-8').write(s)
print('ok')
