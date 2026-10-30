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
