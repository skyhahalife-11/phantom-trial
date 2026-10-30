'use strict';

const bot = { on: !!params.get('bot'), cool: 0, think: 0 };

function botDrive(dt) {
  const p = world.player;
  virt.left = virt.right = virt.attack = virt.down = false;
  if (!p || p.dead || world.state !== 'play') return;
  const es = liveEnemies();
  if (!es.length) return;
  bot.cool -= dt;
  bot.think -= dt;
  const near = nearestEnemy(p.x);
  const dist = Math.abs(near.x - p.x);
  const reach = p.def.ranged ? p.def.reach * 0.75 : p.def.reach * 0.85;

  if (p.y > 0) {
    if (dist < reach * 1.3) virt.attack = true;
    if (p.y > 150 && p.vz < 0 && !es.some((e) => e.y > 0) && Math.random() < 0.08) { virt.down = true; pulse.add('attack'); }
    return;
  }
  if (!p.def.ranged && dist < reach * 1.3 && es.some((e) => e.y > 80 && Math.abs(e.x - p.x) < 260) && Math.random() < 0.3) { pulse.add('jump'); return; }

  let danger = null;
  for (const h of world.hazards) {
    const left = h.delay - h.t;
    if (left < 0.5 && left > -h.active && overlap(p.x - 45, p.x + 45, h.x0, h.x1)) { danger = h; break; }
  }
  if (danger) {
    const left = danger.delay - danger.t;
    const center = (danger.x0 + danger.x1) / 2;
    const exit = p.x >= center ? 1 : -1;
    if ((danger.h || 60) <= 120 && left < 0.22 && left > 0.05 && Math.random() < 0.5) { pulse.add('jump'); return; }
    if (left < 0.26 && p.dodgeCd <= 0 && p.state !== 'dodge' && Math.random() < 0.8) {
      virt[exit > 0 ? 'right' : 'left'] = true;
      pulse.add('dodge');
      return;
    }
    if (left < 0.5) { virt[exit > 0 ? 'right' : 'left'] = true; if (p.state === 'attack' || p.state === 'cast') return; }
  }

  if (bot.think <= 0) {
    bot.think = rnd(0.05, 0.2);
    bot.wantMove = 0;
    if (dist > reach) bot.wantMove = sign(near.x - p.x);
    else if (p.def.ranged && dist < 240) bot.wantMove = -sign(near.x - p.x);
  }
  if (!danger && bot.wantMove) virt[bot.wantMove > 0 ? 'right' : 'left'] = true;
  if (dist < reach * 1.2) virt.attack = true;

  if (dist < reach * 1.6 || es.length > 1) {
    const stunned = es.some((e) => (e.stun > 0.2 || e.vuln) && Math.abs(e.x - p.x) < 260);
    const slashI = p.def.skills.findIndex((s) => s.type === 'slash');
    if (stunned && slashI >= 0 && p.cd[slashI] <= 0) { pulse.add('s' + (slashI + 1)); return; }
    for (let i = 0; i < 4; i++) {
      if (p.cd[i] > 0) continue;
      const t = p.def.skills[i].type;
      if (t === 'heal' && p.hp > p.maxHp * 0.6) continue;
      if (t === 'shield' && (p.hp > p.maxHp * 0.8 || p.shield > 0)) continue;
      if (t === 'gale' && dist < 300) continue;
      pulse.add('s' + (i + 1));
      break;
    }
  }
}
