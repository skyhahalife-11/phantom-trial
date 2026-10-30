'use strict';
/* 叙事事件：神秘房间的文字事件。选项预告代价与收益，结果页确认后回到流程。 */

const evBoon = (q) => { const b = rollBoonQ(q); if (b) grantBoon(b.id); return b; };
const evHurt = (pct) => { const d = Math.min(run.hp - 1, Math.round(runMaxHp() * pct)); run.hp -= Math.max(0, d); return Math.max(0, d); };
const evBoonText = (b, pre) => (b ? { text: `${pre}获得「${b.name}」。`, boon: b } : (run.coins += 30, { text: '没有可获得的强化，换成 30 试炼币。' }));

const EVENT_LIST = [
  {
    name: '神秘商人', icon: 'treasure-map', once: false,
    sub: '披斗篷的商人拦住了你：「只要 40 个币，给你一件好东西。」',
    opts: [
      { name: '购买', desc: '花 40 试炼币，获得 1 个精良强化。', need: 40, run: () => { run.coins -= 40; return evBoonText(evBoon(1), '商人塞给你一件东西，'); } },
      { name: '离开', desc: '不理会商人。', run: () => ({ text: '你绕开了商人。' }) },
    ],
  },
  {
    name: '治愈之泉', icon: 'heart-bottle', once: true,
    sub: '一汪清澈的泉水，散发着微光。',
    opts: [
      { name: '痛饮', desc: '回复 40% 最大生命。', run: () => ({ text: `回复了 ${healRun(0.4)} 点生命。` }) },
      { name: '灌满水囊', desc: '获得 1 次强化刷新。', run: () => { run.refresh++; return { text: '你带走了泉水，之后的强化选择多一次刷新。' }; } },
    ],
  },
  {
    name: '受伤的旅人', icon: 'ankh',
    sub: '一个旅人倒在路边，伸手向你求助。',
    opts: [
      { name: '施舍', desc: '给他 30 试炼币，他会送你 1 个精良强化。', need: 30, run: () => { run.coins -= 30; return evBoonText(evBoon(1), '旅人感激地留下馈赠，'); } },
      { name: '抢走钱袋', desc: '获得 25 试炼币，但损失 15% 最大生命。', run: () => { run.coins += 25; return { text: `你拿走了钱袋，却在推搡中受了伤，失去 ${evHurt(0.15)} 点生命。` }; } },
      { name: '无视', desc: '继续赶路。', run: () => ({ text: '你径直走过。' }) },
    ],
  },
  {
    name: '诅咒宝箱', icon: 'skull-crack',
    sub: '箱盖上刻满暗红的符文，隐隐发烫。',
    opts: [
      { name: '打开', desc: '获得 60 试炼币，但损失 25% 最大生命。', run: () => { run.coins += 60; return { text: `符文熄灭，你得到了 60 试炼币，也被诅咒灼伤，失去 ${evHurt(0.25)} 点生命。` }; } },
      { name: '离开', desc: '不碰它。', run: () => ({ text: '你转身离开。' }) },
    ],
  },
  {
    name: '赌徒', icon: 'crown-coin',
    sub: '一个赌徒晃着骰子：「来一把？押 30 个币，赢了翻倍还多。」',
    opts: [
      { name: '押注', desc: '花 30 试炼币。50% 赢得 80，50% 血本无归。', need: 30, run: () => { run.coins -= 30; if (Math.random() < 0.5) { run.coins += 80; return { text: '骰子停下。你赢了，净赚 50 试炼币。' }; } return { text: '骰子停下。你输光了。' }; } },
      { name: '离开', desc: '不赌。', run: () => ({ text: '你摆了摆手。' }) },
    ],
  },
  {
    name: '古战场', icon: 'horned-skull',
    sub: '断刃与白骨散落一地，值钱的东西还在泥里。',
    opts: [
      { name: '搜刮战场', desc: '触发一场强敌战，胜利后必得稀有强化。', run: () => ({ text: '亡灵从地下爬了出来……', then: () => { startExtraBattle({ type: 'elite', reward: 'purple' }); } }) },
      { name: '绕行', desc: '不惹麻烦。', run: () => ({ text: '你绕开了古战场。' }) },
    ],
  },
  {
    name: '铁匠', icon: 'anvil-impact',
    sub: '废墟里还有一座没熄的炉子，一个铁匠在敲打。',
    opts: [
      { name: '锻造武器', desc: '花 35 试炼币，获得「力量」（攻击 +14%）。', need: 35, run: () => { run.coins -= 35; grantBoon('atk_1'); return { text: '武器锋利了许多。', boon: BOON.atk_1 }; } },
      { name: '加固铠甲', desc: '花 35 试炼币，获得「体魄」（最大生命 +14%）。', need: 35, run: () => { run.coins -= 35; grantBoon('hp_1'); return { text: '铠甲更厚实了。', boon: BOON.hp_1 }; } },
      { name: '离开', desc: '不打扰他。', run: () => ({ text: '你向铁匠点了点头，继续前行。' }) },
    ],
  },
];

function pickEvent() {
  const forced = params.get('ev');
  if (forced != null && EVENT_LIST[Number(forced)]) return EVENT_LIST[Number(forced)];
  run.usedEvents = run.usedEvents || {};
  const pool = EVENT_LIST.filter((e) => !(e.once && run.usedEvents[e.name]));
  return pool[Math.floor(Math.random() * pool.length)];
}

function eventScene(next) {
  return {
    enter() {
      this.t = 0; this.out = false; this.res = null; this.hover = -1;
      this.ev = pickEvent();
      run.usedEvents = run.usedEvents || {};
      run.usedEvents[this.ev.name] = true;
      this.sel = null;
    },
    okOpt(o) { return !o.need || run.coins >= o.need; },
    optRect(i) { return { x: 160, y: 392 + i * 84, w: 960, h: 70 }; },
    pick(i) {
      const o = this.ev.opts[i];
      if (!o || !this.okOpt(o) || this.res) return;
      if (bot.on) console.log(`[EVENT] ${this.ev.name} opt=${i}`);
      this.res = o.run();
      this.sel = o.name;
      this.t = 0;
    },
    finish() {
      if (this.out) return;
      this.out = true;
      if (this.res.then) this.res.then(); else next();
    },
    update(dt) {
      this.t += dt;
      if (this.res) {
        if (bot.on ? this.t > 0.2 : (this.t > 0.4 && (input.hit('confirm') || mouse.clicked))) this.finish();
        return;
      }
      if (bot.on) {
        if (this.t > 0.2) {
          const ok = this.ev.opts.map((o, i) => i).filter((i) => this.okOpt(this.ev.opts[i]));
          this.pick(ok[Math.floor(Math.random() * ok.length)]);
        }
        return;
      }
      if (this.t < 0.3) return;
      this.hover = -1;
      this.ev.opts.forEach((o, i) => {
        const r = this.optRect(i);
        if (inRect(r.x, r.y, r.w, r.h)) { this.hover = i; if (mouse.clicked) this.pick(i); }
      });
      for (let i = 0; i < this.ev.opts.length; i++) if (pressed.has('Digit' + (i + 1))) this.pick(i);
      if (pressed.has('Tab')) setScene(buildScene(this));
    },
    draw() {
      drawBackdrop(0.82);
      coinChip(W - 24, 28);
      const ev = this.ev;
      const k = clamp(this.t / 0.25, 0, 1);
      ctx.save(); ctx.globalAlpha = this.res ? 1 : k;
      pxPanel(120, 96, 1040, 270, { fill: 'rgba(14,14,22,.94)' });
      const g = ctx.createRadialGradient(250, 230, 4, 250, 230, 110);
      g.addColorStop(0, 'rgba(138,208,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(140, 110, 220, 240);
      drawIcon(ev.icon, 1, 250, 230, 3, 48);
      drawText(ev.name, 380, 160, 48, '#fff');
      if (!this.res) {
        wrapText(ev.sub, 700, 24).slice(0, 4).forEach((ln, i) => drawText(ln, 380, 214 + i * 34, 24, UI.c.txt, 'left', false));
        drawText('请选择（数字键 1~3 或点击）', 380, 340, 24, UI.c.mut, 'left', false);
      } else {
        drawText(`你选择了：${this.sel}`, 380, 214, 24, UI.c.accent, 'left', false);
        wrapText(this.res.text, 700, 24).slice(0, 3).forEach((ln, i) => drawText(ln, 380, 254 + i * 34, 24, UI.c.txt, 'left', false));
      }
      ctx.restore();
      if (!this.res) {
        ev.opts.forEach((o, i) => {
          const r = this.optRect(i);
          const ok = this.okOpt(o), hv = ok && this.hover === i;
          pxPanel(r.x, r.y + (hv ? -4 : 0), r.w, r.h, { edge: hv ? UI.c.accent : ok ? UI.c.edge : '#2a2a38', fill: hv ? '#26263a' : UI.c.panel });
          const y = r.y + (hv ? -4 : 0);
          drawText(`${i + 1}`, r.x + 28, y + 44, 36, ok ? UI.c.accent : '#5a5f70', 'center');
          drawText(o.name, r.x + 64, y + 30, 24, ok ? '#fff' : '#5a5f70', 'left', false);
          drawText(o.desc, r.x + 64, y + 58, 24, ok ? UI.c.txt : '#5a5f70', 'left', false);
          if (o.need) drawText(`需要 ${o.need} 试炼币`, r.x + r.w - 20, y + 44, 24, ok ? UI.Q[3] : UI.c.danger, 'right', false);
        });
        drawText('Tab 构筑', W / 2, H - 28, 24, UI.c.mut, 'center', false);
      } else {
        const b = this.res.boon;
        if (b) {
          const col = UI.Q[b.q];
          pxPanel(400, 396, 480, 150, { edge: col, fill: '#1a1a28', glow: UI.QG[b.q], glowBlur: 24 });
          drawIcon(b.icon, b.q, 470, 471, 2, 48);
          drawText(b.name, 540, 446, 36, '#fff', 'left');
          drawText(QUAL[b.q].name, 540, 482, 24, col, 'left', false);
          wrapText(b.desc, 320, 24).slice(0, 2).forEach((ln, i) => drawText(ln, 540, 514 + i * 28, 24, UI.c.txt, 'left', false));
        }
        if (this.t > 0.4) drawText('Enter / 点击 继续', W / 2, 620, 24, UI.c.accent, 'center');
      }
    },
  };
}
