'use strict';
/* 强化数据表：5 个通用流派 + 通用属性/万象 + 骑士专属。
   规则见《肉鸽重设计方案》第 8 章。apply 只改 mods，战斗里的实际效果在 combat.js。 */

const QUAL = [
  { name: '普通', color: '#CFD8E6' }, { name: '精良', color: '#5AA9FF' }, { name: '稀有', color: '#B36BFF' },
  { name: '核心', color: '#FFD23A' }, { name: '万象', color: '#4FE3D0' },
];
const TYPE_NAME = { skill: '技能强化', basic: '普攻强化', stat: '属性强化', link: '联动强化', cost: '代价强化', myriad: '万象强化', core: '流派核心', pet: '宠物' };

const SCHOOLS = {
  skill: { name: '技能流', color: '#5AA9FF', icon: 'scroll-unfurled', core: 's_core', blurb: '强化三个普通技能，靠循环释放输出。' },
  ult: { name: '奥义流', color: '#FFD23A', icon: 'fire-ring', core: 'u_core', blurb: '围绕奥义：加速充能，让奥义成为主要伤害。' },
  clone: { name: '分身流', color: '#4FE3D0', icon: 'shadow-follower', core: 'c_core', blurb: '释放技能时召出分身，复刻同一个技能。' },
  pet: { name: '宠物流', color: '#7DFF9A', icon: 'wolf-head', core: 'p_core', blurb: '宠物自动战斗，进化后越来越强。' },
  basic: { name: '普攻流', color: '#CFD8E6', icon: 'sword-brandish', core: 'b_core', blurb: '强化普攻三连击与暴击，普攻反哺技能冷却。' },
};
const SCHOOL_KEYS = Object.keys(SCHOOLS);

const BOONS = [];
function boon(id, name, type, q, o) {
  BOONS.push(Object.assign({ id, name, type, q, max: 1, icon: 'sparkles', school: null, hero: null }, o));
}
const add = (m, k, v) => { m[k] = (m[k] || 0) + v; };
const mul = (m, k, v) => { m[k] = (m[k] == null ? 1 : m[k]) * v; };

/* ---------- 通用属性强化（白蓝紫三档） ---------- */
function stat(id, name, icon, vals, text, fn) {
  vals.forEach((v, q) => boon(`${id}_${q}`, name, 'stat', q, { icon, max: 99, desc: text(v), apply: (m) => fn(m, v), group: id }));
}
const pc = (v) => Math.round(v * 100);
stat('atk', '力量', 'swords-power', [0.08, 0.14, 0.22], (v) => `攻击 +${pc(v)}%`, (m, v) => { m.atkPct += v; });
stat('crit', '锐眼', 'eyeball', [0.05, 0.09, 0.14], (v) => `暴击率 +${pc(v)}%`, (m, v) => { m.crit += v; });
stat('cdmg', '致命', 'skull-crack', [0.2, 0.35, 0.55], (v) => `暴击伤害 +${pc(v)}%`, (m, v) => { m.critDmg += v; });
stat('red', '铁皮', 'spiked-armor', [0.04, 0.07, 0.11], (v) => `受到伤害 -${pc(v)}%`, (m, v) => { m.reduce += v; });
stat('spd', '疾行', 'boot-prints', [0.05, 0.09, 0.14], (v) => `移速与攻速 +${pc(v)}%`, (m, v) => { m.spd += v; });
stat('cdr', '速循', 'stopwatch', [0.05, 0.08, 0.12], (v) => `技能冷却 -${pc(v)}%`, (m, v) => { m.cdr += v; });
stat('hp', '体魄', 'heart-bottle', [0.08, 0.14, 0.22], (v) => `最大生命 +${pc(v)}%`, (m, v) => { m.hpPct += v; });
stat('rest', '调息', 'ankh', [0.03, 0.05, 0.08], (v) => `战后回复 +${pc(v)}% 最大生命`, (m, v) => { m.postHeal += v; });
stat('kheal', '嗜血', 'bleeding-wound', [0.5, 1, 1.5], (v) => `每次击杀回复 ${v}% 最大生命`, (m, v) => { m.killHeal += v; });
stat('coin', '财运', 'crown-coin', [0.15, 0.25, 0.4], (v) => `试炼币收益 +${pc(v)}%`, (m, v) => { m.coin += v; });
stat('dodge', '灵动', 'sprint', [0.15, 0.25, 0.35], (v) => `闪避冷却 -${pc(v)}%`, (m, v) => { m.dodgeCdr += v; });
stat('boss', '无畏', 'horned-skull', [0.08, 0.14, 0.22], (v) => `对精英与 Boss 伤害 +${pc(v)}%`, (m, v) => { m.bossDmg += v; });

/* ---------- 万象（青色，通用） ---------- */
boon('m_edge', '万象·锋', 'myriad', 4, { icon: 'sun', desc: '全部技能伤害 +12%', apply: (m) => { m.skillAll *= 1.12; } });
boon('m_swift', '万象·速', 'myriad', 4, { icon: 'stopwatch', desc: '全部技能冷却 -12%', apply: (m) => { m.cdr += 0.12; } });
boon('m_guard', '万象·御', 'myriad', 4, { icon: 'bell-shield', desc: '释放技能期间，受到伤害 -20%', apply: (m) => { m.castReduce += 0.2; } });
boon('m_link', '万象·连', 'myriad', 4, { icon: 'chained-heart', desc: '连携加成翻倍（普攻命中后接技能：+20% → +40%）', apply: (m) => { m.link += 0.2; } });

/* ---------- 闪避反打（通用）：完美闪避后下个普通技能免冷却，以下强化把这条线做深 ---------- */
boon('d_trace', '残影', 'skill', 1, { icon: 'backup', desc: '完美闪避叠加 1 层残影（最多 3 层，8 秒），每层技能伤害 +10%；受伤清空。', apply: (m) => { m.pdStack = true; } });
boon('d_eye', '破绽之眼', 'skill', 1, { icon: 'eyeball', desc: '完美闪避后 3 秒内，技能必定暴击。', apply: (m) => { m.pdCrit = true; } });
boon('d_ward', '惊鸿护体', 'skill', 2, { icon: 'shield-reflect', desc: '完美闪避获得相当于 12% 最大生命的护盾。', apply: (m) => { m.pdShield = 0.12; } });
boon('d_time', '时隙', 'skill', 2, { icon: 'stopwatch', desc: '完美闪避的慢动作时间延长一倍，给你更久的反打时机。', apply: (m) => { m.pdSlow = 0.45; } });

/* ---------- 通用代价 ---------- */
boon('x_pot', '破釜', 'cost', 2, { icon: 'axe-swing', desc: '不能使用闪避，全部伤害 +30%。', apply: (m) => { m.noDodge = true; m.allDmg *= 1.3; } });

/* ---------- 技能流（秘卷） ---------- */
boon('s_core', '秘卷·连环', 'core', 3, { school: 'skill', icon: 'scroll-unfurled', skill: 'normal', desc: '释放一个普通技能后 4 秒内，下一个不同的普通技能冷却缩短 30%，伤害 +20%。', apply: (m) => { m.scroll = true; } });
boon('s_swift', '速卷', 'skill', 0, { school: 'skill', icon: 'stopwatch', skill: 'normal', desc: '普通技能冷却 -10%。', apply: (m) => { add(m, 'normCd', 0.1); } });
boon('s_heavy', '重卷', 'skill', 0, { school: 'skill', icon: 'hammer-drop', skill: 'normal', desc: '普通技能伤害 +12%。', apply: (m) => { mul(m, 'normMul', 1.12); } });
boon('s_wide', '广域', 'skill', 1, { school: 'skill', icon: 'rolling-energy', skill: 'normal', desc: '普通技能范围 +20%。', apply: (m) => { add(m, 'normRange', 0.2); } });
boon('s_echo', '余波', 'skill', 1, { school: 'skill', icon: 'wind-slap', skill: 'normal', desc: '普通技能释放后 0.5 秒再触发一次余波，伤害为原来的 40%。', apply: (m) => { m.echo = true; } });
boon('s_dbl', '双发', 'skill', 2, { school: 'skill', icon: 'double-shot', skill: 'normal', desc: '普通技能有 25% 概率不进入冷却。', apply: (m) => { add(m, 'noCdProb', 0.25); } });
boon('s_two', '双技', 'link', 2, { school: 'skill', icon: 'lightning-trio', skill: 'normal', desc: '1.5 秒内释放两个不同的普通技能，第二个必定暴击。', apply: (m) => { m.twoCrit = true; } });
boon('x_arm', '独臂', 'cost', 2, { school: 'skill', icon: 'bleeding-wound', skill: 'normal', desc: '封印奥义；普通技能伤害 ×1.6。', excl: ['u_core', 'u_charge', 'u_ext', 'u_amp', 'u_after', 'u_exec', 'u_redo', 'x_solo'], apply: (m) => { m.sealIdx = 3; mul(m, 'normMul', 1.6); } });
boon('x_evil', '邪化', 'cost', 2, { school: 'skill', icon: 'daemon-skull', skill: 'normal', desc: '普通技能冷却 +40%，伤害 ×1.5。', apply: (m) => { add(m, 'normCdPlus', 0.4); mul(m, 'normMul', 1.5); } });

/* ---------- 奥义流 ---------- */
boon('u_core', '极意', 'core', 3, { school: 'ult', icon: 'fire-ring', skill: 3, desc: '奥义冷却 -30%；释放奥义时，三个普通技能的冷却全部清零。', apply: (m) => { m.cdSkill[3] += 0.3; m.ultReset = true; } });
boon('u_charge', '蓄能', 'skill', 0, { school: 'ult', icon: 'burning-embers', skill: 3, desc: '普通技能命中时，奥义冷却 -0.4 秒（每次释放最多触发一次）。', apply: (m) => { add(m, 'ultCharge', 0.4); } });
boon('u_ext', '延展', 'skill', 1, { school: 'ult', icon: 'cycle', skill: 3, desc: '奥义的持续时间与范围 +25%。', apply: (m) => { mul(m, 'ultDur', 1.25); } });
boon('u_amp', '增幅', 'skill', 1, { school: 'ult', icon: 'muscle-up', skill: 3, desc: '奥义伤害 +20%（变身类奥义：攻击加成 ×1.2）。', apply: (m) => { mul(m, 'ultAmp', 1.2); } });
boon('u_after', '余韵', 'skill', 2, { school: 'ult', icon: 'sun', skill: 3, desc: '奥义结束后 4 秒内，普通技能伤害 +25%。', apply: (m) => { m.ultAfter = true; } });
boon('u_exec', '斩首', 'skill', 2, { school: 'ult', icon: 'skull-crack', skill: 3, desc: '击败精英或 Boss 时，奥义冷却 -8 秒。', apply: (m) => { m.ultKill = true; } });
boon('u_redo', '重演', 'skill', 2, { school: 'ult', icon: 'backup', skill: 3, desc: '奥义释放 2 秒后再释放一次，威力为 50%。', apply: (m) => { m.ultRedo = true; } });
boon('x_solo', '孤注', 'cost', 2, { school: 'ult', icon: 'fist', skill: 3, desc: '奥义伤害 ×1.5，但奥义持续期间无法使用普通技能。', excl: ['x_arm'], apply: (m) => { mul(m, 'ultAmp', 1.5); m.solo = true; } });

/* ---------- 分身流 ---------- */
boon('c_core', '影分身', 'core', 3, { school: 'clone', icon: 'shadow-follower', skill: 'normal', desc: '释放普通技能时召出 1 个分身，分身 0.5 秒后复刻同一个技能，伤害为 40%，存在 3 秒。', apply: (m) => { m.clone = 1; } });
boon('c_dmg', '分身强化', 'skill', 0, { school: 'clone', icon: 'sparkles', skill: 'normal', req: 'c_core', desc: '分身伤害 +15%。', apply: (m) => { add(m, 'cloneDmg', 0.15); } });
boon('c_life', '延续', 'skill', 0, { school: 'clone', icon: 'cycle', skill: 'normal', req: 'c_core', desc: '分身存在时间 +1 秒。', apply: (m) => { add(m, 'cloneLife', 1); } });
boon('c_two', '双影', 'skill', 1, { school: 'clone', icon: 'backup', skill: 'normal', req: 'c_core', desc: '同时召出 2 个分身，每个伤害为 35%。', apply: (m) => { m.cloneN = 2; } });
boon('c_inh', '继承', 'skill', 1, { school: 'clone', icon: 'chained-heart', skill: 'normal', req: 'c_core', desc: '分身继承本体的暴击率与范围类强化。', apply: (m) => { m.cloneInherit = true; } });
boon('c_sub', '替身', 'skill', 2, { school: 'clone', icon: 'shield-reflect', skill: 'normal', req: 'c_core', desc: '分身存在时，本体受到的下一次攻击由分身承受，分身消散；每 10 秒触发一次。', apply: (m) => { m.cloneSub = true; } });
boon('c_dance', '影舞', 'skill', 2, { school: 'clone', icon: 'running-ninja', skill: 'basic', req: 'c_core', desc: '分身同时复刻普攻，伤害为普攻的 40%。', apply: (m) => { m.cloneDance = true; } });
boon('c_burst', '爆散', 'skill', 2, { school: 'clone', icon: 'rolling-energy', skill: 'normal', req: 'c_core', desc: '分身消失时爆炸，造成技能伤害 60% 的范围伤害。', apply: (m) => { m.cloneBurst = true; } });
boon('c_awake', '分身·觉醒', 'link', 3, { school: 'clone', icon: 'fire-silhouette', skill: 3, req: ['c_core', 'u_core'], desc: '释放奥义时，分身同时引发一次震地，造成奥义威力的范围伤害（需已持有「极意」）。', apply: (m) => { m.cloneUlt = true; } });

/* ---------- 宠物流（通灵） ---------- */
boon('p_core', '通灵契约', 'core', 3, { school: 'pet', excl: ['pet_wolf'], icon: 'wolf-head', skill: 'pet', desc: '获得一只幼狼，自动攻击，伤害为玩家攻击的 30%。', apply: (m) => { m.pet = 1; } });
boon('p_atk', '宠物攻击', 'skill', 0, { school: 'pet', icon: 'paw-print', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物伤害 +15%。', apply: (m) => { add(m, 'petDmg', 0.15); } });
boon('p_wisp', '魂火', 'skill', 1, { school: 'pet', icon: 'flame', skill: 'pet', desc: '获得 2 团环绕魂火，对附近的敌人造成伤害，不占宠物栏位。', apply: (m) => { m.wisps += 2; } });
boon('p_king', '进化·狼王', 'skill', 1, { school: 'pet', icon: 'wolf-howl', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼进化为狼王，伤害提高到玩家攻击的 45%，攻击带小范围。', apply: (m) => { m.petTier = Math.max(m.petTier || 0, 1); } });
boon('p_heart', '同心', 'skill', 1, { school: 'pet', icon: 'chained-heart', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物击败敌人时，普通技能冷却 -1 秒。', apply: (m) => { m.petKillCd = true; } });
boon('p_moon', '进化·月狼', 'skill', 2, { school: 'pet', icon: 'sun', skill: 'pet', req: 'p_king', desc: '伤害提高到 60%，每 6 秒嚎叫一次，使玩家攻击 +10%，持续 3 秒。', apply: (m) => { m.petTier = Math.max(m.petTier || 0, 2); } });
boon('p_cmd', '号令', 'link', 2, { school: 'pet', icon: 'target-arrows', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '释放奥义时，宠物强化 8 秒：伤害 ×2，攻速 +50%。', apply: (m) => { m.petCmd = true; } });
boon('p_same', '同源', 'skill', 2, { school: 'pet', icon: 'eyeball', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物继承玩家的暴击率与暴击伤害。', apply: (m) => { m.petCrit = true; } });

/* 宠物（宠物之洞 / 商店获得，不进普通强化池）。最多同时携带 2 只，魂火不占栏位 */
boon('pet_wolf', '幼狼', 'pet', 2, { school: 'pet', noRoll: true, icon: 'wolf-head', skill: 'pet', excl: ['p_core'], desc: '获得一只幼狼，自动攻击，伤害为玩家攻击的 30%。可进化为狼王、月狼。', apply: (m) => { m.pet = 1; } });
boon('pet_raven', '灵鸦', 'pet', 2, { school: 'pet', noRoll: true, icon: 'raven', skill: 'pet', desc: '获得一只灵鸦，伴飞，移动速度 +12%。', apply: (m) => { m.raven = 1; add(m, 'moveSpd', 0.12); } });
boon('pet_stone', '石灵', 'pet', 2, { school: 'pet', noRoll: true, icon: 'rock', skill: 'pet', desc: '获得一只石灵，替你承受伤害（承伤量为最大生命的 30%），被击毁后 20 秒复活。', apply: (m) => { m.stone = 1; } });
boon('p_raven2', '进化·神鸦', 'skill', 2, { school: 'pet', icon: 'raven', skill: 'pet', req: 'pet_raven', reqText: '需要灵鸦', desc: '灵鸦进化为神鸦：移动速度再 +8%（共 +20%），暴击率 +5%。', apply: (m) => { add(m, 'moveSpd', 0.08); m.crit += 0.05; } });
boon('p_stone2', '进化·守护石像', 'skill', 2, { school: 'pet', icon: 'rock', skill: 'pet', req: 'pet_stone', reqText: '需要石灵', desc: '石灵进化为守护石像：承伤量提高到最大生命的 45%；被击毁时震飞并眩晕周围敌人。', apply: (m) => { m.stoneTier = 1; } });
boon('p_swift', '迅捷', 'skill', 1, { school: 'pet', icon: 'sprint', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼攻击间隔 -20%。', apply: (m) => { add(m, 'petCdr', 0.2); } });
boon('p_bleed', '撕咬', 'skill', 1, { school: 'pet', icon: 'bleeding-wound', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼的攻击附带流血：1.5 秒内再造成 3 次伤害，每次为本次攻击的 30%。', apply: (m) => { m.petBleed = true; } });
boon('p_sync', '默契', 'skill', 1, { school: 'pet', icon: 'chained-heart', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '玩家普攻命中时，幼狼的攻击冷却 -0.12 秒。', apply: (m) => { m.petSync = true; } });
boon('p_feed', '喂养', 'skill', 1, { school: 'pet', icon: 'health-potion', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '本场战斗每击败 1 个敌人，幼狼伤害 +2%（最多 +30%）。', apply: (m) => { m.petFeed = true; } });
boon('p_guard', '护主', 'skill', 1, { school: 'pet', icon: 'shield-reflect', skill: 'pet', req: 'p_core|pet_wolf|pet_raven|pet_stone', reqText: '需要任一宠物', desc: '每只宠物使你受到的伤害 -6%。', apply: (m) => { add(m, 'petGuard', 0.06); } });
boon('p_wisp2', '炽魂', 'skill', 1, { school: 'pet', icon: 'burning-embers', skill: 'pet', req: 'p_wisp', desc: '魂火数量 +1，魂火伤害 +50%。', apply: (m) => { m.wisps += 1; m.wispDmg += 0.5; } });
boon('p_double', '连噬', 'skill', 2, { school: 'pet', icon: 'double-shot', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼的攻击有 25% 概率立刻再咬一口。', apply: (m) => { m.petDouble = true; } });
boon('p_pounce', '扑杀', 'link', 2, { school: 'pet', icon: 'crossed-swords', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '释放普通技能时，幼狼立刻扑向最近的敌人发动一次攻击。', apply: (m) => { m.petPounce = true; } });
boon('p_pack', '万灵', 'skill', 2, { school: 'pet', icon: 'sparkles', skill: 'pet', req: 'p_core|pet_wolf|pet_raven|pet_stone', reqText: '需要任一宠物', desc: '同时携带 2 只宠物时，幼狼伤害 +30%。', apply: (m) => { m.petPack = true; } });

/* ---------- 普攻流 ---------- */
boon('b_core', '疾风连击', 'core', 3, { school: 'basic', icon: 'sword-brandish', skill: 'basic', desc: '普攻攻速 +30%；每第三下普攻必定暴击，并发出一道冲击波。', apply: (m) => { m.basicCore = true; add(m, 'basicSpd', 0.3); } });
boon('b_blade', '利刃', 'basic', 0, { school: 'basic', icon: 'plain-dagger', skill: 'basic', desc: '普攻伤害 +12%。', apply: (m) => { mul(m, 'basicMul', 1.12); } });
boon('b_acc', '精准', 'basic', 0, { school: 'basic', icon: 'eyeball', skill: 'basic', desc: '暴击率 +6%。', apply: (m) => { m.crit += 0.06; } });
boon('b_heavy', '重击', 'basic', 1, { school: 'basic', icon: 'anvil-impact', skill: 'basic', desc: '普攻第三下伤害 +40%。', apply: (m) => { m.heavy3 = true; } });
boon('b_pen', '破甲', 'basic', 1, { school: 'basic', icon: 'cracked-shield', skill: 'basic', desc: '普攻命中使目标受到的伤害 +8%，持续 3 秒，不叠加。', apply: (m) => { m.armorBreak = true; } });
boon('b_chase', '追击', 'basic', 1, { school: 'basic', icon: 'boot-prints', skill: 'basic', desc: '普攻命中使普通技能冷却 -0.3 秒。', apply: (m) => { add(m, 'basicCd', 0.3); } });
boon('x_lone', '孤勇', 'cost', 1, { school: 'basic', icon: 'fist', skill: 'basic', desc: '无法获得护盾（盾类技能被封印），攻击 +20%。', apply: (m) => { m.noShield = true; m.atkPct += 0.2; } });
boon('b_dance', '乱舞', 'basic', 2, { school: 'basic', icon: 'axe-swing', skill: 'basic', desc: '每 10 连击使伤害 +5%，上限 +25%，受击后连击清零。', apply: (m) => { m.frenzy = 1; } });
boon('b_pierce', '穿透', 'basic', 2, { school: 'basic', icon: 'crescent-blade', skill: 'basic', req: 'b_core', desc: '第三下普攻的冲击波穿透敌人，范围 +50%。', apply: (m) => { m.wavePierce = true; } });

/* ---------- 骑士专属：重斩 ---------- */
const KN = { hero: 'knight' };
boon('l_break', '破阵令', 'link', 2, Object.assign({ icon: 'crossed-swords', skill: 0, desc: '盾击震晕命中至少 1 名敌人时，立即清除重斩冷却；重斩对震晕或破绽状态的目标必定暴击。', apply: (m) => { m.k_break = true; } }, KN));
boon('e_charge', '重斩·蓄势', 'skill', 1, Object.assign({ icon: 'hammer-drop', skill: 0, desc: '重斩起手时可按住技能键蓄力，最长 0.6 秒，每 0.1 秒伤害 +8%。蓄力期间不能移动。', apply: (m) => { m.k_charge = true; } }, KN));
boon('e_rift', '重斩·裂地', 'skill', 2, Object.assign({ icon: 'sword-wound', skill: 0, req: 'e_charge', desc: '重斩命中后，在目标脚下留下持续 3 秒的裂地，范围内敌人移动速度 -40%。需要先获得「重斩·蓄势」。', apply: (m) => { m.k_rift = true; } }, KN));
boon('e_follow', '追斩', 'basic', 0, Object.assign({ icon: 'sword-brandish', skill: 'basic', desc: '重斩命中后 2 秒内，普攻第一下伤害 +60%。', apply: (m) => { m.k_follow = true; } }, KN));
boon('e_echo', '处决回响', 'skill', 2, Object.assign({ icon: 'lightning-trio', skill: 0, desc: '触发处决时，对周围 400 范围内的其他敌人造成 80% 的处决伤害。', apply: (m) => { m.k_echo = true; } }, KN));
boon('l_air', '浮空处决', 'link', 2, Object.assign({ icon: 'wind-slap', skill: 0, desc: '重斩命中浮空的敌人时，视为处决（伤害 ×2）。', apply: (m) => { m.k_airExec = true; } }, KN));
/* 旋风斩 */
boon('w_cd', '回旋', 'skill', 0, Object.assign({ icon: 'cycle', skill: 1, desc: '旋风斩冷却 -20%。', apply: (m) => { m.cdSkill[1] += 0.2; } }, KN));
boon('w_float', '浮空连斩', 'skill', 1, Object.assign({ icon: 'whirlwind', skill: 1, desc: '旋风斩对浮空敌人的伤害倍率由 ×1.5 提高到 ×2.0。', apply: (m) => { m.k_floatChain = true; } }, KN));
boon('w_launch', '挑飞强化', 'basic', 1, Object.assign({ icon: 'stomp', skill: 'basic', desc: '普攻第三下的挑飞高度 +30%，目标落地时产生范围震荡。', apply: (m) => { m.k_launch = true; } }, KN));
boon('w_eye', '风暴眼', 'skill', 2, Object.assign({ icon: 'whirlwind', skill: 1, desc: '旋风斩将范围内的敌人向中心牵引。', apply: (m) => { m.k_eye = true; } }, KN));
boon('w_wave', '剑风', 'skill', 2, Object.assign({ icon: 'crescent-blade', skill: 1, desc: '旋风斩结束时向前释放一道穿透剑气，伤害为旋风斩的 150%。', apply: (m) => { m.k_wave = true; } }, KN));
boon('l_spin', '旋斩震慑', 'link', 2, Object.assign({ icon: 'whirlwind', skill: 1, desc: '旋风斩命中震晕状态的敌人时，伤害 ×1.5，并重置震晕时间。', apply: (m) => { m.k_spinStun = true; } }, KN));
/* 盾墙·盾击 */
boon('c_fort', '加固', 'skill', 0, Object.assign({ icon: 'stone-wall', skill: 2, desc: '盾墙的护盾量 +15%。', apply: (m) => { m.k_fort = true; } }, KN));
boon('c_roar', '盾击·广域', 'skill', 0, Object.assign({ icon: 'shield-bash', skill: 2, desc: '盾击的震晕范围 +20%。', apply: (m) => { m.k_roar = true; } }, KN));
boon('c_awe', '盾击·慑魂', 'skill', 1, Object.assign({ icon: 'shield-bash', skill: 2, desc: '盾击震晕时间 +0.6 秒；对精英与 Boss 改为施加 2 秒破绽（受到伤害 +25%，重斩视为处决）。', apply: (m) => { m.k_awe = true; } }, KN));
boon('c_thorn', '荆棘甲', 'skill', 1, Object.assign({ icon: 'thorny-vine', skill: 2, desc: '盾墙期间，反弹 40% 受到的伤害。', apply: (m) => { m.k_thorn = true; } }, KN));
boon('c_perfect', '完美格挡', 'skill', 1, Object.assign({ icon: 'bell-shield', skill: 2, desc: '盾墙生效后 0.5 秒内的第一次受击视为完美格挡，免受伤害并返还 50% 冷却。', apply: (m) => { m.k_perfect = true; } }, KN));
boon('c_mount', '不动如山', 'skill', 2, Object.assign({ icon: 'rock', skill: 2, desc: '盾墙期间，受到伤害额外 -20%。', apply: (m) => { m.k_mount = true; } }, KN));
boon('c_rock', '磐石反击', 'skill', 2, Object.assign({ icon: 'mountain-cave', skill: 2, desc: '盾墙期间受击不会被打断，每次受击攒 1 层反击（上限提高到 5）；盾墙结束时按层数追加一道冲击波。', apply: (m) => { m.k_rock = true; } }, KN));
boon('c_nail', '钉盾', 'skill', 2, Object.assign({ icon: 'spiked-shoulder-armor', skill: 2, desc: '反击层数上限 +2；重斩消耗层数时每层 +70%（原为 +50%）。', apply: (m) => { m.k_nail = true; } }, KN));
boon('l_chain', '盾击连锁', 'link', 2, Object.assign({ icon: 'chained-heart', skill: 2, desc: '盾墙冷却中，每释放一次其他技能，盾墙冷却 -1.5 秒。', apply: (m) => { m.k_bashChain = true; } }, KN));
/* 狂战·觉醒 */
boon('b_lust', '嗜战', 'skill', 1, Object.assign({ icon: 'dripping-blade', skill: 3, desc: '狂战期间每击杀 1 个敌人，狂战持续时间 +0.5 秒（最多额外 +3 秒）。', apply: (m) => { m.k_lust = true; } }, KN));
boon('b_fear', '无畏之躯', 'skill', 1, Object.assign({ icon: 'barbute', skill: 3, desc: '狂战期间不会被击退或打断。', apply: (m) => { m.k_fear = true; } }, KN));
boon('b_moon', '血月', 'skill', 2, Object.assign({ icon: 'sun', skill: 3, desc: '狂战持续时间 +4 秒；结束后的虚弱缩短为 1.5 秒；狂战期间普攻每一击附带 20% 额外伤害。', apply: (m) => { m.k_moon = true; } }, KN));
boon('b_blade2', '红刃', 'skill', 2, Object.assign({ icon: 'fire-silhouette', skill: 3, desc: '狂战期间，普攻的攻击范围 +30%。', apply: (m) => { m.k_blade = true; } }, KN));
boon('b_rage', '余怒', 'skill', 2, Object.assign({ icon: 'flame', skill: 3, desc: '狂战结束后的虚弱期间，普攻伤害 +30%。', apply: (m) => { m.k_rage = true; } }, KN));

const BOON = Object.fromEntries(BOONS.map((b) => [b.id, b]));

/* 把一组强化汇总为战斗属性 */
function buildMods(ids, extra) {
  const m = emptyMods();
  for (const id of ids) { const b = BOON[id]; if (b) b.apply(m); }
  if (extra) { m.atkPct += extra.atkPct || 0; m.hpPct += extra.hpPct || 0; m.cdr += extra.cdr || 0; }
  m.dmg = (1 + m.atkPct) * m.allDmg;
  m.cdr = Math.min(0.5, m.cdr);
  m.reduce = Math.min(0.5, m.reduce);
  m.dodgeCdr = Math.min(0.6, m.dodgeCdr);
  m.crit = Math.min(1, m.crit);
  return m;
}
