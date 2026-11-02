"""把切好的主角动作放进 Gothicvania 场景做动图预览（1.5 倍最近邻，与游戏内一致，再整体放大 2 倍便于看）。
命中帧按 meta['hits'] 画刀光弧线（代码绘制，与游戏内实现一致的思路）；第 n 段刀光的方向取 ARCS[n]。"""
import sys, json, math
from PIL import Image, ImageDraw

BG = sys.argv[1]
OUT = sys.argv[2]
names = sys.argv[3:]
GAME_SCALE, VIEW = 1.5, 2
FPS = 12
# 角度：0 = 正前方，正值向下（屏幕坐标）。每段刀光从 a0 扫到 a1
ARCS = [(-110, 45, 1.0), (-75, 55, 0.38), (70, -100, 1.0)]

bg = Image.open(BG).convert('RGBA')
W, H = 480, 200
bg = bg.resize((W, int(bg.height * W / bg.width)), Image.NEAREST).crop((0, 0, W, H)) if bg.width >= W else bg.resize((W, H), Image.NEAREST)
ground = H - 30


def smear(img, cx, cy, r, a0, a1, flat, alpha):
    """月牙形刀光：外沿实、内沿收窄，越靠扫动末端越亮"""
    d = ImageDraw.Draw(img, 'RGBA')
    steps = 18
    for s in range(steps):
        t0, t1 = s / steps, (s + 1) / steps
        th = 0.15 + 0.85 * t1
        pts = []
        for t, rr in ((t0, r), (t1, r), (t1, r * (1 - 0.35 * th)), (t0, r * (1 - 0.35 * (0.15 + 0.85 * t0)))):
            a = math.radians(a0 + (a1 - a0) * t)
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * flat))
        col = (255, int(235 - 60 * t1), int(220 - 120 * t1), int(alpha * (60 + 195 * t1)))
        d.polygon(pts, fill=col)


clips = []
for n in names:
    meta = json.load(open(n + '.json'))
    sheet = Image.open(n + '.png').convert('RGBA')
    fr = [sheet.crop((k * meta['fw'], 0, (k + 1) * meta['fw'], meta['fh'])) for k in range(meta['n'])]
    fr = [f.resize((round(f.width * GAME_SCALE), round(f.height * GAME_SCALE)), Image.NEAREST) for f in fr]
    clips.append((meta, fr))
total = max(len(f) for _, f in clips) * 2
frames = []
for t in range(total):
    c = bg.copy()
    for i, (meta, fr) in enumerate(clips):
        k = t % len(fr)
        f = fr[k]
        x = int(W * (i + 1) / (len(clips) + 1) - meta['anchorX'] * GAME_SCALE)
        c.alpha_composite(f, (x, ground - f.height))
        hits = meta.get('hits', [])
        for hi, hk in enumerate(hits):
            if k in (hk, hk + 1):
                a0, a1, flat = ARCS[hi % len(ARCS)]
                ch = meta['charH'] * GAME_SCALE
                layer = Image.new('RGBA', c.size, (0, 0, 0, 0))
                smear(layer, x + meta['anchorX'] * GAME_SCALE + ch * 0.15, ground - ch * 0.55, ch * 1.05, a0, a1, flat,
                      1.0 if k == hk else 0.45)
                c.alpha_composite(layer)
    frames.append(c.resize((W * VIEW, H * VIEW), Image.NEAREST).convert('RGB'))
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0)
print(OUT, len(frames))
