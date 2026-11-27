# Local relay for README screenshots: lets the browser version of Whale read live data the way the desktop app does
# (same allowed hosts and user agents) and adds CORS headers. Listens on 127.0.0.1:5180 only. Run: python tools/relay.py
import http.server, urllib.request, urllib.parse, json

HOSTS = {"query1.finance.yahoo.com", "query2.finance.yahoo.com", "api.binance.com", "data-api.binance.vision", "api.frankfurter.dev",
         "efts.sec.gov", "data.sec.gov", "feeds.finance.yahoo.com", "news.google.com"}
SEC = {"efts.sec.gov", "data.sec.gov"}
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36 Whale"

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url = (q.get("url") or [""])[0]
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.hostname not in HOSTS:
            return self.reply(403, b"not allowed")
        ua = "Whale/0.5 (open-source trading journal)" if u.hostname in SEC else BROWSER
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=25) as r:
                self.reply(r.status, r.read())
        except urllib.error.HTTPError as e:
            self.reply(e.code, b"error")
        except Exception as e:
            self.reply(502, str(e).encode())
    def reply(self, code, body):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(("127.0.0.1", 5180), H).serve_forever()
