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
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9334', f'--user-data-dir={prof}', '--remote-allow-origins=*',
                         '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9334/json')) if t['type'] == 'page')
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
    cmd('Page.navigate', url=BASE + '?room2=1&dbg=1')
    for _ in range(40):   # 素材预载完、场景进入后才有 __R
        time.sleep(0.25)
        if js('!!(window.__R && window.__R.p)'): break
    time.sleep(0.5)
    if PHONE:
        cmd('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': 500, 'y': 200}])
        cmd('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])

    # 摆局面：不刷波次，主角右边一排三只狗，魂 3.5 格
    SETUP = """(() => { const R = window.__R; R.waveT = 999; R.en.length = 0;
      const mk = (x, ex) => R.en.push(Object.assign({ x, y: 500, vx: 0, vy: 0, face: -1, hp: 60, st: 'stun', t: 0, stunT: 99, flash: 0, home: x, pdir: -1, ground: true, hitPlayer: false, an: 0, mark: 0 }, ex));
      R.p.x = 300; R.p.face = 1; R.p.soul = 3.5; R.cam.x = 60;
      mk(390); mk(430); mk(470, { mark: 6 }); })()"""
    js(SETUP)
    time.sleep(0.4)
    press = lambda k: js(f"pulse.add('{k}')")

    reset_cd = "window.__R.p.cd = { u: 0, i: 0, o: 0 }"
    if len(sys.argv) > 4 and sys.argv[4] == 'enemies':   # 新敌人：各自的待机 / 预警 / 出招
        FOES = """(() => { const R = window.__R; R.waveT = 999; R.en.length = 0; R.eshots.length = 0;
          const mk = (type, x, y, ex) => R.en.push(Object.assign({ type, x, y, vx: 0, vy: 0, face: -1, hp: 40, maxHp: 40, st: 'idle', t: 0, flash: 0, home: x, pdir: -1,
            ground: true, hitPlayer: false, an: 0, mark: 0, stunT: 99, cd: 99, skin: 'skel' }, ex));
          R.p.x = 300; R.p.face = 1; R.cam.x = 60;
          %s })()"""
        js(FOES % "mk('skel', 360, 500, { st: 'rise', t: 0.35 }); mk('skel', 420, 500, { st: 'chase', skin: 'skelc', hp: 20, maxHp: 30 }); mk('ghost', 500, 470, { st: 'drift', ground: false }); mk('wiz', 580, 436, { st: 'cast', t: 0.4 });")
        time.sleep(0.15); shot('e_idle')
        js(FOES % "mk('skel', 336, 500, { st: 'windup', t: 0 }); mk('ghost', 262, 496, { st: 'windup', t: 0.2, ground: false, face: 1 }); mk('wiz', 580, 436, { st: 'idle', cd: 0 });")
        time.sleep(0.5); shot('e_tell')
        time.sleep(0.25); shot('e_attack')
        print(chr(10).join(logs) or 'no errors'); sys.exit(0)
    if len(sys.argv) > 4 and sys.argv[4] == 'cutin':   # 冻结切入画面：停留中 / 碎裂中
        for name, t in [('cut_hold', 0.35), ('cut_glint', 0.36), ('cut_shatter', 1.42)]:
            js(f"window.__R.cutin = {{ t: {t}, freeze: true }}"); time.sleep(0.3); shot(name)
        print(chr(10).join(logs) or 'no errors'); sys.exit(0)
    if len(sys.argv) > 4 and sys.argv[4] == 'transform':   # 变身切入、暴走技能、葬
        js("window.__R.p.soul = 5")
        press('s4')
        for k, t in enumerate([0.08, 0.3, 0.5, 0.45, 0.15]): time.sleep(t); shot(f'c_{k}')
        js(SETUP.replace("R.p.soul = 3.5", "R.p.soul = 0")); js("window.__R.p.form = 'blood'; window.__R.p.rage = window.__R.p.rageMax = 30; window.__R.p.cd = {u:0,i:0,o:0}")
        press('attack'); time.sleep(0.2); shot('r_wave')
        time.sleep(0.3); press('s1'); time.sleep(0.6); shot('r_rain')
        time.sleep(1.2); js(SETUP.replace("R.p.soul = 3.5", "R.p.soul = 0").replace("stunT: 99, flash: 0", "stunT: 99, hp: 900, flash: 0")); js("window.__R.p.form = 'blood'; window.__R.p.rage = 30")
        press('s2'); time.sleep(0.3); shot('r_maul')
        time.sleep(0.6); press('s3'); time.sleep(0.15); shot('r_storm'); time.sleep(0.3); shot('r_storm2')
        time.sleep(0.6); js("window.__R.p.rage = 0.05"); time.sleep(0.4); shot('r_fin')
        print(chr(10).join(logs) or 'no errors'); sys.exit(0)
    press('s2'); time.sleep(0.2); shot('1_throw')
    time.sleep(0.15)
    press('s2'); time.sleep(0.05); shot('2_blink')
    time.sleep(0.5)
    js(SETUP); js(reset_cd)
    press('s3'); time.sleep(0.3); shot('3_iai_pre')
    time.sleep(0.12); shot('4_iai_burst')
    time.sleep(0.6)
    js(SETUP); js(reset_cd); js("window.__R.witch = 2.2")
    press('s3'); time.sleep(0.15); shot('5_storm')
    time.sleep(0.3); shot('6_storm_burst')
    time.sleep(0.8)
    js(SETUP); js(reset_cd); js("window.__R.p.soul = 4")
    press('s4'); time.sleep(1.0)
    js("window.__R.en.forEach(e => { e.st = 'chase'; e.stunT = 0.28; }); window.__R.p.cd = { u: 0, i: 0, o: 0 }")
    press('s2'); time.sleep(0.25); shot('7_drag')
    time.sleep(0.6)
    js(reset_cd); js("window.__R.p.face = 1")
    press('s3'); time.sleep(0.4); shot('8_quake')
    print('state', js("JSON.stringify({ st: window.__R.p.st, form: window.__R.p.form, soul: window.__R.p.soul, kills: window.__R.kills })"))
    print('\n'.join(logs) or 'no errors')
finally:
    proc.kill()
