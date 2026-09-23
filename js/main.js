// 鹈鹕骑行 · 3D 立体环游 — 主入口
// Blender 建模 GLB + Three.js 卡通渲染 + 着色器世界 + WebAudio
// 加载策略：鹈鹕+自行车就位即开跑（首屏最快），沿途风光道具随后补上；
// 全程错误兜底：WebGL 检测 / 每步失败提示 / 超时重试，绝不卡死在加载页。
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { World, SCENES, makeGradientMap, buildTemplates } from './world.js';
import { Rider } from './rider.js';
import { AudioEngine } from './audio.js';

const QS = new URLSearchParams(location.search);
const lowSpec = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const $ = (id) => document.getElementById(id);

// CDN 加速镜像（国内直连 github.io 慢/断时自动切换）
const CDN_BASES = [
  'https://cdn.jsdelivr.net/gh/yjj0339/pelican-3d@main/',
  'https://fastly.jsdelivr.net/gh/yjj0339/pelican-3d@main/',
];

// ---------- 加载页 / 错误兜底 ----------
let bootFailed = false;
function setLoad(tip, pct) {
  if (bootFailed) return;
  if (tip) $('loadTip').textContent = tip;
  if (pct != null) $('loadFill').style.width = pct + '%';
}
function hideLoading() {
  window.__bootError = '';           // 若看门狗误报过，成功即恢复
  $('loading').classList.add('done');
}
function bootError(msg, detail) {
  bootFailed = true;
  if (window.__clearWatchdogs) window.__clearWatchdogs();
  window.__bootError = msg;
  window.__ready = true;               // 让验收工具知道"已经结束（失败）"
  const card = document.querySelector('#loading .load-card');
  if (!card) return;
  card.innerHTML =
    '<div class="load-bird">🦩</div>' +
    '<div class="load-title">没能加载出来</div>' +
    '<div class="load-tip" style="margin-top:10px">' + msg + '</div>' +
    (detail ? '<div class="load-tip" style="margin-top:6px;opacity:.72;font-size:11.5px">' + detail + '</div>' : '') +
    '<button id="retryBtn" style="margin-top:16px;padding:10px 30px;border:0;border-radius:99px;background:#46c8b4;color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer">重试</button>';
  $('retryBtn').onclick = () => { location.href = location.pathname + '?r=' + Date.now(); };
  $('loading').classList.remove('done');
}

// ---------- 渲染器（带 WebGL 检测） ----------
const canvas = $('stage');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowSpec ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} catch (e) {
  renderer = null;
  console.error('WebGL init failed:', e);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);

// ---------- GLB 加载（直连失败/超时自动切 CDN 镜像） ----------
// URL 白名单：只允许站内相对路径或下列 CDN 主机；跨域请求拒绝 localhost/回环/私有/保留地址
const ALLOW_HOSTS = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net'];
const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;
function safeAssetUrl(u) {
  const abs = new URL(u, location.href);
  if (abs.protocol !== 'http:' && abs.protocol !== 'https:') throw new Error('blocked protocol: ' + abs.protocol);
  const host = abs.hostname.toLowerCase();
  if (abs.origin === location.origin) return abs.href;      // 站内资源
  if (ALLOW_HOSTS.indexOf(host) < 0) throw new Error('blocked host: ' + host);
  if (PRIVATE_HOST.test(host)) throw new Error('blocked private host: ' + host);
  return abs.href;
}
function fetchBuf(url, ms) {
  return new Promise((res, rej) => {
    let safe;
    try { safe = safeAssetUrl(url); } catch (e) { rej(e); return; }
    const ctl = new AbortController();
    const to = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, ms);
    fetch(safe, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(b => { clearTimeout(to); res(b); })
      .catch(e => { clearTimeout(to); rej(e); });
  });
}
async function loadAssetBuffer(path) {
  const forceCdn = !!QS.get('cdn');
  const urls = forceCdn
    ? CDN_BASES.map(b => b + path)
    : [path].concat(CDN_BASES.map(b => b + path));
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    try {
      return await fetchBuf(u, (i === 0 && !forceCdn) ? 9000 : 25000);
    } catch (e) {
      lastErr = e;
      if (i === 0 && !forceCdn) setLoad('直连较慢，正在切换加速通道…', 30);
    }
  }
  throw new Error('资源下载失败：' + path.split('/').pop() + '（' + (lastErr && lastErr.message) + '）');
}
async function loadGLB(path, tip) {
  const buf = await loadAssetBuffer(path);
  return new Promise((res, rej) => {
    try {
      new GLTFLoader().parse(buf, '', (g) => { if (tip) setLoad(tip); res(g); },
        (e) => rej(new Error('模型解析失败：' + path.split('/').pop())));
    } catch (e) { rej(e); }
  });
}

// ---------- 状态 ----------
const state = {
  t: 0, speed: parseFloat(QS.get('speed') || '5.5'), crank: 0, odo: 0,
  glideHold: false, glide: 0,
  bellAt: -9, jawOpen: 0, bellHead: 0, bellWag: 0,
  sceneIndex: 0, autoSceneAt: 42,
  camMode: 0,
  camAz: 0.42, camEl: 0.18, camR: 3.4,
  userOrbit: false,
  soundMode: 2,
};
const CAM_NAMES = ['跟拍', '侧拍', '迎面', '航拍'];

// ---------- 相机 ----------
const camTarget = new THREE.Vector3(0.05, 0.95, 0);
function updateCamera(dt) {
  let az = state.camAz, el = state.camEl, r = state.camR;
  if (!state.userOrbit) {
    if (state.camMode === 0) az = 0.42 + Math.sin(state.t * 0.13) * 0.10;
    else if (state.camMode === 1) az = Math.PI / 2 + Math.sin(state.t * 0.09) * 0.04;
    else if (state.camMode === 2) az = Math.PI + Math.sin(state.t * 0.11) * 0.06;
    else { az = 0.6 + Math.sin(state.t * 0.07) * 0.2; el = 0.62; }
  }
  if (state.camMode === 3) el = Math.max(el, 0.55);
  if (state.camMode === 2) el = Math.min(el, 0.22);
  const ty = state.glide * 0.5;
  const cx = camTarget.x + r * Math.sin(az) * Math.cos(el);
  const cy = camTarget.y + ty + r * Math.sin(el);
  const cz = camTarget.z + r * Math.cos(az) * Math.cos(el);
  const k = 1 - Math.exp(-dt * 5);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += (cy - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.lookAt(camTarget.x, camTarget.y + ty, camTarget.z);
  const fovT = (innerWidth < 640 ? 50 : 42) + state.glide * 6 + Math.max(0, state.speed - 8) * 0.8;
  camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

// ---------- 拖拽 / 缩放 ----------
const pointers = new Map();
let pinchD = 0, downXY = null, downAt = 0;
canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = performance.now(); downXY = { x: e.clientX, y: e.clientY };
  if (pointers.size === 2) {
    const v = Array.from(pointers.values());
    pinchD = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  }
  audio.warm();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 9) state.userOrbit = true;
  if (pointers.size === 1) {
    state.camAz -= dx * 0.005;
    state.camEl = THREE.MathUtils.clamp(state.camEl + dy * 0.004, 0.04, 0.85);
  } else if (pointers.size === 2) {
    const v = Array.from(pointers.values());
    const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
    state.camR = THREE.MathUtils.clamp(state.camR * (pinchD / (d || 1)), 1.9, 7.5);
    pinchD = d;
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  const dt = performance.now() - downAt;
  const moved = downXY ? Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) : 99;
  if (dt < 280 && moved < 9 && !QS.get('auto')) ringBell();
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
canvas.addEventListener('wheel', e => {
  state.camR = THREE.MathUtils.clamp(state.camR * (1 + Math.sign(e.deltaY) * 0.08), 1.9, 7.5);
}, { passive: true });

// ---------- 音频 ----------
const audio = new AudioEngine();

// ---------- HUD ----------
const toastEl = $('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}
function ringBell() {
  state.bellAt = state.t;
  audio.warm();
  audio.bell();
  toast('叮铃铃 ~ 🦩');
}
function showSceneBanner(name) {
  const b = $('sceneBanner');
  b.textContent = name;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 1900);
}
function switchScene(idx, manual = true) {
  const flash = $('flash');
  flash.classList.add('on');
  setTimeout(() => {
    state.sceneIndex = ((idx % 3) + 3) % 3;
    const conf = world.applyScene(state.sceneIndex);
    audio.sceneKind = conf.id;
    $('hudScene').textContent = conf.name;
    showSceneBanner(conf.name);
    if (conf.petals) setTimeout(() => audio.chirp(), 900);
    state.autoSceneAt = state.t + 42;
    flash.classList.remove('on');
  }, 320);
  if (!manual) toast('前方到站：' + SCENES[((idx % 3) + 3) % 3].name);
}
function cycleSound() {
  state.soundMode = (state.soundMode + 2) % 3;   // 2 -> 0 -> 1 -> 2
  audio.mode = state.soundMode === 1 ? 0 : state.soundMode;  // 1 = 仅音效（抑制音乐）
  if (audio.master) audio.master.gain.value = state.soundMode === 0 ? 0 : 0.9;
  $('btnSound').classList.toggle('active', state.soundMode !== 0);
  toast(['音乐+音效 🎵', '已静音 🔇', '仅音效 🔔'][(state.soundMode + 1) % 3]);
}
function takePhoto() {
  if (!renderer) return;
  audio.shutter();
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = 'pelican-3d-' + Date.now() + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('照片已保存 📸');
}
function setGlide(on) {
  if (on && !state.glideHold) audio.whoosh();
  state.glideHold = on;
  $('btnGlide').classList.toggle('active', on);
}

$('btnBell').onclick = () => { audio.warm(); ringBell(); };
$('btnGlide').onpointerdown = () => setGlide(true);
$('btnGlide').onpointerup = $('btnGlide').onpointerleave = () => setGlide(false);
$('btnCam').onclick = () => { state.camMode = (state.camMode + 1) % 4; state.userOrbit = false; toast('机位：' + CAM_NAMES[state.camMode]); };
$('btnScene').onclick = () => switchScene(state.sceneIndex + 1);
$('btnSound').onclick = () => { audio.warm(); cycleSound(); };
$('btnPhoto').onclick = () => takePhoto();
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnHelpClose').onclick = () => $('help').classList.add('hidden');
$('speedSlider').oninput = (e) => { state.speed = parseFloat(e.target.value); };
$('speedSlider').value = state.speed;

addEventListener('keydown', e => {
  if (e.repeat) return;
  audio.warm();
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setGlide(true); }
  else if (k === 'b') ringBell();
  else if (k === 'c') $('btnCam').click();
  else if (k === 'm') cycleSound();
  else if (k === 'p') takePhoto();
  else if (k === 'h') $('help').classList.toggle('hidden');
  else if (k === '1' || k === '2' || k === '3') switchScene(parseInt(k) - 1);
  else if (k === 'w' || k === 'arrowup') { state.speed = Math.min(13, state.speed + 1.2); $('speedSlider').value = state.speed; }
  else if (k === 's' || k === 'arrowdown') { state.speed = Math.max(0, state.speed - 1.2); $('speedSlider').value = state.speed; }
});
addEventListener('keyup', e => { if (e.key === ' ') setGlide(false); });

// ---------- 世界 / 骑手 ----------
const gradientMap = makeGradientMap();
let world = null, rider = null;
const speedEl = $('hudSpeed'), odoEl = $('hudOdo');

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let frames = 0, slowFrames = 0, degraded = false, hudTimer = 0, loopBroken = false;

function animate() {
  if (loopBroken || !renderer) return;
  requestAnimationFrame(animate);
  try {
    const dt = Math.min(clock.getDelta(), 0.05);
    state.t += dt;

    const glideT = state.glideHold ? 1 : 0;
    state.glide += (glideT - state.glide) * Math.min(1, dt * 3.2);
    const speed = state.speed * (1 + state.glide * 0.55);
    if (state.speed > 0.15) state.crank += THREE.MathUtils.clamp(speed * 1.15, 1.2, 9.0) * dt;
    state.odo += speed * dt;

    const since = state.t - state.bellAt;
    if (since >= 0 && since < 1.4) {
      const k = since / 1.4;
      state.jawOpen = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.9;
      state.bellHead = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.5;
      state.bellWag = Math.sin(since * 14) * (1 - k) * 0.5;
    } else if (state.glide > 0.5 && Math.sin(state.t * 2) > 0.96) {
      state.jawOpen = 0.5;
    } else { state.jawOpen *= Math.max(0, 1 - dt * 6); state.bellHead = 0; state.bellWag = 0; }

    if (world) world.update(dt, state.t, speed, state.glide);
    if (rider) rider.update(dt, state.t, speed, state.crank, state);
    updateCamera(dt);
    audio.ambience(speed, dt);

    if (!QS.get('scene') && state.t > state.autoSceneAt) switchScene(state.sceneIndex + 1, false);

    renderer.render(scene, camera);

    hudTimer += dt;
    if (hudTimer > 0.15) {
      hudTimer = 0;
      speedEl.textContent = Math.round(speed * 3.6);
      odoEl.textContent = (state.odo / 1000).toFixed(2) + ' km';
    }

    frames++;
    if (frames === 1) {
      hideLoading();
      if (window.__clearWatchdogs) window.__clearWatchdogs();
      showSceneBanner(SCENES[state.sceneIndex].name);
    }
    if (frames === 3) window.__ready = true;

    if (!degraded && frames > 60) {
      if (dt > 0.026) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90) {
        degraded = true;
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.3));
        renderer.shadowMap.enabled = false;
        scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
      }
    }
  } catch (err) {
    loopBroken = true;
    bootError('画面渲染出错了', String(err && err.message ? err.message : err));
  }
}

// ---------- 自适应 ----------
function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 启动 ----------
(async () => {
  resize();
  if (!renderer) {
    bootError('这台设备没能启动 3D 画面（WebGL 不可用）', '试试更新浏览器，或在微信里点「…」→ 用系统浏览器打开');
    return;
  }
  const wSlow = setTimeout(() => setLoad('网络有点慢，还在努力加载…', 55), 9000);
  const wDead = setTimeout(() => bootError('加载超时了', '可能是网络较慢，点重试或稍后再打开'), 45000);
  window.__clearWatchdogs = () => { clearTimeout(wSlow); clearTimeout(wDead); };

  try {
    // 第一步：主角就位就开跑（首屏最快）
    const [pelicanG, bikeG] = await Promise.all([
      loadGLB('assets/pelican.glb', '鹈鹕上车…'),
      loadGLB('assets/bike.glb', '自行车充气…'),
    ]);
    setLoad('准备出发…', 82);

    world = new World(scene, null, gradientMap);
    if (lowSpec && world.sun) {
      world.sun.shadow.mapSize.set(1024, 1024);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    }
    rider = new Rider(bikeG.scene, pelicanG.scene, gradientMap);
    scene.add(rider.root);

    if (QS.get('scene') !== null) switchScene(parseInt(QS.get('scene')) || 0);
    else { $('hudScene').textContent = SCENES[0].name; audio.sceneKind = SCENES[0].id; }
    if (QS.get('cam')) {
      const i = ['follow', 'side', 'front', 'top'].indexOf(QS.get('cam'));
      if (i >= 0) state.camMode = i;
    }

    audio.startMusic();
    animate();                        // 首帧渲染后自动收起加载页

    // 第二步：沿途风光随后补上（不阻塞首屏）
    setLoad('正在布置沿途风光…', 90);
    const propsG = await loadGLB('assets/props.glb');
    world.attachPropTemplates(buildTemplates(propsG.scene, gradientMap));
    setLoad('出发！', 100);
    window.__propsReady = true;
    if (window.__clearWatchdogs) window.__clearWatchdogs();
  } catch (err) {
    bootError(String(err && err.message ? err.message : err), '点重试重新加载；若一直失败请稍后再试');
  }
})();