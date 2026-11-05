"""把大房间接成肉鸽战斗场景 + 给卡牌挂上新技能效果。一次性补丁脚本（带断言，改前先备份）。
用法：python -X utf8 patch_room_run.py <trial 根目录>"""
import io, sys, os, re, shutil

ROOT = sys.argv[1]
BAK = os.path.join(os.environ.get('TEMP', '.'), 'bak_room_run')
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

    def setline(self, prefix, new):
        lines = self.s.split('\n')
        idx = [i for i, l in enumerate(lines) if l.startswith(prefix)]
        assert len(idx) == 1, (self.p, prefix, idx)
        lines[idx[0]] = new
        self.s = '\n'.join(lines)

    def save(self):
        io.open(self.p, 'w', encoding='utf-8', newline='').write(self.s)


# ======================= room.js =======================
r = F('js/room.js')

r.rep("const etype = (e) => e.type || 'hound';\n",
      "const etype = (e) => e.type || 'hound';\n"
      "const mv = (k, d = 0) => (R.M && R.M[k] != null ? R.M[k] : d);   // 肉鸽强化汇总出的属性；自由试玩时没有\n")
r.rep("const R = {};\n", "const R = {};\nlet pendingCfg = null;   // 肉鸽流程传来的战斗配置，enter() 时取走\n")

r.rep("  R.cam = { x: 0, y: ROOM.h - RB_H };\n",
      "  R.cam = { x: 0, y: ROOM.h - RB_H };\n"
      "  R.M = R.cfg ? R.cfg.mods : null; R.endT = 0; R.ended = false; R.godDone = false;\n"
      "  if (R.cfg) { R.p.mx = R.cfg.maxHp; R.p.hp = R.cfg.hp; }\n"
      "  Object.assign(R.p, { pdStacks: 0, pdT: 0, pdEye: 0, shield: 0, chainT: 0, dblT: 0, chainDmg: 0, chainCd: false, twoCritOn: false,\n"
      "    lastSk: '', lastSkT: -9, ultAfterT: 0, streak: 0, chargeT: -9, stunHits: 0 });\n")

# 闪避
r.rep("  if (want(p, 'dodge') && p.dashCd <= 0) {", "  if (want(p, 'dodge') && p.dashCd <= 0 && !mv('noDodge')) {")
r.rep("p.dashCd = DASH_CD; p.perfectUsed = false;", "p.dashCd = DASH_CD * (1 - Math.min(0.6, mv('dodgeCdr'))); p.perfectUsed = false;")
# 冷却与计时
r.rep("  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);\n",
      "  const cr = cdRate();\n"
      "  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt * cr);\n"
      "  p.chainT -= dt; p.scrollT -= dt; p.ultAfterT -= dt; p.pdEye -= dt; p.pdT -= dt;\n"
      "  if (p.pdT <= 0) p.pdStacks = 0;\n"
      "  if (p.dblT > 0) { p.dblT -= dt; if (p.dblT <= 0) setCd(p, 'u'); }\n")
# 移速
r.rep("const tv = dir * P_RUN * (blood ? RAGE.run : 1);", "const tv = dir * P_RUN * (blood ? RAGE.run : 1) * (1 + (R.M ? R.M.spd : 0));")

# strike 重写
old_strike = r.s[r.s.index("function strike(e, dmg, o = {}) {"):r.s.index("function playerUpdate(p, dt) {")]
new_strike = '''function strike(e, dmg, o = {}) {
  if (e.st === 'dead' || e.hide) return;
  const p = R.p, M = R.M;
  let crit = !!o.critStun && e.st === 'stun';
  if (crit) dmg *= 2;
  if (e.boss && e.st === 'recover') dmg *= BOSS.weak;   // Boss 破绽
  if (M) {   // 肉鸽强化：伤害倍率、暴击、命中后的附带效果
    const blood = p.form === 'blood';
    dmg *= M.dmg;
    if (o.basic) {
      dmg *= mv('basicMul', 1);
      if (o.third && mv('heavy3')) dmg *= 1.4;
      if (mv('frenzy')) dmg *= 1 + Math.min(0.25, 0.05 * Math.floor(p.streak / 10));
    } else { dmg *= M.skillAll; if (!blood) dmg *= mv('normMul', 1); }
    if (blood) dmg *= mv('ultAmp', 1);
    if (!blood && p.ultAfterT > 0) dmg *= 1.25;
    if (o.skill && p.chainDmg > R.time) dmg *= 1.2;
    if (!o.basic && p.pdStacks > 0) dmg *= 1 + 0.1 * p.pdStacks;
    if (e.boss) dmg *= 1 + M.bossDmg;
    if (e.mark > 0 && mv('markAmp')) dmg *= 1.1;
    if (e.armorT > 0) dmg *= 1.08;
    if (!crit) {
      const forced = (!o.basic && p.pdEye > 0) || (o.skill && p.twoCritOn) || (o.third && mv('basicCore'));
      if (forced || Math.random() < M.crit) { crit = true; dmg *= 1.5 + M.critDmg; }
    }
    if (o.basic) {
      p.streak++;
      if (mv('armorBreak')) e.armorT = 3;
      if (mv('basicCd')) for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - mv('basicCd'));
    }
    if (o.skill && mv('ultCharge') && R.time - p.chargeT > 0.3) { p.chargeT = R.time; gainSoul(mv('ultCharge')); }
  }
  if (o.basic && e.mark > 0) gainSoul(SOUL_HIT);
  if (o.mark) e.mark = o.mark + mv('markExtra');
  if (o.skill) noteLink(o.skill);
  if (p.form === 'blood') R.rcombo++;
  hurtEnemy(e, Math.round(dmg), o.kb || 0, o.launch, { crit, stun: o.stun });
}

/* ---------- 肉鸽强化用到的小工具 ---------- */
function cdRate() {
  if (!R.M) return 1;
  const blood = R.p.form === 'blood';
  return 1 / Math.max(0.35, 1 - Math.min(0.6, R.M.cdr + (blood ? 0 : mv('normCd'))) + (blood ? 0 : mv('normCdPlus')));
}
function setCd(p, k, extra = 0) {   // 常态三个技能的冷却：疾葬、秘卷连环、双发都在这里结算
  let v = CD[k] + extra;
  if (k === 'u') v *= 1 - mv('uCdr');
  if (p.chainCd) { v *= 0.7; p.chainCd = false; }
  if (R.M && Math.random() < mv('noCdProb')) v = 0;
  p.cd[k] = v;
}
function noteCast(p, k) {   // 记录上一个释放的技能：秘卷·连环、双技
  if (!R.M) return;
  const t = R.time, diff = p.lastSk && p.lastSk !== k;
  p.twoCritOn = !!(mv('twoCrit') && diff && t - p.lastSkT <= 1.5);
  const chain = !!(mv('scroll') && diff && t - p.lastSkT <= 4);
  p.chainDmg = chain ? t + 1.2 : 0; p.chainCd = chain;
  p.lastSk = k; p.lastSkT = t;
}
const rageNeed = () => Math.max(2, RAGE.minSoul - (mv('soulCore') ? 1 : 0) - (mv('pact') ? 1 : 0));
const ragePer = () => (RAGE.perSoul + mv('perSoulAdd') - (mv('pact') ? 0.5 : 0)) * mv('ultDur', 1) * (mv('soloRage') ? 0.5 : 1);
function thrustEcho(p) {
  const box = { x0: p.x - 50, x1: p.x + 50, y0: p.y - 50, y1: p.y + 6 };
  vfx('exp2_' + tint(), p.x, p.y - 10, { ground: true }); R.shake = Math.max(R.shake, 3);
  for (const e of alive()) if (overlap(box, eBox(e))) strike(e, 20, { skill: 'u', launch: -160 });
}

/* ---------- 肉鸽战斗：按配置刷波次，打完 / 倒下后回调 ---------- */
const waveLabel = () => (R.cfg ? (R.cfg.boss ? 'BOSS' : `第 ${Math.min(R.wave, R.cfg.waves.length)} / ${R.cfg.waves.length} 波`) : `第 ${R.wave} 波`);
function runWaves(dt) {
  const cfg = R.cfg;
  if (R.dead) { R.endT += dt; if (R.endT > 1.4) finishRun(false); return; }
  if (R.cfg.god && !R.godDone && R.time > 3.5 && R.en.length) {   // 幻神回应：下一战开场 3.5 秒后全屏打击
    R.godDone = true; say('幻神降临', '#ffd23a'); R.flash = 0.15; R.shake = 6;
    for (const e of alive()) if (onScreen(R.p, e)) strike(e, 70 * (e.boss ? 0.3 : 1), { launch: e.boss ? 0 : -200 });
  }
  if (R.en.length) return;
  if (R.wave < cfg.waves.length) { R.waveT -= dt; if (R.waveT <= 0) { R.wave++; spawnList(cfg.waves[R.wave - 1]); R.waveT = 1.2; } return; }
  R.endT += dt;
  if (R.endT > 1.6) finishRun(true);
}
function finishRun(win) {
  if (R.ended) return;
  R.ended = true;
  const cfg = R.cfg, p = R.p;
  R.cfg = null;
  cfg.onEnd(win, { hp: Math.max(0, p.hp), mx: p.mx, kills: R.kills });
}
function scaleNew(n0) {
  if (!R.cfg) return;
  for (const e of R.en.slice(n0)) {
    if (e.boss) e.hp = e.maxHp = Math.round(BOSS.hp * R.cfg.bossMul);
    else e.hp = e.maxHp = Math.round(e.maxHp * R.cfg.eMul.hp);
  }
}

'''
r.s = r.s.replace(old_strike, new_strike)

# 攻击 / 击杀
r.rep("strike(e, h.dmg, { kb: p.face * h.kb, launch: h.launch, basic: true });",
      "strike(e, h.dmg, { kb: p.face * h.kb, launch: h.launch, basic: true, third: kind === 'c2' });")
r.rep("  if (red) R.shots.push({ x: p.x + p.face * 24, y: p.y - 22, vx: p.face * TSK.waveV, t: 0, hit: new Set(), big: kind === 'tc2' });\n",
      "  if (red) R.shots.push({ x: p.x + p.face * 24, y: p.y - 22, vx: p.face * TSK.waveV, t: 0, hit: new Set(), big: kind === 'tc2' });\n"
      "  if (red && mv('waveDouble')) R.shots.push({ x: p.x + p.face * 24, y: p.y - 38, vx: p.face * TSK.waveV, t: 0, hit: new Set(), big: false });\n")

# 突刺
r.rep("      use(p, 's1'); p.cd.u = CD.u; if (dir) p.face = dir;\n      setSt(p, 'thrust');",
      "      use(p, 's1'); noteCast(p, 'u'); if (dir) p.face = dir;\n"
      "      if (mv('blinkChain') && p.chainT > 0) { p.chainT = 0; p.cd.u = 0; }\n"
      "      else if (mv('thrust2') && p.dblT <= 0) { p.cd.u = 0; p.dblT = 1; }\n"
      "      else { p.dblT = 0; setCd(p, 'u'); }\n"
      "      p.stunHits = 0;\n      setSt(p, 'thrust');")
r.rep("    p.hitSet.add(e);\n    p.vx *= 0.75;",
      "    p.hitSet.add(e);\n    if (e.st === 'stun') p.stunHits++;\n    p.vx *= 0.75;")
r.rep("      if (p.t >= SK.u.t + 0.06) {\n",
      "      if (p.t >= SK.u.t + 0.06) {\n        if (mv('thrustEcho') && p.stunHits >= 2) thrustEcho(p);\n        p.stunHits = 0;\n")
# 掷碑
r.rep("    } else if (ready('s2', 'i') && p.st !== 'throw') {   // I 掷碑：按住上斜着往上扔\n      use(p, 's2'); if (dir) p.face = dir;",
      "    } else if (ready('s2', 'i') && p.st !== 'throw') {   // I 掷碑：按住上斜着往上扔\n      use(p, 's2'); noteCast(p, 'i'); if (dir) p.face = dir;")
r.rep("if (b.t >= SK.i.out || b.x < 8", "if (b.t >= SK.i.out * (1 + mv('bladeFar')) || b.x < 8")
r.rep("if (b.t >= SK.i.hover) { b.phase = 'back'", "if (b.t >= (mv('bladeStay') ? 3 : SK.i.hover)) { b.phase = 'back'")
r.rep("{ R.blade = null; p.cd.i = CD.i; p.catchT = 0.18; return; }", "{ R.blade = null; setCd(p, 'i', mv('bladeStay') ? 3 : 0); p.catchT = 0.18; return; }")
r.rep("strike(e, SK.i.dmg, { skill: 'i', stun: SK.i.pin, kb: sign(b.vx) * 20 });",
      "strike(e, SK.i.dmg * (1 + mv('bladeDmg')), { skill: 'i', stun: SK.i.pin + mv('bladePin'), kb: sign(b.vx) * 20 });")
r.rep("  R.blade = null; p.cd.i = CD.i;\n  setSt(p, 'blink');",
      "  if (!mv('bladeStay')) { R.blade = null; setCd(p, 'i'); }\n  p.chainT = 1;\n  setSt(p, 'blink');")
# 断空
r.rep("      use(p, 's3'); p.cd.o = CD.o; if (dir) p.face = dir;\n      if (R.witch > 0 && startStorm(p)) return;",
      "      use(p, 's3'); noteCast(p, 'o'); setCd(p, 'o'); if (dir) p.face = dir;\n      if (R.witch > 0 && startStorm(p)) return;")
r.rep("    } else if (ready('s3', 'o')) {   // O 断空；时空断裂中变成瞬狱",
      "    } else if (ready('s3', 'o') && !(mv('iaiOnly') && R.witch <= 0)) {   // O 断空；时空断裂中变成瞬狱")
r.rep("w: 120, h: 70, area: true, t: 0, delay: SK.o.delay, dmg: SK.o.dmg };",
      "w: 120 * (1 + mv('iaiWide') + mv('normRange')), h: 70, area: true, t: 0, delay: mv('iaiFast') ? 0.15 : SK.o.delay, dmg: SK.o.dmg };")
r.rep("R.cuts.push(cutOn(e, SK.o.delay, SK.o.markDmg))", "R.cuts.push(cutOn(e, c.delay, SK.o.markDmg))")
r.rep("p.storm = { list, i: 0, t: 0, red, cages: [] };", "p.storm = { list, i: 0, t: 0, red, cages: [], w0: R.witch };")
r.rep("    for (let k = 0; k < SK.o.stormCuts; k++) {\n      const c = cutOn(e, 0, s.red ? TSK.stormDmg : SK.o.stormDmg, true);\n      c.big = k === SK.o.stormCuts - 1;   // 每只敌人最后一道带大爆炸\n      c.red = s.red;",
      "    const nCuts = s.red ? (mv('rageStormCuts') ? 5 : SK.o.stormCuts) : (mv('stormCuts5') ? 5 : SK.o.stormCuts);\n"
      "    for (let k = 0; k < nCuts; k++) {\n      const c = cutOn(e, 0, (s.red ? TSK.stormDmg : SK.o.stormDmg) * (!s.red && mv('iaiOnly') ? 1.6 : 1), true);\n"
      "      c.big = k === nCuts - 1;   // 每只敌人最后一道带大爆炸\n      c.red = s.red; c.mk = !!mv('stormMark');")
r.rep("    R.witch = Math.min(R.witch, 0.3); R.stop = 0.08; R.shake = 5;",
      "    R.witch = !s.red && mv('stormKeep') ? Math.max(0.3, s.w0 * 0.5) : Math.min(R.witch, 0.3); R.stop = 0.08; R.shake = 5;")
r.rep("    } else if (c.e) strike(c.e, c.dmg, { skill: 'o', stun: SK.o.stun });",
      "    } else if (c.e) strike(c.e, c.dmg, { skill: 'o', stun: SK.o.stun, mark: c.mk ? SK.u.mark : 0 });")
# 变身 / 暴走
r.rep("      if (p.soul < RAGE.minSoul) { R.soulWarn = 0.8; say(`魂不足（需要 ${RAGE.minSoul} 格）`, '#ff8a8a'); return; }\n      p.rageMax = p.rage = p.soul * RAGE.perSoul;   // 每格魂 2.5 秒",
      "      if (mv('sealIdx', -1) === 3) { say('奥义已封印', '#ff8a8a'); return; }\n"
      "      if (p.soul < rageNeed()) { R.soulWarn = 0.8; say(`魂不足（需要 ${rageNeed()} 格）`, '#ff8a8a'); return; }\n"
      "      p.rageMax = p.rage = p.soul * ragePer();   // 每格魂 2.5 秒")
r.rep("case 's4': return b ? { label: '葬' } : { label: '契', off: p.soul < RAGE.minSoul };",
      "case 's4': return b ? { label: '葬' } : { label: '契', off: p.soul < rageNeed() || mv('sealIdx', -1) === 3 };")
r.rep("strike(e, RAGE.wave * (e.mark > 0 ? 2 : 1), { launch: -200, kb: sign(e.x - p.x) * 120 });",
      "strike(e, RAGE.wave * (e.mark > 0 ? (mv('markBurst') ? 3 : 2) : 1), { launch: e.mark > 0 && mv('markBurst') ? -360 : -200, kb: sign(e.x - p.x) * 120 });")
r.rep("const dmg = TSK.finBase + R.rcombo * TSK.finCombo;", "const dmg = TSK.finBase + R.rcombo * (mv('finFull') ? 2.5 : TSK.finCombo);")
r.rep("r.t < TSK.rainT", "r.t < TSK.rainT + mv('rainExtra')")
r.rep("r.t >= TSK.rainT", "r.t >= TSK.rainT + mv('rainExtra')")
r.rep("{ p.form = 'normal'; p.rage = 0; p.inv = 0.6;",
      "{ p.form = 'normal'; p.rage = 0; p.ultAfterT = mv('ultAfter') ? 4 : 0; if (mv('soulCore')) p.soul = 1; p.inv = 0.6;")
r.rep("    if (R.p.form === 'blood') R.p.rage = Math.min(R.p.rageMax, R.p.rage + RAGE.killAdd);   // 暴走中越杀越久\n",
      "    if (R.p.form === 'blood') R.p.rage = Math.min(R.p.rageMax, R.p.rage + (mv('soloRage') ? 0 : RAGE.killAdd + mv('killAddPlus')));   // 暴走中越杀越久\n"
      "    if (mv('killHeal')) R.p.hp = Math.min(R.p.mx, R.p.hp + Math.round(R.p.mx * mv('killHeal') / 100));\n")
r.rep("  say(`击败 ${BOSS.name}`, '#ffd23a');\n", "  say(`击败 ${BOSS.name}`, '#ffd23a');\n  if (mv('ultKill')) gainSoul(2);\n")
r.rep("e.mark = Math.max(0, e.mark - dt);", "e.mark = Math.max(0, e.mark - dt); e.armorT = Math.max(0, (e.armorT || 0) - dt);")
# 受击
r.rep("  p.hp = Math.max(0, p.hp - dmg);\n  p.soul = Math.max(0, p.soul - 1);   // 挨打掉 1 格魂\n",
      "  if (R.M || R.cfg) {\n"
      "    const skilling = ['thrust', 'throw', 'blink', 'iai', 'storm'].includes(p.st);\n"
      "    dmg = Math.max(1, Math.round(dmg * (R.cfg ? R.cfg.eMul.dmg : 1) * (1 - Math.min(0.5, mv('reduce'))) * (skilling ? 1 - mv('castReduce') : 1)));\n"
      "  }\n"
      "  if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; }\n"
      "  p.pdStacks = 0; p.streak = 0;\n"
      "  p.hp = Math.max(0, p.hp - dmg);\n  p.soul = Math.max(0, p.soul - 1);   // 挨打掉 1 格魂\n")
# 完美闪避
r.rep("  gainSoul(1);\n  R.fx.push({ k: 'ring', x: p.x, y: p.y - 18, t: 0 });\n",
      "  gainSoul(1);\n"
      "  if (p.st === 'thrust' && mv('thrustParry')) { gainSoul(1); p.cd.u = 0; }\n"
      "  if (mv('pdStack')) { p.pdStacks = Math.min(3, p.pdStacks + 1); p.pdT = 8; }\n"
      "  if (mv('pdCrit')) p.pdEye = 3;\n"
      "  if (mv('pdShield') && !mv('noShield')) p.shield = Math.round(p.mx * mv('pdShield'));\n"
      "  R.fx.push({ k: 'ring', x: p.x, y: p.y - 18, t: 0 });\n")
r.rep("  R.witch = WITCH_T; R.banner = 1.2;", "  R.witch = WITCH_T + mv('pdSlow'); R.banner = 1.2;")

# 刷怪
r.rep("  if (R.wave === BOSS.wave) { spawnBoss(); return; }\n  const list = WAVES[R.wave - 1] || Array.from({ length: 2 + Math.min(R.wave, 8) }, (_, i) => MIX[(i + R.wave) % MIX.length]);\n  list.forEach((type, i) => {\n",
      "  if (R.wave === BOSS.wave) { spawnBoss(); return; }\n"
      "  spawnList(WAVES[R.wave - 1] || Array.from({ length: 2 + Math.min(R.wave, 8) }, (_, i) => MIX[(i + R.wave) % MIX.length]));\n}\n"
      "function spawnList(list) {\n  const n0 = R.en.length;\n  list.forEach((type, i) => {\n    if (type === 'boss') { spawnBoss(); return; }\n")
r.rep("  });\n}\n\n/* ---------- 绘制 ---------- */", "  });\n  scaleNew(n0);\n}\n\n/* ---------- 绘制 ---------- */")

# 场景
r.rep("  enter() {\n    rReset();", "  enter() {\n    R.cfg = pendingCfg; pendingCfg = null;\n    rReset();")
r.rep("    if (input.hit('pause')) { setScene(titleScene); return; }\n    if (R.dead && (input.hit('restart') || pulse.has('tap'))) { rReset(); return; }",
      "    if (input.hit('pause') && !R.cfg) { setScene(titleScene); return; }\n    if (R.dead && !R.cfg && (input.hit('restart') || pulse.has('tap'))) { rReset(); return; }")
r.rep("    if (!R.en.length && !R.dead) { R.waveT -= dt; if (R.waveT <= 0) { spawnWave(); R.waveT = 2; } }",
      "    if (R.cfg) runWaves(dt);\n    else if (!R.en.length && !R.dead) { R.waveT -= dt; if (R.waveT <= 0) { spawnWave(); R.waveT = 2; } }")
r.rep("`第 ${R.wave} 波　击杀 ${R.kills}`", "`${waveLabel()}　击杀 ${R.kills}`", 2)
r.rep("    drawText(`生命 ${p.hp}/${p.mx}`, 24 + sl, 64, 24, '#f0e6f6');\n",
      "    drawText(`生命 ${p.hp}/${p.mx}`, 24 + sl, 64, 24, '#f0e6f6');\n    if (p.shield > 0) drawText(`盾 ${p.shield}`, 24 + sl + 220, 64, 24, '#8fd8ff');\n")
r.rep("      drawText(tc ? '轻点屏幕重来' : '按 R 重来', VW / 2, H / 2 + 30, 24, '#f0e6f6', 'center');",
      "      drawText(R.cfg ? '试炼失败' : tc ? '轻点屏幕重来' : '按 R 重来', VW / 2, H / 2 + 30, 24, '#f0e6f6', 'center');")
r.rep("window.roomScene = roomScene;\n",
      "window.roomScene = roomScene;\n"
      "roomScene.start = (cfg) => { pendingCfg = cfg; setScene(roomScene); };\n"
      "roomScene.debugWin = () => { if (!R.cfg) return; R.en.length = 0; R.wave = R.cfg.waves.length; R.endT = 5; };   // 调试：直接通关当前战斗\n")
r.save()

# ======================= boons.js =======================
b = F('js/boons.js')
src = b.s
# 1. 去掉骑士专属
i0 = src.index("/* ---------- 骑士专属：重斩 ---------- */")
i1 = src.index("const BOON = Object.fromEntries")
wine = r'''/* ---------- 酒红剑客专属：按 设计文档 §8.8 ---------- */
const WN = { hero: 'wine' };
const wn = (id, name, type, q, icon, skill, desc, apply) => boon(id, name, type, q, Object.assign({ icon, skill, desc, apply }, WN));
/* I 掷碑·瞬身 */
wn('w_heavy', '重碑', 'skill', 0, 'hammer-drop', 1, '飞剑伤害 +30%，钉住时间 +0.3 秒。', (m) => { add(m, 'bladeDmg', 0.3); add(m, 'bladePin', 0.3); });
wn('w_far', '远掷', 'skill', 1, 'target-arrows', 1, '飞出距离 +40%。', (m) => { add(m, 'bladeFar', 0.4); });
wn('w_chain', '瞬身连斩', 'link', 1, 'chained-heart', 1, '瞬身后 1 秒内释放送葬突刺不进入冷却。', (m) => { m.blinkChain = true; });
wn('w_stay', '碑钉', 'cost', 2, 'spiked-shoulder-armor', 1, '飞剑不再飞回，钉在终点 3 秒，期间可以多次瞬身往返；掷碑冷却 +3 秒。', (m) => { m.bladeStay = true; });
/* U 送葬突刺 */
wn('w_swift', '疾葬', 'skill', 0, 'boot-prints', 0, '送葬突刺冷却 -20%。', (m) => { add(m, 'uCdr', 0.2); });
wn('w_twin', '双刺', 'skill', 1, 'double-shot', 0, '送葬突刺可以连续释放 2 次，第二次须在 1 秒内释放。', (m) => { m.thrust2 = true; });
wn('w_carve', '刻骨', 'skill', 1, 'skull-crack', 0, '墓志持续时间 +5 秒；带墓志的敌人受到的伤害 +10%。', (m) => { add(m, 'markExtra', 5); m.markAmp = true; });
wn('w_parry', '迎刃', 'skill', 2, 'bell-shield', 0, '突刺触发完美闪避时，额外 +1 格魂，并清除突刺冷却。', (m) => { m.thrustParry = true; });
wn('w_echo', '送葬回响', 'link', 2, 'rolling-energy', 0, '一次突刺穿过至少 2 个眩晕中的敌人时，在终点引发碑影爆炸。', (m) => { m.thrustEcho = true; });
/* O 断空·瞬狱 */
wn('o_wide', '广斩', 'skill', 0, 'crescent-blade', 2, '断空范围 +30%。', (m) => { add(m, 'iaiWide', 0.3); });
wn('o_fast', '速断', 'skill', 1, 'lightning-trio', 2, '断空的延迟由 0.3 秒缩短为 0.15 秒。', (m) => { m.iaiFast = true; });
wn('o_keep', '狱延', 'skill', 1, 'cycle', 2, '瞬狱结束后时空断裂不结束，保留剩余时间的一半。', (m) => { m.stormKeep = true; });
wn('o_mark', '刻狱', 'link', 2, 'bleeding-wound', 2, '瞬狱的斩痕给目标刻上墓志。', (m) => { m.stormMark = true; });
wn('o_thou', '千斩', 'skill', 2, 'whirlwind', 2, '瞬狱每个敌人的斩痕由 3 道增加到 5 道。', (m) => { m.stormCuts5 = true; });
wn('o_iai', '居合', 'cost', 2, 'axe-swing', 2, '断空只能在时空断裂中使用，瞬狱伤害 ×1.6。', (m) => { m.iaiOnly = true; });
/* P 葬碑·血契（暴走） */
wn('r_long', '久暴', 'skill', 0, 'sun', 3, '每格魂折合的暴走时间由 2.5 秒提高到 3 秒。', (m) => { add(m, 'perSoulAdd', 0.5); });
wn('r_kill', '嗜杀', 'skill', 1, 'dripping-blade', 3, '暴走中每次击杀加时由 0.5 秒提高到 0.8 秒。', (m) => { add(m, 'killAddPlus', 0.3); });
wn('r_wave', '刀气连环', 'skill', 1, 'wind-slap', 3, '暴走普攻的刀气变为两道，上下交错。', (m) => { m.waveDouble = true; });
wn('r_fin', '葬·满盈', 'skill', 2, 'fire-silhouette', 3, '「葬」每连击的加成由 1.5 提高到 2.5。', (m) => { m.finFull = true; });
wn('r_rain', '碑雨倾盆', 'skill', 2, 'rock', 3, '碑雨持续时间 +1 秒。', (m) => { add(m, 'rainExtra', 1); });
wn('r_burst', '墓志引爆', 'link', 2, 'flame', 3, '变身瞬间的冲击波对带墓志的敌人伤害 ×3，并把它们高高挑飞。', (m) => { m.markBurst = true; });
wn('r_storm', '血狱·连爆', 'skill', 2, 'whirlwind', 3, '血狱每个敌人的爪痕由 3 道增加到 5 道。', (m) => { m.rageStormCuts = true; });
wn('r_pact', '先契', 'cost', 2, 'daemon-skull', 3, '只需 2 格魂即可变身，但每格魂折合的暴走时间 -0.5 秒。', (m) => { m.pact = true; });

'''
src = src[:i0] + wine + src[i1:]
b.s = src

b.setline("boon('u_core'", "boon('u_core', '极意', 'core', 3, { school: 'ult', icon: 'fire-ring', skill: 3, desc: '变身所需的魂 -1（最低 2 格）；暴走结束时额外获得 1 格魂。', apply: (m) => { m.soulCore = true; } });")
b.setline("boon('u_charge'", "boon('u_charge', '蓄能', 'skill', 0, { school: 'ult', icon: 'burning-embers', skill: 3, desc: '普通技能命中时 +0.2 格魂（每次释放最多触发一次）。', apply: (m) => { add(m, 'ultCharge', 0.2); } });")
b.setline("boon('u_ext'", "boon('u_ext', '延展', 'skill', 1, { school: 'ult', icon: 'cycle', skill: 3, desc: '暴走时间 +25%。', apply: (m) => { mul(m, 'ultDur', 1.25); } });")
b.setline("boon('u_amp'", "boon('u_amp', '增幅', 'skill', 1, { school: 'ult', icon: 'muscle-up', skill: 3, desc: '变身期间伤害 +20%。', apply: (m) => { mul(m, 'ultAmp', 1.2); } });")
b.setline("boon('u_after'", "boon('u_after', '余韵', 'skill', 2, { school: 'ult', icon: 'sun', skill: 3, desc: '暴走结束后 4 秒内，普通技能伤害 +25%。', apply: (m) => { m.ultAfter = true; } });")
b.setline("boon('u_exec'", "boon('u_exec', '斩首', 'skill', 2, { school: 'ult', icon: 'skull-crack', skill: 3, desc: '击败 Boss 时 +2 格魂。', apply: (m) => { m.ultKill = true; } });")
b.setline("boon('u_redo'", "boon('u_redo', '重演', 'skill', 2, { school: 'ult', noRoll: true, icon: 'backup', skill: 3, desc: '「葬」释放 2 秒后再砸一次，威力为 50%。', apply: (m) => { m.ultRedo = true; } });")
b.setline("boon('x_solo'", "boon('x_solo', '孤注', 'cost', 2, { school: 'ult', icon: 'fist', skill: 3, desc: '变身期间伤害 ×1.5，但暴走时间减半、击杀不再加时。', excl: ['x_arm'], apply: (m) => { mul(m, 'ultAmp', 1.5); m.soloRage = true; } });")
b.setline("boon('b_core'", "boon('b_core', '疾风连击', 'core', 3, { school: 'basic', icon: 'sword-brandish', skill: 'basic', desc: '普攻第三下必定暴击，伤害 +20%。', apply: (m) => { m.basicCore = true; mul(m, 'basicMul', 1.2); } });")
b.setline("boon('b_dance'", "boon('b_dance', '乱舞', 'basic', 2, { school: 'basic', icon: 'axe-swing', skill: 'basic', desc: '每 10 连击使普攻伤害 +5%，上限 +25%，受击后连击清零。', apply: (m) => { m.frenzy = 1; } });")
b.setline("boon('b_pierce'", "boon('b_pierce', '穿透', 'basic', 2, { school: 'basic', noRoll: true, icon: 'crescent-blade', skill: 'basic', req: 'b_core', desc: '第三下普攻的冲击波穿透敌人，范围 +50%。', apply: (m) => { m.wavePierce = true; } });")
b.setline("boon('s_echo'", "boon('s_echo', '余波', 'skill', 1, { school: 'skill', noRoll: true, icon: 'wind-slap', skill: 'normal', desc: '普通技能释放后 0.5 秒再触发一次余波，伤害为原来的 40%。', apply: (m) => { m.echo = true; } });")
b.setline("boon('m_link'", "boon('m_link', '万象·连', 'myriad', 4, { noRoll: true, icon: 'chained-heart', desc: '连携加成翻倍。', apply: (m) => { m.link += 0.2; } });")
b.setline("boon('d_time'", "boon('d_time', '时隙', 'skill', 2, { icon: 'stopwatch', desc: '完美闪避的时空断裂时间 +1.1 秒（2.2 → 3.3 秒），给你更久的反打时机。', apply: (m) => { m.pdSlow = 1.1; } });")
b.rep("stat('spd', '疾行', 'boot-prints', [0.05, 0.09, 0.14], (v) => `移速与攻速 +${pc(v)}%`,", "stat('spd', '疾行', 'boot-prints', [0.05, 0.09, 0.14], (v) => `移动速度 +${pc(v)}%`,")
# 分身流、宠物流：大房间里还没有对应系统，先不出
lines = b.s.split('\n')
for k, l in enumerate(lines):
    if l.startswith('boon(') and ("school: 'clone'" in l or ("school: 'pet'" in l and 'noRoll' not in l)):
        lines[k] = l.replace("school: 'clone',", "school: 'clone', noRoll: true,").replace("school: 'pet',", "school: 'pet', noRoll: true,")
b.s = '\n'.join(lines)
b.rep("const SCHOOL_KEYS = Object.keys(SCHOOLS);", "const SCHOOL_KEYS = Object.keys(SCHOOLS).filter((k) => !SCHOOLS[k].hidden);")
b.rep("clone: { name: '分身流',", "clone: { hidden: true, name: '分身流',")
b.rep("pet: { name: '宠物流',", "pet: { hidden: true, name: '宠物流',")
b.save()

# ======================= data.js =======================
d = F('js/data.js')
d.rep("const HERO_KEYS = ['knight'];", "const HERO_KEYS = ['wine'];")
d.rep("const HEROES = {\n  knight: {",
      "const HEROES = {\n"
      "  wine: {\n"
      "    name: '酒红剑客', hp: 100, atk: 10, speed: 150, ranged: false, color: '#c8404a', reach: 60,\n"
      "    blurb: '完美闪避灌魂，魂满变身暴走：普攻刀气、碑雨、血爪、血狱，期间无敌',\n"
      "    skills: [\n"
      "      { id: 'w1', name: '送葬突刺', cd: 6, glyph: 'sprint', desc: '一口气穿过敌人，刻下墓志；对眩晕敌人必暴击，可触发完美闪避' },\n"
      "      { id: 'w2', name: '掷碑·瞬身', cd: 5, glyph: 'crescent-blade', desc: '掷出巨剑钉住敌人；再按一次瞬移到剑的位置并斩击' },\n"
      "      { id: 'w3', name: '断空', cd: 7, glyph: 'whirlwind', desc: '延迟爆出斩痕；时空断裂中变成瞬狱，穿梭全屏敌人' },\n"
      "      { id: 'w4', name: '葬碑·血契', cd: 0, glyph: 'daemon-skull', ult: true, desc: '魂满变身暴走：无敌，全场敌人半速，技能全屏化' },\n"
      "    ],\n"
      "  },\n"
      "  knight: {")
d.rep("  reaper: { name: '瘟疫收割者'", "  tombfiend: { name: '墓渊魔', img: 'gv/enemies/boss-portrait.png', h: 144, art: 'L', hp: 1400, speed: 70, dmg: 18, ai: 'boss', boss: true },\n  reaper: { name: '瘟疫收割者'")
d.save()

# ======================= scenes.js =======================
s = F('js/scenes.js')
s.rep("let selectedHero = 'knight';", "let selectedHero = 'wine';")
s.rep("    const h = HEROES.knight;\n", "    const h = HEROES.wine;\n")
s.rep("    drawSprite('v2/heroes/knight.png', W / 2 - 220, 500, 280, false);\n",
      "    const hi = img('hero2/hero_idle.png'), hm = (window.HERO2 || {}).idle;\n"
      "    if (hm && ready(hi)) { ctx.imageSmoothingEnabled = false; const sc = 7, f = Math.floor(this.t * 5) % hm.n; ctx.drawImage(hi, f * hm.fw, 0, hm.fw, hm.fh, W / 2 - 220 - hm.anchorX * sc, 500 - hm.fh * sc + 4 * sc, hm.fw * sc, hm.fh * sc); }\n")
s.rep("    drawText(`生命 ${h.hp}　攻击 ${h.atk}`, W / 2 - 60, 516, 24, UI.c.mut, 'left', false);\n", "")
s.rep("    pxButton(W / 2 + 180, 560, 260, 64, 'N 大房间试玩（新）', { edge: '#a0e0ff', color: '#a0e0ff' });",
      "    pxButton(W / 2 + 180, 560, 260, 64, 'N 自由试玩（无限波）', { edge: '#a0e0ff', color: '#a0e0ff' });")
s.rep("A/D 移动　J 攻击　K 跳跃　空格 闪避　U I O 技能　P 奥义　Esc 暂停　F11 全屏", "A/D 移动　J 攻击　K 跳跃　空格 闪避　U I O 技能　P 血契变身　F11 全屏")
s.rep("    drawText('地下城闯关肉鸽 · 阶段 1', W / 2, 150, 24, UI.c.mut, 'center');", "    drawText('地下城闯关肉鸽 · 大房间版', W / 2, 150, 24, UI.c.mut, 'center');")
s.save()

# ======================= explore.js =======================
e = F('js/explore.js')
e.rep("const petSlots = () => (count('p_core') || count('pet_wolf') ? 1 : 0) + (count('pet_raven') ? 1 : 0) + (count('pet_stone') ? 1 : 0);",
      "const PETS_ON = false;   // 大房间里还没有宠物系统：商店不卖、神秘房间不出宠物之洞\n"
      "const petSlots = () => (PETS_ON ? (count('p_core') || count('pet_wolf') ? 1 : 0) + (count('pet_raven') ? 1 : 0) + (count('pet_stone') ? 1 : 0) : 9);")
e.save()

# ======================= run.js =======================
u = F('js/run.js')
u.rep("const BOSS_BY_STAGE = ['skelcap', 'dragon', 'dragon'];", "const BOSS_BY_STAGE = ['tombfiend', 'tombfiend', 'tombfiend'];")
u.rep("const BOSS_HP = [1150, 2000, 2700, 3400, 4100, 4800, 5600];", "const BOSS_HP = [1400, 2100, 2800, 3500, 4200, 4900, 5600];   // 第 1 关 = 墓渊魔基础血量，之后按倍数放大")
u.rep("const BOSS_TIPS = {\n", "const BOSS_TIPS = {\n  tombfiend: ['冲撞：伏低蓄力，头顶红光闪白的瞬间冲刺闪过去', '吐息：展翅后仰就是预警，贴地喷火，往上跳可躲', '天降：飞起后地上出现红圈，盯着你落点，落下前闪开', '出招结束后有「破绽」，此时伤害 +25%', '血量低于一半会狂怒：出招更快，并召唤骷髅兵'],\n")
u.rep("run = { active: false };", "run = { active: false };")
u.rep("    active: true, hero, stage: 0,", "    active: true, hero, stage: 0,")
# 战斗生成：改走大房间
i0 = u.s.index("function startNodeBattle(n) {")
i1 = u.s.index("function onBattleEnd(win) {")
u.s = u.s[:i0] + '''/* 大房间战斗的敌人编组：遭遇战两波、强敌两波更大、Boss 单独一波；每关引入新敌人 */
function roomWaves(n) {
  const st = run.stage;
  const pool = st === 0 ? ['skel', 'skel', 'hound', 'wiz'] : st === 1 ? ['skel', 'hound', 'ghost', 'wiz', 'skel'] : ['skel', 'hound', 'ghost', 'wiz', 'ghost', 'hound'];
  const pk = () => pool[Math.floor(Math.random() * pool.length)];
  const mk = (c) => Array.from({ length: c }, pk);
  if (n.type === 'boss') return [['boss']];
  if (n.rob) return [['skel', 'skel', 'skel', 'hound', 'hound']];
  if (n.type === 'elite') return [mk(4 + st), mk(4 + st)];
  return [mk(3 + (st > 0 ? 1 : 0)), mk(3 + st)];
}
function startNodeBattle(n) {
  run.node = n;
  const st = run.stage;
  const mul = STAGE_MUL[st];
  const go = () => roomScene.start({
    waves: roomWaves(n), mods: runMods(), hp: run.hp, maxHp: runMaxHp(), boss: n.type === 'boss',
    eMul: { hp: mul.hp * (n.type === 'elite' ? 1.3 : 1), dmg: mul.dmg, spd: mul.spd }, bossMul: BOSS_HP[st] / BOSS_HP[0],
    god: !!run.godAssist, onEnd: (win, r) => onBattleEnd(win, r),
  });
  run.godAssist = false;
  if (n.type === 'boss') setScene(bossPreviewScene(n.boss, go)); else go();
}

''' + u.s[i1:]
u.rep("function onBattleEnd(win) {\n  const p = world.player;\n  if (!win) { endRun(false); return; }\n  const n = run.node;\n  run.hp = Math.max(1, Math.round(p.hp));\n  run.kills += world.kills;",
      "function onBattleEnd(win, r) {\n  if (!win) { endRun(false); return; }\n  const n = run.node;\n  run.hp = Math.max(1, Math.round(r.hp));\n  run.kills += r.kills;")
u.rep("  const pct = clamp(world.endHpPct, 0, 1);", "  const pct = clamp(r.hp / r.mx, 0, 1);")
u.rep("BOONS.filter((b) => b.type !== 'cost' && !b.hero || b.hero === 'knight' && b.type !== 'cost')", "BOONS.filter((b) => b.type !== 'cost' && !b.noRoll && (!b.hero || b.hero === 'wine'))")
u.save()
print('patched, backups in', BAK)
