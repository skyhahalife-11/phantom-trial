# 眼睛特写改成小碎片：斜切多边形挂在画面上方中间，睁眼后碎成几片飞散；压暗调淡
import io, re
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()
a = s.index('// kit=b 瞬狱开场：画面压暗')
b = s.index('function drawCutin(x0, y0) {')
NEW = r"""// kit=b 瞬狱开场：画面上方中间飞进一块斜切小碎片，里面眼睛 闭 → 睁缝 → 全睁亮瞳（白闪、推镜、红光往右喷、震），然后碎成几片飞散
const EYE_SH = { w: 420, h: 112, pts: [[34, 0], [420, 10], [392, 112], [0, 100]] };
const EYE_C = [210, 56];
const EYE_TRIS = (() => {   // 中心连到每条边，再从边中点切一刀，得到 8 片三角碎片
  const out = [], P = EYE_SH.pts;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], m = [(a[0] + b[0]) / 2 + (i % 2 ? 9 : -7), (a[1] + b[1]) / 2 + (i % 2 ? -5 : 6)];
    out.push([EYE_C, a, m], [EYE_C, m, b]);
  }
  return out;
})();
function paintEye(im, t) {   // 在碎片局部坐标里画眼睛和特效（调用前已裁好形状）
  const W = EYE_SH.w, Hh = EYE_SH.h;
  ctx.fillStyle = '#000'; ctx.fillRect(-20, -20, W + 40, Hh + 40);
  const fi = t < 0.12 ? 0 : t < 0.18 ? 1 : 2;
  const zoom = fi === 2 ? 1 + 0.08 * Math.exp(-(t - 0.18) / 0.05) : 1, sc = W * 1.35 / EYE.fw * zoom;
  const ex = EYE.fw * 0.45, ey = EYE.fh * 0.55;   // 眼睛在原图里的位置，对到碎片中心
  ctx.drawImage(im, fi * EYE.fw, 0, EYE.fw, EYE.fh, W / 2 - ex * sc, Hh / 2 - ey * sc, EYE.fw * sc, EYE.fh * sc);
  if (fi === 2) {
    const g = Math.exp(-(t - 0.18) / 0.08), cx = W / 2, cy = Hh / 2;
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    rg.addColorStop(0, `rgba(255,60,90,${0.7 * g + 0.15})`); rg.addColorStop(1, 'rgba(255,0,40,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 9; i++) {
      const yy = cy - 22 + ((i * 37 + Math.floor(t * 60) * 11) % 44), L = 40 + ((i * 97) % 110);
      ctx.fillStyle = `rgba(255,${40 + i * 8},${70 + i * 5},0.55)`;
      ctx.fillRect(cx + 60 + ((i * 131 + t * 1400) % (W / 2)), yy, L, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (t > 0.16 && t < 0.2) { ctx.fillStyle = `rgba(255,240,245,${1 - (t - 0.16) / 0.04})`; ctx.fillRect(0, 0, W, Hh); }   // 睁开瞬间白闪
}
function drawEye() {
  const t = R.eye.t, im = rImg('hero2/cutin_eye.png');
  if (!ready(im)) return;
  const S = Math.min(1.2, VW / 1280 * 1.1), x0 = VW / 2 - EYE_SH.w * S / 2, y0 = H * 0.13;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (t > 0.2 && t < 0.42) { const a = (1 - (t - 0.2) / 0.22) * 6; ctx.translate(rnd(-a, a), rnd(-a, a)); }
  if (t < 0.48) {
    const k = Math.min(1, t / 0.07), e = 1 - Math.pow(1 - k, 3);   // 从右边斜着飞进来
    ctx.translate(x0 + (1 - e) * 160, y0 - (1 - e) * 20); ctx.rotate(-0.05); ctx.scale(S, S);
    ctx.save(); polyPath(EYE_SH.pts); ctx.clip(); paintEye(im, t);
    if (k < 1) { ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(0, 0, EYE_SH.w, EYE_SH.h); }
    ctx.restore();
    ctx.lineWidth = 5; ctx.strokeStyle = '#0d0a12'; polyPath(EYE_SH.pts); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff2e55'; polyPath(EYE_SH.pts); ctx.stroke();
  } else {   // 碎成几片往外飞、转、淡出
    const k = Math.min(1, (t - 0.48) / 0.14);
    ctx.translate(x0, y0); ctx.rotate(-0.05); ctx.scale(S, S);
    EYE_TRIS.forEach((tri, i) => {
      const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const dx = mx - EYE_C[0], dy = my - EYE_C[1], d = Math.hypot(dx, dy) || 1;
      ctx.save(); ctx.globalAlpha = 1 - k;
      ctx.translate(mx + dx / d * 90 * k, my + dy / d * 60 * k + 40 * k * k); ctx.rotate((i % 2 ? 1 : -1) * 1.6 * k); ctx.translate(-mx, -my);
      polyPath(tri); ctx.save(); ctx.clip(); paintEye(im, 0.47); ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ff2e55'; polyPath(tri); ctx.stroke();
      ctx.restore();
    });
  }
  ctx.restore();
}
"""
s = s[:a] + NEW + s[b:]
old = "rx.fillStyle = `rgba(10,0,4,${0.75 * dk})`;"
assert s.count(old) == 1
s = s.replace(old, "rx.fillStyle = `rgba(10,0,4,${0.45 * dk})`;")
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
