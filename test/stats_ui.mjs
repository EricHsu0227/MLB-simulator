process.env.POST = '1'; process.env.CUTOFF = '20261001';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const { handle } = await import('./mlbfixture.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = '/tmp/claude-0/shots';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.route('https://statsapi.mlb.com/**', route => { const j = handle(route.request().url()); route.fulfill({ status: j ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(j || {}) }); });
const shot = async n => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
const base = 'http://127.0.0.1:8123/index.html';
await page.goto(base + '#/live'); await page.waitForSelector('.datenav', { timeout: 60000 });
// a postseason day
await page.fill('input[type=date]', '2026-10-02'); await page.dispatchEvent('input[type=date]', 'change'); await page.waitForSelector('.gamecard');
await shot('ps-games');
await page.click('.gamecard >> nth=0 >> text=Quick sim'); await page.waitForTimeout(1500);
// regular game, played live
await page.fill('input[type=date]', '2026-06-20'); await page.dispatchEvent('input[type=date]', 'change'); await page.waitForSelector('.gamecard');
await page.click('.gamecard >> nth=1 >> text=Play it'); await page.waitForSelector('h2:has-text("set your lineups")'); await page.click('text=Play ball'); await page.waitForSelector('.gv'); await page.click('text=Sim to end'); await page.waitForSelector('.final'); await page.waitForTimeout(800);
await page.click('text=Back to games');
await page.click('button.tab:has-text("Postseason")'); await page.waitForSelector('.rounds'); await shot('ps-bracket');
const sims = page.locator('button:has-text("Sim series")');
const n = await sims.count(); console.log('ready series', n);
await sims.nth(0).click(); await page.waitForTimeout(1500);
await page.click('button:has-text("Sim everything left")'); await page.waitForTimeout(2500); await shot('ps-done');
console.log('champ', await page.locator('.champ').innerText().catch(() => 'none'));
// stats
await page.goto(base + '#/stats'); await page.waitForSelector('text=Batting leaders', { timeout: 30000 }); await shot('stats-leaders');
console.log(await page.evaluate(() => [...document.querySelectorAll('.filters select')][0].innerText.replace(/\n/g, ' | ')));
await page.click('button.tab:has-text("Players")'); await page.fill('input[placeholder^="Search"]', 'a'); await page.waitForSelector('.tbl a');
await page.click('.tbl a >> nth=0'); await page.waitForSelector('.card h3:has-text("Game log")'); await shot('stats-player');
await page.click('button:has-text("Box score") >> nth=0'); await page.waitForSelector('h3:has-text("Play-by-play")'); await page.waitForTimeout(2000); console.log((await page.evaluate(() => document.getElementById('app').innerText)).slice(-400)); await page.waitForSelector('.log .lg'); await shot('stats-game');
console.log('log lines', await page.locator('.log .lg').count());
// true reload -> postseason restored from archive
await page.goto('about:blank');
await page.goto(base + '#/live'); await page.waitForSelector('.datenav'); await page.click('button.tab:has-text("Postseason")'); await page.waitForSelector('.rounds'); await page.waitForTimeout(1500);
console.log('after reload champion shown:', await page.locator('.champ').count());
await shot('ps-restored');
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
