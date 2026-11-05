# 墓渊魔专属动作接入说明

素材：`assets/gv/enemies/boss-*.png`（单行 strip，朝右，24 色像素风）。原图（4 张网格图）与提示词在 `raw/boss_anim/`，切图脚本为 `raw/anim_tools/strips.py`（命令见文末）。
缩放按青色骷髅头大小对齐到游戏里现有 `boss-idle`（身高约 123px）。各帧脚底（裙摆底）都对齐在帧底部，`ay` 即脚底 y；空中帧（天降）也是底对齐，由代码按 `e.y` 抬高，不要再从帧里取高度。

## EANIM 条目 [帧数, 帧宽, 帧高, 锚点x, 脚底y]
- `boss-charge`: `'boss-charge': [8, 149, 132, 75, 131]`
- `boss-breath`: `'boss-breath': [8, 138, 143, 75, 142]`
- `boss-dive`: `'boss-dive': [8, 183, 149, 99, 148]`
- `boss-summon`: `'boss-summon': [4, 198, 146, 99, 144]`
- `boss-stagger`: `'boss-stagger': [2, 198, 146, 99, 145]`
- `boss-hit`: `'boss-hit': [2, 198, 146, 99, 144]`
- `boss-dead`: `'boss-dead': [4, 198, 146, 99, 145]`
（现有 `boss-idle` / `boss-atk` / `boss-fire` 不变；待机/行走继续用 `boss-idle`，火焰继续用 `boss-fire`。）

## 状态 → 帧对应（帧号从 0 起）
- charge sub0（前摇，蓄力 0.7s）：`boss-charge` 帧 0→1→2 随 `e.t / windup` 推进；最后一帧停住。
- charge sub1（冲刺）：`boss-charge` 帧 3、4 循环，约 12 fps。
- recover（冲撞后收势）：`boss-charge` 帧 5→6→7，各约 0.15s；之后停在 7，然后切 `boss-stagger`（见 recover 通用）。
- breath sub0（前摇 0.85s）：`boss-breath` 帧 0→1→2→3 随进度推进（3 为张翅最大、即将喷火）。
- breath sub1（喷火 0.5s）：`boss-breath` 帧 4→5（5 保持），火焰仍由 `boss-fire` 叠加；收尾 `boss-breath` 帧 6→7。
- dive sub0（起飞，0.45s）：`boss-dive` 帧 0→1。
- dive sub1（悬空盯人）：`boss-dive` 帧 2、3 循环，约 8 fps。
- dive sub2（俯冲/落地）：飞行中 `boss-dive` 帧 4；落地瞬间帧 5（砸地），随后帧 6→7（蹲伏→起身，约 0.15s 一帧）。
- summon（0.9s）：`boss-summon` 帧 0→1→2（仰天）→3（双拳砸地，落在召出骷髅的那一刻）。
- recover（破绽硬直，通用）：`boss-stagger` 帧 0、1 循环，约 4 fps；若想更醒目可叠加代码的黄色「破绽」字（已有）。
- hit（受击闪）：`boss-hit` 帧 0（后仰），持续 0.1s；帧 1 是恢复，可忽略。Boss 霸体，不会进入受击硬直，只在被打时闪一下帧 0 即可。
- dead（死亡）：`boss-dead` 帧 0→3，约 6 fps，停在最后一帧；`bossDown` 之后别立刻移除敌人，留 1s 以上播完。
- idle / intro / walk：`boss-idle`（不变）。

## 注意
- 新 strip 帧宽各不相同，`drawEnemy` 里已经按 `EANIM[name]` 的 `[, fw, fh, ax, ay]` 取，直接加条目即可；`preload` 用的是 `Object.keys(EANIM)`，会自动加载。
- 帧里人物比旧 `boss-atk` 略大一点（翅膀张开时），受击框 `EBOX.boss` 不用改。
- 部分帧链子上的小骷髅头有轻微泛绿（抠绿残留），在暗背景上不明显。

## 重新切图
`python -X utf8 raw/anim_tools/strips.py raw/boss_anim/<名>_1.png raw/boss_anim/out b_<名> grid=4x2 blobs srch=<源图帧高> h=123`
（charge srch=325，breath 369，dive 300，misc 为 grid=4x3 srch=255；misc 再按帧号拆成 summon/stagger/hit/dead。）
