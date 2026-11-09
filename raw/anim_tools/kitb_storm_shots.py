"""kit=b 瞬狱截图：招架成立 → 眼睛特写 → 穿梭斩 → 收刀爆。用法：python kitb_storm_shots.py <base_url> <输出目录>"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket

BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='stormshot_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9337', f'--user-data-dir={prof}', '--remote-allow-origins=*',
                         '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9337/json')) if t['type'] == 'page')
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
    cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE + '?room2=1&dbg=1&kit=b')
    for _ in range(40):
        time.sleep(0.25)
        if js('!!(window.__R && window.__R.p)'): break
    time.sleep(2.5)
    js("""(() => { const R = window.__R; R.waveT = 999; R.en.length = 0;
      const mk = (x, ex) => R.en.push(Object.assign({ x, y: 500, vx: 0, vy: 0, face: -1, hp: 9999, maxHp: 9999, st: 'stun', t: 0, stunT: 99, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0, type: 'skel', skin: 'skel', cd: 99 }, ex));
      R.p.x = 300; R.p.y = 500; R.p.face = 1; R.cam.x = 120; R.p.cd = {u:0,i:0,o:0};
      mk(330, { st: 'windup', t: 0.3, stunT: 0, cd: 0 }); mk(390); mk(460); mk(240); })()""")
    time.sleep(0.3)
    js("pulse.add('s3')")
    # 冻结：游戏和特写一起停；解冻：恢复原来的定格时间
    freeze = lambda: js("(() => { const R = window.__R; window.__os = R.stop; R.stop = 99; if (R.eye) R.eye.freeze = true; })()")
    thaw = lambda: js("(() => { const R = window.__R; R.stop = window.__os; if (R.eye) R.eye.freeze = false; })()")
    t0 = time.time()
    for k in range(52):
        time.sleep(0.045); freeze(); time.sleep(0.06)
        st = js("(() => { const R = window.__R; return R.p.st + (R.eye ? ' eye' + R.eye.t.toFixed(2) : ''); })()")
        shot('s%02d' % k); logs.append(f's{k:02d} {st}'); thaw()
    print(chr(10).join(logs))
finally:
    proc.kill()
