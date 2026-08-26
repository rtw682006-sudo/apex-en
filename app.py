"""
APEX — English mirror, deployable on Vercel.

Same idea as the local serve_en.py: every request is fetched from the live
Tilda site, the Russian strings are swapped for English in the browser, and
Tilda's store API is proxied so it accepts the calls.

Local run:  pip install flask && python3 app.py   → http://localhost:8000
Deploy:     vercel  (see README)
"""

import json
import os
import ssl
import urllib.error
import urllib.request

from flask import Flask, Response, request

UPSTREAM = os.environ.get("APEX_UPSTREAM", "https://apexhooka.ru")
HERE = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)

# ---------------------------------------------------------------- translation
DICT = {}
for name in ("translations.json", "translations_legal.json"):
    path = os.path.join(HERE, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            DICT.update(json.load(fh))

with open(os.path.join(HERE, "translate.js"), encoding="utf-8") as fh:
    CLIENT_JS = fh.read().replace("/*__DICT__*/", json.dumps(DICT, ensure_ascii=False))

INJECT = b'<script src="/__apex_en.js" defer></script>'

# Tilda's store API answers "ERROR:The Catalog is configured for another domain"
# unless the call comes from the site's own domain, so those calls are routed
# through this proxy, which presents the original Referer/Origin.
API_HOSTS = ("store.tildaapi.one", "stat.tildaapi.one", "store.tildacdn.com",
             "forms.tildaapi.one")
API_PREFIX = "/__tapi/"

NET_SHIM = b"""<script>(function(){var P='/__tapi/';var HOSTS=['store.tildaapi.one','stat.tildaapi.one','store.tildacdn.com','forms.tildaapi.one'];
function rw(u){if(typeof u!=='string')return u;for(var i=0;i<HOSTS.length;i++){var h=HOSTS[i];var a='https://'+h+'/',b='http://'+h+'/';if(u.indexOf(a)===0)return P+h+'/'+u.slice(a.length);if(u.indexOf(b)===0)return P+h+'/'+u.slice(b.length);}return u}
var O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=rw(u);return O.apply(this,arguments)};
var F=window.fetch;if(F)window.fetch=function(i,o){try{if(typeof i==='string')i=rw(i);else if(i&&i.url&&rw(i.url)!==i.url)i=new Request(rw(i.url),i);}catch(e){}return F.call(this,i,o)};})();</script>"""

SKIP_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-encoding",
    "content-length", "content-security-policy",
    "content-security-policy-report-only", "strict-transport-security",
}


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


SSL_CTX = _ssl_context()


@app.route("/__apex_en.js")
def translation_script():
    return Response(CLIENT_JS, mimetype="application/javascript",
                    headers={"Cache-Control": "no-store"})


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "HEAD"])
@app.route("/<path:path>", methods=["GET", "POST", "HEAD"])
def proxy(path):
    full_path = "/" + path
    query = request.query_string.decode()

    if full_path.startswith(API_PREFIX):
        rest = full_path[len(API_PREFIX):]
        host, _, tail = rest.partition("/")
        if host not in API_HOSTS:
            return Response("host not allowed", status=403)
        url = "https://" + host + "/" + tail
        is_api = True
    else:
        url = UPSTREAM + full_path
        is_api = False
    if query:
        url += "?" + query

    body = request.get_data() if request.method == "POST" else None
    req = urllib.request.Request(url, data=body, method=request.method)
    req.add_header("User-Agent", request.headers.get("User-Agent", "Mozilla/5.0"))
    req.add_header("Accept", request.headers.get("Accept", "*/*"))
    req.add_header("Accept-Language", "ru-RU,ru;q=0.9")
    req.add_header("Referer", UPSTREAM + "/")
    req.add_header("Origin", UPSTREAM)
    if request.method == "POST" and request.headers.get("Content-Type"):
        req.add_header("Content-Type", request.headers["Content-Type"])

    try:
        resp = urllib.request.urlopen(req, timeout=25, context=SSL_CTX)
        status, headers, data = resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e:
        status, headers, data = e.code, e.headers, e.read()
    except Exception as e:                                     # upstream down
        return Response("Upstream error: %s" % e, status=502,
                        mimetype="text/plain")

    ctype = headers.get("Content-Type", "")

    out_headers = {}
    for key, value in headers.items():
        if key.lower() in SKIP_HEADERS:
            continue
        if key.lower() == "location":
            value = value.replace(UPSTREAM, "")
        out_headers[key] = value

    if is_api:
        out_headers["Access-Control-Allow-Origin"] = "*"
        return Response(data, status=status,
                        mimetype=ctype or "application/json",
                        headers=out_headers)

    if "text/html" in ctype:
        data = data.replace(b"https://apexhooka.ru", b"")
        data = data.replace(b"http://apexhooka.ru", b"")

        low = data.lower()
        i = low.find(b"<head")
        if i != -1:
            j = data.find(b">", i)
            if j != -1:
                data = data[:j + 1] + NET_SHIM + data[j + 1:]
        else:
            data = NET_SHIM + data

        if b"</body>" in data:
            data = data.replace(b"</body>", INJECT + b"</body>", 1)
        else:
            data += INJECT

        # a mirror must never compete with the real site in search results
        out_headers["X-Robots-Tag"] = "noindex, nofollow"

    return Response(data, status=status, headers=out_headers)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
