// Account card (sign in / sync status) and the nav button.
import { h, card } from './common.js';
import { cloud } from '../cloud.js';
import { ENABLE_APPLE } from '../config.js';

export function accountCard(ctx, redraw) {
  const box = h('div');
  const draw = () => {
    box.replaceChildren();
    const s = cloud.state, u = cloud.user;
    if (!cloud.enabled) {
      box.appendChild(card('Account & sync',
        h('p', null, 'Games are saved on this device. To keep them across your Mac and iPhone, turn on sign-in with Google or Apple.'),
        h('p', { class: 'small muted' }, 'Sign-in needs a free Firebase project that only you can create. Follow docs/SETUP_LOGIN.md, paste the config into web/js/config.js, and the buttons appear here.')));
    } else if (u) {
      box.appendChild(card('Account & sync',
        h('div', { class: 'row' }, u.photo ? h('img', { src: u.photo, class: 'avatar', alt: '' }) : h('span', { class: 'avatar ph' }, (u.name || '?')[0].toUpperCase()), h('div', null, h('b', null, u.name), h('div', { class: 'muted small' }, u.email))),
        h('div', { class: 'muted small' }, s.msg || ''),
        h('div', { class: 'btnrow' }, h('button', { class: 'btn', onclick: () => cloud.syncNow() }, '↻ Sync now'), h('button', { class: 'btn', onclick: () => cloud.signOut() }, 'Sign out'))));
    } else {
      box.appendChild(card('Sign in to keep your games everywhere',
        h('p', { class: 'muted small' }, 'Your box scores, game logs and player stats sync to your account so they’re on every device.'),
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn primary big', disabled: s.status === 'signing-in', onclick: () => cloud.signIn('google') }, 'Continue with Google'),
          ENABLE_APPLE ? h('button', { class: 'btn big applebtn', disabled: s.status === 'signing-in', onclick: () => cloud.signIn('apple') }, ' Sign in with Apple') : null),
        s.msg ? h('p', { class: 'warn small' }, s.msg) : null));
    }
  };
  draw();
  const off = cloud.subscribe(() => { if (!box.isConnected) { off(); return; } draw(); });
  return box;
}

export function mountNavAccount(el) {
  const draw = () => {
    const u = cloud.user;
    el.textContent = u ? (u.name || '?')[0].toUpperCase() : (cloud.enabled ? 'Sign in' : '☁');
    el.title = u ? `Signed in as ${u.name}` : cloud.enabled ? 'Sign in with Google or Apple' : 'Account & sync';
    el.classList.toggle('on', !!u);
  };
  el.onclick = () => { location.hash = '#/stats'; };
  cloud.subscribe(draw); draw();
}
