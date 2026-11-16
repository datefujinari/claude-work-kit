"""phone-drop: iPhone の Safari から、この PC に写真を送るための受信サーバー。

起動すると QR コードを表示する。iPhone のカメラで読み取り、開いたページで
写真を選んで送ると、保存先フォルダに保存される。

安全のための仕組み:
- URL に起動ごとの使い捨てトークンを入れ、トークンのない通信は拒否する
- LAN の IP アドレスだけで待ち受ける（他のネットワークには出ない）
- 一定時間なにも送られてこなければ自動で終了する
- 受け取るのは写真・動画の拡張子だけ。ファイル名は安全な形に直す
"""

import argparse
import hmac
import os
import re
import secrets
import socket
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import segno

ALLOWED_EXTS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".webp",
    ".mov", ".mp4", ".m4v",
}
MAX_FILE_BYTES = 4 * 1024**3  # 1ファイル 4GB まで
CHUNK = 1024 * 1024

PAGE_PATH = Path(__file__).with_name("upload.html")


def lan_ip() -> str:
    """既定のルートで使われる LAN 側の IP を調べる（実際にはパケットを送らない）。"""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("192.0.2.1", 9))  # TEST-NET。到達しなくてよい
        return s.getsockname()[0]


def safe_name(raw: str) -> str | None:
    """送られてきたファイル名を、保存してよい名前に直す。許可しない拡張子なら None。"""
    name = Path(raw.replace("\\", "/")).name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    stem, ext = os.path.splitext(name)
    ext = ext.lower()
    if ext not in ALLOWED_EXTS:
        return None
    stem = stem[:100] or time.strftime("photo_%Y%m%d_%H%M%S")
    return stem + ext


def open_unique(folder: Path, name: str):
    """同名ファイルがあれば (1), (2)… を付けて、新しいファイルとして開く。"""
    stem, ext = os.path.splitext(name)
    for i in range(10000):
        path = folder / (name if i == 0 else f"{stem} ({i}){ext}")
        try:
            return path, open(path, "xb")
        except FileExistsError:
            continue
    raise RuntimeError("保存名を決められませんでした")


class State:
    def __init__(self, token: str, save_dir: Path, idle_sec: int):
        self.token = token
        self.save_dir = save_dir
        self.idle_sec = idle_sec
        self.last_activity = time.monotonic()
        self.received = 0
        self.lock = threading.Lock()

    def touch(self):
        self.last_activity = time.monotonic()


def make_handler(state: State, page_html: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "phone-drop"
        sys_version = ""

        def log_message(self, fmt, *args):
            pass  # アクセスログは出さない（必要な情報は自分で表示する）

        def _token_ok(self, token: str | None) -> bool:
            return token is not None and hmac.compare_digest(token, state.token)

        def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _deny(self):
            print(f"  ! 拒否: {self.client_address[0]} {self.command} {urlparse(self.path).path}")
            self._send(403, b"forbidden", "text/plain; charset=utf-8")

        def do_GET(self):
            url = urlparse(self.path)
            token = parse_qs(url.query).get("t", [None])[0]
            if url.path != "/" or not self._token_ok(token):
                return self._deny()
            state.touch()
            nonce = secrets.token_urlsafe(12)
            body = page_html.replace("{{NONCE}}", nonce).encode("utf-8")
            csp = (f"default-src 'none'; script-src 'nonce-{nonce}'; "
                   f"style-src 'nonce-{nonce}'; connect-src 'self'; img-src 'self' blob:")
            self._send(200, body, "text/html; charset=utf-8", {"Content-Security-Policy": csp})

        def do_POST(self):
            if urlparse(self.path).path != "/upload" or not self._token_ok(self.headers.get("X-Token")):
                return self._deny()
            try:
                length = int(self.headers.get("Content-Length", ""))
            except ValueError:
                return self._send(411, b"length required", "text/plain; charset=utf-8")
            if length <= 0 or length > MAX_FILE_BYTES:
                return self._send(413, b"too large", "text/plain; charset=utf-8")
            name = safe_name(unquote(self.headers.get("X-Filename", "")))
            if name is None:
                return self._send(415, "この種類のファイルは受け取れません".encode(), "text/plain; charset=utf-8")

            with state.lock:
                path, f = open_unique(state.save_dir, name)
            remaining = length
            try:
                with f:
                    while remaining > 0:
                        data = self.rfile.read(min(CHUNK, remaining))
                        if not data:
                            raise ConnectionError("途中で切断されました")
                        f.write(data)
                        remaining -= len(data)
                        state.touch()
            except Exception as e:
                path.unlink(missing_ok=True)
                print(f"  ! 失敗: {name} ({e})")
                self.close_connection = True
                return

            with state.lock:
                state.received += 1
            print(f"  ✓ 受信: {path.name} ({length / 1024 / 1024:.1f} MB)")
            self._send(200, path.name.encode("utf-8"), "text/plain; charset=utf-8")

    return Handler


def show_qr(url: str, idle_min: int) -> Path:
    """QR コードを載せた一時 HTML を作って、PC のブラウザで開く。"""
    svg = segno.make(url, error="m").svg_inline(scale=8, border=2)
    html = f"""<!doctype html><meta charset="utf-8"><title>phone-drop</title>
<style>body{{font-family:system-ui,sans-serif;text-align:center;padding:40px;background:#fff;color:#222}}
p{{color:#555}}</style>
<h1>iPhone のカメラで読み取ってください</h1>{svg}
<p>{idle_min}分間なにも送られてこなければ自動で終了します。<br>
このページはほかの人に見せないでください（QR が合言葉の代わりです）。</p>"""
    fd, path = tempfile.mkstemp(prefix="phone-drop-", suffix=".html")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(html)
    webbrowser.open(Path(path).as_uri())
    return Path(path)


def main():
    # コンソールやリダイレクト先が cp932 でも、日本語と QR の記号を出せるようにする
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    default_dir = Path.home() / "Pictures" / "iPhone受信"
    ap = argparse.ArgumentParser(description="iPhone から写真を受け取る")
    ap.add_argument("--dir", type=Path, default=default_dir, help=f"保存先（既定: {default_dir}）")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--minutes", type=int, default=10, help="この分数なにもなければ自動終了（既定: 10）")
    ap.add_argument("--no-browser", action="store_true", help="QR をブラウザで開かない")
    args = ap.parse_args()

    args.dir.mkdir(parents=True, exist_ok=True)
    ip = lan_ip()
    token = secrets.token_urlsafe(16)
    state = State(token, args.dir.resolve(), args.minutes * 60)
    page_html = PAGE_PATH.read_text(encoding="utf-8")

    server = ThreadingHTTPServer((ip, args.port), make_handler(state, page_html))
    url = f"http://{ip}:{args.port}/?t={token}"

    def watchdog():
        while True:
            time.sleep(5)
            if time.monotonic() - state.last_activity > state.idle_sec:
                print(f"\n{args.minutes}分間なにもなかったので終了します。")
                server.shutdown()
                return

    threading.Thread(target=watchdog, daemon=True).start()

    print("phone-drop を起動しました")
    print(f"  保存先: {state.save_dir}")
    print(f"  URL   : {url}")
    print(f"  {args.minutes}分間なにもなければ自動で終了します（今すぐ止めるなら Ctrl+C）\n")

    qr_file = None
    if not args.no_browser:
        qr_file = show_qr(url, args.minutes)
    else:
        segno.make(url).terminal(compact=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n終了します。")
    finally:
        server.server_close()
        if qr_file:
            time.sleep(0.5)
            qr_file.unlink(missing_ok=True)
        print(f"受け取った数: {state.received}")
        if state.received:
            os.startfile(state.save_dir)


if __name__ == "__main__":
    sys.exit(main())
