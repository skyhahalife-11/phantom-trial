function ratingScene(o) {
  const RK = { S: '#FFD23A', A: '#5AA9FF', B: '#CFD8E6', C: '#FF5A4A' };
  const prev = Math.max(0, o.hp - (o.healed || 0));
  return {
    enter() { this.t = 0; this.stamped = false; },
    update(dt) { this.t += dt; if (bot.on || (this.t > 0.5 && (input.hit('confirm') || mouse.clicked))) nextStep(); },
    draw() {
      drawBackdrop(0.78);
      const t = this.t, col = o.rank.color, cx = 330, cy = 360;
      const ft = clamp(t / 0.35, 0, 1);
      drawText('战斗胜利', W / 2, 78, 48, '#fff', 'center');
      ornament(W / 2, 98, 220 * ft, '#8a5a9a');
      // 左：盖章
      const st = clamp((t - 0.3) / 0.2, 0, 1), sc = st < 1 ? 2.6 - 1.6 * st * st : 1;
      if (st >= 1 && !this.stamped) { this.stamped = true; sparkBurst(cx, cy, 36, o.rank.k === 'S' ? '255,214,90' : o.rank.k === 'A' ? '120,180,255' : o.rank.k === 'B' ? '220,226,240' : '255,100,90'); }
      const shk = this.stamped && t < 0.75 ? (0.75 - t) * 22 : 0;
      ctx.save(); ctx.translate(cx + (Math.random() - 0.5) * shk, cy + (Math.random() - 0.5) * shk);
      const gl = ctx.createRadialGradient(0, 0, 20, 0, 0, 230); gl.addColorStop(0, col + '55'); gl.addColorStop(1, col + '00');
      ctx.globalAlpha = st; ctx.fillStyle = gl; ctx.fillRect(-240, -240, 480, 480);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.setLineDash([18, 10]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(0, 0, 168, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 148, 0, Math.PI * 2); ctx.stroke();
      ctx.scale(sc, sc);
      ctx.font = '192px FP, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 36;
      ctx.fillText(o.rank.k, 0, 66); ctx.restore();
      drawText('战斗评分', cx, 596, 24, UI.c.mut, 'center');
      // 右：数据
      const x0 = 640, w = 540;
      drawText('剩余生命', x0, 220, 24, UI.c.mut);
      const k = clamp((t - 0.6) / 0.9, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const cur = prev + (o.hp - prev) * e;
      ctx.fillStyle = UI.c.ink; ctx.fillRect(x0 - 4, 236, w + 8, 40);
      ctx.fillStyle = '#2b1217'; ctx.fillRect(x0, 240, w, 32);
      ctx.fillStyle = '#d8433a'; ctx.fillRect(x0, 240, Math.round(w * clamp(prev / o.mx, 0, 1)), 32);
      if (o.hp > prev) { ctx.fillStyle = '#7DFF9A'; ctx.fillRect(x0 + Math.round(w * prev / o.mx), 240, Math.round(w * (cur - prev) / o.mx), 32); }
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x0, 240, w, 10);
      for (const r of RANK) if (r.min > 0) { ctx.fillStyle = UI.c.ink; ctx.fillRect(Math.round(x0 + w * r.min) - 2, 232, 4, 48); drawText(r.k, x0 + w * r.min, 304, 24, RK[r.k], 'center', false); }
      drawText(`${Math.round(cur)} / ${o.mx}`, x0 + w, 220, 24, '#fff', 'right');
      drawText(`${Math.round(o.pct * 100)}%`, x0 + w / 2, 266, 24, '#fff', 'center');
      let ty = 360;
      const sk = clamp((t - 0.5) / 0.6, 0, 1), coin = Math.round(o.gain * (1 - Math.pow(1 - sk, 3)));
      drawIcon('coins', 3, x0 + 24, ty - 8, 1, 32); drawText('试炼币', x0 + 56, ty, 24, UI.c.txt);
      drawText(`+${coin}`, x0 + w, ty, 36, '#FFE08A', 'right');
      ty += 52;
      if (o.healed) { drawIcon('heart-bottle', 4, x0 + 24, ty - 8, 1, 32); drawText('战后回复', x0 + 56, ty, 24, UI.c.txt); drawText(`+${o.healed}`, x0 + w, ty, 36, UI.c.heal, 'right'); ty += 52; }
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x0, ty - 20, w, 2);
      // 档位
      let x = x0;
      for (const r of RANK) { const txt = r.k === 'C' ? 'C' : `${r.k} ≥${Math.round(r.min * 100)}%`; const on = o.rank.k === r.k; x += tagChip(txt, x, ty + 8, on ? r.color : '#3a3150', on); }
      if (o.rank.k === 'S') {
        const pulse = 0.6 + 0.4 * Math.sin(t * 4);
        ctx.save(); ctx.shadowColor = `rgba(255,210,58,${pulse})`; ctx.shadowBlur = 18;
        drawText('探索门已出现 · 领完强化后可以进入', x0, ty + 88, 24, UI.Q[3]); ctx.restore();
      }
      drawSparks();
      if (t > 0.5 && Math.floor(t * 2) % 2 === 0) drawText('Enter 继续', W / 2, 676, 24, UI.c.accent, 'center');
    },
  };
}

/* ---------------- 强化三选一 ---------------- */
/* 获得强化的过场：卡片消失后给一次明确的「变强」反馈，而不是直接跳下一场 */
function boonGetScene(b, next) {
  const col = UI.Q[b.q];
  return {
    enter() { this.t = 0; this.out = false; this.burst = false; },
    close() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.1) this.close(); return; }
      if (this.t > 0.45 && (mouse.clicked || pressed.has('Space') || pressed.has('Enter') || pressed.has('Digit1'))) this.close();
    },
    draw() {
      drawBackdrop(0.9);
      const k = clamp(this.t / 0.22, 0, 1), ease = 1 - Math.pow(1 - k, 3);
      const cx = W / 2, cy = H / 2 - 50;
      if (!this.burst) { this.burst = true; sparkBurst(cx, cy, 44, '255,226,140', 520); }
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 460 * ease);
      g.addColorStop(0, UI.QG[b.q]); g.addColorStop(0.45, 'rgba(255,210,58,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (this.t < 0.12) { ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - this.t / 0.12)})`; ctx.fillRect(0, 0, W, H); }
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 * (1 - k * 0.6); ctx.beginPath(); ctx.arc(cx, cy, (ease + i * 0.28) * 260, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.t * 0.4); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      drawIcon(b.icon, b.q, cx, cy, 2 + 3 * ease, 48);
      drawText('获得强化', cx, cy + 112, 24, col, 'center');
      ornament(cx, cy + 128, 150, col);
      drawText(b.name, cx, cy + 184, 48, '#fff', 'center');
      wrapText(b.desc, 640, 24).slice(0, 3).forEach((ln, i) => richLine(ln, cx, cy + 232 + i * 32, 24, UI.c.txt));
      if (b.school) drawText(`${SCHOOLS[b.school].name} · 后续该流派强化出现率提升`, cx, cy + 338, 24, SCHOOLS[b.school].color, 'center', false);
      drawSparks();
      if (this.t > 0.45 && Math.floor(this.t * 2) % 2 === 0) drawText('点击 / 空格 继续', cx, H - 64, 24, UI.c.mut, 'center', false);
    },
  };
}

function pickScene(cfg) {
  return {
    enter() { this.t = 0; this.cands = cfg.cands ? cfg.cands() : rollCands(cfg.kind, cfg.minPurple); this.hover = -1; this.done = false; this.hk = [0, 0, 0]; this.last = nowS(); if (!this.cands.length) { run.coins += 40; setTimeout(cfg.onDone || nextStep, 0); } },
    choose(i) {
      const b = this.cands[i];
      if (!b || this.done) return;
      this.done = true;
      grantBoon(b.id);
      setScene(boonGetScene(b, cfg.onDone || nextStep));
    },
    reroll() { if (cfg.noReroll || run.refresh <= 0) return; run.refresh--; this.cands = rollCands(cfg.kind, cfg.minPurple); this.t = 0.2; },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.2) this.choose(Math.floor(Math.random() * this.cands.length)); return; }
      if (this.t < 0.35) return;
      const n = this.cands.length;
      this.hover = -1;
      for (let i = 0; i < n; i++) { const c = this.cardRect(i); if (inRect(c.x, c.y, c.w, c.h)) { this.hover = i; if (mouse.clicked) { this.choose(i); return; } } }
      for (let i = 0; i < n; i++) if (pressed.has('Digit' + (i + 1))) { this.choose(i); return; }
      if (!cfg.noReroll && (pressed.has('KeyR') || (mouse.clicked && inRect(W - 400, H - 80, 190, 44)))) this.reroll();
      if (pressed.has('Tab')) setScene(buildScene(this));
    },
    cardRect(i) { const n = this.cands.length; const w = 340, g = 40; const x0 = (W - (n * w + (n - 1) * g)) / 2; return { x: x0 + i * (w + g), y: 108, w, h: 512 }; },
    draw() {
      drawBackdrop(0.78);
      const now = nowS(), dt = Math.min(0.05, now - this.last); this.last = now;
      drawText(cfg.title, W / 2, 62, 48, '#fff', 'center');
      ornament(W / 2, cfg.sub ? 74 : 82, 260, '#8a5a9a');
      if (cfg.sub) drawText(cfg.sub, W / 2, 98, 24, UI.c.mut, 'center', false);
      if (cfg.rank) { ctx.save(); ctx.shadowColor = cfg.rank.color; ctx.shadowBlur = 14; chipBox(32, 28, 52, 52, cfg.rank.color); ctx.restore(); drawText(cfg.rank.k, 58, 68, 36, cfg.rank.color, 'center', false); }
      coinChip(W - 24, 24);
      this.cands.forEach((b, i) => {
        const c = this.cardRect(i);
        const k = clamp((this.t - i * 0.08) / 0.22, 0, 1), ek = 1 - Math.pow(1 - k, 3);
        this.hk[i] += ((this.hover === i ? 1 : 0) - this.hk[i]) * Math.min(1, dt * 14);
        ctx.save(); ctx.globalAlpha = ek; ctx.translate(0, (1 - ek) * 60);
        drawBoonCard(b, c.x, c.y, c.w, c.h, this.hk[i], i + 1, now + i * 0.7);
        ctx.restore();
      });
      // 已有强化：紧凑徽章
      ctx.fillStyle = 'rgba(12,6,24,.88)'; ctx.fillRect(0, H - 88, W, 88); ctx.fillStyle = '#3a2a4a'; ctx.fillRect(0, H - 88, W, 2);
      drawText('已有强化', 32, H - 38, 24, UI.c.mut);
      let x = 150;
      const uniq = [...new Set(run.boons)];
      for (const id of uniq) {
        const b = BOON[id]; const n = count(id);
        if (x + 40 > W - 440) { drawText(`+${uniq.length - uniq.indexOf(id)}`, x, H - 38, 24, UI.c.mut); break; }
        ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, H - 72, 44, 44); ctx.fillStyle = UI.Q[b.q]; ctx.fillRect(x, H - 70, 40, 40); ctx.fillStyle = '#150f22'; ctx.fillRect(x + 2, H - 68, 36, 36);
        drawIcon(b.icon, b.q, x + 20, H - 50, 1, 32);
        if (n > 1) drawText(`${n}`, x + 38, H - 28, 24, '#fff');
        x += 50;
      }
      if (!cfg.noReroll) {
        const rr = run.refresh > 0, hv = inRect(W - 400, H - 80, 190, 44);
        ctx.save(); if (rr) { ctx.shadowColor = 'rgba(255,179,71,.5)'; ctx.shadowBlur = 16; } ctx.fillStyle = UI.c.ink; ctx.fillRect(W - 404, H - 84, 198, 52); ctx.restore();
        ctx.fillStyle = rr ? (hv ? '#fff2b0' : '#FFB347') : '#2a2438'; ctx.fillRect(W - 400, H - 80, 190, 44);
        ctx.fillStyle = rr ? '#3a2810' : '#1a1428'; ctx.fillRect(W - 396, H - 76, 182, 36);
        drawText(`R 刷新 ${run.refresh}`, W - 305, H - 49, 24, rr ? '#FFD98A' : '#5a5f70', 'center', false);
      }
      drawText('Tab 构筑', W - 112, H - 49, 24, UI.c.mut, 'center', false);
    },
  };
}

const KEY_COL = ['#FF7A6A', '#6AB8FF', '#7DFF9A', '#FFD23A'];
function skillTag(b, cx, y) {
  const keys = ['U', 'I', 'O', 'P'];
  const sq = (k, x, col) => { ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 2, y - 2, 30, 30); ctx.fillStyle = col; ctx.fillRect(x, y, 26, 26); drawText(k, x + 13, y + 21, 24, '#150f22', 'center', false); };
  let label, ks = [];
  if (typeof b.skill === 'number') { label = HEROES[run.hero].skills[b.skill].name; ks = [b.skill]; }
  else if (b.skill === 'normal') { label = '普通技能'; ks = [0, 1, 2]; }
  else if (b.skill === 'basic') { label = '普攻'; ks = ['J']; }
  else if (b.skill === 'pet') label = '宠物';
  else if (b.type === 'myriad') label = '全部技能';
  else label = '属性';
  const w = ks.length * 32 + textW(label, 24) + 4;
  let x = cx - w / 2;
  for (const k of ks) { if (k === 'J') sq('J', x, '#CFD8E6'); else sq(keys[k], x, KEY_COL[k]); x += 32; }
  drawText(label, x + 2, y + 22, 24, UI.c.mut, 'left', false);
}
/* hv：悬停程度 0~1（平滑）；t：时间，用于高光扫过与图标环旋转 */
function drawBoonCard(b, x, y, w, h, hv, num, t = 0) {
  const col = UI.Q[b.q], qg = UI.QG[b.q];
  y -= Math.round(hv * 12);
  const cx = x + w / 2;
  ctx.save();
  ctx.shadowColor = qg.replace(/[\d.]+\)$/, `${0.35 + 0.45 * hv})`); ctx.shadowBlur = 22 + 22 * hv;
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.restore();
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  const bg = ctx.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#271a3c'); bg.addColorStop(0.5, '#1a1230'); bg.addColorStop(1, '#120c22');
  ctx.fillStyle = bg; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = qg.replace(/[\d.]+\)$/, '0.12)'); ctx.fillRect(x + 4, y + 4, w - 8, 150);
  pxCorners(x, y, w, h, col);
  ctx.fillStyle = UI.c.ink; for (const [px, py] of [[x + 2, y + 2], [x + w - 6, y + 2], [x + 2, y + h - 6], [x + w - 6, y + h - 6]]) ctx.fillRect(px, py, 4, 4);   // 角饰里的镂空点
  // 顶部：品质 + 类型
  const isEffect = b.type !== 'stat' && b.type !== 'myriad';
  let tx = x + 18;
  tx += tagChip(QUAL[b.q].name, tx, y + 16, col, true);
  const tag = b.type === 'core' ? '流派核心' : isEffect ? '质变强化' : '数值强化';
  tagChip(tag, tx, y + 16, isEffect || b.type === 'core' ? UI.c.accent : '#6a6288', false);
  // 图标盘
  const iy = y + 128;
  const g = ctx.createRadialGradient(cx, iy, 4, cx, iy, 74); g.addColorStop(0, qg.replace(/[\d.]+\)$/, '0.75)')); g.addColorStop(0.6, qg); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, iy, 74, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, iy); ctx.rotate(t * 0.5); ctx.strokeStyle = col; ctx.globalAlpha = 0.55 + 0.3 * hv; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  drawIcon(b.icon, b.q, cx, iy, 3 + 0.25 * hv, 48);
  drawText(b.name, cx, y + 248, 36, '#fff', 'center');
  skillTag(b, cx, y + 266);
  ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.fillRect(x + 40, y + 310, w - 80, 2); ctx.globalAlpha = 1;
  wrapText(b.desc, w - 48, 24).slice(0, 5).forEach((ln, i) => richLine(ln, cx, y + 346 + i * 28, 24, UI.c.txt));
  // 底部：状态 + 流派 + 序号
  ctx.fillStyle = '#3a2a4a'; ctx.fillRect(x + 20, y + h - 52, w - 40, 2);
  const have = count(b.id);
  let foot = '新获得', fcol = '#7DFF9A';
  if (b.type === 'stat') { foot = have ? `已叠加 ${have} 次` : '新获得'; fcol = have ? UI.c.accent : '#7DFF9A'; }
  else if (b.req) { const rid = [].concat(b.req)[0].split('|')[0]; foot = b.reqText || `需要「${BOON[rid].name}」`; fcol = UI.c.mut; }
  else if (b.type === 'link') { foot = '联动强化'; fcol = UI.Q[2]; }
  drawText(foot, x + 22, y + h - 18, 24, fcol, 'left', false);
  if (b.school) { const st = `${SCHOOLS[b.school].name}${b.type === 'core' ? '' : ' +0.5'}`; const sw = textW(st, 24) + 16; if (x + 22 + textW(foot, 24) + 12 + sw < x + w - 56) tagChip(st, x + w - 56 - sw, y + h - 42, SCHOOLS[b.school].color, false, 28); }
  ctx.fillStyle = UI.c.ink; ctx.fillRect(x + w - 44, y + h - 42, 30, 30); ctx.fillStyle = UI.c.accent; ctx.fillRect(x + w - 42, y + h - 40, 26, 26);
  drawText(String(num), x + w - 29, y + h - 19, 24, '#150f22', 'center', false);
  // 悬停高光扫过
  if (hv > 0.02) {
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 4, w - 8, h - 8); ctx.clip();
    const sx = x - 120 + ((t * 260) % (w + 360));
    ctx.globalAlpha = 0.16 * hv; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 50, y); ctx.lineTo(sx - 30, y + h); ctx.lineTo(sx - 80, y + h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

