"""生成的黑底发光特效 → 游戏精灵条（亮度转透明，缩小，写进 assets/vfx 和 manifest）。
用法：python -X utf8 vfx_gen.py"""
import io, json
import numpy as np
from PIL import Image

ROOT = 'D:/workspace/trial/'


def to_rgba(a):
    """黑底发光图：alpha = 最亮通道，颜色反预乘，暗噪点直接去掉"""
    a = a.astype(float)
    al = a.max(axis=2)
    al[al < 18] = 0
    rgb = np.where(al[..., None] > 0, a * 255 / np.maximum(al[..., None], 1), 0)
    return np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8)


def shrink(rgba, k):
    im = Image.fromarray(rgba, 'RGBA')
    # 预乘后再缩，避免透明边发黑
    a = np.asarray(im).astype(float); pm = a.copy(); pm[..., :3] *= a[..., 3:] / 255
    w, h = im.size
    small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((max(1, round(w * k)), max(1, round(h * k))), Image.BOX)).astype(float)
    al = small[..., 3:]
    small[..., :3] = np.where(al > 0, small[..., :3] * 255 / np.maximum(al, 1), 0)
    small[..., 3] = np.clip(small[..., 3] * 1.25, 0, 255)   # 缩小后略微提亮，保持发光感
    return np.clip(small, 0, 255).astype(np.uint8)


def save(name, frames, ax, ay, fps, extra=None):
    fw, fh = frames[0].shape[1], frames[0].shape[0]
    sheet = np.concatenate(frames, axis=1)
    Image.fromarray(sheet, 'RGBA').save(ROOT + f'assets/vfx/{name}.png')
    p = ROOT + 'assets/vfx/manifest.js'
    s = io.open(p, encoding='utf-8').read()
    m = json.loads(s.replace('window.VFX = ', '').rstrip().rstrip(';'))
    m[name] = {'fw': fw, 'fh': fh, 'n': len(frames), 'fps': fps, 'ax': ax, 'ay': ay, 'add': 1, **(extra or {})}
    io.open(p, 'w', encoding='utf-8').write('window.VFX = ' + json.dumps(m, ensure_ascii=False) + ';\n')
    big = Image.fromarray(sheet, 'RGBA').resize((sheet.shape[1] * 3, sheet.shape[0] * 3), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (30, 26, 40, 255)); bg.alpha_composite(big)
    bg.convert('RGB').save(ROOT + f'raw/vfx_gen/{name}_preview.png')
    print(name, fw, fh, len(frames))


# ---- 旋转刀光漩涡：4x2 等分，居中 ----
a = np.asarray(Image.open(ROOT + 'raw/vfx_gen/wheel_spin_1.png').convert('RGB'))
H, W = a.shape[:2]
cells = [a[r * H // 2:(r + 1) * H // 2, c * W // 4:(c + 1) * W // 4] for r in range(2) for c in range(4)]
K = 0.27
def recenter(f):   # 按发光重心居中，循环时漩涡不上下跳
    al = f[..., 3].astype(float); ys, xs = np.nonzero(al > 40)
    cy, cx = int((al[ys, xs] * ys).sum() / al[ys, xs].sum()), int((al[ys, xs] * xs).sum() / al[ys, xs].sum())
    out = np.zeros_like(f); h, w = f.shape[:2]; dy, dx = h // 2 - cy, w // 2 - cx
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = f[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out
fr = [shrink(recenter(to_rgba(c)), K) for c in cells]
save('w_spin', fr, fr[0].shape[1] // 2, fr[0].shape[0] // 2, 24)

# ---- 落地爆发：内容有跨格，按列自定边界切；每帧以地面最亮点为锚对齐到底部中心 ----
a = np.asarray(Image.open(ROOT + 'raw/vfx_gen/wheel_slam_1.png').convert('RGB'))
rows = [(0, 470, [0, 300, 740, 1090, 1536]), (470, 1024, [0, 390, 770, 1150, 1536])]
crops = []
for y0, y1, xs in rows:
    for i in range(4):
        crops.append(a[y0:y1, xs[i]:xs[i + 1]])
rg = [to_rgba(c) for c in crops]
anch = []
for f in rg:
    al = f[..., 3].astype(float)
    ys = np.where(al.max(axis=1) > 40)[0]
    gy = ys.max() if len(ys) else al.shape[0] - 1   # 地面线：最低的亮行
    band = al[max(0, gy - 12):gy + 1].sum(axis=0)
    anch.append((int(band.argmax()), int(gy)))
half = max(max(ax, f.shape[1] - ax) for f, (ax, _) in zip(rg, anch))
top = max(gy for _, gy in anch)
canvas = []
for f, (ax, gy) in zip(rg, anch):
    c = np.zeros((top + 4, half * 2, 4), np.uint8)
    ox, oy = half - ax, top - gy
    h, w = f.shape[:2]
    ys0, xs0 = max(0, oy), max(0, ox)
    c[ys0:min(c.shape[0], oy + h), xs0:min(c.shape[1], ox + w)] = f[ys0 - oy:min(c.shape[0], oy + h) - oy, xs0 - ox:min(c.shape[1], ox + w) - ox]
    canvas.append(c)
fr = [shrink(c, K) for c in canvas]
save('w_slam', fr, fr[0].shape[1] // 2, round(top * K), 16)

# ---- 普攻刀光：每列一种（斜劈 / 横扫 / 上挑 / 竖砸），上行完整、下行消散；锚点取格子中心 ----
a = np.asarray(Image.open(ROOT + 'raw/vfx_gen/slashes_1.png').convert('RGB'))
H, W = a.shape[:2]
for c in range(4):
    fr = [shrink(to_rgba(a[r * H // 2:(r + 1) * H // 2, c * W // 4:(c + 1) * W // 4]), 0.24) for r in range(2)]
    save(f'b_sl{c}', fr, fr[0].shape[1] // 2, fr[0].shape[0] // 2, 14)

# ---- 普攻命中爆点：4x2，格子中心 ----
a = np.asarray(Image.open(ROOT + 'raw/vfx_gen/hitspark_1.png').convert('RGB'))
H, W = a.shape[:2]
fr = [shrink(to_rgba(a[r * H // 2:(r + 1) * H // 2, c * W // 4:(c + 1) * W // 4]), 0.16) for r in range(2) for c in range(4)]
save('b_hit', fr, fr[0].shape[1] // 2, fr[0].shape[0] // 2, 30)
