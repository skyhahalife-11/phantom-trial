'use strict';
/* 像素界面皮肤：字体、面板、图标、血条等公共绘制函数 */

const UI = {
  c: { bg: '#14141C', panel: '#1C1C28', edge: '#3A3A52', ink: '#0B0B12', accent: '#FFB347', mut: '#8D93A8', txt: '#E6E8F0', danger: '#FF5A4A', heal: '#7DFF9A' },
  Q: ['#CFD8E6', '#5AA9FF', '#B36BFF', '#FFD23A', '#4FE3D0'],
  QG: ['rgba(207,216,230,.25)', 'rgba(90,169,255,.32)', 'rgba(179,107,255,.35)', 'rgba(255,210,58,.38)', 'rgba(79,227,208,.35)'],
};

/* ---------- 图标：SVG 剪影 → 降采样 → 阈值化 → 按品质染色 → 描边 ---------- */
const ICON_IMG = {};
const ICON_CACHE = {};
function loadIcons() {
  return Promise.all(Object.keys(ICON_PATHS).map((n) => new Promise((res) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' + ICON_PATHS[n].map((d) => `<path fill="#fff" d="${d}"/>`).join('') + '</svg>';
    const im = new Image();
    im.onload = () => { ICON_IMG[n] = im; res(); };
    im.onerror = res;
    im.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  })));
}
function hex3(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function pixelIcon(name, color, n = 32) {
  const key = `${name}|${color}|${n}`;
  if (ICON_CACHE[key]) return ICON_CACHE[key];
  const im = ICON_IMG[name];
  if (!im) return null;
  const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n;
  const t = tmp.getContext('2d'); t.imageSmoothingQuality = 'high'; t.drawImage(im, 0, 0, n, n);
  const src = t.getImageData(0, 0, n, n).data;
  const w = n + 2;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = w;
  const c = cv.getContext('2d');
  const out = c.createImageData(w, w);
  const col = hex3(color);
  const on = (x, y) => x >= 0 && y >= 0 && x < n && y < n && src[(y * n + x) * 4 + 3] > 120;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - 1, sy = y - 1, i = (y * w + x) * 4;
      if (on(sx, sy)) {
        const k = sy / n, m = k < 0.5 ? (0.5 - k) * 0.5 : -(k - 0.5) * 0.45;
        const f = (v) => Math.max(0, Math.min(255, m > 0 ? v + (255 - v) * m : v * (1 + m)));
        out.data[i] = f(col[0]); out.data[i + 1] = f(col[1]); out.data[i + 2] = f(col[2]); out.data[i + 3] = 255;
      } else if (on(sx - 1, sy) || on(sx + 1, sy) || on(sx, sy - 1) || on(sx, sy + 1)) {
        out.data[i] = 11; out.data[i + 1] = 11; out.data[i + 2] = 18; out.data[i + 3] = 255;
      }
    }
  }
  c.putImageData(out, 0, 0);
  ICON_CACHE[key] = cv;
  return cv;
}
/* 以 (cx, cy) 为中心绘制图标，scale 为整数倍放大 */
function drawIcon(name, q, cx, cy, scale = 2, n = 32, alpha = 1) {
  const cv = pixelIcon(name, typeof q === 'number' ? UI.Q[q] : q, n);
  if (!cv) return;
  const w = cv.width * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(cv, Math.round(cx - w / 2), Math.round(cy - w / 2), w, w);
  ctx.restore();
}

/* ---------- 文字：Fusion Pixel 只在 12 的整数倍下清晰 ---------- */
function snapSize(s) { return s <= 28 ? 24 : s <= 42 ? 36 : 48; }
function uiFont(size) { return `${snapSize(size)}px FP, "Microsoft YaHei", sans-serif`; }
function wrapText(str, maxW, size = 24) {
  ctx.font = uiFont(size);
  const lines = [];
  let cur = '';
  for (const ch of str) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
function textW(str, size = 24) { ctx.font = uiFont(size); return ctx.measureText(str).width; }

/* ---------- 面板、血条、按钮 ---------- */
function pxPanel(x, y, w, h, o = {}) {
  const edge = o.edge || UI.c.edge;
  ctx.save();
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 22; }
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.restore();
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = o.fill || UI.c.panel; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 4, y + 4, w - 8, 4);
}
function pxCorners(x, y, w, h, color) {
  ctx.fillStyle = color;
  for (const [cx, cy] of [[x - 4, y - 4], [x + w - 12, y - 4], [x - 4, y + h - 12], [x + w - 12, y + h - 12]]) ctx.fillRect(cx, cy, 16, 16);
}
function pxText(str, x, y, size, color, align = 'left') { drawText(str, x, y, size, color, align); }

const RANK = [
  { k: 'S', min: 0.9, color: '#FFD23A' },
  { k: 'A', min: 0.5, color: '#5AA9FF' },
  { k: 'B', min: 0.25, color: '#CFD8E6' },
  { k: 'C', min: 0, color: '#FF5A4A' },
];
function rankOf(pct) { return RANK.find((r) => pct >= r.min - 1e-9) || RANK[3]; }

function drawHpBar(x, y, w, h, hp, maxHp, shield = 0, ticks = false) {
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#2b1217'; ctx.fillRect(x, y, w, h);
  const f = clamp(hp / maxHp, 0, 1);
  ctx.fillStyle = '#d8433a'; ctx.fillRect(x, y, Math.round(w * f), h);
  ctx.fillStyle = '#ff6b5e'; ctx.fillRect(x, y, Math.round(w * f), Math.round(h * 0.4));
  if (shield > 0) { ctx.fillStyle = 'rgba(122,184,255,.95)'; ctx.fillRect(x, y, Math.round(w * clamp(shield / maxHp, 0, 1)), 6); }
  if (ticks) {
    for (const [pct, c] of [[0.9, RANK[0].color], [0.5, RANK[1].color], [0.25, RANK[2].color]]) {
      ctx.fillStyle = UI.c.ink; ctx.fillRect(Math.round(x + w * pct) - 2, y - 4, 4, h + 8);
    }
    const mid = [[0.95, 'S', RANK[0].color], [0.7, 'A', RANK[1].color], [0.375, 'B', RANK[2].color], [0.125, 'C', RANK[3].color]];
    for (const [pct, k, c] of mid) drawText(k, x + w * pct, y - 8, 24, c, 'center');
  }
  drawText(`${Math.ceil(hp)} / ${maxHp}`, x + w / 2, y + h - 5, 24, '#fff', 'center');
}

const inRect = (x, y, w, h) => mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
/* 即时模式按钮：返回 {hover, click} */
function pxButton(x, y, w, h, label, o = {}) {
  const hover = !o.disabled && inRect(x, y, w, h);
  const edge = o.disabled ? '#2a2a38' : hover ? UI.c.accent : (o.edge || UI.c.edge);
  pxPanel(x, y, w, h, { edge, fill: hover ? '#26263a' : UI.c.panel });
  drawText(label, x + w / 2, y + h / 2 + 8, 24, o.disabled ? '#5a5f70' : hover ? UI.c.accent : (o.color || UI.c.txt), 'center');
  return { hover, click: hover && mouse.clicked };
}

/* ======== 流程界面公共视觉：月夜墓园背景、粒子、火花、金色数字 ======== */
const nowS = () => performance.now() / 1000;
const EMBERS = Array.from({ length: 38 }, (_, i) => ({ x: (i * 211.7) % 1280, v: 9 + (i % 6) * 4, p: (i * 67) % 760, s: i % 5 === 0 ? 4 : 2, c: i % 3 === 0 ? '255,214,90' : i % 3 === 1 ? '255,120,170' : '150,200,255', ph: i * 1.7 }));
let VIGNETTE = null;
function vignetteCanvas() {
  if (VIGNETTE) return VIGNETTE;
  VIGNETTE = document.createElement('canvas'); VIGNETTE.width = W; VIGNETTE.height = H;
  const g = VIGNETTE.getContext('2d');
  const r = g.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.5, W * 0.72);
  r.addColorStop(0, 'rgba(8,4,20,0)'); r.addColorStop(1, 'rgba(4,2,12,0.78)');
  g.fillStyle = r; g.fillRect(0, 0, W, H);
  const b = g.createLinearGradient(0, H * 0.7, 0, H);
  b.addColorStop(0, 'rgba(4,2,12,0)'); b.addColorStop(1, 'rgba(4,2,12,0.6)');
  g.fillStyle = b; g.fillRect(0, H * 0.7, W, H * 0.3);
  return VIGNETTE;
}
function drawBackdrop(dim = 0.72) {
  const t = nowS();
  ctx.fillStyle = '#0b0618'; ctx.fillRect(0, 0, W, H);
  const bg = img('gv/cemetery/background.png'), mt = img('gv/cemetery/mountains.png');
  ctx.imageSmoothingEnabled = false;
  if (ready(bg)) ctx.drawImage(bg, 0, -14, 1280, 747);
  const mo = ctx.createRadialGradient(W / 2, 250, 20, W / 2, 250, 420);   // 粉红月光晕
  mo.addColorStop(0, 'rgba(255,90,170,.32)'); mo.addColorStop(1, 'rgba(255,90,170,0)');
  ctx.fillStyle = mo; ctx.fillRect(0, 0, W, H);
  if (ready(mt)) { ctx.globalAlpha = 0.85; for (let i = -1; i < 3; i++) ctx.drawImage(mt, i * 480 - (t * 3) % 480, H - 400, 480, 447); ctx.globalAlpha = 1; }
  ctx.fillStyle = `rgba(10,5,24,${Math.max(0.18, dim - 0.4)})`; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(vignetteCanvas(), 0, 0);
  for (const e of EMBERS) {   // 缓慢上飘的魂火与灰烬
    const y = H + 20 - ((t * e.v + e.p) % (H + 40)), x = e.x + Math.sin(t * 0.6 + e.ph) * 18;
    ctx.fillStyle = `rgba(${e.c},${0.22 + 0.2 * Math.sin(t * 2 + e.ph)})`; ctx.fillRect(Math.round(x), Math.round(y), e.s, e.s);
  }
}
const SPARKS = [];
function sparkBurst(x, y, n, col = '255,214,90', speed = 420) {
  const t = nowS();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    SPARKS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t0: t, life: 0.5 + Math.random() * 0.5, col, s: Math.random() < 0.3 ? 6 : 4 });
  }
  while (SPARKS.length > 60) SPARKS.shift();
}
function drawSparks() {
  const t = nowS();
  for (let i = SPARKS.length - 1; i >= 0; i--) {
    const s = SPARKS[i], a = t - s.t0;
    if (a > s.life) { SPARKS.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(${s.col},${1 - a / s.life})`;
    ctx.fillRect(Math.round(s.x + s.vx * a), Math.round(s.y + s.vy * a + 700 * a * a), s.s, s.s);
  }
}
/* 说明文字：数字与百分比用金色高亮，逐行居中 */
const HI_RE = /([+\-×]?\d+(?:\.\d+)?(?:%|\s?秒|\s?格|\s?层|\s?像素)?)/g;
function richLine(str, cx, y, size, col, hi = '#FFD23A') {
  const parts = str.split(HI_RE).filter((s) => s !== '');
  let tot = 0; const ws = parts.map((p) => { const w = textW(p, size); tot += w; return w; });
  let x = cx - tot / 2;
  parts.forEach((p, i) => { drawText(p, x, y, size, /\d/.test(p) ? hi : col, 'left', false); x += ws[i]; });
}
/* 小标签：品质色底 + 深色字；返回宽度 */
function tagChip(str, x, y, col, filled = true, h = 30) {
  const w = textW(str, 24) + 16;
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  if (!filled) { ctx.fillStyle = '#150f22'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4); }
  drawText(str, x + 8, y + h - 6, 24, filled ? '#150f22' : col, 'left', false);
  return w + 8;
}
/* 装饰分隔线：中间一个菱形 */
function ornament(cx, y, half, col) {
  ctx.fillStyle = col;
  ctx.fillRect(cx - half, y, half - 14, 2); ctx.fillRect(cx + 14, y, half - 14, 2);
  ctx.save(); ctx.translate(cx, y + 1); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  ctx.fillRect(cx - half - 6, y - 3, 6, 8); ctx.fillRect(cx + half, y - 3, 6, 8);
}
/* 统一按钮：primary 为金色强调 */
function fancyBtn(x, y, w, h, label, primary) {
  const hover = inRect(x, y, w, h), t = nowS();
  const edge = primary ? (hover ? '#fff2b0' : '#FFB347') : hover ? '#c8c0e0' : '#4a4062';
  ctx.save(); if (primary) { ctx.shadowColor = `rgba(255,179,71,${hover ? 0.8 : 0.4 + 0.15 * Math.sin(t * 3)})`; ctx.shadowBlur = 22; }
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.restore();
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = primary ? (hover ? '#4a3414' : '#2e2010') : hover ? '#2a2240' : '#1a1428'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x + 4, y + 4, w - 8, (h - 8) / 2);
  drawText(label, x + w / 2, y + h / 2 + 8, 24, primary ? '#FFD98A' : '#d8d0ec', 'center');
}
