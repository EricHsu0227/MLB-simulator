#!/usr/bin/env python3
"""Build small helper files for the live-season mode.

  python3 tools/build_live_data.py --retrosheet path/to/retrosheet --register path/to/dir/with/people-*.csv --year 2026

Outputs:
  data/idmap.json.gz            MLBAM player id -> Retrosheet id (players active since 2016)
  data/live/<year>schedule.json.gz   [[yyyymmdd, gameNumber, visitor, home, parkId], ...] from Retrosheet's schedule
The Chadwick register (people-*.csv) is at https://github.com/chadwickbureau/register/tree/master/data
"""
import argparse, csv, glob, gzip, json, os

ap = argparse.ArgumentParser()
ap.add_argument('--retrosheet', required=True)
ap.add_argument('--register', required=True)
ap.add_argument('--year', type=int, default=2026)
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
a = ap.parse_args()

idmap = {}
for p in sorted(glob.glob(os.path.join(a.register, 'people-*.csv'))):
    with open(p, encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            m, rt = r.get('key_mlbam'), r.get('key_retro')
            last = r.get('mlb_played_last') or ''
            if m and rt and last.isdigit() and int(last) >= 2016:
                idmap[m] = rt
os.makedirs(os.path.join(a.out, 'live'), exist_ok=True)
with gzip.open(os.path.join(a.out, 'idmap.json.gz'), 'wt') as f:
    json.dump(idmap, f, separators=(',', ':'))
print('idmap', len(idmap))

sched = []
path = os.path.join(a.retrosheet, 'seasons', str(a.year), '%dSCHEDULE.CSV' % a.year)
if os.path.exists(path):
    with open(path, encoding='latin-1', newline='') as f:
        for r in list(csv.reader(f))[1:]:
            if len(r) >= 11:
                sched.append([int(r[0]), int(r[1] or 0), r[3], r[6], r[10]])
    with gzip.open(os.path.join(a.out, 'live', '%dschedule.json.gz' % a.year), 'wt') as f:
        json.dump(sched, f, separators=(',', ':'))
print('schedule', len(sched))
