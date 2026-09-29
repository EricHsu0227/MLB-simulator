// Small DOM helpers and shared formatting.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
export function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function fmtDate(d) {
  const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100;
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + dd + ', ' + y;
}
export const f3 = x => (x >= 1 ? x.toFixed(3) : x.toFixed(3).replace(/^0/, ''));
export const f1 = x => x.toFixed(1);
export function ip(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }
export function select(opts, value, onchange, attrs = {}) {
  const el = h('select', { ...attrs, onchange: e => onchange(e.target.value, e) });
  for (const o of opts) {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    const op = h('option', { value: v }, label);
    if (String(v) === String(value)) op.selected = true;
    el.appendChild(op);
  }
  return el;
}
export function table(head, rows, cls = '') {
  return h('table', { class: 'tbl ' + cls },
    head ? h('thead', null, h('tr', null, head.map(x => h('th', null, x)))) : null,
    h('tbody', null, rows.map(r => h('tr', { class: r.cls }, (r.cells || r).map(c => (c instanceof Node ? c : h('td', null, c)))))));
}
export function spinner(msg = 'Loading…') { return h('div', { class: 'spin' }, h('span', { class: 'dot' }), msg); }
export function card(title, ...kids) { return h('section', { class: 'card' }, title ? h('h3', null, title) : null, kids); }
export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
export function nextFrame() { return new Promise(r => setTimeout(r, 0)); }
export const POS = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH', 11: 'PH', 12: 'PR' };
export function el$(sel, root = document) { return root.querySelector(sel); }
