import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = execSync('npm root -g').toString().trim();
const { chromium } = require(root + '/playwright');
const OUT = process.env.SHOTS || '/tmp/claude-0/shots';
execSync('mkdir -p ' + OUT);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(async () => chromium.launch({ args: ['--no-sandbox'] }));
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const base = 'http://127.0.0.1:8123/index.html';
const which = process.argv[2] || 'all';
async function shot(n) { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); }
await page.goto(base); await page.waitForSelector('.modes'); await shot('home');
if (which === 'all' || which === 'game') {
  await page.goto(base + '#/game'); await page.waitForSelector('.gamelist table tbody tr', { timeout: 30000 });
  await shot('game-list');
  await page.click('.gamelist table tbody tr >> nth=3');
  await page.waitForSelector('text=Play ball'); await shot('game-setup');
  await page.click('text=Play ball'); await page.waitForSelector('h2:has-text("Set your lineups")'); await shot('game-lineups'); await page.click('text=Play ball');
  await page.waitForSelector('.gv'); await page.click('text=Next batter'); await page.waitForTimeout(900); await shot('game-anim'); await page.waitForTimeout(2500); await page.click('text=Sac bunt'); await page.click('text=Next batter'); await page.waitForTimeout(3500);
  await shot('game-live');
  await page.click('text=Sim to end'); await page.waitForSelector('.final'); await shot('game-final');
  await page.click('button.tab:has-text("Real game")'); await shot('game-real');
}
if (which === 'all' || which === 'post') {
  await page.goto(base + '#/post'); await page.waitForSelector('text=Replay the');
  await page.click('button:has-text("Replay the")');
  await page.waitForSelector('.rounds'); await shot('post-start');
  await page.click('button:has-text("Sim next round")'); await page.waitForTimeout(500);
  await page.click('button:has-text("Sim everything left")'); await page.waitForTimeout(500); await shot('post-done');
}
if (which === 'all' || which === 'season') {
  await page.goto(base + '#/season'); await page.waitForSelector('text=Start season');
  await page.click('button:has-text("Start season")'); await page.waitForSelector('.stand', { timeout: 30000 });
  await page.click('button:has-text("Sim month")'); await page.waitForSelector('.stand');
  await shot('season-month');
  await page.click('button:has-text("Sim to end of season")'); await page.waitForSelector('text=Regular season complete', { timeout: 120000 });
  await shot('season-end');
  await page.click('button.tab:has-text("Leaders")'); await shot('season-leaders');
  await page.click('button.tab:has-text("Playoffs")'); await page.click('button:has-text("Start the playoffs")');
  await page.click('button:has-text("Sim everything left")'); await page.waitForTimeout(500); await shot('season-playoffs');
}
if (which === 'all' || which === 'custom') {
  await page.goto(base + '#/custom'); await page.waitForSelector('text=Add teams');
  await page.click('button:has-text("Best 16 records ever")'); await shot('custom-teams');
  await page.click('button:has-text("Create league")'); await page.waitForSelector('.stand', { timeout: 60000 });
  await page.click('button:has-text("Sim to end of season")'); await page.waitForSelector('text=Regular season complete', { timeout: 120000 });
  await shot('custom-end');
  await page.click('button.tab:has-text("Playoffs")'); await page.click('button:has-text("Start the playoffs")');
  await page.click('button:has-text("Sim everything left")'); await page.waitForTimeout(500); await shot('custom-playoffs');
}
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
