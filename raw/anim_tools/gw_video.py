"""网关出视频（异步任务）：python -X utf8 gw_video.py <模型> <提示词文件> <首帧图> <输出.mp4> [秒数]
提交 /v1/videos/generations → 轮询 /v1/videos/retrieve → 下载。任务号写进 <输出>.task，断了可用 resume 续查：
python -X utf8 gw_video.py resume <输出.mp4>"""
import sys, json, time, base64
import httpx
from gw_image import client, BASE


def poll(model, tid, out):
    for _ in range(240):
        r = client.post(BASE + '/v1/videos/retrieve', json={'task_id': tid, 'model': model}).json()
        st = r.get('status')
        if r.get('videos'):
            v = r['videos'][0]
            data = base64.b64decode(v['b64_json']) if v.get('b64_json') else httpx.get(v['url'], timeout=300).content
            open(out, 'wb').write(data)
            print('saved', out, 'cost', json.dumps(r.get('usage', {})))
            return
        if st in ('failed', 'error', 'cancelled'):
            print('FAILED', json.dumps(r, ensure_ascii=False)[:800]); return
        time.sleep(10)
    print('timeout, resume later')


if __name__ == '__main__':
    if sys.argv[1] == 'resume':
        out = sys.argv[2]; t = json.load(open(out + '.task')); poll(t['model'], t['id'], out); sys.exit()
    model, pf, first, out = sys.argv[1:5]
    secs = sys.argv[5] if len(sys.argv) > 5 else '5'
    body = {'model': model, 'prompt': open(pf, encoding='utf-8').read(), 'seconds': secs, 'aspect_ratio': '16:9',
            'input_reference': 'data:image/png;base64,' + base64.b64encode(open(first, 'rb').read()).decode()}
    if model.startswith('doubao-seedance'):   # 火山线路不看 input_reference，首帧要按 content 数组给，不然成了文生视频
        body['content'] = [{'type': 'text', 'text': body['prompt']},
                           {'type': 'image_url', 'image_url': {'url': body['input_reference']}, 'role': 'first_frame'}]
    r =client.post(BASE + '/v1/videos/generations', json=body)
    print('HTTP', r.status_code)
    j = r.json()
    if 'id' not in j:
        print(json.dumps(j, ensure_ascii=False)[:800]); sys.exit(1)
    json.dump({'id': j['id'], 'model': model}, open(out + '.task', 'w'))
    print('task', j['id'], 'estimated', json.dumps(j.get('usage', {})))
    poll(model, j['id'], out)
