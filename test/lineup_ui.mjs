import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = '/tmp/claude-0/shots';
const b = await chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load|net::/.test(m.text())) errs.push('console ' + m.text()); });
await p.route('https://baseballsavant.mlb.com/**', r => r.abort());
await p.route('https://statsapi.mlb.com/**', r => r.abort());
await p.goto('http://127.0.0.1:8123/index.html#/game'); await p.waitForSelector('.gamelist tbody tr');
await p.click('.gamelist tbody tr >> nth=3'); await p.click('text=Play ball');
await p.waitForSelector('h2:has-text("Set your lineups")'); await p.screenshot({ path: OUT + '/lineup-1.png' });
// change the away starter to a different pitcher, swap a hitter, reorder
const sel = p.locator('.boxteam >> nth=0').locator('select').first();
const opts = await sel.locator('option').allTextContents(); console.log('starter options', opts.length, '| current:', opts[0].slice(0, 40));
const before = await sel.inputValue();
const alt = await sel.locator('option').evaluateAll((os, cur) => os.map(o => o.value).find(v => v !== cur), before);
if (alt) await sel.selectOption(alt);
const newName = (await p.locator('.boxteam >> nth=0').locator('select').first().locator('option:checked').textContent()).split(' (')[0];
console.log('chosen starter:', newName);
await p.locator('.boxteam >> nth=0').locator('td.mv button >> nth=1').click();   // move slot 1 down
await p.locator('.boxteam >> nth=0').locator('text=Best hitters up top').click();
await p.screenshot({ path: OUT + '/lineup-2.png' });
await p.click('text=Play ball');
await p.waitForSelector('.gv');
const pitcherText = async () => (await p.locator('.mu-side').nth(1).innerText());
// first half-inning: home pitcher; away starter pitches in the bottom. advance to bottom 1
await p.click('text=Finish half-inning'); await p.waitForTimeout(800);
console.log('matchup now:', (await pitcherText()).replace(/\n/g, ' | ').slice(0, 120));
await p.screenshot({ path: OUT + '/lineup-3.png' });
// player card from the matchup link
await p.click('.mu-side >> nth=0 >> a.plink'); await p.waitForSelector('.sheet .tiles', { timeout: 15000 }); await p.waitForTimeout(2500);
console.log('card text:', (await p.locator('.sheet').innerText()).replace(/\n+/g, ' | ').slice(0, 700));
await p.screenshot({ path: OUT + '/card-1.png' });
console.log('ERRORS', errs);
await b.close();
