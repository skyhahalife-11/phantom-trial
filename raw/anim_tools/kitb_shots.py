"""技能画面截图：Chrome 无头 + CDP，用 dbg=1 暴露的 __R 摆局面，往 pulse 里塞按键，按时间点截图。
用法：python skill_shots.py <base_url> <输出目录> [phone]"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket

BASE, OUT = sys.argv[1], sys.argv[2]
PHONE = len(sys.argv) > 3 and sys.argv[3] == 'phone'
import sys as _s
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='skillshot_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9336', f'--user-data-dir={prof}', '--remote-allow-origins=*',
                         '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9336/json')) if t['type'] == 'page')
            break
        except Exception:
            time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30)
    mid = [0]; logs = []

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                logs.append('EXC ' + json.dumps(m['params']['exceptionDetails'])[:500])
            if m.get('id') == mid[0]:
                return m.get('result', m.get('error'))

    def js(expr):
        r = cmd('Runtime.evaluate', expression=expr, returnByValue=True)
        if r.get('exceptionDetails'):
            logs.append('EVAL ' + json.dumps(r['exceptionDetails'])[:900])
        return r.get('result', {}).get('value')

    def shot(name):
        r = cmd('Page.captureScreenshot', format='png')
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['data']))

    cmd('Runtime.enable'); cmd('Page.enable')
    if PHONE:
        cmd('Emulation.setDeviceMetricsOverride', width=844, height=390, deviceScaleFactor=3, mobile=True)
        cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    else:
        cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE + '?room2=1&dbg=1&kit=b')
    for _ in range(40):
        time.sleep(0.25)
        if js('!!(window.__R && window.__R.p)'): break
    time.sleep(0.5)
    SETUP = """(() => { const R = window.__R; R.waveT = 999; R.en.length = 0;
      const mk = (x, ex) => R.en.push(Object.assign({ x, y: 500, vx: 0, vy: 0, face: -1, hp: 60, maxHp: 60, st: 'stun', t: 0, stunT: 99, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0 }, ex));
      R.p.x = 300; R.p.y = 500; R.p.face = 1; R.p.soul = 2; R.cam.x = 60; R.p.cd = {u:0,i:0,o:0};
      mk(400); mk(440); })()"""
    js(SETUP); time.sleep(0.4)
    press = lambda k: js(f"pulse.add('{k}')")
    freeze = lambda: js("window.__R.stop = 9")
    thaw = lambda: js("window.__R.stop = 0")
    js("(() => { const R = window.__R; R.en.length = 0; const mk = (x) => R.en.push({ x, y: 500, vx: 0, vy: 0, face: -1, hp: 9999, maxHp: 9999, st: 'stun', t: 0, stunT: 99, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0 }); R.p.x = 250; mk(330); mk(360); mk(520); })()")
    time.sleep(0.2)
    for k in range(16):
        if k % 2 == 0: press('attack')
        time.sleep(0.05); freeze(); time.sleep(0.1); shot('c%02d' % k); thaw()
    time.sleep(0.6)
    js(SETUP); js("window.__R.en[0].st='windup'; window.__R.en[0].type='skel'; window.__R.en[0].skin='skel'; window.__R.en[0].t=0.5; window.__R.en[0].stunT=0; window.__R.en[0].cd=0; window.__R.en[0].x=330; window.__R.p.x=300")
    press('s3'); time.sleep(0.06); freeze(); time.sleep(0.15); shot('k5_phase_perfect'); thaw()
    time.sleep(0.3); press('attack'); time.sleep(0.12); freeze(); time.sleep(0.15); shot('k6_eye_slash'); thaw()
    time.sleep(1.5)
    js(SETUP); press('dodge'); time.sleep(0.15); freeze(); time.sleep(0.15); shot('k7_sub'); thaw()
    print(chr(10).join(logs) or 'no errors')
finally:
    proc.kill()
