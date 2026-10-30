"""Kling 视频 -> 精灵表。抠绿与缩放沿用 deskrawl/tools/build_anim.py，保证与现有 walk/attack 对齐。

python clips.py contact <video.mp4> <out.png>
    输出带帧号的联系表，用来人工挑每段动作的起止帧
python clips.py build <video.mp4> <out_dir> <name>=<start>-<end>[+<start>-<end>...][@hit] [...]
    按区间（源视频帧号，含两端）切出多段，每段一张 sheet + json；hit 是该段内命中帧的源帧号
"""
import sys, os, json
import numpy as np
import cv2
from PIL import Image, ImageDraw

SCALE = 0.30
TARGET_CH = 288.0
FPS_OUT = 12


def read(video):
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    out = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        out.append(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
    cap.release()
    return out, fps


def key(a):
    h, w, _ = a.shape
    a = a.astype(np.float32)
    s = np.concatenate([a[4:50, 4:50].reshape(-1, 3), a[4:50, -50:-4].reshape(-1, 3)])
    bg = np.median(s, axis=0)
    a[int(h * 0.92):, int(w * 0.66):] = bg  # 可灵水印角
    a[:8] = bg; a[-8:] = bg; a[:, :8] = bg; a[:, -8:] = bg
    dist = np.linalg.norm(a - bg, axis=2)
    alpha = np.clip((dist - 34) / 40, 0, 1)
    mask = (alpha > 0.15).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros(n, dtype=bool)
    for c in range(1, n):
        keep[c] = stats[c, cv2.CC_STAT_AREA] >= 400
    alpha = alpha * keep[lab]
    edge = (alpha > 0) & (alpha < 1)
    a[edge] = np.clip((a[edge] - bg * (1 - alpha[edge, None])) / np.maximum(alpha[edge, None], 1e-3), 0, 255)
    return np.dstack([a, alpha * 255]).astype(np.uint8)


def contact(video, out):
    frames, fps = read(video)
    step = max(1, round(fps / FPS_OUT))
    idx = list(range(0, len(frames), step))
    tw, th = 166, 220
    cols = 10
    rows = (len(idx) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols, (th + 18) * rows), (30, 30, 36))
    d = ImageDraw.Draw(sheet)
    for k, i in enumerate(idx):
        im = Image.fromarray(frames[i]).resize((tw, th))
        x, y = (k % cols) * tw, (k // cols) * (th + 18)
        sheet.paste(im, (x, y + 18))
        d.text((x + 4, y + 2), str(i), fill=(255, 220, 120))
    sheet.save(out)
    print(out, 'frames', len(frames), 'fps', fps, 'step', step)


def ground_align(crops):
    """空中帧：去掉落在地上的影子，再把每帧脚底对齐到画布底部（高度由游戏自己的 p.y 负责）"""
    out = []
    for f in crops:
        f = f.copy()
        m = (f[:, :, 3] > 40).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        for c in range(1, n):
            cw_, ch_ = st[c, cv2.CC_STAT_WIDTH], st[c, cv2.CC_STAT_HEIGHT]
            if ch_ < f.shape[0] * 0.08 and cw_ > ch_ * 2.5:
                f[lab == c] = 0
        ys = np.where(f[:, :, 3] > 40)[0]
        shift = f.shape[0] - 4 - ys.max()
        g = np.zeros_like(f)
        if shift >= 0:
            g[shift:] = f[:f.shape[0] - shift]
        else:
            g[:shift] = f[-shift:]
        out.append(g)
    return out


def build(video, out_dir, specs):
    frames, fps = read(video)
    step = max(1, round(fps / FPS_OUT))
    keyed = {}

    def K(i):
        if i not in keyed:
            keyed[i] = key(frames[i])
        return keyed[i]

    segs = []
    for s in specs:
        name, rng = s.split('=')
        hit, ground = None, False
        if rng.endswith(':ground'):
            rng, ground = rng[:-7], True
        if '@' in rng:
            rng, hit = rng.split('@'); hit = int(hit)
        sel = []
        for part in rng.split('+'):
            a, b = map(int, part.split('-'))
            seg = list(range(a, b + 1, step))
            if seg[-1] != b:
                seg.append(b)
            sel += seg
        segs.append((name, sel, hit, ground))
    # 所有段共用一个裁剪框，锚点才一致
    union = None
    for _, sel, _, _ in segs:
        for i in [0] + sel:
            ys, xs = np.where(K(i)[:, :, 3] > 40)
            if len(xs) == 0:
                continue
            bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
            union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]), max(union[2], bb[2]), max(union[3], bb[3]))
    h, w = frames[0].shape[:2]
    x0, y0, x1, y1 = union
    x0, y0, x1, y1 = max(0, x0 - 4), max(0, y0 - 4), min(w, x1 + 4), min(h, y1 + 4)
    # 参照帧固定用视频第 0 帧（就是上传的站姿原图），所有动作缩放一致
    f0 = K(0)[y0:y1, x0:x1, 3] > 40
    ys0, xs0 = np.where(f0)
    feet = ys0.max()
    anchor_x = float(np.median(xs0[ys0 >= feet - 30]))
    char_h = float(feet - ys0.min())
    # 首帧站姿身高统一缩到 TARGET_CH，与现有 walk 帧（charH 288）一致
    sc = TARGET_CH / char_h
    os.makedirs(out_dir, exist_ok=True)
    for name, sel, hit, ground in segs:
        crops = [K(i)[y0:y1, x0:x1] for i in sel]
        if ground:
            crops = ground_align(crops)
        ch, cw = crops[0].shape[:2]
        fw, fh = round(cw * sc), round(ch * sc)
        cols = 8
        rows = (len(crops) + cols - 1) // cols
        sheet = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
        for k, f in enumerate(crops):
            sheet.paste(Image.fromarray(f, 'RGBA').resize((fw, fh), Image.LANCZOS), ((k % cols) * fw, (k // cols) * fh))
        meta = {'anchorX': round(anchor_x * sc, 1), 'charH': round(char_h * sc, 1), 'fw': fw, 'fh': fh,
                'n': len(crops), 'cols': cols, 'fps': FPS_OUT, 'loop': False}
        if hit is not None:
            meta['hit'] = int(np.argmin([abs(i - hit) for i in sel]))
        sheet.save(os.path.join(out_dir, name + '.png'))
        with open(os.path.join(out_dir, name + '.json'), 'w') as fp:
            json.dump(meta, fp)
        print(name, meta)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'contact':
        contact(sys.argv[2], sys.argv[3])
    else:
        build(sys.argv[2], sys.argv[3], sys.argv[4:])
