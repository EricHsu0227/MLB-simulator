import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
const base = 'http://127.0.0.1:8123/index.html';
// season: play a game live through the lineup screen
await p.goto(base + '#/season'); await p.click('text=Start season'); await p.waitForSelector('.stand');
await p.click('button.tab:has-text("Games")'); await p.click('text=Play live >> nth=0');
await p.waitForSelector('h2:has-text("set your lineups")'); await p.click('text=Play ball'); await p.waitForSelector('.gv'); await p.click('text=Sim to end'); await p.waitForSelector('.final');
console.log('season watch ok:', (await p.locator('.final').innerText()));
await p.click('text=Back to season'); await p.waitForSelector('.season .bar');
console.log('season played count text:', (await p.locator('.season .muted').first().innerText()));
// postseason replay: play game by game
await p.goto(base + '#/post'); await p.click('button:has-text("Replay the")'); await p.waitForSelector('.rounds');
await p.click('text=Play game by game >> nth=0'); await p.waitForSelector('h2:has-text("set your lineups")');
await p.click('text=Play ball'); await p.waitForSelector('.gv'); await p.click('text=Sim to end'); await p.waitForSelector('.final');
console.log('post watch ok:', (await p.locator('.final').innerText()));
// back button on the editor
await p.goto(base + '#/game'); await p.waitForSelector('.gamelist tbody tr'); await p.click('.gamelist tbody tr >> nth=2'); await p.click('text=Play ball'); await p.waitForSelector('h2:has-text("Set your lineups")'); await p.click('text=‹ Back'); await p.waitForSelector('text=Play ball');
// turn off review, play straight in
await p.click('text=Play ball'); await p.waitForSelector('h2:has-text("Set your lineups")'); await p.uncheck('input[type=checkbox]'); await p.click('text=Play ball'); await p.waitForSelector('.gv');
await p.click('text=Game setup'); await p.click('text=Play ball'); await p.waitForSelector('.gv', { timeout: 5000 });
console.log('review off -> straight to game: ok');
console.log('ERRORS', errs);
await b.close();
