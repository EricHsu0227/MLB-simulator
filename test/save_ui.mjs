// Save/resume fidelity: mid-game with human moves, custom league + playoffs, tournament.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const base = 'http://127.0.0.1:8123/index.html';
await page.goto(base); await page.evaluate(() => indexedDB.deleteDatabase('diamond-sim'));

// mid-game with substitutions and strategy
await page.goto(base + '#/game'); await page.waitForSelector('.gamelist tbody tr');
await page.click('.gamelist tbody tr >> nth=5'); await page.click('text=Play ball');
await page.waitForSelector('h2:has-text("Set your lineups")'); await page.click('text=Play ball'); await page.waitForSelector('.gv');
for (let i = 0; i < 6; i++) { await page.click('text=Next batter'); await page.waitForTimeout(400); await page.waitForFunction(() => !document.querySelector('.gv-ctrl button[disabled]')); }
await page.click('button.tab:has-text("Managers")');
await page.locator('.act:has-text("Replace player") button >> nth=0').click();
await page.locator('.possel >> nth=1').selectOption({ index: 2 }).catch(() => {});
await page.click('button.tab:has-text("Play-by-play")');
await page.click('text=Sac bunt');
for (let i = 0; i < 5; i++) { await page.click('text=Next batter'); await page.waitForTimeout(400); await page.waitForFunction(() => !document.querySelector('.gv-ctrl button[disabled]')); }
await page.waitForTimeout(600);
const log1 = await page.locator('.log').innerText();
const score1 = await page.locator('.linescore').innerText();
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
await page.click('.savecard button:has-text("Resume")'); await page.waitForSelector('.gv');
ok((await page.locator('.log').innerText()) === log1, 'mid-game play-by-play identical after resume (with subs + bunt call + position change)');
ok((await page.locator('.linescore').innerText()) === score1, 'scoreboard identical');

// custom league: sim, playoffs, resume
await page.goto(base + '#/custom'); await page.waitForSelector('text=Add teams');
await page.click('button:has-text("Best 16 records ever")');
await page.click('button:has-text("Create league")'); await page.waitForSelector('.stand', { timeout: 60000 });
await page.click('button:has-text("Sim to end of season")'); await page.waitForSelector('text=Regular season complete', { timeout: 120000 });
await page.click('button.tab:has-text("Playoffs")'); await page.click('button:has-text("Start the playoffs")');
await page.click('button:has-text("Sim next round")'); await page.waitForTimeout(600);
const done1 = await page.locator('.node.done').count();
await page.waitForTimeout(600);
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
await page.click('.savecard:has-text("Custom league") button:has-text("Resume")'); await page.waitForSelector('.stand', { timeout: 180000 });
await page.click('button.tab:has-text("Playoffs")'); await page.waitForSelector('.rounds');
ok(await page.locator('.node.done').count() === done1, 'custom league playoffs restored: ' + done1);

// tournament
await page.goto(base + '#/custom'); await page.waitForSelector('text=Add teams');
await page.click('button:has-text("Best 16 records ever")');
await page.selectOption('select >> nth=-0', { index: 0 }).catch(() => {});
await page.locator('.filters select').filter({ hasText: 'Elimination tournament' }).selectOption('tournament');
await page.click('button:has-text("Create tournament")'); await page.waitForSelector('.rounds', { timeout: 60000 });
await page.click('button:has-text("Sim next round")'); await page.waitForTimeout(600);
const tdone = await page.locator('.node.done').count(); await page.waitForTimeout(600);
const names = await page.locator('.node.done').allInnerTexts();
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
await page.click('.savecard:has-text("Tournament") button:has-text("Resume")'); await page.waitForSelector('.rounds', { timeout: 60000 });
ok((await page.locator('.node.done').allInnerTexts()).join() === names.join(), 'tournament results identical after resume: ' + tdone);
console.log('ERRORS:', errors.length ? errors : 'none', 'FAILS', fails);
await browser.close();
