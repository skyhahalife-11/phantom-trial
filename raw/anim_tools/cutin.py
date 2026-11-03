"""变身切入用的脸部特写：去绿底 → 缩小 1/4（像素风）→ 减色。
用法：python -X utf8 cutin.py <原图> <输出 png>"""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = (g > 140) & (g > r + 50) & (g > b + 50)
alpha = np.where(green, 0, 255).astype(np.uint8)
# 去绿边：边缘像素里绿色压到红蓝的较大值
g2 = np.where(~green & (g > np.maximum(r, b)), np.maximum(r, b), g)
rgba = np.dstack([r, g2, b, alpha]).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')
w, h = im.width // 4, im.height // 4
small = im.resize((w, h), Image.BOX)
arr = np.asarray(small).copy()
arr[..., 3] = np.where(arr[..., 3] > 128, 255, 0)
rgb = Image.fromarray(arr[..., :3]).quantize(colors=48, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
Image.fromarray(np.dstack([np.asarray(rgb), arr[..., 3]]), 'RGBA').save(out)
print(out, w, h)
