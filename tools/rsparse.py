"""Retrosheet event-file parser.

Turns one game's worth of event-file lines into a compact record: lineups,
substitutions (with timing), pitcher usage, and a list of plate-appearance /
running events annotated with base-out state, batted-ball type and zone, and
the resulting runner-advance vector.

Retrosheet data: "The information used here was obtained free of charge from
and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at
www.retrosheet.org."
"""
import csv
import io
import re

EV_K, EV_BB, EV_HBP, EV_1B, EV_2B, EV_3B, EV_HR, EV_OUT = range(8)
EV_NAMES = ['K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'OUT']

HIT_RE = re.compile(r'^(S|D|T)(\d*)')
BASE_IDX = {'B': 0, '1': 1, '2': 2, '3': 3, 'H': 4}


class ParseError(Exception):
    pass


def _i(x):
    m = re.match(r'-?\d+', x or '')
    return int(m.group()) if m else 0


def csv_split(line):
    if '"' not in line:
        return line.split(',')
    return next(csv.reader([line]))


def parse_advances(adv):
    """'1-3;2XH(64)' -> list of (src, dest, out_flag, err_flag). src/dest 0..4 (B,1,2,3,H)."""
    res = []
    if not adv:
        return res
    for tok in adv.split(';'):
        tok = tok.strip()
        if len(tok) < 3:
            continue
        src = BASE_IDX.get(tok[0])
        sep = tok[1]
        dst = BASE_IDX.get(tok[2])
        if src is None or dst is None or sep not in '-X':
            continue
        paren = tok[3:]
        err = 'E' in paren
        out = sep == 'X' and not err
        res.append((src, dst, out, err))
    return res


def classify_bip(mods, basic_digits, is_hit, ev):
    """Return (type, zone, labeled). type in G/L/F or None."""
    typ = None
    zone = 0
    labeled = False
    for m in mods:
        if not m:
            continue
        c = m[0]
        if c in 'GLFP' and (len(m) == 1 or m[1].isdigit() or m[1] in '+-'):
            typ = 'F' if c == 'P' else c
            labeled = True
            d = re.match(r'[GLFP]([0-9]+)', m)
            if d:
                zone = int(d.group(1)[0])
        elif c == 'B' and len(m) > 1 and m[1] in 'GLP':
            typ = 'G' if m[1] == 'G' else ('F' if m[1] == 'P' else 'L')
            labeled = True
            d = re.match(r'B[GLP]([0-9]+)', m)
            if d:
                zone = int(d.group(1)[0])
        elif m == 'SF':
            typ = 'F'
            labeled = True
    return typ, zone, labeled


class Game:
    __slots__ = ('id', 'info', 'starts', 'subs', 'plays', 'ers', 'errors', 'radj', 'names')

    def __init__(self):
        self.info = {}
        self.starts = []   # (pid, team, slot, pos)
        self.subs = []     # dict: pid, team, slot, pos, inn, half, pa
        self.plays = []    # event dicts
        self.ers = {}
        self.errors = 0
        self.names = {}


def new_half():
    return {'bases': [None, None, None, None], 'outs': 0, 'pa': 0}


def parse_game(lines, hands=None, want_plays=True):
    """lines: list of raw lines for one game (starting with 'id,')."""
    g = Game()
    cur = {0: {}, 1: {}}       # team -> {'p': pitcher id, 'slots': {slot: pid}}
    pitcher = {0: None, 1: None}
    lineup = {0: {}, 1: {}}    # slot -> (pid,pos)
    posof = {0: {}, 1: {}}
    half = None
    inn = 1
    team_bat = 0
    st = new_half()
    pending_radj = []
    last_pitcher_of_defense = {}
    for raw in lines:
        raw = raw.rstrip('\r\n')
        if not raw:
            continue
        f = csv_split(raw)
        tag = f[0]
        if tag == 'id':
            g.id = f[1]
        elif tag == 'info':
            g.info[f[1]] = f[2] if len(f) > 2 else ''
        elif tag == 'start':
            pid, name, team, slot, pos = f[1], f[2], _i(f[3]), _i(f[4]), _i(f[5])
            g.starts.append((pid, team, slot, pos))
            g.names[pid] = name
            lineup[team][slot] = (pid, pos)
            posof[team][pid] = pos
            if pos == 1:
                pitcher[team] = pid
        elif tag == 'sub':
            pid, name, team, slot, pos = f[1], f[2], _i(f[3]), _i(f[4]), _i(f[5])
            g.names[pid] = name
            # timing: state of the *next* play. If current half over -> next half
            if st['outs'] >= 3 or half is None:
                if half is None:
                    t_inn, t_team, t_pa = 1, 0, 0
                else:
                    t_inn, t_team, t_pa = (inn + (1 if team_bat == 1 else 0)), 1 - team_bat, 0
            else:
                t_inn, t_team, t_pa = inn, team_bat, st['pa']
            g.subs.append({'pid': pid, 'team': team, 'slot': slot, 'pos': pos,
                           'inn': t_inn, 'half': t_team, 'pa': t_pa})
            lineup[team][slot] = (pid, pos)
            posof[team][pid] = pos
            if pos == 1:
                pitcher[team] = pid
        elif tag == 'radj':
            pending_radj.append((f[1], int(f[2])))
        elif tag == 'data' and f[1] == 'er':
            g.ers[f[2]] = int(f[3])
        elif tag == 'play' and want_plays:
            p_inn, p_team, batter, count, pitches, desc = int(f[1]), int(f[2]), f[3], f[4], f[5], f[6]
            if half is None or p_inn != inn or p_team != team_bat:
                inn, team_bat, half = p_inn, p_team, True
                st = new_half()
            for rid, base in pending_radj:
                if 1 <= base <= 3:
                    st['bases'][base] = (rid, pitcher[1 - team_bat])
            pending_radj = []
            try:
                ev = parse_play(desc, batter, st, pitcher[1 - team_bat], lineup[team_bat], hands)
            except ParseError:
                g.errors += 1
                ev = None
            if ev is not None:
                ev['inn'] = inn
                ev['team'] = team_bat
                ev['bat'] = batter
                ev['bpos'] = posof[team_bat].get(batter, 0)
                ev['pit'] = pitcher[1 - team_bat]
                ev['pa_in_half'] = st['pa']
                g.plays.append(ev)
                if ev.get('is_pa'):
                    st['pa'] += 1
    return g


def parse_play(desc, batter, st, pit, lineup, hands):
    bases = st['bases']
    outs0 = st['outs']
    main, _, adv_s = desc.partition('.')
    parts = main.split('/')
    basic = parts[0]
    mods = parts[1:]
    adv = parse_advances(adv_s)
    state_before = tuple(1 if bases[i] else 0 for i in (1, 2, 3))
    bmask = state_before[0] | (state_before[1] << 1) | (state_before[2] << 2)
    if basic in ('NP', '') or basic.startswith('NP'):
        return None

    prim_str, *secs = re.split(r'[+;]', basic) if '+' in basic else [basic]
    # double-steal notation uses ';' inside basic
    if ';' in prim_str:
        prim_str, *more = prim_str.split(';')
        secs = more + secs

    # ---- classify primary ----
    ev = None
    dest = {}            # src -> dest (0 out, 1..3 base, 4 home)
    fielders = ''
    is_pa = True
    is_run = False
    run_type = None
    bunt = 'SH' in mods or any(m.startswith('B') and len(m) > 1 and m[1] in 'GLP' for m in mods)
    hp = None

    if prim_str.startswith('HP'):
        ev = EV_HBP
        dest[0] = 1
    elif prim_str.startswith('HR') or prim_str == 'H' or (prim_str.startswith('H') and prim_str[1:].isdigit()):
        ev = EV_HR
        dest[0] = 4
        m = re.match(r'H[R]?(\d*)', prim_str)
        fielders = m.group(1) if m else ''
    elif prim_str.startswith('DGR'):
        ev = EV_2B
        dest[0] = 2
    elif HIT_RE.match(prim_str) and prim_str[0] in 'SDT' and not prim_str.startswith('SB'):
        m = HIT_RE.match(prim_str)
        ev = {'S': EV_1B, 'D': EV_2B, 'T': EV_3B}[m.group(1)]
        dest[0] = {'S': 1, 'D': 2, 'T': 3}[m.group(1)]
        fielders = m.group(2)
    elif prim_str.startswith('K'):
        ev = EV_K
        dest[0] = 0
    elif prim_str.startswith('IW') or prim_str == 'I' or prim_str.startswith('I+') or prim_str == 'IW':
        ev = 'IBB'
        dest[0] = 1
    elif prim_str.startswith('W') and not prim_str.startswith('WP'):
        ev = EV_BB
        dest[0] = 1
    elif prim_str.startswith('C') and not prim_str.startswith('CS'):
        ev = 'CI'   # catcher's interference: batter to first, no PA
        dest[0] = 1
    elif prim_str.startswith('FC'):
        ev = EV_OUT
        dest[0] = 1
        fielders = re.sub(r'\D', '', prim_str[2:])
    elif prim_str.startswith('FLE'):
        return None
    elif prim_str.startswith('E') and prim_str[1:2].isdigit():
        ev = EV_OUT
        dest[0] = 1
        fielders = re.sub(r'\D', '', prim_str[1:])
    elif prim_str[:1].isdigit():
        ev = EV_OUT
        # fielding sequence with (x) out marks
        segs = re.findall(r'(\d+|E\d)(?:\(([B123])\))?', prim_str)
        marks = [s[1] for s in segs if s[1]]
        has_err = 'E' in prim_str
        fielders = re.sub(r'\D', '', prim_str.split('(')[0])
        for mk in marks:
            src = 0 if mk == 'B' else int(mk)
            dest[src] = 0
        if has_err:
            dest[0] = 1
        elif 'B' in marks:
            dest[0] = 0
        elif segs and not segs[-1][1]:
            dest[0] = 0
        else:
            # last segment marked with runner: force out, batter safe at first
            dest[0] = 1
        if not segs:
            dest[0] = 0
    else:
        # pure running event(s)
        is_pa = False
        is_run = True

    # ---- running (non-PA) events / secondary events ----
    run_events = []
    all_run_strs = []
    if is_run:
        all_run_strs = [basic] if ';' not in basic and '+' not in basic else re.split(r'[+;]', basic)
    else:
        all_run_strs = secs
    for rs in all_run_strs:
        rs = rs.strip()
        if not rs:
            continue
        m = re.match(r'(SB|CS|POCS|PO|WP|PB|BK|OA|DI)([123H]?)(\(.*\))?', rs)
        if not m:
            continue
        kind, tb, par = m.group(1), m.group(2), m.group(3) or ''
        run_events.append((kind, tb, par))
    if is_run and not run_events:
        raise ParseError(desc)
    if is_run:
        run_type = run_events[0][0]

    # implicit moves from running events
    for kind, tb, par in run_events:
        err = 'E' in par
        if kind == 'SB' and tb:
            t = BASE_IDX[tb]
            dest.setdefault(t - 1, t)
        elif kind in ('CS', 'POCS') and tb:
            t = BASE_IDX[tb]
            dest.setdefault(t - 1, (t if err else 0))
            if kind == 'POCS':
                pass
        elif kind == 'PO' and tb:
            t = BASE_IDX[tb]
            if not err:
                dest.setdefault(t, 0)
        elif kind == 'BK':
            for b in (1, 2, 3):
                if bases[b]:
                    dest.setdefault(b, b + 1)

    # explicit advances override
    for src, dst, out, err in adv:
        if src == 0 and not is_pa and not is_run:
            pass
        dest[src] = 0 if out else dst

    # batter placed?
    if is_pa and 0 not in dest:
        dest[0] = 0

    # forced / implicit runner movement
    if is_pa or run_events:
        occupied = set()
        if is_pa and 1 <= dest.get(0, 0) <= 3:
            occupied.add(dest[0])
        for b in (1, 2, 3):
            if bases[b] and b in dest and 1 <= dest[b] <= 3:
                occupied.add(dest[b])
        for b in (1, 2, 3):
            if bases[b] and b not in dest:
                if ev in (EV_HR, EV_3B):
                    dest[b] = 4
                    continue
                nb = b
                pushed = False
                while nb in occupied:
                    nb += 1
                    pushed = True
                if nb >= 4:
                    dest[b] = 4
                else:
                    dest[b] = nb
                    occupied.add(nb)
                    if not pushed:
                        pass
    # Consistency: a runner cannot be listed if nobody's there (ignore silently)
    outs_added = 0
    runs = []
    new_bases = [None, None, None, None]
    # move runners
    for b in (3, 2, 1):
        r = bases[b]
        if not r:
            continue
        d = dest.get(b, b)
        if d == 0:
            outs_added += 1
        elif d == 4:
            runs.append(r)
        else:
            new_bases[d] = r
    if is_pa:
        d = dest.get(0, 0)
        if d == 0:
            outs_added += 1
        elif d == 4:
            runs.append((batter, pit))
        else:
            new_bases[d] = (batter, pit)
    # runners that were not present but were listed are ignored
    # vector: dest per source
    vec = ''
    for src in (0, 1, 2, 3):
        if src == 0:
            vec += str(dest.get(0, 0)) if is_pa else '-'
        else:
            vec += str(dest.get(src, src)) if bases[src] else '-'

    # bip classification
    typ = zone = None
    labeled = False
    if is_pa and ev in (EV_1B, EV_2B, EV_3B, EV_OUT, EV_HR):
        typ, zone, labeled = classify_bip(mods, fielders, ev in (EV_1B, EV_2B, EV_3B), ev)
        fz = int(fielders[0]) if fielders and fielders[0].isdigit() and fielders[0] != '0' else 0
        if ev == EV_OUT and fz:
            zone = fz
        elif not zone:
            zone = fz
        if typ is None and ev != EV_HR:
            # inference for transition tables only
            if ev == EV_OUT:
                nfield = len(fielders)
                if zone in (7, 8, 9):
                    typ = 'F'
                elif nfield > 1 or zone == 3:
                    typ = 'G'
                else:
                    typ = 'F'
            else:
                typ = 'G' if zone and zone <= 6 else 'L'
        if ev == EV_HR:
            typ = 'F'

    hr_bases = None
    out = {
        'ev': ev if not is_run else None,
        'is_pa': is_pa and ev not in ('IBB', 'CI'),
        'kind': ('IBB' if ev == 'IBB' else 'CI' if ev == 'CI' else None),
        'run': run_type if is_run else None,
        'runk': [(k, tb) for k, tb, _ in run_events],
        'bmask': bmask,
        'outs0': outs0,
        'vec': vec,
        'typ': typ, 'zone': zone or 0, 'lab': labeled, 'bunt': bunt,
        'runs': runs,
        'outs_add': outs_added,
        'bases_before': [None] + [bases[i][0] if bases[i] else None for i in (1, 2, 3)],
        'dest': {k: v for k, v in dest.items()},
        'secs': [(k, tb) for k, tb, _ in run_events] if not is_run else [],
    }
    # apply
    st['bases'][:] = new_bases
    st['outs'] = outs0 + outs_added
    return out
