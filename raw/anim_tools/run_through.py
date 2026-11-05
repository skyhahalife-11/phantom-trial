"""整局走通：每场战斗 debugWin，其余界面用回车/点击推进，记录经过的场景序列并截图。"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket
BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='runthru_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9337', f'--user-data-dir={prof}', '--remote-allow-origins=*', '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
logs = []
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9337/json')) if t['type'] == 'page'); break
        except Exception: time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=60); mid = [0]
    def cmd(method, **params):
        mid[0] += 1; ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown': logs.append('EXC ' + json.dumps(m['params']['exceptionDetails'], ensure_ascii=False)[:400])
            if m.get('id') == mid[0]: return m.get('result', m.get('error'))
    def js(e):
        r = cmd('Runtime.evaluate', expression=e, returnByValue=True)
        if r.get('exceptionDetails'): logs.append('EVAL ' + json.dumps(r['exceptionDetails'], ensure_ascii=False)[:400])
        return r.get('result', {}).get('value')
    def shot(n):
        r = cmd('Page.captureScreenshot', format='png'); open(os.path.join(OUT, n + '.png'), 'wb').write(base64.b64decode(r['data']))
    def key(k, code):
        for t in ('keyDown', 'keyUp'): cmd('Input.dispatchKeyEvent', type=t, key=k, code=code, windowsVirtualKeyCode={'Enter': 13, 'Escape': 27, 'Digit1': 49}.get(code, 0))
    def click(x, y):
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'): cmd('Input.dispatchMouseEvent', type=t, x=x, y=y, button='left', clickCount=1)
    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE + '?dbg=1')
    for _ in range(60):
        time.sleep(0.25)
        if js("typeof startGame === 'function' && !!scene"): break
    time.sleep(1.5)
    NAME = "(() => { const m = {titleScene, mapScene, roomScene, runResultScene}; for (const k in m) if (scene === m[k]) return k; return (scene && scene.constructor && scene.constructor.name) + ':' + Object.keys(scene).slice(0,4).join(','); })()"
    js("startGame()")
    seen = []; shots = 0
    for step in range(400):
        nm = js(NAME)
        if not seen or seen[-1] != nm:
            seen.append(nm)
            if shots < 40: shot(f'{shots:02d}_' + str(nm).replace(':', '_').replace(',', '_')[:30]); shots += 1
        if nm == 'roomScene':
            if js("!!(window.__R && window.__R.cfg)"):
                time.sleep(0.4); js("roomScene.debugWin()"); time.sleep(2.2)
            else: break
        elif nm == 'mapScene':
            ok = js("(() => { const av = allNodes().filter(n => n.state === 'avail'); if (!av.length) return false; chooseNode(av[0]); return true; })()")
            time.sleep(0.8)
        elif nm == 'runResultScene': break
        else:
            key('Enter', 'Enter'); click(330, 330); time.sleep(0.5)
    print('SEQUENCE:', ' > '.join(seen)); print('run.stage', js("run.stage"), 'active', js("run.active"), 'boons', js("run.boons.length"), 'coins', js("run.coins"))
    print('\n'.join(logs[:6]) or 'no errors')
finally:
    proc.kill()
