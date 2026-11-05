import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket
BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='metashot_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9338', f'--user-data-dir={prof}', '--remote-allow-origins=*', '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
logs = []
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9338/json')) if t['type'] == 'page'); break
        except Exception: time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=60); mid = [0]
    def cmd(method, **params):
        mid[0] += 1; ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown': logs.append('EXC ' + json.dumps(m['params']['exceptionDetails'], ensure_ascii=False)[:500])
            if m.get('id') == mid[0]: return m.get('result', m.get('error'))
    def js(e):
        r = cmd('Runtime.evaluate', expression=e, returnByValue=True)
        if r.get('exceptionDetails'): logs.append('EVAL ' + json.dumps(r['exceptionDetails'], ensure_ascii=False)[:500])
        return r.get('result', {}).get('value')
    def shot(n):
        r = cmd('Page.captureScreenshot', format='png'); open(os.path.join(OUT, n + '.png'), 'wb').write(base64.b64decode(r['data']))
    def click(x, y):
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'): cmd('Input.dispatchMouseEvent', type=t, x=x, y=y, button='left', clickCount=1); time.sleep(0.06)
    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE)
    for _ in range(60):
        time.sleep(0.25)
        if js("typeof startGame === 'function' && !!scene && !!window.META"): break
    time.sleep(1.5)
    js("META.state().souls = 260")
    time.sleep(0.3); shot('m1_title')
    click(330, 592); time.sleep(0.8); shot('m2_meta')
    click(250, 280); time.sleep(0.3); click(640, 280); time.sleep(0.3); click(1030, 280); time.sleep(0.3); click(250, 530); time.sleep(0.4)
    shot('m3_after_buy'); print('lv', js("JSON.stringify(META.state().lv)"), 'souls', js("META.state().souls"))
    key = lambda: [cmd('Input.dispatchKeyEvent', type=t, key='Escape', code='Escape', windowsVirtualKeyCode=27) for t in ('keyDown', 'keyUp')]
    key(); time.sleep(0.5)
    js("startGame()"); time.sleep(0.6)
    print('maxHp', js("runMaxHp()"), 'coins', js("run.coins"), 'mods.dmg', js("runMods().dmg"), 'cdr', js("runMods().cdr"), 'coinMul', js("runMods().coin"))
    js("run.kills = 40; run.bosses = 1; run.stage = 1; endRun(false)"); time.sleep(1.0)
    shot('m4_result'); print('result', js("JSON.stringify(run.result)"), 'saved', js("localStorage.getItem('phantom_trial_meta_v2')"))
    print('\n'.join(logs) or 'no errors')
finally:
    proc.kill()
