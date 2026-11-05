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
  clone: { hidden: true, name: '分身流', color: '#4FE3D0', icon: 'shadow-follower', core: 'c_core', blurb: '释放技能时召出分身，复刻同一个技能。' },
  pet: { hidden: true, name: '宠物流', color: '#7DFF9A', icon: 'wolf-head', core: 'p_core', blurb: '宠物自动战斗，进化后越来越强。' },
  basic: { name: '普攻流', color: '#CFD8E6', icon: 'sword-brandish', core: 'b_core', blurb: '强化普攻三连击与暴击，普攻反哺技能冷却。' },
};
const SCHOOL_KEYS = Object.keys(SCHOOLS).filter((k) => !SCHOOLS[k].hidden);

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
stat('spd', '疾行', 'boot-prints', [0.05, 0.09, 0.14], (v) => `移动速度 +${pc(v)}%`, (m, v) => { m.spd += v; });
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
boon('m_link', '万象·连', 'myriad', 4, { noRoll: true, icon: 'chained-heart', desc: '连携加成翻倍。', apply: (m) => { m.link += 0.2; } });

/* ---------- 闪避反打（通用）：完美闪避后下个普通技能免冷却，以下强化把这条线做深 ---------- */
boon('d_trace', '残影', 'skill', 1, { icon: 'backup', desc: '完美闪避叠加 1 层残影（最多 3 层，8 秒），每层技能伤害 +10%；受伤清空。', apply: (m) => { m.pdStack = true; } });
boon('d_eye', '破绽之眼', 'skill', 1, { icon: 'eyeball', desc: '完美闪避后 3 秒内，技能必定暴击。', apply: (m) => { m.pdCrit = true; } });
boon('d_ward', '惊鸿护体', 'skill', 2, { icon: 'shield-reflect', desc: '完美闪避获得相当于 12% 最大生命的护盾。', apply: (m) => { m.pdShield = 0.12; } });
boon('d_time', '时隙', 'skill', 2, { icon: 'stopwatch', desc: '完美闪避的时空断裂时间 +1.1 秒（2.2 → 3.3 秒），给你更久的反打时机。', apply: (m) => { m.pdSlow = 1.1; } });

/* ---------- 通用代价 ---------- */
boon('x_pot', '破釜', 'cost', 2, { icon: 'axe-swing', desc: '不能使用闪避，全部伤害 +30%。', apply: (m) => { m.noDodge = true; m.allDmg *= 1.3; } });

/* ---------- 技能流（秘卷） ---------- */
boon('s_core', '秘卷·连环', 'core', 3, { school: 'skill', icon: 'scroll-unfurled', skill: 'normal', desc: '释放一个普通技能后 4 秒内，下一个不同的普通技能冷却缩短 30%，伤害 +20%。', apply: (m) => { m.scroll = true; } });
boon('s_swift', '速卷', 'skill', 0, { school: 'skill', icon: 'stopwatch', skill: 'normal', desc: '普通技能冷却 -10%。', apply: (m) => { add(m, 'normCd', 0.1); } });
boon('s_heavy', '重卷', 'skill', 0, { school: 'skill', icon: 'hammer-drop', skill: 'normal', desc: '普通技能伤害 +12%。', apply: (m) => { mul(m, 'normMul', 1.12); } });
boon('s_wide', '广域', 'skill', 1, { school: 'skill', icon: 'rolling-energy', skill: 'normal', desc: '普通技能范围 +20%。', apply: (m) => { add(m, 'normRange', 0.2); } });
boon('s_echo', '余波', 'skill', 1, { school: 'skill', noRoll: true, icon: 'wind-slap', skill: 'normal', desc: '普通技能释放后 0.5 秒再触发一次余波，伤害为原来的 40%。', apply: (m) => { m.echo = true; } });
boon('s_dbl', '双发', 'skill', 2, { school: 'skill', icon: 'double-shot', skill: 'normal', desc: '普通技能有 25% 概率不进入冷却。', apply: (m) => { add(m, 'noCdProb', 0.25); } });
boon('s_two', '双技', 'link', 2, { school: 'skill', icon: 'lightning-trio', skill: 'normal', desc: '1.5 秒内释放两个不同的普通技能，第二个必定暴击。', apply: (m) => { m.twoCrit = true; } });
boon('x_arm', '独臂', 'cost', 2, { school: 'skill', icon: 'bleeding-wound', skill: 'normal', desc: '封印奥义；普通技能伤害 ×1.6。', excl: ['u_core', 'u_charge', 'u_ext', 'u_amp', 'u_after', 'u_exec', 'u_redo', 'x_solo'], apply: (m) => { m.sealIdx = 3; mul(m, 'normMul', 1.6); } });
boon('x_evil', '邪化', 'cost', 2, { school: 'skill', icon: 'daemon-skull', skill: 'normal', desc: '普通技能冷却 +40%，伤害 ×1.5。', apply: (m) => { add(m, 'normCdPlus', 0.4); mul(m, 'normMul', 1.5); } });

/* ---------- 奥义流 ---------- */
boon('u_core', '极意', 'core', 3, { school: 'ult', icon: 'fire-ring', skill: 3, desc: '变身所需的魂 -1（最低 2 格）；暴走结束时额外获得 1 格魂。', apply: (m) => { m.soulCore = true; } });
boon('u_charge', '蓄能', 'skill', 0, { school: 'ult', icon: 'burning-embers', skill: 3, desc: '普通技能命中时 +0.2 格魂（每次释放最多触发一次）。', apply: (m) => { add(m, 'ultCharge', 0.2); } });
boon('u_ext', '延展', 'skill', 1, { school: 'ult', icon: 'cycle', skill: 3, desc: '暴走时间 +25%。', apply: (m) => { mul(m, 'ultDur', 1.25); } });
boon('u_amp', '增幅', 'skill', 1, { school: 'ult', icon: 'muscle-up', skill: 3, desc: '变身期间伤害 +20%。', apply: (m) => { mul(m, 'ultAmp', 1.2); } });
boon('u_after', '余韵', 'skill', 2, { school: 'ult', icon: 'sun', skill: 3, desc: '暴走结束后 4 秒内，普通技能伤害 +25%。', apply: (m) => { m.ultAfter = true; } });
boon('u_exec', '斩首', 'skill', 2, { school: 'ult', icon: 'skull-crack', skill: 3, desc: '击败 Boss 时 +2 格魂。', apply: (m) => { m.ultKill = true; } });
boon('u_redo', '重演', 'skill', 2, { school: 'ult', noRoll: true, icon: 'backup', skill: 3, desc: '「葬」释放 2 秒后再砸一次，威力为 50%。', apply: (m) => { m.ultRedo = true; } });
boon('x_solo', '孤注', 'cost', 2, { school: 'ult', icon: 'fist', skill: 3, desc: '变身期间伤害 ×1.5，但暴走时间减半、击杀不再加时。', excl: ['x_arm'], apply: (m) => { mul(m, 'ultAmp', 1.5); m.soloRage = true; } });

/* ---------- 分身流 ---------- */
boon('c_core', '影分身', 'core', 3, { school: 'clone', noRoll: true, icon: 'shadow-follower', skill: 'normal', desc: '释放普通技能时召出 1 个分身，分身 0.5 秒后复刻同一个技能，伤害为 40%，存在 3 秒。', apply: (m) => { m.clone = 1; } });
boon('c_dmg', '分身强化', 'skill', 0, { school: 'clone', noRoll: true, icon: 'sparkles', skill: 'normal', req: 'c_core', desc: '分身伤害 +15%。', apply: (m) => { add(m, 'cloneDmg', 0.15); } });
boon('c_life', '延续', 'skill', 0, { school: 'clone', noRoll: true, icon: 'cycle', skill: 'normal', req: 'c_core', desc: '分身存在时间 +1 秒。', apply: (m) => { add(m, 'cloneLife', 1); } });
boon('c_two', '双影', 'skill', 1, { school: 'clone', noRoll: true, icon: 'backup', skill: 'normal', req: 'c_core', desc: '同时召出 2 个分身，每个伤害为 35%。', apply: (m) => { m.cloneN = 2; } });
boon('c_inh', '继承', 'skill', 1, { school: 'clone', noRoll: true, icon: 'chained-heart', skill: 'normal', req: 'c_core', desc: '分身继承本体的暴击率与范围类强化。', apply: (m) => { m.cloneInherit = true; } });
boon('c_sub', '替身', 'skill', 2, { school: 'clone', noRoll: true, icon: 'shield-reflect', skill: 'normal', req: 'c_core', desc: '分身存在时，本体受到的下一次攻击由分身承受，分身消散；每 10 秒触发一次。', apply: (m) => { m.cloneSub = true; } });
boon('c_dance', '影舞', 'skill', 2, { school: 'clone', noRoll: true, icon: 'running-ninja', skill: 'basic', req: 'c_core', desc: '分身同时复刻普攻，伤害为普攻的 40%。', apply: (m) => { m.cloneDance = true; } });
boon('c_burst', '爆散', 'skill', 2, { school: 'clone', noRoll: true, icon: 'rolling-energy', skill: 'normal', req: 'c_core', desc: '分身消失时爆炸，造成技能伤害 60% 的范围伤害。', apply: (m) => { m.cloneBurst = true; } });
boon('c_awake', '分身·觉醒', 'link', 3, { school: 'clone', noRoll: true, icon: 'fire-silhouette', skill: 3, req: ['c_core', 'u_core'], desc: '释放奥义时，分身同时引发一次震地，造成奥义威力的范围伤害（需已持有「极意」）。', apply: (m) => { m.cloneUlt = true; } });

/* ---------- 宠物流（通灵） ---------- */
boon('p_core', '通灵契约', 'core', 3, { school: 'pet', noRoll: true, excl: ['pet_wolf'], icon: 'wolf-head', skill: 'pet', desc: '获得一只幼狼，自动攻击，伤害为玩家攻击的 30%。', apply: (m) => { m.pet = 1; } });
boon('p_atk', '宠物攻击', 'skill', 0, { school: 'pet', noRoll: true, icon: 'paw-print', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物伤害 +15%。', apply: (m) => { add(m, 'petDmg', 0.15); } });
boon('p_wisp', '魂火', 'skill', 1, { school: 'pet', noRoll: true, icon: 'flame', skill: 'pet', desc: '获得 2 团环绕魂火，对附近的敌人造成伤害，不占宠物栏位。', apply: (m) => { m.wisps += 2; } });
boon('p_king', '进化·狼王', 'skill', 1, { school: 'pet', noRoll: true, icon: 'wolf-howl', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼进化为狼王，伤害提高到玩家攻击的 45%，攻击带小范围。', apply: (m) => { m.petTier = Math.max(m.petTier || 0, 1); } });
boon('p_heart', '同心', 'skill', 1, { school: 'pet', noRoll: true, icon: 'chained-heart', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物击败敌人时，普通技能冷却 -1 秒。', apply: (m) => { m.petKillCd = true; } });
boon('p_moon', '进化·月狼', 'skill', 2, { school: 'pet', noRoll: true, icon: 'sun', skill: 'pet', req: 'p_king', desc: '伤害提高到 60%，每 6 秒嚎叫一次，使玩家攻击 +10%，持续 3 秒。', apply: (m) => { m.petTier = Math.max(m.petTier || 0, 2); } });
boon('p_cmd', '号令', 'link', 2, { school: 'pet', noRoll: true, icon: 'target-arrows', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '释放奥义时，宠物强化 8 秒：伤害 ×2，攻速 +50%。', apply: (m) => { m.petCmd = true; } });
boon('p_same', '同源', 'skill', 2, { school: 'pet', noRoll: true, icon: 'eyeball', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '宠物继承玩家的暴击率与暴击伤害。', apply: (m) => { m.petCrit = true; } });

/* 宠物（宠物之洞 / 商店获得，不进普通强化池）。最多同时携带 2 只，魂火不占栏位 */
boon('pet_wolf', '幼狼', 'pet', 2, { school: 'pet', noRoll: true, icon: 'wolf-head', skill: 'pet', excl: ['p_core'], desc: '获得一只幼狼，自动攻击，伤害为玩家攻击的 30%。可进化为狼王、月狼。', apply: (m) => { m.pet = 1; } });
boon('pet_raven', '灵鸦', 'pet', 2, { school: 'pet', noRoll: true, icon: 'raven', skill: 'pet', desc: '获得一只灵鸦，伴飞，移动速度 +12%。', apply: (m) => { m.raven = 1; add(m, 'moveSpd', 0.12); } });
boon('pet_stone', '石灵', 'pet', 2, { school: 'pet', noRoll: true, icon: 'rock', skill: 'pet', desc: '获得一只石灵，替你承受伤害（承伤量为最大生命的 30%），被击毁后 20 秒复活。', apply: (m) => { m.stone = 1; } });
boon('p_raven2', '进化·神鸦', 'skill', 2, { school: 'pet', noRoll: true, icon: 'raven', skill: 'pet', req: 'pet_raven', reqText: '需要灵鸦', desc: '灵鸦进化为神鸦：移动速度再 +8%（共 +20%），暴击率 +5%。', apply: (m) => { add(m, 'moveSpd', 0.08); m.crit += 0.05; } });
boon('p_stone2', '进化·守护石像', 'skill', 2, { school: 'pet', noRoll: true, icon: 'rock', skill: 'pet', req: 'pet_stone', reqText: '需要石灵', desc: '石灵进化为守护石像：承伤量提高到最大生命的 45%；被击毁时震飞并眩晕周围敌人。', apply: (m) => { m.stoneTier = 1; } });
boon('p_swift', '迅捷', 'skill', 1, { school: 'pet', noRoll: true, icon: 'sprint', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼攻击间隔 -20%。', apply: (m) => { add(m, 'petCdr', 0.2); } });
boon('p_bleed', '撕咬', 'skill', 1, { school: 'pet', noRoll: true, icon: 'bleeding-wound', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼的攻击附带流血：1.5 秒内再造成 3 次伤害，每次为本次攻击的 30%。', apply: (m) => { m.petBleed = true; } });
boon('p_sync', '默契', 'skill', 1, { school: 'pet', noRoll: true, icon: 'chained-heart', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '玩家普攻命中时，幼狼的攻击冷却 -0.12 秒。', apply: (m) => { m.petSync = true; } });
boon('p_feed', '喂养', 'skill', 1, { school: 'pet', noRoll: true, icon: 'health-potion', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '本场战斗每击败 1 个敌人，幼狼伤害 +2%（最多 +30%）。', apply: (m) => { m.petFeed = true; } });
boon('p_guard', '护主', 'skill', 1, { school: 'pet', noRoll: true, icon: 'shield-reflect', skill: 'pet', req: 'p_core|pet_wolf|pet_raven|pet_stone', reqText: '需要任一宠物', desc: '每只宠物使你受到的伤害 -6%。', apply: (m) => { add(m, 'petGuard', 0.06); } });
boon('p_wisp2', '炽魂', 'skill', 1, { school: 'pet', noRoll: true, icon: 'burning-embers', skill: 'pet', req: 'p_wisp', desc: '魂火数量 +1，魂火伤害 +50%。', apply: (m) => { m.wisps += 1; m.wispDmg += 0.5; } });
boon('p_double', '连噬', 'skill', 2, { school: 'pet', noRoll: true, icon: 'double-shot', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '幼狼的攻击有 25% 概率立刻再咬一口。', apply: (m) => { m.petDouble = true; } });
boon('p_pounce', '扑杀', 'link', 2, { school: 'pet', noRoll: true, icon: 'crossed-swords', skill: 'pet', req: 'p_core|pet_wolf', reqText: '需要幼狼', desc: '释放普通技能时，幼狼立刻扑向最近的敌人发动一次攻击。', apply: (m) => { m.petPounce = true; } });
boon('p_pack', '万灵', 'skill', 2, { school: 'pet', noRoll: true, icon: 'sparkles', skill: 'pet', req: 'p_core|pet_wolf|pet_raven|pet_stone', reqText: '需要任一宠物', desc: '同时携带 2 只宠物时，幼狼伤害 +30%。', apply: (m) => { m.petPack = true; } });

/* ---------- 普攻流 ---------- */
boon('b_core', '疾风连击', 'core', 3, { school: 'basic', icon: 'sword-brandish', skill: 'basic', desc: '普攻第三下必定暴击，伤害 +20%。', apply: (m) => { m.basicCore = true; mul(m, 'basicMul', 1.2); } });
boon('b_blade', '利刃', 'basic', 0, { school: 'basic', icon: 'plain-dagger', skill: 'basic', desc: '普攻伤害 +12%。', apply: (m) => { mul(m, 'basicMul', 1.12); } });
boon('b_acc', '精准', 'basic', 0, { school: 'basic', icon: 'eyeball', skill: 'basic', desc: '暴击率 +6%。', apply: (m) => { m.crit += 0.06; } });
boon('b_heavy', '重击', 'basic', 1, { school: 'basic', icon: 'anvil-impact', skill: 'basic', desc: '普攻第三下伤害 +40%。', apply: (m) => { m.heavy3 = true; } });
boon('b_pen', '破甲', 'basic', 1, { school: 'basic', icon: 'cracked-shield', skill: 'basic', desc: '普攻命中使目标受到的伤害 +8%，持续 3 秒，不叠加。', apply: (m) => { m.armorBreak = true; } });
boon('b_chase', '追击', 'basic', 1, { school: 'basic', icon: 'boot-prints', skill: 'basic', desc: '普攻命中使普通技能冷却 -0.3 秒。', apply: (m) => { add(m, 'basicCd', 0.3); } });
boon('x_lone', '孤勇', 'cost', 1, { school: 'basic', icon: 'fist', skill: 'basic', desc: '无法获得护盾（盾类技能被封印），攻击 +20%。', apply: (m) => { m.noShield = true; m.atkPct += 0.2; } });
boon('b_dance', '乱舞', 'basic', 2, { school: 'basic', icon: 'axe-swing', skill: 'basic', desc: '每 10 连击使普攻伤害 +5%，上限 +25%，受击后连击清零。', apply: (m) => { m.frenzy = 1; } });
boon('b_pierce', '穿透', 'basic', 2, { school: 'basic', noRoll: true, icon: 'crescent-blade', skill: 'basic', req: 'b_core', desc: '第三下普攻的冲击波穿透敌人，范围 +50%。', apply: (m) => { m.wavePierce = true; } });

/* ---------- 酒红剑客专属：按 设计文档 §8.8 ---------- */
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
