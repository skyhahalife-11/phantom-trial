"""手机触屏模拟：Chrome 无头 + CDP，模拟 844×390、dpr 3 的横屏手机，打触摸事件并截图。
用法：python touch_test.py <url> <输出目录>"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket

URL, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='touchtest_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9333', f'--user-data-dir={prof}',
                         '--no-first-run', '--remote-allow-origins=*', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
            page = next(t for t in tabs if t['type'] == 'page')
            break
        except Exception:
            time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30)
    mid = [0]
    logs = []

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                logs.append('EXC ' + json.dumps(m['params']['exceptionDetails'])[:400])
            elif m.get('method') == 'Runtime.consoleAPICalled':
                logs.append('LOG ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in m['params']['args'])[:300])
            if m.get('id') == mid[0]:
                return m.get('result', m.get('error'))

    CW, CH, DPR = 844, 390, 3
    cmd('Runtime.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=CW, height=CH, deviceScaleFactor=DPR, mobile=True)
    cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    cmd('Page.enable')
    cmd('Page.navigate', url=URL)
    time.sleep(3)

    # 逻辑坐标 → CSS 像素（宽屏模式：scale = 画布高/720，ox = 0）
    scale = CH * DPR / 720
    VW = min(CW * DPR / scale, 1280 * 1.34)
    css = lambda x, y: (x * scale / DPR, y * scale / DPR)
    print('VW', VW)

    def touch(kind, pts):
        cmd('Input.dispatchTouchEvent', type=kind, touchPoints=[{'x': x, 'y': y, 'id': i} for i, (x, y) in pts])

    def shot(name):
        r = cmd('Page.captureScreenshot', format='png')
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['data']))

    def state():
        r = cmd('Runtime.evaluate', expression='JSON.stringify({on: touchUI.on, menu: touchUI.menu, VW, virt, scene: scene === roomScene})', returnByValue=True)
        return r['result'].get('value')

    # 1 轻点空白处开启触屏
    touch('touchStart', [(0, css(VW * 0.6, 300))]); touch('touchEnd', [])
    time.sleep(0.5)
    print('after tap', state())
    shot('1_buttons')
    # 2 摇杆按住往右 1.2 秒，同时连点攻击
    sx, sy = css(200, 560)
    ax, ay = css(VW - 170, 585)
    touch('touchStart', [(0, (sx, sy))])
    touch('touchMove', [(0, (sx + 50, sy))])
    print('stick right', state())
    time.sleep(1.0)
    for _ in range(3):
        touch('touchStart', [(0, (sx + 50, sy)), (1, (ax, ay))]); time.sleep(0.05)
        touch('touchEnd', [(0, (sx + 50, sy))]); time.sleep(0.1)
    shot('2_stick_attack')
    touch('touchEnd', [])
    # 3 右侧空白处快速往左滑 = 冲刺
    touch('touchStart', [(0, css(VW * 0.62, 300))])
    touch('touchMove', [(0, css(VW * 0.62 - 80, 300))])
    time.sleep(0.05)
    shot('3_swipe_dash')
    touch('touchEnd', [])
    r = cmd('Runtime.evaluate', expression="JSON.stringify(roomScene && window.touchUI ? {} : {})", returnByValue=True)
    # 4 设置面板
    time.sleep(0.4)
    mx, my = css(VW - 116, 46)
    touch('touchStart', [(0, (mx, my))]); touch('touchEnd', [])
    time.sleep(0.3)
    print('menu', state())
    shot('4_menu')
    print('\n'.join(logs) or 'no console output')
finally:
    proc.kill()
