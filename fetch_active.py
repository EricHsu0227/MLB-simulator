import json, os, time, urllib.request, gzip, datetime
from concurrent.futures import ThreadPoolExecutor
OUT = "data"; API = "https://statsapi.mlb.com/api/v1/"
def get(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return json.loads(b)
        except Exception:
            time.sleep(2 * (i + 1))
    return None
teams = [t["id"] for t in get(API + "teams?sportId=1&season=2026")["teams"]]
d0, d1 = datetime.date(2026, 3, 25), datetime.date(2026, 10, 20)
dates = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
jobs = [(t, d) for t in teams for d in dates]
def one(j):
    t, d = j
    r = get(f"{API}teams/{t}/roster?rosterType=active&date={d}&fields=roster,person,id")
    return t, d, [p["person"]["id"] for p in (r or {}).get("roster", [])] if r else None
with ThreadPoolExecutor(24) as ex:
    res = list(ex.map(one, jobs))
out = {}
for t, d, ids in res:
    if ids is None: continue
    for pid in ids: out.setdefault(str(t), {}).setdefault(str(pid), []).append(d)
json.dump(out, open(os.path.join(OUT, "active_days_2026.json"), "w"), separators=(",", ":"))
print("missing", sum(1 for r in res if r[2] is None))
