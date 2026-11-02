'use strict';
/* 触屏操作层（布局参考崩坏3）：左侧浮动摇杆；右下大攻击键，闪避贴在左下，跳跃在右上，技能围成一圈；
   右半屏空白处快速一滑 = 朝滑动方向冲刺。
   只把触摸翻译成 virt（按住）和 pulse（按下那一帧），战斗代码不用区分键盘还是触屏。
   当前场景声明 touch: true 才显示按键；其它场景把轻点翻译成鼠标点击。第一次触摸后才开启，电脑上不受影响。 */
(() => {

const SAVE = 'phantom_touch_v1';
const SIZES = [0.85, 1, 1.15], ALPHAS = [0.4, 0.65, 0.9];
const opt = { size: 1, alpha: 1, swipe: true, assist: true };
try { Object.assign(opt, JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) { /* 存档坏了就用默认 */ }
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(opt)); } catch (e) { /* 无痕模式写不了 */ } };

const T = window.touchUI = {
  on: false, menu: false, opt, safe: { l: 0, r: 0 },
  buzz(ms) { if (T.on && navigator.vibrate) navigator.vibrate(ms); },
  draw,
};

const STICK_R = 90, SWIPE_D = 36, SWIPE_T = 0.3;
const touches = new Map();   // identifier → { kind: 'stick'|'btn'|'swipe'|'menu', ... }
const stick = { id: null, bx: 0, by: 0, kx: 0, ky: 0 };
let lastScene = null, triedFull = false;

/* 刘海屏安全区：CSS env() 量出来，扣掉已经是黑边的部分，换成逻辑坐标 */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
document.body.appendChild(probe);
function readSafe() {
  const cs = getComputedStyle(probe), dpr = window.devicePixelRatio || 1;
  T.safe.l = Math.max(0, (parseFloat(cs.paddingLeft) || 0) * dpr - view.ox) / view.scale;
  T.safe.r = Math.max(0, (parseFloat(cs.paddingRight) || 0) * dpr - view.ox) / view.scale;
}

/* 按键布局（逻辑坐标）：以攻击键为圆心，其余按角度排在半径 180 的圆上 */
function buttons() {
  const s = SIZES[opt.size], ax = VW - T.safe.r - 170 * s, ay = H - 135 * s;
  const at = (deg, d = 180) => ({ x: ax + Math.cos(deg * Math.PI / 180) * d * s, y: ay - Math.sin(deg * Math.PI / 180) * d * s });
  return [
    { id: 'attack', x: ax, y: ay, r: 80 * s, label: '斩', big: true },
    { id: 'dodge', ...at(200), r: 58 * s, label: '闪', accent: '#8fd8ff' },
    { id: 'jump', ...at(58), r: 48 * s, label: '跳' },
    { id: 's1', ...at(160), r: 42 * s, label: '刺', lock: true },
    { id: 's2', ...at(132), r: 42 * s, label: '钩', lock: true },
    { id: 's3', ...at(104), r: 42 * s, label: '掘', lock: true },
    { id: 's4', x: ax + 20 * s, y: ay - 285 * s, r: 46 * s, label: '葬', lock: true, accent: '#ff6a6a' },
    { id: 'pause', x: VW - T.safe.r - 46, y: 46, r: 30, label: '返', small: true },
    { id: 'menu', x: VW - T.safe.r - 116, y: 46, r: 30, label: '设', small: true },
  ];
}

function toLogicalXY(t) {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  return { x: ((t.clientX - r.left) * dpr - view.ox) / view.scale, y: ((t.clientY - r.top) * dpr - view.oy) / view.scale };
}
const active = () => T.on && scene && scene.touch;

function releaseAll() {
  for (const k of ['left', 'right', 'down', 'up', 'attack', 'dodge', 'jump', 's1', 's2', 's3', 's4']) virt[k] = false;
  touches.clear(); stick.id = null;
}

function setStick(px, py) {
  let dx = px - stick.bx, dy = py - stick.by;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  stick.kx = dx; stick.ky = dy;
  const nx = dx / STICK_R, ny = dy / STICK_R;
  virt.left = nx < -0.35; virt.right = nx > 0.35;
  virt.down = ny > 0.6; virt.up = ny < -0.6;
}

function onStart(ev) {
  ev.preventDefault();
  T.on = true;
  readSafe();
  for (const t of ev.changedTouches) {
    const p = toLogicalXY(t);
    if (!active()) {   // 非战斗场景：轻点当鼠标点
      mouse.x = p.x; mouse.y = p.y; mouse.down = true; mouse.clicked = true; pressed.add('Mouse0');
      continue;
    }
    if (T.menu) { touches.set(t.identifier, { kind: 'menu' }); menuTap(p); continue; }
    // 按键：判定圈比画出来的大 15%，取最近的一个
    let hit = null, hd = 1e9;
    for (const b of buttons()) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.r * 1.15 && d < hd) { hd = d; hit = b; }
    }
    if (hit) {
      if (hit.id === 'menu') { T.menu = true; releaseAll(); touches.set(t.identifier, { kind: 'menu' }); continue; }
      touches.set(t.identifier, { kind: 'btn', id: hit.id });
      pulse.add(hit.id); virt[hit.id] = true;
      continue;
    }
    pulse.add('tap');
    if (p.x < VW * 0.42 && stick.id === null) {
      stick.id = t.identifier;
      stick.bx = clamp(p.x, T.safe.l + 110, VW * 0.42 - 40);
      stick.by = clamp(p.y, 200, H - 100);
      touches.set(t.identifier, { kind: 'stick' });
      setStick(p.x, p.y);
    } else {
      touches.set(t.identifier, { kind: 'swipe', x0: p.x, y0: p.y, t0: performance.now() / 1000, done: false });
    }
  }
}

function onMove(ev) {
  ev.preventDefault();
  for (const t of ev.changedTouches) {
    const p = toLogicalXY(t);
    if (!active()) { mouse.x = p.x; mouse.y = p.y; continue; }
    const s = touches.get(t.identifier);
    if (!s) continue;
    if (s.kind === 'stick') setStick(p.x, p.y);
    else if (s.kind === 'swipe' && !s.done && opt.swipe) {
      const dx = p.x - s.x0, dy = p.y - s.y0;
      if (performance.now() / 1000 - s.t0 > SWIPE_T) { s.done = true; continue; }
      if (Math.hypot(dx, dy) >= SWIPE_D) {
        s.done = true;
        pulse.add('dodge');
        virt.dodgeDir = Math.abs(dx) > Math.abs(dy) * 0.5 ? sign(dx) : 0;   // 竖着滑就按摇杆/朝向冲
      }
    }
  }
}

function onEnd(ev) {
  ev.preventDefault();
  for (const t of ev.changedTouches) {
    if (!active()) { mouse.down = false; continue; }
    const s = touches.get(t.identifier);
    touches.delete(t.identifier);
    if (!s) continue;
    if (s.kind === 'stick') { stick.id = null; virt.left = virt.right = virt.down = virt.up = false; }
    else if (s.kind === 'btn' && ![...touches.values()].some((o) => o.kind === 'btn' && o.id === s.id)) virt[s.id] = false;
  }
  // 浏览器要求全屏必须在用户手势里请求；只自动试一次，之后从设置里手动进
  if (!triedFull) { triedFull = true; goFull(); }
}

function goFull() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement) return;
  Promise.resolve(req.call(el)).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
}

canvas.addEventListener('touchstart', onStart, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onEnd, { passive: false });
canvas.addEventListener('touchcancel', onEnd, { passive: false });

/* ---------- 设置面板 ---------- */
const ROWS = [
  { k: 'size', name: '按键大小', vals: ['小', '中', '大'] },
  { k: 'alpha', name: '按键透明度', vals: ['淡', '中', '浓'] },
  { k: 'swipe', name: '右侧滑动闪避', vals: ['关', '开'] },
  { k: 'assist', name: '完美闪避辅助', vals: ['关', '开'], tip: '判定窗口放宽约 1.5 倍' },
  { k: 'full', name: '全屏', vals: ['进入全屏'] },
  { k: 'close', name: '', vals: ['返回游戏'] },
];
const ROW_W = 560, ROW_H = 68;
const rowY = (i) => H / 2 - (ROWS.length * ROW_H) / 2 + i * ROW_H + 20;

function menuTap(p) {
  ROWS.forEach((row, i) => {
    const y = rowY(i);
    if (Math.abs(p.x - VW / 2) > ROW_W / 2 || p.y < y || p.y > y + ROW_H - 8) return;
    if (row.k === 'close') T.menu = false;
    else if (row.k === 'full') goFull();
    else if (typeof opt[row.k] === 'boolean') opt[row.k] = !opt[row.k];
    else opt[row.k] = (opt[row.k] + 1) % row.vals.length;
    save();
  });
}

function rowVal(row) {
  if (row.k === 'full' || row.k === 'close') return row.vals[0];
  return typeof opt[row.k] === 'boolean' ? row.vals[opt[row.k] ? 1 : 0] : row.vals[opt[row.k]];
}

/* ---------- 绘制 ---------- */
function draw() {
  if (scene !== lastScene) { lastScene = scene; releaseAll(); T.menu = false; }
  if (!T.on) return;
  if (innerHeight > innerWidth) {   // 竖屏提示
    ctx.fillStyle = '#000'; ctx.fillRect(-4000, -4000, 9000, 9000);
    drawText('请把手机横过来', VW / 2, H / 2, 48, '#f0e6f6', 'center');
    return;
  }
  if (!scene || !scene.touch) return;
  const a = ALPHAS[opt.alpha];
  ctx.save();
  ctx.lineWidth = 3;
  // 摇杆：没按时在默认位置画一个淡的，提示这里可以按
  const bx = stick.id !== null ? stick.bx : T.safe.l + 190, by = stick.id !== null ? stick.by : H - 170;
  ctx.globalAlpha = a * (stick.id !== null ? 1 : 0.5);
  ctx.fillStyle = 'rgba(20,16,30,.45)'; ctx.strokeStyle = 'rgba(240,230,250,.55)';
  ctx.beginPath(); ctx.arc(bx, by, STICK_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(240,230,250,.6)';
  ctx.beginPath(); ctx.arc(bx + (stick.id !== null ? stick.kx : 0), by + (stick.id !== null ? stick.ky : 0), 38, 0, Math.PI * 2); ctx.fill();
  // 按键
  const held = new Set([...touches.values()].filter((o) => o.kind === 'btn').map((o) => o.id));
  for (const b of buttons()) {
    const on = held.has(b.id);
    ctx.globalAlpha = a * (b.lock ? 0.45 : 1);
    ctx.fillStyle = on ? 'rgba(240,230,250,.45)' : 'rgba(20,16,30,.5)';
    ctx.strokeStyle = b.accent || 'rgba(240,230,250,.6)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (on ? 0.94 : 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const fs = b.big ? 48 : b.small ? 24 : 36;
    drawText(b.label, b.x, b.y + fs * 0.36, fs, b.accent || '#f0e6f6', 'center');
  }
  ctx.restore();
  if (T.menu) drawMenu();
}

function drawMenu() {
  ctx.fillStyle = 'rgba(8,6,14,.82)'; ctx.fillRect(0, 0, VW, H);
  drawText('操作设置', VW / 2, rowY(0) - 30, 36, '#f0e6f6', 'center');
  ROWS.forEach((row, i) => {
    const y = rowY(i), x0 = VW / 2 - ROW_W / 2;
    ctx.fillStyle = row.k === 'close' ? '#3a2d52' : '#211c2b'; ctx.fillRect(x0, y, ROW_W, ROW_H - 8);
    ctx.strokeStyle = '#4a3f5e'; ctx.lineWidth = 2; ctx.strokeRect(x0, y, ROW_W, ROW_H - 8);
    if (row.name) {
      drawText(row.name, x0 + 24, y + 40, 24, '#e8e2f0', 'left', false);
      if (row.tip) drawText(row.tip, x0 + 200, y + 40, 24, '#8a80a0', 'left', false);
      drawText(rowVal(row), x0 + ROW_W - 24, y + 40, 24, '#ffd27a', 'right', false);
    } else drawText(rowVal(row), VW / 2, y + 40, 24, '#f0e6f6', 'center', false);
  });
}

})();
