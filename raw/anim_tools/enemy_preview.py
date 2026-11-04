"""敌人素材候选总览：把各包里的敌人动画排成一张放大 2 倍的对照图。
用法：python -X utf8 enemy_preview.py <asset_candidates 目录> <输出 png>"""
import glob, os, re, sys
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
C = os.path.join(SRC, 'gothicvania_cemetery/x/gothicvania-cemetery-files/PNG/Sprites')
P = os.path.join(SRC, 'gothicvania_patreon/x/ gothicvania patreon collection')
W = os.path.join(SRC, 'gothicvania_church/x/gothicvania church files/SPRITES')


def num(f):
    m = re.findall(r'\d+', os.path.basename(f))
    return int(m[-1]) if m else 0


def seq(pat):
    return [Image.open(f).convert('RGBA') for f in sorted(glob.glob(pat), key=num)]


def sheet(p, n):
    im = Image.open(p).convert('RGBA')
    w = im.width // n
    return [im.crop((i * w, 0, (i + 1) * w, im.height)) for i in range(n)]


rows = [('skeleton-rise', seq(C + '/skeleton-rise/*.png')), ('skeleton', seq(C + '/skeleton/*.png')),
        ('skeleton-clothed', seq(C + '/skeleton-clothed/*.png'))]
for nm, n in [('ghost-appears', 6), ('ghost-idle', 7), ('ghost-shriek', 4), ('ghost-vanish', 7)]:
    rows.append((nm, sheet(f'{P}/Ghost-Files/PNG/{nm}.png', n)))
rows += [('wizard idle', seq(W + '/wizard/idle-sprites/*.png')), ('wizard fire', seq(W + '/wizard/fire-sprites/*.png')),
         ('fireball', seq(W + '/fx/fireball/fireball-sprites/*.png')),
         ('hell-beast burn', sheet(f'{P}/Hell-Beast-Files/PNG/without-stroke/hell-beast-burn.png', 6)),
         ('fire-skull', sheet(f'{P}/Fire-Skull-Files/PNG/fire-skull.png', 8))]
wmax = max(sum(f.width + 4 for f in fs) for _, fs in rows)
h = sum(max(f.height for f in fs) + 6 for _, fs in rows)
c = Image.new('RGBA', (wmax + 4, h), (36, 24, 40, 255))
y = 0
for nm, fs in rows:
    x = 2
    for f in fs:
        c.alpha_composite(f, (x, y))
        x += f.width + 4
    y += max(f.height for f in fs) + 6
    print(nm, len(fs), fs[0].size)
c.resize((c.width * 2, c.height * 2), Image.NEAREST).save(OUT)
