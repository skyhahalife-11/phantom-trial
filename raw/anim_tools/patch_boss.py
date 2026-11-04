"""给 room.js 加大房间第一个 Boss「墓渊魔」。一次性补丁脚本。"""
import io, sys

P = sys.argv[1]
s = io.open(P, encoding='utf-8').read()


def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)


# ---------- 常量 ----------
rep("""const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42] };   // 受击框：半宽、高
const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp };
const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50 };   // 血条 / 预警 / 眩晕星画在脚底往上多少""",
"""// 墓渊魔：大房间第一个 Boss。三招都有明显前摇、都能完美闪避；出完招有破绽（受伤 +25%）；
// 霸体（不被击退 / 挑飞 / 眩晕 / 抓取）；半血后狂怒：前摇缩短到 0.8 倍，并定期召唤骷髅
const BOSS = {
  hp: 1400, name: '墓渊魔', wave: 4, walk: 70, near: 110, gap: 0.9, gap2: 0.55, weak: 1.25, phase2: 0.5, fast: 0.8,
  charge: { windup: 0.7, v: 380, t: 0.4, dmg: 18, recover: 0.9 },
  breath: { crouch: 0.35, rear: 0.5, fire: 0.5, dmg: 16, recover: 0.8, reach: 136 },
  dive: { rise: 0.45, h: 230, track: 0.9, fall: 900, dmg: 22, radius: 70, recover: 1.0 },
  summon: { cd: 14, t: 0.9, n: 3 },
};
const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42], boss: [30, 96] };   // 受击框：半宽、高
const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp, boss: BOSS.hp };
const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50, boss: 118 };   // 血条 / 预警 / 眩晕星画在脚底往上多少""")

# 破绽：出完招受伤 +25%
rep("""  const crit = !!o.critStun && e.st === 'stun';
  if (crit) dmg *= 2;""", """  const crit = !!o.critStun && e.st === 'stun';
  if (crit) dmg *= 2;
  if (e.boss && e.st === 'recover') dmg *= BOSS.weak;   // Boss 破绽""")

# 霸体：只掉血闪白，不击退不挑飞不眩晕；死亡单独结算
rep("""  if (e.hp <= 0) {
    e.st = 'dead'; R.kills++;""", """  if (e.hp <= 0 && e.boss) { bossDown(e); return; }
  if (e.hp <= 0) {
    e.st = 'dead'; R.kills++;""")
rep("""  e.vx = kb;
  if (launch) { e.vy = launch; e.ground = false; e.st = 'air'; e.t = 0; }""", """  if (e.boss) return;   // 霸体
  e.vx = kb;
  if (launch) { e.vy = launch; e.ground = false; e.st = 'air'; e.t = 0; }""")

# 血爪乱舞抓不起 Boss：只打一下，主角原地挥爪
rep("if (e.st !== 'dead') { e.st = 'carried'; e.t = 0; p.maul.side0 = p.face; } else p.maul = null; }",
    "if (e.st !== 'dead' && !e.boss) { e.st = 'carried'; e.t = 0; p.maul.side0 = p.face; } else p.maul = null; }")

# 完美闪避判定
rep("""    case 'ghost': return (e.st === 'shriek' && overlap(pb, shriekBox(e))) || (e.st === 'windup' && e.t > GHOST.windup - win && overlap(pb, shriekBox(e, 20)));
  }""", """    case 'ghost': return (e.st === 'shriek' && overlap(pb, shriekBox(e))) || (e.st === 'windup' && e.t > GHOST.windup - win && overlap(pb, shriekBox(e, 20)));
    case 'boss': return bossDanger(e, p, pb, win);
  }""")

# 分派
rep("""  else if (T === 'wiz') wizAI(e, p, dt);
  if (e.st === 'dead' || e.st === 'carried') return;
  if (T === 'ghost') floatPhys(e, dt);""", """  else if (T === 'wiz') wizAI(e, p, dt);
  else if (T === 'boss') bossAI(e, p, dt);
  if (e.st === 'dead' || e.st === 'carried') return;
  if (T === 'ghost' || bossFlying(e)) floatPhys(e, dt);""")

# ---------- Boss 本体 ----------
rep("""/* 火球：朝主角当前位置直线飞；普攻打中会反弹，反弹后专打敌人 */""", """/* ---------- Boss：墓渊魔 ---------- */
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
  say(`${BOSS.name}　降临`, '#ff6a6a');
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
function bossStart(e, st) { e.st = st; e.t = 0; e.sub = 0; e.vx = 0; e.dodged = false; e.buzzed = false; e.hitPlayer = false; }
// 选招：同一层且贴近 → 吐息 / 冲撞；离得远或不在同一层 → 天降 / 冲撞；狂怒后定期召唤
function bossPick(e, p) {
  const adx = Math.abs(p.x - e.x), same = Math.abs(p.y - e.y) < 40;
  if (e.p2 && e.sumT <= 0) return bossStart(e, 'summon');
  e.face = sign(p.x - e.x) || e.face;
  const r = Math.random();
  if (same && adx < 150) bossStart(e, r < 0.6 ? 'breath' : 'charge');
  else if (same && adx < 320) bossStart(e, r < 0.5 ? 'charge' : 'dive');
  else bossStart(e, 'dive');
}
function bossAI(e, p, dt) {
  const B = BOSS, f = bossF(e), dx = p.x - e.x;
  e.sumT -= dt;
  if (!e.p2 && e.hp <= e.maxHp * B.phase2) { e.p2 = true; e.sumT = 0; say(`${B.name}　狂怒`, '#ff6a6a'); R.shake = 4; }
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
        if (e.t >= wind) { e.sub = 1; e.t = 0; R.shake = Math.max(R.shake, 2); }
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
        R.shake = 6; R.stop = Math.max(R.stop, 0.05); buzz(60);
        for (const k of [-1, 0, 1]) vfx('exp2_blood', e.x + k * 44, e.y + 4, { ground: true, delay: Math.abs(k) * 0.05 });
        burst(e.x, e.y - 4, 50, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 300 });
        bossRecover(e, B.dive.recover);
      }
      break;
    case 'summon':   // 后仰召唤：主角身边的地里爬出骷髅
      e.vx = 0;
      if (e.sub === 0 && e.t >= 0.4) {
        e.sub = 1; e.sumT = B.summon.cd;
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
  e.st = 'dead'; R.kills++;
  R.stop = 0.35; R.shake = 8; R.flash = 0.15; R.flashCol = '255,220,160'; buzz(120);
  for (let k = 0; k < 5; k++) vfx('exp2_blood', e.x + rnd(-40, 40), e.y - rnd(10, 90), { delay: k * 0.08 });
  burst(e.x, e.y - 50, 120, { col: 'stone', v1: 360, life: 1.1 });
  R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });
  say(`击败 ${BOSS.name}`, '#ffd23a');
  R.waveT = 4;
  for (const o of R.en) if (o !== e && o.type === 'skel') hurtEnemy(o, o.hp, 0, -200);   // 召来的骷髅一起散架
}

/* 火球：朝主角当前位置直线飞；普攻打中会反弹，反弹后专打敌人 */""")

# ---------- 波次：第 4 波是 Boss；boss=1 调试直接打 Boss ----------
rep("""  ['ghost', 'skel', 'skel', 'skel', 'hound', 'wiz'],
  ['ghost', 'ghost', 'wiz', 'hound', 'hound', 'skel', 'skel'],
];""", """  ['ghost', 'skel', 'skel', 'skel', 'hound', 'wiz'],
];   // 第 4 波是 Boss，之后混编""")
rep("""function spawnWave() {
  R.wave++;
  const list""", """function spawnWave() {
  R.wave++;
  if (R.wave === BOSS.wave) { spawnBoss(); return; }
  const list""")
rep("Array.from({ length: 4 + Math.min(R.wave, 8) }", "Array.from({ length: 2 + Math.min(R.wave, 8) }")
rep("  R.wave = 0; R.kills = 0; R.waveT = 1.2;", "  R.wave = params.get('boss') ? BOSS.wave - 1 : 0; R.kills = 0; R.waveT = 1.2;   // boss=1：调试用，开局直接打 Boss")

# ---------- 绘制 ----------
rep("""  'wiz-idle': [5, 81, 66], 'wiz-fire': [10, 81, 66], fireball: [3, 26, 26],
};""", """  'wiz-idle': [5, 81, 66], 'wiz-fire': [10, 81, 66], fireball: [3, 26, 26],
  'boss-idle': [6, 160, 144, 62, 127], 'boss-atk': [8, 192, 176, 87, 168], 'boss-fire': [5, 160, 96],   // 第 5 个数：脚底在帧内的 y
};""")
rep("""    case 'wiz':
      if (e.st === 'cast') return ['wiz-fire', once(10, WIZ.castFps)];
      return ['wiz-idle', run(5, 8)];
  }""", """    case 'wiz':
      if (e.st === 'cast') return ['wiz-fire', once(10, WIZ.castFps)];
      return ['wiz-idle', run(5, 8)];
    case 'boss': {
      const f = bossF(e);
      if (e.st === 'charge') return ['boss-atk', e.sub === 0 ? Math.min(2, Math.floor(e.t / (BOSS.charge.windup * f) * 3)) : 3 + (Math.floor(e.t * 12) % 2)];
      if (e.st === 'breath') return ['boss-atk', e.sub === 1 ? 7 : e.t < BOSS.breath.crouch * f ? Math.min(2, Math.floor(e.t / (BOSS.breath.crouch * f) * 3)) : 6];
      if (e.st === 'dive') return e.sub === 2 ? ['boss-atk', 6] : ['boss-idle', run(6, 14)];
      if (e.st === 'summon') return ['boss-atk', 6 + (Math.floor(e.t * 8) % 2)];
      if (e.st === 'recover') return ['boss-atk', 5];
      return ['boss-idle', run(6, 8)];
    }
  }""")
rep("""const EWIND = { skel: () => SKEL.windup, ghost: () => GHOST.windup, wiz: () => WIZ.release / WIZ.castFps };
function enemyTelling(e) { return e.st === 'windup' || (e.st === 'cast' && !e.fired); }""",
"""const EWIND = {
  skel: () => SKEL.windup, ghost: () => GHOST.windup, wiz: () => WIZ.release / WIZ.castFps,
  boss: (e) => bossF(e) * (e.st === 'charge' ? BOSS.charge.windup : e.st === 'breath' ? BOSS.breath.crouch + BOSS.breath.rear : BOSS.dive.track),
};
function enemyTelling(e) {
  if (e.boss) return ['charge', 'breath'].includes(e.st) ? e.sub === 0 : e.st === 'dive' && e.sub === 1;
  return e.st === 'windup' || (e.st === 'cast' && !e.fired);
}""")
rep("""  const [name, i] = fr, [, fw, fh, ax = fw / 2] = EANIM[name], im = rImg(`gv/enemies/${name}.png`);
  if (!ready(im)) return;
  const bx = Math.round(e.x - cx), by = Math.round(e.y - cy), win = EWIND[T](), tell = enemyTelling(e);""",
"""  const [name, i] = fr, [, fw, fh, ax = fw / 2, ay = fh] = EANIM[name], im = rImg(`gv/enemies/${name}.png`);
  if (!ready(im)) return;
  const bx = Math.round(e.x - cx), by = Math.round(e.y - cy), win = EWIND[T](e), tell = enemyTelling(e);
  if (T === 'boss' && e.st === 'dive' && e.sub === 1) drawDiveMark(e, bx, Math.round((e.markY ?? ROOM.ground) - cy), win);""")
rep("""  else if (T === 'ghost') rx.filter = 'brightness(1.5) drop-shadow(0 0 2px rgba(120,220,255,0.9))';   // 黑袍贴着暗背景看不清，描一圈青光
  rx.drawImage(im, i * fw, 0, fw, fh, -ax, -fh, fw, fh);
  rx.restore();""", """  else if (T === 'ghost') rx.filter = 'brightness(1.5) drop-shadow(0 0 2px rgba(120,220,255,0.9))';   // 黑袍贴着暗背景看不清，描一圈青光
  else if (T === 'boss') rx.filter = e.st === 'recover' ? 'brightness(1.4) drop-shadow(0 0 3px rgba(255,220,120,0.95))' : 'brightness(1.3) drop-shadow(0 0 2px rgba(255,60,70,0.9))';   // 黑身子描红边；破绽时描金边
  rx.drawImage(im, i * fw, 0, fw, fh, -ax, -ay, fw, fh);
  if (T === 'boss' && e.st === 'breath' && e.sub === 1) {   // 贴地喷火：火焰条右端接在嘴边
    const fim = rImg('gv/enemies/boss-fire.png'), k = Math.min(4, Math.floor(e.t / BOSS.breath.fire * 5));
    if (ready(fim)) rx.drawImage(fim, k * 160, 0, 160, 96, -139, -72, 160, 96);
  }
  rx.restore();
  if (T === 'boss') { drawBossTell(e, bx, by, tell, win); return; }""")
rep("""function drawFireballs(cx, cy) {""", """// Boss 头顶预警（同小怪：红 → 最后 28% 白）；血条画在 HUD 上
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
function drawFireballs(cx, cy) {""")

# HUD：Boss 血条 + 破绽字
rep("""    if (R.banner > 0) drawText('时空断裂',""", """    const boss = R.en.find((e) => e.boss && e.st !== 'dead');
    if (boss) {
      pxBar(VW / 2 - 240, 62, 480, 14, boss.hp / boss.maxHp, boss.p2 ? '#ff3a4a' : '#c03040');
      drawText(BOSS.name, VW / 2 - 256, 78, 24, '#ffb0b8', 'right');
      if (boss.st === 'recover') drawText('破绽', (boss.x - cx) * RB_S, (boss.y - 128 - cy) * RB_S, 36, '#ffd23a', 'center');
    }
    if (R.banner > 0) drawText('时空断裂',""")

io.open(P, 'w', encoding='utf-8').write(s)
print('ok')
