'use strict';
/* 探索门 → 商店 / 神秘房间。规则见《肉鸽重设计方案》7.7、9.2、10。
   本文件只在 run.js 之后加载，所有函数通过 run.queue 的步骤接入流程。 */

const SHOP_PRICE = { 0: 30, 1: 55, 2: 90 };
const HEAL_PRICE = 40, TICKET_PRICE = 35, CORE_PRICE = 160;
const DOOR_SHOP_P = 0.4;
const SHOP_PER_STAGE = 1, MYSTERY_PER_STAGE = 2;

/* 同品质里抽一张当前可获得的强化，避开 excl 里已摆出的 */
function rollBoonQ(q, excl = [], flat = false) {
  const pool = BOONS.filter((b) => eligible(b, false) && !excl.includes(b));
  let c = pool.filter((b) => b.q === q);
  if (!c.length) c = pool;
  if (!c.length) return null;
  return flat ? c[Math.floor(Math.random() * c.length)] : wpick(c);
}
const stagePrice = (p) => Math.round(p * (1 + 0.05 * run.stage));

/* ---------------- 探索门 ---------------- */
function doorDest() {
  const d = run.doors;
  const shopOk = d.shop < SHOP_PER_STAGE, myOk = d.mystery < MYSTERY_PER_STAGE;
  if (!shopOk && !myOk) return 'coin';
  if (!shopOk) return 'mystery';
  if (!myOk) return 'shop';
  return Math.random() < DOOR_SHOP_P ? 'shop' : 'mystery';
}

function doorScene() {
  return {
    enter() { this.t = 0; this.out = false; },
    go(enter) {
      if (this.out) return;
      this.out = true;
      if (!enter) { nextStep(); return; }
      const dest = doorDest();
      if (dest === 'coin') { run.coins += 30; setScene(noticeScene('本关的商店与神秘房间都已探索过', '门后只有 30 试炼币', nextStep)); return; }
      run.doors[dest]++;
      if (bot.on) console.log(`[EXPLORE] door -> ${dest} stage=${run.stage + 1} doors=${run.doors.shop}/${run.doors.mystery}`);
      setScene(dest === 'shop' ? shopScene(nextStep) : mysteryScene(nextStep));
    },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.2) this.go(true); return; }
      if (this.t < 0.4) return;
      if (input.hit('confirm') || (mouse.clicked && inRect(W / 2 - 250, 590, 220, 64))) this.go(true);
      else if (pressed.has('Escape') || (mouse.clicked && inRect(W / 2 + 30, 590, 220, 64))) this.go(false);
    },
    draw() {
      drawBackdrop(0.86);
      const cx = W / 2, top = 100, t = this.t;
      const k = clamp(t / 0.6, 0, 1), breathe = 0.5 + 0.5 * Math.sin(t * 2.2);
      const dw = 210, dh = 310, dx = cx - dw / 2, gy = top + dh;
      // 门缝透出的扇形光线
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.16 + Math.sin(t * 0.7 + i) * 0.02, len = 360 + 40 * breathe;
        const g = ctx.createLinearGradient(cx, top + dh * 0.55, cx + Math.sin(a) * len, top + dh * 0.55 - Math.cos(a) * len * 0.3 + 120);
        g.addColorStop(0, `rgba(255,214,120,${0.28 * k})`); g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 6, top + dh * 0.55); ctx.lineTo(cx + 6, top + dh * 0.55);
        ctx.lineTo(cx + 6 + Math.sin(a) * len + 40, gy + 80); ctx.lineTo(cx - 6 + Math.sin(a) * len - 40, gy + 80); ctx.closePath(); ctx.fill();
      }
      const halo = ctx.createRadialGradient(cx, top + dh / 2, 20, cx, top + dh / 2, 300);
      halo.addColorStop(0, `rgba(255,190,80,${(0.28 + 0.14 * breathe) * k})`); halo.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // 石质门框（拱顶）
      ctx.fillStyle = UI.c.ink; ctx.fillRect(dx - 30, top - 30, dw + 60, dh + 38);
      ctx.fillStyle = '#3c3050'; ctx.fillRect(dx - 22, top - 22, dw + 44, dh + 30);
      ctx.fillStyle = '#2a2040'; for (let i = 0; i < 5; i++) ctx.fillRect(dx - 22, top - 22 + i * 64, dw + 44, 3);
      ctx.fillStyle = '#0a0612'; ctx.fillRect(dx, top, dw, dh);
      // 两扇门：随时间微微向两侧打开一条缝，缝里是光
      const gap = 6 + 4 * breathe + 10 * k;
      ctx.fillStyle = `rgba(255,226,150,${0.75 + 0.2 * breathe})`; ctx.fillRect(cx - gap / 2, top + 6, gap, dh - 6);
      for (const s of [-1, 1]) {
        const lx = s < 0 ? dx + 6 : cx + gap / 2, lw = dw / 2 - gap / 2 - 6;
        ctx.fillStyle = '#4a3418'; ctx.fillRect(lx, top + 6, lw, dh - 6);
        ctx.fillStyle = '#5e4422'; ctx.fillRect(lx + 4, top + 12, lw - 8, dh - 18);
        ctx.fillStyle = '#3a2810'; for (let i = 1; i < 6; i++) ctx.fillRect(lx + 4, top + 12 + i * ((dh - 18) / 6), lw - 8, 3);
        ctx.fillStyle = '#B8902A'; ctx.fillRect(s < 0 ? lx + lw - 14 : lx + 4, top + dh / 2 - 12, 10, 24);   // 门环
      }
      drawText('探索门', cx, gy + 70, 48, '#FFD98A', 'center');
      ornament(cx, gy + 86, 120, '#B8902A');
      drawText('S 评分奖励：门后是一家商店，或一个神秘房间。', cx, gy + 124, 24, UI.c.txt, 'center', false);
      drawText('不进入没有任何惩罚。', cx, gy + 154, 24, UI.c.mut, 'center', false);
      if (t > 0.4) {
        fancyBtn(cx - 250, 590, 220, 64, 'Enter 进入', true);
        fancyBtn(cx + 30, 590, 220, 64, 'Esc 离开', false);
      }
    },
  };
}

function noticeScene(title, sub, next) {
  return {
    enter() { this.t = 0; },
    update(dt) { this.t += dt; if (bot.on || (this.t > 0.5 && (input.hit('confirm') || mouse.clicked))) next(); },
    draw() {
      drawBackdrop(0.88);
      const k = clamp(this.t / 0.3, 0, 1), ek = 1 - Math.pow(1 - k, 3);
      ctx.save(); ctx.globalAlpha = ek; ctx.translate(0, (1 - ek) * 24);
      const hw = 300 * ek;
      ctx.fillStyle = 'rgba(14,8,28,.82)'; ctx.fillRect(W / 2 - 440, 250, 880, 150);
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(W / 2 - 440, 250, 880, 2); ctx.fillRect(W / 2 - 440, 398, 880, 2);
      drawText(title, W / 2, 306, 36, '#fff', 'center');
      ornament(W / 2, 324, hw, '#8a5a9a');
      drawText(sub, W / 2, 368, 24, UI.c.txt, 'center');
      ctx.restore();
      if (this.t > 0.5 && Math.floor(this.t * 2) % 2 === 0) drawText('Enter 继续', W / 2, 560, 24, UI.c.accent, 'center');
    },
  };
}

/* ---------------- 商店 ---------------- */
const SHOP_TIER = [[0, 45], [1, 35], [2, 20]];
function shopRollItem(stock) {
  const exclB = stock.filter((s) => s && s.b).map((s) => s.b);
  const r = Math.random();
  if (r < 0.1) return { kind: 'heal', name: '恢复卡', desc: '立即回复 25% 最大生命。', icon: 'heart-bottle', q: 1, price: stagePrice(HEAL_PRICE) };
  if (r < 0.18) return { kind: 'ticket', name: '刷新券', desc: '强化三选一时多一次刷新机会。', icon: 'cycle', q: 1, price: stagePrice(TICKET_PRICE) };
  if (r < 0.24 && !run.shopCoreSeen) {
    const cs = BOONS.filter((b) => eligible(b, true) && !count(b.id) && !exclB.includes(b));
    if (cs.length) { const b = wpick(cs); run.shopCoreSeen = true; return { kind: 'boon', b, price: stagePrice(CORE_PRICE) }; }
  }
  if (r < 0.30 && petSlots() < 2) {
    const ps = ['pet_wolf', 'pet_raven', 'pet_stone'].map((id) => BOON[id]).filter((b) => b.q && !count(b.id) && !(b.id === 'pet_wolf' && count('p_core')) && !exclB.includes(b));
    if (ps.length) { const b = ps[Math.floor(Math.random() * ps.length)]; return { kind: 'boon', b, price: stagePrice(90) }; }
  }
  const q = pickW(SHOP_TIER);
  const b = rollBoonQ(q, exclB);
  if (!b) return { kind: 'heal', name: '恢复卡', desc: '立即回复 25% 最大生命。', icon: 'heart-bottle', q: 1, price: stagePrice(HEAL_PRICE) };
  return { kind: 'boon', b, price: stagePrice(SHOP_PRICE[b.q] != null ? SHOP_PRICE[b.q] : 90) };
}
const refreshCost = (n) => 15 + 10 * n;

function shopScene(next) {
  return {
    enter() {
      this.t = 0; this.out = false; this.nref = 0; this.toast = null; this.toastT = 0; this.hover = -1; this.bought = 0;
      this.stock = [];
      this.rob = 0; this.robT = 0;
      if (run.robbed) this.stock.push({ kind: 'heal', name: '恢复卡', desc: '商人已被洗劫一空，只剩这张免费的恢复卡。回复 25% 最大生命。', icon: 'heart-bottle', q: 1, price: 0 });
      else for (let i = 0; i < 3; i++) this.stock.push(shopRollItem(this.stock));
    },
    leave() { if (this.out) return; this.out = true; next(); },
    say(t, c) { this.toast = t; this.toastC = c || UI.c.txt; this.toastT = 1.6; },
    buy(i) {
      const it = this.stock[i];
      if (!it) return;
      if (run.coins < it.price) { this.say('试炼币不足', UI.c.danger); return; }
      run.coins -= it.price;
      if (window.sfx) sfx.play('coin');
      this.bought++;
      if (bot.on) console.log(`[EXPLORE] buy ${it.kind} ${it.b ? it.b.id : ''} price=${it.price} coins=${run.coins}`);
      if (it.kind === 'boon') { grantBoon(it.b.id); this.say(`获得「${it.b.name}」`, UI.Q[it.b.q]); }
      else if (it.kind === 'heal') { const h = healRun(0.25); this.say(`回复 ${h} 生命`, UI.c.ok || '#8affd0'); }
      else { run.refresh++; this.say('获得 1 次强化刷新', UI.Q[1]); }
      const rest = this.stock.slice(); rest[i] = null;
      this.stock[i] = run.robbed ? null : shopRollItem(rest);
    },
    reroll() {
      if (run.robbed) return;
      const c = refreshCost(this.nref);
      if (run.coins < c) { this.say('试炼币不足', UI.c.danger); return; }
      run.coins -= c; this.nref++;
      this.stock = [];
      for (let i = 0; i < 3; i++) this.stock.push(shopRollItem(this.stock));
      this.say('货架已刷新', UI.c.txt);
    },
    cardRect(i) { const w = 300, g = 36, n = this.stock.length, x0 = (W - (n * w + (n - 1) * g)) / 2; return { x: x0 + i * (w + g), y: 122, w, h: 440 }; },
    hitMerchant() {
      if (run.robbed) return;
      if (this.t - this.robT > 2) this.rob = 0;
      this.robT = this.t; this.rob++;
      if (this.rob >= 3) { this.startRob(); return; }
      this.say(this.rob === 1 ? '商人警惕地看着你（1/3）' : '再来一下就是劫道了！（2/3）', UI.c.danger);
    },
    startRob() {
      if (this.out) return;
      this.out = true;
      const stock = this.stock.filter(Boolean);
      setScene(noticeScene('劫道！', '击败流浪商人，货架上的商品全归你；但他之后不会再卖东西。', () => startExtraBattle({ type: 'elite', reward: 'coin', rob: true, robStock: stock })));
    },
    update(dt) {
      this.t += dt; this.toastT -= dt;
      if (bot.on) {
        if (params.get('robtest') && this.t > 0.15) { this.startRob(); return; }
        if (this.t > 0.15 && this.bought < 3) {
          const ok = this.stock.map((s, i) => [s, i]).filter(([s]) => s && s.price <= run.coins);
          if (ok.length) { this.buy(ok[Math.floor(Math.random() * ok.length)][1]); this.t = 0; return; }
        }
        if (this.t > 0.15) this.leave();
        return;
      }
      if (this.t < 0.3) return;
      this.hover = -1;
      if (mouse.clicked && inRect(24, 450, 130, 170)) { this.hitMerchant(); return; }
      for (let i = 0; i < this.stock.length; i++) { if (!this.stock[i]) continue; const c = this.cardRect(i); if (inRect(c.x, c.y, c.w, c.h)) { this.hover = i; if (mouse.clicked) { this.rob = 0; this.buy(i); return; } } }
      for (let i = 0; i < this.stock.length; i++) if (this.stock[i] && pressed.has('Digit' + (i + 1))) { this.rob = 0; this.buy(i); return; }
      if (pressed.has('KeyR') || (mouse.clicked && inRect(W - 440, H - 92, 220, 56))) this.reroll();
      if (pressed.has('Escape') || (mouse.clicked && inRect(W - 200, H - 92, 176, 56))) this.leave();
      if (pressed.has('Tab')) setScene(buildScene(this));
    },
    draw() {
      drawBackdrop(0.8);
      drawText('流浪商人', W / 2, 78, 48, '#fff', 'center');
      drawText('买走一件后会补货　·　只能通过探索门进入', W / 2, 108, 24, UI.c.mut, 'center', false);
      coinChip(W - 24, 28);
      drawSprite('pets/merchant.png', 90, H - 112, 150, false, run.robbed ? 0.45 : 1);
      if (!run.robbed) drawText('连点 3 次 = 劫道', 90, H - 124 - 150 + 8, 24, UI.c.mut, 'center', false);
      this.stock.forEach((it, i) => {
        if (!it) return;
        const c = this.cardRect(i);
        const k = clamp((this.t - i * 0.07) / 0.2, 0, 1);
        ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 36);
        this.drawItem(it, c, this.hover === i, i + 1);
        ctx.restore();
      });
      if (this.toastT > 0 && this.toast) drawText(this.toast, W / 2, 600, 36, this.toastC, 'center');
      pxPanel(24, H - 100, W - 48, 76, { fill: 'rgba(14,14,22,.92)' });
      drawText(`已有强化 ${run.boons.length}`, 48, H - 52, 24, UI.c.mut);
      drawText(`生命 ${run.hp} / ${runMaxHp()}`, 240, H - 52, 24, UI.c.txt);
      const rc = refreshCost(this.nref), can = run.coins >= rc;
      pxButton(W - 440, H - 92, 220, 56, `R 刷新货架 ${rc}`, { edge: can ? UI.c.accent : undefined, color: can ? UI.c.accent : UI.c.mut });
      pxButton(W - 200, H - 92, 176, 56, 'Esc 离开');
      drawText('Tab 构筑', W - 460, H - 52, 24, UI.c.mut, 'right', false);
    },
    drawItem(it, c, hover, num) {
      const q = it.kind === 'boon' ? it.b.q : it.q;
      const col = UI.Q[q];
      const afford = run.coins >= it.price;
      const y = c.y + (hover ? -8 : 0);
      pxPanel(c.x, y, c.w, c.h, { edge: col, fill: '#1a1a28', glow: UI.QG[q].replace(/[\d.]+\)$/, hover ? '0.7)' : '0.35)'), glowBlur: hover ? 32 : 20 });
      pxCorners(c.x, y, c.w, c.h, col);
      const icon = it.kind === 'boon' ? it.b.icon : it.icon;
      const name = it.kind === 'boon' ? it.b.name : it.name;
      const desc = it.kind === 'boon' ? it.b.desc : it.desc;
      const tag = it.kind === 'boon' ? `${QUAL[q].name}${it.b.type === 'core' ? ' · 流派核心' : it.b.type === 'stat' || it.b.type === 'myriad' ? ' · 数值' : ' · 质变'}` : '道具';
      drawText(tag, c.x + 20, y + 42, 24, col, 'left', false);
      if (it.kind === 'boon' && it.b.school) drawText(SCHOOLS[it.b.school].name, c.x + c.w - 20, y + 42, 24, SCHOOLS[it.b.school].color, 'right', false);
      const g = ctx.createRadialGradient(c.x + c.w / 2, y + 120, 4, c.x + c.w / 2, y + 120, 80);
      g.addColorStop(0, UI.QG[q]); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(c.x + c.w / 2 - 90, y + 50, 180, 150);
      drawIcon(icon, q, c.x + c.w / 2, y + 120, 3, 48);
      drawText(name, c.x + c.w / 2, y + 234, 36, '#fff', 'center');
      const lines = wrapText(desc, c.w - 40, 24);
      lines.slice(0, 4).forEach((ln, i) => drawText(i === 3 && lines.length > 4 ? ln.slice(0, -1) + '…' : ln, c.x + c.w / 2, y + 272 + i * 29, 24, UI.c.txt, 'center', false));
      ctx.fillStyle = UI.c.edge; ctx.fillRect(c.x + 20, y + c.h - 62, c.w - 40, 2);
      drawIcon('coins', 3, c.x + 40, y + c.h - 30, 1, 32);
      drawText(String(it.price), c.x + 66, y + c.h - 20, 36, afford ? UI.Q[3] : UI.c.danger, 'left');
      drawText(String(num), c.x + c.w - 20, y + c.h - 20, 24, UI.c.accent, 'right', false);
    },
  };
}

/* ---------------- 工具 ---------------- */
const PETS_ON = false;   // 大房间里还没有宠物系统：商店不卖、神秘房间不出宠物之洞
const petSlots = () => (PETS_ON ? (count('p_core') || count('pet_wolf') ? 1 : 0) + (count('pet_raven') ? 1 : 0) + (count('pet_stone') ? 1 : 0) : 9);

/* 失去强化不能破坏其他已持有强化的前置 */
function canRemove(id) {
  const b = BOON[id];
  if (!b || b.type === 'core' || count(id) < 1) return false;
  if (count(id) > 1) return true;
  for (const oid of new Set(run.boons)) {
    const ob = BOON[oid];
    if (!ob.req) continue;
    for (const r of [].concat(ob.req)) {
      const alts = r.split('|');
      if (alts.includes(id) && !alts.some((x) => x !== id && count(x) > 0)) return false;
    }
  }
  return true;
}
function removeBoon(id) {
  const i = run.boons.indexOf(id);
  if (i < 0) return;
  run.boons.splice(i, 1);
  run.hp = clamp(run.hp, 1, runMaxHp());
}
const ownedChips = () => [...new Set(run.boons)].map((id) => ({ b: BOON[id], n: count(id) }));
function nextTierBoon(q, excl, flat) {
  const t = Math.min(q + 1, 3);
  if (t === 3) {
    const cs = BOONS.filter((b) => eligible(b, true) && !count(b.id) && !excl.includes(b));
    if (cs.length) return flat ? cs[Math.floor(Math.random() * cs.length)] : wpick(cs);
    return rollBoonQ(2, excl, flat);
  }
  return rollBoonQ(t, excl, flat);
}
function nextTierThree(q, excl) {
  const out = [];
  for (let i = 0; i < 3; i++) { const b = nextTierBoon(q, excl.concat(out)); if (b) out.push(b); }
  return out;
}

/* 额外战斗（劫道、强敌挑战、古战场）：打完回到原来的流程，不影响进下一关 */
function startExtraBattle(n) {
  if (!run.nodeBack) run.nodeBack = run.node;
  n.extra = true;
  if (n.col == null) n.col = -1;
  if (!n.next) n.next = [];
  startNodeBattle(n);
}

function godStrike() {
  if (world.state !== 'play' || world.player.dead) return;
  const p = world.player;
  world.shake = Math.max(world.shake, 0.5);
  world.slow = Math.max(world.slow, 0.5);
  for (const e of liveEnemies()) { damageEnemy(e, pAtk(p) * 7, { noCrit: true, dot: true, kb: 200, label: '幻神', color: '#ffd23a' }); burst(e.x, FLOOR - e.def.h * 0.5, '#ffd23a', 16, 300); ringFx(e.x, FLOOR - 20, '#ffd23a', 200, 0.4); }
  floatText(p.x, FLOOR - HERO_H - 60, '幻神降临！', '#ffd23a', 36);
}

function robRewardScene(stock) {
  run.robbed = true;
  const got = [];
  for (const it of stock) {
    if (it.kind === 'boon') { grantBoon(it.b.id); got.push(`「${it.b.name}」`); }
    else if (it.kind === 'heal') { healRun(0.25); got.push('恢复卡'); }
    else { run.refresh++; got.push('刷新券'); }
  }
  return noticeScene('劫道成功', `获得货架上的全部商品：${got.join('、') || '（空）'}。之后商人不再出售商品。`, nextStep);
}

/* ---------------- 神秘房间 ---------------- */
function forgePairs() {
  const chips = ownedChips().filter((c) => c.b.q <= 2 && c.b.type !== 'core' && canRemove(c.b.id));
  const byQ = {};
  for (const c of chips) byQ[c.b.q] = (byQ[c.b.q] || 0) + c.n;
  return Object.values(byQ).some((n) => n >= 2);
}
function mysteryScene(next) {
  const seen = run.rooms || (run.rooms = {});
  const st = run.stage;
  const list = [['bless', 3], ['event', 3]];
  if (petSlots() < 2) list.push(['pet', 2]);
  if (st >= 1) {
    if (!seen.god) list.push(['god', 2]);
    if (!seen.altar && ownedChips().some((c) => canRemove(c.b.id))) list.push(['altar', 2]);
    if (!seen.forge && forgePairs()) list.push(['forge', 2]);
    list.push(['mini', 2], ['challenge', 1]);
  }
  const k = params.get('room') || pickW(list);
  if (bot.on) console.log(`[EXPLORE] room ${k}`);
  if (k === 'god' || k === 'altar' || k === 'forge') seen[k] = true;
  if (k === 'event') return eventScene(next);
  if (k === 'pet') return petCaveScene(next);
  if (k === 'god') return godScene(next);
  if (k === 'altar') return altarScene(next);
  if (k === 'forge') return forgeScene(next);
  if (k === 'mini') return miniRoomScene(next);
  if (k === 'challenge') return noticeScene('强敌挑战', '击败一支精英小队，额外获得一个宝箱。', () => startExtraBattle({ type: 'elite', reward: 'purple', challenge: true }));
  const roll = () => { const a = rollBoonQ(1), b = rollBoonQ(2, a ? [a] : []); return [a, b].filter(Boolean); };
  return pickScene({ kind: 'boon', title: '神秘房间 · 祝福', noReroll: true, cands: roll, onDone: next, sub: '无需战斗，二选一（一个精良，一个稀有）' });
}

/* 宠物之洞：免费三选一 */
function petCaveScene(next) {
  const PETS = [
    { id: 'pet_wolf', img: 'pets/wolf.png', name: '幼狼', desc: '自动攻击，伤害为玩家攻击的 30%。可进化为狼王、月狼。' },
    { id: 'pet_raven', img: 'pets/raven.png', name: '灵鸦', desc: '伴飞，移动速度 +12%。可进化为神鸦。' },
    { id: 'pet_stone', img: 'pets/stone.png', name: '石灵', desc: '替你承受伤害（最大生命的 30%），被击毁后 20 秒复活。可进化为守护石像。' },
  ];
  return {
    enter() { this.t = 0; this.out = false; this.hover = -1; this.list = PETS.filter((p) => !count(p.id) && !(p.id === 'pet_wolf' && count('p_core'))); if (!this.list.length) setTimeout(next, 0); },
    rect(i) { const n = this.list.length, w = 300, g = 36, x0 = (W - (n * w + (n - 1) * g)) / 2; return { x: x0 + i * (w + g), y: 130, w, h: 440 }; },
    pick(i) {
      const p = this.list[i];
      if (!p || this.out) return;
      this.out = true;
      grantBoon(p.id);
      setScene(boonGetScene(BOON[p.id], next));
    },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.2) this.pick(Math.floor(Math.random() * this.list.length)); return; }
      if (this.t < 0.3) return;
      this.hover = -1;
      for (let i = 0; i < this.list.length; i++) { const c = this.rect(i); if (inRect(c.x, c.y, c.w, c.h)) { this.hover = i; if (mouse.clicked) { this.pick(i); return; } } }
      for (let i = 0; i < this.list.length; i++) if (pressed.has('Digit' + (i + 1))) { this.pick(i); return; }
    },
    draw() {
      drawBackdrop(0.8);
      drawText('神秘房间 · 宠物之洞', W / 2, 78, 48, '#fff', 'center');
      drawText('免费选择一只同伴（最多同时携带 2 只）', W / 2, 108, 24, UI.c.mut, 'center', false);
      this.list.forEach((p, i) => {
        const c = this.rect(i), hv = this.hover === i, y = c.y + (hv ? -8 : 0);
        const col = UI.Q[2];
        pxPanel(c.x, y, c.w, c.h, { edge: col, fill: '#1a1a28', glow: UI.QG[2].replace(/[\d.]+\)$/, hv ? '0.7)' : '0.35)'), glowBlur: hv ? 32 : 20 });
        pxCorners(c.x, y, c.w, c.h, col);
        const g = ctx.createRadialGradient(c.x + c.w / 2, y + 150, 4, c.x + c.w / 2, y + 150, 120);
        g.addColorStop(0, UI.QG[2]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(c.x + 10, y + 40, c.w - 20, 220);
        drawSprite(p.img, c.x + c.w / 2, y + 230, 150, false);
        drawText(p.name, c.x + c.w / 2, y + 290, 36, '#fff', 'center');
        wrapText(p.desc, c.w - 40, 24).slice(0, 4).forEach((ln, k) => drawText(ln, c.x + c.w / 2, y + 328 + k * 29, 24, UI.c.txt, 'center', false));
        drawText(String(i + 1), c.x + c.w - 20, y + c.h - 18, 24, UI.c.accent, 'right', false);
      });
    },
  };
}

/* 幻神房间：花币祈祷，成功率逐次提高 */
function godScene(next) {
  const COST = 5, MAXN = 8;
  return {
    enter() { this.t = 0; this.out = false; this.tries = 0; this.rate = 0.35; this.msg = '向幻神祈祷吧。'; this.done = false; this.flash = 0; },
    pray() {
      if (this.done || this.tries >= MAXN || run.coins < COST) return;
      run.coins -= COST; this.tries++;
      if (Math.random() < this.rate) {
        this.done = true; this.flash = 1;
        if (Math.random() < 0.5) { const g = 40 + Math.floor(Math.random() * 41); run.coins += g; this.msg = `幻神回应了你，赐予 ${g} 试炼币！`; }
        else { run.godAssist = true; this.msg = '幻神回应了你：下一场战斗中，幻神会降下一次全屏打击！'; }
      } else { this.rate = Math.min(1, this.rate + 0.1); this.msg = `毫无回应……（成功率提高到 ${Math.round(this.rate * 100)}%）`; }
    },
    leave() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt; this.flash = Math.max(0, this.flash - dt);
      if (bot.on) { if (!this.done && this.tries < MAXN && run.coins >= COST && this.t > 0.05) { this.pray(); this.t = 0; return; } if (this.t > 0.15) this.leave(); return; }
      if (this.t < 0.3) return;
      if (input.hit('confirm') || (mouse.clicked && inRect(W / 2 - 250, 560, 220, 64))) this.pray();
      if (pressed.has('Escape') || (mouse.clicked && inRect(W / 2 + 30, 560, 220, 64))) this.leave();
    },
    draw() {
      drawBackdrop(0.82);
      coinChip(W - 24, 28);
      drawText('神秘房间 · 幻神', W / 2, 78, 48, '#fff', 'center');
      const cx = W / 2, cy = 270;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260 + this.flash * 160);
      g.addColorStop(0, `rgba(255,210,58,${0.3 + this.flash * 0.4})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      drawIcon('sun', 3, cx, cy, 5, 48, 0.95);
      drawText(this.msg, cx, 440, 36, '#fff', 'center');
      drawText(`每次祈祷 ${COST} 试炼币　当前成功率 ${Math.round(this.rate * 100)}%　已祈祷 ${this.tries} / ${MAXN} 次`, cx, 486, 24, UI.c.mut, 'center', false);
      drawText('成功：40~80 试炼币，或幻神在下一场战斗助战（全屏伤害）', cx, 520, 24, UI.c.mut, 'center', false);
      const can = !this.done && this.tries < MAXN && run.coins >= COST;
      pxButton(cx - 250, 560, 220, 64, 'Enter 祈祷', { disabled: !can, edge: can ? UI.c.accent : undefined, color: UI.c.accent });
      pxButton(cx + 30, 560, 220, 64, 'Esc 离开');
    },
  };
}

/* 选择已有强化的网格，祭献之间与合成之间共用 */
function gridRect(i, cols) { const col = i % cols, row = Math.floor(i / cols); return { x: 48 + col * 232, y: 150 + row * 64, w: 220, h: 54 }; }
function drawGridChip(c, r, o) {
  const col = UI.Q[c.b.q];
  chipBox(r.x, r.y, r.h, r.w, o.sel ? '#fff' : o.ok ? col : '#2a2a38');
  ctx.save(); ctx.globalAlpha = o.ok ? 1 : 0.4;
  drawIcon(c.b.icon, c.b.q, r.x + 28, r.y + r.h / 2, 1, 32);
  drawText(c.b.name + (c.n > 1 ? `×${c.n}` : ''), r.x + 54, r.y + 36, 24, col, 'left', false);
  ctx.restore();
}

function altarScene(next) {
  return {
    enter() { this.t = 0; this.out = false; this.sel = -1; this.items = ownedChips().filter((c) => c.b.type !== 'core'); },
    ok(c) { return canRemove(c.b.id); },
    confirm() {
      const c = this.items[this.sel];
      if (!c || this.out || !this.ok(c)) return;
      this.out = true;
      const b = c.b;
      removeBoon(b.id);
      setScene(pickScene({ kind: 'boon', title: '祭献 · 高一档强化三选一', noReroll: true, cands: () => nextTierThree(b.q, [b]), onDone: next, sub: `献出了「${b.name}」` }));
    },
    leave() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt;
      if (bot.on) { if (this.t > 0.15) { const i = this.items.findIndex((c) => this.ok(c)); if (i >= 0) { this.sel = i; this.confirm(); } else this.leave(); } return; }
      if (this.t < 0.3) return;
      for (let i = 0; i < this.items.length; i++) { const r = gridRect(i, 5); if (mouse.clicked && inRect(r.x, r.y, r.w, r.h) && this.ok(this.items[i])) this.sel = i; }
      if (this.sel >= 0 && (input.hit('confirm') || (mouse.clicked && inRect(W / 2 - 250, 590, 220, 64)))) this.confirm();
      if (pressed.has('Escape') || (mouse.clicked && inRect(W / 2 + 30, 590, 220, 64))) this.leave();
    },
    draw() {
      drawBackdrop(0.82);
      drawText('神秘房间 · 祭献之间', W / 2, 78, 48, '#fff', 'center');
      drawText('献出 1 个已有强化，换取高一档品质的强化三选一（灰色的是其他强化的前置，不能献出）', W / 2, 112, 24, UI.c.mut, 'center', false);
      this.items.forEach((c, i) => drawGridChip(c, gridRect(i, 5), { sel: i === this.sel, ok: this.ok(c) }));
      const c = this.items[this.sel];
      if (c) {
        pxPanel(48, 500, W - 96, 70, { edge: UI.Q[c.b.q], fill: '#12121b' });
        drawText(`献出「${c.b.name}」：${c.b.desc}`.slice(0, 52), 72, 545, 24, UI.c.txt, 'left', false);
        pxButton(W / 2 - 250, 590, 220, 64, 'Enter 献祭', { edge: UI.c.accent, color: UI.c.accent });
      } else drawText('点击选择要献出的强化', W / 2, 545, 24, UI.c.mut, 'center', false);
      pxButton(W / 2 + 30, 590, 220, 64, 'Esc 离开');
    },
  };
}

function forgeScene(next) {
  return {
    enter() { this.t = 0; this.out = false; this.sel = []; this.cache = {}; this.toast = ''; this.toastT = 0; this.items = ownedChips().filter((c) => c.b.q <= 2 && c.b.type !== 'core'); },
    ok(c) { return canRemove(c.b.id); },
    toggle(i) {
      const c = this.items[i];
      if (!this.ok(c)) return;
      const id = c.b.id, have = this.sel.filter((x) => x === id).length;
      if (have && (c.n < 2 || have >= 2 || this.sel.length === 2)) { this.sel.splice(this.sel.indexOf(id), 1); return; }
      if (have && c.n >= 2 && this.sel.length < 2) { this.sel.push(id); return; }
      if (this.sel.length === 2) return;
      if (this.sel.length === 1 && BOON[this.sel[0]].q !== c.b.q) { this.toast = '需要选择同品质的强化'; this.toastT = 1.5; return; }
      this.sel.push(id);
    },
    preview() {
      if (this.sel.length !== 2) return null;
      const key = this.sel.slice().sort().join('+');
      if (!(key in this.cache)) {
        const q = BOON[this.sel[0]].q;
        this.cache[key] = nextTierBoon(q, this.sel.map((id) => BOON[id]), Math.random() < 0.3);
      }
      return this.cache[key];
    },
    confirm() {
      const r = this.preview();
      if (!r || this.out) return;
      this.out = true;
      for (const id of this.sel) removeBoon(id);
      grantBoon(r.id);
      setScene(boonGetScene(r, next));
    },
    leave() { if (this.out) return; this.out = true; next(); },
    update(dt) {
      this.t += dt; this.toastT -= dt;
      if (bot.on) {
        if (this.t > 0.15) {
          const byQ = {};
          for (const c of this.items) if (this.ok(c)) for (let k = 0; k < c.n; k++) (byQ[c.b.q] = byQ[c.b.q] || []).push(c.b.id);
          const g = Object.values(byQ).find((a) => a.length >= 2);
          if (g) { this.sel = [g[0], g[1]]; this.confirm(); } else this.leave();
        }
        return;
      }
      if (this.t < 0.3) return;
      for (let i = 0; i < this.items.length; i++) { const r = gridRect(i, 4); if (mouse.clicked && inRect(r.x, r.y, r.w, r.h)) this.toggle(i); }
      if (this.sel.length === 2 && (input.hit('confirm') || (mouse.clicked && inRect(W / 2 - 250, 590, 220, 64)))) this.confirm();
      if (pressed.has('Escape') || (mouse.clicked && inRect(W / 2 + 30, 590, 220, 64))) this.leave();
    },
    draw() {
      drawBackdrop(0.82);
      drawText('神秘房间 · 合成之间', W / 2, 78, 48, '#fff', 'center');
      drawText('选择 2 个同品质的强化，合成为高一档品质的随机强化；约 30% 概率结果不属于当前流派', W / 2, 112, 24, UI.c.mut, 'center', false);
      this.items.forEach((c, i) => drawGridChip(c, gridRect(i, 4), { sel: this.sel.includes(c.b.id), ok: this.ok(c) }));
      const r = this.preview();
      pxPanel(1000, 140, 236, 400, { edge: r ? UI.Q[r.q] : '#2a2a38', fill: '#12121b' });
      if (r) {
        drawText('合成结果', 1118, 180, 24, UI.c.mut, 'center', false);
        drawIcon(r.icon, r.q, 1118, 250, 3, 48);
        drawText(r.name, 1118, 330, 36, '#fff', 'center');
        drawText(QUAL[r.q].name, 1118, 362, 24, UI.Q[r.q], 'center', false);
        wrapText(r.desc, 200, 24).slice(0, 5).forEach((ln, k) => drawText(ln, 1118, 400 + k * 29, 24, UI.c.txt, 'center', false));
      } else drawText('选满 2 个后显示', 1118, 340, 24, UI.c.mut, 'center', false);
      if (this.toastT > 0) drawText(this.toast, 500, 560, 24, UI.c.danger, 'center');
      const can = this.sel.length === 2;
      pxButton(W / 2 - 250, 590, 220, 64, 'Enter 合成', { disabled: !can, edge: can ? UI.c.accent : undefined, color: UI.c.accent });
      pxButton(W / 2 + 30, 590, 220, 64, 'Esc 离开');
    },
  };
}

/* 小游戏：成绩换币或强化 */
function miniRoomScene(next) {
  const pick = ['chop', 'dodge', 'memory'][Math.floor(Math.random() * 3)];
  if (bot.on) console.log(`[EXPLORE] mini ${pick}`);
  const fn = { chop: miniChopScene, dodge: miniDodgeScene, memory: miniMemoryScene }[pick];
  return fn((grade) => setScene(miniRewardScene(pick, grade, next)));
}
function miniRewardScene(pick, grade, next) {
  const T = { chop: { good: ['boon', 1], ok: ['coin', 30] }, dodge: { good: ['boon', 2], ok: ['coin', 40] }, memory: { good: ['boon', 1], ok: ['coin', 30] } }[pick];
  const r = T[grade] || ['coin', 0];
  const name = { good: '优秀', ok: '良好', fail: '失败' }[grade];
  if (r[0] === 'boon') {
    const b = rollBoonQ(r[1]);
    if (b) { grantBoon(b.id); return boonGetScene(b, next); }
    run.coins += 30;
    return noticeScene(`成绩：${name}`, '没有可获得的强化，换成 30 试炼币。', next);
  }
  run.coins += r[1];
  return noticeScene(`成绩：${name}`, r[1] ? `获得 ${r[1]} 试炼币` : '没有奖励，也没有惩罚。', next);
}
