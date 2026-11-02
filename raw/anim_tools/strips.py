"""可灵 3x2 动作条带 → 游戏用像素精灵条。
用法：python -X utf8 strips.py <条带.png> <输出目录> <名字> [hit=帧号(1起)] [loop] [frames=1,2,3,4,5,6] [h=42]
输出：<名字>.png（单行 sheet）、<名字>.json（manifest 字段）、<名字>_preview.gif / _preview.png（放大 4 倍预览）
"""
import sys, os, json
import numpy as np
from PIL import Image
from clips import key

COLS, ROWS = 3, 2
FPS = 12
PALETTE = 24
ZOOM = 4
BLOBS = False
ORIGIN_Y = []  # blobs 模式下每块在原图里的纵向偏移，用于保留同一行内的腾空高度


def cells(img):
    a = np.asarray(img.convert('RGB')).copy()
    h, w = a.shape[:2]
    # 可灵水印在整图右下角，切格前用旁边的背景色盖掉
    a[int(h * 0.92):, int(w * 0.85):] = a[int(h * 0.92) - 4, int(w * 0.85) - 4]
    if BLOBS:
        return blobs(a)
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            out.append(a[r * h // ROWS:(r + 1) * h // ROWS, c * w // COLS:(c + 1) * w // COLS])
    return out


def blobs(a):
    """按连通块切：剑伸出格子也不会被截断。块按重心归到网格格子，同一格的多个块（脱手的剑、掉在地上的剑）合并成一帧"""
    import cv2
    k = key(a)
    m = (k[:, :, 3] > 40).astype(np.uint8)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    h, w = a.shape[:2]
    groups = {}
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 600:
            continue
        cell = (min(ROWS - 1, int(cen[i][1] // (h / ROWS))), min(COLS - 1, int(cen[i][0] // (w / COLS))))
        groups.setdefault(cell, []).append(i)
    bg = np.median(a[4:50, 4:50].reshape(-1, 3), axis=0).astype(np.uint8)
    out = []
    ORIGIN_Y.clear()
    for cell in sorted(groups):
        ids = groups[cell]
        x0 = min(st[i, 0] for i in ids); y0 = min(st[i, 1] for i in ids)
        x1 = max(st[i, 0] + st[i, 2] for i in ids); y1 = max(st[i, 1] + st[i, 3] for i in ids)
        ya, xa = max(0, y0 - 20), max(0, x0 - 20)
        crop = a[ya:y1 + 20, xa:x1 + 20].copy()
        sub = lab[ya:y1 + 20, xa:x1 + 20]
        crop[~np.isin(sub, ids)] = bg
        out.append(np.pad(crop, ((40, 40), (40, 40), (0, 0)), mode='edge'))
        ORIGIN_Y.append((cell[0], ya - 40))
    return out


def body_anchor(alpha):
    """脚底行与躯干中线：取脚底以上 25%~60% 身高的不透明像素的横向中位数，剑尖拖地时也不太受影响"""
    ys, xs = np.where(alpha > 40)
    feet, top = ys.max(), ys.min()
    hgt = feet - top
    band = (ys <= feet - hgt * 0.25) & (ys >= feet - hgt * 0.60)
    ax = float(np.median(xs[band])) if band.any() else float(np.median(xs))
    return feet, top, ax


def main():
    src, out_dir, name = sys.argv[1:4]
    opts = dict(a.split('=', 1) if '=' in a else (a, '1') for a in sys.argv[4:])
    target_h = int(opts.get('h', 42))
    global BLOBS, COLS, ROWS
    BLOBS = 'blobs' in opts
    if 'grid' in opts:
        COLS, ROWS = map(int, opts['grid'].split('x'))
    pick = [int(x) - 1 for x in opts['frames'].split(',')] if 'frames' in opts else list(range(COLS * ROWS))
    raw = [key(c) for c in cells(Image.open(src))]
    info = [body_anchor(f[:, :, 3]) for f in raw]
    # 同一行以最低的脚为地面，其余帧保留离地高度（跳起、挑空）
    lift = [0.0] * len(raw)
    if BLOBS and 'keepy' in opts:
        absf = [info[k][0] + ORIGIN_Y[k][1] for k in range(len(raw))]
        for k in range(len(raw)):
            base = max(absf[j] for j in range(len(raw)) if ORIGIN_Y[j][0] == ORIGIN_Y[k][0])
            lift[k] = base - absf[k]
    raw = [raw[i] for i in pick]; info = [info[i] for i in pick]; lift = [lift[i] for i in pick]
    # 身高按第 1 帧（起始站姿）统一缩放
    # 身高默认取第 1 帧；剑举过头时会被算进去，可用 srch=源图身体高度（像素）手动指定
    char_h = float(opts['srch']) if 'srch' in opts else info[0][0] - info[0][1]
    sc = target_h / char_h
    # 公共画布：每帧以「脚底、躯干中线」为原点
    left = max(ax - np.where(f[:, :, 3] > 40)[1].min() for f, (_, _, ax) in zip(raw, info))
    right = max(np.where(f[:, :, 3] > 40)[1].max() - ax for f, (_, _, ax) in zip(raw, info))
    up = max(feet - np.where(f[:, :, 3] > 40)[0].min() + l for f, (feet, _, _), l in zip(raw, info, lift))
    W, H = int(left + right + 8), int(up + 8)
    big = []
    for f, (feet, _, ax), l in zip(raw, info, lift):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        canvas.alpha_composite(Image.fromarray(f, 'RGBA'), (int(round(left + 4 - ax)), int(H - 4 - feet - l)))
        big.append(canvas)
    fw, fh = max(1, round(W * sc)), max(1, round(H * sc))
    small = [b.resize((fw, fh), Image.LANCZOS) for b in big]
    # 所有帧共用一套调色板，避免逐帧闪色
    strip = Image.new('RGBA', (fw * len(small), fh))
    for k, s in enumerate(small):
        strip.paste(s, (k * fw, 0))
    arr = np.asarray(strip).copy()
    # 去绿边：人物与剑没有纯绿色，G 通道不超过 max(R,B)+12
    rgb = arr[..., :3].astype(int)
    rgb[..., 1] = np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 12)
    arr[..., :3] = rgb.astype(np.uint8)
    alpha = np.where(arr[..., 3] > 110, 255, 0).astype(np.uint8)
    pal = Image.fromarray(arr[..., :3]).quantize(colors=PALETTE, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    sheet = Image.fromarray(np.dstack([np.asarray(pal), alpha]), 'RGBA')
    os.makedirs(out_dir, exist_ok=True)
    sheet.save(os.path.join(out_dir, name + '.png'))
    meta = {'anchorX': round((left + 4) * sc, 1), 'charH': round(char_h * sc, 1), 'fw': fw, 'fh': fh,
            'n': len(small), 'cols': len(small), 'fps': FPS, 'loop': 'loop' in opts, 'pixel': True}
    if 'hit' in opts:
        meta['hit'] = pick.index(int(opts['hit']) - 1)
    if 'hits' in opts:
        meta['hits'] = [pick.index(int(x) - 1) for x in opts['hits'].split(',')]
        meta['hit'] = meta['hits'][0]
    with open(os.path.join(out_dir, name + '.json'), 'w') as fp:
        json.dump(meta, fp)
    # 预览：深色底放大，逐帧 GIF + 平铺 PNG
    frames = []
    for k in range(len(small)):
        fr = Image.new('RGBA', (fw + 8, fh + 8), (28, 24, 36, 255))
        fr.alpha_composite(sheet.crop((k * fw, 0, (k + 1) * fw, fh)), (4, 4))
        frames.append(fr.resize(((fw + 8) * ZOOM, (fh + 8) * ZOOM), Image.NEAREST).convert('RGB'))
    frames[0].save(os.path.join(out_dir, name + '_preview.gif'), save_all=True, append_images=frames[1:],
                   duration=int(1000 / FPS), loop=0)
    tile = Image.new('RGB', (frames[0].width * len(frames), frames[0].height))
    for k, fr in enumerate(frames):
        tile.paste(fr, (k * fr.width, 0))
    tile.save(os.path.join(out_dir, name + '_preview.png'))
    print(name, meta)


if __name__ == '__main__':
    main()
