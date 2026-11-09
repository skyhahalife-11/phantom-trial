# kit=b 第三轮：普攻加收招过渡帧 + 代码形变；O 改成架刀招架（震刀 → 反击 → 瞬狱）；U 换成生成的冲击波 / 贯穿特效
import io
P = r'D:/workspace/trial/js/room.js'
s = io.open(P, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (c, old[:90])
    s = s.replace(old, new)

def cut(a, b):   # 删掉从 a 开始、到 b 之前的整段
    global s
    i = s.index(a); j = s.index(b, i)
    s = s[:i] + s[j:]

# ================= 普攻：收招过渡帧 + 形变 =================
rep("const kcFrame = (s, t) => (t < s.d[0] ? 0 : t < s.d[0] + s.d[1] ? 1 : 2);",
    """const KREC = 0.08;   // 收招过渡帧（b_rec，每段一张）：收势之后没接下一刀才播
const kcFrame = (s, t) => (t < s.d[0] ? 0 : t < s.d[0] + s.d[1] ? 1 : t < s.d[0] + s.d[1] + s.d[2] ? 2 : 3);""")
rep("  const s = KCOMBO[p.combo], t0 = s.d[0], t1 = kcHit(s), end = t1 + s.d[2];",
    "  const s = KCOMBO[p.combo], t0 = s.d[0], t1 = kcHit(s), end = t1 + s.d[2] + KREC;")
rep("      if (KIT_B && !blood) { const s = KCOMBO[p.combo]; return [s.a, s.f0 + kcFrame(s, p.t)]; }   // 蓄力 / 拖影 / 收势",
    "      if (KIT_B && !blood) { const s = KCOMBO[p.combo], k = kcFrame(s, p.t); return k === 3 ? ['b_rec', p.combo] : [s.a, s.f0 + k]; }   // 蓄力 / 拖影 / 收势 / 收招")
rep("""  if (m.sc) rx.scale(m.sc, m.sc);   // sc：这组素材生成时比例不一，画的时候缩回与待机同样大小
  rx.drawImage(im,""",
"""  if (m.sc) rx.scale(m.sc, m.sc);   // sc：这组素材生成时比例不一，画的时候缩回与待机同样大小
  if (KIT_B && p.st === 'atk' && p.form !== 'blood') { const D = comboDeform(p); rx.translate(D.dx, 0); rx.rotate(D.rot); rx.scale(D.sx, D.sy); }
  rx.drawImage(im,""")
rep("// 整张帧图染成单色（发光叠加用）",
"""// 普攻形变（以脚底为原点，朝向已翻好）：蓄力往下压、往后拧；拖影顺着冲的方向拉长、前倾；
// 收势落点先压扁再回弹，前倾慢慢回正，位置多冲一点再拉回；收招时身体往上回一下
function comboDeform(p) {
  const s = KCOMBO[p.combo], t0 = s.d[0], t1 = t0 + s.d[1], t2 = t1 + s.d[2], t = p.t;
  const spring = (u, amp, w) => amp * Math.exp(-u / 0.05) * Math.cos(u * w);
  if (t < t0) { const k = t / t0; return { sx: 1 + 0.05 * k, sy: 1 - 0.06 * k, rot: -0.04 * k, dx: 0 }; }
  if (t < t1) { const k = (t - t0) / s.d[1]; return { sx: 1.16 - 0.06 * k, sy: 0.9 + 0.03 * k, rot: 0.1, dx: 0 }; }
  if (t < t2) { const u = t - t1; return { sx: 1 + spring(u, 0.08, 60), sy: 1 - spring(u, 0.08, 60), rot: 0.1 * Math.exp(-u / 0.06), dx: spring(u, 3, 45) }; }
  return { sx: 1, sy: 1 + 0.03 * Math.sin((t - t2) / KREC * Math.PI), rot: 0, dx: 0 };
}
// 整张帧图染成单色（发光叠加用）""")

# ================= O：架刀招架 =================
rep("  phase: { t: 0.3, rec: 0.12, hold: 0.14, cd: 3, perfCd: 8 },   // O 见切：拔刀架势 t 秒（无敌），期间被打 = 见切，定格 hold 秒后自动瞬狱；没被打收刀 rec 秒",
    "  phase: { t: 0.3, rec: 0.12, hold: 0.2, cut: 0.06, cd: 3, perfCd: 8 },   // O 招架：架刀 t 秒（无敌），期间被打 = 招架成立：震刀后滑 → 最后 cut 秒反击出刀 → 自动瞬狱；没被打收刀 rec 秒")
rep("""    case 'phase': {   // O 见切
      const K = KB.phase;
      p.vx = 0; p.vy = Math.min(p.vy, 60);
      if (p.phasePerf) {   // 见切成立：定格一下，自动瞬狱
        if (p.t - p.perfAt >= K.hold) {""",
"""    case 'phase': {   // O 招架
      const K = KB.phase;
      p.vx = 0; p.vy = Math.min(p.vy, 60);
      if (p.phasePerf) {   // 招架成立：被砸得往后滑一小步 → 反手一刀 → 自动瞬狱
        const u = p.t - p.perfAt;
        p.vx = -p.face * 140 * Math.max(0, 1 - u / 0.12);
        if (u >= K.hold - K.cut && !p.parryCut) {
          p.parryCut = true; p.vx = 0; snd('atk3', { rate: 1.3 });
          R.fx.push({ k: 'karc', x: p.x, y: p.y, face: p.face, dx: 10, dy: -24, rx: 30, ry: 32, a0: 1.9, a1: -1.4, t: 0, life: 0.22 });   // 上撩反击的刀弧
        }
        if (u >= K.hold) {""")
rep("    case 'phase': return p.phasePerf ? ['b_parry', 2] : p.t < KB.phase.t ? ['b_parry', p.t < 0.08 ? 0 : 1] : ['b_parry', 0];   // 见切：入架势 → 架势压低 → 成立时拔刀一闪",
    "    case 'phase': return p.phasePerf ? ['b_guard', p.parryCut ? 3 : 2] : ['b_guard', p.t < KB.phase.t ? Math.floor(p.t / 0.1) % 2 : 0];   // 招架：架刀（两帧绷着）→ 成立时震刀 → 反击出刀")
rep("""  setSt(p, 'phase'); p.perfectUsed = false; p.phasePerf = false; p.inv = KB.phase.t + 0.02;""",
    """  setSt(p, 'phase'); p.perfectUsed = false; p.phasePerf = false; p.parryCut = false; p.inv = KB.phase.t + 0.02;""")
rep("""// 见切成立：定格、白闪、十字斩痕落在出手的敌人身上、冲击环
function parryFx(p, e) {
  p.phasePerf = true; p.perfAt = p.t; p.inv = 9;
  R.stop = Math.max(R.stop, 0.1); R.shake = Math.max(R.shake, 4); R.flash = 0.15; R.flashCol = '255,248,225';
  const tx = e ? e.x : p.x + p.face * 30, ty = e ? e.y - 22 : p.y - 22;
  R.fx.push({ k: 'kcross', x: tx, y: ty, t: 0, life: 0.35 });
  R.fx.push({ k: 'krays', x: p.x, y: p.y - 20, t: 0, life: 0.3 });
  R.fx.push({ k: 'kspark', x: tx, y: ty, t: 0, life: 0.45, ps: [...sparkSet(1, 10, '#fff4d0', 80, 260), ...sparkSet(-1, 10, '#fff4d0', 80, 260)] });
  say('見切', '#fff2c0');
}""",
"""// 招架成立：刀身上「锵」地迸出金色火星和星芒，定格、白闪，敌人被震退
function parryFx(p, e) {
  p.phasePerf = true; p.perfAt = p.t; p.inv = 9;
  R.stop = Math.max(R.stop, 0.1); R.shake = Math.max(R.shake, 4); R.flash = 0.15; R.flashCol = '255,248,225';
  const bx = p.x + p.face * 16, by = p.y - 34;   // 架在身前那段刀身
  R.fx.push({ k: 'kstar', x: bx, y: by, t: 0, life: 0.3 });
  R.fx.push({ k: 'krays', x: bx, y: by, t: 0, life: 0.3 });
  R.fx.push({ k: 'kspark', x: bx, y: by, t: 0, life: 0.5, ps: [...sparkSet(p.face, 16, '#ffe9a0', 100, 300), ...sparkSet(-p.face, 8, '#fff6dc', 60, 200)] });
  if (e && !e.boss) { e.x += p.face * 10; e.vx = p.face * 160; }
  snd('atk2', { rate: 1.7 });
  say('招架', '#fff2c0');
}""")
rep("""    } else if (f.k === 'kcross') {""",
"""    } else if (f.k === 'kstar') {   // 招架：刀身上的金白十字星芒，先爆大再缩
      const k = f.t / f.life; if (k >= 1) continue;
      const r = 22 * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      rx.save(); rx.globalCompositeOperation = 'lighter';
      rx.fillStyle = `rgba(255,200,90,${1 - k})`; rx.fillRect(x - r, y - 1, r * 2, 3); rx.fillRect(x - 1, y - r * 0.7, 3, r * 1.4);
      rx.fillStyle = `rgba(255,255,240,${1 - k})`; rx.fillRect(x - r * 0.7, y, r * 1.4, 1); rx.fillRect(x, y - r * 0.5, 1, r);
      rx.beginPath(); rx.arc(x, y, 3 + 4 * (1 - k), 0, Math.PI * 2); rx.fill();
      rx.restore();
    } else if (f.k === 'kcross') {""")

# ================= U：冲击波 + 贯穿爆点 =================
rep("""      if (KIT_B) {   // 酒红贯穿光束：从起点一直拉到冲刺终点
        p.uBeam = { k: 'ubeam', x: p.x, y: p.y - 20, x1: p.x, face: p.face, t: 0, life: 0.5 };
        R.fx.push(p.uBeam);""",
"""      if (KIT_B) {   // 剑尖冲击波（螺旋气浪 + 音爆环），冲刺中钉在剑尖上
        p.uCone = vfx('u_cone', p.x + p.face * 26, p.y - 22, { flip: p.face < 0 });""")
rep("""      if (p.uBeam && p.t < SK.u.t + 0.06) { p.uBeam.x1 = p.x; p.uBeam.t = 0; }   // 冲刺中光束跟着剑尖走，冲完才开始淡出""",
"""      if (KIT_B && p.t < SK.u.t) {
        if (p.uCone) { p.uCone.x = p.x + p.vx * dt + p.face * 26; p.uCone.y = p.y - 22; }   // 冲击波跟着剑尖走（算上这一帧的位移，不落后一帧）
        if (Math.floor(p.t / 0.02) !== Math.floor((p.t - dt) / 0.02)) { afterImage(p); Object.assign(R.fx[R.fx.length - 1], { red: true, soft: true, back: true }); }
        if (p.ground && Math.floor(p.t / 0.04) !== Math.floor((p.t - dt) / 0.04)) burst(p.x - p.face * 6, p.y, 3, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v0: 30, v1: 90, up: 20, life: 0.35 });   // 脚下卷起的土
      }""")
rep("""      R.fx.push({ k: 'upierce', x: e.x, y: e.y - 20, face: p.face, t: 0, life: 0.4 });
      vfx('b_hit', e.x, e.y - 20, { delay: 0.15, flip: p.face < 0 });
      R.fx.push({ k: 'kspark', x: e.x, y: e.y - 20, t: 0, delay: 0.15, life: 0.45, ps: sparkSet(p.face, 14, '#ffe0e6', 80, 260).concat(sparkSet(p.face, 6, '#ff2e55', 60, 200)) });""",
"""      vfx('u_pierce', e.x + p.face * 4, e.y - 20, { flip: p.face < 0 });   // 从敌人背后喷出的菱形贯穿闪光
      R.fx.push({ k: 'kspark', x: e.x, y: e.y - 20, t: 0, life: 0.45, ps: sparkSet(p.face, 10, '#ffe0e6', 80, 260).concat(sparkSet(p.face, 6, '#ff2e55', 60, 200)) });""")
cut("    } else if (f.k === 'ubeam') {", "    } else if (f.k === 'kline') {")

# 暴击爆点：kit=b 用酒红
rep("  if (o.crit) vfx('exp1_' + tint(), e.x, e.y - 16);",
    "  if (o.crit) vfx('exp1_' + (KIT_B ? 'blood' : tint()), e.x, e.y - 16);   // kit=b 统一酒红")

# ================= 文案 =================
rep("O 见切：拔刀架势 0.3 秒，\n   架势中被打 = 见切（定格后自动瞬狱，冷却 8 秒；没被打冷却 3 秒，普攻中也能按）；",
    "O 招架：架刀 0.3 秒，\n   架刀时被打 = 招架成立（震刀、反击后自动瞬狱，冷却 8 秒；没被打冷却 3 秒，普攻中也能按）；")
rep("躲招靠 O 见切", "躲招靠 O 招架")
rep("O 见切（架势中被打 = 自动瞬狱）", "O 招架（架刀时被打 = 反击瞬狱）")
rep("      if (KIT_B) return { label: '切',", "      if (KIT_B) return { label: '架',")
rep("// 见切可以取消普攻，连招不断", "// 招架可以取消普攻，连招不断")

rep("""  if (o.crit) vfx('exp1_' + (KIT_B ? 'blood' : tint()), e.x, e.y - 16);   // kit=b 统一酒红""", """  if (o.crit) { if (KIT_B) vfx('b_hit', e.x, e.y - 18, { flip: R.p.x > e.x }); else vfx('exp1_' + tint(), e.x, e.y - 16); }   // kit=b：暴击也用酒红十字爆点""")
rep("p.phasePerf ? 0.7 :", "p.phasePerf ? 0.35 :")
rep("""(Math.abs(p.vx) > 40 || !p.ground) && p.st !== 'storm') {""", """(Math.abs(p.vx) > 40 || !p.ground) && p.st !== 'storm' && p.st !== 'phase') {   // 招架被震退时不拖青色残影""")

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('ok')
