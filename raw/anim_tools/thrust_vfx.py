"""U 突刺特效：黑底发光图 → 游戏精灵条（u_cone 剑尖冲击波 / u_pierce 贯穿爆点），写进 assets/vfx 和 manifest。
转换函数与 vfx_gen.py 相同（那个脚本一跑会重做所有旧特效，所以这里单独一份）。用法：python -X utf8 thrust_vfx.py"""
import io, json
import numpy as np
from PIL import Image

ROOT = 'D:/workspace/trial/'


def to_rgba(a):
    a = a.astype(float)
    al = a.max(axis=2)
    al[al < 18] = 0
    rgb = np.where(al[..., None] > 0, a * 255 / np.maximum(al[..., None], 1), 0)
    return np.dstack([np.clip(rgb, 0, 255), al]).astype(np.uint8)


def shrink(rgba, k):
    im = Image.fromarray(rgba, 'RGBA')
    a = np.asarray(im).astype(float); pm = a.copy(); pm[..., :3] *= a[..., 3:] / 255
    w, h = im.size
    small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((max(1, round(w * k)), max(1, round(h * k))), Image.BOX)).astype(float)
    al = small[..., 3:]
    small[..., :3] = np.where(al > 0, small[..., :3] * 255 / np.maximum(al, 1), 0)
    small[..., 3] = np.clip(small[..., 3] * 1.25, 0, 255)
    return np.clip(small, 0, 255).astype(np.uint8)


def save(name, frames, ax, ay, fps):
    fw, fh = frames[0].shape[1], frames[0].shape[0]
    sheet = np.concatenate(frames, axis=1)
    Image.fromarray(sheet, 'RGBA').save(ROOT + f'assets/vfx/{name}.png')
    p = ROOT + 'assets/vfx/manifest.js'
    s = io.open(p, encoding='utf-8').read()
    m = json.loads(s.replace('window.VFX = ', '').rstrip().rstrip(';'))
    m[name] = {'fw': fw, 'fh': fh, 'n': len(frames), 'fps': fps, 'ax': ax, 'ay': ay, 'add': 1}
    io.open(p, 'w', encoding='utf-8').write('window.VFX = ' + json.dumps(m, ensure_ascii=False) + ';\n')
    big = Image.fromarray(sheet, 'RGBA').resize((sheet.shape[1] * 3, sheet.shape[0] * 3), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (30, 26, 40, 255)); bg.alpha_composite(big)
    bg.convert('RGB').save(ROOT + f'raw/vfx_gen/{name}_preview.png')
    print(name, fw, fh, len(frames), 'anchor', ax, ay)


a = np.asarray(Image.open(ROOT + 'raw/vfx_gen/thrust_1.png').convert('RGB'))
H, W = a.shape[:2]
cell = lambda r, c: a[r * H // 2:(r + 1) * H // 2, c * W // 4:(c + 1) * W // 4]
K = 0.22
# 上排：剑尖冲击波。锚点取第 1 帧矛尖（最右的亮点）所在的位置，游戏里把它钉在剑尖上
cone = [shrink(to_rgba(cell(0, c)), K) for c in range(4)]
al = cone[0][..., 3]; ys, xs = np.nonzero(al > 120)
save('u_cone', cone, int(xs.max()), int(np.median(ys)), 20)
# 下排：贯穿爆点。锚点取第 1 帧星芒中心（最亮处），钉在敌人身上
pierce = [shrink(to_rgba(cell(1, c)), 0.18) for c in range(4)]
al = pierce[0][..., 3].astype(float); ys, xs = np.nonzero(al > 200)
save('u_pierce', pierce, int(np.median(xs)), int(np.median(ys)), 18)
