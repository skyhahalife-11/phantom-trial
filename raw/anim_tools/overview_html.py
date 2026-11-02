"""把 out/ 下所有 hero_*.png/json 打成一个自包含 HTML 动作总览（图片 base64 内嵌，直接双击打开）"""
import sys, os, json, base64, glob

SRC, OUT = sys.argv[1], sys.argv[2]
LABEL = {
    'idle': '待机', 'run': '跑', 'jump': '跳跃', 'djump': '二段跳', 'dash': '冲刺', 'combo': '普攻三连',
    'airatk': '空中斩', 'plunge': '下劈', 'runatk': '跑攻', 'hurt': '受击', 'death': '倒地',
    'u_thrust': 'U 送葬突刺', 'i_hook': 'I 锁魂钩', 'o_heave': 'O 掘墓', 'transform': 'P 变身',
    't_idle': '变身·待机', 't_stomp': '变身·沉重踏步', 't_sweep': '变身·横扫与反扫', 't_clawslam': '变身·巨爪拍地',
    't_grab': '变身·撕握', 't_drop': '变身·碑落', 't_finisher': '变身·葬', 't_guard': '变身·镇墓',
}
items = []
for k in LABEL:
    p = os.path.join(SRC, 'hero_' + k)
    if not os.path.exists(p + '.png'):
        continue
    meta = json.load(open(p + '.json'))
    b64 = base64.b64encode(open(p + '.png', 'rb').read()).decode()
    items.append({'key': k, 'label': LABEL[k], 'meta': meta, 'src': 'data:image/png;base64,' + b64})

html = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>幻之试炼 · 主角动作总览</title>
<style>
body{margin:0;background:#15121c;color:#e8e2f0;font:14px/1.5 "Microsoft YaHei",sans-serif}
h1{font-size:20px;margin:20px 24px 4px}p.sub{margin:0 24px 16px;color:#9a90ad}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:0 24px 32px}
.card{background:#211c2b;border:1px solid #352d44;border-radius:8px;padding:10px}
.card h2{font-size:14px;margin:0 0 6px;display:flex;justify-content:space-between}
.card h2 span{color:#8a80a0;font-weight:normal;font-size:12px}
canvas{display:block;width:auto;max-width:100%;image-rendering:pixelated;background:linear-gradient(#2a2238,#1a1524);border-radius:4px}
.ctrl{margin:0 24px 12px}button{background:#352d44;color:#e8e2f0;border:0;border-radius:4px;padding:5px 12px;margin-right:6px;cursor:pointer}
</style></head><body>
<h1>幻之试炼 · 主角动作总览（酒红剑客）</h1>
<p class="sub">游戏内大小：原生约 42 像素高 ×1.5 倍；这里再放大 3 倍显示。红色竖线为命中帧。常态 14 个、变身 9 个动作。</p>
<div class="ctrl"><button id="slow">0.5 倍速</button><button id="norm">正常速度</button></div>
<div class="grid" id="g"></div>
<script>
const ITEMS = __ITEMS__;
const SCALE = 1.5 * 3, PAD = 12;
let speed = 1;
document.getElementById('slow').onclick = () => speed = 0.5;
document.getElementById('norm').onclick = () => speed = 1;
const cards = ITEMS.map(it => {
  const m = it.meta, d = document.createElement('div');
  d.className = 'card';
  const hits = m.hits || (m.hit != null ? [m.hit] : []);
  d.innerHTML = `<h2>${it.label}<span>${m.n} 帧${m.loop ? ' · 循环' : ''}${hits.length ? ' · 命中帧 ' + hits.map(h => h + 1).join('/') : ''}</span></h2>`;
  const c = document.createElement('canvas');
  c.width = Math.round(m.fw * SCALE) + PAD * 2; c.height = Math.round(m.fh * SCALE) + PAD * 2;
  d.appendChild(c); document.getElementById('g').appendChild(d);
  const img = new Image(); img.src = it.src;
  return { m, c, ctx: c.getContext('2d'), img, hits };
});
let t0 = performance.now();
function draw(now) {
  const t = (now - t0) / 1000 * speed;
  for (const k of cards) {
    const { m, ctx, c, img, hits } = k;
    const total = m.n + (m.loop ? 0 : 4);
    let f = Math.floor(t * m.fps) % total;
    if (f >= m.n) f = m.n - 1;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3a304a'; ctx.fillRect(0, c.height - PAD, c.width, 2);
    if (img.complete) ctx.drawImage(img, f * m.fw, 0, m.fw, m.fh, PAD, PAD, m.fw * SCALE, m.fh * SCALE);
    if (hits.includes(f)) { ctx.fillStyle = '#ff4a4a'; ctx.fillRect(c.width - 6, 0, 4, c.height); }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script></body></html>"""
open(OUT, 'w', encoding='utf-8').write(html.replace('__ITEMS__', json.dumps(items, ensure_ascii=False)))
print(OUT, len(items))
