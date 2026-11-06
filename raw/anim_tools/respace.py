"""连通块粘连的动作条：按块拆开，重新摆进间距足够的 4x2 大格子（保留每帧在原行里的高度），再交给 strips.py 切。
用法：python respace.py <输入> <输出> [split=x0,x1,ysplit]  split：粘连块在 x0~x1 之间按 y 分开（y 以下归左帧）"""
import sys, numpy as np, cv2
from PIL import Image
from clips import key
src, dst = sys.argv[1], sys.argv[2]
split = None
for a in sys.argv[3:]:
    if a.startswith('split='): split = [int(v) for v in a[6:].split(',')]
a = np.asarray(Image.open(src).convert('RGB')).copy()
h, w = a.shape[:2]
k = key(a); m = (k[:, :, 3] > 40).astype(np.uint8)
md = cv2.dilate(m, np.ones((9, 9), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(md, connectivity=8)
masks = []
for i in range(1, n):
    if st[i, 4] < 600: continue
    mk = (lab == i) & (m > 0)
    if split and st[i, 2] > w / 4 * 1.4:   # 粘连的宽块：拆成左右两帧
        x0, x1, ys = split
        yy, xx = np.mgrid[0:h, 0:w]
        left = mk & ((xx < x0) | ((xx <= x1) & (yy >= ys)))
        masks += [left, mk & ~left]
    else:
        masks.append(mk)
items = []
for mk in masks:
    ys, xs = np.nonzero(mk)
    items.append((int(ys.mean() // (h / 2)), xs.mean(), mk, ys.min(), ys.max(), xs.min(), xs.max()))
items.sort(key=lambda t: (t[0], t[1]))
assert len(items) == 8, len(items)
CW, CH = 640, h // 2
out = np.zeros((CH * 2, CW * 4, 3), np.uint8); out[:] = (0, 255, 0)
for j, (row, _, mk, y0, y1, x0, x1) in enumerate(items):
    c = j % 4
    ox = c * CW + (CW - (x1 - x0)) // 2 - x0
    ys, xs = np.nonzero(mk)
    out[ys, xs + ox] = a[ys, xs]   # 纵向保持原位（帧本来就在自己那一行），只横向拉开
Image.fromarray(out).save(dst)
print('ok', [(t[0], int(t[1])) for t in items])
