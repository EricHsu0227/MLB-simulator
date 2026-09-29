// SVG ball field + at-bat animation.
const NS = 'http://www.w3.org/2000/svg';
export const BASES = { 0: [120, 200], 1: [192, 140], 2: [120, 82], 3: [48, 140], 4: [120, 200] };
export const FIELDERS = { 1: [120, 142], 2: [120, 214], 3: [176, 136], 4: [150, 104], 5: [64, 136], 6: [90, 104], 7: [66, 84], 8: [120, 50], 9: [174, 84] };
const MOUND = [120, 142];
const short = n => { const p = n.split(' '); return p.length > 1 ? p[p.length - 1] : n; };
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fieldSVG(state, opts = {}) {
  const { bases, outs, label, hideRunners, fielders } = state;
  let s = `<svg viewBox="0 0 240 232" class="diamond" role="img" aria-label="Baseball field">
    <path d="M120,200 L14,112 Q120,-60 226,112 Z" class="fld-grass"/>
    <path d="M120,200 L14,112 Q120,-60 226,112" class="fld-wall" fill="none"/>
    <polygon points="120,212 205,140 120,72 35,140" class="fld-dirt"/>
    <polygon points="120,196 186,140 120,88 54,140" class="fld-infield"/>
    <circle cx="${MOUND[0]}" cy="${MOUND[1]}" r="7" class="fld-dirt"/>
    <polyline points="120,200 14,112" class="fld-foul"/><polyline points="120,200 226,112" class="fld-foul"/>`;
  if (fielders) for (const k in FIELDERS) { const [x, y] = FIELDERS[k]; s += `<circle cx="${x}" cy="${y}" r="4" class="fielder ${opts.hot == k ? 'hot' : ''}"/>`; }
  for (const b of [1, 2, 3]) {
    const [x, y] = BASES[b];
    const occ = !hideRunners && bases[b];
    s += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" class="base ${occ ? 'occ' : ''}"/>`;
    if (occ) s += `<text x="${x}" y="${y + (b === 2 ? -12 : 22)}" text-anchor="${b === 1 ? 'start' : b === 3 ? 'end' : 'middle'}" dx="${b === 1 ? -8 : b === 3 ? 8 : 0}" class="rname">${esc(short(bases[b].p.name))}</text>`;
  }
  s += `<polygon points="120,208 112,200 112,194 128,194 128,200" class="home"/>`;
  for (let i = 0; i < 3; i++) s += `<circle cx="${20 + i * 15}" cy="218" r="5" class="out ${outs > i ? 'on' : ''}"/>`;
  s += `<text x="10" y="18" class="inn">${label}</text><g class="anim"></g></svg>`;
  return s;
}

function mk(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function tween(ms, fn) {
  return new Promise(res => {
    const t0 = performance.now();
    (function f(t) { const k = ms <= 0 ? 1 : Math.min(1, (t - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(f) : res(); })(t0);
  });
}
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

function hitTarget(ev, zone) {
  const z = zone >= 1 && zone <= 9 ? zone : 8;
  const F = FIELDERS[z];
  if (ev === 'HR') return { 7: [42, 52], 8: [120, 8], 9: [198, 52] }[z] || [{ 1: 120, 2: 120, 3: 198, 4: 160, 5: 42, 6: 80 }[z], 24];
  if (ev === '3B') return { 7: [50, 58], 8: [150, 36], 9: [190, 58] }[z] || [F[0], F[1] - 30];
  if (ev === '2B') return { 7: [46, 68], 8: [120, 38], 9: [194, 68] }[z] || [F[0] + (F[0] < 120 ? -14 : 14), F[1] - 24];
  if (ev === '1B') { if (z >= 7) return [F[0], F[1] + 12]; return [F[0] + (F[0] < 120 ? -12 : F[0] > 120 ? 12 : 0), F[1] - 16]; }
  return F;
}

/** Animate one plate appearance / running event on top of an already-drawn field svg. */
export async function animateEntry(svg, entry, speed = 1) {
  if (!svg || speed <= 0) return;
  const g = svg.querySelector('.anim');
  if (!g) return;
  const S = ms => ms * speed;
  const ball = mk('circle', { r: 3.2, class: 'ball', cx: MOUND[0], cy: MOUND[1] });
  const banner = mk('text', { x: 120, y: 118, 'text-anchor': 'middle', class: 'banner', opacity: 0 });
  g.append(banner);
  const say = (txt, cls) => { banner.textContent = txt; banner.setAttribute('class', 'banner ' + (cls || '')); banner.setAttribute('opacity', 1); };
  // runners as dots at their starting bases
  const dots = new Map();
  const startPos = m => BASES[m.from] || BASES[0];
  for (const m of entry.moves || []) {
    const d = mk('circle', { r: 6, class: 'runner' + (m.from === 0 ? ' bat' : ''), cx: startPos(m)[0], cy: startPos(m)[1] });
    const t = mk('text', { class: 'rname', 'text-anchor': 'middle', x: startPos(m)[0], y: startPos(m)[1] - 9 }); t.textContent = short(m.name);
    g.append(d, t); dots.set(m, [d, t]);
  }
  if (entry.kind === 'run') {
    for (const m of entry.moves || []) await runMove(m, dots.get(m), S);
    await tween(S(200), () => {});
    return;
  }
  g.append(ball);
  const ev = entry.ev;
  if (ev === 'IBB') { say('INTENTIONAL WALK'); await tween(S(600), () => {}); }
  else if (ev === 'BUNT') {
    await pitch(ball, S);
    const T = FIELDERS[entry.zone] || FIELDERS[1];
    await tween(S(420), k => { ball.setAttribute('cx', lerp(BASES[0][0], T[0], k)); ball.setAttribute('cy', lerp(BASES[0][1] - 4, T[1], ease(k))); });
    say('BUNT');
  } else {
    await pitch(ball, S);
    if (ev === 'K') { say('STRIKEOUT!', 'k'); await tween(S(520), () => {}); }
    else if (ev === 'BB') { say('BALL FOUR'); await tween(S(420), () => {}); }
    else if (ev === 'HBP') { say('HIT BY PITCH'); await tween(S(420), () => {}); }
    else {
      const out = ev === 'OUT';
      const z = entry.zone || 8;
      const T = out ? FIELDERS[z] : hitTarget(ev, z);
      const typ = entry.typ || 'G';
      const home = BASES[0];
      const dur = S(typ === 'F' ? 950 : typ === 'L' ? 520 : 620);
      const sh = svg.querySelectorAll('.fielder'); void sh;
      await tween(dur, k => {
        const e = typ === 'G' ? k : ease(k);
        const x = lerp(home[0], T[0], e), y = lerp(home[1], T[1], e);
        let lift = 0;
        if (typ === 'F') lift = Math.sin(Math.PI * k) * (ev === 'HR' ? 62 : 46);
        else if (typ === 'L') lift = Math.sin(Math.PI * k) * 10;
        else lift = Math.abs(Math.sin(k * Math.PI * 3)) * 3 * (1 - k);
        ball.setAttribute('cx', x); ball.setAttribute('cy', y - lift);
        ball.setAttribute('r', 3.2 + (typ === 'F' ? Math.sin(Math.PI * k) * 1.6 : 0));
      });
      if (ev === 'HR') say('HOME RUN!', 'hr');
      else if (ev === '3B') say('TRIPLE!', 'xb');
      else if (ev === '2B') say('DOUBLE', 'xb');
      else if (ev === '1B') say('SINGLE');
      else if (typ === 'G' && z !== 3 && entry.outsAdded >= 1) {
        // throw to first
        await tween(S(300), k => { ball.setAttribute('cx', lerp(T[0], BASES[1][0], k)); ball.setAttribute('cy', lerp(T[1], BASES[1][1], k)); });
        say(entry.outsAdded >= 2 ? 'DOUBLE PLAY' : 'OUT', 'out');
      } else say(entry.outsAdded >= 2 ? 'DOUBLE PLAY' : /sacrifice fly/.test(entry.text) ? 'SAC FLY' : 'OUT', 'out');
    }
  }
  // runners
  await Promise.all((entry.moves || []).map(m => runMove(m, dots.get(m), S)));
  if (entry.runs) { say(entry.runs > 1 ? `${entry.runs} RUNS SCORE` : 'RUN SCORES', 'run'); await tween(S(380), () => {}); }
  else await tween(S(180), () => {});
}

async function pitch(ball, S) {
  await tween(S(340), k => { ball.setAttribute('cx', lerp(MOUND[0], BASES[0][0], k)); ball.setAttribute('cy', lerp(MOUND[1], BASES[0][1] - 6, k)); });
}

async function runMove(m, els, S) {
  if (!els) return;
  const [d, t] = els;
  const path = [];
  if (m.to === 0) {
    // out: run part-way then fade
    const nxt = Math.min(4, m.from + 1);
    path.push(BASES[m.from], [lerp(BASES[m.from][0], BASES[nxt][0], .6), lerp(BASES[m.from][1], BASES[nxt][1], .6)]);
    await walk(d, t, path, S);
    d.setAttribute('class', 'runner out'); await tween(S(260), k => { d.setAttribute('opacity', 1 - k); t.setAttribute('opacity', 1 - k); });
    return;
  }
  for (let b = m.from; b <= m.to; b++) path.push(BASES[b]);
  if (path.length < 2) { return; }
  await walk(d, t, path, S);
  if (m.to === 4) { d.setAttribute('class', 'runner score'); await tween(S(200), k => { d.setAttribute('opacity', 1 - k); t.setAttribute('opacity', 1 - k); }); }
}

async function walk(d, t, path, S) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    await tween(S(230), k => { const x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k); d.setAttribute('cx', x); d.setAttribute('cy', y); t.setAttribute('x', x); t.setAttribute('y', y - 9); });
  }
}
