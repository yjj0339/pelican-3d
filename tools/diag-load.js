// 复现诊断：手机模拟 + 慢网络，检查是否卡在加载页 & 记录所有失败请求
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
const BASE = LIVE ? 'https://yjj0339.github.io/pelican-3d/' : 'http://localhost:8912/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--use-angle=default'],
  });
  const page = await browser.newPage();
  // 手机模拟
  await page.emulate({
    viewport: { width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003123) NetType/WIFI Language/zh_CN',
  });
  // 慢网络：1.5Mbps down
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 260, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
  });

  const t0 = Date.now();
  const marks = [];
  page.on('requestfailed', r => marks.push(`FAIL ${r.failure()?.errorText} ${r.url().slice(-60)}`));
  page.on('requestfinished', r => {
    const u = r.url();
    if (/\.(js|glb|css|html)$/.test(u.split('?')[0])) marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${r.response()?.status()} ${u.split('/').pop().slice(0, 40)}`);
  });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 200)); });

  console.log('BASE =', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 观察 25 秒内是否 ready
  let ready = false;
  try {
    await page.waitForFunction('window.__ready === true', { timeout: 25000 });
    ready = true;
  } catch (e) { ready = false; }
  const loadTip = await page.$eval('#loadTip', el => el.textContent).catch(() => 'n/a');
  const loadingVisible = await page.$eval('#loading', el => !el.classList.contains('done')).catch(() => 'n/a');
  const fillW = await page.$eval('#loadFill', el => el.style.width).catch(() => 'n/a');
  console.log('--- 25s 后状态 ---');
  console.log('ready =', ready, '| 加载页仍显示 =', loadingVisible, '| 进度条 =', fillW, '| 提示文字 =', loadTip);
  console.log('--- 请求时间线 ---');
  for (const m of marks) console.log(' ', m);
  await page.screenshot({ path: path.join(__dirname, '..', 'shots', 'diag_mobile_slow.png') });
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });