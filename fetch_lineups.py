import json, os, time, urllib.request, gzip
from concurrent.futures import ThreadPoolExecutor
OUT = "data"; os.makedirs(OUT, exist_ok=True)
API = "https://statsapi.mlb.com/api/v1/"
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
sched = json.load(open(os.path.join(OUT, "schedule_2026.json")))
games = sorted({(d["date"], g["gamePk"]) for d in sched["dates"] for g in d["games"]
                if g["gameType"] == "R" and g["status"]["abstractGameState"] == "Final"})
print(len(games))
def one(dg):
    date, pk = dg
    b = get(f"{API}game/{pk}/boxscore")
    if not b: return {"pk": pk, "date": date, "err": 1}
    out = {"pk": pk, "date": date}
    for side in ("home", "away"):
        t = b["teams"][side]; pl = t.get("players", {})
        order = [[pid, pl.get(f"ID{pid}", {}).get("position", {}).get("abbreviation")] for pid in t.get("battingOrder", [])]
        pit = []
        for pid in t.get("pitchers", []):
            s = pl.get(f"ID{pid}", {}).get("stats", {}).get("pitching", {})
            pit.append([pid, s.get("outs", 0), s.get("battersFaced", 0), s.get("saves", 0), s.get("holds", 0)])
        out[side] = {"team": t["team"]["id"], "order": order, "pit": pit}
    return out
with ThreadPoolExecutor(16) as ex:
    res = list(ex.map(one, games))
json.dump(res, open(os.path.join(OUT, "lineups_2026.json"), "w"), separators=(",", ":"))
print("errors", sum(1 for r in res if r.get("err")))
