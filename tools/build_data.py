#!/usr/bin/env python3
"""Build the simulator's data files from Retrosheet.

  git clone --depth 1 https://github.com/chadwickbureau/retrosheet.git
  python3 tools/build_data.py --retrosheet path/to/retrosheet [--years 1901-2025] [--jobs 4]

Outputs (in ./data):
  index.json          season list, teams, postseason series (small; loaded at start)
  global.json.gz      era tables: batted-ball joint tables, base-runner transition
                      tables, running-event rates, platoon factors, park names
  seasons/YYYY.json.gz  per-season player rates, park factors, league baselines,
                        every game's as-played lineups/subs/pitcher usage

Retrosheet notice: The information used here was obtained free of charge from
and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at
www.retrosheet.org.
"""
import argparse
import collections
import csv
import glob
import gzip
import itertools
import json
import os
import pickle
import random
import re
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rsparse as R  # noqa: E402

ERAS = [(1901, 1919), (1920, 1945), (1946, 1968), (1969, 1992), (1993, 2019), (2020, 2100)]
ROUND_FILES = {'WS': 'GLWS.TXT', 'LC': 'GLLC.TXT', 'DV': 'GLDV.TXT', 'WC': 'GLWC.TXT', 'AS': 'GLAS.TXT'}
EVN = R.EV_NAMES


def era_of(y):
    for i, (a, b) in enumerate(ERAS):
        if a <= y <= b:
            return i
    return len(ERAS) - 1


def read_lines(path):
    with open(path, encoding='latin-1') as f:
        return f.readlines()


def split_games(lines):
    cur = []
    for ln in lines:
        if ln.startswith('id,'):
            if cur:
                yield cur
            cur = [ln]
        else:
            cur.append(ln)
    if cur:
        yield cur


def glob_ci(pattern):
    return glob.glob(pattern)


# ---------------------------------------------------------------- gamelogs
def gl_game(row, typ):
    def f(i):
        return row[i] if i < len(row) else ''
    g = {
        'date': int(f(0)), 'num': int(f(1) or 0), 'vis': f(3), 'vlg': f(4), 'home': f(6), 'hlg': f(7),
        'vs': int(f(9) or 0), 'hs': int(f(10) or 0), 'outs': int(f(11) or 0), 'park': f(16),
        'wp': f(93), 'lp': f(95), 'sv': f(97),
        'vsp': f(101), 'hsp': f(103),
        'vstart': [(f(105 + 3 * i), int(f(107 + 3 * i) or 0)) for i in range(9)],
        'hstart': [(f(132 + 3 * i), int(f(134 + 3 * i) or 0)) for i in range(9)],
        'type': typ,
    }
    g['names'] = {}
    for i in range(9):
        g['names'][f(105 + 3 * i)] = f(106 + 3 * i)
        g['names'][f(132 + 3 * i)] = f(133 + 3 * i)
    g['names'][g['vsp']] = f(102)
    g['names'][g['hsp']] = f(104)
    return g


def load_master(rs, year):
    games = []
    d = os.path.join(rs, 'seasons', str(year))
    p = glob_ci(os.path.join(d, '[Gg][Ll]%d.[Tt][Xx][Tt]' % year))
    if p:
        for row in csv.reader(read_lines(p[0])):
            if row:
                games.append(gl_game(row, 'R'))
    for typ, fn in ROUND_FILES.items():
        path = os.path.join(rs, 'gamelog', fn)
        if not os.path.exists(path):
            continue
        for row in csv.reader(read_lines(path)):
            if row and row[0].startswith(str(year)):
                games.append(gl_game(row, typ))
    return games


def load_teams(rs, year):
    d = os.path.join(rs, 'seasons', str(year))
    teams = {}
    p = os.path.join(d, 'TEAM%d' % year)
    if os.path.exists(p):
        for row in csv.reader(read_lines(p)):
            if len(row) >= 4:
                teams[row[0]] = {'lg': {'A': 'AL', 'N': 'NL', 'F': 'FL'}.get(row[1], row[1]), 'n': (row[2] + ' ' + row[3]).strip()}
    return teams


def load_rosters(rs, year):
    d = os.path.join(rs, 'seasons', str(year))
    hands = {}
    for p in glob.glob(os.path.join(d, '*%d.ROS' % year)):
        for row in csv.reader(read_lines(p)):
            if len(row) >= 5:
                hands[row[0]] = (row[2] + ' ' + row[1], row[3] or 'R', row[4] or 'R')
    return hands


# ---------------------------------------------------------------- box scores
def si(x):
    m = re.match(r'-?\d+', x)
    return int(m.group()) if m else 0


def parse_box(lines):
    info = {}
    starts = []
    bl = collections.defaultdict(list)   # (team, slot) -> [(seq, pid, vals)]
    dl = collections.defaultdict(list)   # (team, pid) -> [(pos, outs)]
    pl = collections.defaultdict(list)   # team -> [(seq, pid, vals)]
    names = {}
    gid = None
    for raw in lines:
        f = R.csv_split(raw.rstrip('\r\n'))
        t = f[0]
        if t == 'id':
            gid = f[1]
        elif t == 'info':
            info[f[1]] = f[2] if len(f) > 2 else ''
        elif t == 'start':
            starts.append((f[1], si(f[3]), si(f[4]), si(f[5])))
            names[f[1]] = f[2]
        elif t == 'stat' and f[1] == 'bline':
            v = [si(x) for x in f[3:]]
            bl[(v[0], v[1])].append((v[2], f[2], v[3:]))
        elif t == 'stat' and f[1] == 'dline':
            v = [si(x) for x in f[3:]]
            dl[(v[0], f[2])].append((v[2], v[3], v[1]))
        elif t == 'stat' and f[1] == 'pline':
            v = [si(x) for x in f[3:]]
            pl[v[0]].append((v[1], f[2], v[2:]))
    return {'id': gid, 'info': info, 'starts': starts, 'bl': bl, 'dl': dl, 'pl': pl, 'names': names}


def box_subs(b):
    subs = []
    for (team, slot), lst in b['bl'].items():
        lst.sort()
        cum = 0
        prev_def = 0
        for i, (seq, pid, vals) in enumerate(lst):
            d = sorted(b['dl'].get((team, pid), []), key=lambda x: x[0])
            if i > 0:
                pos = d[0][1] if d else 11
                x = prev_def // 3
                if d:
                    inn, half = x + 1, (0 if team == 1 else 1)
                else:
                    inn, half = (x + 1, 0) if team == 0 else (max(1, x), 1)
                subs.append({'pid': pid, 'team': team, 'slot': slot, 'pos': pos, 'inn': inn, 'half': half, 'pa': 0})
            if d:
                prev_def += sum(x_[2] for x_ in d)
    # pitchers by pline order
    for team, lst in b['pl'].items():
        lst.sort()
        cum = 0
        for i, (seq, pid, vals) in enumerate(lst):
            if i > 0:
                subs.append({'pid': pid, 'team': team, 'slot': -1, 'pos': 1,
                             'inn': cum // 3 + 1, 'half': 0 if team == 1 else 1, 'pa': (cum % 3) * 2})
            cum += vals[0]
    # drop batting-slot subs for pitchers already covered by pline
    pit_ids = {(t, pid) for t, l in b['pl'].items() for _, pid, _ in l}
    subs = [s for s in subs if not (s['slot'] >= 0 and s['pos'] != 1 and (s['team'], s['pid']) in pit_ids) and not (s['pos'] == 1 and s['slot'] >= 0 and (s['team'], s['pid']) in pit_ids)]
    for s in subs:
        if s['slot'] == -1:
            s['slot'] = 0
    subs.sort(key=lambda s: (s['inn'], s['half'], s['pa']))
    return subs


# ---------------------------------------------------------------- accumulators
NB = 19   # batter row length
NP = 22   # pitcher row length


def side_of(bats, throws):
    if bats == 'L':
        return 'L'
    if bats == 'B':
        return 'L' if throws != 'L' else 'R'
    return 'R'


def dir_of(zone, side):
    if not zone:
        return None
    pull, opp = ((5, 7), (3, 9)) if side == 'R' else ((3, 9), (5, 7))
    if zone in pull:
        return 0
    if zone in opp:
        return 2
    return 1


class Acc:
    def __init__(self):
        self.bat = {}
        self.batp = {}
        self.pit = {}
        self.bpark = collections.defaultdict(collections.Counter)
        self.ppark = collections.defaultdict(collections.Counter)
        self.lg = {}
        self.teamHR = collections.defaultdict(lambda: {'H': [0] * 9, 'R': [0] * 9, 'site': collections.Counter()})
        self.joint = collections.Counter()
        self.hrz = collections.Counter()
        self.tr = collections.defaultdict(collections.Counter)
        self.runexp = collections.Counter()
        self.runev = collections.Counter()
        self.runvec = collections.defaultdict(collections.Counter)
        self.plat = collections.Counter()
        self.gpit = collections.defaultdict(lambda: {'gs': set(), 'g': set()})
        self.bsplit = {}      # batter id -> {'L': [9], 'R': [9]}  (by pitcher throwing hand)
        self.psplit = {}      # pitcher id -> {'L': [9], 'R': [9]}  (by batter's effective side)
        self.pteam = collections.defaultdict(collections.Counter)

    def lgrec(self, lg):
        r = self.lg.get(lg)
        if r is None:
            r = self.lg[lg] = {'bat': [0] * 9, 'batP': [0] * 9, 'pit': [0] * 9, 'typ': [0, 0, 0],
                               'dirR': [0, 0, 0], 'dirL': [0, 0, 0]}
        return r


def brow(d, pid):
    r = d.get(pid)
    if r is None:
        r = d[pid] = [0] * NB
    return r


def prow(d, pid):
    r = d.get(pid)
    if r is None:
        r = d[pid] = [0] * NP
    return r


TYPI = {'G': 0, 'L': 1, 'F': 2}


def process_game_events(g, m, acc, hands, tlg, era):
    """Accumulate stats from one parsed PBP game. Returns per-pitcher game lines."""
    site = g.info.get('site', m['park'])
    vis, home = m['vis'], m['home']
    plines = collections.OrderedDict()   # (team,pid) -> dict
    def pl(team, pid):
        k = (team, pid)
        if k not in plines:
            plines[k] = {'outs': 0, 'bf': 0, 'h': 0, 'r': 0, 'bb': 0, 'k': 0, 'inn': 0, 'first': None}
        return plines[k]
    # starters
    for pid, team, slot, pos in g.starts:
        if pos == 1:
            p = pl(team, pid)
            p['inn'] = 1
    seen_first = set()
    for e in g.plays:
        bteam = e['team']
        fteam = 1 - bteam
        bat_t = vis if bteam == 0 else home
        pit_t = home if bteam == 0 else vis
        blg = tlg.get(bat_t, {}).get('lg', 'AL')
        plg = tlg.get(pit_t, {}).get('lg', 'AL')
        pit = e['pit']
        bmask, outs0 = e['bmask'], e['outs0']
        if pit:
            p = pl(fteam, pit)
            if p['first'] is None:
                p['first'] = (e['inn'], bteam)
                if p['inn'] == 0:
                    p['inn'] = e['inn']
            p['outs'] += e['outs_add']
            for (rid, resp) in e['runs']:
                if resp:
                    pl(fteam, resp)['r'] += 1
        # exposures for running-event rates
        acc.runexp[(era, bmask, outs0)] += 1
        # steal opportunity for runner on 1st (2nd base open)
        if (bmask & 1) and not (bmask & 2):
            rid = e['bases_before'][1]
            if rid:
                brow(acc.bat, rid)[15] += 1
        if e['run']:
            kind = e['run']
            if kind == 'POCS':
                kind = 'CS'
            if kind in ('OA', 'DI'):
                kind = 'OA'
            acc.runev[(era, kind, bmask, outs0)] += 1
            acc.runvec[(era, kind, bmask, outs0)][e['vec']] += 1
            for k, tb in e['runk']:
                if k in ('SB', 'CS', 'POCS') and tb == '2':
                    rid = e['bases_before'][1]
                    if rid:
                        r = brow(acc.bat, rid)
                        r[16] += 1
                        if k == 'SB':
                            r[17] += 1
            continue
        for k, tb in e['secs']:
            if k in ('SB', 'CS', 'POCS') and tb == '2':
                rid = e['bases_before'][1]
                if rid:
                    r = brow(acc.bat, rid)
                    r[16] += 1
                    if k == 'SB':
                        r[17] += 1
        if e['kind'] == 'IBB':
            if pit:
                pass
            brow(acc.bat, e['bat'])[18] += 1
            continue
        if not e['is_pa']:
            continue
        ev = e['ev']
        isP = e['bpos'] == 1
        bid = e['bat']
        bats, throws_b = hands.get(bid, ('', 'R', 'R'))[1:3]
        pthrows = hands.get(pit, ('', 'R', 'R'))[2] if pit else 'R'
        side = side_of(bats, pthrows)
        row = brow(acc.batp if isP else acc.bat, bid)
        row[0] += 1
        row[1 + ev] += 1
        acc.pteam[bid][bat_t] += 1
        if not isP:
            sp_ = acc.bsplit.setdefault(bid, {'L': [0] * 9, 'R': [0] * 9})['L' if pthrows == 'L' else 'R']
            sp_[0] += 1
            sp_[1 + ev] += 1
        lgb = acc.lgrec(blg)
        lgp = acc.lgrec(plg)
        (lgb['batP'] if isP else lgb['bat'])[0] += 1
        (lgb['batP'] if isP else lgb['bat'])[1 + ev] += 1
        # team home/road counts (park factor)
        acc.teamHR[home]['H'][0] += 1
        acc.teamHR[home]['H'][1 + ev] += 1
        acc.teamHR[vis]['R'][0] += 1
        acc.teamHR[vis]['R'][1 + ev] += 1
        acc.bpark[(bid, isP)][site] += 1
        # pitcher
        if pit:
            pr = prow(acc.pit, pit)
            pr[15] += 1
            p = pl(fteam, pit)
            p['bf'] += 1
            if ev == R.EV_K:
                p['k'] += 1
            elif ev == R.EV_BB:
                p['bb'] += 1
            elif ev in (R.EV_1B, R.EV_2B, R.EV_3B, R.EV_HR):
                p['h'] += 1
            if not isP:
                pr[0] += 1
                pr[1 + ev] += 1
                ps_ = acc.psplit.setdefault(pit, {'L': [0] * 9, 'R': [0] * 9})[side]
                ps_[0] += 1
                ps_[1 + ev] += 1
                acc.pteam[('p', pit)][pit_t] += 1
                lgp['pit'][0] += 1
                lgp['pit'][1 + ev] += 1
                acc.ppark[pit][site] += 1
                acc.plat[(era, side, pthrows, ev)] += 1
        # batted ball
        typ, zone, lab = e['typ'], e['zone'], e['lab']
        if ev in (R.EV_1B, R.EV_2B, R.EV_3B, R.EV_OUT):
            if lab and typ:
                row[9 + TYPI[typ]] += 1
                lgb['typ'][TYPI[typ]] += 1
                if pit and not isP:
                    prow(acc.pit, pit)[9 + TYPI[typ]] += 1
                acc.joint[(era, side, EVN[ev], typ, zone)] += 1
            d = dir_of(zone, side)
            if d is not None and not e['bunt']:
                row[12 + d] += 1
                lgb['dirR' if side == 'R' else 'dirL'][d] += 1
        elif ev == R.EV_HR and zone:
            acc.hrz[(era, side, zone)] += 1
        # transition tables
        evk = EVN[ev]
        if ev in (R.EV_1B, R.EV_2B, R.EV_3B, R.EV_OUT):
            t = typ or '-'
            z = zone
            acc.tr[(era, evk, t, z, bmask, outs0)][e['vec']] += 1
            acc.tr[(era, evk, t, 0, bmask, outs0)][e['vec']] += 1
            acc.tr[(era, evk, '-', 0, bmask, outs0)][e['vec']] += 1
        else:
            acc.tr[(era, evk, '-', 0, bmask, outs0)][e['vec']] += 1
    return plines


def process_season(args):
    rs, year, work = args
    era = era_of(year)
    master = load_master(rs, year)
    tlg = load_teams(rs, year)
    hands = load_rosters(rs, year)
    acc = Acc()
    acc_tables_only = Acc()      # postseason/All-Star games: learn tables, but keep player & league rates regular-season only
    for nm in ('joint', 'hrz', 'tr', 'runexp', 'runev', 'runvec', 'plat'):
        setattr(acc_tables_only, nm, getattr(acc, nm))
    d = os.path.join(rs, 'seasons', str(year))
    by_key = {}
    for m in master:
        by_key[(m['date'], m['home'], m['num'])] = m
        # doubleheader 'number' may be 0 in gamelog for single games
    # play-by-play
    files = sorted(glob.glob(os.path.join(d, '%d*.EV?' % year)) + glob.glob(os.path.join(d, '%d*.ED?' % year)))
    seen = set()
    stats = {'pbp': 0, 'box': 0, 'gl': 0, 'err': 0}
    for path in files:
        for gl in split_games(read_lines(path)):
            first = gl[0].strip().split(',')
            gid = first[1]
            home = gid[:3]
            date = int(gid[3:11])
            num = int(gid[11])
            m = by_key.get((date, home, num))
            if m is None or m.get('src'):
                continue
            g = R.parse_game(gl)
            stats['err'] += g.errors
            if not g.plays:
                continue
            m['src'] = 'p'
            plines = process_game_events(g, m, acc if m['type'] == 'R' else acc_tables_only, hands, tlg, era)
            m['starts'] = g.starts
            m['subs'] = g.subs
            m['usedh'] = 1 if g.info.get('usedh') == 'true' else 0
            m['plines'] = plines
            m['ers'] = g.ers
            m['info'] = {k: g.info.get(k, '') for k in ('wp', 'lp', 'save', 'daynight', 'temp', 'attendance')}
            m['names'].update(g.names)
            # league counters for pitcher games
            stats['pbp'] += 1
    # box scores for games without pbp
    for path in glob.glob(os.path.join(d, '%d.EB?' % year)):
        for gl in split_games(read_lines(path)):
            b = parse_box(gl)
            gid = b['id']
            home = gid[:3]
            date = int(gid[3:11])
            num = int(gid[11])
            m = by_key.get((date, home, num))
            if m is None or m.get('src') or not b['starts']:
                continue
            m['src'] = 'b'
            reg = m['type'] == 'R'
            m['starts'] = b['starts']
            m['subs'] = box_subs(b)
            m['usedh'] = 1 if b['info'].get('usedh') == 'true' else 0
            m['names'].update(b['names'])
            m['info'] = {k: b['info'].get(k, '') for k in ('wp', 'lp', 'save', 'daynight', 'temp', 'attendance')}
            vis, home_ = m['vis'], m['home']
            plines = collections.OrderedDict()
            for team, lst in sorted(b['pl'].items()):
                lst.sort()
                cum = 0
                for seq, pid, v in lst:
                    outs, nob, bfp, h, d2, d3, hr, r, er, bb, ibb, k, hbp = v[:13]
                    outs = max(outs, 0)
                    plines[(team, pid)] = {'outs': outs, 'bf': max(bfp, 0), 'h': max(h, 0), 'r': max(r, 0), 'er': max(er, 0),
                                           'bb': max(bb, 0), 'k': max(k, 0), 'inn': cum // 3 + 1, 'first': None}
                    cum += outs
            m['plines'] = plines
            stats['box'] += 1
            # stats from box lines
            for (team, slot), lst in (b['bl'].items() if reg else []):
                bat_t = vis if team == 0 else home_
                blg = tlg.get(bat_t, {}).get('lg', 'AL')
                lgb = acc.lgrec(blg)
                for seq, pid, v in lst:
                    ab, r_, h, d2, d3, hr, rbi, sh, sf, hbp, bb, ibb, k, sb, cs, gdp = [max(x, 0) for x in v[:16]]
                    isP = (slot == 9 and False)
                    pa = ab + bb + hbp + sf + sh
                    if pa <= 0:
                        continue
                    ub = max(bb - ibb, 0)
                    pa -= ibb
                    b1 = max(h - d2 - d3 - hr, 0)
                    out = max(pa - k - ub - hbp - h, 0)
                    pos_p = any(p_[1] == 1 for p_ in b['dl'].get((team, pid), []))
                    row = brow(acc.batp if pos_p else acc.bat, pid)
                    vals = [pa, k, ub, hbp, b1, d2, d3, hr, out]
                    for i_, x in enumerate(vals):
                        row[i_] += x
                        (lgb['batP'] if pos_p else lgb['bat'])[i_] += x
                    row[18] += ibb
                    row[16] += sb + cs
                    row[17] += sb
                    home_t = home_
                    for i_, x in enumerate(vals):
                        acc.teamHR[home_]['H'][i_] += x
                        acc.teamHR[vis]['R'][i_] += x
                    if not pos_p:
                        acc.bpark[(pid, False)][m['park']] += pa
            for (team, lst) in (b['pl'].items() if reg else []):
                pit_t = home_ if team == 1 else vis
                plg = tlg.get(pit_t, {}).get('lg', 'AL')
                lgp = acc.lgrec(plg)
                for seq, pid, v in lst:
                    outs, nob, bfp, h, d2, d3, hr, r, er, bb, ibb, k, hbp = [max(x, 0) for x in v[:13]]
                    b1 = max(h - d2 - d3 - hr, 0)
                    ub = max(bb - ibb, 0)
                    out = max(outs - k, 0)
                    n = k + ub + hbp + h + out
                    vals = [n, k, ub, hbp, b1, d2, d3, hr, out]
                    pr = prow(acc.pit, pid)
                    for i_, x in enumerate(vals):
                        pr[i_] += x
                        lgp['pit'][i_] += x
                    pr[15] += n + ibb
                    acc.ppark[pid][m['park']] += n
    for m in master:
        if m['type'] == 'R' and m['park']:
            acc.teamHR[m['home']]['site'][m['park']] += 1
    # any leftover games: gamelog only
    for m in master:
        if not m.get('src'):
            m['src'] = 'g'
            m['starts'] = None
            m['subs'] = []
            m['usedh'] = 1 if any(p == 10 for _, p in m['hstart']) else 0
            m['plines'] = {}
            m['info'] = {}
            stats['gl'] += 1
    # pitcher game-level stats
    for m in master:
        if m['type'] != 'R':
            continue
        for (team, pid), p in m['plines'].items():
            pr = prow(acc.pit, pid)
            pr[12] += 1
            pr[14] += p['outs']
            starter = False
            if m['starts']:
                for spid, steam, slot, pos in m['starts']:
                    if pos == 1 and spid == pid and steam == team:
                        starter = True
            elif (m['vsp'] if team == 0 else m['hsp']) == pid:
                starter = True
            if starter:
                pr[13] += 1
                pr[16] += p['bf']
            pr[20] += m['ers'].get(pid, p.get('er', 0)) if 'ers' in m else p.get('er', 0)
            pr[21] += p['r']
        # games finished / saves
        for team in (0, 1):
            lst = [(k[1], p) for k, p in m['plines'].items() if k[0] == team]
            if lst and m['plines']:
                # last pitcher used by first appearance order
                pr = prow(acc.pit, lst[-1][0])
                if len(lst) > 1:
                    pr[17] += 1
        sv = m.get('info', {}).get('save') or m['sv']
        if sv:
            prow(acc.pit, sv)[18] += 1
    out = {
        'year': year, 'master': master, 'bat': acc.bat, 'batp': acc.batp, 'pit': acc.pit,
        'bpark': dict(acc.bpark), 'ppark': dict(acc.ppark), 'lg': acc.lg,
        'teamHR': {k: dict(v) for k, v in acc.teamHR.items()},
        'bsplit': acc.bsplit, 'psplit': acc.psplit, 'pteam': {k: dict(v) for k, v in acc.pteam.items()},
        'tlg': tlg, 'hands': hands, 'stats': stats,
        'tables': {'joint': acc.joint, 'hrz': acc.hrz, 'tr': dict(acc.tr), 'runexp': acc.runexp,
                   'runev': acc.runev, 'runvec': dict(acc.runvec), 'plat': acc.plat},
    }
    os.makedirs(work, exist_ok=True)
    with open(os.path.join(work, 'raw_%d.pkl' % year), 'wb') as f:
        pickle.dump(out, f, protocol=4)
    return year, stats


# ---------------------------------------------------------------- phase 2
def wilson_round(x, n=3):
    return round(x, n)


def compute_divisions(teams_games, lg_teams, year):
    """Cluster teams into divisions by head-to-head game counts. Returns team->div label."""
    if year < 1969:
        return {t: '' for lg in lg_teams.values() for t in lg}
    res = {}
    for lg, tms in lg_teams.items():
        n = len(tms)
        if n < 8:
            for t in tms:
                res[t] = ''
            continue
        k = 2 if year < 1994 else 3
        if k == 2:
            sizes = [n // 2, n - n // 2]
        else:
            base = [n // 3] * 3
            for i in range(n - sum(base)):
                base[i if n != 16 else 1] += 1
            if n == 14:
                base = [5, 5, 4]
            if n == 16:
                base = [5, 6, 5]
            sizes = base
        idx = {t: i for i, t in enumerate(tms)}
        M = [[0] * n for _ in range(n)]
        for (a, b), c in teams_games.items():
            if a in idx and b in idx:
                M[idx[a]][idx[b]] += c
                M[idx[b]][idx[a]] += c
        best, bestscore = None, -1
        rnd = random.Random(year * 7 + hash(lg) % 1000)
        for _ in range(60):
            perm = list(range(n))
            rnd.shuffle(perm)
            groups, pos = [], 0
            for s in sizes:
                groups.append(perm[pos:pos + s])
                pos += s
            def score(gs):
                return sum(M[a][b] for g_ in gs for a, b in itertools.combinations(g_, 2))
            cur = score(groups)
            improved = True
            while improved:
                improved = False
                for gi in range(k):
                    for gj in range(gi + 1, k):
                        for ai in range(len(groups[gi])):
                            for bj in range(len(groups[gj])):
                                groups[gi][ai], groups[gj][bj] = groups[gj][bj], groups[gi][ai]
                                s2 = score(groups)
                                if s2 > cur:
                                    cur = s2
                                    improved = True
                                else:
                                    groups[gi][ai], groups[gj][bj] = groups[gj][bj], groups[gi][ai]
            if cur > bestscore:
                bestscore, best = cur, [list(g_) for g_ in groups]
        lons = []
        for g_ in best:
            ls = [TEAM_LON.get(tms[i], -90) for i in g_]
            lons.append(sum(ls) / len(ls))
        order = sorted(range(k), key=lambda i: -lons[i])
        names = ['E', 'W'] if k == 2 else ['E', 'C', 'W']
        for rank, gi in enumerate(order):
            for i in best[gi]:
                res[tms[i]] = names[rank]
    return res


TEAM_LON = {
    'ATL': -84.4, 'BAL': -76.6, 'BOS': -71.1, 'CAL': -117.9, 'ANA': -117.9, 'LAA': -117.9, 'CHA': -87.6, 'CHN': -87.7,
    'CIN': -84.5, 'CLE': -81.7, 'COL': -105.0, 'DET': -83.0, 'FLO': -80.2, 'MIA': -80.2, 'HOU': -95.4, 'KCA': -94.5,
    'LAN': -118.2, 'MIL': -87.9, 'MIN': -93.3, 'MON': -73.6, 'NYA': -73.9, 'NYN': -73.8, 'OAK': -122.2, 'PHI': -75.2,
    'PIT': -80.0, 'SDN': -117.2, 'SEA': -122.3, 'SE1': -122.3, 'SFN': -122.4, 'SLN': -90.2, 'TBA': -82.6, 'TEX': -97.1,
    'TOR': -79.4, 'WAS': -77.0, 'WS2': -77.0, 'ARI': -112.1, 'MLA': -87.9,
}


def build_series(games, teams_meta):
    """Group postseason games into series; link feeders."""
    rounds_order = {'WC': 1, 'DV': 2, 'LC': 3, 'WS': 4}
    series = []
    by = collections.defaultdict(list)
    for i, g in enumerate(games):
        if g['type'] in rounds_order:
            key = (g['type'], frozenset((g['vis'], g['home'])))
            by[key].append(i)
    for (rd, pair), idxs in by.items():
        idxs.sort(key=lambda i: (games[i]['date'], games[i]['num']))
        first = games[idxs[0]]
        a, b = first['home'], first['vis']
        wins = {a: 0, b: 0}
        for i in idxs:
            g = games[i]
            w = g['home'] if g['hs'] > g['vs'] else g['vis']
            wins[w] += 1
        # split disjoint series in same round with same pair (rare) - ignore
        series.append({'round': rd, 'teams': [a, b], 'games': idxs, 'wins': [wins[a], wins[b]],
                       'winner': a if wins[a] > wins[b] else b, 'start': first['date']})
    series.sort(key=lambda s: (rounds_order[s['round']], s['start']))
    winners_by_round = {}
    for si, s in enumerate(series):
        winners_by_round.setdefault(rounds_order[s['round']], {})[s['winner']] = si
    for si, s in enumerate(series):
        r = rounds_order[s['round']]
        s['from'] = [winners_by_round.get(r - 1, {}).get(t, -1) for t in s['teams']]
        s['need'] = max(s['wins'])
    return series


def finalize(args):
    year, all_pf, out_dir, work = args
    with open(os.path.join(work, 'raw_%d.pkl' % year), 'rb') as f:
        raw = pickle.load(f)
    master = raw['master']
    tlg = raw['tlg']
    hands = raw['hands']
    # players index
    pids = collections.OrderedDict()
    def pidx(p):
        if p not in pids:
            pids[p] = len(pids)
        return pids[p]
    names = {}
    for m in master:
        names.update(m.get('names', {}))
    # ---- park factors for this year
    pf_year = all_pf.get(year, {})
    # ---- teams
    tstats = collections.defaultdict(lambda: {'w': 0, 'l': 0, 'rs': 0, 'ra': 0})
    h2h = collections.Counter()
    lg_teams = collections.defaultdict(set)
    for m in master:
        if m['type'] != 'R':
            continue
        v, h = m['vis'], m['home']
        tstats[v]['rs'] += m['vs']; tstats[v]['ra'] += m['hs']
        tstats[h]['rs'] += m['hs']; tstats[h]['ra'] += m['vs']
        if m['vs'] > m['hs']:
            tstats[v]['w'] += 1; tstats[h]['l'] += 1
        elif m['hs'] > m['vs']:
            tstats[h]['w'] += 1; tstats[v]['l'] += 1
        h2h[tuple(sorted((v, h)))] += 1
        if tlg.get(v, {}).get('lg') == tlg.get(h, {}).get('lg'):
            pass
        lg_teams[tlg.get(v, {}).get('lg', 'AL')].add(v)
        lg_teams[tlg.get(h, {}).get('lg', 'AL')].add(h)
    lgt = {lg: sorted(t for t in ts if t in tlg) for lg, ts in lg_teams.items()}
    divs = compute_divisions(h2h, {lg: ts for lg, ts in lgt.items() if lg in ('AL', 'NL')}, year)
    # home park per team
    tp = {}
    for t, rec in raw['teamHR'].items():
        if rec['site']:
            tp[t] = rec['site'].most_common(1)[0][0]
    teams_out = {}
    for t, meta in tlg.items():
        s = tstats.get(t)
        if not s and t not in ('ALS', 'NLS'):
            continue
        teams_out[t] = {'n': meta['n'], 'lg': meta['lg'], 'd': divs.get(t, ''),
                        'w': s['w'] if s else 0, 'l': s['l'] if s else 0, 'rs': s['rs'] if s else 0, 'ra': s['ra'] if s else 0,
                        'p': tp.get(t, '')}
    # ---- player rows with park adjustment
    def pfmix(counter):
        tot = sum(counter.values())
        if not tot:
            return [1, 1, 1, 1]
        acc = [0.0] * 4
        for site, n in counter.items():
            f = pf_year.get(site, [1, 1, 1, 1])
            for i in range(4):
                acc[i] += f[i] * n
        return [round(x / tot, 3) for x in acc]
    def merge_park(rawp, key_isP):
        res = collections.defaultdict(collections.Counter)
        for (pid, isP), c in rawp.items():
            if isP == key_isP:
                res[pid].update(c)
        return res
    bpk = merge_park(raw['bpark'], False)
    bppk = merge_park(raw['bpark'], True)
    bat_rows, batp_rows, pit_rows = [], [], []
    for pid, row in raw['bat'].items():
        if row[0] >= 1 or row[16] or row[15]:
            bat_rows.append([pidx(pid)] + row + pfmix(bpk.get(pid, {})))
    for pid, row in raw['batp'].items():
        if row[0] >= 1:
            batp_rows.append([pidx(pid)] + row + pfmix(bppk.get(pid, {})))
    for pid, row in raw['pit'].items():
        if row[12] or row[0]:
            pit_rows.append([pidx(pid)] + row + pfmix(raw['ppark'].get(pid, {})))
    bsp_rows, psp_rows = [], []
    for pid, d in raw.get('bsplit', {}).items():
        if pid in pids:
            bsp_rows.append([pids[pid]] + d['L'] + d['R'])
    for pid, d in raw.get('psplit', {}).items():
        if pid in pids:
            psp_rows.append([pids[pid]] + d['L'] + d['R'])
    # ---- games
    glist = []
    for m in master:
        def st(team):
            if m['starts'] is not None:
                lst = sorted([(slot, pid, pos) for pid, t, slot, pos in m['starts'] if t == team])
                bat = [[pidx(pid), pos] for slot, pid, pos in lst if slot >= 1]
                sp = [pid for slot, pid, pos in lst if slot == 0]
                if not sp:
                    sp = [pid for slot, pid, pos in lst if pos == 1]
                return bat, pidx(sp[0]) if sp else -1
            starters = m['vstart'] if team == 0 else m['hstart']
            sp = m['vsp'] if team == 0 else m['hsp']
            return [[pidx(p), pos] for p, pos in starters], pidx(sp) if sp else -1
        v_bat, v_sp = st(0)
        h_bat, h_sp = st(1)
        subs = [[s['team'], pidx(s['pid']), s['slot'], s['pos'], s['inn'], s['half'], s['pa']] for s in m['subs']]
        pl = []
        for (team, pid), p in m['plines'].items():
            er = m.get('ers', {}).get(pid, p.get('er', 0)) if 'ers' in m else p.get('er', 0)
            pl.append([team, pidx(pid), p['outs'], p['bf'], p['h'], p['r'], er, p['bb'], p['k'], p.get('inn') or 1])
        dec = [pidx(x) if x else -1 for x in (m['info'].get('wp') or m['wp'], m['info'].get('lp') or m['lp'], m['info'].get('save') or m['sv'])]
        glist.append({'date': m['date'], 'num': m['num'], 'vis': m['vis'], 'home': m['home'], 'park': m['park'],
                      'vs': m['vs'], 'hs': m['hs'], 'outs': m['outs'], 'type': m['type'], 'src': m['src'], 'dh': m['usedh'],
                      'vb': v_bat, 'vsp': v_sp, 'hb': h_bat, 'hsp': h_sp, 'subs': subs, 'pl': pl, 'dec': dec,
                      'dn': m['info'].get('daynight', '') if m['info'] else ''})
    glist.sort(key=lambda g: (0 if g['type'] != 'AS' else 1, g['date'], g['num'], g['home']))
    # series
    series = build_series(glist, teams_out)
    # DH rule by league
    dhc = collections.defaultdict(lambda: [0, 0])
    for g in glist:
        if g['type'] == 'R':
            lg = tlg.get(g['home'], {}).get('lg', 'AL')
            dhc[lg][0] += g['dh']
            dhc[lg][1] += 1
    dh = {lg: round(a / b, 2) for lg, (a, b) in dhc.items() if b}
    players = []
    for pid in pids:
        h = hands.get(pid)
        nm = h[0] if h else names.get(pid, pid)
        if not h and pid in names:
            nm = names[pid]
        players.append([pid, nm, h[1] if h else 'R', h[2] if h else 'R'])
    parks = {s: [round(x, 3) for x in f] for s, f in pf_year.items()}
    season = {'y': year, 'players': players, 'bat': bat_rows, 'batp': batp_rows, 'pit': pit_rows, 'bsp': bsp_rows, 'psp': psp_rows,
              'lg': raw['lg'], 'teams': teams_out, 'parks': parks, 'games': glist, 'series': series, 'dh': dh}
    path = os.path.join(out_dir, 'seasons', '%d.json.gz' % year)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(season, f, separators=(',', ':'))
    # ---- league context (for wRC+ / FIP on career pages)
    W = [0, 0.69, 0.72, 0.88, 1.24, 1.56, 2.08, 0]
    lpa = 0; lc = [0] * 8
    for L in raw['lg'].values():
        for kk in ('bat', 'batP'):
            lpa += L[kk][0]
            for i_ in range(8):
                lc[i_] += L[kk][1 + i_]
    lgwoba = sum(W[i_] * lc[i_] for i_ in range(8)) / lpa if lpa else 0.32
    runs = sum(v['rs'] for v in tstats.values())
    lgR = runs / lpa if lpa and runs else 0.115
    pip = per = pk = pbb = phbp = phr = pr_ = 0
    for row in raw['pit'].values():
        pip += row[14]; per += row[20]; pr_ += row[21]; pk += row[1]; pbb += row[2]; phbp += row[3]; phr += row[7]
    ipn = pip / 3
    lgEra = ((per if per > ipn * 0.3 else pr_) * 9 / ipn) if ipn else 4.3
    cfip = lgEra - ((13 * phr + 3 * (pbb + phbp) - 2 * pk) / ipn if ipn else 0)
    ctx = [round(lgwoba, 4), round(min(0.16, max(0.08, lgR)), 4), round(lgEra, 3), round(cfip, 3)]
    # ---- career rows
    career = []
    hb = {}
    for pid in pids:
        h_ = hands.get(pid)
        hb[pid] = (h_[0] if h_ else names.get(pid, pid), h_[1] if h_ else 'R', h_[2] if h_ else 'R')
    def team_of(key):
        c = raw.get('pteam', {}).get(key)
        return max(c, key=c.get) if c else ''
    for pid in pids:
        b = raw['bat'].get(pid); bp = raw['batp'].get(pid); p_ = raw['pit'].get(pid)
        if not (b or bp or p_):
            continue
        brow_ = None
        if b or bp:
            brow_ = [(b[i_] if b else 0) + (bp[i_] if bp else 0) for i_ in range(NB)]
            if brow_[0] <= 0 and brow_[16] <= 0:
                brow_ = None
        prow_ = p_ if (p_ and (p_[12] or p_[0])) else None
        if not (brow_ or prow_):
            continue
        bs = raw.get('bsplit', {}).get(pid)
        ps = raw.get('psplit', {}).get(pid)
        career.append([pid, hb[pid][0], hb[pid][1], hb[pid][2], year, team_of(pid) or team_of(('p', pid)), brow_, prow_,
                       (bs['L'] + bs['R']) if bs else None, (ps['L'] + ps['R']) if ps else None])
    summary = {'ctx': ctx, 'teams': {t: {'n': v['n'], 'lg': v['lg'], 'd': v['d'], 'w': v['w'], 'l': v['l']} for t, v in teams_out.items()},
               'series': [{k: s[k] for k in ('round', 'teams', 'wins', 'winner', 'from', 'need', 'start')} for s in series],
               'ng': sum(1 for g in glist if g['type'] == 'R'), 'dh': dh,
               'src': dict(collections.Counter(g['src'] for g in glist))}
    return year, summary, os.path.getsize(path), career


def compute_park_factors(work, years):
    """Home/road ratio per park, 3-year window, regressed."""
    tm = {}
    for y in years:
        with open(os.path.join(work, 'raw_%d.pkl' % y), 'rb') as f:
            raw = pickle.load(f)
        tm[y] = raw['teamHR']
        raw = None
    K = 12000.0
    pf = {}
    for y in years:
        # sites this year
        sites = collections.defaultdict(list)
        for t, rec in tm[y].items():
            if rec['site']:
                sites[rec['site'].most_common(1)[0][0]].append(t)
        pf[y] = {}
        for site, ts in sites.items():
            H = [0] * 9
            Rr = [0] * 9
            for yy in (y - 1, y, y + 1):
                for t in tm.get(yy, {}):
                    rec = tm[yy][t]
                    if rec['site'] and rec['site'].most_common(1)[0][0] == site:
                        for i in range(9):
                            H[i] += rec['H'][i]
                            Rr[i] += rec['R'][i]
            if H[0] < 500 or Rr[0] < 500:
                pf[y][site] = [1, 1, 1, 1]
                continue
            w = H[0] / (H[0] + K)
            fac = []
            for evi in (4, 5, 6, 7):     # 1B 2B 3B HR  (index = 1+ev)
                h_rate = H[evi] / H[0]
                r_rate = Rr[evi] / Rr[0]
                raw_f = (h_rate / r_rate) if r_rate > 0 else 1
                fac.append(1 + (raw_f - 1) * w)
            pf[y][site] = fac
        # sites with no team-home data
    return pf


def merge_tables(work, years):
    joint = collections.Counter()
    hrz = collections.Counter()
    tr = collections.defaultdict(collections.Counter)
    runexp = collections.Counter()
    runev = collections.Counter()
    runvec = collections.defaultdict(collections.Counter)
    plat = collections.Counter()
    lgsum = {}
    for y in years:
        with open(os.path.join(work, 'raw_%d.pkl' % y), 'rb') as f:
            raw = pickle.load(f)
        t = raw['tables']
        ls = lgsum.setdefault(era_of(y), {'bat': [0] * 9, 'batP': [0] * 9})
        for L in raw['lg'].values():
            for kk in ('bat', 'batP'):
                for i_ in range(9):
                    ls[kk][i_] += L[kk][i_]
        joint.update(t['joint']); hrz.update(t['hrz']); runexp.update(t['runexp']); runev.update(t['runev']); plat.update(t['plat'])
        for k, c in t['tr'].items():
            tr[k].update(c)
        for k, c in t['runvec'].items():
            runvec[k].update(c)
    return joint, hrz, tr, runexp, runev, runvec, plat, lgsum


def write_careers(careers, out_dir):
    d = os.path.join(out_dir, 'career')
    os.makedirs(d, exist_ok=True)
    shards = collections.defaultdict(dict)
    for pid, c in careers.items():
        c['y'].sort(key=lambda r: r[0])
        shards[pid[0]][pid] = c
    for k, v in shards.items():
        with gzip.open(os.path.join(d, k + '.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as f:
            json.dump(v, f, separators=(',', ':'))
    print('career shards', len(shards), 'players', len(careers), flush=True)


def build_global(work, years, out_dir, rs):
    joint, hrz, tr, runexp, runev, runvec, plat, lgsum = merge_tables(work, years)
    eras = []
    for ei, (a, b) in enumerate(ERAS):
        e = {'range': [a, b], 'joint': {}, 'hrz': {}, 'tr': {}, 'runrate': {}, 'runvec': {}, 'plat': {}}
        # joint: side|ev|typ -> zone counts
        for (era, side, ev, typ, zone), n in joint.items():
            if era == ei:
                e['joint'].setdefault('%s|%s' % (side, ev), {})['%s%d' % (typ, zone)] = n
        for (era, side, zone), n in hrz.items():
            if era == ei:
                e['hrz'].setdefault(side, {})[str(zone)] = n
        for (era, side, ph, ev), n in plat.items():
            if era == ei:
                e['plat']['%s%s|%d' % (side, ph, ev)] = n
        for (era, evk, t, z, bm, o), c in tr.items():
            if era != ei:
                continue
            tot = sum(c.values())
            if z != 0 and tot < 8:
                continue
            items = c.most_common(24)
            e['tr']['%s|%s|%d|%d|%d' % (evk, t, z, bm, o)] = [[v, n] for v, n in items]
        for (era, bm, o), n in runexp.items():
            if era == ei:
                rr = {}
                for kind in ('SB', 'CS', 'PO', 'WP', 'PB', 'BK', 'OA'):
                    c = runev.get((era, kind, bm, o), 0)
                    if c:
                        rr[kind] = c
                e['runrate']['%d|%d' % (bm, o)] = [n, rr]
        for (era, kind, bm, o), c in runvec.items():
            if era == ei:
                e['runvec']['%s|%d|%d' % (kind, bm, o)] = [[v, n] for v, n in c.most_common(12)]
        ls = lgsum.get(ei)
        if ls and ls['batP'][0] >= 1500 and ls['bat'][0] > 0:
            e['pbRatio'] = [round(((ls['batP'][1 + i] / ls['batP'][0]) / max(ls['bat'][1 + i] / ls['bat'][0], 1e-9)), 3) for i in range(8)]
        eras.append(e)
    parks = {}
    pth = os.path.join(rs, 'reference', 'ballparks.csv')
    if os.path.exists(pth):
        for row in csv.DictReader(read_lines(pth)):
            parks[row['PARKID']] = {'n': row['NAME'], 'c': row['CITY'], 's': row['STATE']}
    tnames = {}
    pth = os.path.join(rs, 'reference', 'teams.csv')
    for row in csv.DictReader(read_lines(pth)):
        tnames[row['TEAM']] = {'lg': row['LEAGUE'], 'n': (row['CITY'] + ' ' + row['NICKNAME']).strip(), 'f': row['FIRST'], 'l': row['LAST']}
    g = {'eras': eras, 'parks': parks, 'teams': tnames,
         'credit': 'The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.'}
    with gzip.open(os.path.join(out_dir, 'global.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(g, f, separators=(',', ':'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--retrosheet', required=True)
    ap.add_argument('--years', default='1901-2025')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
    ap.add_argument('--work', default=None)
    ap.add_argument('--skip-parse', action='store_true')
    ap.add_argument('--only-global', action='store_true')
    a = ap.parse_args()
    y0, _, y1 = a.years.partition('-')
    years = list(range(int(y0), int(y1 or y0) + 1))
    out_dir = os.path.abspath(a.out)
    work = os.path.abspath(a.work or os.path.join(out_dir, '..', 'work'))
    os.makedirs(out_dir, exist_ok=True)
    years = [y for y in years if os.path.isdir(os.path.join(a.retrosheet, 'seasons', str(y)))]
    if not a.skip_parse and not a.only_global:
        with Pool(a.jobs) as p:
            for y, st in p.imap_unordered(process_season, [(a.retrosheet, y, work) for y in years]):
                print('parsed', y, st, flush=True)
    if a.only_global:
        build_global(work, years, out_dir, a.retrosheet)
        return
    pf = compute_park_factors(work, years)
    idx = {}
    with Pool(a.jobs) as p:
        careers = {}
        for y, summ, size, crow in p.imap_unordered(finalize, [(y, pf, out_dir, work) for y in years]):
            idx[y] = summ
            for r in crow:
                pid = r[0]
                c = careers.setdefault(pid, {'n': r[1], 'b': r[2], 't': r[3], 'y': []})
                c['n'] = r[1]
                c['y'].append([r[4], r[5], r[6], r[7], r[8], r[9]])
            print('wrote', y, size // 1024, 'KB', flush=True)
    write_careers(careers, out_dir)
    build_global(work, years, out_dir, a.retrosheet)
    with open(os.path.join(out_dir, 'index.json'), 'w') as f:
        json.dump({'years': sorted(idx), 'ctx': {str(y): idx[y].pop('ctx') for y in sorted(idx)}, 'seasons': {str(y): idx[y] for y in sorted(idx)}}, f, separators=(',', ':'))


if __name__ == '__main__':
    main()
