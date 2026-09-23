// 线上验收：真实线上 URL 截图（桌面+手机宽度）
const path = require('path');
const fs = require('fs');
const puppeteer = require('E:/ZCODE/node_modules/puppeteer-core');

function findBrowser() {
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('no browser');
}

const BASE = 'https://yjj0339.github.io/pelican-3d/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--use-angle=default'],
  });
  fs.mkdirSync(path.join(__dirname, '..', 'shots'), { recursive: true });
  for (const [tag, w, h, scene] of [['pc', 1280, 760, 0], ['m', 390, 780, 1], ['m2', 390, 780, 2]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    page.on('pageerror', e => console.log(`[pageerror ${tag}]`, e.message));
    page.on('console', m => { if (m.type() === 'error') console.log(`[console.error ${tag}]`, m.text()); });
    await page.goto(`${BASE}?scene=${scene}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForFunction('window.__ready === true', { timeout: 30000 });
    } catch (e) {
      console.log(`${tag} TIMEOUT`);
    }
    await new Promise(r => setTimeout(r, 2200));
    const file = path.join(__dirname, '..', 'shots', `live_${tag}.png`);
    await page.screenshot({ path: file });
    console.log('LIVE SHOT', file);
    await page.close();
  }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
