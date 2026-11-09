"""手机横屏下对比镜头远近：python zoom_shots.py <base_url> <输出目录>"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket
BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='zoomshot_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9337', f'--user-data-dir={prof}', '--remote-allow-origins=*', '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9337/json')) if t['type'] == 'page'); break
        except Exception: time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30)
    mid = [0]; logs = []
    def cmd(m, **pa):
        mid[0] += 1; ws.send(json.dumps({'id': mid[0], 'method': m, 'params': pa}))
        while True:
            r = json.loads(ws.recv())
            if r.get('method') == 'Runtime.exceptionThrown': logs.append(json.dumps(r['params'])[:300])
            if r.get('id') == mid[0]: return r.get('result', r.get('error'))
    js = lambda e: cmd('Runtime.evaluate', expression=e, returnByValue=True).get('result', {}).get('value')
    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=844, height=390, deviceScaleFactor=2, mobile=True)
    cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    for z in ['1', '1.5']:
        cmd('Page.navigate', url=BASE + f'?room2=1&kit=b&dbg=1&zoom={z}')
        for _ in range(40):
            time.sleep(0.25)
            if js('!!(window.__R && window.__R.p)'): break
        cmd('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': 420, 'y': 120}]); cmd('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        js("(() => { const R = window.__R; R.waveT = 999; R.en.length = 0; const mk = (type, x, ex) => R.en.push(Object.assign({ type, x, y: 500, vx: 0, vy: 0, face: -1, hp: 30, maxHp: 30, st: 'stun', t: 0, stunT: 99, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0, skin: 'skel' }, ex)); R.p.x = 300; R.p.face = 1; mk('skel', 380); mk('hound', 440); })()")
        time.sleep(1.2)
        r = cmd('Page.captureScreenshot', format='png'); open(os.path.join(OUT, f'zoom_{z}.png'), 'wb').write(base64.b64decode(r['data']))
    print('\n'.join(logs) or 'no errors')
finally:
    proc.kill()
