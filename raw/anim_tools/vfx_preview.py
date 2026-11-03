"""技能特效候选预览页：把 raw/asset_candidates/vfx/ 下的 CC0 特效整理成单行帧条，
生成原色 + 「魂火」青蓝 + 「血焰」猩红三种配色，打成一个自包含 HTML（图片 base64 内嵌，双击打开）。
平滑手绘风的刀光（Cethiel）先缩到约 1/3 再减色，变成像素风。
用法：python -X utf8 vfx_preview.py <vfx 目录> <输出 html> [<导出精灵条目录>]"""
import sys, os, io, glob, json, base64
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
EXPORT = sys.argv[3] if len(sys.argv) > 3 else None

# 渐变色板：按亮度把特效重新上色，暗处透明度不变
RAMPS = {
    'soul': [(10, 20, 60), (30, 90, 200), (80, 200, 255), (200, 245, 255), (255, 255, 255)],
    'blood': [(40, 0, 10), (140, 10, 30), (230, 40, 50), (255, 140, 120), (255, 240, 220)],
}


def recolor(im, ramp):
    a = np.asarray(im.convert('RGBA')).astype(float)
    lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]) / 255
    lum = np.clip(lum * 1.15, 0, 1)
    stops = np.array(RAMPS[ramp], float)
    pos = lum * (len(stops) - 1)
    i = np.clip(pos.astype(int), 0, len(stops) - 2)
    t = (pos - i)[..., None]
    rgb = stops[i] * (1 - t) + stops[i + 1] * t
    out = np.dstack([rgb, a[..., 3:4]]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def strip_from_sheet(path, fw, fh, cols=None, n=None):
    im = Image.open(path).convert('RGBA')
    cols = cols or im.width // fw
    rows = im.height // fh
    n = n or cols * rows
    frames = [im.crop(((k % cols) * fw, (k // cols) * fh, (k % cols + 1) * fw, (k // cols + 1) * fh)) for k in range(n)]
    return frames


def black_to_alpha(im):
    """黑底发光图 → 透明底：亮度当透明度"""
    rgba = np.asarray(im.convert('RGBA')).astype(float)
    a = rgba[..., :3]
    # 原图若本身带透明背景（透明处的颜色可能是白的），以原透明度为上限，否则整块背景会变白
    alpha = np.minimum(np.clip(a.max(axis=2) * 1.4, 0, 255), rgba[..., 3])
    return Image.fromarray(np.dstack([a, alpha]).astype(np.uint8), 'RGBA')


def pixelize(im, scale, colors=10):
    """平滑特效 → 像素风：缩小（最近邻），alpha 二值化，颜色量化"""
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    small = im.resize((w, h), Image.BOX)
    a = np.asarray(small).copy()
    a[..., 3] = np.where(a[..., 3] > 70, 255, 0)
    rgb = Image.fromarray(a[..., :3]).quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    return Image.fromarray(np.dstack([np.asarray(rgb), a[..., 3]]), 'RGBA')


def to_strip(frames):
    fw, fh = max(f.width for f in frames), max(f.height for f in frames)
    s = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for k, f in enumerate(frames):
        s.alpha_composite(f, (k * fw + (fw - f.width) // 2, (fh - f.height) // 2))
    return s, fw, fh


def b64(im):
    buf = io.BytesIO(); im.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


items = []


def add(key, title, pack, use, frames, fps=14, recolorable=True):
    s, fw, fh = to_strip(frames)
    variants = {'原色': s}
    if recolorable:
        variants['魂火'] = recolor(s, 'soul')
        variants['血焰'] = recolor(s, 'blood')
    if EXPORT:
        os.makedirs(EXPORT, exist_ok=True)
        for vn, im in variants.items():
            tag = {'原色': 'orig', '魂火': 'soul', '血焰': 'blood'}[vn]
            im.save(os.path.join(EXPORT, f'{key}_{tag}.png'))
        json.dump({'fw': fw, 'fh': fh, 'n': len(frames), 'fps': fps}, open(os.path.join(EXPORT, f'{key}.json'), 'w'))
    items.append({'key': key, 'title': title, 'pack': pack, 'use': use, 'fw': fw, 'fh': fh, 'n': len(frames), 'fps': fps,
                  'v': {k: b64(v) for k, v in variants.items()}})


# ansimuz 爆炸（和 Gothicvania 同一作者）
ex = glob.glob(os.path.join(SRC, 'ansimuz_explosions', 'x', '**', 'spritesheets'), recursive=True)[0]
for k, use in [(1, '小型命中爆点：送葬突刺穿刺、飞剑命中'), (2, '中型爆炸：断空斩痕爆开'), (3, '烟尘型爆炸：裂地、落地'),
               (4, '大爆炸：瞬狱收刀、变身冲击'), (5, '超大爆炸：「葬」大砸'), (6, '火花爆：墓志引爆')]:
    p = os.path.join(ex, f'explosion-{k}.png')
    h = Image.open(p).height
    add(f'ansimuz_exp{k}', f'爆炸 {k}', 'ansimuz · Animated Explosions（CC0）', use, strip_from_sheet(p, h, h))

# 命中火花
for k, f in enumerate(['spark_sprite_strip9.png', 'spark_sprite2_strip9.png'], 1):
    add(f'spark{k}', f'命中火花 {k}', 'kurohina · Spark effect（CC0）', '普攻、瞬身斩的命中闪光', strip_from_sheet(os.path.join(SRC, 'kurohina_spark', f), 32, 32), fps=20)

# 像素刀光
add('tbbk_slash', '剑弧', 'tbbk · Pixel art sword slash effect（CC0）', '普攻刀光（替换现在代码画的月牙）',
    strip_from_sheet(os.path.join(SRC, 'tbbk_sword_slash', 'pixel_art_sword_slash_sprites.png'), 64, 47, cols=3), fps=16)

# Cethiel 刀光：黑底平滑发光图 → 缩小减色成像素风
names = {1: '月牙斩（大）', 2: '月牙斩（小）', 3: '残影弧', 4: '突刺火星', 5: '直线斩痕'}
uses = {1: '变身横扫、断空', 2: '普攻', 3: '空中斩', 4: '送葬突刺的冲刺尾迹', 5: '断空 / 瞬狱的斩痕'}
for k in range(1, 6):
    fs = sorted(glob.glob(os.path.join(SRC, 'cethiel_weapon_slash', 'x', 'Classic', str(k), '*.png')))
    frames = [pixelize(black_to_alpha(Image.open(f)), 0.34) for f in fs]
    add(f'cethiel_{k}', names[k], 'Cethiel · Weapon Slash（CC0，已缩小减色成像素风）', uses[k], frames, fps=16)

# 16 像素小法术（黑白，可上色）
spells = os.path.join(SRC, 'oga_pixel_spells', 'x', 'Pixelart Spells', 'PNG Files')
for n, use in [('Darkness Orb', '魂火球：墓志、飘在敌人身上的魂火'), ('Magic Sparks', '魂火粒子：瞬身残光'), ('Darkness Bolt', '飞行的魂火：掷碑拖尾'),
               ('Splash', '落地溅射：碑落砸地')]:
    p = os.path.join(spells, n + '.png')
    h = Image.open(p).height
    add('spell_' + n.lower().replace(' ', '_'), n, 'Pixel Art Spells（OpenGameArt，CC0）', use, strip_from_sheet(p, h, h), fps=10)

html = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>幻之试炼 · 技能特效素材候选</title>
<style>
body{margin:0;background:#15121c;color:#e8e2f0;font:14px/1.6 "Microsoft YaHei",sans-serif}
h1{font-size:20px;margin:20px 24px 4px}p.sub{margin:0 24px 6px;color:#9a90ad;max-width:1100px}
.ctrl{margin:10px 24px}button{background:#352d44;color:#e8e2f0;border:0;border-radius:4px;padding:5px 12px;margin-right:6px;cursor:pointer}
button.on{background:#7a5fb0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;padding:0 24px 32px}
.card{background:#211c2b;border:1px solid #352d44;border-radius:8px;padding:10px}
.card h2{font-size:14px;margin:0 0 2px}.card .pk{color:#8a80a0;font-size:12px}.card .use{color:#c8bcd8;font-size:12px;margin:4px 0 8px}
.row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.cv{text-align:center;font-size:11px;color:#9a90ad}
canvas{display:block;image-rendering:pixelated;background:#0f0c16;border-radius:4px}
</style></head><body>
<h1>幻之试炼 · 技能特效素材候选（全部 CC0，可商用、不用署名）</h1>
<p class="sub">每个特效给三种配色：原色、「魂火」（常态技能用的青蓝色）、「血焰」（变身后用的猩红色）。重新上色由代码按亮度映射完成，选定后按同样方法批量导出。
显示倍数与游戏内一致（像素放大 2 倍），可切换 4 倍看细节。Cethiel 的刀光原本是平滑手绘风，已缩小减色成像素风。</p>
<div class="ctrl"><button id="z2" class="on">游戏内大小（2 倍）</button><button id="z4">放大看细节（4 倍）</button><button id="slow">0.5 倍速</button><button id="norm" class="on">正常速度</button></div>
<div class="grid" id="g"></div>
<script>
const ITEMS = __ITEMS__;
let Z = 2, speed = 1;
const cards = [];
function build() {
  const g = document.getElementById('g'); g.innerHTML = ''; cards.length = 0;
  for (const it of ITEMS) {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<h2>${it.title}</h2><div class="pk">${it.pack} · ${it.n} 帧</div><div class="use">建议用在：${it.use}</div>`;
    const row = document.createElement('div'); row.className = 'row';
    for (const [vn, src] of Object.entries(it.v)) {
      const w = document.createElement('div'); w.className = 'cv';
      const c = document.createElement('canvas'); c.width = it.fw * Z + 8; c.height = it.fh * Z + 8;
      w.appendChild(c); w.appendChild(document.createTextNode(vn)); row.appendChild(w);
      const im = new Image(); im.src = src;
      cards.push({ it, c, ctx: c.getContext('2d'), im });
    }
    d.appendChild(row); g.appendChild(d);
  }
}
const t0 = performance.now();
function draw(now) {
  const t = (now - t0) / 1000 * speed;
  for (const k of cards) {
    const { it, c, ctx, im } = k;
    const total = it.n + Math.round(it.fps * 0.4);
    const f = Math.floor(t * it.fps) % total;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    if (f < it.n && im.complete) ctx.drawImage(im, f * it.fw, 0, it.fw, it.fh, 4, 4, it.fw * Z, it.fh * Z);
  }
  requestAnimationFrame(draw);
}
const sel = (on, off) => { document.getElementById(on).classList.add('on'); document.getElementById(off).classList.remove('on'); };
document.getElementById('z2').onclick = () => { Z = 2; sel('z2', 'z4'); build(); };
document.getElementById('z4').onclick = () => { Z = 4; sel('z4', 'z2'); build(); };
document.getElementById('slow').onclick = () => { speed = 0.5; sel('slow', 'norm'); };
document.getElementById('norm').onclick = () => { speed = 1; sel('norm', 'slow'); };
build(); requestAnimationFrame(draw);
</script></body></html>"""
open(OUT, 'w', encoding='utf-8').write(html.replace('__ITEMS__', json.dumps(items, ensure_ascii=False)))
print(OUT, len(items), 'effects')
