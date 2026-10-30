"""扫描 assets/anim/*.json，重新生成 manifest.js（window.ANIMS）。"""
import json, glob, os

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'anim')
anims = {}
for p in sorted(glob.glob(os.path.join(d, '*.json'))):
    anims[os.path.splitext(os.path.basename(p))[0]] = json.load(open(p, encoding='utf-8'))
with open(os.path.join(d, 'manifest.js'), 'w', encoding='utf-8') as f:
    f.write('window.ANIMS = ' + json.dumps(anims, ensure_ascii=False) + ';\n')
print(len(anims), 'anims:', ', '.join(anims))
