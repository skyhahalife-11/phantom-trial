"""变身切入用的高清立绘：去绿底（软边 + 去溢色）→ 裁出脸和巨爪 → 平滑缩小，不做像素化。
用法：python -X utf8 cutin_hd.py <原图> <输出 png> <x0,y0,x1,y1> <输出宽>"""
import sys
import numpy as np
from PIL import Image

src, out, box, ow = sys.argv[1], sys.argv[2], [int(v) for v in sys.argv[3].split(',')], int(sys.argv[4])
a = np.asarray(Image.open(src).convert('RGB').crop(box)).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# 绿得越纯越透明：g 超出 r、b 较大值的部分映射到透明度
over = g - np.maximum(r, b)
alpha = 255 - np.clip((over - 40) * 255 / 60, 0, 255)
g2 = np.minimum(g, np.maximum(r, b))   # 去绿溢色
rgba = np.dstack([r, g2, b, alpha]).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')
oh = round(im.height * ow / im.width)
im.resize((ow, oh), Image.LANCZOS).save(out)
print(out, ow, oh)
