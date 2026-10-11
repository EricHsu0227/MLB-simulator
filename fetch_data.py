import json, os, sys, time, urllib.request, urllib.parse, gzip, io

OUT = sys.argv[1] if len(sys.argv) > 1 else "data-2026"
os.makedirs(OUT, exist_ok=True)
API = "https://statsapi.mlb.com/api/v1/"
log = []

def get(url, raw=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=120) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    b = gzip.decompress(b)
                return b if raw else json.loads(b)
        except Exception as e:
            log.append(f"retry {i} {url}: {e}")
            time.sleep(3 * (i + 1))
    log.append(f"FAILED {url}")
    return None

def save(name, obj, raw=False):
    p = os.path.join(OUT, name)
    if raw:
        open(p, "wb").write(obj if obj else b"")
    else:
        json.dump(obj, open(p, "w"), separators=(",", ":"))

def api(path, **q):
    return get(API + path + "?" + urllib.parse.urlencode(q, safe=",[]()"))

teams = api("teams", sportId=1, season=2026)
save("teams_2026.json", teams)
team_ids = [t["id"] for t in teams["teams"]] if teams else []

for season in (2025, 2026):
    for group in ("hitting", "pitching"):
        save(f"{group}_season_{season}.json", api("stats", stats="season", group=group, season=season, playerPool="ALL", sportId=1, limit=5000))
        save(f"{group}_vlvr_{season}.json", api("stats", stats="statSplits", group=group, season=season, sitCodes="vl,vr", playerPool="ALL", sportId=1, limit=5000))
    save(f"hitting_risp_{season}.json", api("stats", stats="statSplits", group="hitting", season=season, sitCodes="risp", playerPool="ALL", sportId=1, limit=5000))
    save(f"pitching_innings_{season}.json", api("stats", stats="statSplits", group="pitching", season=season, sitCodes="i01,i07,i08,i09", playerPool="ALL", sportId=1, limit=5000))
    save(f"fielding_season_{season}.json", api("stats", stats="season", group="fielding", season=season, playerPool="ALL", sportId=1, limit=5000))
    # per team usage
    per = {}
    for tid in team_ids:
        per[tid] = {g: api("stats", stats="season", group=g, season=season, teamId=tid, playerPool="ALL", sportId=1, limit=500) for g in ("hitting", "pitching", "fielding")}
    save(f"team_stats_{season}.json", per)

# rosters 2026
sched = api("schedule", sportId=1, season=2026, gameType="R,F,D,L,W", startDate="2026-03-01", endDate="2026-11-30")
save("schedule_2026.json", sched)
last_reg, last_post = {}, {}
if sched:
    for d in sched.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("abstractGameState") != "Final" and g.get("gameType") == "R":
                continue
            for side in ("home", "away"):
                tid = g["teams"][side]["team"]["id"]
                tgt = last_reg if g["gameType"] == "R" else last_post
                tgt[tid] = max(tgt.get(tid, ""), d["date"])
rost = {}
for tid in team_ids:
    r = {"fullSeason": api(f"teams/{tid}/roster", rosterType="fullSeason", season=2026),
         "40Man": api(f"teams/{tid}/roster", rosterType="40Man", season=2026)}
    if tid in last_reg:
        r["active_end_reg"] = api(f"teams/{tid}/roster", rosterType="active", date=last_reg[tid])
        r["end_reg_date"] = last_reg[tid]
    if tid in last_post:
        r["active_post"] = api(f"teams/{tid}/roster", rosterType="active", date=last_post[tid])
        r["post_date"] = last_post[tid]
    rost[tid] = r
save("rosters_2026.json", rost)

# people (handedness etc.)
ids = set()
for season in (2025, 2026):
    for g in ("hitting", "pitching"):
        try:
            for s in json.load(open(os.path.join(OUT, f"{g}_season_{season}.json")))["stats"][0]["splits"]:
                ids.add(s["player"]["id"])
        except Exception as e:
            log.append(f"ids {e}")
for r in rost.values():
    for k in ("fullSeason", "40Man"):
        for p in ((r.get(k) or {}).get("roster") or []):
            ids.add(p["person"]["id"])
ids = sorted(ids)
people = []
for i in range(0, len(ids), 150):
    res = api("people", personIds=",".join(map(str, ids[i:i+150])), hydrate="xrefId")
    if res:
        people += res.get("people", [])
save("people.json", people)

# Baseball Savant leaderboards (CSV)
SV = "https://baseballsavant.mlb.com/"
for season in (2025, 2026):
    for name, url in {
        "sprint": f"leaderboard/sprint_speed?year={season}&position=&team=&min=0&csv=true",
        "oaa": f"leaderboard/outs_above_average?type=Fielder&startYear={season}&endYear={season}&split=no&team=&range=year&min=0&pos=&roles=&viz=hide&csv=true",
        "arm": f"leaderboard/arm-strength?type=player&year={season}&minThrows=0&pos=&team=&csv=true",
        "poptime": f"leaderboard/poptime?year={season}&team=&min2b=0&min3b=0&csv=true",
        "battedball_b": f"leaderboard/batted-ball?gameType=Regular&year={season}&type=batter&min=1&csv=true",
        "battedball_p": f"leaderboard/batted-ball?gameType=Regular&year={season}&type=pitcher&min=1&csv=true",
        "framing": f"leaderboard/catcher-framing?type=catcher&seasonStart={season}&seasonEnd={season}&team=&min=0&sortColumn=rv_tot&sortDirection=desc&csv=true",
        "blocking": f"leaderboard/catcher-blocking?game_type=Regular&n=0&season_end={season}&season_start={season}&split=no&team=&type=Cat&with_team_only=1&csv=true",
        "baserunning": f"leaderboard/baserunning-run-value?game_type=Regular&n=0&season_end={season}&season_start={season}&split=no&team=&type=Batter&with_team_only=1&csv=true",
        "expected_b": f"leaderboard/expected_statistics?type=batter&year={season}&position=&team=&min=1&csv=true",
        "expected_p": f"leaderboard/expected_statistics?type=pitcher&year={season}&position=&team=&min=1&csv=true",
    }.items():
        save(f"savant_{name}_{season}.csv", get(SV + url, raw=True), raw=True)

open(os.path.join(OUT, "log.txt"), "w").write("\n".join(log))
print("\n".join(log[-50:]))
