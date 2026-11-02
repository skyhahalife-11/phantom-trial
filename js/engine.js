'use strict';

const W = 1280, H = 720, FLOOR = 612;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const view = { scale: 1, ox: 0, oy: 0 };

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const cw = innerWidth, ch = innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  view.scale = Math.min(canvas.width / W, canvas.height / H);
  view.ox = (canvas.width - W * view.scale) / 2;
  view.oy = (canvas.height - H * view.scale) / 2;
}
addEventListener('resize', fit);
fit();

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : 1);

const IMGS = {};
function img(path) {
  if (!IMGS[path]) { const i = new Image(); i.src = 'assets/' + path; IMGS[path] = i; }
  return IMGS[path];
}
const ready = (i) => i && i.complete && i.naturalWidth > 0;
function preload(list) {
  return Promise.all(list.map((p) => new Promise((res) => {
    const i = img(p);
    if (i.complete) res(); else { i.onload = res; i.onerror = res; }
  })));
}

const KEYMAP = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], down: ['KeyS', 'ArrowDown'], attack: ['KeyJ'],
  jump: ['KeyK', 'KeyW', 'ArrowUp'], dodge: ['Space', 'ShiftLeft', 'ShiftRight'],
  s1: ['KeyU', 'Digit1'], s2: ['KeyI', 'Digit2'], s3: ['KeyO', 'Digit3'], s4: ['KeyP', 'Digit4'],
  pause: ['Escape'], confirm: ['Enter'], restart: ['KeyR'],
};
const keys = new Set();
const pressed = new Set();
const pulse = new Set();
const virt = {};
const mouse = { x: 0, y: 0, down: false, clicked: false };

addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  mouse.x = ((e.clientX - r.left) * dpr - view.ox) / view.scale;
  mouse.y = ((e.clientY - r.top) * dpr - view.oy) / view.scale;
}
canvas.addEventListener('mousemove', toLogical);
canvas.addEventListener('mousedown', (e) => { toLogical(e); if (e.button === 0) { mouse.down = true; mouse.clicked = true; pressed.add('Mouse0'); } });
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });

const input = {
  act(n) { return !!virt[n] || (KEYMAP[n] || []).some((c) => keys.has(c)) || (n === 'attack' && mouse.down); },
  hit(n) { return pulse.has(n) || (KEYMAP[n] || []).some((c) => pressed.has(c)) || (n === 'attack' && pressed.has('Mouse0')); },
  endFrame() { pressed.clear(); pulse.clear(); mouse.clicked = false; },
};

function drawText(str, x, y, size, color, align = 'left', stroke = true) {
  ctx.font = uiFont(size);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (stroke) { ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(11,11,18,.95)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawClip(name, idx, x, footY, targetH, flip, alpha = 1, flash = false, rot = 0, scx = 1, scy = 1) {
  const m = ANIMS[name];
  const im = img(`anim/${name}.png`);
  if (!m || !ready(im)) return false;
  const ds = targetH / m.charH;
  const i = clamp(Math.floor(idx) % m.n, 0, m.n - 1);
  const sx = (i % m.cols) * m.fw;
  const sy = Math.floor(i / m.cols) * m.fh;
  ctx.save();
  ctx.translate(x, footY + 3);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.scale(scx, scy);
  ctx.globalAlpha = alpha;
  if (flash) ctx.filter = 'brightness(2.4)';
  ctx.drawImage(im, sx, sy, m.fw, m.fh, -m.anchorX * ds, -m.fh * ds, m.fw * ds, m.fh * ds);
  ctx.restore();
  return true;
}

const KF_FOOT_X = 220, KF_FOOT_Y = 490, KF_SCALE = 0.76;
function drawKF(path, x, footY, flip, alpha = 1, flash = false, rot = 0, scx = 1, scy = 1) {
  const im = img(path);
  if (!ready(im)) return false;
  ctx.save();
  ctx.translate(x, footY + 3);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.scale(scx * KF_SCALE, scy * KF_SCALE);
  ctx.globalAlpha = alpha;
  if (flash) ctx.filter = 'brightness(2.4)';
  ctx.drawImage(im, -KF_FOOT_X, -KF_FOOT_Y);
  ctx.restore();
  return true;
}

function drawSprite(path, x, footY, h, flip, alpha = 1, flash = false, rot = 0, sx = 1, sy = 1) {
  const im = img(path);
  if (!ready(im)) return;
  const w = im.naturalWidth * h / im.naturalHeight;
  ctx.save();
  ctx.translate(x, footY);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.scale(sx, sy);
  ctx.globalAlpha = alpha;
  if (flash) ctx.filter = 'brightness(2.4)';
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
}

let scene = null;
function setScene(s) { scene = s; if (s.enter) s.enter(); }

/* 逻辑高度固定 720。声明 wide 的场景在比 16:9 更宽的屏幕（多数手机）上把逻辑宽度 VW 拉长，不加黑边；
   最多拉到 1280×1.34（约 21:9），再宽才留黑边。其余场景 VW 恒为 1280。 */
let VW = W;
function applyView() {
  if (scene && scene.wide && canvas.width / canvas.height > W / H) {
    view.scale = canvas.height / H;
    VW = Math.min(canvas.width / view.scale, W * 1.34);
  } else {
    view.scale = Math.min(canvas.width / W, canvas.height / H);
    VW = W;
  }
  view.ox = (canvas.width - VW * view.scale) / 2;
  view.oy = (canvas.height - H * view.scale) / 2;
}

const FAST = Math.max(1, Number(params.get('fast')) || 1);
let lastT = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const dt = params.get('bot') ? 1 / 60 : real;
  for (let i = 0; i < FAST; i++) { if (scene) scene.update(dt); }
  input.endFrame();
  applyView();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();   // 裁剪区域会逐帧叠加，必须成对 save/restore，否则一直沿用第一帧的窄区域
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  ctx.beginPath(); ctx.rect(0, 0, VW, H); ctx.clip();
  if (scene) scene.draw();
  if (window.touchUI) touchUI.draw();
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
