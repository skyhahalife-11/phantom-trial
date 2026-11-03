"""变身召唤物 GPT 序列帧 → 游戏用像素精灵条，写进 assets/vfx/ 并登记到 manifest.js（window.VFX）。
每组动画共用一个裁剪框，帧间位置不跳；ax/ay 是锚点在帧内的坐标（ground=锚在底边，center=锚在中心）。
用法：python -X utf8 summon_strips.py <raw/summon 目录> <assets/vfx 目录>"""
import sys, os, json, re
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]

# 表名: (列, 行, 缩放, [(动画名, 帧序号, fps, 锚点)], 是否整张表共用裁剪框)
SHEETS = {
    'S1_shade': (4, 3, 0.27, [('shade_idle', [0, 1, 2, 3], 6, 'ground'), ('shade_swipe', [4, 5, 6, 7], 16, 'ground'),
                              ('shade_in', [8, 9, 10], 12, 'ground'), ('shade_out', [11], 8, 'ground')], True),
    'S2_grave_rain': (4, 3, 0.12, [('grave_fall', [0, 1, 2], 1, 'ground'), ('grave_hands', [4, 5, 6, 7], 16, 'ground'),
                                   ('grave_break', [9, 10, 11], 14, 'ground')], False),
    'S3_ground_claw': (4, 3, 0.22, [('claw_up', [0, 1, 2, 3], 20, 'ground'), ('claw_slam', [4, 5, 6, 7], 28, 'ground'),
                                    ('claw_toss', [8, 9, 10, 11], 16, 'ground')], True),
    'S4_blood_prison': (4, 2, 0.13, [('prison', list(range(8)), 14, 'ground')], True),
    'S5_finisher': (4, 2, 0.37, [('burial', list(range(8)), 12, 'ground')], True),
    'S6_blood_wave': (4, 2, 0.12, [('wave_fly', [0, 1, 2, 3], 16, 'center'), ('wave_hit', [4, 5, 6, 7], 18, 'center')], False),
}


def keyed(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(r, b)
    alpha = np.where(g - mx > 60, 0, 255)
    g = np.where(g > mx, mx, g)   # 去绿溢色
    return np.dstack([r, g, b, alpha]).astype(np.uint8)


def cells(a, cols, rows):
    h, w = a.shape[:2]
    ch, cw = h // rows, w // cols   # 统一格子尺寸，避免整除余数让各格差 1 像素
    return [a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] for r in range(rows) for c in range(cols)]


def bbox(frames):
    m = np.zeros(frames[0].shape[:2], bool)
    for f in frames:
        m |= f[..., 3] > 0
    ys, xs = np.nonzero(m)
    pad = 4
    return max(0, xs.min() - pad), max(0, ys.min() - pad), min(m.shape[1], xs.max() + 1 + pad), min(m.shape[0], ys.max() + 1 + pad)


def pixelize(f, s):
    im = Image.fromarray(f, 'RGBA')
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    a = np.asarray(im.resize((w, h), Image.BOX)).copy()
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    rgb = Image.fromarray(a[..., :3]).quantize(colors=32, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    return np.dstack([np.asarray(rgb), a[..., 3]])


man_path = os.path.join(OUT, 'manifest.js')
txt = open(man_path, encoding='utf-8').read()
VFX = json.loads(re.search(r'window\.VFX = (\{.*\});', txt, re.S).group(1))

for sheet, (cols, rows, s, groups, shared) in SHEETS.items():
    cs = cells(keyed(os.path.join(SRC, sheet + '_1.png')), cols, rows)
    ch, cw = cs[0].shape[:2]
    common = bbox([cs[i] for _, idx, _, _ in groups for i in idx]) if shared else None
    for name, idx, fps, anchor in groups:
        x0, y0, x1, y1 = common or bbox([cs[i] for i in idx])
        frames = [pixelize(cs[i][y0:y1, x0:x1], s) for i in idx]
        fh, fw = frames[0].shape[:2]
        strip = np.concatenate(frames, axis=1)
        Image.fromarray(strip, 'RGBA').save(os.path.join(OUT, name + '.png'))
        ax = round((cw / 2 - x0) * s) if anchor == 'ground' else fw // 2
        ay = fh if anchor == 'ground' else fh // 2
        VFX[name] = {'fw': fw, 'fh': fh, 'n': len(frames), 'fps': fps, 'ax': ax, 'ay': ay}
        print(f'{name:12s} {fw}x{fh} n={len(frames)} anchor=({ax},{ay})')

open(man_path, 'w', encoding='utf-8').write('window.VFX = ' + json.dumps(VFX, ensure_ascii=False) + ';\n')
