'use strict';

const ANIMS = window.ANIMS || {};
const HERO_H = 236;

const HEROES = {
  wine: {
    name: '酒红剑客', hp: 100, atk: 10, speed: 150, ranged: false, color: '#c8404a', reach: 60,
    blurb: '完美闪避灌魂，魂满变身暴走：普攻刀气、碑雨、血爪、血狱，期间无敌',
    skills: [
      { id: 'w1', name: '送葬突刺', cd: 6, glyph: 'sprint', desc: '一口气穿过敌人，刻下墓志；对眩晕敌人必暴击，可触发完美闪避' },
      { id: 'w2', name: '掷碑·瞬身', cd: 5, glyph: 'crescent-blade', desc: '掷出巨剑钉住敌人；再按一次瞬移到剑的位置并斩击' },
      { id: 'w3', name: '断空', cd: 7, glyph: 'whirlwind', desc: '延迟爆出斩痕；时空断裂中变成瞬狱，穿梭全屏敌人' },
      { id: 'w4', name: '葬碑·血契', cd: 0, glyph: 'daemon-skull', ult: true, desc: '魂满变身暴走：无敌，全场敌人半速，技能全屏化' },
    ],
  },
  knight: {
    name: '骑士', hp: 280, atk: 15, speed: 270, ranged: false, color: '#cfe3ff', reach: 150,
    basic: { mults: [1, 1.1, 1.8], dur: 0.46, launch: 950 }, blurb: '近战连招：普攻第三下挑飞，K 跳起空中追击；盾击震晕后接重斩处决',
    skills: [
      { id: 'k1', name: '重斩', cd: 4, icon: 'icons/skills/knight_0.png', type: 'slash', glyph: 'broadsword', mult: 2.7, range: 280, castDur: 0.62, castHit: 0.3, desc: '蓄力前冲劈砍。对眩晕或露出破绽的敌人触发处决（伤害×2）；打出盾墙攒下的反击层数，每层 +50%' },
      { id: 'k2', name: '旋风斩', cd: 7, icon: 'icons/skills/knight_1.png', type: 'spin', glyph: 'whirlwind', mult: 1.9, radius: 195, castDur: 0.5, castHit: 0.06, desc: '原地旋转两次。打浮空敌人伤害×1.5 并把它托得更高；空中也能放' },
      { id: 'k3', name: '盾墙·盾击', cd: 14, icon: 'icons/skills/knight_3.png', type: 'shield', pct: 0.3, dur: 6, counter: 3, bash: { stun: 1.6, radius: 200, mult: 1.2 }, castDur: 0.36, glyph: 'shield-bash', desc: '获得 30% 生命的护盾，持续 6 秒；护盾每挡一次攒 1 层反击（最多 3 层），由下一次重斩打出。护盾结束时前冲盾击，范围震晕 1.6 秒——震晕期间接重斩就是处决' },
      { id: 'k4', name: '狂战·觉醒', cd: 45, icon: 'icons/skills/knight_2.png', type: 'warcry', atk: 0.45, spd: 0.12, dur: 8, radius: 270, berserk: true, weak: 3, castDur: 0.8, castHit: 0.38, ult: true, glyph: 'enrage', desc: '奥义。变身红眼狂战士 8 秒：攻击 +45%、攻速 +12%。变身结束后虚弱 3 秒，不能放技能' },
    ],
  },
  necro: {
    name: '骷髅法师', hp: 200, atk: 17, speed: 255, ranged: true, color: '#c58bff', proj: 'orb', reach: 520,
    basic: { mults: [1, 1, 1.6], dur: 0.5 }, blurb: '远程，火球穿透，毒云控场，要注意拉开距离',
    skills: [
      { id: 'n1', name: '暗焰', cd: 4, icon: 'icons/skills/necro_0.png', type: 'fireball', mult: 2.9, desc: '发射穿透敌人的暗焰火球' },
      { id: 'n2', name: '亡灵爆发', cd: 7, icon: 'icons/skills/necro_1.png', type: 'burst', mult: 2.3, radius: 170, dist: 270, desc: '在前方延迟引爆，范围伤害' },
      { id: 'n3', name: '瘟疫', cd: 10, icon: 'icons/skills/necro_2.png', type: 'plague', dps: 0.6, dur: 5, radius: 160, dist: 250, desc: '在前方留下毒云，持续伤害' },
      { id: 'n4', name: '骨盾', cd: 14, icon: 'icons/skills/necro_4.png', type: 'shield', pct: 0.26, dur: 6, thorns: 0.4, desc: '获得护盾，并反弹 40% 受到的伤害' },
    ],
  },
  nun: {
    name: '修女', hp: 220, atk: 13, speed: 262, ranged: true, color: '#ffd987', proj: 'orb', reach: 480,
    basic: { mults: [1, 1, 1.6], dur: 0.46 }, blurb: '远程辅助，圣光治疗和圣盾让她最耐打',
    skills: [
      { id: 'u1', name: '审判', cd: 5, icon: 'icons/skills/nun_1.png', type: 'smite', mult: 3.3, radius: 115, range: 560, desc: '召唤天雷轰击前方最近的敌人' },
      { id: 'u2', name: '圣光', cd: 9, icon: 'icons/skills/nun_0.png', type: 'heal', pct: 0.3, desc: '回复 30% 最大生命' },
      { id: 'u3', name: '神圣新星', cd: 8, icon: 'icons/skills/nun_2.png', type: 'nova', mult: 1.8, radius: 240, heal: 0.08, desc: '周身爆发圣光，伤害敌人并回复 8% 生命' },
      { id: 'u4', name: '圣盾', cd: 14, icon: 'icons/skills/nun_4.png', type: 'shield', pct: 0.36, dur: 6, desc: '获得相当于 36% 生命的护盾' },
    ],
  },
  hunter: {
    name: '猎人', hp: 210, atk: 14, speed: 300, ranged: true, color: '#ffe9b0', proj: 'bolt', reach: 560,
    basic: { mults: [1, 1, 1.5], dur: 0.4 }, blurb: '远程高机动，三连射和箭雨清场，疾风可位移',
    skills: [
      { id: 'h1', name: '三连射', cd: 4, icon: 'icons/skills/hunter_0.png', type: 'triple', mult: 1.3, desc: '连续射出三支弩箭' },
      { id: 'h2', name: '毒箭', cd: 7, icon: 'icons/skills/hunter_1.png', type: 'poisonarrow', mult: 0.9, dps: 0.65, dur: 5, desc: '射出毒箭，造成持续伤害' },
      { id: 'h3', name: '箭雨', cd: 9, icon: 'icons/skills/hunter_2.png', type: 'volley', mult: 0.75, radius: 200, dist: 330, desc: '在前方落下三轮箭雨' },
      { id: 'h4', name: '疾风', cd: 13, icon: 'icons/skills/hunter_5.png', type: 'gale', dash: 280, haste: 0.35, dur: 6, desc: '向前冲刺并无敌片刻，6 秒内移速和攻速提升' },
    ],
  },
};
const HERO_KEYS = ['wine']; // 阶段 1 只做骑士，其余英雄暂缓（数据保留）

const COINS = { skeleton: 3, imp: 2, reaper: 5, dragon: 40 };

function emptyMods() {
  return { dmg: 1, cdr: 0, crit: 0, critDmg: 0, skillDmg: 0, basicCrit: 0, fin: 0, spd: 0, dodgeCdr: 0, reduce: 0, coin: 0, killHeal: 0, link: 0.2,
    bossDmg: 0, reflect: 0, startShield: 0, wisps: 0, wispDmg: 0, wispRed: 0, ember: 0, refund: 0, dbl: 0, frenzy: 0, mark: 0, chase: 0,
    killBlast: 0, breakBlast: 0, counter: 0, hpPct: 0, cand: 0, atkPct: 0,
    allDmg: 1, skillAll: 1, skMul: [1, 1, 1, 1], cdSkill: [0, 0, 0, 0], cdPlus: 0, sealIdx: -1, noDodge: false, noShield: false, postHeal: 0, castReduce: 0,
    pdStack: false, pdCrit: false, pdShield: 0, pdSlow: 0 };
}

const ENEMIES = {
  skeleton: { name: '骷髅兵', img: 'sprites/monsters/mon_skeleton_2.png', h: 214, art: 'R', hp: 100, speed: 92, dmg: 14, ai: 'grunt', range: 120, windup: 0.6 },
  imp: { name: '小恶魔', img: 'sprites/monsters/mon_imp_3.png', h: 160, art: 'F', hp: 62, speed: 150, dmg: 11, ai: 'imp' },
  tombfiend: { name: '墓渊魔', img: 'gv/enemies/boss-portrait.png', h: 144, art: 'L', hp: 1400, speed: 70, dmg: 18, ai: 'boss', boss: true },
  reaper: { name: '瘟疫收割者', img: 'sprites/monsters/mon_reaper_3.png', h: 226, art: 'F', hp: 120, speed: 80, dmg: 18, ai: 'caster' },
  skelcap: { name: '骷髅队长', img: 'sprites/monsters/mon_skeleton_3.png', h: 300, art: 'L', hp: 900, speed: 88, dmg: 20, ai: 'captain', boss: true },
  merchant: { name: '流浪商人', img: 'pets/merchant.png', h: 230, art: 'L', hp: 120, speed: 78, dmg: 20, ai: 'merchant' },
  dragon: { name: '翡翠幼龙', img: 'sprites/monsters/mon_dragon_green.png', h: 330, art: 'L', hp: 1700, speed: 66, dmg: 28, ai: 'boss', boss: true },
};

const WAVES = [
  { name: '第一波', list: ['skeleton', 'skeleton', 'skeleton'] },
  { name: '第二波', list: ['skeleton', 'skeleton', 'imp', 'imp'] },
  { name: '第三波', list: ['reaper', 'imp', 'imp', 'skeleton'] },
  { name: 'BOSS', list: ['dragon'] },
];
