# 音效接线建议（js/sfx.js → js/room.js / run.js）

调用形式：`window.sfx && sfx.play('名字', { rate, gain })`。`play` 自带 40ms 同名节流、16 路复音上限（优先级 2 的可多占 4 路）、首次点击/按键/触摸后才出声，**调用方不用判断是否已解锁、不用自己节流**。随机 ±5% 音高微调已内置（普攻、命中、受伤等），不要再加。

优先级：2 = 一定要出声（完美闪避、变身、葬、受伤、Boss 大招、胜负）；1 = 重要；0 = 密集时可被丢弃（命中、碑雨、斩痕、tell）。

## 主角

| 音效 | 挂载点 | 说明 |
|---|---|---|
| atk1 / atk2 / atk3 | `doHit(p, kind)` 开头，kind `c0`→atk1，`c1`→atk2，`c2`→atk3；`run`（跑攻）用 atk2，`air` 用 atk1 | 挥出就响，不论是否命中 |
| rageSwing | `doHit` 里 `kind` 以 `t` 开头（`tc0/tc1/tc2`） | 暴走普攻刀气 |
| hit | `hurtEnemy` 里 `e.hp -= dmg` 之后（非暴击、未致死） | 优先级 0，一帧多个敌人同时中招会被节流吃掉，正常 |
| hitCrit | `hurtEnemy` 里 `o.crit` 为真时代替 hit | |
| kill | `hurtEnemy` 里 `e.hp <= 0` 且非 Boss 的分支 | 与 hit 不要同时放，致死时只放 kill |
| dash | `castSkills` 之外的 `want(p,'dodge')` 分支里 `setSt(p,'dash')` 之后 | 暴走的 `rdash` 用 `dash` 加 `{rate:1.3}` |
| perfect | `triggerPerfect(p, e)` 里 `gainSoul(1)` 之后、`if (R.witch > 0) return` 之前 | 全游戏最爽的音。无论是否新开时空断裂都放；`p.perfectUsed` 已防重复 |
| soul | `gainSoul(v)` 里 `v >= 0.5` 时（普攻墓志 +0.125 不要放，会吵） | 与 perfect 同帧，perfect 里已经覆盖，可只在三技联动（`noteLink` 里 `gainSoul(1)`）放 |
| witchEnd | `updateStage` 外：`R.witch` 从 >0 减到 0 的那一帧（2087 行附近，用前后值比较） | 瞬狱的 `Math.min(R.witch, 0.3)` 缩短也会走到这里 |
| thrust | `castSkills` 里 U 突刺 `setSt(p,'thrust')` 后 | |
| throw | `throwBlade(p)` | |
| blink | `blink(p)` | 瞬身 |
| iai | `doIai(p)` | 断空拔刀 |
| iaiCut | `updateCuts` 里 `c.done = true` 那一刻 | 优先级 0，瞬狱收刀时一串斩痕会被节流成几声，是好事 |
| storm | `startStorm(p, red)` | 常态、血狱都用；血狱可加 `{rate:0.8}` |
| transform | `castSkills` 里 P 变身：`R.cutin = { t: 0 }` 同处 | 约 1.5 秒，和切入画面对齐，末尾冲击波对 `transformWave` |
| rain | `updateRain` 里墓碑落地结算（`d.done = true`） | 一秒里会有几十块，节流后只响部分，正常 |
| finisher | `doFinisher(p)`（砸下那一刻） | |
| hurt | `hurtPlayer` 里 `p.hp = Math.max(0, p.hp - dmg)` 之后 | 暴走无敌时 `return true` 分支不放 |
| tell | `tellBuzz(e, p, windup)` 里第一次触发（`e.buzzed` 置真）的位置 | **别每帧放**；敌人太多时会很烦，建议只对离主角 < 160 像素的敌人放 |

## 敌人

| 音效 | 挂载点 |
|---|---|
| skelLunge | `skelAI` 的 `windup`→`lunge` 切换处 |
| houndLeap | `houndAI` 的 `windup`→`leap` 切换处 |
| ghostShriek | `ghostAI` 的 `windup`→`shriek` 切换处（有 `R.fx.push({k:'shriek'...})` 那行） |
| fireball | `fireball(e, p)` |
| reflect | `reflectBalls(p, box)` 里反弹成功处 |

## Boss（墓渊魔）

| 音效 | 挂载点 |
|---|---|
| bossRoar | `spawnBoss()`；`bossAI` 里 `e.p2 = true` 狂怒那一刻再放一次 `{rate: 0.85}` |
| bossCharge | `bossStart(e,'charge')` 时（冲撞蓄力，约 0.75 秒，与 `windup` 对齐） |
| bossBreath | `bossAI` 的 `breath` 状态 `e.sub` 从 0 变 1（喷火开始） |
| bossLand | `dive` 状态落地结算（`R.shake = 6` 那处） |
| bossDown | `bossDown(e)` |
| tell | Boss 的 `charge/breath/dive` 预警也可复用 `tellBuzz`，不必另放 |

## 流程（run.js / explore.js）

| 音效 | 挂载点 |
|---|---|
| ui | 地图选节点、按钮点击、Tab 构筑总览开关 |
| pick | `pickScene` 选中强化卡；`boonGetScene` 开场 |
| coin | 商店购买成功、`ratingScene` 里试炼币结算 |
| victory | `finishRun(true)`（room.js）或 `ratingScene` 开场 |
| defeat | `finishRun(false)` / 倒下（`R.dead = true`）后 0.3 秒 |

## 节流与优先级提醒

- 同一帧里多个敌人一起受击：只会响一声 hit，符合预期，不用手动合并。
- 暴走期间 `rageSwing`、`rain`、`storm`、`iaiCut` 密度最高，已按优先级 0/1 设计，复音满 16 路时会被丢弃，不会爆音。
- `perfect`、`transform`、`finisher`、`hurt`、`bossRoar`、`bossLand`、`bossDown`、`victory`、`defeat` 即使满复音也会播放。
- 总线末端有 tanh 软限幅 + 压缩器，叠加不会削波。
- 手机上浏览器要求首次触摸后才有声：`sfx.js` 已在 `pointerdown / keydown / touchstart` 上自动解锁，标题页点任意处即可。
- 静音/音量存在 `localStorage['phantom_sfx_v1']`；设置面板可接 `sfx.setVolume(0..1)`、`sfx.setMuted(bool)`。
