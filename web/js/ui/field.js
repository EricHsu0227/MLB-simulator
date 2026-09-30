// SVG ball field + at-bat animation (pitch-by-pitch, fielders, throws, baserunning, home-run zoom).
const NS = 'http://www.w3.org/2000/svg';
export const BASES = { 0: [120, 200], 1: [192, 140], 2: [120, 82], 3: [48, 140], 4: [120, 200] };
export const FIELDERS = { 1: [120, 142], 2: [120, 214], 3: [176, 136], 4: [150, 104], 5: [64, 136], 6: [90, 104], 7: [66, 84], 8: [120, 50], 9: [174, 84] };
const MOUND = [120, 142];
const ZONE = { x: 194, y: 166, w: 40, h: 46 };           // strike-zone chart (foul territory, lower right)
const VIEW = [0, 0, 240, 232];
const short = n => { const p = n.split(' '); return p.length > 1 ? p[p.length - 1] : n; };
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fieldSVG(state, opts = {}) {
  const { bases, outs, label, hideRunners, fielders } = state;
  let s = `<svg viewBox="${VIEW.join(' ')}" class="diamond" role="img" aria-label="Baseball field">
    <path d="M120,200 L14,112 Q120,-60 226,112 Z" class="fld-grass"/>
    <path d="M120,200 L14,112 Q120,-60 226,112" class="fld-wall" fill="none"/>
    <polygon points="120,212 205,140 120,72 35,140" class="fld-dirt"/>
    <polygon points="120,196 186,140 120,88 54,140" class="fld-infield"/>
    <circle cx="${MOUND[0]}" cy="${MOUND[1]}" r="7" class="fld-dirt"/>
    <polyline points="120,200 14,112" class="fld-foul"/><polyline points="120,200 226,112" class="fld-foul"/>`;
  if (fielders) for (const k in FIELDERS) { const [x, y] = FIELDERS[k]; s += `<circle cx="${x}" cy="${y}" r="4" class="fielder ${opts.hot == k ? 'hot' : ''}" data-z="${k}"/>`; }
  for (const b of [1, 2, 3]) {
    const [x, y] = BASES[b];
    const occ = !hideRunners && bases[b];
    s += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})" class="base ${occ ? 'occ' : ''}"/>`;
    if (occ) s += `<text x="${x}" y="${y + (b === 2 ? -12 : 22)}" text-anchor="${b === 1 ? 'start' : b === 3 ? 'end' : 'middle'}" dx="${b === 1 ? -8 : b === 3 ? 8 : 0}" class="rname">${esc(short(bases[b].p.name))}</text>`;
  }
  s += `<polygon points="120,208 112,200 112,194 128,194 128,200" class="home"/>`;
  for (let i = 0; i < 3; i++) s += `<circle cx="${20 + i * 15}" cy="218" r="5" class="out ${outs > i ? 'on' : ''}"/>`;
  // pitch chart (filled in during the animation)
  const z = ZONE;
  s += `<g class="zone"><rect x="${z.x - 4}" y="${z.y - 4}" width="${z.w + 8}" height="${z.h + 8}" rx="4" class="zone-bg"/>
    <rect x="${z.x + 6}" y="${z.y + 7}" width="${z.w - 12}" height="${z.h - 14}" class="zone-box"/>
    <line x1="${z.x + 6 + (z.w - 12) / 3}" y1="${z.y + 7}" x2="${z.x + 6 + (z.w - 12) / 3}" y2="${z.y + z.h - 7}" class="zone-grid"/>
    <line x1="${z.x + 6 + 2 * (z.w - 12) / 3}" y1="${z.y + 7}" x2="${z.x + 6 + 2 * (z.w - 12) / 3}" y2="${z.y + z.h - 7}" class="zone-grid"/>
    <line x1="${z.x + 6}" y1="${z.y + 7 + (z.h - 14) / 3}" x2="${z.x + z.w - 6}" y2="${z.y + 7 + (z.h - 14) / 3}" class="zone-grid"/>
    <line x1="${z.x + 6}" y1="${z.y + 7 + 2 * (z.h - 14) / 3}" x2="${z.x + z.w - 6}" y2="${z.y + 7 + 2 * (z.h - 14) / 3}" class="zone-grid"/>
    <g class="zone-dots"></g><text class="count" x="${z.x + z.w / 2}" y="${z.y - 8}" text-anchor="middle"></text></g>`;
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
const wait = ms => tween(ms, () => {});
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const rnd = (a, b) => a + Math.random() * (b - a);

function hitTarget(ev, zone) {
  const z = zone >= 1 && zone <= 9 ? zone : 8;
  const F = FIELDERS[z];
  if (ev === 'HR') return { 7: [42, 52], 8: [120, 8], 9: [198, 52] }[z] || [{ 1: 120, 2: 120, 3: 198, 4: 160, 5: 42, 6: 80 }[z], 24];
  if (ev === '3B') return { 7: [50, 58], 8: [150, 36], 9: [190, 58] }[z] || [F[0], F[1] - 30];
  if (ev === '2B') return { 7: [46, 68], 8: [120, 38], 9: [194, 68] }[z] || [F[0] + (F[0] < 120 ? -14 : 14), F[1] - 24];
  if (ev === '1B') { if (z >= 7) return [F[0], F[1] + 12]; return [F[0] + (F[0] < 120 ? -12 : F[0] > 120 ? 12 : 0), F[1] - 16]; }
  return F;
}

const PITCH_COLOR = { b: '#57c27d', c: '#e55353', s: '#e55353', f: '#f2c94c', x: '#4aa3ff', h: '#b57bff' };
const PITCH_LABEL = { b: 'Ball', c: 'Called strike', s: 'Swinging strike', f: 'Foul ball', x: 'In play', h: 'Hit by pitch' };

/** Animate one plate appearance / running event on top of an already-drawn field svg. */
export async function animateEntry(svg, entry, speed = 1) {
  if (!svg || speed <= 0) return;
  const g = svg.querySelector('.anim');
  if (!g) return;
  const S = ms => ms * speed;
  const dotsG = svg.querySelector('.zone-dots'), countEl = svg.querySelector('.count');
  const ball = mk('circle', { r: 3.2, class: 'ball', cx: MOUND[0], cy: MOUND[1] });
  const shadow = mk('ellipse', { rx: 3, ry: 1.4, class: 'shadow', cx: -10, cy: -10 });
  const banner = mk('text', { x: 120, y: 118, 'text-anchor': 'middle', class: 'banner', opacity: 0 });
  const label = mk('text', { x: 190, y: 160, 'text-anchor': 'middle', class: 'plabel', opacity: 0 });
  g.append(shadow, banner, label);
  const say = (txt, cls) => { banner.textContent = txt; banner.setAttribute('class', 'banner ' + (cls || '')); banner.setAttribute('opacity', 1); };
  const fielder = z => svg.querySelector(`.fielder[data-z="${z}"]`);
  // runners as dots at their starting bases
  const dots = new Map();
  const startPos = m => BASES[m.from] || BASES[0];
  for (const m of entry.moves || []) {
    const d = mk('circle', { r: 6, class: 'runner' + (m.from === 0 ? ' bat' : ''), cx: startPos(m)[0], cy: startPos(m)[1] });
    const t = mk('text', { class: 'rname', 'text-anchor': 'middle', x: startPos(m)[0], y: startPos(m)[1] - 9 }); t.textContent = short(m.name);
    g.append(d, t); dots.set(m, [d, t]);
  }
  if (entry.kind === 'run') {
    g.append(ball);
    for (const m of entry.moves || []) await runMove(m, dots.get(m), S);
    await wait(S(200));
    return;
  }
  g.append(ball);
  const ev = entry.ev;

  // ------------------------------------------------ the pitches
  const pitches = entry.pitches || (ev === 'K' ? 'csb' : 'x');
  if (ev !== 'IBB') {
    let balls = 0, strikes = 0;
    const batBat = mk('line', { x1: 108, y1: 196, x2: 100, y2: 186, class: 'batline', opacity: 0 });
    g.append(batBat);
    for (let i = 0; i < pitches.length; i++) {
      const c = pitches[i];
      // where the pitch ends up (in the chart's coordinates)
      const inZone = c === 'c' || c === 's' || c === 'x' || c === 'f';
      const zx = ZONE.x + 6, zy = ZONE.y + 7, zw = ZONE.w - 12, zh = ZONE.h - 14;
      const px = inZone ? rnd(zx + 2, zx + zw - 2) : (c === 'h' ? (Math.random() < .5 ? zx - 2 : zx + zw + 2) : rnd(zx - 6, zx + zw + 6));
      const py = inZone ? rnd(zy + 2, zy + zh - 2) : (c === 'h' ? rnd(zy, zy + zh) : (Math.random() < .5 ? rnd(zy - 6, zy - 1) : rnd(zy + zh + 1, zy + zh + 6)));
      // ball travels mound -> plate (jittered toward the pitch location)
      const tx = 120 + (px - (zx + zw / 2)) * 0.5, ty = 196 + (py - (zy + zh / 2)) * 0.2;
      await tween(S(i === 0 ? 240 : 190), k => { ball.setAttribute('cx', lerp(MOUND[0], tx, k)); ball.setAttribute('cy', lerp(MOUND[1], ty, k)); ball.setAttribute('r', 2.4 + k * 1.4); });
      if (c === 's' || c === 'f' || c === 'x') { batBat.setAttribute('opacity', 1); await tween(S(90), k => { batBat.setAttribute('x2', lerp(100, 134, k)); batBat.setAttribute('y2', lerp(186, 190, k)); }); batBat.setAttribute('opacity', 0); }
      const dot = mk('circle', { cx: px, cy: py, r: c === 'x' ? 3.4 : 2.6, fill: PITCH_COLOR[c], class: 'pdot' + (i === pitches.length - 1 ? ' last' : '') });
      dotsG.appendChild(dot);
      if (c === 'b') balls++; else if (c === 'c' || c === 's') strikes++; else if (c === 'f' && strikes < 2) strikes++;
      if (c !== 'x' && c !== 'h') countEl.textContent = `${Math.min(balls, 4)}–${Math.min(strikes, 3)}`;
      label.textContent = (i + 1) + '. ' + PITCH_LABEL[c]; label.setAttribute('opacity', 1);
      if (c === 'f') { // foul ball pops off into the stands
        await tween(S(150), k => { ball.setAttribute('cx', lerp(tx, tx + (Math.random() < .5 ? -50 : 50), k)); ball.setAttribute('cy', lerp(ty, ty + 20, k) - Math.sin(Math.PI * k) * 26); });
      }
      if (c !== 'x' && c !== 'h') { ball.setAttribute('cx', MOUND[0]); ball.setAttribute('cy', MOUND[1]); ball.setAttribute('r', 3.2); await wait(S(110)); }
    }
    label.setAttribute('opacity', 0);
  } else { say('INTENTIONAL WALK'); await wait(S(600)); }

  // ------------------------------------------------ the result
  if (ev === 'K') { const called = pitches.endsWith('c'); say(called ? 'ꓘ  STRUCK OUT LOOKING' : 'STRIKEOUT!', 'k'); await wait(S(500)); }
  else if (ev === 'BB') { say('BALL FOUR'); await wait(S(360)); }
  else if (ev === 'HBP') { say('HIT BY PITCH'); await wait(S(360)); }
  else if (ev === 'IBB') { /* said above */ }
  else if (ev === 'BUNT') {
    const T = FIELDERS[entry.zone] || FIELDERS[1];
    await tween(S(360), k => { ball.setAttribute('cx', lerp(BASES[0][0], T[0], k)); ball.setAttribute('cy', lerp(BASES[0][1] - 4, T[1], ease(k))); });
    say('BUNT');
  } else {
    const out = ev === 'OUT';
    const z = entry.zone || 8;
    const T = out ? FIELDERS[z] : hitTarget(ev, z);
    const typ = entry.typ || 'G';
    const home = BASES[0];
    const dur = S(typ === 'F' ? (ev === 'HR' ? 1150 : 950) : typ === 'L' ? 560 : 680);
    const fld = fielder(z);
    const fStart = fld ? [+fld.getAttribute('cx'), +fld.getAttribute('cy')] : null;
    const zoom = ev === 'HR' && speed >= 0.5;
    const trail = [];
    ball.setAttribute('r', 3.6); ball.setAttribute('cx', home[0]); ball.setAttribute('cy', home[1] - 6);
    await tween(dur, k => {
      const e = typ === 'G' ? k : ease(k);
      const x = lerp(home[0], T[0], e), y = lerp(home[1], T[1], e);
      let lift = 0;
      if (typ === 'F') lift = Math.sin(Math.PI * k) * (ev === 'HR' ? 66 : 48);
      else if (typ === 'L') lift = Math.sin(Math.PI * k) * 10;
      else lift = Math.abs(Math.sin(k * Math.PI * 3)) * 3 * (1 - k);
      ball.setAttribute('cx', x); ball.setAttribute('cy', y - lift);
      ball.setAttribute('r', 3.2 + (typ === 'F' ? Math.sin(Math.PI * k) * 1.8 : 0));
      shadow.setAttribute('cx', x); shadow.setAttribute('cy', y + 1); shadow.setAttribute('rx', 3 + lift / 18); shadow.setAttribute('opacity', typ === 'F' || typ === 'L' ? 0.35 : 0);
      if (Math.random() < 0.55) { const tr = mk('circle', { cx: x, cy: y - lift, r: 2.2, class: 'trail' }); g.insertBefore(tr, ball); trail.push(tr); setTimeout(() => tr.remove(), 260); }
      // the fielder breaks toward the ball
      if (fld) { const run = out ? 1 : 0.55; fld.setAttribute('cx', lerp(fStart[0], T[0], Math.min(1, k * 1.2) * run)); fld.setAttribute('cy', lerp(fStart[1], T[1], Math.min(1, k * 1.2) * run)); fld.setAttribute('class', 'fielder hot'); }
      if (zoom) { const zk = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.5 + (k > 0.85 ? 0.5 * (k - 0.85) / 0.15 : 0); const w = 240 - 60 * zk, hh = 232 - 62 * zk; svg.setAttribute('viewBox', `${lerp(0, 30, zk)} ${lerp(0, -8, zk)} ${w} ${hh}`); }
    });
    shadow.setAttribute('opacity', 0);
    if (ev === 'HR') {
      say('HOME RUN!', 'hr');
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const p = mk('circle', { cx: T[0], cy: T[1], r: 2, class: 'spark', fill: i % 2 ? '#ffd166' : '#fff' }); g.appendChild(p); tween(S(600), k => { p.setAttribute('cx', T[0] + Math.cos(a) * 26 * k); p.setAttribute('cy', T[1] + Math.sin(a) * 26 * k); p.setAttribute('opacity', 1 - k); }).then(() => p.remove()); }
      svg.classList.add('flash');
    } else if (ev === '3B') say('TRIPLE!', 'xb');
    else if (ev === '2B') say('DOUBLE', 'xb');
    else if (ev === '1B') say('SINGLE');
    else if (typ === 'G' && z !== 3 && entry.outsAdded >= 1) {
      // throw across the diamond (two throws on a double play)
      const legs = entry.outsAdded >= 2 ? [BASES[2], BASES[1]] : [BASES[1]];
      let from = T;
      for (const to of legs) {
        const line = mk('line', { x1: from[0], y1: from[1], x2: from[0], y2: from[1], class: 'throw' }); g.insertBefore(line, ball);
        await tween(S(240), k => { const x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k); ball.setAttribute('cx', x); ball.setAttribute('cy', y); line.setAttribute('x2', x); line.setAttribute('y2', y); });
        setTimeout(() => line.remove(), 350); from = to;
      }
      say(entry.outsAdded >= 2 ? 'DOUBLE PLAY' : 'OUT', 'out');
    } else say(entry.outsAdded >= 2 ? 'DOUBLE PLAY' : /sacrifice fly/.test(entry.text) ? 'SAC FLY' : 'OUT', 'out');
  }
  // ------------------------------------------------ runners
  await Promise.all((entry.moves || []).map(m => runMove(m, dots.get(m), S)));
  if (entry.runs) {
    say(entry.runs > 1 ? `${entry.runs} RUNS SCORE` : 'RUN SCORES', 'run');
    const plus = mk('text', { x: 120, y: 190, 'text-anchor': 'middle', class: 'plus' }); plus.textContent = '+' + entry.runs; g.appendChild(plus);
    await tween(S(520), k => { plus.setAttribute('y', 190 - 40 * k); plus.setAttribute('opacity', 1 - k * 0.6); });
  } else await wait(S(200));
  svg.setAttribute('viewBox', VIEW.join(' '));
  svg.classList.remove('flash');
}

async function runMove(m, els, S) {
  if (!els) return;
  const [d, t] = els;
  const path = [];
  if (m.to === 0) {
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
