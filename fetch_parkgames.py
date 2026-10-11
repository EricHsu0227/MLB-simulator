import json, os, time, urllib.request, gzip
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
for yr in (2024, 2025, 2026):
    sc = get(f"{API}schedule?sportId=1&season={yr}&gameType=R&startDate={yr}-03-01&endDate={yr}-10-15&hydrate=venue")
    games = [(g["gamePk"], g["venue"]["id"], g["venue"]["name"], g["teams"]["home"]["team"]["id"]) for d in sc["dates"] for g in d["games"]
             if g["status"]["abstractGameState"] == "Final"]
    games = list({g[0]: g for g in games}.values())
    def one(g):
        pk, vid, vname, home = g
        b = get(f"{API}game/{pk}/boxscore")
        if not b: return None
        rows = []
        for side in ("home", "away"):
            t = b["teams"][side]
            for pid in t.get("batters", []):
                st = t["players"].get(f"ID{pid}", {}).get("stats", {}).get("batting", {})
                if not st or not st.get("plateAppearances"): continue
                rows.append([side == "home", pid, st.get("plateAppearances", 0), st.get("hits", 0), st.get("doubles", 0), st.get("triples", 0), st.get("homeRuns", 0), st.get("strikeOuts", 0), st.get("baseOnBalls", 0)])
        return {"pk": pk, "venue": vid, "vname": vname, "home": home, "away": b["teams"]["away"]["team"]["id"], "rows": rows}
    with ThreadPoolExecutor(16) as ex:
        res = [r for r in ex.map(one, games) if r]
    json.dump(res, open(os.path.join(OUT, f"parkgames_{yr}.json"), "w"), separators=(",", ":"))
    print(yr, len(games), len(res))
