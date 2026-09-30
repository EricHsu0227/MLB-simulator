// UI checks for: managers panel (PH/PR/defence), hands on sub screens, math tab, three-batter toggle, player card tabs,
// default lineups, save + resume (single game, postseason, season).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/shots';
execSync('mkdir -p ' + OUT);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const base = 'http://127.0.0.1:8123/index.html';
const shot = n => page.screenshot({ path: `${OUT}/n-${n}.png` });

// ---------- single game: managers panel
await page.goto(base + '#/game'); await page.waitForSelector('.gamelist tbody tr');
await page.click('.gamelist tbody tr >> nth=3'); await page.click('text=Play ball');
await page.waitForSelector('h2:has-text("Set your lineups")');
ok(await page.locator('text=Save as team default').count() === 2, 'lineup screen has "Save as team default"');
await page.click('text=Play ball'); await page.waitForSelector('.gv');
await page.click('button.tab:has-text("Managers")');
ok(await page.locator('.possel').count() >= 8, 'defence position selects present');
ok(await page.locator('.act select option:has-text("bats")').count() > 0, 'replace list shows batting hand');
ok(await page.locator('.act select option:has-text("wOBA vs")').count() > 0, 'replace list shows split wOBA');
ok(await page.locator('.mcol .act optgroup').count() > 0, 'pitching change has Bullpen/Rotation groups');
ok(await page.locator('text=Three-batter minimum').count() > 0, 'three-batter option visible');
await page.locator('.rulebar input >> nth=1').check();
await page.click('button.tab:has-text("Play-by-play")');
await page.click('text=Next batter'); await page.waitForTimeout(3500);
ok(await page.locator('button.tab:has-text("The math")').count() === 1, 'math tab appears');
await page.click('button.tab:has-text("The math")');
ok(await page.locator('.mathrow table').count() >= 1, 'math tab shows a table');
await shot('math');
// pinch hit then sub again
await page.click('button.tab:has-text("Managers")');
const before = await page.locator('.mcol').first().innerText();
await page.locator('.act:has-text("Replace player") button >> nth=0').click();
await page.waitForTimeout(200);
await page.locator('.act:has-text("Replace player") button >> nth=0').click().catch(() => {});
ok(await page.locator('.gv').count() === 1, 'replace flows without errors');
// autosave
await page.click('button.tab:has-text("Play-by-play")');
await page.click('text=Next batter'); await page.waitForTimeout(3500);
await page.waitForTimeout(600);
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
ok(await page.locator('.savecard:has-text("game in progress")').count() === 1, 'saved game listed');
await shot('saves');
await page.click('.savecard button:has-text("Resume")'); await page.waitForSelector('.gv');
const paAfter = await page.locator('.log .lg.pa').count();
ok(paAfter >= 2, 'resumed game has the plate appearances back: ' + paAfter);
await shot('resumed');
await page.click('text=Sim to end'); await page.waitForSelector('.final');
await page.goto(base + '#/saves'); await page.waitForTimeout(500);
ok(await page.locator('.savecard').count() === 0, 'finished game removed from saves');

// ---------- postseason save/resume
await page.goto(base + '#/post'); await page.waitForSelector('text=Replay the');
await page.click('button:has-text("Replay the")'); await page.waitForSelector('.rounds');
await page.click('button:has-text("Sim next round")'); await page.waitForTimeout(600);
const doneBefore = await page.locator('.node.done').count();
await page.waitForTimeout(500);
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
await page.click('.savecard:has-text("Postseason") button:has-text("Resume")'); await page.waitForSelector('.rounds', { timeout: 30000 });
ok(await page.locator('.node.done').count() === doneBefore, 'postseason restored: ' + doneBefore + ' series done');
const champBefore = await page.locator('.node.done').allInnerTexts();
await shot('post-resumed');

// ---------- season save/resume
await page.goto(base + '#/season'); await page.waitForSelector('text=Start season');
await page.click('button:has-text("Start season")'); await page.waitForSelector('.stand', { timeout: 30000 });
await page.click('button:has-text("Sim month")'); await page.waitForSelector('.stand'); await page.waitForTimeout(600);
const played = await page.locator('.season .muted').first().innerText();
const stand = await page.locator('.stand').first().innerText();
await page.goto(base + '#/saves'); await page.waitForSelector('.savecard');
await page.click('.savecard:has-text("Season") button:has-text("Resume")'); await page.waitForSelector('.stand', { timeout: 120000 });
ok((await page.locator('.stand').first().innerText()) === stand, 'season standings identical after resume');
ok((await page.locator('.season .muted').first().innerText()) === played, 'season progress identical: ' + played);

// ---------- player card
await page.goto(base + '#/game'); await page.waitForSelector('.gamelist tbody tr');
await page.click('.gamelist tbody tr >> nth=3'); await page.click('text=Play ball'); await page.waitForSelector('h2:has-text("Set your lineups")');
await page.click('text=Play ball'); await page.waitForSelector('.gv');
await page.locator('.mu-name a.plink').first().click();
await page.waitForSelector('.sheet .tabs button');
ok(await page.locator('.sheet .tabs button').count() === 4, 'player card has 4 tabs');
ok(await page.locator('.sheet .tabs').count() >= 1, 'card opens');
await shot('card-season');
await page.click('.sheet .tab:has-text("Lefty")'); await page.waitForTimeout(300);
ok(await page.locator('.sheet table').count() >= 1, 'splits table');
await shot('card-splits');
await page.click('.sheet .tab:has-text("Every season")'); await page.waitForSelector('.sheet table', { timeout: 15000 });
ok(await page.locator('.sheet tr.tot').count() >= 1, 'career table with totals');
await shot('card-career');

console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none', '\nFAILS', fails);
await browser.close();
