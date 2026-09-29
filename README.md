# Diamond Sim — an MLB history simulator

Replay any MLB game, postseason or season since 1901 with real players, real ballparks and real managers' choices —
or build your own league from any team-seasons in history. Runs entirely in the browser; the data is built from
[Retrosheet](https://www.retrosheet.org).

```
python3 -m http.server 8000      # from the repo root
open http://localhost:8000
```

(The page needs to be served over HTTP; opening `index.html` from disk blocks the data files.)

## Use it on your iPhone (installable web app)

The app is a PWA: on iPhone it installs to the Home Screen, runs full-screen and keeps every season you've opened
available offline. It needs an HTTPS address, and the simplest way is GitHub Pages:

1. Merge this branch into `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The included workflow
   (`.github/workflows/pages.yml`) publishes the site on every push to `main`.
3. On the iPhone open `https://<your-user>.github.io/MLB-simulator/` in **Safari** → Share → **Add to Home Screen**.

No hosting? On the same Wi-Fi run `python3 -m http.server 8000 --bind 0.0.0.0` on your computer and open
`http://<computer-ip>:8000` on the phone (works, but offline caching needs HTTPS).

## Modes

1. **Play any game** — pick any game from 1901–2025 (regular season, postseason, All-Star). You get the *as-played*
   lineups and starting pitchers, the roster the team used around that date, and the real bullpen usage and
   substitutions (pinch-hitters, pinch-runners, defensive changes) next to your replay. Play it with the real
   substitutions, with an auto-manager, or make the moves yourself.
2. **Replay a postseason** — every series in any postseason, using each team's real postseason lineups and starting
   pitchers. Replay one series or the whole October. If a different team wins, the next round is re-seeded with your
   winner and you keep playing.
3. **Season mode** — replay any season on its real schedule with standings, leaders, team pages, live games and playoffs
   in that year's real format (editable).
5. **Live 2026 season** — follows the real season through the MLB Stats API (fetched by your browser): real schedule
   and scores, probable pitchers, active rosters, and season-to-date stats blended with last season's batted-ball
   tendencies. Play or quick-sim any real game before or after it happens (posted lineups are used when MLB has them),
   see how your sims compare with what really happened, and project the rest of the season and playoff odds. If the API
   can't be reached it falls back to the bundled schedule and last season's ratings.
4. **Custom league & tournament** — mix any team-seasons (1927 Yankees vs. 2001 Mariners…), set leagues, divisions,
   schedule length and playoff format, or run an elimination tournament.

## Saved games, stats and sign-in

* **Every game is remembered.** Any game you play or sim, in any mode, is saved on your device (IndexedDB) with its full
  box score and play-by-play. Player stats (batting and pitching, regular season and postseason separately),
  leaders, per-player game logs and a box-score/play-by-play viewer live under **Stats & logs**. You can export and
  import backups as JSON.
* **Live 2026 postseason.** The Live tab has a Postseason bracket: real MLB series and results wherever MLB has set them
  (probable pitchers, current rosters via Refresh), a projected 12-team bracket from the standings until then. Play or
  sim any series; your winners carry forward, and your simmed series are rebuilt from the archive after a reload.
* **Google / Apple sign-in and sync** are built in but need your own free Firebase project (only you can create the
  Apple/Google credentials): see `docs/SETUP_LOGIN.md`. Without it everything still works, locally.

## Strategy and animation

During a game you can call a sacrifice bunt, steal, hit-and-run, intentional walk, infield in, or hold the runners.
For the auto-manager you can set steal aggressiveness, bunting, intentional walks, infield-in situations and the
starter's leash. Every plate appearance is animated (pitch, ball flight to the fielder or over the fence, runners
moving) with Full / Quick / Off speed.

## How the simulation works

* **Plate appearance.** Each batter/pitcher has real outcome rates — K, BB, HBP, 1B, 2B, 3B, HR, in-play out (the
  components of wOBA) — lightly regressed toward the league for tiny samples and neutralized for the parks they
  played in. Batter and pitcher are combined with the league environment using the odds-ratio (log5) method (or a
  straight average, selectable), then adjusted for park, platoon (L/R) and pitcher fatigue.
* **Batted balls.** Each ball in play gets a type (GB/LD/FB) and a field zone. The batter's pull/center/oppo tendency
  (relative to his batting side) and both players' GB/LD/FB mix tilt real league distributions.
* **Baserunning.** Where runners end up (extra bases, sac flies, double plays, errors, outs on the bases) is sampled
  from empirical transition tables built from real plays with the same event, batted-ball type/zone, bases and outs
  in the same era. Steal attempts follow each runner's real rates; wild pitches, balks, pickoffs from real rates.
* **Park factors.** Home/road split ratios per park (3-season window, regressed), per outcome (1B/2B/3B/HR).
* **Managers.** Auto-manager: pulls tiring starters, closer in save spots, pinch-hits for pitchers in non-DH games.
  Season mode rests part-timers at their real start rates, respects real availability windows (injuries, call-ups,
  trades), starter rest days and reliever fatigue.

Notes on live data: the MLB Stats API is not part of this repo and was not reachable from the environment this app
was built in, so the live fetch is implemented against the API's documented format and tested against a mock server
(`test/mlbfixture.mjs`). If MLB changes a field, the header shows a "data notes" list of what failed.

Calibration check (`node test/calib.mjs 2019`): simulated 2019 = 9.73 runs/game vs. 9.66 actual; K/BB/HR/H rates
within ~3%; team run totals correlate 0.79 (2019) / 0.93 (1927) with reality.

## Data

`data/` is generated by `tools/build_data.py` from the Retrosheet event files, box scores and game logs:

```
git clone --depth 1 https://github.com/chadwickbureau/retrosheet.git
python3 tools/build_data.py --retrosheet ./retrosheet --years 1901-2025 --jobs 4
```

* `data/seasons/YYYY.json.gz` — player rates, park factors, league baselines, every game's as-played lineups,
  substitutions and pitcher lines, postseason series.
* `data/global.json.gz` — batted-ball and base-runner transition tables, running-event rates, platoon splits.
* `data/index.json` — season/team/postseason index loaded on start.
* `data/idmap.json.gz`, `data/live/2026schedule.json.gz` — built by `tools/build_live_data.py` (MLB↔Retrosheet player ids from the
  Chadwick register; the 2026 schedule).

Caveats: Retrosheet has no daily roster feed, so the "roster that day" is reconstructed from players who appeared for
the team within two weeks of the game. Seasons before ~1908 are mostly box scores: substitution timing there is
estimated from innings played. Divisions for 1969+ are inferred from the schedule (teams that play each other most).

## Layout

```
index.html            app shell
web/js/data.js        data loading, era tables, player rating builder
web/js/engine.js      game simulation (PA model, batted balls, baserunning, managers)
web/js/teams.js       team/roster builders (auto, as-played, availability windows)
web/js/league.js      leagues, schedules, series, brackets
web/js/post.js        historic postseason + playoff seeding
web/js/live.js        MLB Stats API client, live-season builder, projections
web/js/ui/*           the modes, the live game viewer and the field animation
sw.js, manifest.webmanifest, web/icons   installable web app
tools/                Retrosheet parser and data builder
test/                 calibration and UI smoke tests
```

## Credits

The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may
contact Retrosheet at 20 Sunset Rd., Newark, DE 19711.
