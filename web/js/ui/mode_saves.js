// Saved games: resume any game, season, postseason, custom league or tournament you left mid-way.
import { h, clear, spinner, fmtDate } from './common.js';
import { listRuns, getRun, deleteRun } from '../saves.js';
import { resumeGame } from './mode_game.js';
import { resumePost } from './mode_post.js';
import { resumeSeason } from './mode_season.js';
import { resumeCustom } from './mode_custom.js';

const KIND = { game: 'Single game', post: 'Postseason', season: 'Season', custom: 'Custom league', tourn: 'Tournament' };

export async function renderSavesMode(root, ctx) {
  clear(root);
  const box = h('div', { class: 'stack' }, h('h2', null, 'Saved games'),
    h('p', { class: 'muted' }, 'Games, postseasons, seasons, custom leagues and tournaments save themselves after every move. Pick one up right where you left it. (Saves live on this device.)'));
  root.appendChild(box);
  const runs = await listRuns();
  if (!runs.length) { box.appendChild(h('div', { class: 'card muted' }, 'Nothing saved yet — start a game, season or postseason and it will show up here.')); return; }
  const list = h('div', { class: 'stack' });
  for (const r of runs) {
    list.appendChild(h('div', { class: 'card row between wrap savecard' },
      h('div', null, h('div', { class: 'gv-h1' }, r.title), h('div', { class: 'muted small' }, `${KIND[r.kind] || r.kind}${r.game ? ' · game in progress' : ''}${r.n ? ` · ${r.n} step${r.n === 1 ? '' : 's'}` : ''} · saved ${new Date(r.ts).toLocaleString()}`)),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn primary', onclick: async () => {
          const run = await getRun(r.id);
          if (!run) { await deleteRun(r.id); renderSavesMode(root, ctx); return; }
          try {
            if (run.kind === 'game') await resumeGame(root, ctx, run);
            else if (run.kind === 'post') await resumePost(root, ctx, run);
            else if (run.kind === 'season') await resumeSeason(root, ctx, run);
            else await resumeCustom(root, ctx, run);
          } catch (e) { console.error(e); clear(root); root.appendChild(h('div', { class: 'card warn' }, 'Could not restore this save: ' + e.message, h('div', null, h('button', { class: 'btn', onclick: () => renderSavesMode(root, ctx) }, '‹ Back')))); }
        } }, 'Resume'),
        h('button', { class: 'btn', onclick: async () => { if (confirm('Delete this save? (Box scores already archived stay in Stats & logs.)')) { await deleteRun(r.id); renderSavesMode(root, ctx); } } }, 'Delete'))));
  }
  box.appendChild(list);
}
