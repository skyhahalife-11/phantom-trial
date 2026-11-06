# kit=b 新技能组：I 葬轮（跳起斜向旋转下砍）/ O 虚化（短位移，完美虚化→破绽+强化普攻）/ 空格 替身（2 次，墓碑挡刀后跳）
import io
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:80])
    s = s.replace(old, new)

# ---- 常量 ----
rep("const SOUL_MAX = 5, SOUL_HIT = 0.125, LINK_T = 6;",
"""const SOUL_MAX = 5, SOUL_HIT = 0.125, LINK_T = 6;
/* kit=b：刺客技能组（试验中）。I 葬轮：小跳后斜着往前下方旋转，沿途连砍，落地重砸；O 虚化：短位移穿身，
   敌人出手瞬间虚化 = 完美虚化（时空断裂 + 下一刀破绽斩）；空格 替身：2 次，原地留墓碑、人往后跳，受击后马上用可挡回一半伤害 */
const KIT_B = params.get('kit') === 'b';
const KB = {
  run: 175,
  wheel: { rise: 0.16, riseVy: -420, riseVx: 120, vx: 420, vy: 210, maxT: 0.6, tick: 0.08, dmg: 6, slam: 16, slamR: 64, stun: 0.6, cd: 4.5 },
  phase: { t: 0.28, v: 380, inv: 0.32, cd: 6, perfCd: 1.2, eye: 2.5, mul: 3 },
  sub: { n: 2, cd: 8, t: 0.3, vx: 240, vy: -260, inv: 0.45, refundT: 0.35, refund: 0.5 },
};""")

# ---- 玩家初始字段 ----
rep("lastSk: '', lastSkT: -9, ultAfterT: 0, streak: 0, chargeT: -9, stunHits: 0 });",
    "lastSk: '', lastSkT: -9, ultAfterT: 0, streak: 0, chargeT: -9, stunHits: 0, subN: KB.sub.n, subT: 0, hurtAt: -9, lastDmg: 0, phaseEye: 0, wheelHit: null });")

# ---- 状态分组 ----
rep("const LOCK = ['hurt', 'dash', 'thrust', 'throw', 'blink', 'iai', 'storm', 'sheathe', 'transform',",
    "const LOCK = ['hurt', 'dash', 'thrust', 'throw', 'blink', 'iai', 'storm', 'sheathe', 'transform', 'wheel', 'phase', 'sub',")
rep("if (!['dash', 'thrust', 'blink', 'rdash'].includes(p.st)) p.vy = Math.min(P_MAXFALL, p.vy + P_GRAV * dt);",
    "if (!['dash', 'thrust', 'blink', 'rdash', 'phase'].includes(p.st) && !(p.st === 'wheel')) p.vy = Math.min(P_MAXFALL, p.vy + P_GRAV * dt);")

# ---- 计时 ----
rep("  if (p.pdT <= 0) p.pdStacks = 0;\n",
"""  if (p.pdT <= 0) p.pdStacks = 0;
  if (KIT_B) {   // 替身逐次回复；破绽斩窗口
    p.phaseEye -= dt;
    if (p.subN < KB.sub.n && (p.subT -= dt) <= 0) { p.subN++; p.subT = KB.sub.cd; }
  }
""")

# ---- 空格：替身 ----
rep("  if (want(p, 'dodge') && p.dashCd <= 0 && !mv('noDodge')) {",
"""  if (KIT_B && !blood && want(p, 'dodge')) {
    use(p, 'dodge');
    if (p.subN > 0 && (FREE.includes(p.st) || p.st === 'hurt' || p.st === 'phase')) startSub(p, dir);
    else if (p.subN <= 0) say('替身用完了', '#ff8a8a');
  } else if (want(p, 'dodge') && p.dashCd <= 0 && !mv('noDodge')) {""")

# ---- 跑速 ----
rep("const tv = dir * P_RUN * (blood ? RAGE.run : 1) * (1 + (R.M ? R.M.spd : 0));",
    "const tv = dir * (KIT_B ? KB.run : P_RUN) * (blood ? RAGE.run : 1) * (1 + (R.M ? R.M.spd : 0));")

# ---- 状态机 ----
rep("""    case 'storm':
      updateStorm(p, dt);
      break;""",
"""    case 'storm':
      updateStorm(p, dt);
      break;
    case 'wheel':
      updateWheel(p, dt);
      break;
    case 'phase':
      p.vy = 0;
      if (p.t < 0.12) checkPerfect(p);   // 起手这一小段里攻击打来都算完美虚化
      if (Math.floor(p.t / 0.04) !== Math.floor((p.t - dt) / 0.04)) afterImage(p);
      if (p.t >= KB.phase.t) { p.vx = p.face * KB.run * 0.6; setSt(p, p.ground ? 'idle' : 'fall'); }
      break;
    case 'sub':
      if (p.t >= KB.sub.t) setSt(p, p.ground ? 'idle' : 'fall');
      break;""")

# ---- 技能：U 不变；I 葬轮；O 虚化 ----
rep("""      checkPerfect(p);
    } else if (want(p, 's2') && R.blade) {   // I 再按：瞬身到剑的位置""",
"""      if (!KIT_B) checkPerfect(p);
    } else if (KIT_B && ready('s2', 'i')) {   // kit=b I 葬轮
      use(p, 's2'); noteCast(p, 'i'); if (dir) p.face = dir;
      p.cd.i = KB.wheel.cd; startWheel(p);
    } else if (KIT_B && want(p, 's3') && R.witch > 0 && p.st !== 'phase') {   // kit=b 时空断裂中 O = 瞬狱（不看冷却）
      use(p, 's3'); noteCast(p, 'o'); if (dir) p.face = dir;
      if (startStorm(p)) { setCd(p, 'o'); return; }
    } else if (KIT_B && ready('s3', 'o')) {   // kit=b O 虚化
      use(p, 's3'); noteCast(p, 'o'); if (dir) p.face = dir;
      p.cd.o = KB.phase.cd; startPhase(p);
    } else if (want(p, 's2') && R.blade) {   // I 再按：瞬身到剑的位置""")
rep("  if (FREE.includes(p.st) || p.st === 'throw' || (blood && p.st === 'rdash')) castSkills(p, dir, blood);",
    "  if (FREE.includes(p.st) || p.st === 'throw' || (blood && p.st === 'rdash') || (KIT_B && !blood && p.st === 'phase' && p.t > 0.1)) castSkills(p, dir, blood);")

# ---- 新技能实现（放在 throwBlade 前）----
rep("// I 掷碑：墓碑巨剑像回旋镖一样飞出、悬停、飞回；",
r"""/* ---------- kit=b 刺客技能 ---------- */
function startWheel(p) {
  setSt(p, 'wheel'); p.wheelHit = new Map(); p.wheel = { sub: p.ground ? 0 : 1, tick: 0, spin: 0 };
  if (p.ground) { p.vy = KB.wheel.riseVy; p.vx = p.face * KB.wheel.riseVx; p.ground = false; }
  else { p.vx = p.face * KB.wheel.vx; p.vy = KB.wheel.vy; }
  snd('thrust', { rate: 0.8 });
}
function updateWheel(p, dt) {
  const w = p.wheel, W2 = KB.wheel;
  w.spin += dt * 26;
  if (w.sub === 0) {   // 起跳
    p.vy = W2.riseVy * (1 - p.t / W2.rise);
    if (p.t >= W2.rise) { w.sub = 1; p.t = 0; snd('atk3'); }
    return;
  }
  if (w.sub === 1) {   // 斜向旋转下落，沿途连砍
    p.vx = p.face * W2.vx; p.vy = W2.vy + p.t * 400;
    if (Math.floor(p.t / 0.03) !== Math.floor((p.t - dt) / 0.03)) R.fx.push({ k: 'wtrail', x: p.x, y: p.y - 18, a: w.spin, t: 0, life: 0.22 });
    if ((w.tick -= dt) <= 0) {
      w.tick = W2.tick;
      const box = { x0: p.x - 30, x1: p.x + 30, y0: p.y - 44, y1: p.y + 8 };
      let n = 0;
      for (const e of alive()) {
        if (!overlap(box, eBox(e)) || (p.wheelHit.get(e) || 0) >= 4) continue;
        p.wheelHit.set(e, (p.wheelHit.get(e) || 0) + 1); n++;
        strike(e, W2.dmg, { skill: 'i', kb: p.face * 70 });
      }
      if (n) { R.stop = Math.max(R.stop, 0.025); R.shake = Math.max(R.shake, 2); snd('atk2', { rate: 1.2 }); }
    }
    if (p.ground) { wheelSlam(p); return; }
    if (p.t >= W2.maxT) { setSt(p, 'fall'); }
    return;
  }
  // sub 2：落地收招
  p.vx *= Math.pow(0.001, dt);
  if (p.t >= 0.18) setSt(p, 'idle');
}
function wheelSlam(p) {
  const W2 = KB.wheel;
  p.wheel.sub = 2; p.t = 0; p.vy = 0;
  R.shake = Math.max(R.shake, 5); R.stop = Math.max(R.stop, 0.06);
  snd('atk3', { rate: 0.7 });
  vfx('exp2_' + tint(), p.x + p.face * 10, p.y - 6, { ground: true });
  burst(p.x, p.y, 16, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v0: 80, v1: 220, up: 40 });
  R.fx.push({ k: 'ring', x: p.x, y: p.y - 4, t: 0 });
  for (const e of alive()) {
    if (Math.abs(e.x - p.x) > W2.slamR || Math.abs(e.y - p.y) > 40) continue;
    strike(e, W2.slam, { skill: 'i', mark: SK.u.mark, stun: W2.stun, launch: e.boss ? 0 : -150, kb: sign(e.x - p.x) * 60 });
  }
}
function startPhase(p) {
  setSt(p, 'phase'); p.perfectUsed = false; p.inv = KB.phase.inv;
  p.vx = p.face * KB.phase.v; p.vy = 0;
  snd('blink'); afterImage(p);
  checkPerfect(p);
}
function startSub(p, dir) {
  p.subN--; if (p.subN === KB.sub.n - 1) p.subT = KB.sub.cd;
  const late = R.time - p.hurtAt <= KB.sub.refundT && p.lastDmg > 0;   // 刚挨打马上替身：墓碑挡回一半
  if (late) { const back = Math.round(p.lastDmg * KB.sub.refund); p.hp = Math.min(p.mx, p.hp + back); p.lastDmg = 0; R.nums.push({ x: p.x, y: p.y - 52, v: '+' + back, c: '#8fffb0', t: 0 }); say('替身', '#c8bcd8'); }
  R.fx.push({ k: 'tomb', x: p.x, y: p.y, t: 0, life: 1.1 });
  burst(p.x, p.y - 16, 10, { col: 'stone', v0: 40, v1: 160 });
  const away = dir ? -dir : -p.face;   // 往按的反方向跳；不按方向就往身后跳
  p.face = -away;
  p.vx = away * KB.sub.vx; p.vy = KB.sub.vy; p.ground = false; p.coy = 0; p.inv = KB.sub.inv; p.combo = -1;
  setSt(p, 'sub'); snd('dash', { rate: 0.8 });
}

// I 掷碑：墓碑巨剑像回旋镖一样飞出、悬停、飞回；""")

# ---- 完美虚化：下一刀破绽斩 ----
rep("  if (mv('pdCrit')) p.pdEye = 3;",
    "  if (mv('pdCrit')) p.pdEye = 3;\n  if (KIT_B && p.st === 'phase') { p.phaseEye = KB.phase.eye; p.cd.o = Math.min(p.cd.o, KB.phase.perfCd); say('完美虚化　破绽', '#8fd8ff'); }")
rep("    strike(e, h.dmg, { kb: p.face * h.kb, launch: h.launch, basic: true, third: kind === 'c2' });\n    n++;\n  }",
"""    const eye = KIT_B && p.phaseEye > 0 && !red;
    strike(e, h.dmg * (eye ? KB.phase.mul : 1), { kb: p.face * h.kb * (eye ? 2 : 1), launch: h.launch, basic: true, third: kind === 'c2', stun: eye ? 0.8 : undefined, breakEye: eye });
    if (eye) { R.fx.push({ k: 'spark', x: e.x, y: e.y - 24, t: 0, n: 14 }); vfx('exp2_soul', e.x, e.y - 20); }
    n++;
  }
  if (n && KIT_B && p.phaseEye > 0 && !red) { p.phaseEye = 0; R.stop = 0.12; R.shake = 6; R.flash = 0.1; snd('perfect', { rate: 0.7 }); return; }""")
# 破绽斩打重甲：直接破甲
rep("breakArmor: brute && o.skill === 'u' ? 1.4 : 0 });",
    "breakArmor: brute && (o.skill === 'u' || o.breakEye) ? 1.4 : 0 });")

# ---- 受伤：记时刻（替身返还用）、葬轮中减半 ----
rep("  if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; }",
    "  if (p.st === 'wheel') dmg = Math.max(1, Math.round(dmg * 0.5));\n  if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; }")
rep("  p.hp = Math.max(0, p.hp - dmg); snd('hurt');",
    "  p.hp = Math.max(0, p.hp - dmg); snd('hurt'); p.hurtAt = R.time; p.lastDmg = dmg;")

# ---- 火球：虚化穿过算完美 ----
rep("      if (['dash', 'thrust', 'blink'].includes(p.st) && p.inv > 0) {",
    "      if ((KIT_B ? ['phase', 'sub', 'thrust'] : ['dash', 'thrust', 'blink']).includes(p.st) && p.inv > 0) {")

# ---- 画面 ----
rep("    case 'storm': return blood ? ['t_sweep', 1 + (Math.floor(p.t * 20) % 2)] : ['blink', 0];",
"""    case 'storm': return blood ? ['t_sweep', 1 + (Math.floor(p.t * 20) % 2)] : ['blink', 0];
    case 'wheel': return p.wheel && p.wheel.sub === 2 ? ['plunge', 1] : p.wheel && p.wheel.sub === 0 ? ['jump', 2] : ['airatk', 2];
    case 'phase': return f('dash', 20, false);
    case 'sub': return ['jump', 3];""")
rep("""  if (p.face < 0) rx.scale(-1, 1);
  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
  rx.restore();
}""",
"""  if (p.face < 0) rx.scale(-1, 1);
  if (p.st === 'wheel' && p.wheel && p.wheel.sub === 1) { rx.translate(0, -20); rx.rotate(p.wheel.spin); rx.translate(0, 20); }   // 葬轮：整个人抱剑翻滚
  if (p.st === 'phase') { rx.globalAlpha = 0.4; rx.filter = 'sepia(1) hue-rotate(160deg) saturate(3) brightness(1.4)'; }
  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
  rx.restore();
}""")
rep("    } else if (f.k === 'ring') {",
"""    } else if (f.k === 'wtrail') {   // 葬轮的酒红弧形拖尾
      const k = f.t / f.life; if (k >= 1) continue;
      rx.strokeStyle = `rgba(200,40,70,${0.85 * (1 - k)})`; rx.lineWidth = 4 - 2 * k;
      rx.beginPath(); rx.arc(x, y, 26, f.a, f.a + 2.2); rx.stroke();
      rx.strokeStyle = `rgba(255,190,200,${0.6 * (1 - k)})`; rx.lineWidth = 1;
      rx.beginPath(); rx.arc(x, y, 22, f.a + 0.3, f.a + 1.8); rx.stroke();
    } else if (f.k === 'tomb') {   // 替身墓碑：立着挡刀，然后碎掉淡出
      const k = f.t / f.life; if (k >= 1) continue;
      rx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      rx.fillStyle = '#2a2430'; rx.fillRect(x - 11, y - 34, 22, 34); rx.fillRect(x - 7, y - 38, 14, 4);
      rx.fillStyle = '#6a5e70'; rx.fillRect(x - 9, y - 32, 18, 30); rx.fillRect(x - 5, y - 36, 10, 4);
      rx.fillStyle = '#c8203a'; rx.fillRect(x - 1, y - 28, 2, 12); rx.fillRect(x - 5, y - 24, 10, 2);
      rx.globalAlpha = 1;
    } else if (f.k === 'ring') {""")

# ---- 技能栏标签 ----
rep("      return R.blade ? { label: '瞬', cd: 0 } : { label: '掷', cd: cdk('i') };",
    "      if (KIT_B) return { label: '轮', cd: cdk('i') };\n      return R.blade ? { label: '瞬', cd: 0 } : { label: '掷', cd: cdk('i') };")
rep("      return R.witch > 0 ? { label: '狱', cd: cdk('o') } : { label: '断', cd: cdk('o') };",
    "      if (KIT_B) return R.witch > 0 ? { label: '狱', cd: 0 } : { label: '虚', cd: cdk('o') };\n      return R.witch > 0 ? { label: '狱', cd: cdk('o') } : { label: '断', cd: cdk('o') };")
rep("    case 'dodge': return { label: b ? '影' : '闪' };",
    "    case 'dodge': return KIT_B && !b ? { label: '替' + p.subN, off: p.subN <= 0, cd: p.subN < KB.sub.n ? clamp(p.subT / KB.sub.cd, 0, 1) : 0 } : { label: b ? '影' : '闪' };")
rep("  const keys = [['s1', 'U'], ['s2', 'I'], ['s3', 'O'], ['s4', 'P']];",
    "  const keys = KIT_B ? [['s1', 'U'], ['s2', 'I'], ['s3', 'O'], ['s4', 'P'], ['dodge', '空格']] : [['s1', 'U'], ['s2', 'I'], ['s3', 'O'], ['s4', 'P']];")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
