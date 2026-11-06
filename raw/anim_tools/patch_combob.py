# kit=b 普攻：灵动四段连招（垫步上撩 / 单脚回旋 / 滑铲上挑 / 空翻斩），每段带位移、残影、生成的刀光和命中爆点
import io
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:80])
    s = s.replace(old, new)

# ---- 连招表 ----
rep("const touchOn = () =>",
"""/* kit=b 普攻四段：a 帧条、f0 起始帧；d 四拍时长（蓄 / 出 / 停 / 收）；伤害在第 hit 拍开头结算。
   mv 位移：在 mt 秒内往前冲 dist 像素（前方有敌人就只贴到它身前）；sl 刀光（b_sl0~3），sx/sy 刀光位置，vf 刀光上下翻 */
const KCOMBO = [
  { a: 'b_c12', f0: 0, d: [0.08, 0.05, 0.11, 0.09], hit: 1, dist: 46, mt: 0.13, box: { x0: -2, x1: 60, y0: -64, y1: 0 }, dmg: 11, kb: 80, sl: 0, vf: true, sx: 26, sy: -30, stop: 0.05, shake: 2, snd: 'atk1' },
  { a: 'b_c12', f0: 4, d: [0.06, 0.06, 0.1, 0.08], hit: 1, dist: 30, mt: 0.12, box: { x0: -40, x1: 64, y0: -50, y1: 0 }, dmg: 12, kb: 100, sl: 1, sx: 12, sy: -22, stop: 0.06, shake: 2, snd: 'atk2' },
  { a: 'b_c34', f0: 0, d: [0.12, 0.05, 0.12, 0.07], hit: 1, dist: 80, mt: 0.15, box: { x0: -2, x1: 58, y0: -78, y1: 0 }, dmg: 13, kb: 30, launch: -320, sl: 2, sx: 20, sy: -36, stop: 0.07, shake: 3, snd: 'atk3' },
  { a: 'b_c34', f0: 4, d: [0.1, 0.06, 0.16, 0.16], hit: 1, dist: 50, mt: 0.16, box: { x0: -14, x1: 70, y0: -70, y1: 6 }, dmg: 22, kb: 190, sl: 3, sx: 26, sy: -30, stop: 0.09, shake: 6, snd: 'atk3', fin: true },
];
const kcFrame = (s, t) => { let i = 0; while (i < 3 && t >= s.d[i]) { t -= s.d[i]; i++; } return i; };
const kcAt = (s, k) => s.d.slice(0, k).reduce((a, b) => a + b, 0);

const touchOn = () =>""")

# ---- 输入：kit=b 地面普攻走四段连招（不出跑攻），连招途中离地也继续排队 ----
rep("""    } else if (!p.ground) {
      if (D && p.st !== 'plunge') { setSt(p, 'plunge'); p.vy = 420; p.vx *= 0.3; }""",
"""    } else if (KIT_B && p.st === 'atk') {
      p.queued = true;
    } else if (KIT_B && p.ground && !busy) {
      autoFace(p, dir);
      startComboB(p, p.comboGap < 0.5 && p.combo >= 0 && p.combo < 3 ? p.combo + 1 : 0);
    } else if (!p.ground) {
      if (D && p.st !== 'plunge') { setSt(p, 'plunge'); p.vy = 420; p.vx *= 0.3; }""")

# ---- 状态机 ----
rep("""    case 'atk': {
      const s = blood ? TCOMBO[p.combo]""",
"""    case 'atk': {
      if (KIT_B && !blood) { updateComboB(p, dt); break; }
      const s = blood ? TCOMBO[p.combo]""")

# ---- 实现 ----
rep("/* ---------- kit=b 刺客技能 ---------- */",
"""/* ---------- kit=b 普攻 ---------- */
function startComboB(p, step) {
  setSt(p, 'atk'); p.combo = step; p.queued = false;
  const s = KCOMBO[step];
  let dist = s.dist;   // 自动贴近：前方 150 像素内有敌人，只冲到它身前
  for (const e of alive()) {
    const dx = (e.x - p.x) * p.face;
    if (dx > 0 && dx < 150 && Math.abs(e.y - p.y) < 50) dist = Math.min(dist, Math.max(6, dx - 26));
  }
  p.kcV = dist / s.mt;
}
function updateComboB(p, dt) {
  const s = KCOMBO[p.combo];
  p.vx = p.t < s.mt ? p.face * p.kcV : p.vx * Math.pow(0.0005, dt);
  if (p.t < s.mt && Math.floor(p.t / 0.03) !== Math.floor((p.t - dt) / 0.03)) afterImage(p);
  if (!p.hitDone && p.t >= kcAt(s, s.hit)) { p.hitDone = true; doHitB(p, s); }
  const chainAt = kcAt(s, 3), end = kcAt(s, 4);   // 排队了就在「收」之前直接接下一段
  if (p.queued && p.combo < 3 && p.t >= chainAt) { p.comboGap = 0; startComboB(p, p.combo + 1); return; }
  if (p.t >= end) { p.comboGap = 0; setSt(p, 'idle'); if (p.combo === 3) p.combo = -1; }
}
function doHitB(p, s) {
  snd(s.snd, s.fin ? { rate: 0.8 } : undefined);
  vfx('b_sl' + s.sl, p.x + p.face * s.sx, p.y + s.sy, { flip: p.face < 0, vflip: s.vf });
  const box = faceBox(p, s.box);
  let n = 0;
  for (const e of alive()) {
    if (!overlap(box, eBox(e))) continue;
    strike(e, s.dmg, { kb: p.face * s.kb, launch: s.launch, basic: true, third: !!s.fin });
    n++;
  }
  reflectBalls(p, box);
  if (!n) return;
  R.stop = Math.max(R.stop, s.stop); R.shake = Math.max(R.shake, s.shake);
  if (s.fin) { R.slowT = 0.2; R.flash = Math.max(R.flash, 0.08); burst(p.x + p.face * 30, p.y - 20, 12, { col: 'blood', v0: 80, v1: 260 }); }
}

/* ---------- kit=b 刺客技能 ---------- */""")

# ---- 刀光上下翻 ----
rep("      if (f.flip) rx.scale(-1, 1);\n      if (f.alpha) rx.globalAlpha = f.alpha;",
    "      if (f.flip) rx.scale(-1, 1);\n      if (f.vflip) rx.scale(1, -1);\n      if (f.alpha) rx.globalAlpha = f.alpha;")

# ---- 命中爆点 ----
rep("  vfx('hit_' + tint(), e.x + rnd(-4, 4), e.y - 14 + rnd(-4, 4), { rot: rnd(0, 6.28) });",
    "  if (KIT_B && R.p.form !== 'blood') vfx('b_hit', e.x + rnd(-4, 4), e.y - 18 + rnd(-4, 4), { flip: R.p.x > e.x });   // kit=b：十字爆点，血点往打的方向喷\n  else vfx('hit_' + tint(), e.x + rnd(-4, 4), e.y - 14 + rnd(-4, 4), { rot: rnd(0, 6.28) });")

# ---- 收尾慢动作 ----
rep("    if (R.stop > 0) { R.stop -= dt; return; }",
    "    if (R.stop > 0) { R.stop -= dt; return; }\n    if (R.slowT > 0) { R.slowT -= dt; dt *= 0.3; }   // 第 4 段收尾命中：短暂慢动作")

# ---- 画面 ----
rep("      if (!blood) return f('combo', 14, false, COMBO_STEP[p.combo].f0, 4);",
    "      if (KIT_B && !blood) { const s = KCOMBO[p.combo]; return [s.a, s.f0 + kcFrame(s, p.t)]; }\n      if (!blood) return f('combo', 14, false, COMBO_STEP[p.combo].f0, 4);")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
