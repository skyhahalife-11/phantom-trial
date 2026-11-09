# kit=b 瞬狱华丽化：眼睛特写过场 → 酒红穿梭斩（刀弧 / 拖线 / 残影 / X 刀口）→ 收刀停 0.3 秒全部刀口一起炸 + 全屏斩线 + 慢动作
# 只改 kit=b 的普通瞬狱（s.kb），原版瞬狱和血狱不变
import io, shutil
P = r'D:/workspace/trial/js/room.js'
shutil.copy(P, r'D:/workspace/trial/raw/tmp/room.before_storm.js')
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:90])
    s = s.replace(old, new)

# kit=b 不出「时空断裂」横幅
rep("R.witch = WITCH_T + mv('pdSlow'); R.banner = 1.2;", "R.witch = WITCH_T + mv('pdSlow'); R.banner = KIT_B ? 0 : 1.2;")

# 开场：眼睛特写，期间全场定格
rep("""  p.storm = { list, i: 0, t: 0, red, cages: [], w0: R.witch };
  snd('storm', red ? { rate: 0.8 } : undefined);
  setSt(p, 'storm'); p.inv = 9; p.vx = 0; p.vy = 0;
  if (R.blade) R.blade = null;
  R.flash = 0.12; if (red) R.flashCol = '255,60,70';
  say(red ? '血狱' : '瞬狱', red ? '#ff6a6a' : '#8fd8ff');""",
"""  const kb = KIT_B && !red;   // kit=b：酒红版瞬狱
  p.storm = { list, i: 0, t: 0, red, cages: [], w0: R.witch, kb };
  snd('storm', red ? { rate: 0.8 } : undefined);
  setSt(p, 'storm'); p.inv = 9; p.vx = 0; p.vy = 0;
  if (R.blade) R.blade = null;
  if (kb) { R.eye = { t: 0 }; R.stop = Math.max(R.stop, EYE.t); return true; }   // 先放眼睛特写，全场定格
  R.flash = 0.12; if (red) R.flashCol = '255,60,70';
  say(red ? '血狱' : '瞬狱', red ? '#ff6a6a' : '#8fd8ff');""")

# 穿梭斩
rep("""    const nx = clamp(e.x + (s.i % 2 ? -22 : 22), 10, ROOM.w - 10);
    afterImage(p);
    R.fx.push({ k: 'line', x: p.x, y: p.y - 20, x1: nx, y1: e.y - 20, t: 0 });
    p.x = nx; p.y = e.y; p.face = sign(e.x - p.x) || p.face;""",
"""    const nx = clamp(e.x + (s.i % 2 ? -22 : 22), 10, ROOM.w - 10);
    afterImage(p);
    if (s.kb) {   // 酒红残影 + 拖线
      R.fx[R.fx.length - 1].red = true;
      R.fx.push({ k: 'kslash', x: p.x, y: p.y - 20, x1: nx, y1: e.y - 20, t: 0, life: 0.3 });
    } else R.fx.push({ k: 'line', x: p.x, y: p.y - 20, x1: nx, y1: e.y - 20, t: 0 });
    p.x = nx; p.y = e.y; p.face = sign(e.x - p.x) || p.face;
    if (s.kb) {   // 每到一只：一道大号酒红刀弧（上撩 / 下劈交替）+ 火星
      const up = s.i % 2;
      R.fx.push({ k: 'karc', x: e.x, y: e.y, face: p.face, dx: 0, dy: -20, rx: 34, ry: 30, a0: up ? 1.9 : -2.4, a1: up ? -1.4 : 0.9, t: 0, life: 0.26, big: true });
      R.fx.push({ k: 'kspark', x: e.x, y: e.y - 20, t: 0, life: 0.4, ps: sparkSet(p.face, 8, '#ff2e55', 60, 200).concat(sparkSet(p.face, 4, '#ffe0e6', 80, 240)) });
      snd('atk3', { rate: 1.1 + 0.1 * (s.i % 3) });
    }""")
rep("""      c.red = s.red; c.mk = !!mv('stormMark');""",
"""      c.red = s.red; c.mk = !!mv('stormMark');
      if (s.kb) { c.kb = true; c.lines[0].a = [-0.75, 0.75, 0.1][k % 3]; c.lines[0].l = 30; }   // 酒红 X 刀口（第 3 道横着）""")

# 收刀：停 KBOOM 秒后全部刀口一起炸
rep("""    for (const c of R.cuts) if (c.wait) { c.wait = false; c.t = 0; c.delay = 0.1 + (k++ % SK.o.stormCuts) * 0.06; }
    s.cages.forEach(releaseFx);
    p.inv = p.form === 'blood' ? p.inv : 0.4; p.storm = null;
    R.witch = !s.red && mv('stormKeep') ? Math.max(0.3, s.w0 * 0.5) : Math.min(R.witch, 0.3); R.stop = 0.08; R.shake = 5;""",
"""    let first = true;
    for (const c of R.cuts) if (c.wait) {
      c.wait = false; c.t = 0; c.delay = c.kb ? KBOOM : 0.1 + (k++ % SK.o.stormCuts) * 0.06;
      if (c.kb && first) { c.boom = true; first = false; }   // 第一道负责全屏演出
    }
    s.cages.forEach(releaseFx);
    p.inv = p.form === 'blood' ? p.inv : 0.4; p.storm = null;
    R.witch = !s.red && mv('stormKeep') ? Math.max(0.3, s.w0 * 0.5) : Math.min(R.witch, 0.3);
    if (s.kb) { R.stop = 0.05; R.shake = 2; R.fx.push({ k: 'kboom', x: p.x, y: p.y, t: 0, delay: KBOOM, life: 0.5 }); }   // 收刀那一下静，KBOOM 秒后炸
    else { R.stop = 0.08; R.shake = 5; }""")
rep("// O 瞬狱（时空断裂中）",
"""const KBOOM = 0.3;   // kit=b 瞬狱：收刀后停多久刀口才一起炸
const EYE = { t: 0.55, fw: 768, fh: 162 };   // kit=b 瞬狱开场眼睛特写：闭眼 → 睁缝 → 全睁
// O 瞬狱（时空断裂中）""")

# 刀口爆开：kit=b 用贯穿闪光 + 酒红爆点；第一道带全屏震 / 慢动作
rep("""    c.done = true; snd('iaiCut');
    const col = c.red ? 'blood' : 'soul';""",
"""    c.done = true;
    if (c.kb) {
      for (const ln of c.lines) vfx('u_pierce', c.x + ln.dx, c.y + ln.dy, { rot: ln.a, flip: Math.random() < 0.5 });
      if (c.big) { vfx('b_hit', c.x, c.y - 4); R.fx.push({ k: 'kspark', x: c.x, y: c.y, t: 0, life: 0.5, ps: sparkSet(1, 8, '#ff2e55', 80, 260).concat(sparkSet(-1, 8, '#ffe0e6', 80, 260)) }); }
      if (c.boom) { snd('iaiCut'); snd('atk2', { rate: 0.7 }); R.shake = 8; R.slowT = 0.3; R.flash = 0.15; R.flashCol = '255,240,245'; buzz(120); }
      if (c.e) strike(c.e, c.dmg, { skill: 'o', stun: SK.o.stun, mark: c.mk ? SK.u.mark : 0 });
      continue;
    }
    snd('iaiCut');
    const col = c.red ? 'blood' : 'soul';""")

# 等待中的刀口：kit=b 画成发光的酒红刀痕
rep("""      if (post < 0) {
        rx.strokeStyle = c.red""",
"""      if (c.kb && post < 0) {
        rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineCap = 'round';
        for (const [col, w] of [['200,20,60', 4], ['255,235,240', 1]]) {
          rx.strokeStyle = `rgba(${col},${0.5 + 0.5 * pre})`; rx.lineWidth = w;
          rx.beginPath(); rx.moveTo(px - ax, py - ay); rx.lineTo(px + ax, py + ay); rx.stroke();
        }
        rx.restore(); continue;
      }
      if (post < 0) {
        rx.strokeStyle = c.red""")

# 新特效：穿梭拖线、收刀全屏斩线
rep("""    } else if (f.k === 'line') {   // 瞬身 / 瞬狱穿梭的一道白光""",
"""    } else if (f.k === 'kslash') {   // kit=b 瞬狱穿梭：酒红刀光拖线
      const k = f.t / f.life; if (k >= 1) continue;
      const x1 = Math.round(f.x1 - cx), y1 = Math.round(f.y1 - cy);
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineCap = 'round';
      for (const [col, w] of [['200,20,60', 7], ['255,60,100', 3], ['255,240,245', 1]]) {
        rx.strokeStyle = `rgba(${col},${1 - k})`; rx.lineWidth = w * (1 - k * 0.5);
        rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x1, y1); rx.stroke();
      }
      rx.restore();
    } else if (f.k === 'kboom') {   // kit=b 瞬狱收尾：一道白线斜着劈开画面，裂口张开再合上，白转红
      const ft = f.t - (f.delay || 0); if (ft < 0) continue;
      const k = ft / f.life; if (k >= 1) continue;
      const L = RB_W, rev = Math.min(1, k / 0.12), gap = k < 0.12 ? 0 : 14 * Math.sin(Math.min(1, (k - 0.12) / 0.5) * Math.PI), al = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (k > 0.1) { rx.fillStyle = `rgba(150,0,25,${0.3 * (1 - k)})`; rx.fillRect(0, 0, RB_W, RB_H); }
      rx.save(); rx.translate(RB_W / 2, RB_H * 0.45); rx.rotate(-0.18); rx.globalCompositeOperation = 'lighter';
      rx.fillStyle = `rgba(255,40,80,${0.45 * al})`; rx.fillRect(-L, -gap - 3, 2 * L * rev, gap * 2 + 6);
      rx.fillStyle = `rgba(255,245,248,${al})`;
      if (gap < 4) rx.fillRect(-L, -2, 2 * L * rev, 4); else { rx.fillRect(-L, -gap - 1, 2 * L, 2); rx.fillRect(-L, gap - 1, 2 * L, 2); }
      rx.restore();
    } else if (f.k === 'line') {   // 瞬身 / 瞬狱穿梭的一道白光""")

# 眼睛特写（屏幕层）
rep("function drawCutin(x0, y0) {",
"""// kit=b 瞬狱开场：画面压暗，中间展开一条横幅：闭眼 → 睁缝 → 全睁亮瞳（白闪、推镜、红光往右喷、震）→ 收成一道斩线
function drawEye() {
  const t = R.eye.t, im = rImg('hero2/cutin_eye.png'), W = VW, cy = H * 0.42, h = W * EYE.fh / EYE.fw * 0.82;
  ctx.save();
  if (t > 0.2 && t < 0.42) { const a = (1 - (t - 0.2) / 0.22) * 8; ctx.translate(rnd(-a, a), rnd(-a, a)); }
  const k = t < 0.06 ? t / 0.06 : t < 0.48 ? 1 : Math.max(0, 1 - (t - 0.48) / 0.07), hh = h * k;
  if (hh > 1 && ready(im)) {
    const fi = t < 0.12 ? 0 : t < 0.18 ? 1 : 2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, cy - hh / 2, W, hh); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(0, cy - hh / 2, W, hh);
    const zoom = fi === 2 ? 1 + 0.06 * Math.exp(-(t - 0.18) / 0.05) : 1, dw = W * zoom, dh = dw * EYE.fh / EYE.fw, x0 = (W - dw) / 2, y0 = cy - dh / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, fi * EYE.fw, 0, EYE.fw, EYE.fh, x0, y0, dw, dh);
    if (fi === 2) {   // 瞳孔亮起：红光 + 往右喷的速度线
      const ex = x0 + dw * 0.45, ey = y0 + dh * 0.55, g = Math.exp(-(t - 0.18) / 0.08);
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, W * 0.17);
      rg.addColorStop(0, `rgba(255,60,90,${0.7 * g + 0.15})`); rg.addColorStop(1, 'rgba(255,0,40,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, cy - hh / 2, W, hh);
      for (let i = 0; i < 12; i++) {
        const yy = ey - 30 + ((i * 37 + Math.floor(t * 60) * 11) % 60), L = 60 + ((i * 97) % 180);
        ctx.fillStyle = `rgba(255,${40 + i * 8},${70 + i * 5},0.55)`;
        ctx.fillRect(ex + W * 0.08 + ((i * 131 + t * 1800) % (W - ex)), yy, L, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (t > 0.16 && t < 0.2) { ctx.fillStyle = `rgba(255,240,245,${1 - (t - 0.16) / 0.04})`; ctx.fillRect(0, cy - hh / 2, W, hh); }   // 睁开瞬间白闪
    ctx.restore();
    ctx.fillStyle = '#ff2e55'; ctx.fillRect(0, cy - hh / 2 - 4, W, 4); ctx.fillRect(0, cy + hh / 2, W, 4);
  } else if (t >= EYE.t) {   // 收成白色斩线横贯全屏
    const u = Math.min(1, (t - EYE.t) / 0.1);
    ctx.fillStyle = `rgba(255,46,85,${0.6 * (1 - u)})`; ctx.fillRect(0, cy - 10, W, 20);
    ctx.fillStyle = `rgba(255,250,250,${1 - u})`; ctx.fillRect(0, cy - 3, W, 6);
  }
  ctx.restore();
}
function drawCutin(x0, y0) {""")
rep("""    drawCutin(8 + sl, H - Math.round(CUTIN.h * CUTIN.s) + 2);   // 贴着左下角最底边，少挡战斗画面""",
"""    drawCutin(8 + sl, H - Math.round(CUTIN.h * CUTIN.s) + 2);   // 贴着左下角最底边，少挡战斗画面
    if (R.eye) drawEye();""")
# 特写期间画面压暗
rep("""    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rbuf, 0, 0, RB_W, RB_H, 0, 0, RB_W * RB_S, H);""",
"""    if (R.eye) { const t = R.eye.t, dk = t < 0.06 ? t / 0.06 : t < EYE.t ? 1 : Math.max(0, 1 - (t - EYE.t) / 0.1); rx.fillStyle = `rgba(10,0,4,${0.75 * dk})`; rx.fillRect(0, 0, RB_W, RB_H); }   // 眼睛特写：压暗
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rbuf, 0, 0, RB_W, RB_H, 0, 0, RB_W * RB_S, H);""")
rep("""    if (R.cutin && !R.cutin.freeze) R.cutin.t += dt;   // freeze：截图调试用，定格在某一刻""",
"""    if (R.cutin && !R.cutin.freeze) R.cutin.t += dt;   // freeze：截图调试用，定格在某一刻
    if (R.eye && !R.eye.freeze && (R.eye.t += dt) >= EYE.t + 0.1) R.eye = null;""")
rep("R.msg = null; R.cutin = null;", "R.msg = null; R.cutin = null; R.eye = null;")
rep("...Object.keys(VFX).map((n) => `vfx/${n}.png`), 'hero2/cutin_laugh.png']);",
    "...Object.keys(VFX).map((n) => `vfx/${n}.png`), 'hero2/cutin_laugh.png', 'hero2/cutin_eye.png']);")
# 穿梭中的主角帧：kit=b 用拖影帧
rep("    case 'storm': return blood ? ['t_sweep', 1 + (Math.floor(p.t * 20) % 2)] : ['blink', 0];",
    "    case 'storm': return blood ? ['t_sweep', 1 + (Math.floor(p.t * 20) % 2)] : KIT_B ? ['b_k12', p.storm && p.storm.i % 2 ? 4 : 1] : ['blink', 0];")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
