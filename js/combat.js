'use strict';

const world = {};
function resetWorld(heroKey, opts = {}) {
  Object.assign(world, {
    t: 0, time: 0, player: null, enemies: [], projs: [], hazards: [], zones: [], timers: [], floats: [], parts: [], rings: [],
    slashes: [], bolts: [], beams: [], shake: 0, hitstop: 0, slow: 0, wave: -1, waveDelay: 1.0, waveCleared: true, state: 'play',
    waves: null, eMul: { hp: 1, dmg: 1, spd: 1 }, coins: 0, slowZones: [], clones: [], pets: [], noCritAll: false, fireHit: 0, endHpPct: 1,
    banner: null, kills: 0, endT: 0, bossSeen: false, hint: 12, chain: 0, chainT: 0, chainPop: 0, bestChain: 0, stats: { jump: 0, air: 0, launch: 0, spike: 0, plunge: 0, exec: 0, link: 0, counter: 0, jumpOver: 0 },
  });
  world.player = makePlayer(heroKey, opts);
}

const GRAV = 4480, JUMP_V = 1120, E_GRAV = 2600;
const DODGE_VIS = 0.36, HURT_VIS = 0.4, BASH_VIS = 0.4;
const curWaves = () => world.waves || WAVES;

const later = (t, fn) => world.timers.push({ t, fn });
const floatText = (x, y, txt, color = '#fff', size = 26) => world.floats.push({ x, y, txt, color, size, life: 1 });
function burst(x, y, color, n = 8, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2);
    world.parts.push({ x, y, vx: Math.cos(a) * rnd(0.3, 1) * speed, vy: Math.sin(a) * rnd(0.3, 1) * speed - 60, life: rnd(0.3, 0.7), max: 0.7, color, size: rnd(3, 7) });
  }
}
const ringFx = (x, y, color, r = 200, life = 0.4) => world.rings.push({ x, y, color, max: r, life, total: life });
const slashFx = (x, y, dir, color, size = 1, ang = 0) => world.slashes.push({ x, y, dir, color, size, ang, life: 0.22, total: 0.22 });
const halfW = (e) => e.def.h * 0.2;
const vOverlap = (p, e) => p.y < e.y + e.def.h && e.y < p.y + HERO_H;
const overlap = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;
const liveEnemies = () => world.enemies.filter((e) => !e.dead);
const nearestEnemy = (x) => liveEnemies().reduce((a, e) => (!a || Math.abs(e.x - x) < Math.abs(a.x - x) ? e : a), null);

function makePlayer(key, opts = {}) {
  const d = HEROES[key];
  const p = { key, def: d, x: 260, dir: 1, hp: d.hp, maxHp: d.hp, atk: d.atk, speed: d.speed, state: 'idle', t: 0, combo: 0, comboT: 0,
    at: null, buffer: 0, dodgeT: 0, dodgeVis: 0, hurtT: 0, bashT: 0, dodgeInv: 0, dodgeCd: 0, dodgeDir: 1, perfectUsed: false, inv: 0, shield: 0, shieldT: 0, thorns: 0,
    buffs: [], cd: [0, 0, 0, 0], flash: 0, kbV: 0, dead: false, trail: [], mods: emptyMods(), ember: 0, lastSkillT: -99, counterBuff: false, wisps: 0, wispT: 0,
    y: 0, vz: 0, hang: 0, landT: 0, airAtk: 0, airDash: false, counter: 0, counterMax: 0, castMul: 1, weak: 0, weakMsg: 0,
    scrollT: 0, scrollFrom: -1, twoT: 0, twoFrom: -1, forceCritT: 0, afterT: 0, subT: 0, followT: 0, shieldAge: 0, bashSk: null, petFrenzy: 0, pdWin: 0, pdStack: 0, pdStackT: 0 };
  if (opts.mods) p.mods = opts.mods;
  p.maxHp = Math.round(d.hp * (1 + p.mods.hpPct));
  p.hp = opts.hp != null ? Math.min(opts.hp, p.maxHp) : p.maxHp;
  return p;
}

const isBerserk = (p) => p.buffs.some((b) => b.berserk);

const pAtk = (p) => p.atk * p.mods.dmg * (1 + p.buffs.reduce((a, b) => a + (b.atk || 0), 0));
const pSpd = (p) => 1 + p.mods.spd + p.buffs.reduce((a, b) => a + (b.spd || 0), 0);
const frontRange = (p, len) => (p.dir > 0 ? [p.x - 25, p.x + len] : [p.x - len, p.x + 25]);

function faceAssist(p) {
  const mv = (input.act('right') ? 1 : 0) - (input.act('left') ? 1 : 0);
  if (mv) { p.dir = mv; return; }
  const e = nearestEnemy(p.x);
  if (e && Math.abs(e.x - p.x) < 600) p.dir = sign(e.x - p.x);
}

function startDodge(mv) {
  const p = world.player;
  if (p.mods.noDodge) { if (p.weakMsg <= 0) { p.weakMsg = 0.8; floatText(p.x, FLOOR - HERO_H - 30 - p.y, '破釜：无法闪避', '#9aa4b4', 22); } return; }
  p.state = 'dodge';
  p.at = null;
  p.dodgeDir = mv || -p.dir;
  p.dodgeT = 0.2;
  p.dodgeVis = DODGE_VIS;
  p.dodgeInv = 0.34;
  p.dodgeCd = 0.75 * (1 - p.mods.dodgeCdr);
  p.perfectUsed = false;
  p.trail = [];
  if (p.y > 0) { p.airDash = true; p.vz = 0; p.hang = 0.22; }
  burst(p.x, FLOOR - 10 - p.y, '#cfe3ff', 6, 100);
}

function startJump() {
  const p = world.player;
  p.state = 'air';
  p.at = null;
  p.vz = JUMP_V;
  p.y = Math.max(p.y, 1);
  p.airAtk = 0;
  p.airDash = false;
  world.stats.jump++;
  burst(p.x, FLOOR - 6, '#cfd8e6', 6, 110);
}

function startPlunge() {
  const p = world.player;
  p.state = 'plunge';
  p.at = null;
  p.vz = -2300;
  p.hang = 0;
  world.stats.plunge++;
  p.trail = [];
}

function landPlayer() {
  const p = world.player;
  p.y = 0;
  p.vz = 0;
  p.hang = 0;
  p.landT = 0.14;
  burst(p.x, FLOOR - 6, '#cfd8e6', 5, 100);
  if (p.state === 'plunge') {
    const n = aoeAt(p.x, 175, pAtk(p) * 1.8, { kb: 160, heavy: true, hitstop: 0.09, launch: 720 });
    ringFx(p.x, FLOOR - 10, '#ffd08a', 220, 0.35);
    burst(p.x, FLOOR - 20, '#ffd08a', 20, 320);
    world.shake = Math.max(world.shake, n ? 0.28 : 0.16);
    p.landT = 0.2;
    p.state = 'idle';
  } else if (p.state === 'air') p.state = 'idle';
}

function startAttack() {
  const p = world.player;
  faceAssist(p);
  if (p.y > 0) {
    if (p.airAtk >= 3) return false;
    const idx = p.airAtk++;
    world.stats.air++;
    const dur = 0.32 / pSpd(p);
    p.state = 'attack';
    p.at = { type: 'basic', air: true, t: 0, dur, hitAt: dur * 0.45, done: false, combo: idx, fire: () => airHit(idx) };
    p.vz = Math.max(p.vz, 0);
    p.hang = 0.24;
    p.buffer = 0;
    return true;
  }
  const idx = p.combo % 3;
  const clip = ANIMS[p.key + '_attack'];
  const hitFrac = clip ? clip.hit / Math.max(1, clip.n - 1) : 0.5;
  const dur = p.def.basic.dur / (pSpd(p) * (1 + (p.mods.basicSpd || 0)));
  p.state = 'attack';
  p.at = { type: 'basic', t: 0, dur, hitAt: dur * Math.min(0.62, hitFrac), done: false, combo: idx, fire: () => basicHit(idx) };
  p.combo++;
  p.comboT = 0.8;
  p.buffer = 0;
  p.kbV += p.dir * (p.def.ranged ? 0 : 240) * (idx === 2 ? 1.4 : 1);
  return true;
}

function meleeTargets(p, reach, anyY) {
  const [x0, x1] = frontRange(p, reach);
  return liveEnemies().filter((e) => overlap(x0, x1, e.x - halfW(e), e.x + halfW(e)) && (anyY || vOverlap(p, e)));
}

function basicHit(idx) {
  const p = world.player;
  const d = p.def;
  const M = p.mods;
  let mult = d.basic.mults[idx] * (M.basicMul || 1) * (idx === 2 && M.heavy3 ? 1.4 : 1);
  const core3 = M.basicCore && idx === 2;
  if (!d.ranged) {
    const launcher = idx === 2 && d.basic.launch;
    const reach = d.reach * (M.k_blade && isBerserk(p) ? 1.3 : 1);
    const ts = meleeTargets(p, reach);
    for (const e of ts) {
      if (M.armorBreak) e.ab = 3;
      const base = { basic: true, forceCrit: core3 };
      if (launcher) {
        if (M.k_launch) e.shock = true;
        damageEnemy(e, pAtk(p) * mult, Object.assign(base, { kb: 120, hitstop: 0.08, heavy: true, launch: d.basic.launch * (M.k_launch ? 1.3 : 1), fin: true }));
      } else damageEnemy(e, pAtk(p) * mult, Object.assign(base, { kb: idx === 2 ? 460 : 170, hitstop: idx === 2 ? 0.08 : 0.045, heavy: idx === 2, fin: idx === 2 }));
    }
    if (ts.length && M.basicCd) for (let j = 0; j < 3; j++) p.cd[j] = Math.max(0, p.cd[j] - M.basicCd);
    slashFx(p.x + p.dir * 90, FLOOR - 125 - p.y, p.dir, isBerserk(p) ? '#ff4a3a' : '#ffffff', idx === 2 ? 1.5 : 1, launcher ? -0.9 : 0);
    if (idx === 2) world.shake = Math.max(world.shake, 0.12);
    if (core3) {
      spawnProj({ x: p.x + p.dir * 80, y: FLOOR - 110 - p.y, vx: p.dir * 900, dmg: pAtk(p) * 0.5, r: M.wavePierce ? 90 : 60, kind: 'fire', color: '#e6f0ff', kb: 200, pierce: true, big: true, life: 0.6 });
    }
    if (M.cloneDance) for (const c of world.clones) cloneBasic(c);
  } else {
    spawnProj({ x: p.x + p.dir * 70, y: FLOOR - 130 - p.y, vx: p.dir * (d.proj === 'bolt' ? 1150 : 760), dmg: pAtk(p) * mult,
      r: idx === 2 ? 40 : 26, kind: d.proj, color: d.color, kb: idx === 2 ? 300 : 110, big: idx === 2, from: 'p', basic: true, fin: idx === 2 });
    burst(p.x + p.dir * 70, FLOOR - 130 - p.y, d.color, 4, 90);
  }
}

function airHit(idx) {
  const p = world.player;
  const d = p.def;
  if (d.ranged) { basicHit(idx); return; }
  const mult = [1.0, 1.15, 1.3][idx];
  for (const e of meleeTargets(p, d.reach * 0.95, true)) {
    if (idx === 2) damageEnemy(e, pAtk(p) * mult, { kb: 260, hitstop: 0.08, heavy: true, spike: true, basic: true, fin: true });
    else damageEnemy(e, pAtk(p) * mult, { kb: 90, hitstop: 0.05, pop: 520, basic: true });
  }
  slashFx(p.x + p.dir * 85, FLOOR - 120 - p.y, p.dir, '#ffffff', idx === 2 ? 1.4 : 1, idx === 2 ? 0.8 : 0.25);
}

function spawnProj(o) {
  world.projs.push(Object.assign({ life: 1.5, hit: new Set(), pierce: false, delay: 0, from: 'p', r: 26, kb: 100 }, o));
}

function trySkill(i) {
  const p = world.player;
  const sk = p.def.skills[i];
  const M = p.mods;
  const isNorm = !sk.ult;
  if (p.cd[i] > 0) return false;
  const msg = (t) => { if (p.weakMsg <= 0) { p.weakMsg = 0.8; floatText(p.x, FLOOR - HERO_H - 30 - p.y, t, '#9aa4b4', 22); } return false; };
  if (M.sealIdx === i || (M.noShield && sk.type === 'shield')) return msg(`${sk.name}已被封印`);
  if (p.weak > 0) return msg(`虚弱 ${p.weak.toFixed(1)}s · 无法放技能`);
  if (M.solo && isNorm && isBerserk(p)) return msg('孤注：奥义期间无法放普通技能');
  faceAssist(p);
  let cdr = M.cdr + M.cdSkill[i] + (isNorm ? (M.normCd || 0) : 0);
  let bonus = 1;
  const at0 = { x: p.x, y: FLOOR - HERO_H - 56 - p.y };
  if (isNorm && M.scroll && p.scrollT > 0 && p.scrollFrom !== i) { cdr += 0.3; bonus = 1.2; floatText(at0.x, at0.y, '秘卷·连环', '#5aa9ff', 22); }
  p.cd[i] = sk.cd * Math.max(0.2, 1 - cdr) * (1 + M.cdPlus + (isNorm ? (M.normCdPlus || 0) : 0));
  if (isNorm && M.noCdProb && Math.random() < M.noCdProb) { p.cd[i] = 0; floatText(p.x + 40, FLOOR - HERO_H - 4 - p.y, '无冷却', '#8affd0', 20); }
  if (isNorm && M.scroll) { p.scrollT = 4; p.scrollFrom = i; }
  if (isNorm && M.twoCrit) {
    if (p.twoT > 0 && p.twoFrom !== i) { p.forceCritT = world.t + 0.8; floatText(at0.x, at0.y - 28, '双技·必暴击', '#b36bff', 22); }
    p.twoT = 1.5; p.twoFrom = i;
  }
  if (sk.ult && M.ultReset) { for (let j = 0; j < 3; j++) p.cd[j] = 0; floatText(at0.x, at0.y - 28, '极意：技能重置', '#ffd23a', 22); }
  p.lastSkillT = world.t;
  if (isNorm && M.petPounce) for (const q of world.pets) if (q.kind === 'wolf') q.cd = 0;
  if (isNorm && p.pdWin > 0) { p.pdWin = 0; p.cd[i] = 0; floatText(at0.x, at0.y - 56, '闪避反打', '#8affd0', 24); }
  if (M.k_bashChain && sk.type !== 'shield') {
    const wi = p.def.skills.findIndex((q) => q.type === 'shield');
    if (wi >= 0 && p.cd[wi] > 0) { p.cd[wi] = Math.max(0, p.cd[wi] - 1.5); floatText(p.x - 40, FLOOR - HERO_H - 4 - p.y, '盾墙 -1.5s', '#7ab8ff', 18); }
  }
  const instant = ['shield', 'heal', 'warcry', 'gale'].includes(sk.type);
  const clip = ANIMS[p.key + '_attack'];
  const hitFrac = clip ? clip.hit / Math.max(1, clip.n - 1) : 0.5;
  let dur = (sk.castDur || 0.52) / pSpd(p);
  let hitAt = sk.castHit != null ? sk.castHit / pSpd(p) : instant ? 0.08 : dur * Math.min(0.6, hitFrac);
  if (sk.type === 'spin' && M.k_spinCore) { dur = 1.25 / pSpd(p); hitAt = 0.05; }
  const link = p.state === 'attack' && p.at && p.at.type === 'basic' && p.at.done;
  p.castMul = (link ? 1 + M.link : 1) * bonus * (1 + 0.1 * p.pdStack);
  if (link) world.stats.link++;
  p.state = 'cast';
  p.at = { type: 'skill', t: 0, dur, hitAt, done: false, sk, si: i, charge: 0, chargeDone: false,
    fire: () => {
      world.fireHit = 0;
      skillFire(sk);
      if (isNorm && M.ultCharge && world.fireHit > 0) p.cd[3] = Math.max(0, p.cd[3] - M.ultCharge);
    } };
  p.buffer = 0;
  if (p.y > 0) { p.vz = Math.max(p.vz, 0); p.hang = dur; }
  floatText(p.x, FLOOR - HERO_H - 24 - p.y, sk.name, p.def.color, 28);
  if (link) floatText(p.x, FLOOR - HERO_H - 56 - p.y, `连携 +${Math.round(M.link * 100)}%`, '#8affd0', 22);
  if (isNorm && M.clone) spawnClones(sk);
  if (isNorm && M.echo) later(hitAt + 0.5, () => { if (!p.dead && world.state === 'play') fireAs({ x: p.x, dir: p.dir }, sk, 0.4); });
  return true;
}

/* 以另一个位置（分身 / 余波）复刻技能：用原型继承的代理对象临时替换 world.player */
function fireAs(act, sk, mulO) {
  const real = world.player;
  const px = Object.create(real);
  px.x = act.x; px.dir = act.dir; px.y = 0; px.isClone = true; px.at = null; px.counter = 0; px.followT = 0; px.castMul = mulO;
  world.player = px;
  const old = world.noCritAll;
  if (!real.mods.cloneInherit) world.noCritAll = true;
  try { if (sk.type === 'shield') doBash(px, sk, mulO); else skillFire(sk); } finally { world.player = real; world.noCritAll = old; }
}

function spawnClones(sk) {
  const p = world.player, M = p.mods;
  const n = M.cloneN || 1;
  const mulC = (n >= 2 ? 0.35 : 0.4) * (1 + (M.cloneDmg || 0));
  const life = 3 + (M.cloneLife || 0);
  for (let k = 0; k < n; k++) {
    world.clones.push({ x: clamp(p.x - p.dir * (70 + 70 * k), 60, W - 60), dir: p.dir, t: 0, life, sk, mul: mulC, fired: false, flash: 0 });
  }
  burst(p.x - p.dir * 70, FLOOR - 100 - p.y, '#4fe3d0', 8, 140);
}

function cloneBasic(c) {
  const p = world.player;
  const [x0, x1] = c.dir > 0 ? [c.x - 25, c.x + p.def.reach] : [c.x - p.def.reach, c.x + 25];
  for (const e of liveEnemies()) if (overlap(x0, x1, e.x - halfW(e), e.x + halfW(e))) damageEnemy(e, pAtk(p) * 0.4, { kb: 120, basic: true, noCrit: !p.mods.cloneInherit, dot: true, color: '#4fe3d0' });
  slashFx(c.x + c.dir * 90, FLOOR - 125, c.dir, '#4fe3d0', 1);
}

function updateClones(dt) {
  const p = world.player;
  for (const c of world.clones) {
    c.t += dt;
    c.flash -= dt;
    if (!c.fired && c.t >= 0.5) { c.fired = true; c.flash = 0.2; fireAs(c, c.sk, c.mul); }
  }
  const dead = world.clones.filter((c) => c.t >= c.life);
  for (const c of dead) {
    if (p.mods.cloneBurst) { aoeAt(c.x, 140, pAtk(p) * 0.6 * c.mul / 0.4, { kb: 260, noCrit: true, dot: true, color: '#4fe3d0' }); ringFx(c.x, FLOOR - 20, '#4fe3d0', 150, 0.3); }
    burst(c.x, FLOOR - 100, '#4fe3d0', 8, 140);
  }
  world.clones = world.clones.filter((c) => c.t < c.life);
}

function petKinds(M) {
  const k = [];
  if (M.pet) k.push('wolf');
  if (M.raven) k.push('raven');
  if (M.stone) k.push('stone');
  return k;
}

function updatePets(dt) {
  const p = world.player, M = p.mods;
  for (const kind of petKinds(M)) {
    if (world.pets.some((q) => q.kind === kind)) continue;
    const pet = { kind, x: p.x - 90, cd: 1, lunge: 0, dir: 1, alive: true, respawn: 0 };
    if (kind === 'stone') { pet.maxHp = Math.round(p.maxHp * (M.stoneTier ? 0.45 : 0.3)); pet.hp = pet.maxHp; }
    world.pets.push(pet);
  }
  p.petFrenzy = Math.max(0, p.petFrenzy - dt);
  const tier = M.petTier || 0;
  if (M.pet && tier >= 2 && !p.dead) {
    p.howlT = (p.howlT == null ? 4 : p.howlT) - dt;
    if (p.howlT <= 0) { p.howlT = 6; p.buffs.push({ atk: 0.1, t: 3 }); floatText(p.x, FLOOR - HERO_H - 40 - p.y, '月狼嚎叫', '#7dff9a', 22); }
  }
  world.pets.forEach((pet, idx) => {
    const tx = p.x - p.dir * (90 + idx * 55);
    pet.x += (tx - pet.x) * Math.min(1, dt * 4);
    pet.lunge = Math.max(0, pet.lunge - dt * 3);
    if (pet.kind === 'stone') {
      if (!pet.alive) { pet.respawn -= dt; if (pet.respawn <= 0) { pet.alive = true; pet.hp = pet.maxHp; floatText(pet.x, FLOOR - 120, '石灵复活', '#9fe8d0', 22); } }
      return;
    }
    if (pet.kind !== 'wolf') return;
    pet.cd -= dt * (p.petFrenzy > 0 ? 1.5 : 1);
    if (pet.cd <= 0 && !p.dead) {
      const e = liveEnemies().filter((q) => Math.abs(q.x - pet.x) < 520).sort((a, b) => Math.abs(a.x - pet.x) - Math.abs(b.x - pet.x))[0];
      if (e) {
        pet.cd = 1.1 * (1 - (M.petCdr || 0)); pet.lunge = 1; pet.dir = sign(e.x - pet.x);
        const m = [0.3, 0.45, 0.6][tier] * (1 + (M.petDmg || 0)) * (p.petFrenzy > 0 ? 2 : 1)
          * (1 + 0.02 * (world.petStack || 0)) * (M.petPack && world.pets.length >= 2 ? 1.3 : 1);
        const o = { kb: 90, dot: true, pet: true, noCrit: !M.petCrit, color: '#7dff9a' };
        const bite = () => { if (tier >= 1) aoeAt(e.x, 100, pAtk(p) * m, o); else damageEnemy(e, pAtk(p) * m, o); };
        bite();
        if (M.petDouble && Math.random() < 0.25) later(0.18, () => { if (!e.dead) { bite(); floatText(e.x, FLOOR - e.def.h - 10 - e.y, '连噬', '#7dff9a', 20); } });
        if (M.petBleed) for (const t of [0.5, 1.0, 1.5]) later(t, () => damageEnemy(e, pAtk(p) * m * 0.3, { dot: true, noCrit: true, color: '#ff6a6a' }));
        burst(e.x, FLOOR - e.def.h * 0.4 - e.y, '#7dff9a', 6, 150);
        slashFx(e.x, FLOOR - e.def.h * 0.5 - e.y, pet.dir, '#7dff9a', 0.7);
      }
    }
  });
}

/* 盾击：盾墙结束时前冲，范围震晕。分身复刻盾墙时也只打出盾击 */
function doBash(p, sk, mulO) {
  const M = p.mods, B = sk.bash;
  const rng = (!p.isClone || M.cloneInherit) ? 1 + (M.normRange || 0) : 1;
  const radius = B.radius * (M.k_roar ? 1.2 : 1) * rng;
  const stun = B.stun + (M.k_awe ? 0.6 : 0);
  const a = pAtk(p) * (mulO != null ? mulO : 1) * M.skillAll * (M.normMul || 1) * B.mult;
  const n = aoeAt(p.x, radius, a, { kb: 380, stun, heavy: true, hitstop: 0.06 });
  if (!p.isClone) p.bashT = BASH_VIS;
  if (M.k_awe) for (const e of liveEnemies()) if (Math.abs(e.x - p.x) <= radius + halfW(e) && (e.def.boss || e.def.elite)) { e.exposed = 2; floatText(e.x, FLOOR - e.def.h - 20 - e.y, '破绽', '#ffe27a', 24); }
  if (n && !p.isClone) floatText(p.x, FLOOR - HERO_H - 56 - p.y, '盾击震慑！接重斩处决', '#ffe27a', 22);
  if (n && M.k_break && !p.isClone) {
    const ri = p.def.skills.findIndex((q) => q.type === 'slash');
    if (ri >= 0 && p.cd[ri] > 0) { p.cd[ri] = 0; floatText(p.x, FLOOR - HERO_H - 84 - p.y, '破阵令：重斩就绪', '#ffd23a', 24); }
  }
  if (M.k_rock && !p.isClone && p.counter > 0) {
    aoeAt(p.x, 260, pAtk(p) * 0.5 * p.counter, { kb: 420, heavy: true, noCrit: true, hitstop: 0.06 });
    ringFx(p.x, FLOOR - 30, '#ffd08a', 280, 0.45);
  }
  ringFx(p.x, FLOOR - 30, '#7ab8ff', radius, 0.4);
  burst(p.x, FLOOR - 90, '#7ab8ff', 14, 240);
  world.shake = Math.max(world.shake, 0.16);
}

function aoeAt(cx, radius, dmg, o = {}) {
  let hit = 0;
  for (const e of liveEnemies()) {
    if (overlap(cx - radius, cx + radius, e.x - halfW(e), e.x + halfW(e))) { damageEnemy(e, dmg, o); hit++; }
  }
  return hit;
}

function skillFire(sk) {
  const p = world.player;
  const M = p.mods;
  const si = p.def.skills.indexOf(sk);
  const isNorm = !sk.ult;
  const a = pAtk(p) * p.castMul * M.skillAll * M.skMul[si] * (isNorm ? (M.normMul || 1) * (M.ultAfter && p.afterT > 0 ? 1.25 : 1) : 1);
  const rng = isNorm && (!p.isClone || M.cloneInherit) ? 1 + (M.normRange || 0) : 1;
  const dir = p.dir;
  const T = sk.type;
  if (T === 'slash') {
    const stacks = p.counter;
    p.counter = 0;
    const perStack = M.k_nail ? 0.7 : 0.5;
    const targets = meleeTargets(p, (sk.range + stacks * 40) * rng);
    const chargeMul = 1 + 0.08 * Math.floor(((p.at && p.at.charge) || 0) / 0.1);
    let execs = 0;
    let rifted = false;
    for (const e of targets) {
      const exec = e.stun > 0 || e.vuln || e.exposed > 0 || (M.k_airExec && e.y > 0);
      const m = sk.mult * (1 + perStack * stacks) * (exec ? 2 : 1) * chargeMul;
      const dealt = damageEnemy(e, a * m, { kb: exec ? 720 : 520, hitstop: exec ? 0.16 : 0.09, heavy: true, forceCrit: exec && M.k_break });
      if (M.k_follow) p.followT = 2;
      if (M.k_rift && !rifted) { rifted = true; world.slowZones.push({ x: e.x, r: 130, t: 0, dur: 3 }); }
      if (exec) {
        execs++;
        world.stats.exec++;
        e.stun = 0;
        e.exposed = 0;
        floatText(e.x, FLOOR - e.def.h - 46 - e.y, '处决!', '#ffd23a', 42);
        burst(e.x, FLOOR - e.def.h * 0.5 - e.y, '#ffd23a', 18, 300);
        if (M.k_echo) {
          for (const o2 of liveEnemies()) {
            if (o2 !== e && Math.abs(o2.x - e.x) < 400) damageEnemy(o2, dealt * 0.8, { kb: 260, noCrit: true, echo: true, color: '#ffd23a' });
          }
          ringFx(e.x, FLOOR - 20, '#ffd23a', 400, 0.4);
        }
      }
    }
    if (execs) world.slow = Math.max(world.slow, 0.3);
    if (stacks) world.stats.counter += stacks;
    if (stacks) floatText(p.x, FLOOR - HERO_H - 56 - p.y, `反击 ×${stacks}`, '#7ab8ff', 28);
    p.kbV += dir * 560;
    slashFx(p.x + dir * 150, FLOOR - 120 - p.y, dir, execs ? '#ffd23a' : '#ff9a6a', 2.4 + stacks * 0.3 + (chargeMul - 1));
    world.shake = Math.max(world.shake, execs ? 0.3 : 0.2);
  } else if (T === 'spin') {
    let told = false;
    const once = (last) => {
      for (const e of liveEnemies()) {
        if (Math.abs(e.x - p.x) > sk.radius * rng + halfW(e) || !vOverlap(p, e)) continue;
        const air = e.y > 0 && !e.def.boss;
        let mul = air ? (M.k_floatChain ? 2.0 : 1.5) : 1;
        const stunned = e.stun > 0;
        if (M.k_spinStun && stunned) { mul *= 1.5; e.stun = Math.max(e.stun, 1.2); }
        const kb = M.k_eye ? -320 : air ? 60 : 380;
        const o = { kb, heavy: true, hitstop: 0.05, pop: 680 };
        if (last && M.k_spinCore && !e.def.boss) o.launch = 900;
        damageEnemy(e, a * sk.mult * (M.k_spinCore ? 0.3 : 0.5) * mul, o);
        if (air && !told) { told = true; floatText(e.x, FLOOR - e.def.h - 40 - e.y, '浮空追击', '#8affd0', 26); }
      }
      ringFx(p.x, FLOOR - 30 - p.y, '#ffd08a', sk.radius * rng + 40, 0.3);
      world.shake = Math.max(world.shake, 0.1);
    };
    const wave = () => {
      if (!M.k_wave) return;
      spawnProj({ x: p.x + dir * 70, y: FLOOR - 120 - p.y, vx: dir * 820, dmg: a * sk.mult * 1.5, r: 70, kind: 'fire', color: '#ffd08a', kb: 360, pierce: true, big: true, life: 1.2 });
      slashFx(p.x + dir * 140, FLOOR - 120 - p.y, dir, '#ffd08a', 2.2);
    };
    if (M.k_spinCore) {
      for (let i = 0; i < 4; i++) later(i * 0.3, () => { if (!p.dead) { once(i === 3); if (i === 3) wave(); } });
    } else { once(false); later(0.2, () => { once(false); wave(); }); }
  } else if (T === 'warcry') {
    const bz = !!sk.berserk;
    const amp = M.ultAmp || 1;
    const dur = (sk.dur + (bz && M.k_moon ? 4 : 0)) * (M.ultDur || 1);
    p.buffs.push({ atk: sk.atk * amp, spd: sk.spd || 0, t: dur, berserk: bz, weak: bz ? (M.k_moon ? 1.5 : sk.weak || 0) : 0, extra: 0 });
    if (M.ultRedo) later(2, () => { if (!p.dead && world.state === 'play') { p.buffs.push({ atk: sk.atk * amp * 0.5, spd: (sk.spd || 0) * 0.5, t: Math.max(1, dur - 2), berserk: false, weak: 0, extra: 0 }); floatText(p.x, FLOOR - HERO_H - 70 - p.y, '重演', '#ffd23a', 24); } });
    if (M.petCmd) p.petFrenzy = 8;
    if (M.cloneUlt) {
      for (const x of [p.x, ...world.clones.map((c) => c.x)]) {
        aoeAt(x, 240, a * 1.2, { kb: 320, heavy: true, hitstop: 0.05, noCrit: true });
        ringFx(x, FLOOR - 30, '#4fe3d0', 260, 0.45);
      }
    }
    const radius = sk.radius * (M.ultDur ? 1.25 : 1);
    ringFx(p.x, FLOOR - 30, bz ? '#ff4a3a' : '#ffb36b', radius, 0.5);
    if (bz) {
      ringFx(p.x, FLOOR - 60, '#ff2a1a', radius * 0.7, 0.7);
      burst(p.x, FLOOR - 120, '#ff3a2a', 26, 300);
      floatText(p.x, FLOOR - HERO_H - 90 - p.y, '狂战!', '#ff5a4a', 44);
      world.slow = Math.max(world.slow, 0.25);
    }
    world.shake = Math.max(world.shake, 0.2);
  } else if (T === 'shield') {
    p.shield = p.maxHp * sk.pct * (M.k_fort ? 1.15 : 1);
    p.shieldT = sk.dur;
    p.shieldAge = 0;
    p.bashSk = sk.bash ? sk : null;
    p.pbUsed = false;
    p.thorns = sk.thorns || 0;
    p.counterMax = (M.k_rock ? 5 : sk.counter || 0) + (M.k_nail ? 2 : 0);
    ringFx(p.x, FLOOR - 60 - p.y, '#7ab8ff', 120, 0.5);
  } else if (T === 'fireball') {
    spawnProj({ x: p.x + dir * 70, y: FLOOR - 130, vx: dir * 700, dmg: a * sk.mult, r: 46, kind: 'fire', color: '#c58bff', kb: 380, pierce: true, big: true, life: 1.6 });
    world.shake = Math.max(world.shake, 0.08);
  } else if (T === 'burst') {
    const cx = clamp(p.x + dir * sk.dist, 80, W - 80);
    world.rings.push({ x: cx, y: FLOOR - 10, color: '#a0ff9a', max: sk.radius, life: 0.45, total: 0.45, ground: true, grow: true });
    later(0.45, () => { aoeAt(cx, sk.radius, a * sk.mult, { kb: 420, heavy: true, hitstop: 0.07, label: sk.name }); burst(cx, FLOOR - 60, '#a0ff9a', 22, 260); ringFx(cx, FLOOR - 20, '#a0ff9a', sk.radius + 30, 0.3); world.shake = Math.max(world.shake, 0.18); });
  } else if (T === 'plague') {
    const cx = clamp(p.x + dir * sk.dist, 80, W - 80);
    world.zones.push({ x: cx, r: sk.radius, t: 0, dur: sk.dur, acc: 0, dps: a * sk.dps });
    burst(cx, FLOOR - 20, '#7de06a', 14, 120);
  } else if (T === 'smite') {
    let tgt = nearestEnemy(p.x + dir * 200);
    let cx = tgt && Math.abs(tgt.x - p.x) < sk.range ? tgt.x : clamp(p.x + dir * 320, 80, W - 80);
    world.rings.push({ x: cx, y: FLOOR - 10, color: '#fff2a8', max: sk.radius, life: 0.4, total: 0.4, ground: true, grow: true });
    later(0.4, () => { aoeAt(cx, sk.radius, a * sk.mult, { kb: 380, heavy: true, hitstop: 0.08, label: sk.name }); world.bolts.push({ x: cx, life: 0.28, total: 0.28 }); burst(cx, FLOOR - 40, '#fff2a8', 18, 220); world.shake = Math.max(world.shake, 0.16); });
  } else if (T === 'heal') {
    const h = p.maxHp * sk.pct;
    p.hp = Math.min(p.maxHp, p.hp + h);
    floatText(p.x, FLOOR - HERO_H - 52, '+' + Math.round(h), '#7dff9a', 30);
    burst(p.x, FLOOR - 100, '#fff2a8', 20, 140);
    ringFx(p.x, FLOOR - 30, '#fff2a8', 140, 0.5);
  } else if (T === 'nova') {
    const n = aoeAt(p.x, sk.radius, a * sk.mult, { kb: 430, heavy: true, hitstop: 0.06 });
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * sk.heal);
    ringFx(p.x, FLOOR - 30, '#ffffff', sk.radius + 30, 0.4);
    burst(p.x, FLOOR - 90, '#fff2a8', 18, 220);
    if (n) world.shake = Math.max(world.shake, 0.12);
  } else if (T === 'triple') {
    for (let i = 0; i < 3; i++) later(i * 0.09, () => { spawnProj({ x: p.x + dir * 70, y: FLOOR - 130 + (i - 1) * 12, vx: dir * 1250, dmg: a * sk.mult, r: 26, kind: 'bolt', color: '#ffe9b0', kb: 200, from: 'p' }); burst(p.x + dir * 70, FLOOR - 130, '#ffe9b0', 3, 90); });
  } else if (T === 'poisonarrow') {
    spawnProj({ x: p.x + dir * 70, y: FLOOR - 130, vx: dir * 1000, dmg: a * sk.mult, r: 30, kind: 'bolt', color: '#7de06a', kb: 150, poison: { dps: a * sk.dps, t: sk.dur } });
  } else if (T === 'volley') {
    const cx = clamp(p.x + dir * sk.dist, 80, W - 80);
    world.rings.push({ x: cx, y: FLOOR - 10, color: '#d8e8ff', max: sk.radius, life: 0.4, total: 0.4, ground: true, grow: true });
    for (let i = 0; i < 3; i++) later(0.4 + i * 0.18, () => { aoeAt(cx, sk.radius, a * sk.mult, { kb: 140, hitstop: 0.03 }); burst(cx + rnd(-sk.radius, sk.radius) * 0.7, FLOOR - 40, '#d8e8ff', 8, 160); world.shake = Math.max(world.shake, 0.06); });
  } else if (T === 'gale') {
    p.buffs.push({ spd: sk.haste, t: sk.dur });
    p.state = 'dodge'; p.at = null; p.dodgeDir = dir; p.dodgeT = 0.16; p.dodgeVis = DODGE_VIS; p.dodgeInv = 0.3; p.trail = []; p.perfectUsed = true;
    p.kbV += dir * 0;
    ringFx(p.x, FLOOR - 50, '#8affd0', 120, 0.4);
  }
}

function damageEnemy(e, dmg, o = {}) {
  if (e.dead) return 0;
  const p = world.player;
  const M = p.mods;
  let crit = false;
  const fc = o.forceCrit || (p.forceCritT > world.t && !o.basic && !o.dot);
  if (!o.noCrit && !world.noCritAll && (fc || Math.random() < 0.1 + M.crit + (o.basic ? M.basicCrit : 0))) { crit = true; dmg *= 1.7 + M.critDmg; }
  if (!o.dot) {
    if (!o.basic && !o.chase && M.skillDmg && world.t - p.lastSkillT < 1.4) dmg *= 1 + M.skillDmg;
    if (o.fin && M.fin) dmg *= 1 + M.fin;
    if ((e.def.boss || e.def.elite) && M.bossDmg) dmg *= 1 + M.bossDmg;
    if (e.mark > 0) dmg *= 1.2;
    if (e.ab > 0) dmg *= 1.08;
    if (!o.basic) world.fireHit++;
    if (M.frenzy) dmg *= 1 + Math.min(0.25, 0.05 * Math.floor(world.chain / 10)) * M.frenzy;
    if (p.ember > 0) dmg *= 1 + 0.15 * M.ember;
    if (p.counterBuff && !o.chase) { p.counterBuff = false; dmg *= 1 + 0.6 * M.counter; floatText(p.x, FLOOR - HERO_H - 40 - p.y, '反击!', '#8affd0', 28); }
    if (o.basic) {
      if (M.petSync) for (const q of world.pets) if (q.kind === 'wolf') q.cd -= 0.12;
      if (M.k_moon && isBerserk(p)) dmg *= 1.2;
      if (M.k_rage && p.weak > 0) dmg *= 1.3;
      if (p.followT > 0 && !o.chase) { p.followT = 0; dmg *= 1.6; floatText(p.x, FLOOR - HERO_H - 40 - p.y, '追斩!', '#ffb347', 24); }
    }
  }
  if (e.vuln) dmg *= 1.25;
  if (e.exposed > 0) dmg *= 1.25;
  if (e.def.dr && !e.vuln && !(e.exposed > 0) && !(e.stun > 0)) dmg *= 1 - e.def.dr;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.flash = 0.1;
  if (crit && M.mark) e.mark = 3;
  if (o.basic && M.chase && !o.chase && Math.random() < 0.2 * M.chase) later(0.08, () => damageEnemy(e, dmg * 0.5, { chase: true, noCrit: true, color: '#ffe9b0' }));
  const away = sign(e.x - (p.isClone ? world.player.x : p.x));
  let kb = o.kb || 0;
  if (!e.def.boss) {
    if (o.launch) { launchEnemy(e, o.launch); kb *= 0.3; }
    else if (o.spike && e.y > 0) { e.vz = -1900; e.spike = dmg * 0.6; }
    else if (e.y > 0 && !o.dot) { e.vz = Math.max(e.vz, o.pop || 380); kb *= 0.25; }
  }
  e.kbV += away * kb * (e.def.boss ? 0.12 : 1);
  if (o.stun && !e.def.boss) e.stun = Math.max(e.stun, o.stun);
  if (o.heavy && !e.def.boss && (e.state === 'windup')) interrupt(e);
  if (o.hitstop) world.hitstop = Math.max(world.hitstop, o.hitstop);
  if (!o.dot) { world.chain++; world.chainT = 1.8; world.chainPop = 1; world.bestChain = Math.max(world.bestChain, world.chain); }
  const ey = FLOOR - e.y;
  burst(e.x, ey - e.def.h * 0.55, crit ? '#ffd23a' : '#ffffff', crit ? 9 : 4, crit ? 220 : 150);
  floatText(e.x + rnd(-16, 16), ey - e.def.h - 6, (o.label === '反伤' ? '反伤 ' : '') + dmg + (crit ? '!' : ''), crit ? '#ffd23a' : (o.color || '#ffffff'), crit ? 34 : 26);
  if (e.hp <= 0) killEnemy(e, o);
  return dmg;
}

function launchEnemy(e, v) {
  if (e.hz) e.hz.cancel = true;
  e.hz = null;
  if (e.state !== 'move') e.state = 'move';
  e.cd = Math.max(e.cd, 0.7);
  e.vz = v;
  e.y = Math.max(e.y, 1);
  world.stats.launch++;
}

function landEnemy(e) {
  const hard = e.vz < -1300;
  e.y = 0;
  e.vz = 0;
  e.stun = Math.max(e.stun, hard ? 0.6 : 0.35);
  burst(e.x, FLOOR - 8, '#cfd8e6', hard ? 12 : 5, hard ? 220 : 110);
  if (e.spike) {
    const d = e.spike;
    e.spike = 0;
    world.stats.spike++;
    world.shake = Math.max(world.shake, 0.18);
    floatText(e.x, FLOOR - e.def.h - 40, '砸地!', '#ffb36b', 28);
    damageEnemy(e, d, { noCrit: true, hitstop: 0.05 });
  }
  if (e.shock) {
    e.shock = false;
    const p = world.player;
    aoeAt(e.x, 120, pAtk(p) * 0.6, { kb: 260, heavy: true, noCrit: true, shockEcho: true });
    ringFx(e.x, FLOOR - 10, '#ffd08a', 140, 0.3);
    world.shake = Math.max(world.shake, 0.14);
  }
}

function interrupt(e) {
  if (e.hz) e.hz.cancel = true;
  e.hz = null;
  e.state = 'move';
  e.stun = 0.55;
  e.cd = 0.9;
  floatText(e.x, FLOOR - e.def.h - 34, '打断!', '#ffe27a', 24);
}

function killEnemy(e, o = {}) {
  e.dead = true;
  e.deadT = 0;
  if (e.hz) e.hz.cancel = true;
  world.kills++;
  const p = world.player, M = p.mods;
  world.coins += Math.round((COINS[e.key] || 2) * (e.def.elite ? 4 : 1) * (1 + M.coin));
  if (M.petFeed && world.pets.length) world.petStack = Math.min(15, (world.petStack || 0) + 1);
  if (o.pet && M.petKillCd) for (let j = 0; j < 3; j++) p.cd[j] = Math.max(0, p.cd[j] - 1);
  if (M.ultKill && (e.def.boss || e.def.elite)) { p.cd[3] = Math.max(0, p.cd[3] - 8); floatText(p.x, FLOOR - HERO_H - 70 - p.y, '斩首：奥义 -8s', '#ffd23a', 22); }
  if (M.killHeal && !p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * M.killHeal);
  if (M.k_lust && isBerserk(p)) {
    const b = p.buffs.find((q) => q.berserk);
    if (b && b.extra < 3) { b.extra += 0.5; b.t += 0.5; floatText(p.x, FLOOR - HERO_H - 70 - p.y, '狂战 +0.5s', '#ff5a4a', 20); }
  }
  if (M.killBlast && !o.blast && Math.random() < 0.25 * M.killBlast) {
    const x = e.x;
    later(0.12, () => { aoeAt(x, 150, pAtk(p), { kb: 320, blast: true, noCrit: true, color: '#9fe8ff' }); ringFx(x, FLOOR - 20, '#9fe8ff', 170, 0.35); burst(x, FLOOR - 50, '#9fe8ff', 14, 240); });
  }
  burst(e.x, FLOOR - e.def.h * 0.5, '#ffffff', 16, 260);
  if (e.def.boss) { world.slow = 0.9; world.shake = 0.4; burst(e.x, FLOOR - e.def.h * 0.5, '#ffd23a', 40, 420); }
}

function hurtPlayer(dmg, srcX, kb = 200) {
  const p = world.player;
  const M = p.mods;
  if (p.dead || world.state !== 'play') return false;
  if (p.dodgeInv > 0) {
    if (!p.perfectUsed) {
      p.perfectUsed = true;
      p.dodgeCd = 0;
      world.slow = Math.max(world.slow, 0.45 + (M.pdSlow || 0));
      floatText(p.x, FLOOR - HERO_H - 10, '完美闪避!', '#8affd0', 32);
      burst(p.x, FLOOR - 100, '#8affd0', 16, 200);
      if (M.counter) p.counterBuff = true;
      p.pdWin = 1.5;
      floatText(p.x, FLOOR - HERO_H - 44, '闪避反打：下个技能免冷却', '#8affd0', 22);
      if (M.pdStack) { p.pdStack = Math.min(3, p.pdStack + 1); p.pdStackT = 8; floatText(p.x, FLOOR - HERO_H - 70, `残影 ×${p.pdStack}`, '#4fe3d0', 22); }
      if (M.pdCrit) p.forceCritT = Math.max(p.forceCritT, world.t + 3);
      if (M.pdShield) { p.shield += p.maxHp * M.pdShield; floatText(p.x + 30, FLOOR - HERO_H - 20, '护盾 +' + Math.round(p.maxHp * M.pdShield), '#7ab8ff', 22); }
    }
    return false;
  }
  if (p.inv > 0) return false;
  if (M.cloneSub && p.subT <= 0 && world.clones.length) {
    const c = world.clones.shift();
    p.subT = 10; p.inv = 0.5;
    burst(c.x, FLOOR - 100, '#4fe3d0', 14, 200);
    floatText(p.x, FLOOR - HERO_H - 10, '替身!', '#4fe3d0', 32);
    return false;
  }
  if (M.k_perfect && p.shieldT > 0 && p.shieldAge < 0.5 && !p.pbUsed) {
    p.pbUsed = true;
    const si = p.def.skills.findIndex((s) => s.type === 'shield');
    if (si >= 0) p.cd[si] = Math.max(0, p.cd[si] - p.def.skills[si].cd * 0.5);
    p.inv = 0.4;
    floatText(p.x, FLOOR - HERO_H - 10, '完美格挡!', '#7ab8ff', 32);
    burst(p.x, FLOOR - 100, '#7ab8ff', 16, 220);
    world.slow = Math.max(world.slow, 0.3);
    return false;
  }
  const shieldUp = p.shieldT > 0;
  dmg *= 1 - clamp(M.reduce + M.wispRed * p.wisps + (M.petGuard || 0) * world.pets.length + (shieldUp && M.k_mount ? 0.2 : 0) + (p.state === 'cast' ? M.castReduce : 0), 0, 0.7);
  const raw = dmg;
  const noFlinch = (shieldUp && M.k_rock) || (isBerserk(p) && M.k_fear);
  if (noFlinch) kb = 0;
  if (shieldUp && M.k_rock && p.counterMax && p.counter < p.counterMax) { p.counter++; floatText(p.x - 30, FLOOR - HERO_H - 30 - p.y, `反击 +1 (${p.counter})`, '#7ab8ff', 24); }
  const stn = world.pets.find((q) => q.kind === 'stone' && q.alive);
  if (stn && dmg > 0) {
    const sab = Math.min(stn.hp, dmg);
    stn.hp -= sab; dmg -= sab; p.inv = Math.max(p.inv, 0.35);
    floatText(stn.x, FLOOR - 120, '石灵 -' + Math.round(sab), '#9fe8d0', 22);
    burst(stn.x, FLOOR - 50, '#9fe8d0', 8, 160);
    if (stn.hp <= 0) {
      stn.alive = false; stn.respawn = 20;
      floatText(stn.x, FLOOR - 150, '石灵破碎', '#9fe8d0', 26);
      if (M.stoneTier) { aoeAt(stn.x, 300, pAtk(p) * 1.2, { kb: 520, stun: 0.8, noCrit: true, dot: true, color: '#9fe8d0' }); ringFx(stn.x, FLOOR - 20, '#9fe8d0', 300, 0.4); world.shake = Math.max(world.shake, 0.2); }
    }
  }
  if (p.shield > 0) {
    const ab = Math.min(p.shield, dmg);
    p.shield -= ab;
    dmg -= ab;
    floatText(p.x + 30, FLOOR - HERO_H - p.y, '吸收 ' + Math.round(ab), '#7ab8ff', 22);
    if (p.thorns > 0) { const e = nearestEnemy(p.x); if (e) damageEnemy(e, ab * p.thorns * 2, { silent: true, noCrit: true, label: '反伤', color: '#9ff0a0' }); }
    if (!M.k_rock && ab > 0 && p.counterMax && p.counter < p.counterMax) { p.counter++; floatText(p.x - 30, FLOOR - HERO_H - 30 - p.y, `反击 +1 (${p.counter})`, '#7ab8ff', 24); }
    if (p.shield <= 0 && M.breakBlast) {
      aoeAt(p.x, 240, pAtk(p) * 2.2 * M.breakBlast, { kb: 520, heavy: true, hitstop: 0.08, noCrit: true, color: '#7ab8ff' });
      ringFx(p.x, FLOOR - 30, '#7ab8ff', 260, 0.45);
      burst(p.x, FLOOR - 90, '#7ab8ff', 18, 300);
      floatText(p.x, FLOOR - HERO_H - 70 - p.y, '护盾崩裂!', '#7ab8ff', 26);
    }
  }
  const refl = M.reflect + (shieldUp && M.k_thorn ? 0.4 : 0);
  if (refl && raw > 0) { const e = nearestEnemy(p.x); if (e && Math.abs(e.x - p.x) < 520) damageEnemy(e, raw * refl, { noCrit: true, dot: true, label: '反伤', color: '#9ff0a0' }); }
  if (dmg > 0) {
    p.hp -= dmg;
    p.pdStack = 0;
    p.flash = 0.12;
    p.hurtT = HURT_VIS;
    p.inv = 0.6;
    p.kbV += sign(p.x - srcX) * kb;
    world.shake = Math.max(world.shake, 0.22);
    world.hitstop = Math.max(world.hitstop, 0.07);
    world.chain = 0;
    floatText(p.x, FLOOR - HERO_H - p.y, '-' + Math.round(dmg), '#ff6a6a', 34);
    burst(p.x, FLOOR - 100 - p.y, '#ff5a5a', 10, 200);
    if ((p.state === 'attack' || p.state === 'cast') && !noFlinch) { if (kb > 250) { p.state = p.y > 0 ? 'air' : 'idle'; p.at = null; } }
  }
  if (p.hp <= 0) { p.hp = 0; p.dead = true; p.state = 'dead'; endBattle(false); }
  return true;
}

function addHazard(h) {
  h.t = 0;
  h.hit = false;
  world.hazards.push(h);
  return h;
}

function updateHazards(dt) {
  const p = world.player;
  for (const h of world.hazards) {
    h.t += dt;
    if (h.cancel) { h.dead = true; continue; }
    if (h.t >= h.delay && h.t <= h.delay + h.active && !h.hit && !p.dead) {
      if (p.y < (h.h || 60) && overlap(p.x - 24, p.x + 24, h.x0, h.x1)) { if (hurtPlayer(h.dmg, (h.x0 + h.x1) / 2, h.kb)) h.hit = true; }
      else if (!h.over && p.y >= (h.h || 60) && overlap(p.x - 24, p.x + 24, h.x0, h.x1)) { h.over = true; world.stats.jumpOver++; }
    }
    if (h.t > h.delay + h.active) h.dead = true;
  }
  world.hazards = world.hazards.filter((h) => !h.dead);
}

function spawnEnemy(key, x, opt = {}) {
  const base = ENEMIES[key];
  const m = world.eMul;
  const elite = !!opt.elite;
  let def = base;
  if (elite || opt.baseHp || m.hp !== 1 || m.dmg !== 1 || m.spd !== 1) {
    def = Object.assign({}, base, {
      hp: Math.round((opt.baseHp || base.hp) * m.hp * (elite ? 2.6 : 1)), dmg: Math.round(base.dmg * m.dmg * (elite ? 1.25 : 1)),
      speed: base.speed * m.spd * (elite ? 1.08 : 1), h: base.h * (elite ? 1.15 : 1), elite,
    });
  }
  if (opt.affix) {
    def = Object.assign({}, def, { affix: opt.affix });
    if (opt.affix === 'swift') def.speed *= 1.4;
    if (opt.affix === 'heavy') { def.dr = 0.3; def.h *= 1.1; }
    if (opt.affix === 'rage') def.rage = true;
  }
  const e = { def, key, x, hp: def.hp, maxHp: def.hp, state: 'move', t: 0, cd: rnd(0.3, 1), dir: -1, atkDir: -1, kbV: 0, flash: 0, dead: false, deadT: 0,
    stun: 0, dots: [], dotT: 0, phase: rnd(0, 6), hz: null, vuln: false, summoned: 0, y: 0, vz: 0, spike: 0, mark: 0, ab: 0, exposed: 0 };
  world.enemies.push(e);
  return e;
}

function windup(e, name, dur) { e.state = 'windup'; e.t = 0; e.wdur = dur; e.atk = name; }

function aiGrunt(e, dt, dir, dist) {
  const d = e.def;
  if (e.state === 'move') {
    e.dir = dir;
    if (dist > d.range * 0.85) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (dist <= d.range && e.cd <= 0) {
      windup(e, 'chop', d.windup);
      e.atkDir = dir;
      const len = d.range + 40;
      e.hz = addHazard({ x0: dir > 0 ? e.x : e.x - len, x1: dir > 0 ? e.x + len : e.x, delay: d.windup, active: 0.14, dmg: d.dmg, kb: 300, color: '255,70,50', h: 110, owner: e });
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) { e.state = 'recover'; e.t = 0; e.kbV += e.atkDir * 260; e.hz = null; }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= 0.55) { e.state = 'move'; e.cd = rnd(0.8, 1.6); }
  }
}

function aiImp(e, dt, dir, dist) {
  const d = e.def;
  if (e.state === 'move') {
    e.dir = dir;
    if (dist > 150) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (dist < 380 && e.cd <= 0) {
      windup(e, 'pounce', 0.45);
      e.atkDir = dir;
      e.hz = addHazard({ x0: dir > 0 ? e.x : e.x - 360, x1: dir > 0 ? e.x + 360 : e.x, delay: 0.45, active: 0.28, dmg: d.dmg, kb: 320, color: '255,120,50', h: 120, owner: e });
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) { e.state = 'dash'; e.t = 0; e.hz = null; }
  } else if (e.state === 'dash') {
    e.t += dt;
    e.x += e.atkDir * 1300 * dt;
    if (e.t >= 0.27) { e.state = 'recover'; e.t = 0; }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= 0.7) { e.state = 'move'; e.cd = rnd(1.0, 2.0); }
  }
}

function aiCaster(e, dt, dir, dist) {
  const d = e.def;
  const p = world.player;
  if (e.state === 'move') {
    e.dir = dir;
    if (dist < 320) e.x -= dir * d.speed * dt;
    else if (dist > 540) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (e.cd <= 0) {
      windup(e, 'flame', 0.65);
      e.tx = p.x;
      const r = 105;
      e.hz = addHazard({ x0: e.tx - r, x1: e.tx + r, delay: 1.0, active: 0.3, dmg: d.dmg, kb: 260, color: '120,255,150', shape: 'ellipse', h: 320, owner: e });
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) { e.state = 'recover'; e.t = 0; e.hz = null; }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= 0.9) { e.state = 'move'; e.cd = rnd(1.8, 2.8); }
  }
}

function aiBoss(e, dt, dir, dist) {
  const d = e.def;
  const endX = (dr) => (dr > 0 ? W - 130 : 130);
  if (e.state === 'move') {
    e.vuln = false;
    e.dir = dir;
    if (dist > 280) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (e.cd <= 0) {
      let pool = [];
      if (dist < 240) pool = ['tail', 'tail', 'fire'];
      else if (dist < 520) pool = ['fire', 'fire', 'tail', 'dive'];
      else pool = ['dive', 'fire'];
      if (e.hp < e.maxHp * 0.6 && e.summoned < 1) { pool = ['summon']; e.summoned = 1; }
      else if (e.hp < e.maxHp * 0.3 && e.summoned < 2) { pool = ['summon']; e.summoned = 2; }
      const a = pool[Math.floor(Math.random() * pool.length)];
      e.atkDir = dir;
      if (a === 'fire') {
        windup(e, 'fire', 1.0);
        e.hz = addHazard({ x0: dir > 0 ? e.x + 40 : e.x - 640, x1: dir > 0 ? e.x + 640 : e.x - 40, delay: 1.0, active: 0.6, dmg: d.dmg + 4, kb: 380, color: '255,140,40', h: 280, owner: e });
      } else if (a === 'tail') {
        windup(e, 'tail', 0.62);
        e.hz = addHazard({ x0: e.x - 215, x1: e.x + 215, delay: 0.62, active: 0.25, dmg: d.dmg - 4, kb: 480, color: '255,70,50', shape: 'ellipse', h: 70, owner: e });
      } else if (a === 'dive') {
        windup(e, 'dive', 0.9);
        e.hz = addHazard({ x0: dir > 0 ? e.x : endX(dir) - halfW(e), x1: dir > 0 ? endX(dir) + halfW(e) : e.x, delay: 0.9, active: 0.5, dmg: d.dmg, kb: 420, color: '255,60,40', h: 210, owner: e });
      } else {
        windup(e, 'summon', 1.1);
      }
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) {
      if (e.atk === 'dive') { e.state = 'dash'; e.t = 0; e.hz = null; }
      else if (e.atk === 'summon') {
        spawnEnemy('imp', -70); spawnEnemy('imp', W + 70);
        burst(e.x, FLOOR - 150, '#c58bff', 24, 260);
        e.state = 'recover'; e.t = 0; e.rdur = 0.9;
      } else { e.state = 'recover'; e.t = 0; e.rdur = e.atk === 'fire' ? 1.2 : 0.8; e.vuln = e.atk !== 'tail'; e.hz = null; if (e.vuln) floatText(e.x, FLOOR - d.h - 20, '破绽!', '#ffe27a', 26); }
    }
  } else if (e.state === 'dash') {
    e.t += dt;
    e.x += e.atkDir * 1250 * dt;
    const stop = e.atkDir > 0 ? e.x >= endX(1) : e.x <= endX(-1);
    if (e.t >= 0.75 || stop) { e.state = 'recover'; e.t = 0; e.rdur = 1.4; e.vuln = true; floatText(e.x, FLOOR - d.h - 20, '破绽!', '#ffe27a', 26); world.shake = 0.25; }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= (e.rdur || 0.8)) { e.state = 'move'; e.cd = rnd(0.6, 1.1); e.vuln = false; }
  }
}

function aiCaptain(e, dt, dir, dist) {
  const d = e.def;
  const vulnText = () => floatText(e.x, FLOOR - d.h - 20, '破绽!', '#ffe27a', 26);
  if (e.state === 'move') {
    e.vuln = false;
    e.dir = dir;
    if (dist > 200) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (e.cd <= 0) {
      e.atkDir = dir;
      if (e.hp < e.maxHp * 0.6 && e.summoned < 1) { e.summoned = 1; windup(e, 'summon', 1.0); return; }
      if (e.hp < e.maxHp * 0.3 && e.summoned < 2) { e.summoned = 2; windup(e, 'summon', 1.0); return; }
      const pool = dist < 260 ? ['chop3', 'chop3', 'slam'] : dist < 520 ? ['chop3', 'charge', 'slam'] : ['charge'];
      const a = pool[Math.floor(Math.random() * pool.length)];
      if (a === 'chop3') {
        e.combo = 0;
        windup(e, 'chop3', 0.55);
        e.hz = addHazard({ x0: dir > 0 ? e.x : e.x - 260, x1: dir > 0 ? e.x + 260 : e.x, delay: 0.55, active: 0.14, dmg: d.dmg, kb: 320, color: '255,70,50', h: 110, owner: e });
      } else if (a === 'slam') {
        windup(e, 'slam', 0.9);
        e.hz = addHazard({ x0: e.x - 260, x1: e.x + 260, delay: 0.9, active: 0.25, dmg: d.dmg - 3, kb: 480, color: '255,120,50', shape: 'ellipse', h: 70, owner: e });
      } else {
        windup(e, 'charge', 0.8);
        const len = 760;
        e.hz = addHazard({ x0: dir > 0 ? e.x : e.x - len, x1: dir > 0 ? e.x + len : e.x, delay: 0.8, active: 0.55, dmg: d.dmg, kb: 420, color: '255,60,40', h: 120, owner: e });
      }
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) {
      if (e.atk === 'charge') { e.state = 'dash'; e.t = 0; e.hz = null; }
      else if (e.atk === 'summon') {
        spawnEnemy('skeleton', -70); spawnEnemy('skeleton', W + 70);
        burst(e.x, FLOOR - 150, '#c58bff', 24, 260);
        e.state = 'recover'; e.t = 0; e.rdur = 0.9;
      } else if (e.atk === 'chop3' && e.combo < 2) {
        e.combo++;
        const dr = sign(world.player.x - e.x);
        e.atkDir = dr; e.dir = dr; e.kbV += dr * 220;
        e.t = 0; e.wdur = 0.5;
        e.hz = addHazard({ x0: dr > 0 ? e.x : e.x - 260, x1: dr > 0 ? e.x + 260 : e.x, delay: 0.5, active: 0.14, dmg: d.dmg, kb: 320, color: '255,70,50', h: 110, owner: e });
      } else { e.state = 'recover'; e.t = 0; e.rdur = e.atk === 'chop3' ? 1.2 : 0.9; e.vuln = true; e.hz = null; vulnText(); }
    }
  } else if (e.state === 'dash') {
    e.t += dt;
    e.x += e.atkDir * 1100 * dt;
    const stop = e.atkDir > 0 ? e.x >= W - 130 : e.x <= 130;
    if (e.t >= 0.6 || stop) { e.state = 'recover'; e.t = 0; e.rdur = 1.3; e.vuln = true; vulnText(); world.shake = 0.2; }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= (e.rdur || 0.8)) { e.state = 'move'; e.cd = rnd(0.5, 1.0); e.vuln = false; }
  }
}

function aiMerchant(e, dt, dir, dist) {
  const d = e.def;
  if (e.state === 'move') {
    e.vuln = false;
    e.dir = dir;
    if (dist > 150) e.x += dir * d.speed * dt;
    e.cd -= dt;
    if (e.cd <= 0 && dist < 320) {
      windup(e, 'swing', 0.9);
      e.hz = addHazard({ x0: e.x - 210, x1: e.x + 210, delay: 0.9, active: 0.2, dmg: d.dmg, kb: 420, color: '255,170,60', shape: 'ellipse', h: 70, owner: e });
    }
  } else if (e.state === 'windup') {
    e.t += dt;
    if (e.t >= e.wdur) { e.state = 'recover'; e.t = 0; e.hz = null; e.vuln = true; floatText(e.x, FLOOR - d.h - 20, '破绽!', '#ffe27a', 26); }
  } else if (e.state === 'recover') {
    e.t += dt;
    if (e.t >= 1.2) { e.state = 'move'; e.vuln = false; e.cd = rnd(0.6, 1.2); }
  }
}

const AI = { grunt: aiGrunt, imp: aiImp, caster: aiCaster, boss: aiBoss, captain: aiCaptain, merchant: aiMerchant };

function clampEnemy(e) {
  const m = e.def.boss ? 130 : 36;
  if (!e.entered && e.x >= m && e.x <= W - m) e.entered = true;
  e.x = e.entered ? clamp(e.x, m, W - m) : clamp(e.x, -140, W + 140);
}

function updateEnemy(e, dt) {
  const p = world.player;
  if (e.dead) {
    e.deadT += dt;
    if (e.y > 0) { e.vz -= E_GRAV * dt; e.y = Math.max(0, e.y + e.vz * dt); }
    return;
  }
  e.flash -= dt;
  if (e.mark > 0) e.mark -= dt;
  if (e.ab > 0) e.ab -= dt;
  if (e.exposed > 0) e.exposed -= dt;
  e.kbV *= Math.pow(0.0006, dt);
  e.x += e.kbV * dt;
  if (e.dots.length) {
    e.dotT += dt;
    if (e.dotT >= 0.5) {
      e.dotT -= 0.5;
      let tot = 0;
      for (const d of e.dots) { tot += d.dps * 0.5; d.t -= 0.5; }
      e.dots = e.dots.filter((d) => d.t > 0);
      damageEnemy(e, tot, { noCrit: true, color: '#7de06a', hitstop: 0, dot: true });
    }
    if (e.dead) return;
  }
  if (e.y > 0 || e.vz > 0) {
    e.vz -= E_GRAV * dt;
    e.y += e.vz * dt;
    if (e.y <= 0) landEnemy(e);
    clampEnemy(e);
    return;
  }
  if (e.stun > 0) { e.stun -= dt; return; }
  const dx = p.x - e.x;
  let slowF = e.def.rage ? 1.3 : 1;
  for (const z of world.slowZones) if (Math.abs(e.x - z.x) < z.r) { slowF *= 0.6; break; }
  AI[e.def.ai](e, dt * slowF, sign(dx), Math.abs(dx));
  clampEnemy(e);
}

function updateProjectiles(dt) {
  const p = world.player;
  for (const pr of world.projs) {
    if (pr.delay > 0) { pr.delay -= dt; continue; }
    pr.life -= dt;
    pr.x += pr.vx * dt;
    if (pr.from === 'p') {
      for (const e of liveEnemies()) {
        if (pr.hit.has(e) || Math.abs(pr.x - e.x) > pr.r + halfW(e)) continue;
        pr.hit.add(e);
        damageEnemy(e, pr.dmg, { kb: pr.kb, heavy: pr.big, hitstop: pr.big ? 0.06 : 0.03, basic: pr.basic, fin: pr.fin });
        if (pr.poison) e.dots.push({ dps: pr.poison.dps, t: pr.poison.t });
        burst(pr.x, pr.y, pr.color, 6, 160);
        if (!pr.pierce) { pr.life = 0; break; }
      }
    }
    if (pr.x < -60 || pr.x > W + 60) pr.life = 0;
  }
  world.projs = world.projs.filter((pr) => pr.life > 0);
}

function updateZones(dt) {
  for (const z of world.zones) {
    z.t += dt;
    z.acc += dt;
    if (z.acc >= 0.5) {
      z.acc -= 0.5;
      for (const e of liveEnemies()) if (Math.abs(e.x - z.x) < z.r + halfW(e) * 0.5) damageEnemy(e, z.dps * 0.5, { noCrit: true, color: '#7de06a', hitstop: 0, dot: true });
    }
    if (Math.random() < dt * 14) world.parts.push({ x: z.x + rnd(-z.r, z.r), y: FLOOR - 4, vx: 0, vy: -rnd(40, 90), life: 0.7, max: 0.7, color: '#7de06a', size: rnd(3, 6) });
  }
  world.zones = world.zones.filter((z) => z.t < z.dur);
}

function updatePlayer(dt) {
  const p = world.player;
  p.inv -= dt;
  p.dodgeInv -= dt;
  p.flash -= dt;
  p.dodgeCd -= dt;
  p.pdWin = Math.max(0, p.pdWin - dt);
  if (p.pdStack > 0) { p.pdStackT -= dt; if (p.pdStackT <= 0) p.pdStack = 0; }
  p.dodgeVis = Math.max(0, p.dodgeVis - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.bashT = Math.max(0, p.bashT - dt);
  p.buffer -= dt;
  p.comboT -= dt;
  if (p.comboT <= 0) p.combo = 0;
  for (let i = 0; i < 4; i++) p.cd[i] = Math.max(0, p.cd[i] - dt);
  p.buffs = p.buffs.filter((b) => {
    b.t -= dt;
    if (b.t <= 0 && b.berserk) { p.weak = b.weak; if (p.mods.ultAfter) p.afterT = 4; floatText(p.x, FLOOR - HERO_H - 50 - p.y, '狂战结束 · 虚弱', '#9aa4b4', 26); }
    return b.t > 0;
  });
  p.weak = Math.max(0, p.weak - dt);
  p.scrollT = Math.max(0, p.scrollT - dt);
  p.twoT = Math.max(0, p.twoT - dt);
  p.afterT = Math.max(0, p.afterT - dt);
  p.subT = Math.max(0, p.subT - dt);
  p.followT = Math.max(0, p.followT - dt);
  p.weakMsg = Math.max(0, p.weakMsg - dt);
  p.ember = Math.max(0, p.ember - dt);
  if (p.wisps > 0 && !p.dead) {
    p.wispT -= dt;
    if (p.wispT <= 0) {
      p.wispT = 1.1;
      for (let i = 0; i < p.wisps; i++) {
        later(i * 0.14, () => {
          const e = liveEnemies().filter((q) => Math.abs(q.x - p.x) < 560).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          if (!e) return;
          const a = world.t * 2.2 + (i / p.wisps) * Math.PI * 2;
          world.beams.push({ x0: p.x + Math.cos(a) * 58, y0: FLOOR - p.y - HERO_H * 0.78 + Math.sin(a) * 18, x1: e.x, y1: FLOOR - e.y - e.def.h * 0.5, life: 0.2, total: 0.2 });
          damageEnemy(e, pAtk(p) * 0.5 * (1 + p.mods.wispDmg), { noCrit: true, dot: true, color: '#9fe8ff' });
          burst(e.x, FLOOR - e.y - e.def.h * 0.5, '#9fe8ff', 4, 120);
        });
      }
    }
  }
  if (p.shieldT > 0) {
    p.shieldT -= dt; p.shieldAge += dt;
    if (p.shieldT <= 0) { if (p.bashSk && !p.dead) { doBash(p, p.bashSk, 1); p.bashSk = null; } p.shield = 0; p.thorns = 0; }
  }
  p.kbV *= Math.pow(0.0006, dt);
  p.landT -= dt;
  if (p.dead) { if (p.y > 0) p.y = Math.max(0, p.y - 900 * dt); return; }
  p.x += p.kbV * dt;
  const mv = (input.act('right') ? 1 : 0) - (input.act('left') ? 1 : 0);
  const spd = pSpd(p) * (1 + (p.mods.moveSpd || 0));

  if (p.y > 0 || p.vz > 0) {
    let g = GRAV;
    if (p.hang > 0) { p.hang -= dt; g *= 0.12; if (p.vz < -80) p.vz = -80; }
    p.vz -= g * dt;
    p.y += p.vz * dt;
    if (p.y <= 0) landPlayer();
  }

  const wantSkill = () => { for (let i = 0; i < 4; i++) if (input.hit('s' + (i + 1)) && p.cd[i] <= 0) return i; return -1; };
  const airAttack = () => { if (input.act('down')) startPlunge(); else startAttack(); };

  if (p.state === 'plunge') {
    p.trail.push({ x: p.x, y: p.y, t: 0.2 });
  } else if (p.state === 'dodge') {
    p.dodgeT -= dt;
    p.x += p.dodgeDir * 900 * dt;
    p.trail.push({ x: p.x, y: p.y, t: 0.25 });
    if (p.dodgeT <= 0) p.state = p.y > 0 ? 'air' : 'idle';
  } else if (p.state === 'attack' || p.state === 'cast') {
    const at = p.at;
    at.t += dt;
    let hold = false;
    if (at.sk && at.sk.type === 'slash' && p.mods.k_charge && !at.done && input.act('s' + (at.si + 1)) && at.charge < 0.6) { at.charge += dt; at.t -= dt; hold = true; }
    const spinMv = at.sk && at.sk.type === 'spin' && p.mods.k_spinCore ? 0.5 : 0;
    if (!hold) p.x += mv * p.speed * spd * (p.y > 0 ? 0.5 : spinMv || 0.25) * dt;
    if (!at.done && at.t >= at.hitAt) { at.done = true; at.fire(); }
    if (at.sk && (at.sk.type === 'spin' || (at.sk.type === 'slash' && at.done))) p.trail.push({ x: p.x, y: p.y, t: 0.18 });
    if (input.hit('attack')) p.buffer = 0.3;
    const sk = wantSkill();
    if (at.done && input.hit('dodge') && p.dodgeCd <= 0 && !(p.y > 0 && p.airDash)) startDodge(mv);
    else if (at.done && input.hit('jump') && p.y <= 0) startJump();
    else if (at.done && p.y > 0 && input.hit('attack') && input.act('down')) startPlunge();
    else if (at.done && sk >= 0) trySkill(sk);
    else if (at.t >= at.dur) {
      p.state = p.y > 0 ? 'air' : 'idle';
      if (p.buffer > 0 || input.act('attack')) { if (p.y > 0) airAttack(); else startAttack(); }
    }
  } else if (p.y > 0) {
    p.state = 'air';
    if (mv) { p.dir = mv; p.x += mv * p.speed * spd * dt; }
    const sk = wantSkill();
    if (input.hit('dodge') && p.dodgeCd <= 0 && !p.airDash) startDodge(mv);
    else if (sk >= 0) trySkill(sk);
    else if (input.hit('attack') || (input.act('attack') && p.airAtk < 3)) airAttack();
  } else {
    if (input.hit('dodge') && p.dodgeCd <= 0) startDodge(mv);
    else if (input.hit('jump')) startJump();
    else {
      const sk = wantSkill();
      if (sk >= 0 && trySkill(sk)) { /* started */ }
      else if (input.hit('attack') || input.act('attack')) startAttack();
      else if (mv) { p.dir = mv; p.state = 'run'; p.x += mv * p.speed * spd * dt; }
      else p.state = 'idle';
    }
  }
  p.trail.forEach((tr) => { tr.t -= dt; });
  p.trail = p.trail.filter((tr) => tr.t > 0);
  p.x = clamp(p.x, 60, W - 60);
}

function nextWave() {
  const WV = curWaves();
  world.wave++;
  world.waveCleared = false;
  if (world.wave >= WV.length) { endBattle(true); return; }
  const w = WV[world.wave];
  w.list.forEach((it, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const o = typeof it === 'string' ? { k: it } : it;
    spawnEnemy(o.k, side > 0 ? W + 90 + i * 70 : -90 - i * 70, o);
  });
  const isBoss = w.name === 'BOSS';
  const bk = isBoss ? (typeof w.list[0] === 'string' ? w.list[0] : w.list[0].k) : null;
  world.banner = { text: w.title || (isBoss ? 'BOSS  ' + ENEMIES[bk].name : `${w.name}`), sub: `${world.wave + 1} / ${WV.length}`, t: 0, dur: 2.2, boss: isBoss };
  if (isBoss) world.bossSeen = true;
}

function endBattle(win) {
  world.endHpPct = world.player.hp / world.player.maxHp;
  world.state = win ? 'win' : 'lose';
  world.endT = 0;
}

function updateWorld(dt) {
  if (world.hitstop > 0) { world.hitstop -= dt; return; }
  let sdt = dt;
  if (world.slow > 0) { world.slow -= dt; sdt = dt * 0.4; }
  world.t += sdt;
  if (world.state === 'play') world.time += sdt;
  else world.endT += dt;
  world.shake = Math.max(0, world.shake - dt);
  world.hint = Math.max(0, world.hint - dt);
  world.chainPop = Math.max(0, world.chainPop - dt * 5);
  if (world.chainT > 0) { world.chainT -= sdt; if (world.chainT <= 0) world.chain = 0; }
  world.timers = world.timers.filter((tm) => { tm.t -= sdt; if (tm.t <= 0) { tm.fn(); return false; } return true; });
  if (world.banner) { world.banner.t += dt; if (world.banner.t > world.banner.dur) world.banner = null; }

  updatePlayer(sdt);
  for (const e of world.enemies) updateEnemy(e, sdt);
  for (let i = 0; i < world.enemies.length; i++) {
    for (let j = i + 1; j < world.enemies.length; j++) {
      const a = world.enemies[i], b = world.enemies[j];
      if (a.dead || b.dead || a.def.boss || b.def.boss) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) < 64) { const push = (64 - Math.abs(dx)) * 0.5; a.x -= sign(dx) * push * sdt * 6; b.x += sign(dx) * push * sdt * 6; }
    }
  }
  updateHazards(sdt);
  updateProjectiles(sdt);
  updateZones(sdt);
  updateClones(sdt);
  updatePets(sdt);
  for (const z of world.slowZones) z.t += sdt;
  world.slowZones = world.slowZones.filter((z) => z.t < z.dur);
  world.enemies = world.enemies.filter((e) => !e.dead || e.deadT < 1.0);

  if (world.state === 'play') {
    if (!world.waveCleared && liveEnemies().length === 0 && world.wave >= 0) { world.waveCleared = true; world.waveDelay = world.wave === curWaves().length - 1 ? 2.4 : 1.4; }
    if (world.waveCleared) { world.waveDelay -= sdt; if (world.waveDelay <= 0) nextWave(); }
  }

  for (const f of world.floats) { f.life -= sdt * 0.9; f.y -= 46 * sdt; }
  world.floats = world.floats.filter((f) => f.life > 0);
  for (const pt of world.parts) { pt.life -= sdt; pt.x += pt.vx * sdt; pt.y += pt.vy * sdt; pt.vy += 520 * sdt; }
  world.parts = world.parts.filter((pt) => pt.life > 0);
  for (const r of world.rings) r.life -= sdt;
  world.rings = world.rings.filter((r) => r.life > 0);
  for (const s of world.slashes) s.life -= sdt;
  world.slashes = world.slashes.filter((s) => s.life > 0);
  for (const b of world.bolts) b.life -= sdt;
  world.bolts = world.bolts.filter((b) => b.life > 0);
  for (const b of world.beams) b.life -= sdt;
  world.beams = world.beams.filter((b) => b.life > 0);
}

/* ---------------- drawing ---------------- */

const tileCache = {};
function getTile(path, h) {
  const key = path + '@' + h;
  if (tileCache[key]) return tileCache[key];
  const im = img(path);
  if (!ready(im)) return null;
  const sw = Math.round(im.naturalWidth * h / im.naturalHeight);
  const c = document.createElement('canvas');
  c.width = sw * 2; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, sw, h);
  g.translate(sw * 2, 0); g.scale(-1, 1);
  g.drawImage(im, 0, 0, sw, h);
  tileCache[key] = { c, w: sw * 2 };
  return tileCache[key];
}
function drawLayer(path, h, y, off) {
  const t = getTile(path, h);
  if (!t) return;
  let x = -(((off % t.w) + t.w) % t.w);
  for (; x < W; x += t.w) ctx.drawImage(t.c, Math.round(x), y);
}

function drawBackground() {
  const px = world.player ? world.player.x - W / 2 : 0;
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, W, H);
  drawLayer('v2/bg/dungeon_far.png', H, 0, 300 + px * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, W, H);
  drawLayer('v2/bg/dungeon_mid.png', 330, FLOOR - 330 + 22, 600 + px * 0.12);
  drawLayer('v2/bg/dungeon_ground.png', 126, FLOOR - 24, 0);
  const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawShadow(x, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(x, FLOOR + 6, w, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHazards() {
  for (const h of world.hazards) {
    const active = h.t >= h.delay;
    const prog = clamp(h.t / h.delay, 0, 1);
    const w = h.x1 - h.x0;
    const a = active ? 0.65 : 0.14 + 0.32 * prog;
    ctx.fillStyle = `rgba(${h.color},${a})`;
    ctx.strokeStyle = `rgba(${h.color},${active ? 0.95 : 0.55 + 0.3 * Math.sin(world.t * 20)})`;
    ctx.lineWidth = 3;
    const cy = FLOOR + 2;
    if ((h.h || 60) >= 200) {
      const cx0 = h.x0, cw = w;
      const gr = ctx.createLinearGradient(0, cy - h.h, 0, cy);
      gr.addColorStop(0, `rgba(${h.color},0)`);
      gr.addColorStop(1, `rgba(${h.color},${active ? 0.4 : 0.06 + 0.16 * prog})`);
      ctx.fillStyle = gr;
      ctx.fillRect(cx0, cy - h.h, cw, h.h);
      ctx.fillStyle = `rgba(${h.color},${a})`;
    }
    if (h.shape === 'ellipse') {
      ctx.beginPath(); ctx.ellipse((h.x0 + h.x1) / 2, cy, w / 2, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!active) { ctx.fillStyle = `rgba(${h.color},0.35)`; ctx.beginPath(); ctx.ellipse((h.x0 + h.x1) / 2, cy, (w / 2) * prog, 26 * prog, 0, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillRect(h.x0, cy - 24, w, 48);
      ctx.strokeRect(h.x0, cy - 24, w, 48);
      if (!active) { ctx.fillStyle = `rgba(${h.color},0.35)`; const dir = h.owner && h.owner.atkDir < 0 ? -1 : 1; ctx.fillRect(dir > 0 ? h.x0 : h.x1 - w * prog, cy - 24, w * prog, 48); }
    }
    if (active && h.owner && h.owner.def && h.owner.def.boss) { burst(h.x0 + rnd(0, w), FLOOR - 20, '#ffb347', 1, 80); }
  }
}

function drawEnemy(e) {
  const d = e.def;
  const p = world.player;
  const toward = sign(p.x - e.x);
  const dirv = e.state === 'windup' || e.state === 'dash' || e.state === 'recover' ? e.atkDir : toward;
  const flip = d.art === 'R' ? dirv < 0 : d.art === 'L' ? dirv > 0 : dirv < 0;
  const k = d.boss ? 0.45 : 1;
  let rot = 0, sy = 1, sx = 1, yoff = -e.y;
  if (e.dead) {
    const t = clamp(e.deadT / 0.4, 0, 1);
    rot = dirv * -1 * t * 1.3 * k;
    drawShadow(e.x, d.h * 0.2);
    drawSprite(d.img, e.x, FLOOR - 4 - e.y, d.h, flip, clamp(1 - e.deadT / 1.0, 0, 1), false, rot);
    return;
  }
  if (e.y > 0) {
    rot = -sign(p.x - e.x) * (e.vz > 0 ? 0.35 : 0.6);
  } else if (e.state === 'windup') {
    const pr = clamp(e.t / e.wdur, 0, 1);
    rot = -0.24 * dirv * pr * k; sy = 1 - 0.07 * pr; sx = 1 + 0.04 * pr;
    if (Math.floor(world.t * 18) % 2 === 0) yoff = -2;
  } else if (e.state === 'dash') {
    rot = 0.3 * e.atkDir * k;
  } else if (e.state === 'recover') {
    const pr = clamp(e.t / 0.45, 0, 1);
    rot = lerp(0.3 * e.atkDir, 0, pr) * k;
  } else {
    yoff = -Math.abs(Math.sin(e.phase + world.t * (e.def.speed / 14))) * (d.boss ? 4 : 9) * (e.stun > 0 ? 0 : 1);
  }
  drawShadow(e.x, d.h * 0.22 * (1 - Math.min(e.y / 500, 0.5)));
  const flash = e.flash > 0 || (e.state === 'windup' && Math.floor(world.t * 14) % 2 === 0);
  drawSprite(d.img, e.x, FLOOR - 4 + yoff, d.h, flip, 1, e.flash > 0, rot, sx, sy);
  if (flash && e.flash <= 0) {
    ctx.save(); ctx.globalAlpha = 0.18; ctx.globalCompositeOperation = 'lighter';
    drawSprite(d.img, e.x, FLOOR - 4 + yoff, d.h, flip, 1, false, rot, sx, sy);
    ctx.restore();
  }
  if (!d.boss) {
    const w = 78, y = FLOOR - d.h - 14 - e.y;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(e.x - w / 2, y, w, 8);
    ctx.fillStyle = d.elite ? '#ffb347' : '#e04848'; ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 8);
    if (d.elite) drawText('精英', e.x, y - 6, 16, '#ffb347', 'center');
  }
  if (d.elite) {
    ctx.save(); ctx.globalAlpha = 0.2 + 0.1 * Math.sin(world.t * 6); ctx.globalCompositeOperation = 'lighter';
    drawSprite(d.img, e.x, FLOOR - 4 + yoff, d.h, flip, 1, false, rot, sx * 1.04, sy * 1.04);
    ctx.restore();
  }
  if (e.mark > 0) drawText('破', e.x, FLOOR - d.h * 0.5 - e.y, 20, '#ff6a6a', 'center');
  if (e.dots.length) { ctx.fillStyle = 'rgba(110,224,90,.25)'; ctx.beginPath(); ctx.ellipse(e.x, FLOOR - d.h * 0.45 - e.y, d.h * 0.28, d.h * 0.45, 0, 0, Math.PI * 2); ctx.fill(); }
  if (e.stun > 0 && e.y <= 0) drawText('晕', e.x, FLOOR - d.h - 20, 22, '#ffe27a');
}

const easeOutQ = (k) => 1 - (1 - k) * (1 - k);
const easeOutC = (k) => 1 - Math.pow(1 - k, 3);
const easeInQ = (k) => k * k;

/* 攻击帧按「预备慢 → 挥砍极快 → 收招缓」重排，保证播到 hit 帧的时刻正好是判定时刻 */
function attackFrames(t, dur, hitAt, n, hitF) {
  const hit = clamp(hitF, 1, n - 1);
  const wind = hitAt * 0.62;
  if (t < wind) return easeOutQ(clamp(t / Math.max(0.01, wind), 0, 1)) * Math.max(0, hit - 2);
  if (t < hitAt) return lerp(hit - 2, hit + 1, easeInQ(clamp((t - wind) / Math.max(0.01, hitAt - wind), 0, 1)));
  return lerp(hit + 1, n - 1, easeOutQ(clamp((t - hitAt) / Math.max(0.01, dur - hitAt), 0, 1)));
}

function playerPose(p) {
  const o = { clip: 'attack', frame: 0, rot: 0, sx: 1, sy: 1, dx: 0, kf: null, bob: 0 };
  const A = (name) => ANIMS[`${p.key}_${name}`];
  const atk = ANIMS[p.key + '_attack'];
  const walk = ANIMS[p.key + '_walk'];
  const n = atk ? atk.n : 1;
  const hitF = atk && atk.hit != null ? atk.hit : Math.floor(n * 0.6);
  const dir = p.dir;
  const kfa = (a, b, k) => ({ a, b, k: clamp(k, 0, 1) });
  if (p.state === 'attack' && p.at) {
    const hitAt = p.at.hitAt != null ? p.at.hitAt : p.at.dur * 0.55;
    const pre = clamp(p.at.t / Math.max(0.01, hitAt), 0, 1);
    const post = clamp((p.at.t - hitAt) / Math.max(0.01, p.at.dur - hitAt), 0, 1);
    const sw = p.at.t < hitAt ? -0.3 * easeOutQ(pre) : 1 - easeOutC(post);
    o.frame = attackFrames(p.at.t, p.at.dur, hitAt, n, hitF);
    const cc = !p.at.air && ANIMS[`${p.key}_combo${p.at.combo + 1}`];
    if (cc) {
      // 有逐帧素材时只按判定时刻对齐播放，不再叠加代码旋转，否则会和真实动作打架
      o.clip = `combo${p.at.combo + 1}`;
      o.frame = attackFrames(p.at.t, p.at.dur, hitAt, cc.n, cc.hit != null ? cc.hit : Math.floor(cc.n * 0.5));
    } else if (p.at.air) o.rot = (p.at.combo === 2 ? 0.32 : 0.12) * dir * (p.at.t < hitAt ? easeOutQ(pre) : 1 - 0.25 * post);
    else if (p.at.combo === 1) o.dx = dir * 20 * sw;
    else if (p.at.combo === 2) { o.rot = -0.18 * dir * sw; o.sy = 1 + 0.08 * (1 - Math.abs(sw)); }
    if (p.at.t >= hitAt && p.at.t < hitAt + 0.06) { o.sx = 1.07; o.sy = 0.94; }
  } else if (p.state === 'cast' && p.at) {
    const t = p.at.t, pr = clamp(t / p.at.dur, 0, 0.999), T = p.at.sk.type;
    const hitAt = p.at.hitAt != null ? p.at.hitAt : p.at.dur * 0.5;
    o.frame = attackFrames(t, p.at.dur, hitAt, n, hitF);
    const CLIP = { slash: 'heavy', spin: 'spin', shield: 'guard', warcry: 'berserk' }[T];
    const cm = CLIP && A(CLIP);
    if (cm) {
      o.clip = CLIP;
      if (T === 'slash') o.frame = attackFrames(t, p.at.dur, hitAt, cm.n, cm.hit != null ? cm.hit : Math.floor(cm.n * 0.6));
      else if (T === 'spin') o.frame = (t / 0.5) * cm.n % cm.n;
      else o.frame = pr * (cm.n - 1);
    } else if (p.key === 'knight' && T === 'slash') {
      const k = clamp((t - hitAt) / Math.max(0.01, p.at.dur - hitAt), 0, 1);
      if (t < hitAt * 0.7) {
        const a = easeOutQ(t / Math.max(0.01, hitAt * 0.7));
        o.kf = kfa(0, 0, 0); o.dx = -dir * 12 * a; o.sy = 1 - 0.05 * a;
      } else if (t < hitAt) {
        const a = easeInQ((t - hitAt * 0.7) / Math.max(0.01, hitAt * 0.3));
        o.kf = kfa(0, 2, a); o.dx = -dir * 12 + dir * 40 * a;
      } else if (t < hitAt + 0.12) {
        o.kf = kfa(2, 2, 0); o.dx = dir * 28; o.rot = 0.05 * dir;
      } else {
        o.kf = kfa(2, 1, easeOutQ(k));
        o.dx = dir * 28 * (1 - k * 0.55); o.rot = 0.05 * dir * (1 - k);
      }
    } else if (p.key === 'knight' && T === 'warcry') {
      o.kf = pr < 0.3 ? kfa(2, 2, 0) : pr < 0.5 ? kfa(2, 1, (pr - 0.3) / 0.2) : kfa(1, 3, easeOutQ(clamp((pr - 0.5) / 0.35, 0, 1)));
      o.sy = 1 + 0.03 * Math.sin(pr * 20);
    } else if (T === 'slash') {
      if (t < hitAt) { const k = easeInQ(t / hitAt); o.sy = 1 - 0.15 * k; o.sx = 1 + 0.1 * k; o.rot = -0.16 * dir * k; }
      else { const k = clamp((t - hitAt) / Math.max(0.01, p.at.dur - hitAt), 0, 1); o.rot = 0.18 * dir * (1 - easeOutQ(k)); }
    } else if (T === 'spin') { o.sx = Math.cos(t * 30); o.frame = 5 + ((t * 24) % 7); }
    else if (T === 'warcry') { const s = Math.sin(pr * Math.PI); o.sx = o.sy = 1 + 0.13 * s; o.rot = -0.14 * dir * s; o.frame = 8; }
    else if (T === 'shield') { o.sy = 0.92; o.sx = 1.04; o.frame = 3; if (p.key === 'knight') o.kf = kfa(1, 1, 0); }
  } else if (p.state === 'plunge') {
    const c3 = A('combo3');
    if (c3) { o.clip = 'combo3'; o.frame = c3.hit != null ? c3.hit : c3.n - 1; }
    else { o.frame = hitF; o.rot = 0.42 * dir; o.sy = 1.12; }
  } else if (p.bashT > 0 && A('bash')) {
    o.clip = 'bash'; o.frame = (1 - p.bashT / BASH_VIS) * (A('bash').n - 1);
  } else if ((p.state === 'dodge' || p.dodgeVis > 0) && A('dodge') && p.y <= 0) {
    // 判定只有 0.2s，表现拉长到 DODGE_VIS，否则翻滚被压成两三帧
    o.clip = 'dodge'; o.frame = (1 - p.dodgeVis / DODGE_VIS) * (A('dodge').n - 1);
  } else if (p.state === 'dodge') {
    const f = world.t * (walk ? walk.fps : 10) * 1.7;
    o.clip = 'walk'; o.frame = f; o.rot = 0.22 * p.dodgeDir; o.bob = -2;
  } else if (p.y > 0 && A('jump')) {
    const jm = A('jump'), apex = jm.hit != null ? jm.hit : Math.floor(jm.n / 2);
    o.clip = 'jump';
    o.frame = p.vz > 0 ? (1 - p.vz / JUMP_V) * apex : apex + clamp(-p.vz / JUMP_V, 0, 1) * (jm.n - 1 - apex);
  } else if (p.y > 0) {
    o.clip = 'walk'; o.frame = 2; o.rot = (p.vz > 0 ? -0.1 : 0.14) * dir;
  } else if (p.hurtT > 0 && A('hurt')) {
    o.clip = 'hurt'; o.frame = (1 - p.hurtT / HURT_VIS) * (A('hurt').n - 1);
  } else if (p.state === 'run') {
    const f = world.t * (walk ? walk.fps : 10) * 1.5;
    o.clip = 'walk'; o.frame = f;
    o.rot = 0.06 * dir + Math.sin(f * Math.PI / 3) * 0.012;
    o.bob = Math.abs(Math.sin(f * Math.PI / 3)) * 3;
  } else if (A('idle')) {
    o.clip = 'idle'; o.frame = world.t * A('idle').fps;
  } else {
    o.sy = 1 + Math.sin(world.t * 3) * 0.012;
    o.bob = Math.sin(world.t * 3) * 1.5;
  }
  if (p.landT > 0) { const k = p.landT / 0.14; o.sy *= 1 - 0.14 * Math.min(k, 1.4); o.sx *= 1 + 0.08 * Math.min(k, 1.4); }
  return o;
}

function drawPlayer() {
  const p = world.player;
  const flip = p.dir < 0;
  const key = p.key;
  const footY = FLOOR - p.y;
  for (const tr of p.trail) {
    if (Math.random() < 0.5) continue;
    ctx.save(); ctx.globalAlpha = clamp(tr.t / 0.25, 0, 1) * 0.22; ctx.globalCompositeOperation = 'lighter';
    drawSprite(`v2/heroes/${key}.png`, tr.x, FLOOR - (tr.y || 0), HERO_H, flip);
    ctx.restore();
  }
  if (p.dead) {
    drawShadow(p.x, 60);
    drawSprite(`v2/heroes/${key}.png`, p.x, footY, HERO_H, flip, 0.7, false, -p.dir * 1.45);
    return;
  }
  drawShadow(p.x, 62 * (1 - Math.min(p.y / 500, 0.5)));
  if (p.shield > 0) {
    ctx.fillStyle = 'rgba(122,184,255,.16)'; ctx.strokeStyle = 'rgba(122,184,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.x, footY - HERO_H * 0.5, 70, HERO_H * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  let alpha = 1;
  if (p.inv > 0 && Math.floor(world.t * 22) % 2 === 0) alpha = 0.4;
  if (p.state === 'dodge') alpha = 0.5;
  const flash = p.flash > 0;
  const o = playerPose(p);
  const fy = footY - (o.bob || 0);
  const bz = isBerserk(p);
  if (bz) {
    const g = ctx.createRadialGradient(p.x, footY - HERO_H * 0.5, 10, p.x, footY - HERO_H * 0.5, 150);
    g.addColorStop(0, 'rgba(255,40,20,.32)'); g.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 160, footY - HERO_H - 60, 320, HERO_H + 80);
    if (Math.random() < 0.5) world.parts.push({ x: p.x + rnd(-30, 30), y: footY - rnd(20, HERO_H), vx: rnd(-20, 20), vy: -rnd(60, 140), life: 0.5, max: 0.5, color: '#ff3a2a', size: rnd(3, 6) });
  }
  ctx.save();
  if (bz && !flash) ctx.filter = 'url(#berserk)';
  let drew = false;
  if (o.kf != null) {
    if (typeof o.kf === 'object') {
      const f = o.kf;
      if (f.b != null && f.b !== f.a && f.k > 0.02) {
        drawKF(`anim/knight_kf_${f.a}.png`, p.x + o.dx, fy, flip, alpha * (1 - f.k), flash, o.rot, o.sx, o.sy);
        drew = drawKF(`anim/knight_kf_${f.b}.png`, p.x + o.dx, fy, flip, alpha * f.k, flash, o.rot, o.sx, o.sy);
      } else {
        drew = drawKF(`anim/knight_kf_${f.a}.png`, p.x + o.dx, fy, flip, alpha, flash, o.rot, o.sx, o.sy);
      }
    } else {
      drew = drawKF(`anim/knight_kf_${o.kf}.png`, p.x + o.dx, fy, flip, alpha, flash, o.rot, o.sx, o.sy);
    }
  }
  if (!drew) {
    const done = drawClip(key + '_' + o.clip, o.frame, p.x + o.dx, fy, HERO_H, flip, alpha, flash, o.rot, o.sx, o.sy);
    if (!done) drawSprite(`v2/heroes/${key}.png`, p.x, fy, HERO_H, flip, alpha, flash, o.rot, o.sx, o.sy);
  }
  ctx.restore();
  for (let i = 0; i < p.wisps; i++) {
    const a = world.t * 2.2 + (i / p.wisps) * Math.PI * 2;
    const wx = p.x + Math.cos(a) * 58, wy = footY - HERO_H * 0.78 + Math.sin(a) * 18;
    const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, 16);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#9fe8ff'); g.addColorStop(1, 'rgba(159,232,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2); ctx.fill();
  }
  if (p.buffs.some((b) => b.atk)) { ctx.fillStyle = 'rgba(255,190,100,.45)'; for (let i = 0; i < 4; i++) { const t = (world.t * 1.5 + i / 4) % 1; ctx.fillRect(p.x - 40 + i * 25, footY - 10 - t * 150, 4, 4); } }
  if (p.counter > 0) for (let i = 0; i < p.counter; i++) { ctx.fillStyle = '#7ab8ff'; ctx.beginPath(); ctx.arc(p.x - (p.counter - 1) * 12 + i * 24, footY - HERO_H - 8, 7, 0, Math.PI * 2); ctx.fill(); }
}

function drawClonesPets() {
  const p = world.player;
  for (const c of world.clones) {
    const a = clamp(Math.min(c.t / 0.2, (c.life - c.t) / 0.4, 1), 0, 1) * 0.55;
    ctx.save();
    ctx.filter = 'hue-rotate(150deg) brightness(1.5) saturate(1.6)';
    drawSprite(`v2/heroes/${p.key}.png`, c.x, FLOOR, HERO_H, c.dir < 0, a + (c.flash > 0 ? 0.3 : 0));
    ctx.restore();
  }
  for (const pet of world.pets) {
    const lx = pet.lunge > 0 ? pet.dir * 50 * Math.sin(pet.lunge * Math.PI) : 0;
    const flip = pet.dir < 0;
    if (pet.kind === 'wolf') {
      const t = p.mods.petTier || 0;
      const bob = Math.abs(Math.sin(world.t * 6)) * 4;
      drawShadow(pet.x, 30);
      if (t >= 1) { ctx.save(); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(world.t * 5); ctx.fillStyle = t >= 2 ? '#e6f0ff' : '#b8ffc8'; ctx.beginPath(); ctx.ellipse(pet.x + lx, FLOOR - 34, 54, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      drawSprite('pets/wolf.png', pet.x + lx, FLOOR - 2 - bob, 66 + t * 8, flip, 1, false, 0, 1, pet.lunge > 0 ? 1.12 : 1);
    } else if (pet.kind === 'raven') {
      const hy = 130 + Math.sin(world.t * 3) * 10;
      drawShadow(pet.x, 20);
      drawSprite('pets/raven.png', pet.x, FLOOR - hy, 62, flip || p.dir < 0, 1, false, Math.sin(world.t * 6) * 0.06);
    } else if (pet.alive) {
      const bob = Math.abs(Math.sin(world.t * 4)) * 3;
      drawShadow(pet.x, 34);
      drawSprite('pets/stone.png', pet.x, FLOOR - 2 - bob, 84, flip);
      const f = clamp(pet.hp / pet.maxHp, 0, 1);
      ctx.fillStyle = UI.c.ink; ctx.fillRect(pet.x - 32, FLOOR - 104, 64, 10);
      ctx.fillStyle = '#9fe8d0'; ctx.fillRect(pet.x - 30, FLOOR - 102, Math.round(60 * f), 6);
    } else {
      ctx.fillStyle = 'rgba(120,130,140,.5)'; ctx.beginPath(); ctx.ellipse(pet.x, FLOOR - 6, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
      drawText(`${Math.ceil(pet.respawn)}`, pet.x, FLOOR - 20, 24, '#9fe8d0', 'center');
    }
  }
}

function drawFx() {
  for (const z of world.slowZones) {
    const a = clamp(Math.min(1, (z.dur - z.t) / 0.6), 0, 1) * 0.3;
    ctx.fillStyle = `rgba(190,140,90,${a})`;
    ctx.beginPath(); ctx.ellipse(z.x, FLOOR + 2, z.r, 22, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const z of world.zones) {
    const a = clamp(Math.min(1, (z.dur - z.t) / 0.6), 0, 1) * 0.28;
    ctx.fillStyle = `rgba(110,224,90,${a})`;
    ctx.beginPath(); ctx.ellipse(z.x, FLOOR + 2, z.r, 24, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of world.bolts) {
    const a = clamp(b.life / b.total, 0, 1);
    const g = ctx.createLinearGradient(b.x, 0, b.x, FLOOR);
    g.addColorStop(0, `rgba(255,248,200,${a})`); g.addColorStop(1, `rgba(255,220,100,${a})`);
    ctx.fillStyle = g; ctx.fillRect(b.x - 18 * a, 0, 36 * a, FLOOR);
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(b.x - 6 * a, 0, 12 * a, FLOOR);
  }
  for (const b of world.beams) {
    ctx.globalAlpha = clamp(b.life / b.total, 0, 1);
    ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const pr of world.projs) {
    if (pr.delay > 0) continue;
    if (pr.kind === 'bolt') {
      ctx.strokeStyle = pr.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pr.x - sign(pr.vx) * 36, pr.y); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      const r = (pr.big ? 30 : 20);
      const g = ctx.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, r * 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, pr.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.x, pr.y, r * 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const r of world.rings) {
    const pr = 1 - r.life / r.total;
    ctx.strokeStyle = r.color; ctx.lineWidth = 5;
    ctx.globalAlpha = r.grow ? 0.85 : clamp(r.life / r.total, 0, 1) * 0.9;
    const rad = r.grow ? r.max : r.max * pr;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    if (r.grow) { ctx.globalAlpha = 0.25; ctx.fillStyle = r.color; ctx.beginPath(); ctx.ellipse(r.x, r.y, rad * pr, rad * 0.28 * pr, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  for (const s of world.slashes) {
    const pr = 1 - s.life / s.total;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.dir < 0) ctx.scale(-1, 1);
    if (s.ang) ctx.rotate(s.ang);
    ctx.globalAlpha = clamp(1 - pr, 0, 1);
    ctx.strokeStyle = s.color; ctx.lineWidth = 16 * s.size * (1 - pr * 0.6); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-40 * s.size, 0, 120 * s.size, -0.9 + pr * 0.5, 0.9 + pr * 0.5); ctx.stroke();
    ctx.restore();
  }
  for (const pt of world.parts) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  for (const f of world.floats) {
    ctx.globalAlpha = clamp(f.life * 1.4, 0, 1);
    drawText(f.txt, f.x, f.y, f.size, f.color, 'center');
  }
  ctx.globalAlpha = 1;
}

function drawWorld() {
  ctx.save();
  if (world.shake > 0) ctx.translate(rnd(-1, 1) * world.shake * 26, rnd(-1, 1) * world.shake * 16);
  drawBackground();
  drawHazards();
  const es = world.enemies.slice().sort((a, b) => (a.def.boss ? -1 : 0) - (b.def.boss ? -1 : 0));
  for (const e of es) drawEnemy(e);
  drawClonesPets();
  drawPlayer();
  drawFx();
  ctx.restore();
}
