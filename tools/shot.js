// 截图验收：node tools/shot.js [场景号...]  （需先 node serve.js）
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

(async () => {
  const scenes = process.argv.slice(2).map(Number);
  const list = scenes.length ? scenes : [0, 1, 2];
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--use-angle=default', '--window-size=1280,800'],
  });
  fs.mkdirSync(path.join(__dirname, '..', 'shots'), { recursive: true });
  for (const s of list) {
    for (const [tag, w, h] of [['pc', 1280, 760], ['m', 390, 780]]) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      page.on('pageerror', e => console.log(`[pageerror s${s}${tag}]`, e.message));
      page.on('console', m => { if (m.type() === 'error') console.log(`[console.error s${s}${tag}]`, m.text()); });
      await page.goto(`http://localhost:8912/?scene=${s}&speed=${tag === 'pc' ? 6 : 5}`, { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForFunction('window.__propsReady === true || window.__bootError', { timeout: 40000 });
      } catch (e) {
        console.log(`s${s}${tag} TIMEOUT waiting __propsReady`);
      }
      const bootErr = await page.evaluate('window.__bootError || ""');
      if (bootErr) console.log(`s${s}${tag} BOOT ERROR:`, bootErr);
      await new Promise(r => setTimeout(r, s === 0 && tag === 'pc' ? 2600 : 1500));
      const file = path.join(__dirname, '..', 'shots', `web_s${s}_${tag}.png`);
      await page.screenshot({ path: file });
      console.log('SHOT', file);
      await page.close();
    }
  }
  await browser.close();
  console.log('ALL DONE');
})().catch(e => { console.error(e); process.exit(1); });
