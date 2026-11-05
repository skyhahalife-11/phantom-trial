'use strict';
/* 幻之屋：局外成长。每局结束按战绩获得「试炼之魂」，回到这里永久强化。存档 localStorage 'phantom_trial_meta_v2'。
   本文件只靠包裹已有函数接入（buildMods / newRun / endRun / roomScene.start / titleScene / runResultScene），不改它们的源码。 */
(() => {
const KEY = 'phantom_trial_meta_v2';
const UPS = [
  { id: 'hp', name: '体魄', glyph: 'heart-bottle', max: 5, base: 30, per: '最大生命 +6%', total: (n) => `+${n * 6}%` },
  { id: 'atk', name: '锋芒', glyph: 'swords-power', max: 5, base: 40, per: '全部伤害 +4%', total: (n) => `+${n * 4}%` },
  { id: 'cdr', name: '疾速', glyph: 'stopwatch', max: 5, base: 40, per: '技能冷却 -3%', total: (n) => `-${n * 3}%` },
  { id: 'soul', name: '魂引', glyph: 'burning-embers', max: 4, base: 50, per: '每场战斗开局带 0.5 格魂', total: (n) => `${n * 0.5} 格` },
  { id: 'coin', name: '财运', glyph: 'crown-coin', max: 5, base: 25, per: '试炼币收益 +10%', total: (n) => `+${n * 10}%` },
  { id: 'purse', name: '先机', glyph: 'coins', max: 5, base: 20, per: '开局自带 15 枚试炼币', total: (n) => `${n * 15} 枚` },
];
const cost = (u, lv) => u.base * (lv + 1);

let st = { souls: 0, lv: {}, runs: 0, wins: 0, best: 0 };
try { st = Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 无存档就用默认 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };
const lv = (id) => (st.lv && st.lv[id]) || 0;
window.META = { state: () => st, lv, UPS };

/* ---------- 接入战斗 ---------- */
const _bm = buildMods;
buildMods = function (ids, extra) {
  if (typeof run === 'undefined' || !run.active) return _bm(ids, extra);
  const out = _bm(ids, Object.assign({ atkPct: lv('atk') * 0.04, hpPct: lv('hp') * 0.06, cdr: lv('cdr') * 0.03 }, extra));
  out.coin += lv('coin') * 0.1;
  return out;
};
const _rs = roomScene.start;
roomScene.start = (cfg) => { cfg.startSoul = lv('soul') * 0.5; _rs(cfg); };
const _nr = newRun;
newRun = function (h) { const r = _nr(h); run.coins += lv('purse') * 15; return r; };
const _er = endRun;
endRun = function (win) {
  _er(win);
  const r = run.result;
  const souls = Math.round(10 * r.stage + 25 * run.bosses + run.kills / 4 + (win ? 40 : 0));
  st.souls += souls; st.runs++; if (win) st.wins++; st.best = Math.max(st.best, r.stage + (win ? 1 : 0));
  r.souls = souls; r.soulsTotal = st.souls;
  save();
};

/* ---------- 幻之屋 ---------- */
function metaScene(back) {
  return {
    enter() { this.t = 0; this.sel = 0; this.toast = ''; this.toastT = 0; },
    rect(i) { const w = 360, h = 220, gap = 30, x0 = (W - (3 * w + 2 * gap)) / 2; return { x: x0 + (i % 3) * (w + gap), y: 160 + Math.floor(i / 3) * (h + 30), w, h }; },
    buy(i) {
      const u = UPS[i], n = lv(u.id);
      if (n >= u.max) { this.say('已经满级'); return; }
      const c = cost(u, n);
      if (st.souls < c) { this.say('试炼之魂不足'); return; }
      st.souls -= c; st.lv[u.id] = n + 1; save();
      if (window.sfx) sfx.play('pick');
      this.say(`${u.name} → Lv.${n + 1}`);
    },
    say(t) { this.toast = t; this.toastT = 1.4; },
    update(dt) {
      this.t += dt; this.toastT -= dt;
      if (input.hit('pause')) { setScene(back); return; }
      if (pressed.has('ArrowLeft') || pressed.has('KeyA')) this.sel = (this.sel + 5) % 6;
      if (pressed.has('ArrowRight') || pressed.has('KeyD')) this.sel = (this.sel + 1) % 6;
      if (pressed.has('ArrowUp') || pressed.has('KeyW') || pressed.has('ArrowDown') || pressed.has('KeyS')) this.sel = (this.sel + 3) % 6;
      if (input.hit('confirm')) this.buy(this.sel);
      for (let i = 0; i < UPS.length; i++) {
        const r = this.rect(i);
        if (inRect(r.x, r.y, r.w, r.h)) { this.sel = i; if (mouse.clicked) this.buy(i); }
      }
      if (mouse.clicked && inRect(W - 250, 40, 210, 56)) setScene(back);
    },
    draw() {
      drawBackdrop(0.78);
      drawText('幻之屋', W / 2, 84, 48, '#ffe9b0', 'center');
      drawText(`试炼之魂  ${st.souls}`, W / 2, 124, 24, UI.Q[3], 'center');
      UPS.forEach((u, i) => {
        const r = this.rect(i), n = lv(u.id), maxed = n >= u.max, c = cost(u, n), can = !maxed && st.souls >= c, sel = this.sel === i;
        const a = clamp((this.t - i * 0.05) / 0.25, 0, 1);
        ctx.globalAlpha = a;
        pxPanel(r.x, r.y, r.w, r.h, { edge: sel ? UI.c.accent : maxed ? UI.Q[3] : UI.c.edge, fill: 'rgba(14,14,26,.94)', glow: sel ? 'rgba(255,179,71,.4)' : null, glowBlur: 16 });
        pxPanel(r.x + 24, r.y + 28, 96, 96, { edge: UI.Q[Math.min(4, 1 + Math.floor(n / 2))], fill: '#12121b' });
        drawIcon(u.glyph, maxed ? 3 : n ? 1 : 0, r.x + 72, r.y + 76, 2, 32);
        drawText(u.name, r.x + 144, r.y + 56, 36, UI.c.txt);
        drawText(`Lv.${n} / ${u.max}`, r.x + 144, r.y + 90, 24, maxed ? UI.Q[3] : UI.c.mut, 'left', false);
        for (let k = 0; k < u.max; k++) { ctx.fillStyle = UI.c.ink; ctx.fillRect(r.x + 144 + k * 30, r.y + 104, 26, 14); ctx.fillStyle = k < n ? UI.Q[3] : '#2a2a3a'; ctx.fillRect(r.x + 146 + k * 30, r.y + 106, 22, 10); }
        wrapText(u.per, r.w - 48, 24).slice(0, 2).forEach((ln, j) => drawText(ln, r.x + 24, r.y + 156 + j * 26, 24, UI.c.txt, 'left', false));
        if (n) drawText(`当前 ${u.total(n)}`, r.x + 24, r.y + r.h - 18, 24, UI.c.heal, 'left', false);
        drawText(maxed ? '已满级' : `${c} 魂`, r.x + r.w - 24, r.y + r.h - 18, 24, maxed ? UI.Q[3] : can ? UI.c.accent : UI.c.danger, 'right', false);
        ctx.globalAlpha = 1;
      });
      pxButton(W - 250, 40, 210, 56, 'Esc 返回', {});
      drawText(`累计 ${st.runs} 局　通关 ${st.wins} 次　最远到第 ${st.best} 关`, W / 2, H - 30, 24, UI.c.mut, 'center', false);
      drawText('点击 / Enter 购买　方向键选择', W / 2, H - 62, 24, UI.c.mut, 'center', false);
      if (this.toastT > 0) drawText(this.toast, W / 2, 152, 24, UI.c.accent, 'center');
    },
  };
}

/* ---------- 标题页与结算页的入口 ---------- */
const _td = titleScene.draw;
titleScene.draw = function () {
  _td.call(this);
  pxButton(W / 2 - 440, 560, 260, 64, `幻之屋 ${st.souls}魂`, { edge: UI.Q[3], color: UI.Q[3] });
};
const _tu = titleScene.update;
titleScene.update = function (dt) {
  if (pressed.has('KeyH') && !bot.on) { setScene(metaScene(titleScene)); return; }
  if (mouse.clicked && inRect(W / 2 - 440, 560, 260, 64)) { setScene(metaScene(titleScene)); return; }
  _tu.call(this, dt);
};
const _rd = runResultScene.draw;
runResultScene.draw = function () {
  _rd.call(this);
  const r = run.result;
  if (r && r.souls != null) {
    drawText(`获得试炼之魂 +${r.souls}　累计 ${r.soulsTotal}`, W / 2, 616, 24, UI.Q[3], 'center');
    pxButton(W - 260, 620, 220, 56, 'H 幻之屋', { edge: UI.Q[3], color: UI.Q[3] });
  }
};
const _ru = runResultScene.update;
runResultScene.update = function (dt) {
  if (!bot.on && this.t > 0.6 && (pressed.has('KeyH') || (mouse.clicked && inRect(W - 260, 620, 220, 56)))) { const me = this; setScene(metaScene(me)); return; }
  _ru.call(this, dt);
};
})();
