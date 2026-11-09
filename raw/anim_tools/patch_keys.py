# kit=b：普攻换成「蓄力 / 拖影 / 收势」三张关键帧 + 炫特效；O 虚化改成「见切」（架势中被打 = 自动瞬狱）
import io
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:90])
    s = s.replace(old, new)

# ---- 常量 ----
rep("  phase: { t: 0.4, win: 0.2, inv: 0.42, cd: 3, perfCd: 8 },   // 原地纯虚化；前 win 秒内有攻击打来 = 完美虚化 → 可立刻瞬狱，之后冷却变长",
    "  phase: { t: 0.3, rec: 0.12, hold: 0.14, cd: 3, perfCd: 8 },   // O 见切：拔刀架势 t 秒（无敌），期间被打 = 见切，定格 hold 秒后自动瞬狱；没被打收刀 rec 秒")

i0 = s.index("/* kit=b 普攻四段：")
i1 = s.index("const kcAt = ")
i1 = s.index("\n", i1) + 1
s = s[:i0] + """/* kit=b 普攻四段，每段三张关键帧：d 三拍 = 蓄力 / 拖影（出刀，同时往前冲 dist）/ 收势；拖影结束那一刻结算伤害。
   arc 刀弧（以脚底为原点、朝右时的圆心偏移 dx/dy、半径 rx/ry、起止角 a0→a1）；sl 刀光（b_sl0~3），sx/sy 刀光位置，vf 刀光上下翻 */
const KCOMBO = [
  { a: 'b_k12', f0: 0, d: [0.05, 0.035, 0.13], dist: 30, box: { x0: -2, x1: 60, y0: -64, y1: 0 }, dmg: 11, kb: 150, sl: 0, vf: true, sx: 26, sy: -30, stop: 0.05, shake: 2, snd: 'atk1',
    arc: { dx: 12, dy: -22, rx: 30, ry: 26, a0: -2.4, a1: 0.8 } },
  { a: 'b_k12', f0: 3, d: [0.04, 0.035, 0.12], dist: 22, box: { x0: -40, x1: 64, y0: -50, y1: 0 }, dmg: 12, kb: 150, sl: 1, sx: 12, sy: -22, stop: 0.05, shake: 2, snd: 'atk2',
    arc: { dx: 10, dy: -15, rx: 36, ry: 10, a0: -2.9, a1: 0.4 } },
  { a: 'b_k34', f0: 0, d: [0.06, 0.035, 0.13], dist: 20, box: { x0: -2, x1: 58, y0: -78, y1: 0 }, dmg: 13, kb: 30, launch: -320, sl: 2, sx: 20, sy: -36, stop: 0.06, shake: 3, snd: 'atk3', pillar: true,
    arc: { dx: 8, dy: -24, rx: 30, ry: 32, a0: 1.9, a1: -1.4 } },
  { a: 'b_k34', f0: 3, d: [0.07, 0.04, 0.34], dist: 34, box: { x0: -14, x1: 70, y0: -70, y1: 6 }, dmg: 22, kb: 190, sl: 3, sx: 26, sy: -30, stop: 0.1, shake: 6, snd: 'atk3', fin: true,
    arc: { dx: 14, dy: -28, rx: 34, ry: 34, a0: -1.9, a1: 1.3, big: true } },
];
const kcFrame = (s, t) => (t < s.d[0] ? 0 : t < s.d[0] + s.d[1] ? 1 : 2);
const kcHit = (s) => s.d[0] + s.d[1];
""" + s[i1:]

# ---- 每帧计时：去掉「完美虚化后没放瞬狱」的旧逻辑 ----
rep("""  if (KIT_B) {   // 替身逐次回复；完美虚化后没用瞬狱，断裂结束也进长冷却
    if (p.phasePerf && R.witch <= 0 && p.st !== 'storm') { p.phasePerf = false; p.cd.o = Math.max(p.cd.o, KB.phase.perfCd); }
    if""", """  if (KIT_B) {   // 替身逐次回复
    if""")

# ---- 技能：普攻打到一半也能按 O 进见切架势；架势中不再能放别的技能 ----
rep("  if (FREE.includes(p.st) || p.st === 'throw' || (blood && p.st === 'rdash') || (KIT_B && !blood && p.st === 'phase' && p.t > 0.1)) castSkills(p, dir, blood);",
"""  if (KIT_B && !blood && p.st === 'atk' && p.cd.o <= 0 && want(p, 's3')) {   // 见切可以取消普攻，连招不断
    use(p, 's3'); noteCast(p, 'o'); autoFace(p, dir); p.cd.o = KB.phase.cd; startPhase(p);
  }
  if (FREE.includes(p.st) || p.st === 'throw' || (blood && p.st === 'rdash')) castSkills(p, dir, blood);""")
rep("""    } else if (KIT_B && want(p, 's3') && R.witch > 0 && (p.phasePerf || p.cd.o <= 0)) {   // kit=b 完美虚化后 O = 瞬狱
      use(p, 's3'); noteCast(p, 'o'); if (dir) p.face = dir;
      if (startStorm(p)) { p.phasePerf = false; p.cd.o = KB.phase.perfCd; return; }
    } else if (KIT_B && ready('s3', 'o')) {   // kit=b O 虚化""",
"""    } else if (KIT_B && ready('s3', 'o')) {   // kit=b O 见切""")

# ---- 状态机：见切 ----
rep("""    case 'phase':
      p.vx = 0; p.vy = Math.min(p.vy, 60);   // 原地不动，空中缓缓下落
      if (p.t < KB.phase.win) checkPerfect(p);   // 前 0.2 秒内攻击打来都算完美虚化
      if (p.t >= KB.phase.t) setSt(p, p.ground ? 'idle' : 'fall');
      break;""",
"""    case 'phase': {   // O 见切
      const K = KB.phase;
      p.vx = 0; p.vy = Math.min(p.vy, 60);
      if (p.phasePerf) {   // 见切成立：定格一下，自动瞬狱
        if (p.t - p.perfAt >= K.hold) {
          p.phasePerf = false; p.cd.o = K.perfCd;
          if (!startStorm(p)) { p.inv = 0.3; setSt(p, p.ground ? 'idle' : 'fall'); }   // 屏幕里没敌人（打火球触发）：收刀
        }
        break;
      }
      if (p.t < K.t) checkPerfect(p);   // 架势期间，有攻击打来 = 见切
      else if (p.t >= K.t + K.rec) setSt(p, p.ground ? 'idle' : 'fall');
      break;
    }""")

# ---- 普攻实现 ----
i0 = s.index("function startComboB(p, step) {")
i1 = s.index("/* ---------- kit=b 刺客技能 ---------- */")
s = s[:i0] + r"""function startComboB(p, step) {
  setSt(p, 'atk'); p.combo = step; p.queued = false; p.kcFx = false; p.kcDone = false;
  const s = KCOMBO[step];
  let dist = s.dist, near = 999;   // 火影式吸附：前方 120 像素内有敌人，出刀那一下直接贴到它身前
  for (const e of alive()) {
    const dx = (e.x - p.x) * p.face;
    if (dx > 0 && dx < 120 && Math.abs(e.y - p.y) < 50) near = Math.min(near, dx);
  }
  if (near < 999) dist = clamp(near - 26, 4, 80);
  p.kcDist = dist;
}
function updateComboB(p, dt) {
  const s = KCOMBO[p.combo], t0 = s.d[0], t1 = kcHit(s), end = t1 + s.d[2];
  // 位移只在拖影那一拍：先快后慢（ease-out，速度 2(1-k)），蓄力和收势都站定
  // 拖影只有两三帧，按速度积分会冲过头：每帧直接算出这一刻该在的位置（ease-out），再换成速度交给物理
  const k = (p.t - t0) / s.d[1];
  if (k >= 0 && !p.kcFx) { p.kcFx = true; p.kcX0 = p.x; comboSmearFx(p, s); }
  if (k >= 0 && !p.kcDone) { const kk = Math.min(1, k); p.vx = (p.kcX0 + p.face * p.kcDist * (1 - (1 - kk) * (1 - kk)) - p.x) / dt; if (k >= 1) p.kcDone = true; }
  else p.vx = 0;
  if (k >= 0 && p.t < t1 + 0.06 && Math.floor(p.t / 0.02) !== Math.floor((p.t - dt) / 0.02)) { afterImage(p); Object.assign(R.fx[R.fx.length - 1], { red: true, soft: true, back: true }); }
  if (!p.hitDone && p.t >= t1) { p.hitDone = true; doHitB(p, s); }
  if (p.queued && p.combo < 3 && p.t >= t1 + 0.05) { p.comboGap = 0; startComboB(p, p.combo + 1); return; }   // 收势刚定住就能接下一刀
  if (p.t >= end) { p.comboGap = 0; setSt(p, 'idle'); if (p.combo === 3) p.combo = -1; }
}
// 出刀瞬间：刀弧 + 身后速度线
function comboSmearFx(p, s) {
  R.fx.push({ k: 'karc', x: p.x, y: p.y, face: p.face, ...s.arc, t: 0, life: 0.22 });
  for (let j = 0; j < 5; j++) R.fx.push({ k: 'kline', x: p.x - p.face * rnd(10, 50), y: p.y - rnd(8, 44), face: p.face, len: rnd(20, 50), t: 0, life: 0.15 });
}
function doHitB(p, s) {
  snd(s.snd, s.fin ? { rate: 0.8 } : undefined);
  vfx('b_sl' + s.sl, p.x + p.face * s.sx, p.y + s.sy, { flip: p.face < 0, vflip: s.vf });
  const box = faceBox(p, s.box);
  let n = 0, first = null;
  for (const e of alive()) {
    if (!overlap(box, eBox(e))) continue;
    strike(e, s.dmg, { kb: p.face * s.kb, launch: s.launch, basic: true, third: !!s.fin });
    if (!first) first = e;
    n++;
  }
  reflectBalls(p, box);
  if (!n) return;
  R.stop = Math.max(R.stop, s.stop); R.shake = Math.max(R.shake, s.shake);
  // 火星往打的方向喷（白 + 红两层）、淡粉白闪
  const hx = first.x, hy = first.y - 18;
  R.fx.push({ k: 'kspark', x: hx, y: hy, t: 0, life: 0.45, ps: [...sparkSet(p.face, s.fin ? 26 : 12, '#ffe0e6', 80, s.fin ? 320 : 220), ...sparkSet(p.face, s.fin ? 14 : 6, '#ff2e55', 60, 200)] });
  R.flash = Math.max(R.flash, s.fin ? 0.15 : 0.04); R.flashCol = '255,235,240';
  if (s.pillar) { R.fx.push({ k: 'kpillar', x: hx, y: first.y, t: 0, life: 0.35 }); ember(hx, first.y, 10); }
  if (s.fin) {
    R.slowT = 0.25;
    const gx = p.x + p.face * 30;
    vfx('w_slam', gx, p.y + 1, { t: 1.5 / 16 });
    R.fx.push({ k: 'kcrack', x: gx, y: p.y, t: 0, life: 0.6 });
    ember(gx, p.y, 24);
    burst(p.x + p.face * 30, p.y - 20, 12, { col: 'blood', v0: 80, v1: 260 });
  }
}
function sparkSet(face, n, c, v0, v1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (face > 0 ? 0 : Math.PI) + rnd(-0.9, 0.9), v = rnd(v0, v1);
    out.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, c, life: rnd(0.25, 0.45) });
  }
  return out;
}
// 余烬：往上飘的红白小点
function ember(x, y, n) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push({ vx: rnd(-40, 40), vy: rnd(-70, -15), c: Math.random() < 0.5 ? '#ff3b5c' : '#ffd0d8', s: 1 });
  R.fx.push({ k: 'parts', x, y: y - 6, t: 0, life: rnd(0.8, 1.1), ps, g: -10 });
}

""" + s[i1:]

# ---- 见切：开架势 / 成立 ----
rep("""function startPhase(p) {
  setSt(p, 'phase'); p.perfectUsed = false; p.inv = KB.phase.inv;
  p.vx = 0; p.vy = Math.min(p.vy, 0);
  snd('blink'); R.fx.push({ k: 'ring', x: p.x, y: p.y - 18, t: 0 });
  checkPerfect(p);
}""",
"""function startPhase(p) {
  setSt(p, 'phase'); p.perfectUsed = false; p.phasePerf = false; p.inv = KB.phase.t + 0.02;
  p.vx = 0; p.vy = Math.min(p.vy, 0);
  snd('blink', { rate: 1.4 });
  R.fx.push({ k: 'kstance', t: 0, life: KB.phase.t });   // 跟着主角：往里收的白金圈 + 刀口一闪
  checkPerfect(p);
}
// 见切成立：定格、白闪、十字斩痕落在出手的敌人身上、冲击环
function parryFx(p, e) {
  p.phasePerf = true; p.perfAt = p.t; p.inv = 9;
  R.stop = Math.max(R.stop, 0.1); R.shake = Math.max(R.shake, 4); R.flash = 0.15; R.flashCol = '255,248,225';
  const tx = e ? e.x : p.x + p.face * 30, ty = e ? e.y - 22 : p.y - 22;
  R.fx.push({ k: 'kcross', x: tx, y: ty, t: 0, life: 0.35 });
  R.fx.push({ k: 'krays', x: p.x, y: p.y - 20, t: 0, life: 0.3 });
  R.fx.push({ k: 'kspark', x: tx, y: ty, t: 0, life: 0.45, ps: [...sparkSet(1, 10, '#fff4d0', 80, 260), ...sparkSet(-1, 10, '#fff4d0', 80, 260)] });
  say('見切', '#fff2c0');
}""")
rep("  if (KIT_B && p.st === 'phase') { p.phasePerf = true; p.cd.o = 0; say('完美虚化　再按 O 瞬狱', '#8fd8ff'); }",
    "  if (KIT_B && p.st === 'phase') parryFx(p, e);")

# ---- 画面：帧 ----
rep("      if (KIT_B && !blood) { const s = KCOMBO[p.combo]; return [s.a, s.f0 + kcFrame(s, p.t)]; }",
    "      if (KIT_B && !blood) { const s = KCOMBO[p.combo]; return [s.a, s.f0 + kcFrame(s, p.t)]; }   // 蓄力 / 拖影 / 收势")
rep("    case 'phase': return f('idle', 6, true);",
    "    case 'phase': return p.phasePerf ? ['b_k12', 4] : p.t < KB.phase.t ? ['b_k12', 3] : ['idle', 0];   // 见切：拔刀架势 → 成立时出刀定格")
rep("    case 'sheathe': return blood ? ['t_idle', 0] : ['o_iai', 11];",
    "    case 'sheathe': return blood ? ['t_idle', 0] : KIT_B ? ['b_k12', 5] : ['o_iai', 11];   // kit=b：o_iai 素材和表对不上，收刀用收势帧")

# ---- 画面：主角发光（出刀那一帧泛红；见切架势白金光） ----
rep("""  if (p.st === 'phase') { rx.globalAlpha = 0.4; rx.filter = 'sepia(1) hue-rotate(160deg) saturate(3) brightness(1.4)'; }
  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
  rx.restore();""",
"""  rx.drawImage(im, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh);
  const glow = !KIT_B || p.form === 'blood' ? null
    : p.st === 'atk' && kcFrame(KCOMBO[p.combo], p.t) === 1 ? ['#ff4d70', 0.4]
    : p.st === 'phase' ? ['#fff0c0', p.phasePerf ? 0.7 : 0.12 + 0.1 * Math.sin(R.time * 40)] : null;
  if (glow) { const tc = tintSheet(name, im, glow[0]); if (tc) { rx.globalCompositeOperation = 'lighter'; rx.globalAlpha = glow[1]; rx.drawImage(tc, i * m.fw, 0, m.fw, m.fh, -Math.round(m.anchorX), -m.fh, m.fw, m.fh); } }
  rx.restore();""")
rep("/* 葬轮：绕身体的刀光漩涡",
"""// 整张帧图染成单色（发光叠加用），按图名 + 颜色缓存
const TINTS = {};
function tintSheet(name, im, col) {
  const id = name + col;
  if (TINTS[id]) return TINTS[id];
  if (!im.width) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return (TINTS[id] = c);
}
/* 葬轮：绕身体的刀光漩涡""")

# ---- 画面：新特效 ----
rep("    } else if (f.k === 'tomb') {",
r"""    } else if (f.k === 'karc') {   // 普攻刀弧：从起点扫到终点，两头尖中间粗，暗红 / 亮红 / 白芯三层叠加
      const reveal = Math.min(1, f.t / 0.04), fade = Math.max(0, 1 - Math.max(0, f.t - 0.04) / 0.18), N = 28, S = f.big ? 1.25 : 1;
      if (fade <= 0) continue;
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineCap = 'round';
      for (const [col, w, al] of [['150,10,40', 9, 0.7], ['255,50,90', 5, 0.9], ['255,235,240', 2, 1]]) {
        rx.strokeStyle = `rgba(${col},${al * fade})`;
        for (let i = 0; i < N; i++) {
          const s0 = i / N, s1 = (i + 1) / N; if (s1 > reveal) break;
          const th = Math.sin(Math.PI * (s0 + s1) / 2); if (th <= 0.02) continue;
          const A0 = f.a0 + (f.a1 - f.a0) * s0, A1 = f.a0 + (f.a1 - f.a0) * s1, ox = x + f.face * f.dx, oy = y + f.dy;
          rx.lineWidth = w * S * th; rx.beginPath();
          rx.moveTo(ox + f.face * Math.cos(A0) * f.rx * S, oy + Math.sin(A0) * f.ry * S);
          rx.lineTo(ox + f.face * Math.cos(A1) * f.rx * S, oy + Math.sin(A1) * f.ry * S); rx.stroke();
        }
      }
      rx.restore();
    } else if (f.k === 'kline') {   // 冲刺速度线
      const k = f.t / f.life; if (k >= 1) continue;
      rx.fillStyle = `rgba(255,120,150,${0.5 * (1 - k)})`;
      const xx = x - f.face * k * 30;
      rx.fillRect(f.face > 0 ? xx - f.len : xx, y, f.len, 1);
    } else if (f.k === 'kspark') {   // 命中火星：带速度的短线，受重力
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineWidth = 1;
      for (const q of f.ps) {
        const k = f.t / q.life; if (k >= 1) continue;
        const px = x + q.vx * f.t, py = y + q.vy * f.t + 130 * f.t * f.t;
        rx.strokeStyle = q.c; rx.globalAlpha = 1 - k;
        rx.beginPath(); rx.moveTo(px, py); rx.lineTo(px - q.vx * 0.03, py - (q.vy + 260 * f.t) * 0.03); rx.stroke();
      }
      rx.restore();
    } else if (f.k === 'kpillar') {   // 第 3 刀上挑：敌人脚下冲起的光柱
      const k = f.t / f.life; if (k >= 1) continue;
      const w = 10 * (1 - k), gr = rx.createLinearGradient(0, y - 90, 0, y);
      gr.addColorStop(0, 'rgba(255,40,80,0)'); gr.addColorStop(1, `rgba(255,200,215,${1 - k})`);
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.fillStyle = gr; rx.fillRect(Math.round(x - w / 2), y - 90, Math.round(w), 90); rx.restore();
    } else if (f.k === 'kcrack') {   // 第 4 刀落地：地面裂纹 + 扩散的冲击圈
      const k = f.t / f.life; if (k >= 1) continue;
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineWidth = 1;
      rx.strokeStyle = `rgba(255,60,90,${1 - k})`;
      for (let j = -3; j <= 3; j++) { rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x + j * 14, y + (j % 2 ? 1 : 2)); rx.lineTo(x + j * 24, y + 3); rx.stroke(); }
      rx.strokeStyle = `rgba(255,220,230,${0.8 * (1 - k)})`;
      rx.beginPath(); rx.ellipse(x, y, 10 + k * 70, 3 + k * 8, 0, 0, Math.PI * 2); rx.stroke();
      rx.restore();
    } else if (f.k === 'kstance') {   // 见切架势：白金圈往主角身上收，刀口闪一下
      const k = f.t / f.life, p = R.p; if (k >= 1 || p.st !== 'phase' || p.phasePerf) continue;
      const px = Math.round(p.x - cx), py = Math.round(p.y - cy) - 20;
      rx.save(); rx.globalCompositeOperation = 'lighter';
      rx.strokeStyle = `rgba(255,240,200,${0.3 + 0.6 * k})`; rx.lineWidth = 1 + k;
      rx.beginPath(); rx.arc(px, py, 34 - 20 * k, 0, Math.PI * 2); rx.stroke();
      rx.strokeStyle = `rgba(140,215,255,${0.5 * (1 - k)})`; rx.lineWidth = 1;
      rx.beginPath(); rx.arc(px, py, 44 - 26 * k, 0, Math.PI * 2); rx.stroke();
      if (k < 0.35) {   // 刀口一闪：十字星
        const gx = px - p.face * 14, gy = py + 10, r = 10 * Math.sin(k / 0.35 * Math.PI);
        rx.fillStyle = 'rgba(255,250,230,0.95)'; rx.fillRect(gx - r, gy, r * 2, 1); rx.fillRect(gx, gy - r * 0.6, 1, r * 1.2);
      }
      rx.restore();
    } else if (f.k === 'kcross') {   // 见切成立：落在敌人身上的十字斩痕（白芯金边），先划开再淡出
      const k = f.t / f.life; if (k >= 1) continue;
      const len = 30 * Math.min(1, k / 0.15), al = k < 0.5 ? 1 : (1 - k) / 0.5;
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineCap = 'round';
      for (const [col, w] of [['255,190,90', 5], ['255,250,235', 2]]) {
        rx.strokeStyle = `rgba(${col},${al})`; rx.lineWidth = w * (1 - k * 0.6);
        rx.beginPath(); rx.moveTo(x - len, y - len); rx.lineTo(x + len, y + len); rx.stroke();
        rx.beginPath(); rx.moveTo(x + len, y - len); rx.lineTo(x - len, y + len); rx.stroke();
      }
      rx.restore();
    } else if (f.k === 'krays') {   // 见切成立：主角身上往外炸的放射线
      const k = f.t / f.life; if (k >= 1) continue;
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.strokeStyle = `rgba(255,240,205,${1 - k})`; rx.lineWidth = 1;
      for (let j = 0; j < 16; j++) {
        const a = j / 16 * Math.PI * 2 + 0.2, r0 = 10 + 60 * k, r1 = r0 + 18 * (1 - k);
        rx.beginPath(); rx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); rx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); rx.stroke();
      }
      rx.beginPath(); rx.arc(x, y, 8 + 50 * k, 0, Math.PI * 2); rx.stroke();
      rx.restore();
    } else if (f.k === 'tomb') {""")

# ---- 技能栏 / 说明 ----
rep("O 虚化：短位移穿身，\n   敌人出手瞬间虚化 = 完美虚化（时空断裂，O 立刻变瞬狱，用完或断裂结束后冷却 8 秒）；",
    "O 见切：拔刀架势 0.3 秒，\n   架势中被打 = 见切（定格后自动瞬狱，冷却 8 秒；没被打冷却 3 秒，普攻中也能按）；")
rep("躲招靠 O 虚化", "躲招靠 O 见切")
rep("O 虚化（踩准出手再按 O 瞬狱）", "O 见切（架势中被打 = 自动瞬狱）")
rep("      if (KIT_B) return R.witch > 0 && (p.phasePerf || p.cd.o <= 0) ? { label: '狱', cd: 0 } : { label: '虚', cd: clamp(p.cd.o / (p.cd.o > KB.phase.cd ? KB.phase.perfCd : KB.phase.cd), 0, 1) };",
    "      if (KIT_B) return { label: '切', cd: clamp(p.cd.o / (p.cd.o > KB.phase.cd ? KB.phase.perfCd : KB.phase.cd), 0, 1) };")

rep("""!['dash', 'thrust', 'blink', 'storm', 'sheathe', 'transform'].includes(p.st) && Math.floor(R.time * 20) % 2 === 0) return;""", """!['dash', 'thrust', 'blink', 'storm', 'sheathe', 'transform', 'phase'].includes(p.st) && Math.floor(R.time * 20) % 2 === 0) return;   // 见切架势不闪""")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
