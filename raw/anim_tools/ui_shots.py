"""用 debugJump 逐个截流程界面。用法：python ui_shots.py <base_url> <输出目录> [名字,名字...]"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket
BASE, OUT = sys.argv[1], sys.argv[2]
NAMES = sys.argv[3].split(',') if len(sys.argv) > 3 else ['pick', 'core', 'rating', 'door', 'shop', 'bless', 'event', 'build', 'result', 'map', 'boss']
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='uishot_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9336', f'--user-data-dir={prof}', '--remote-allow-origins=*', '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
logs = []
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9336/json')) if t['type'] == 'page'); break
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
    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE + '?dbg=1')
    for _ in range(60):
        time.sleep(0.25)
        if js("typeof debugJump === 'function' && !!scene"): break
    time.sleep(1.5)
    for n in NAMES:
        if n == 'hover':
            js("debugJump('pick')"); time.sleep(1.2)
            for t in ('mouseMoved',): cmd('Input.dispatchMouseEvent', type=t, x=640, y=360)
            time.sleep(0.6); shot('u_pick_hover'); continue
        if n == 'get':
            js("debugJump('map'); setScene(boonGetScene(BOON['w_twin'], () => {}))"); time.sleep(0.25); shot('u_get_burst'); time.sleep(1.0); shot('u_get'); continue
        if n == 'notice':
            js("debugJump('map'); setScene(noticeScene('本关的商店与神秘房间都已探索过', '门后只有 30 试炼币', () => {}))"); time.sleep(1.0); shot('u_notice'); continue
        js(f"debugJump('{n}')"); time.sleep(1.4); shot('u_' + n)
    print('\n'.join(logs) or 'no errors')
finally:
    proc.kill()
