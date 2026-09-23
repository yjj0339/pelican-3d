// 计时测试：手机慢网络下 首屏(__ready) 与 道具就绪(__propsReady) 的时间
const path = require('path');
const puppeteer = require('E:/ZCODE/node_modules/puppeteer-core');

function findBrowser() {
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (require('fs').existsSync(c)) return c;
  throw new Error('no browser');
}

const LIVE = process.argv.includes('--live');
const USE_CDN = process.argv.includes('--cdn');
const NO_WEBGL = process.argv.includes('--nowebgl');
const BASE = (LIVE ? 'https://yjj0339.github.io/pelican-3d/' : 'http://localhost:8912/') + (USE_CDN ? '?cdn=1' : '');
const TAG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : (LIVE ? 'live' : 'local');

(async () => {
  const args = ['--use-angle=default'];
  if (NO_WEBGL) args.push('--disable-webgl', '--disable-webgl2', '--disable-3d-apis');
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: 'new', args });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; PGT-AN10 Build/HUAWEIPGT-AN10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49',
  });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 220, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
  });

  const t0 = Date.now();
  const t = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
  if (process.argv.includes('--blockjs')) {
    await page.setRequestInterception(true);
    page.on('request', r => { if (/js\/main\.js/.test(r.url())) r.abort(); else r.continue(); });
  }
  page.on('pageerror', e => console.log(t(), '[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log(t(), '[console.error]', m.text().slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const tReady = await page.evaluate(() => new Promise(res => {
    const iv = setInterval(() => {
      if (window.__ready || window.__bootError) { clearInterval(iv); res(Date.now()); }
    }, 50);
  })).then(ts => (ts - t0) / 1000);
  const overlay = await page.$eval('#loading', el => el.classList.contains('done') ? '已收起' : '仍显示');
  const tip = await page.$eval('#loading', el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
  console.log('首屏渲染(__ready):', tReady.toFixed(1) + 's', '| 加载页:', overlay, '| 卡片文字:', tip);

  let tProps = null;
  try {
    await page.waitForFunction('window.__propsReady === true || window.__bootError', { timeout: 40000 });
    tProps = (Date.now() - t0) / 1000;
    console.log('沿途风光(__propsReady):', tProps.toFixed(1) + 's');
  } catch (e) {
    console.log('沿途风光: 超时 40s 未就绪');
  }
  const bootErr = await page.evaluate('window.__bootError || ""');
  if (bootErr) console.log('BOOT ERROR:', bootErr);

  await new Promise(r => setTimeout(r, 1800));
  const file = path.join(__dirname, '..', 'shots', `timing_${TAG}.png`);
  await page.screenshot({ path: file });
  console.log('SHOT', file);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });