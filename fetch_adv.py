import os, urllib.request, gzip, time, json
OUT = "adv"; os.makedirs(OUT, exist_ok=True)
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Encoding": "gzip", "Accept": "*/*"}
def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=120) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return b
        except Exception as e:
            print("retry", url[:120], e); time.sleep(4 * (i + 1))
    return b""
FGB = "https://www.fangraphs.com/api/leaders/major-league/data?age=&pos=all&stats={s}&lg=all&qual=0&season={y}&season1={y}&startdate=&enddate=&month=0&hand=&team=0&pageitems=2000000&pagenum=1&ind=0&rost=0&players=&type=8&postseason=&sortdir=default&sortstat=WAR"
SVB = ("https://baseballsavant.mlb.com/leaderboard/custom?year={y}&type={t}&filter=&min=1&selections={sel}"
       "&chart=false&x=pa&y=pa&r=no&chartType=beeswarm&sort=pa&sortDir=desc&csv=true")
SEL_B = "pa,xba,xslg,woba,xwoba,exit_velocity_avg,launch_angle_avg,sweet_spot_percent,barrel_batted_rate,hard_hit_percent,whiff_percent,oz_swing_percent,sprint_speed"
SEL_P = "pa,p_era,xba,xslg,woba,xwoba,xera,exit_velocity_avg,launch_angle_avg,barrel_batted_rate,hard_hit_percent,whiff_percent,oz_swing_percent,groundballs_percent"
for y in range(2010, 2027):
    for s in ("bat", "pit"):
        open(f"{OUT}/fg_{s}_{y}.json", "wb").write(get(FGB.format(s=s, y=y)))
    if y >= 2015:
        open(f"{OUT}/sv_bat_{y}.csv", "wb").write(get(SVB.format(y=y, t="batter", sel=SEL_B)))
        open(f"{OUT}/sv_pit_{y}.csv", "wb").write(get(SVB.format(y=y, t="pitcher", sel=SEL_P)))
        for nm, url in {"oaa": f"https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&startYear={y}&endYear={y}&split=no&team=&range=year&min=0&pos=&roles=&viz=hide&csv=true",
                        "sprint": f"https://baseballsavant.mlb.com/leaderboard/sprint_speed?year={y}&position=&team=&min=0&csv=true"}.items():
            open(f"{OUT}/sv_{nm}_{y}.csv", "wb").write(get(url))
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(f"{OUT}/{f}"))
