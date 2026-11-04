"""敌人 GPT 动作图 → 精灵条（assets/gv/enemies/），尺寸对齐原素材。
锚点 ax 取第一帧双脚的中心，出招前扑时身体往前探、脚下锚点不动。
色调向原素材靠：可选 名字:行号:参照条.png，按不透明像素逐通道对齐均值和方差。
用法：python -X utf8 enemy_strip.py <sheet.png> <输出目录> <列x行> <目标身高px> <名字:行号[:参照.png]> ...
例：enemy_strip.py skel_attack_1.png assets/gv/enemies 4x2 46 skel-atk:0:skel-walk.png skelc-atk:1:skelc-walk.png"""
import sys, os
import numpy as np
from PIL import Image
from summon_strips import keyed, cells, bbox, pixelize

src, out, grid, target = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
cols, rows = map(int, grid.split('x'))
cs = cells(keyed(src), cols, rows)


def match_color(a, ref):
    """a 的不透明像素逐通道对齐 ref 的均值和标准差"""
    m, r = a[..., 3] > 0, ref[..., 3] > 0
    out = a.astype(float)
    for c in range(3):
        src, dst = out[..., c][m], ref[..., c][r].astype(float)
        out[..., c][m] = (src - src.mean()) / (src.std() + 1e-6) * dst.std() + dst.mean()
    return np.clip(out, 0, 255).astype(np.uint8)


for spec in sys.argv[5:]:
    name, row, *ref = spec.split(':')
    idx = [int(row) * cols + c for c in range(cols)]
    x0, y0, x1, y1 = bbox([cs[i] for i in idx])
    m0 = cs[idx[0]][..., 3] > 0
    ys, xs = np.nonzero(m0)
    s = target / (ys.max() - ys.min())   # 第一帧站姿身高 → 目标身高
    feet = xs[ys > ys.max() - (ys.max() - ys.min()) * 0.15]
    frames = [pixelize(cs[i][y0:y1, x0:x1], s) for i in idx]
    fh, fw = frames[0].shape[:2]
    strip = np.concatenate(frames, axis=1)
    if ref:
        strip = match_color(strip, np.asarray(Image.open(os.path.join(out, ref[0])).convert('RGBA')))
    Image.fromarray(strip, 'RGBA').save(os.path.join(out, name + '.png'))
    print(f"'{name}': [{len(frames)}, {fw}, {fh}, {round((feet.mean() - x0) * s)}],")
