# kit=b：O 见切换成专门的拔刀架势帧（b_parry）；U 送葬突刺加酒红贯穿特效；去掉墓志
import io
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:90])
    s = s.replace(old, new)

# ---- 见切：架势帧 ----
rep("    case 'phase': return p.phasePerf ? ['b_k12', 4] : p.t < KB.phase.t ? ['b_k12', 3] : ['idle', 0];   // 见切：拔刀架势 → 成立时出刀定格",
    "    case 'phase': return p.phasePerf ? ['b_parry', 2] : p.t < KB.phase.t ? ['b_parry', p.t < 0.08 ? 0 : 1] : ['b_parry', 0];   // 见切：入架势 → 架势压低 → 成立时拔刀一闪")

# ---- 墓志：kit=b 不刻 ----
rep("  if (o.mark) e.mark = o.mark + mv('markExtra');",
    "  if (o.mark && !KIT_B) e.mark = o.mark + mv('markExtra');   // kit=b 不用墓志")

# ---- U：起手拉出贯穿光束 + 速度线 ----
rep("""      vfx('trail_soul', p.x + p.face * 26, p.y - 20, { rot: p.face > 0 ? Math.PI / 4 : -Math.PI / 4, flip: p.face < 0 });
      if (!KIT_B) checkPerfect(p);""",
"""      if (KIT_B) {   // 酒红贯穿光束：从起点一直拉到冲刺终点
        p.uBeam = { k: 'ubeam', x: p.x, y: p.y - 20, x1: p.x, face: p.face, t: 0, life: 0.5 };
        R.fx.push(p.uBeam);
        for (let j = 0; j < 6; j++) R.fx.push({ k: 'kline', x: p.x - p.face * rnd(0, 30), y: p.y - rnd(6, 40), face: p.face, len: rnd(24, 60), t: 0, life: 0.18 });
      } else vfx('trail_soul', p.x + p.face * 26, p.y - 20, { rot: p.face > 0 ? Math.PI / 4 : -Math.PI / 4, flip: p.face < 0 });
      if (!KIT_B) checkPerfect(p);""")
rep("""    case 'thrust':
      p.vy = 0;
      if (p.t < SK.u.t) thrustHits(p);""",
"""    case 'thrust':
      p.vy = 0;
      if (p.uBeam && p.t < SK.u.t + 0.06) { p.uBeam.x1 = p.x; p.uBeam.t = 0; }   // 冲刺中光束跟着剑尖走，冲完才开始淡出
      if (p.t < SK.u.t) thrustHits(p);""")

# ---- U：穿过的敌人留一道斩线，0.15 秒后炸开 ----
rep("""    vfx('exp1_soul', e.x, e.y - 16);
    strike(e, SK.u.dmg,""",
"""    if (KIT_B) {
      R.fx.push({ k: 'upierce', x: e.x, y: e.y - 20, face: p.face, t: 0, life: 0.4 });
      vfx('b_hit', e.x, e.y - 20, { delay: 0.15, flip: p.face < 0 });
      R.fx.push({ k: 'kspark', x: e.x, y: e.y - 20, t: 0, delay: 0.15, life: 0.45, ps: sparkSet(p.face, 14, '#ffe0e6', 80, 260).concat(sparkSet(p.face, 6, '#ff2e55', 60, 200)) });
    } else vfx('exp1_soul', e.x, e.y - 16);
    strike(e, SK.u.dmg,""")

# kspark 支持延迟
rep("""    } else if (f.k === 'kspark') {   // 命中火星：带速度的短线，受重力
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineWidth = 1;
      for (const q of f.ps) {
        const k = f.t / q.life; if (k >= 1) continue;
        const px = x + q.vx * f.t, py = y + q.vy * f.t + 130 * f.t * f.t;
        rx.strokeStyle = q.c; rx.globalAlpha = 1 - k;
        rx.beginPath(); rx.moveTo(px, py); rx.lineTo(px - q.vx * 0.03, py - (q.vy + 260 * f.t) * 0.03); rx.stroke();
      }""",
"""    } else if (f.k === 'kspark') {   // 命中火星：带速度的短线，受重力；delay 秒后才炸
      const ft = f.t - (f.delay || 0); if (ft < 0) continue;
      rx.save(); rx.globalCompositeOperation = 'lighter'; rx.lineWidth = 1;
      for (const q of f.ps) {
        const k = ft / q.life; if (k >= 1) continue;
        const px = x + q.vx * ft, py = y + q.vy * ft + 130 * ft * ft;
        rx.strokeStyle = q.c; rx.globalAlpha = 1 - k;
        rx.beginPath(); rx.moveTo(px, py); rx.lineTo(px - q.vx * 0.03, py - (q.vy + 260 * ft) * 0.03); rx.stroke();
      }""")

# ---- 画面：贯穿光束 / 剑尖冲击锥 / 地面擦痕 / 穿身斩线 ----
rep("    } else if (f.k === 'kline') {   // 冲刺速度线",
r"""    } else if (f.k === 'ubeam') {   // U 贯穿光束：尾细头粗，暗红 / 亮红 / 白芯三层；冲刺中剑尖前有冲击锥
      const p = R.p, live = p.st === 'thrust' && p.uBeam === f && p.t < SK.u.t;
      const fade = live ? 1 : Math.max(0, 1 - f.t / f.life); if (fade <= 0) continue;
      const x1 = Math.round(f.x1 - cx) + f.face * 22, len = Math.abs(x1 - x);
      rx.save(); rx.globalCompositeOperation = 'lighter';
      for (const [col, w, al] of [['150,10,40', 8, 0.7], ['255,50,90', 4, 0.9], ['255,235,240', 1.5, 1]]) {
        rx.fillStyle = `rgba(${col},${al * fade})`;
        const hw = w * (live ? 1 : 0.4 + 0.6 * fade) / 2;
        rx.beginPath(); rx.moveTo(x, y); rx.lineTo(x1, y - hw); rx.lineTo(x1 + f.face * hw * 2, y); rx.lineTo(x1, y + hw); rx.closePath(); rx.fill();
      }
      rx.fillStyle = `rgba(200,40,70,${0.5 * fade})`;   // 地面擦痕
      const gy = Math.round(p.y - cy) + 1;
      rx.fillRect(Math.min(x, x1), live ? gy : Math.round(f.y + 20 - cy) + 1, len, 1);
      if (live) {   // 剑尖冲击锥：两道往后弯的气浪
        rx.strokeStyle = 'rgba(255,220,230,0.85)'; rx.lineWidth = 1;
        for (const r of [10, 16]) { rx.beginPath(); rx.ellipse(x1 - f.face * r * 0.6, y, r * 0.5, r, 0, f.face > 0 ? -Math.PI / 2 : Math.PI / 2, f.face > 0 ? Math.PI / 2 : Math.PI * 1.5); rx.stroke(); }
      }
      rx.restore();
    } else if (f.k === 'upierce') {   // U 穿身：敌人身上横着一道白芯斩线，0.15 秒时炸亮一下再淡出
      const k = f.t / f.life; if (k >= 1) continue;
      const burstK = f.t >= 0.15 ? Math.min(1, (f.t - 0.15) / 0.05) : 0;
      const al = f.t < 0.15 ? 1 : Math.max(0, 1 - (f.t - 0.15) / 0.25), w = 22 + 10 * burstK;
      rx.save(); rx.globalCompositeOperation = 'lighter';
      rx.fillStyle = `rgba(255,50,90,${al})`; rx.fillRect(x - w, y - 1 - burstK, w * 2, 3 + burstK * 2);
      rx.fillStyle = `rgba(255,240,245,${al})`; rx.fillRect(x - w + 4, y, w * 2 - 8, 1);
      rx.restore();
    } else if (f.k === 'kline') {   // 冲刺速度线""")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
