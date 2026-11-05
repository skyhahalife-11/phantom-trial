"""肉鸽整流程截图：标题 → 地图 → 大房间战斗 → 评分 → 强化三选一 → 构筑总览 → 回地图。
用法：python run_flow_shots.py <base_url> <输出目录>"""
import json, subprocess, sys, time, os, base64, urllib.request, tempfile
import websocket

BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='runflow_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9335', f'--user-data-dir={prof}', '--remote-allow-origins=*',
                         '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
logs = []
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9335/json')) if t['type'] == 'page')
            break
        except Exception:
            time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=60)
    mid = [0]

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
        while True:
            m = json.loads(ws.recv())
            if m.get('method') == 'Runtime.exceptionThrown':
                logs.append('EXC ' + json.dumps(m['params']['exceptionDetails'], ensure_ascii=False)[:600])
            if m.get('method') == 'Runtime.consoleAPICalled' and m['params']['type'] in ('error', 'warning'):
                logs.append('CON ' + json.dumps(m['params']['args'], ensure_ascii=False)[:300])
            if m.get('id') == mid[0]:
                return m.get('result', m.get('error'))

    def js(expr):
        r = cmd('Runtime.evaluate', expression=expr, returnByValue=True)
        if r.get('exceptionDetails'):
            logs.append('EVAL ' + json.dumps(r['exceptionDetails'], ensure_ascii=False)[:700])
        return r.get('result', {}).get('value')

    def shot(name):
        r = cmd('Page.captureScreenshot', format='png')
        open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(r['data']))

    def click(x, y):
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            cmd('Input.dispatchMouseEvent', type=t, x=x, y=y, button='left', clickCount=1)
            time.sleep(0.05)

    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
    cmd('Page.navigate', url=BASE + '?dbg=1')
    for _ in range(60):
        time.sleep(0.25)
        if js("typeof startGame === 'function' && typeof scene !== 'undefined' && !!scene"): break
    time.sleep(1.5)
    shot('1_title')
    js("startGame()"); time.sleep(0.8); shot('2_map')
    print('after start: boons', js("run.boons.length"), 'hp', js("run.hp"), '/', js("runMaxHp()"))
    js("chooseNode(run.map.columns[0][0])"); time.sleep(2.0)
    print('battle scene is room:', js("scene === roomScene"), 'wave cfg', js("JSON.stringify(window.__R && window.__R.cfg && window.__R.cfg.waves)"))
    shot('3_battle')
    time.sleep(1.0); shot('3b_battle')
    js("roomScene.debugWin()"); time.sleep(2.6); shot('4_rating')
    print('scene after win has rank:', js("run.ranks.join('')"), 'coins', js("run.coins"))
    click(640, 600); time.sleep(0.8); click(640, 600); time.sleep(0.8)
    shot('5_pick')
    print('pick cands:', js("typeof scene.cands !== 'undefined' ? JSON.stringify(scene.cands.map(b => b.name + '/' + (b.school||'-'))) : 'n/a'"))
    js("grantBoon('w_swift'); grantBoon('w_twin'); grantBoon('u_core'); grantBoon('d_trace'); grantBoon('atk_1')")
    js("setScene(buildScene(mapScene))"); time.sleep(0.5); shot('6_build')
    js("setScene(mapScene)"); time.sleep(0.5); shot('7_map_after')
    # 带着卡牌再打一场，看强化是否生效 + HUD
    js("chooseNode(run.map.columns[run.cur ? run.cur.col + 1 : 1].find(n => n.state === 'avail') || run.map.columns[1][0])"); time.sleep(2.5)
    shot('8_battle_with_cards')
    print('mods in room:', js("JSON.stringify({dmg: window.__R.M && window.__R.M.dmg, uCdr: window.__R.M && window.__R.M.uCdr, thrust2: window.__R.M && window.__R.M.thrust2})"))
    # Boss 节点
    js("run.stage = 0; genStageMap(); const b = run.map.boss; run.node = b; startNodeBattle(b)"); time.sleep(1.0); shot('9_boss_preview')
    click(640, 400); time.sleep(2.5); shot('10_boss_room')
    print('boss room waves:', js("JSON.stringify(window.__R.cfg && window.__R.cfg.waves)"), 'bossMul', js("window.__R.cfg && window.__R.cfg.bossMul"))
    print('\n'.join(logs) or 'no errors')
finally:
    proc.kill()
