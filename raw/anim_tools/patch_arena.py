"""战斗区缩小 + 敌人分工（重甲兵、精英）+ 分批刷怪 + 技能冷却调短。一次性补丁（带断言，改前备份）。
用法：python -X utf8 patch_arena.py <trial 根目录>"""
import io, sys, os, re, shutil

ROOT = sys.argv[1]
BAK = os.path.join(os.environ.get('TEMP', '.'), 'bak_arena')
os.makedirs(BAK, exist_ok=True)


class F:
    def __init__(self, rel):
        self.p = os.path.join(ROOT, rel)
        shutil.copy(self.p, os.path.join(BAK, os.path.basename(rel)))
        self.s = io.open(self.p, encoding='utf-8').read()

    def rep(self, a, b, n=1):
        c = self.s.count(a)
        assert c == n, (self.p, c, a[:100])
        self.s = self.s.replace(a, b)

    def save(self):
        io.open(self.p, 'w', encoding='utf-8', newline='').write(self.s)


r = F('js/room.js')

# ---------- 战斗区：2560 → 1280，平台重排 ----------
m = re.search(r"const ROOM = \{.*?\n\};\n", r.s, re.S)
assert m
r.s = r.s.replace(m.group(0), """const ROOM = {
  w: 1280, h: 540, ground: 500,
  plats: [
    { x: 100, y: 436, w: 160 }, { x: 300, y: 372, w: 128 }, { x: 440, y: 308, w: 128 }, { x: 560, y: 436, w: 192 },
    { x: 780, y: 372, w: 160 }, { x: 900, y: 308, w: 128 }, { x: 1020, y: 436, w: 160 },
  ],
  props: [
    ['tree-1', 80], ['stone-1', 250], ['statue', 420], ['bush-large', 600], ['tree-2', 760], ['stone-2', 900],
    ['bush-small', 1020], ['statue', 1100], ['tree-3', 1180], ['stone-3', 1240],
  ],
};
""")

# ---------- 数值 ----------
r.rep("const CD = { u: 6, i: 5, o: 7 };", "const CD = { u: 5, i: 4.5, o: 6 };")
r.rep("const SKEL = { hp: 30,", "// 重甲兵：慢、血厚、平时吃 35% 伤害且不被打断；它出招落空的破绽期、被完美闪避 / 突刺打晕时才吃全伤\n"
      "const BRUTE = { hp: 120, dmg: 20, walk: 38, reach: 60, windup: 0.85, slamT: 0.2, recover: 1.0, armor: 0.35, scale: 1.45 };\nconst SKEL = { hp: 30,")
r.rep("const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42], boss: [30, 96] };",
      "const EBOX = { hound: [18, 24], skel: [11, 40], ghost: [12, 40], wiz: [12, 42], boss: [30, 96], brute: [16, 58] };")
r.rep("const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp, boss: BOSS.hp };",
      "const EMAX = { hound: HOUND.hp, skel: SKEL.hp, ghost: GHOST.hp, wiz: WIZ.hp, boss: BOSS.hp, brute: BRUTE.hp };")
r.rep("const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50, boss: 118 };", "const ETOP = { hound: 30, skel: 46, ghost: 50, wiz: 50, boss: 118, brute: 70 };")

# ---------- 刷怪：分批、精英、重甲兵 ----------
r.rep("  R.cam = { x: 0, y: ROOM.h - RB_H };\n  R.M =", "  R.cam = { x: 0, y: ROOM.h - RB_H }; R.pend = [];\n  R.M =")
old = r.s[r.s.index("function spawnList(list) {"):r.s.index("/* ---------- 绘制 ---------- */")]
assert "scaleNew(n0);" in old
body_start = old.index("    const pl = ROOM.plats")
body_end = old.index("  });\n  scaleNew(n0);")
body = old[body_start:body_end]
body = body.replace("    } else if (type === 'ghost') {", "    } else if (type === 'brute') {   // 重甲兵：离主角远一点的地里爬出来\n"
                    "      const side = i % 2 ? 1 : -1;\n      spawnEnemy('brute', clamp(R.p.x + side * (170 + i * 30), 40, ROOM.w - 40), ROOM.ground);\n"
                    "    } else if (type === 'ghost') {", 1)
new = ("function spawnList(list) {   // 肉鸽战斗里分批刷出，不是一股脑全出现；自由试玩立刻刷\n"
       "  list.forEach((type, i) => { if (R.cfg) R.pend.push({ t: 0.15 + i * 0.35, type, i }); else spawnOne(type, i); });\n}\n"
       "function spawnOne(type, i) {\n  const n0 = R.en.length;\n  const el = type[0] === '*';   // 星号 = 精英：血 ×1.8、伤害 ×1.3、金边，击杀 +1 魂\n  if (el) type = type.slice(1);\n  {\n"
       "    if (type === 'boss') { spawnBoss(); scaleNew(n0); return; }\n" + body +
       "  }\n  if (el) for (const e of R.en.slice(n0)) e.elite = true;\n  scaleNew(n0);\n}\n\n")
r.s = r.s.replace(old, new)
r.rep("    else e.hp = e.maxHp = Math.round(e.maxHp * R.cfg.eMul.hp);", "    else e.hp = e.maxHp = Math.round(e.maxHp * R.cfg.eMul.hp * (e.elite ? 1.8 : 1));")
r.rep("  if (type === 'skel') { e.st = 'rise'; e.skin = Math.random() < 0.5 ? 'skelc' : 'skel'; }",
      "  if (type === 'skel') { e.st = 'rise'; e.skin = Math.random() < 0.5 ? 'skelc' : 'skel'; }\n  else if (type === 'brute') { e.st = 'rise'; e.skin = 'skelc'; }")
# 波次推进：场上（含排队中）剩 trigger 个以下就刷下一波
r.rep("  if (R.en.length) return;\n  if (R.wave < cfg.waves.length) { R.waveT -= dt;",
      "  const left = R.en.length + R.pend.length;\n  if (R.wave < cfg.waves.length) {\n    if (left > (cfg.trigger || 0)) return;\n    R.waveT -= dt;")
r.rep("R.wave++; spawnList(cfg.waves[R.wave - 1]); R.waveT = 1.2; } return; }\n  R.endT += dt;",
      "R.wave++; spawnList(cfg.waves[R.wave - 1]); R.waveT = 1.2; }\n    return;\n  }\n  if (left) return;\n  R.endT += dt;")
r.rep("    if (R.cfg) runWaves(dt);\n",
      "    if (R.pend.length) { for (const q of R.pend) q.t -= dt; for (const q of R.pend.filter((q) => q.t <= 0)) spawnOne(q.type, q.i); R.pend = R.pend.filter((q) => q.t > 0); }\n    if (R.cfg) runWaves(dt);\n")

# ---------- 重甲兵 AI / 判定 / 受击 ----------
r.rep("const shriekBox = (e, pad = 0) =>", """const bruteBox = (e) => ({ x0: e.x + (e.face > 0 ? -10 : -72), x1: e.x + (e.face > 0 ? 72 : 10), y0: e.y - 44, y1: e.y });
function bruteAI(e, p, dt) {
  const dx = p.x - e.x, dy = p.y - e.y;
  if (sharedState(e, dt, 'chase')) return;
  switch (e.st) {
    case 'rise':
      e.vx = 0;
      if (e.t >= SKEL.rise) { e.st = 'chase'; e.t = 0; }
      break;
    case 'chase':
      e.face = sign(dx) || e.face;
      e.vx = Math.abs(dx) > 8 && !R.dead ? e.face * BRUTE.walk : 0;
      if (Math.abs(dx) < BRUTE.reach && Math.abs(dy) < 30 && e.cd <= 0) { e.st = 'windup'; e.t = 0; e.vx = 0; e.dodged = false; e.buzzed = false; }
      break;
    case 'windup':
      e.vx = 0; e.face = sign(dx) || e.face;
      tellBuzz(e, p, BRUTE.windup);
      if (e.t >= BRUTE.windup) {
        e.st = 'slam'; e.t = 0; e.hitPlayer = false; R.shake = Math.max(R.shake, 3);
        burst(e.x + e.face * 40, e.y - 4, 22, { col: 'stone', a0: Math.PI, a1: Math.PI * 2, v1: 220 });
      }
      break;
    case 'slam':
      enemyHits(e, p, bruteBox(e), BRUTE.dmg);
      if (e.t >= BRUTE.slamT) { e.st = 'recover'; e.t = 0; }
      break;
    case 'recover':   // 落空后的破绽：护甲失效，吃全伤
      e.vx = 0;
      if (e.t >= BRUTE.recover) { e.st = 'chase'; e.t = 0; e.cd = 0.8; }
      break;
  }
}

const shriekBox = (e, pad = 0) =>""")
r.rep("  else if (T === 'skel') skelAI(e, p, dt);\n", "  else if (T === 'skel') skelAI(e, p, dt);\n  else if (T === 'brute') bruteAI(e, p, dt);\n")
r.rep("    case 'ghost': return (e.st === 'shriek'",
      "    case 'brute': return (e.st === 'slam' && overlap(pb, bruteBox(e))) || (e.st === 'windup' && e.t > BRUTE.windup - win && near);\n    case 'ghost': return (e.st === 'shriek'")
# 受击：护甲、不被打断；突刺能破甲；完美闪避把它晃晕
r.rep("  if (e.boss && e.st === 'recover') dmg *= BOSS.weak;   // Boss 破绽\n  if (M) {",
      "  if (e.boss && e.st === 'recover') dmg *= BOSS.weak;   // Boss 破绽\n"
      "  const brute = etype(e) === 'brute';\n"
      "  if (brute && !['stun', 'recover'].includes(e.st)) dmg *= BRUTE.armor;   // 重甲：平时只吃 35%\n  if (M) {")
r.rep("  hurtEnemy(e, Math.round(dmg), o.kb || 0, o.launch, { crit, stun: o.stun });\n}\n\n/* ---------- 肉鸽强化用到的小工具 ---------- */",
      "  hurtEnemy(e, Math.max(1, Math.round(dmg)), o.kb || 0, o.launch, { crit, stun: o.stun, breakArmor: brute && o.skill === 'u' ? 1.4 : 0 });\n}\n\n/* ---------- 肉鸽强化用到的小工具 ---------- */")
r.rep("  if (e.boss) return;   // 霸体\n",
      "  if (e.boss) return;   // 霸体\n"
      "  if (etype(e) === 'brute') {   // 重甲兵不被打断；突刺穿过去能把护甲打碎、晃晕一会儿\n"
      "    if (o.breakArmor && e.st !== 'stun') { e.st = 'stun'; e.t = 0; e.stunT = o.breakArmor; e.vx = 0; R.fx.push({ k: 'spark', x: e.x, y: e.y - 30, t: 0, n: 9 }); }\n"
      "    return;\n  }\n")
r.rep("    R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });\n    vfx('exp6_' + tint(), e.x, e.y - 16);\n",
      "    R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });\n    vfx('exp6_' + tint(), e.x, e.y - 16);\n    if (e.elite) { gainSoul(1); say('精英击破　魂 +1', '#ffd23a'); }\n")
r.rep("  if (e) e.dodged = true;\n  gainSoul(1);",
      "  if (e) e.dodged = true;\n"
      "  if (e && etype(e) === 'brute' && e.st !== 'stun') {   // 完美闪避重甲兵：护甲被晃开，晕 2.2 秒\n"
      "    e.st = 'stun'; e.t = 0; e.stunT = 2.2; e.vx = 0; R.fx.push({ k: 'spark', x: e.x, y: e.y - 30, t: 0, n: 12 });\n  }\n  gainSoul(1);")
r.rep("dmg * (R.cfg ? R.cfg.eMul.dmg : 1) * (1 - Math.min(0.5, mv('reduce')))",
      "dmg * (R.cfg ? R.cfg.eMul.dmg : 1) * (src && src.elite ? 1.3 : 1) * (1 - Math.min(0.5, mv('reduce')))")
r.rep("  if (R.M || R.cfg) {\n    const skilling", "  if (R.M || R.cfg || (src && src.elite)) {\n    const skilling")

# ---------- 画面：帧、预警、缩放、护甲描边、精英金边 ----------
r.rep("    case 'skel': {\n      const k = e.skin || 'skel';",
      "    case 'brute': {\n      const k = e.skin || 'skelc';\n"
      "      if (e.st === 'rise') return [k + '-rise', once(6, 6 / SKEL.rise)];\n"
      "      if (e.st === 'chase') return [k + '-walk', run(8, 6)];\n"
      "      if (e.st === 'windup') return [k + '-atk', e.t < BRUTE.windup * 0.5 ? 0 : 1];\n"
      "      if (e.st === 'slam') return [k + '-atk', 2];\n"
      "      if (e.st === 'recover' && e.t < 0.3) return [k + '-atk', 3];\n"
      "      return [k + '-walk', 2];\n    }\n"
      "    case 'skel': {\n      const k = e.skin || 'skel';")
r.rep("  skel: () => SKEL.windup, ghost:", "  skel: () => SKEL.windup, brute: () => BRUTE.windup, ghost:")
r.rep("  rx.translate(bx, by + 1);\n  if (e.face > 0) rx.scale(-1, 1);   // 素材都朝左\n",
      "  rx.translate(bx, by + 1);\n  const sc = T === 'brute' ? BRUTE.scale : 1;\n  rx.scale(e.face > 0 ? -sc : sc, sc);   // 素材都朝左\n")
r.rep("  else if (T === 'ghost') rx.filter = 'brightness(1.5) drop-shadow(0 0 2px rgba(120,220,255,0.9))';",
      "  else if (T === 'brute') rx.filter = ['stun', 'recover'].includes(e.st) ? 'brightness(1.15) saturate(1.2)' : 'brightness(0.8) saturate(0.4) drop-shadow(0 0 2px rgba(140,180,255,0.95))';   // 带甲：灰蓝描边；破甲后恢复本色\n"
      "  else if (e.elite) rx.filter = 'brightness(1.25) drop-shadow(0 0 2px rgba(255,210,60,0.95))';\n"
      "  else if (T === 'ghost') rx.filter = 'brightness(1.5) drop-shadow(0 0 2px rgba(120,220,255,0.9))';")
r.rep("  if (T === 'skel' && e.st === 'windup') {   // 地上一道闪烁的红线：前扑会扑到哪",
      "  if (T === 'brute' && e.st === 'windup') {   // 砸地范围：脚下一片闪烁的红色\n"
      "    rx.fillStyle = e.t > BRUTE.windup * 0.72 ? 'rgba(255,255,255,0.7)' : `rgba(255,50,50,${0.25 + 0.25 * Math.abs(Math.sin(e.t * 18))})`;\n"
      "    rx.fillRect(e.face > 0 ? bx - 10 : bx - 72, by - 44, 82, 44);\n  }\n"
      "  if (T === 'skel' && e.st === 'windup') {   // 地上一道闪烁的红线：前扑会扑到哪")
r.save()

u = F('js/run.js')
i0 = u.s.index("/* 大房间战斗的敌人编组")
i1 = u.s.index("function startNodeBattle(n) {")
u.s = u.s[:i0] + """/* 大房间战斗的敌人编组：每场 2 批、合计 11 只上下，场上剩 2 只时下一批就压上来；星号 = 精英 */
function roomWaves(n) {
  const st = run.stage;
  const rep = (t, c) => Array(c).fill(t);
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const air = st ? 'ghost' : 'wiz';
  if (n.type === 'boss') return [['boss']];
  if (n.rob) return [shuffle([...rep('skel', 3), 'hound', 'hound', 'brute'])];
  if (n.type === 'elite') return [shuffle(['*brute', ...rep('skel', 3), 'hound', 'wiz']), shuffle(['*wiz', ...rep('skel', 3 + st), ...rep('hound', 2), 'brute'])];
  return [
    shuffle([...rep('skel', 3), 'hound', air]),
    shuffle([...rep('skel', 2 + st), ...rep('hound', 2), 'brute', ...rep(air, 1 + (st > 0 ? 1 : 0)), ...(st > 1 ? ['brute'] : [])]),
  ];
}
""" + u.s[i1:]
u.rep("    god: !!run.godAssist, onEnd:", "    trigger: n.type === 'boss' ? 0 : 2, god: !!run.godAssist, onEnd:")
u.save()
print('patched; backups in', BAK)
