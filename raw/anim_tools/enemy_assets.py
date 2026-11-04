"""新敌人素材：从 Gothicvania 各包拷贝/拼接成单行精灵条到 assets/gv/enemies/，并打印帧尺寸。
用法：python -X utf8 enemy_assets.py <asset_candidates 目录> <assets/gv/enemies 目录>"""
import glob, os, re, sys, shutil
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
C = os.path.join(SRC, 'gothicvania_cemetery/x/gothicvania-cemetery-files/PNG/Sprites')
P = os.path.join(SRC, 'gothicvania_patreon/x/ gothicvania patreon collection')
W = os.path.join(SRC, 'gothicvania_church/x/gothicvania church files/SPRITES')


def num(f):
    m = re.findall(r'\d+', os.path.basename(f))
    return int(m[-1]) if m else 0


def strip(pat, name):
    fs = [Image.open(f).convert('RGBA') for f in sorted(glob.glob(pat), key=num)]
    fw, fh = fs[0].size
    s = Image.new('RGBA', (fw * len(fs), fh))
    for i, f in enumerate(fs):
        s.alpha_composite(f, (i * fw, 0))
    s.save(os.path.join(OUT, name + '.png'))
    print(f'{name:14s} n={len(fs)} {fw}x{fh}')


def copy(p, name, n):
    shutil.copy(p, os.path.join(OUT, name + '.png'))
    im = Image.open(p)
    print(f'{name:14s} n={n} {im.width // n}x{im.height}')


strip(C + '/skeleton/*.png', 'skel-walk')
strip(C + '/skeleton-rise/*.png', 'skel-rise')
strip(C + '/skeleton-clothed/*.png', 'skelc-walk')
strip(C + '/skeleton-rise-clothed/*.png', 'skelc-rise')
for nm, n in [('ghost-appears', 6), ('ghost-idle', 7), ('ghost-shriek', 4), ('ghost-vanish', 7)]:
    copy(f'{P}/Ghost-Files/PNG/{nm}.png', nm, n)
strip(W + '/wizard/idle-sprites/*.png', 'wiz-idle')
strip(W + '/wizard/fire-sprites/*.png', 'wiz-fire')
strip(W + '/fx/fireball/fireball-sprites/*.png', 'fireball')
