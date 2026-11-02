"""Yotta 网关出图：python -X utf8 gw_image.py models | gen <model> <prompt文件> <输出前缀> [参考图...]
地址与凭据只从环境变量读取，不打印。"""
import os, sys, json, base64
import httpx

BASE = os.environ['ANTHROPIC_BASE_URL'].rstrip('/')
if BASE.endswith('/v1'):
    BASE = BASE[:-3]
HDR = {}
for part in os.environ.get('ANTHROPIC_CUSTOM_HEADERS', '').split('\n'):
    if ':' in part:
        k, v = part.split(':', 1)
        HDR[k.strip()] = v.strip()
if 'Token' not in HDR:
    HDR['Token'] = os.environ.get('ANTHROPIC_API_KEY', '')
client = httpx.Client(transport=httpx.HTTPTransport(verify=False), proxy=None, headers=HDR, timeout=600)


def models():
    r = client.get(BASE + '/v1/models')
    data = r.json().get('data', [])
    for m in data:
        if m.get('type') == 'image':
            print(m.get('id'), '|', json.dumps({k: m[k] for k in m if k in ('pricing', 'capabilities', 'display_name')}, ensure_ascii=False)[:300])


def gen(model, prompt_file, out_prefix, refs):
    prompt = open(prompt_file, encoding='utf-8').read()
    body = {'model': model, 'prompt': prompt, 'size': '1536x1024', 'n': 1}
    if refs:
        # 网关只开放 generations 路由，参考图以 data URL 数组随请求体传入
        body['image'] = ['data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode() for p in refs]
    r = client.post(BASE + '/v1/images/generations', json=body)
    print('HTTP', r.status_code)
    try:
        j = r.json()
    except Exception:
        print(r.text[:500]); return
    if 'data' not in j:
        print(json.dumps(j, ensure_ascii=False)[:800]); return
    for i, d in enumerate(j['data']):
        path = f'{out_prefix}_{i + 1}.png'
        if d.get('b64_json'):
            open(path, 'wb').write(base64.b64decode(d['b64_json']))
        elif d.get('url'):
            open(path, 'wb').write(httpx.get(d['url'], timeout=120).content)
        print('saved', path)
    if 'usage' in j:
        print('usage', json.dumps(j['usage']))


def gen_resp(chat_model, prompt_file, out_prefix, refs, img_model='gpt-image-2'):
    """经 /v1/responses 让对话模型调用 image_generation 工具，参考图作为输入图片"""
    prompt = open(prompt_file, encoding='utf-8').read()
    content = [{'type': 'input_text', 'text': prompt}]
    for p in refs:
        content.append({'type': 'input_image', 'image_url': 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()})
    body = {'model': chat_model, 'input': [{'role': 'user', 'content': content}],
            'tools': [{'type': 'image_generation', 'model': img_model, 'size': os.environ.get('GW_SIZE', '1536x1024'), 'quality': 'high'}],
            'tool_choice': {'type': 'image_generation'}}
    r = client.post(BASE + '/v1/responses', json=body)
    print('HTTP', r.status_code)
    j = r.json()
    n = 0
    for o in j.get('output', []):
        if o.get('type') == 'image_generation_call' and o.get('result'):
            n += 1
            path = f'{out_prefix}_{n}.png'
            open(path, 'wb').write(base64.b64decode(o['result']))
            print('saved', path, o.get('revised_prompt', '')[:200])
    if not n:
        print(json.dumps(j, ensure_ascii=False)[:1200])
    if 'usage' in j:
        print('usage', json.dumps(j['usage'])[:400])


if __name__ == '__main__':
    if sys.argv[1] == 'models':
        models()
    elif sys.argv[1] == 'resp':
        gen_resp(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
    else:
        gen(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
