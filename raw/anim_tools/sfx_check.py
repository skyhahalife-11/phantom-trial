"""读 sfx_test.html 的离线渲染自检结果。用法：python sfx_check.py <url>"""
import json, subprocess, sys, time, urllib.request, tempfile
import websocket

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
prof = tempfile.mkdtemp(prefix='sfxchk_')
proc = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9336', f'--user-data-dir={prof}', '--remote-allow-origins=*',
                         '--no-first-run', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            page = next(t for t in json.load(urllib.request.urlopen('http://127.0.0.1:9336/json')) if t['type'] == 'page'); break
        except Exception:
            time.sleep(0.2)
    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=120)
    mid = [0]; errs = []

    def cmd(m, **p):
        mid[0] += 1
        ws.send(json.dumps({'id': mid[0], 'method': m, 'params': p}))
        while True:
            r = json.loads(ws.recv())
            if r.get('method') == 'Runtime.exceptionThrown': errs.append(json.dumps(r['params']['exceptionDetails'], ensure_ascii=False)[:400])
            if r.get('id') == mid[0]: return r.get('result', r.get('error'))
    cmd('Runtime.enable'); cmd('Page.enable')
    cmd('Page.navigate', url=sys.argv[1])
    res = None
    for _ in range(120):
        time.sleep(0.5)
        v = cmd('Runtime.evaluate', expression='JSON.stringify(window.__sfxResults||null)', returnByValue=True)['result'].get('value')
        if v and v != 'null': res = json.loads(v); break
    if not res: print('超时无结果', errs); sys.exit(1)
    for r in res['rows']:
        print(f"{r['n']:12s} len {r['len']:.2f}  peak {r['peak']:.2f}  rms {r['rms']:.3f}  {'OK' if not r['probs'] else r['probs']}")
    print('失败项数:', res['bad'], '页面错误:', errs or '无')
finally:
    proc.kill()
