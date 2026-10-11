import json, os, sys, time, urllib.request, urllib.parse, gzip, datetime, tarfile
from concurrent.futures import ThreadPoolExecutor
Y = int(sys.argv[1]); OUT = f"data_{Y}"; os.makedirs(OUT, exist_ok=True)
API = "https://statsapi.mlb.com/api/v1/"; log = []
def get(url, raw=False, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 Safari/537.36", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=90) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return b if raw else json.loads(b)
        except Exception as e:
            time.sleep(2 * (i + 1)); err = e
    log.append(f"FAILED {url} {err}"); return None
def api(path, **q): return get(API + path + "?" + urllib.parse.urlencode(q, safe=",[]()"))
def save(name, obj, raw=False):
    p = os.path.join(OUT, name)
    if raw: open(p, "wb").write(obj or b"")
    else: json.dump(obj, open(p, "w"), separators=(",", ":"))
teams = api("teams", sportId=1, season=Y); save("teams.json", teams)
tids = [t["id"] for t in teams["teams"]]
for g in ("hitting", "pitching"):
    save(f"{g}_season.json", api("stats", stats="season", group=g, season=Y, playerPool="ALL", sportId=1, limit=5000))
    save(f"{g}_vlvr.json", api("stats", stats="statSplits", group=g, season=Y, sitCodes="vl,vr", playerPool="ALL", sportId=1, limit=5000))
save("hitting_risp.json", api("stats", stats="statSplits", group="hitting", season=Y, sitCodes="risp", playerPool="ALL", sportId=1, limit=5000))
save("pitching_innings.json", api("stats", stats="statSplits", group="pitching", season=Y, sitCodes="i01,i07,i08,i09", playerPool="ALL", sportId=1, limit=5000))
save("fielding_season.json", api("stats", stats="season", group="fielding", season=Y, playerPool="ALL", sportId=1, limit=5000))
per = {}
for tid in tids:
    per[tid] = {g: api("stats", stats="season", group=g, season=Y, teamId=tid, playerPool="ALL", sportId=1, limit=500) for g in ("hitting", "pitching", "fielding")}
save("team_stats.json", per)
sched = api("schedule", sportId=1, season=Y, gameType="R,F,D,L,W", startDate=f"{Y}-02-15", endDate=f"{Y}-11-30", hydrate="linescore,weather,venue,decisions,probablePitcher")
save("schedule.json", sched)
games = []; last_reg = {}; last_post = {}; first_reg = None
for d in sched.get("dates", []):
    for g in d["games"]:
        if g["status"]["abstractGameState"] != "Final": continue
        games.append((d["date"], g["gamePk"], g["gameType"]))
        for side in ("home", "away"):
            tid = g["teams"][side]["team"]["id"]
            tgt = last_reg if g["gameType"] == "R" else last_post
            tgt[tid] = max(tgt.get(tid, ""), d["date"])
        if g["gameType"] == "R": first_reg = min(first_reg or d["date"], d["date"])
games = sorted(set(games))
def box(dg):
    date, pk, gt = dg
    b = get(f"{API}game/{pk}/boxscore")
    if not b: return {"pk": pk, "date": date, "gt": gt, "err": 1}
    out = {"pk": pk, "date": date, "gt": gt}
    for side in ("home", "away"):
        t = b["teams"][side]; pl = t.get("players", {})
        order = [[pid, pl.get(f"ID{pid}", {}).get("position", {}).get("abbreviation")] for pid in t.get("battingOrder", [])]
        pit = []
        for pid in t.get("pitchers", []):
            s = pl.get(f"ID{pid}", {}).get("stats", {}).get("pitching", {})
            pit.append([pid, s.get("outs", 0), s.get("battersFaced", 0), s.get("saves", 0), s.get("holds", 0)])
        bat = []
        for pid in t.get("batters", []):
            s = pl.get(f"ID{pid}", {}).get("stats", {}).get("batting", {})
            if s.get("plateAppearances"):
                bat.append([pid, s.get("plateAppearances", 0), s.get("hits", 0), s.get("doubles", 0), s.get("triples", 0), s.get("homeRuns", 0), s.get("strikeOuts", 0), s.get("baseOnBalls", 0)])
        out[side] = {"team": t["team"]["id"], "order": order, "pit": pit, "bat": bat}
    out["info"] = [x for x in b.get("info", []) if x.get("label") in ("Weather", "Wind", "Venue", "Att", "T")]
    return out
with ThreadPoolExecutor(16) as ex:
    bx = list(ex.map(box, games))
save("boxscores.json", bx)
rost = {}
for tid in tids:
    r = {"fullSeason": api(f"teams/{tid}/roster", rosterType="fullSeason", season=Y)}
    if tid in last_reg: r["active_end_reg"] = api(f"teams/{tid}/roster", rosterType="active", date=last_reg[tid]); r["end_reg_date"] = last_reg[tid]
    if tid in last_post: r["active_post"] = api(f"teams/{tid}/roster", rosterType="active", date=last_post[tid]); r["post_date"] = last_post[tid]
    rost[tid] = r
save("rosters.json", rost)
# daily active rosters
if first_reg:
    d0 = datetime.date.fromisoformat(first_reg) - datetime.timedelta(days=1)
    d1 = datetime.date.fromisoformat(max(list(last_post.values()) + list(last_reg.values())))
    dates = [(d0 + datetime.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    def one(j):
        t, d = j
        r = get(f"{API}teams/{t}/roster?rosterType=active&date={d}&fields=roster,person,id")
        return t, d, [p["person"]["id"] for p in (r or {}).get("roster", [])] if r else None
    with ThreadPoolExecutor(16) as ex:
        res = list(ex.map(one, [(t, d) for t in tids for d in dates]))
    act = {}
    for t, d, ids in res:
        for pid in ids or []: act.setdefault(str(t), {}).setdefault(str(pid), []).append(d)
    save("active_days.json", act)
ids = set()
for g in ("hitting", "pitching"):
    for s in json.load(open(os.path.join(OUT, f"{g}_season.json")))["stats"][0]["splits"]: ids.add(s["player"]["id"])
for r in rost.values():
    for p in ((r.get("fullSeason") or {}).get("roster") or []): ids.add(p["person"]["id"])
ids = sorted(ids); people = []
for i in range(0, len(ids), 150):
    res = api("people", personIds=",".join(map(str, ids[i:i + 150])), hydrate="xrefId")
    if res: people += res.get("people", [])
save("people.json", people)
save("venues.json", api("venues", sportId=1, season=Y, hydrate="fieldInfo,location"))
SV = "https://baseballsavant.mlb.com/"
if Y >= 2015:
    for name, url in {
        "sprint": f"leaderboard/sprint_speed?year={Y}&position=&team=&min=0&csv=true",
        "oaa": f"leaderboard/outs_above_average?type=Fielder&startYear={Y}&endYear={Y}&split=no&team=&range=year&min=0&pos=&roles=&viz=hide&csv=true",
        "arm": f"leaderboard/arm-strength?type=player&year={Y}&minThrows=0&pos=&team=&csv=true",
        "poptime": f"leaderboard/poptime?year={Y}&team=&min2b=0&min3b=0&csv=true",
        "battedball_b": f"leaderboard/batted-ball?gameType=Regular&year={Y}&type=batter&min=1&csv=true",
        "battedball_p": f"leaderboard/batted-ball?gameType=Regular&year={Y}&type=pitcher&min=1&csv=true",
        "framing": f"leaderboard/catcher-framing?type=catcher&seasonStart={Y}&seasonEnd={Y}&team=&min=0&sortColumn=rv_tot&sortDirection=desc&csv=true",
        "blocking": f"leaderboard/catcher-blocking?game_type=Regular&n=0&season_end={Y}&season_start={Y}&split=no&team=&type=Cat&with_team_only=1&csv=true",
        "baserunning": f"leaderboard/baserunning-run-value?game_type=Regular&n=0&season_end={Y}&season_start={Y}&split=no&team=&type=Batter&with_team_only=1&csv=true",
    }.items():
        save(f"savant_{name}.csv", get(SV + url, raw=True), raw=True)
open(os.path.join(OUT, "log.txt"), "w").write("\n".join(log))
with tarfile.open(f"season_{Y}.tar.gz", "w:gz") as tf: tf.add(OUT)
print(Y, "games", len(games), "fails", len(log))
