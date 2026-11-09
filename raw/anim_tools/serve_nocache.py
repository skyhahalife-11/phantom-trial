"""本地试玩服务器：和 python -m http.server 一样，但每个响应都带 no-store，改完代码刷新就生效（不吃浏览器缓存）。
用法：python -X utf8 serve_nocache.py [端口=8766]   （在游戏根目录下运行）"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
