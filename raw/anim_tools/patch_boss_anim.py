"""墓渊魔换成每招专属帧（assets/gv/enemies/boss-*.png），见 raw/boss_anim/INTEGRATION.md。"""
import io, sys, os, re, shutil
ROOT = sys.argv[1]
BAK = os.path.join(os.environ.get('TEMP', '.'), 'bak_boss_anim'); os.makedirs(BAK, exist_ok=True)
p = os.path.join(ROOT, 'js/room.js'); shutil.copy(p, os.path.join(BAK, 'room.js'))
s = io.open(p, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    c = s.count(a); assert c == n, (c, a[:90]); s = s.replace(a, b)

rep("  'boss-idle': [6, 160, 144, 62, 127], 'boss-atk': [8, 192, 176, 87, 168], 'boss-fire': [5, 160, 96],",
    "  'boss-idle': [6, 160, 144, 62, 127], 'boss-atk': [8, 192, 176, 87, 168], 'boss-fire': [5, 160, 96],\n"
    "  // 专属招式帧（朝右，第 6 个数 1 = 朝右素材，画的时候再镜像）\n"
    "  'boss-charge': [8, 149, 132, 75, 131, 1], 'boss-breath': [8, 138, 143, 75, 142, 1], 'boss-dive': [8, 183, 149, 99, 148, 1],\n"
    "  'boss-summon': [4, 198, 146, 99, 144, 1], 'boss-stagger': [2, 198, 146, 99, 145, 1], 'boss-hit': [2, 198, 146, 99, 144, 1], 'boss-dead': [4, 198, 146, 99, 145, 1],")
i0 = s.index("    case 'boss': {\n      const f = bossF(e);")
i1 = s.index("      return ['boss-idle', run(6, 8)];\n    }", i0) + len("      return ['boss-idle', run(6, 8)];\n    }")
s = s[:i0] + """    case 'boss': {
      const f = bossF(e), B = BOSS, prog = (d) => Math.min(0.999, e.t / d);
      switch (e.st) {
        case 'charge':
          if (e.sub === 0) return ['boss-charge', Math.min(2, Math.floor(prog(B.charge.windup * f) * 3))];
          return ['boss-charge', 3 + (Math.floor(e.t * 12) % 2)];
        case 'breath':
          if (e.sub === 0) return ['boss-breath', Math.min(3, Math.floor(prog((B.breath.crouch + B.breath.rear) * f) * 4))];
          return ['boss-breath', e.t < 0.15 ? 4 : 5];
        case 'dive':
          if (e.sub === 0) return ['boss-dive', e.t < B.dive.rise * 0.5 ? 0 : 1];
          if (e.sub === 1) return ['boss-dive', 2 + (Math.floor(e.t * 8) % 2)];
          return ['boss-dive', 4];
        case 'summon': return ['boss-summon', e.sub === 0 ? Math.min(2, Math.floor(e.t / 0.4 * 3)) : 3];
        case 'recover': {   // 先播刚才那招的收势，再进入「破绽」喘息
          const lm = e.lastMove;
          if (lm === 'charge' && e.t < 0.45) return ['boss-charge', 5 + Math.min(2, Math.floor(e.t / 0.15))];
          if (lm === 'breath' && e.t < 0.3) return ['boss-breath', 6 + Math.min(1, Math.floor(e.t / 0.15))];
          if (lm === 'dive' && e.t < 0.45) return ['boss-dive', 5 + Math.min(2, Math.floor(e.t / 0.15))];
          return ['boss-stagger', Math.floor(e.t * 4) % 2];
        }
      }
      if (e.flash > 0 && e.st === 'idle') return ['boss-hit', 0];
      return ['boss-idle', run(6, 8)];
    }""" + s[i1:]
rep("function bossStart(e, st) { if (st === 'charge') snd('bossCharge'); e.st = st;", "function bossStart(e, st) { if (st === 'charge') snd('bossCharge'); e.lastMove = st; e.st = st;")
rep("const [name, i] = fr, [, fw, fh, ax = fw / 2, ay = fh] = EANIM[name],", "const [name, i] = fr, [, fw, fh, ax = fw / 2, ay = fh, right] = EANIM[name],")
rep("  rx.drawImage(im, i * fw, 0, fw, fh, -ax, -ay, fw, fh);\n  if (T === 'boss' && e.st === 'breath' && e.sub === 1) {",
    "  if (right) rx.scale(-1, 1);   // 新招式帧朝右：在「朝左」的局部坐标里再镜像一次\n  rx.drawImage(im, i * fw, 0, fw, fh, -ax, -ay, fw, fh);\n  if (right) rx.scale(-1, 1);\n  if (T === 'boss' && e.st === 'breath' && e.sub === 1) {")
rep("if (ready(fim)) rx.drawImage(fim, k * 160, 0, 160, 96, -139, -72, 160, 96);", "if (ready(fim)) rx.drawImage(fim, k * 160, 0, 160, 96, -142, -95, 92, 96);   // 从新喷火帧的嘴边出发，长度与判定框 136 对齐")
# 死亡：专属 4 帧，停在最后一帧再淡出
rep("  R.fx.push({ k: 'death', x: e.x, y: e.y, t: 0 });\n  say(`击败 ${BOSS.name}`, '#ffd23a');", "  R.fx.push({ k: 'bdead', x: e.x, y: e.y, face: e.face, t: 0, life: 2.4 });\n  say(`击败 ${BOSS.name}`, '#ffd23a');")
rep("    } else if (f.k === 'death') {\n", """    } else if (f.k === 'bdead') {
      const im = rImg('gv/enemies/boss-dead.png'), m = EANIM['boss-dead'];
      if (!ready(im)) continue;
      rx.save(); rx.globalAlpha = clamp((f.life - f.t) / 0.6, 0, 1);
      rx.translate(x, y + 1); if (f.face < 0) rx.scale(-1, 1);   // 素材朝右
      rx.drawImage(im, Math.min(3, Math.floor(f.t * 6)) * m[1], 0, m[1], m[2], -m[3], -m[4], m[1], m[2]);
      rx.restore();
    } else if (f.k === 'death') {
""")
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('boss anim wired')
