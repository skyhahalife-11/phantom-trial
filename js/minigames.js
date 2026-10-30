'use strict';
/* 小游戏：劈木桩 / 躲弹幕 / 翻牌记忆。结束时调用 onDone('good'|'ok'|'fail')，奖励由调用方发放。 */

const GRADE_NAME = { good: '优秀', ok: '良好', fail: '失败' };
const GRADE_COL = { good: '#FFD23A', ok: '#5AA9FF', fail: '#FF5A4A' };

/* 三个小游戏共用的流程：规则页 → 游戏 → 结果页 */
function miniScene(cfg, onDone) {
  return Object.assign({
    enter() { this.phase = 'rule'; this.t = 0; this.out = false; this.grade = null; if (this.init) this.init(); },
    finish(g) { if (this.phase === 'play') { this.grade = g; this.phase = 'result'; this.t = 0; } },
    close() { if (this.out) return; this.out = true; onDone(this.grade || 'fail'); },
    update(dt) {
      this.t += dt;
      if (this.phase === 'rule') {
        if (bot.on ? this.t > 0.1 : this.t > 0.3 && (input.hit('confirm') || mouse.clicked)) { this.phase = 'play'; this.t = 0; if (this.start) this.start(); }
      } else if (this.phase === 'play') {
        if (bot.on) { if (this.t > 0.3) this.finish(['good', 'ok', 'fail'][Math.floor(Math.random() * 3)]); return; }
        this.tick(dt);
      } else if (bot.on ? this.t > 0.1 : this.t > 0.5 && (input.hit('confirm') || mouse.clicked)) this.close();
      if (this.parts) { for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; } this.parts = this.parts.filter((p) => p.life > 0); }
    },
    draw() {
      drawBackdrop(0.82);
      if (this.phase === 'rule') {
        drawText(cfg.title, W / 2, 200, 48, '#fff', 'center');
        pxPanel(260, 250, 760, 190);
        cfg.rules.forEach((ln, i) => drawText(ln, W / 2, 310 + i * 44, 24, UI.c.txt, 'center', false));
        if (this.t > 0.3) drawText('Enter / 点击 开始', W / 2, 520, 24, UI.c.accent, 'center');
        return;
      }
      this.drawGame();
      if (this.phase === 'result') {
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H);
        pxPanel(380, 220, 520, 260, { edge: GRADE_COL[this.grade] });
        drawText(cfg.title, W / 2, 280, 36, '#fff', 'center');
        drawText(`成绩：${GRADE_NAME[this.grade]}`, W / 2, 370, 48, GRADE_COL[this.grade], 'center');
        if (this.detail) drawText(this.detail(), W / 2, 420, 24, UI.c.mut, 'center', false);
        if (this.t > 0.5) drawText('Enter / 点击 继续', W / 2, 520, 24, UI.c.accent, 'center');
      }
    },
  }, cfg.body);
}

function drawParts(list) {
  for (const p of list || []) { ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.s, p.s); }
  ctx.globalAlpha = 1;
}
const drawTimer = (left, label = '剩余') => drawText(`${label} ${Math.max(0, left).toFixed(1)}s`, W / 2, 76, 36, left < 3 ? UI.c.danger : '#fff', 'center');

/* ---------------- 劈木桩 ---------------- */
function miniChopScene(onDone) {
  const HP = 30, LIMIT = 8, FAST = 5;
  return miniScene({
    title: '劈木桩',
    rules: ['按 J 或点击鼠标，疯狂劈砍木桩。', `${LIMIT} 秒内劈断它（${HP} 下）。`, `${FAST} 秒内完成为优秀。`],
    body: {
      init() { this.hp = HP; this.shake = 0; this.parts = []; this.hits = 0; this.doneT = 0; },
      start() { this.hp = HP; this.hits = 0; this.parts = []; },
      detail() { return `用时 ${this.doneT.toFixed(1)} 秒　劈砍 ${this.hits} 次`; },
      tick(dt) {
        this.shake = Math.max(0, this.shake - dt * 6);
        if (input.hit('attack') || mouse.clicked) {
          this.hp--; this.hits++; this.shake = 1;
          for (let i = 0; i < 5; i++) this.parts.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: 420, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0.5, s: 6, color: Math.random() < 0.5 ? '#a8763e' : '#6b4a26' });
        }
        this.doneT = this.t;
        if (this.hp <= 0) this.finish(this.t <= FAST ? 'good' : 'ok');
        else if (this.t >= LIMIT) { this.doneT = LIMIT; this.finish('fail'); }
      },
      drawGame() {
        const sx = this.phase === 'play' ? (Math.random() - 0.5) * 18 * this.shake : 0;
        const x = W / 2 - 60 + sx;
        const f = this.hp / HP;
        ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 6, 262, 132, 372);
        ctx.fillStyle = '#6b4a26'; ctx.fillRect(x, 268, 120, 360);
        ctx.fillStyle = '#8c6234'; ctx.fillRect(x + 12, 268, 36, 360);
        ctx.fillStyle = '#4a3219'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 18 + (i % 2) * 54, 300 + i * 52, 30, 6);
        ctx.fillStyle = '#c99a5b'; ctx.fillRect(x, 268, 120, 16);
        const cut = (1 - f) * 120;
        ctx.fillStyle = '#12121b'; ctx.fillRect(x + 60 - cut / 2, 396, cut, 14);
        drawParts(this.parts);
        const left = this.phase === 'play' ? LIMIT - this.t : LIMIT - this.doneT;
        drawTimer(left);
        pxPanel(W / 2 - 200, 100, 400, 36);
        ctx.fillStyle = '#d8433a'; ctx.fillRect(W / 2 - 196, 104, Math.round(392 * f), 28);
        drawText(`木桩 ${Math.max(0, this.hp)} / ${HP}`, W / 2, 129, 24, '#fff', 'center');
        drawText('J / 点击 劈砍', W / 2, 676, 24, UI.c.mut, 'center', false);
      },
    },
  }, onDone);
}

/* ---------------- 躲弹幕 ---------------- */
function miniDodgeScene(onDone) {
  const LIMIT = 15, GROUND = 600;
  return miniScene({
    title: '躲弹幕',
    rules: ['用 A / D 左右移动。', '红色预警出现后，落石会砸下来。', `坚持 ${LIMIT} 秒，不被砸中为优秀。`],
    body: {
      init() { this.px = W / 2; this.hits = 0; this.inv = 0; this.rocks = []; this.spawn = 0; this.parts = []; },
      start() { this.px = W / 2; this.hits = 0; this.inv = 0; this.rocks = []; this.spawn = 0.4; },
      detail() { return `被击中 ${this.hits} 次`; },
      tick(dt) {
        const mv = (input.act('right') ? 1 : 0) - (input.act('left') ? 1 : 0);
        this.px = clamp(this.px + mv * 460 * dt, 80, W - 80);
        this.inv = Math.max(0, this.inv - dt);
        const k = this.t / LIMIT;
        this.spawn -= dt;
        if (this.spawn <= 0 && this.rocks.length < 4) {
          const x = Math.random() < 0.6 ? clamp(this.px + (Math.random() - 0.5) * 160, 70, W - 70) : 70 + Math.random() * (W - 140);
          this.rocks.push({ x, t: 0, r: 46, hit: false });
          this.spawn = 0.75 - 0.35 * k;
        }
        for (const r of this.rocks) {
          r.t += dt;
          if (!r.hit && r.t >= 0.6 && r.t < 0.78 && this.inv <= 0 && Math.abs(r.x - this.px) < r.r + 22) {
            r.hit = true; this.hits++; this.inv = 0.8;
            for (let i = 0; i < 10; i++) this.parts.push({ x: this.px, y: GROUND - 60, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 400, life: 0.5, s: 6, color: '#ff5a4a' });
          }
        }
        this.rocks = this.rocks.filter((r) => r.t < 1.0);
        if (this.t >= LIMIT) this.finish(this.hits === 0 ? 'good' : this.hits <= 2 ? 'ok' : 'fail');
      },
      drawGame() {
        ctx.fillStyle = '#1b1b27'; ctx.fillRect(0, GROUND, W, 6);
        for (const r of this.rocks) {
          if (r.t < 0.6) {
            const a = 0.25 + 0.4 * (r.t / 0.6);
            ctx.fillStyle = `rgba(255,70,50,${a})`;
            ctx.beginPath(); ctx.ellipse(r.x, GROUND + 2, r.r * (0.5 + r.t / 1.2), 12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,70,50,${a * 0.5})`; ctx.fillRect(r.x - 6, 120, 12, GROUND - 120);
          } else {
            const y = 120 + (GROUND - 120) * Math.min(1, (r.t - 0.6) / 0.14);
            ctx.fillStyle = UI.c.ink; ctx.fillRect(r.x - r.r / 2 - 4, y - r.r - 4, r.r + 8, r.r + 8);
            ctx.fillStyle = '#8a8fa3'; ctx.fillRect(r.x - r.r / 2, y - r.r, r.r, r.r);
            ctx.fillStyle = '#b9bed0'; ctx.fillRect(r.x - r.r / 2, y - r.r, r.r, 8);
          }
        }
        if (!(this.inv > 0 && Math.floor(this.t * 20) % 2 === 0)) {
          const im = img('v2/heroes/knight.png');
          if (ready(im)) { const h = 150, w = im.naturalWidth * h / im.naturalHeight; ctx.drawImage(im, this.px - w / 2, GROUND - h + 6, w, h); }
          else { ctx.fillStyle = UI.c.accent; ctx.fillRect(this.px - 20, GROUND - 100, 40, 100); }
        }
        drawParts(this.parts);
        drawTimer(LIMIT - Math.min(this.t, LIMIT));
        drawText(`被击中 ${this.hits}`, W / 2, 116, 24, this.hits ? UI.c.danger : UI.c.mut, 'center');
        drawText('A / D 移动', W / 2, 676, 24, UI.c.mut, 'center', false);
      },
    },
  }, onDone);
}

/* ---------------- 翻牌记忆 ---------------- */
function miniMemoryScene(onDone) {
  const ICONS = ['broadsword', 'whirlwind', 'shield-bash', 'wolf-head', 'crown-coin', 'heart-bottle'];
  const CW = 140, CH = 150, GAP = 20, COLS = 4, ROWS = 3;
  const cardRect = (i) => {
    const gx = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
    return { x: gx + (i % COLS) * (CW + GAP), y: 128 + Math.floor(i / COLS) * (CH + GAP), w: CW, h: CH };
  };
  return miniScene({
    title: '翻牌记忆',
    rules: ['点击翻开两张牌，图案相同则配对成功。', '把 6 对全部配齐。', '错误 3 次以内为优秀，6 次以内为良好。'],
    body: {
      init() { this.deal(); },
      deal() {
        const ids = [...ICONS, ...ICONS];
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        this.cards = ids.map((id) => ({ id, up: false, done: false }));
        this.open = []; this.wait = 0; this.miss = 0; this.pairs = 0; this.sel = 0;
      },
      start() { this.deal(); },
      detail() { return `错误 ${this.miss} 次`; },
      flip(i) {
        const c = this.cards[i];
        if (!c || c.up || c.done || this.wait > 0 || this.open.length >= 2) return;
        c.up = true; this.open.push(i);
        if (this.open.length === 2) {
          const [a, b] = this.open.map((k) => this.cards[k]);
          if (a.id === b.id) { a.done = b.done = true; this.open = []; this.pairs++; if (this.pairs === 6) this.finish(this.miss <= 3 ? 'good' : this.miss <= 6 ? 'ok' : 'fail'); }
          else { this.miss++; this.wait = 0.8; }
        }
      },
      tick(dt) {
        if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) { for (const k of this.open) this.cards[k].up = false; this.open = []; } }
        for (let i = 0; i < this.cards.length; i++) {
          const r = cardRect(i);
          if (inRect(r.x, r.y, r.w, r.h)) { this.sel = i; if (mouse.clicked) { this.flip(i); return; } }
        }
        if (input.hit('left')) this.sel = (this.sel + 11) % 12;
        if (input.hit('right')) this.sel = (this.sel + 1) % 12;
        if (input.hit('down')) this.sel = (this.sel + COLS) % 12;
        if (input.hit('jump')) this.sel = (this.sel + 12 - COLS) % 12;
        if (input.hit('confirm')) this.flip(this.sel);
      },
      drawGame() {
        drawText('翻牌记忆', W / 2, 76, 36, '#fff', 'center');
        drawText(`错误 ${this.miss}　配对 ${this.pairs} / 6`, W / 2, 112, 24, this.miss > 3 ? UI.c.danger : UI.c.mut, 'center', false);
        this.cards.forEach((c, i) => {
          const r = cardRect(i);
          const sel = this.phase === 'play' && this.sel === i && !c.done;
          pxPanel(r.x, r.y, r.w, r.h, { edge: c.done ? UI.Q[3] : sel ? UI.c.accent : c.up ? UI.Q[1] : UI.c.edge, fill: c.up || c.done ? '#1a1a28' : '#12121b' });
          if (c.up || c.done) drawIcon(c.id, c.done ? 3 : 1, r.x + r.w / 2, r.y + r.h / 2, 3, 48, c.done ? 0.6 : 1);
          else drawText('?', r.x + r.w / 2, r.y + r.h / 2 + 18, 48, UI.c.edge, 'center', false);
        });
        drawText('点击翻牌　方向键 + Enter 也可以', W / 2, 700, 24, UI.c.mut, 'center', false);
      },
    },
  }, onDone);
}
