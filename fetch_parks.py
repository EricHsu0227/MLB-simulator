import os, urllib.request, gzip, time
OUT = "data"; os.makedirs(OUT, exist_ok=True)
def get(url):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=90) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return b
        except Exception as e:
            print("retry", url, e); time.sleep(3)
    return b""
for yr in (2024, 2025, 2026):
    for side in ("", "L", "R"):
        for roll in ("no", "yes"):
            u = f"https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=year&year={yr}&batSide={side}&stat=index_wOBA&condition=All&rolling={roll}"
            open(os.path.join(OUT, f"pf_{yr}_{side or 'A'}_{roll}.html"), "wb").write(get(u))
open(os.path.join(OUT, "venues_2026.json"), "wb").write(get("https://statsapi.mlb.com/api/v1/venues?sportId=1&season=2026&hydrate=fieldInfo,location"))
