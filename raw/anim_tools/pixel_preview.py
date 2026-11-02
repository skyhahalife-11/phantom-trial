import sys
from PIL import Image
import numpy as np

SRC = sys.argv[1]
OUT = sys.argv[2]
REF = sys.argv[3]
TARGET_H = int(sys.argv[4]) if len(sys.argv) > 4 else 46
ZOOM = 4


def key_green(im):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (g > r + 30) & (g > b + 20)
    h, w = bg.shape
    bg[int(h * 0.93):, int(w * 0.75):] = True  # 右下角可灵水印
    rgba = np.dstack([a, np.where(bg, 0, 255)]).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    return out.crop(out.getbbox())


def pixelize(im, h):
    w = max(1, round(im.width * h / im.height))
    small = im.resize((w, h), Image.LANCZOS)
    a = np.asarray(small).copy()
    a[..., 3] = np.where(a[..., 3] > 128, 255, 0)
    rgb = Image.fromarray(a[..., :3]).quantize(colors=16, method=Image.MEDIANCUT).convert('RGB')
    return Image.fromarray(np.dstack([np.asarray(rgb), a[..., 3]]), 'RGBA')


names = SRC.split(',')
sprites = [pixelize(key_green(Image.open(n)), TARGET_H) for n in names]
ref = Image.open(REF).convert('RGBA')
ref = ref.crop(ref.getbbox())
items = sprites + [ref]
pad = 10
W = sum(s.width for s in items) + pad * (len(items) + 1)
H = max(s.height for s in items) + pad * 2
canvas = Image.new('RGBA', (W, H), (28, 24, 36, 255))
x = pad
for s in items:
    canvas.alpha_composite(s, (x, H - pad - s.height))
    x += s.width + pad
canvas = canvas.resize((W * ZOOM, H * ZOOM), Image.NEAREST)
canvas.save(OUT)
print(OUT, [s.size for s in items])
