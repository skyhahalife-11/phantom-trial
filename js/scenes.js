'use strict';

let selectedHero = 'knight';
let paused = false;
const botState = { runs: Number(params.get('runs')) || 1, left: 0, results: [] };
const SKILL_KEYS = ['U', 'I', 'O', 'P'];

const titleScene = {
  enter() { this.t = 0; },
  update(dt) {
    this.t += dt;
    if (bot.on && !this.started) { this.started = true; botState.left = botState.runs; startGame(); return; }
    if (input.hit('confirm') || (mouse.clicked && inRect(W / 2 - 160, 560, 320, 64))) startGame();
  },
  draw() {
    drawBackdrop(0.62);
    drawText('幻之试炼', W / 2, 110, 48, '#ffe9b0', 'center');
    drawText('地下城闯关肉鸽 · 阶段 1', W / 2, 150, 24, UI.c.mut, 'center');
    const h = HEROES.knight;
    pxPanel(W / 2 - 360, 190, 720, 340, { fill: 'rgba(14,14,22,.9)', edge: UI.c.accent });
    drawSprite('v2/heroes/knight.png', W / 2 - 220, 500, 280, false);
    drawText(h.name, W / 2 - 60, 240, 36, '#fff');
    wrapText(h.blurb, 380, 24).forEach((ln, i) => drawText(ln, W / 2 - 60, 282 + i * 30, 24, UI.c.mut, 'left', false));
    h.skills.forEach((s, i) => {
      const x = W / 2 - 60 + i * 96, y = 400;
      pxPanel(x, y, 80, 80, { edge: s.ult ? UI.Q[3] : UI.c.edge, fill: '#12121b' });
      drawIcon(s.glyph || 'sparkles', s.ult ? 3 : 0, x + 40, y + 40, 2, 32);
      drawText(SKILL_KEYS[i], x + 12, y + 24, 24, UI.c.accent);
    });
    drawText(`生命 ${h.hp}　攻击 ${h.atk}`, W / 2 - 60, 516, 24, UI.c.mut, 'left', false);
    const b = pxButton(W / 2 - 160, 560, 320, 64, '开始试炼', { edge: UI.c.accent, color: UI.c.accent });
    drawText('A/D 移动　J 攻击　K 跳跃　空格 闪避　U I O 技能　P 奥义　Esc 暂停　F11 全屏', W / 2, H - 30, 24, UI.c.mut, 'center');
  },
};

function drawPause() {
  const p = world.player;
  ctx.fillStyle = 'rgba(0,0,0,.82)'; ctx.fillRect(0, 0, W, H);
  drawText('已暂停', W / 2, 80, 48, '#fff', 'center');
  drawText('按 Esc 继续', W / 2, 116, 24, UI.c.mut, 'center');
  let y = 150;
  p.def.skills.forEach((s, i) => {
    pxPanel(60, y, W - 120, 84, { edge: s.ult ? UI.Q[3] : UI.c.edge, fill: '#12121b' });
    drawIcon(s.glyph || 'sparkles', s.ult ? 3 : 0, 108, y + 42, 2, 32);
    drawText(`${SKILL_KEYS[i]}  ${s.name}`, 164, y + 34, 24, UI.c.accent);
    wrapText(s.desc, W - 340, 24).slice(0, 2).forEach((ln, j) => drawText(ln, 164, y + 34 + (j + 1) * 24 + (j ? 4 : 0), 24, UI.c.txt, 'left', false));
    y += 94;
  });
  const tips = ['连携：普攻打中后立刻放技能，技能伤害 +20%', '躲招：矮的红色预警可以跳过去；带竖向光柱的只能闪避或走开'];
  tips.forEach((t) => { drawText(t, 60, y + 24, 24, UI.c.mut, 'left', false); y += 32; });
  if (run.active) {
    y += 12;
    const names = [...new Set(run.boons)].map((id) => ({ b: BOON[id], n: count(id) }));
    let x = 60;
    for (const { b, n } of names) { const t = b.name + (n > 1 ? `×${n}` : ''); const w = textW(t, 24) + 24; if (x + w > W - 60) { x = 60; y += 42; } if (y > H - 20) break; chipBox(x, y, 36, w, UI.Q[b.q]); drawText(t, x + w / 2, y + 27, 24, UI.Q[b.q], 'center', false); x += w + 8; }
  }
}

const battleScene = {
  update(dt) {
    if (input.hit('pause') && world.state === 'play') paused = !paused;
    if (paused) return;
    if (bot.on) botDrive(dt);
    updateWorld(dt);
    if (world.state !== 'play' && world.endT > 1.8) onBattleEnd(world.state === 'win');
  },
  draw() { drawWorld(); drawHud(); if (paused) drawPause(); },
};
addEventListener('blur', () => { if (!bot.on && scene === battleScene && world.state === 'play') paused = true; });

function drawHud() {
  const p = world.player;
  // 左上：生命、评分线
  pxPanel(24, 20, 420, 112, { fill: 'rgba(14,14,22,.88)' });
  drawText(p.def.name, 44, 54, 24, UI.c.txt);
  if (p.shield > 0) drawText(`护盾 ${Math.ceil(p.shield)}`, 424, 54, 24, '#8fd0ff', 'right');
  drawHpBar(44, 92, 380, 28, p.hp, p.maxHp, p.shield, true);
  // 状态
  let sx = 24;
  const chip = (txt, col, icon, q) => { const w = textW(txt, 24) + (icon ? 56 : 24); chipBox(sx, 150, 36, w, col); if (icon) drawIcon(icon, q, sx + 20, 168, 1, 32); drawText(txt, sx + (icon ? 40 : 12), 177, 24, '#fff', 'left', false); sx += w + 8; };
  const bz = p.buffs.find((b) => b.berserk);
  if (bz) chip(`狂战 ${bz.t.toFixed(1)}s`, UI.c.danger, 'enrage', 3);
  if (p.weak > 0) chip(`虚弱 ${p.weak.toFixed(1)}s`, '#5a5f70');
  if (p.pdWin > 0) chip(`反打 ${p.pdWin.toFixed(1)}s`, '#2f9d7a', 'sprint', 1);
  if (p.pdStack > 0) chip(`残影 ×${p.pdStack}`, UI.Q[4], 'backup', 4);
  if (p.shieldT > 0 && p.bashSk) chip(`盾击 ${p.shieldT.toFixed(1)}s`, '#7ab8ff', 'shield-bash', 1);
  for (const pt of world.pets) {
    if (pt.kind === 'wolf') chip('幼狼', UI.c.edge, 'wolf-head', 0);
    else if (pt.kind === 'raven') chip('灵鸦', UI.c.edge, 'raven', 0);
    else chip(pt.alive ? `石灵 ${Math.ceil(pt.hp)}` : `石灵 ${Math.ceil(pt.respawn)}s`, pt.alive ? UI.c.edge : '#5a5f70', 'rock', 0);
  }
  if (world.clones.length) chip(`分身 ×${world.clones.length}`, UI.Q[4], 'shadow-follower', 4);
  if (p.afterT > 0) chip('余韵', UI.Q[3], 'sun', 3);
  if (p.petFrenzy > 0) chip(`号令 ${p.petFrenzy.toFixed(1)}s`, UI.Q[2], 'target-arrows', 2);

  const WV = curWaves();
  const w = WV[clamp(world.wave, 0, WV.length - 1)];
  if (world.wave >= 0) {
    const t = run.active ? `第 ${run.stage + 1} 关 · ${run.node.rob ? '劫道' : run.node.challenge ? '强敌挑战' : run.node.type === 'boss' ? 'Boss' : run.node.type === 'elite' ? '强敌' : '遭遇战'}${WV.length > 1 ? `  ${world.wave + 1}/${WV.length}` : ''}` : w.name;
    drawText(t, W / 2 + 60, 48, 36, '#fff', 'center');
  }
  if (run.active) {
    const t = String(run.coins), cw = 56 + textW(t, 24);
    chipBox(W - 24 - cw, 24, 40, cw); drawIcon('coins', 3, W - 24 - cw + 22, 44, 1, 32); drawText(t, W - 36, 53, 24, '#fff', 'right');
  }
  const boss = world.enemies.find((e) => e.def.boss && !e.dead);
  if (boss) {
    const bw = 640, bx = W / 2 - bw / 2 + 60, by = 92;
    ctx.fillStyle = UI.c.ink; ctx.fillRect(bx - 4, by - 4, bw + 8, 36);
    ctx.fillStyle = '#2b1a10'; ctx.fillRect(bx, by, bw, 28);
    ctx.fillStyle = boss.vuln ? '#ffd24a' : '#e8802e'; ctx.fillRect(bx, by, Math.round(bw * clamp(boss.hp / boss.maxHp, 0, 1)), 28);
    drawText(boss.def.name + (boss.vuln ? '　破绽' : ''), W / 2 + 60, by + 23, 24, '#fff3da', 'center');
  }
  // 技能栏
  const n = p.def.skills.length;
  const gap = 28, sw = 96;
  const total = 72 + gap + (n - 1) * (sw + gap) + 112;
  let x = W / 2 - total / 2;
  const by = H - 150;
  // 闪避
  ctx.strokeStyle = UI.c.ink; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(x + 36, by + 70, 34, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = p.dodgeCd > 0 ? '#3a3a52' : '#6fe3c0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x + 36, by + 70, 34, 0, Math.PI * 2); ctx.stroke();
  if (p.dodgeCd > 0) { ctx.strokeStyle = '#6fe3c0'; ctx.beginPath(); ctx.arc(x + 36, by + 70, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - clamp(p.dodgeCd / 0.75, 0, 1))); ctx.stroke(); }
  drawIcon('sprint', 4, x + 36, by + 70, 1, 32);
  drawText('空格', x + 36, by + 126, 24, UI.c.mut, 'center');
  x += 72 + gap;
  p.def.skills.forEach((s, i) => {
    const ult = !!s.ult;
    const size = ult ? 112 : sw;
    const y = by + 100 - size;
    const ready2 = p.cd[i] <= 0 && p.weak <= 0 && p.mods.sealIdx !== i;
    pxPanel(x, y, size, size, { edge: ult ? UI.Q[3] : ready2 ? '#6a6a88' : UI.c.edge, fill: '#12121b', glow: ult && ready2 ? 'rgba(255,210,58,.55)' : null, glowBlur: 18 });
    const bb = boundBoons(i);
    const q = bb.reduce((a, b) => Math.max(a, b.q), 0);
    drawIcon(s.glyph || 'sparkles', ult ? 3 : bb.length ? q : 0, x + size / 2, y + size / 2, ult ? 3 : 2, 32, p.mods.sealIdx === i ? 0.25 : 1);
    drawText(SKILL_KEYS[i], x + 14, y + 26, 24, UI.c.accent);
    if (p.cd[i] > 0) {
      const f = clamp(p.cd[i] / (s.cd * (1 - p.mods.cdr)), 0, 1);
      ctx.fillStyle = 'rgba(5,5,10,.7)'; ctx.fillRect(x + 4, y + 4, size - 8, (size - 8) * f);
      drawText(p.cd[i] >= 10 ? String(Math.ceil(p.cd[i])) : p.cd[i].toFixed(1), x + size / 2, y + size / 2 + 12, 36, '#fff', 'center');
    }
    bb.slice(0, 5).forEach((b, k) => { ctx.fillStyle = UI.c.ink; ctx.fillRect(x + 4 + k * 18, y + size + 6, 18, 18); ctx.fillStyle = UI.Q[b.q]; ctx.fillRect(x + 6 + k * 18, y + size + 8, 14, 14); });
    if (s.type === 'slash' && p.counter > 0) drawText(`反击×${p.counter}`, x + size / 2, y - 12, 24, '#7ab8ff', 'center');
    x += size + gap;
  });
  if (world.chain >= 3) {
    const s = 1 + world.chainPop * 0.2;
    ctx.save(); ctx.translate(W - 40, 130); ctx.scale(s, s);
    drawText(`${world.chain} 连击`, 0, 0, 48, world.chain >= 20 ? UI.Q[3] : '#fff', 'right');
    ctx.restore();
    if (p.mods.link) drawText(`连携 +${Math.round(p.mods.link * 100)}%`, W - 40, 164, 24, UI.c.mut, 'right', false);
  }
  const b = world.banner;
  if (b) {
    const t = b.t / b.dur;
    const a = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.translate(W / 2, 290);
    drawText(b.text, 0, 0, 48, b.boss ? '#ff9a6a' : '#ffe9b0', 'center');
    drawText(b.sub, 0, 44, 24, UI.c.mut, 'center');
    ctx.restore();
  }
  if (world.hint > 0) drawText('J 攻击　K 跳跃　空格 闪避　U I O 技能　P 奥义　Esc 查看技能', W / 2, H - 6, 24, 'rgba(230,236,246,' + clamp(world.hint / 3, 0, 1) + ')', 'center');
}

const preloadList = [
  'v2/bg/dungeon_far.png', 'v2/bg/dungeon_mid.png', 'v2/bg/dungeon_ground.png',
  ...HERO_KEYS.map((k) => `v2/heroes/${k}.png`),
  ...Object.keys(ANIMS).filter((n) => n.startsWith('knight')).map((n) => `anim/${n}.png`),
  ...[0, 1, 2, 3].map((i) => `anim/knight_kf_${i}.png`),
  ...Object.values(ENEMIES).map((e) => e.img),
];
Promise.all([preload(preloadList), loadIcons(), document.fonts.load('24px FP'), document.fonts.load('48px FP')]).then(() => {
  setScene(titleScene);
  if (params.get('dbg')) debugJump(params.get('dbg'));
});

function botAfterRun() {
  botState.results.push({ win: run.result.win, stage: run.result.stage });
  botState.left--;
  if (botState.left > 0) { startGame(); return; }
  const wins = botState.results.filter((r) => r.win).length;
  console.log(`[DONE] ${wins}/${botState.results.length} wins`);
  setScene({ update() {}, draw() {} });
}
