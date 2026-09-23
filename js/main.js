// 鹈鹕骑行 · 3D 立体环游 — 主入口
// Blender 建模 GLB + Three.js 卡通渲染 + 着色器世界 + WebAudio
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { World, SCENES, makeGradientMap, buildTemplates } from './world.js';
import { Rider, WHEEL_R } from './rider.js';
import { AudioEngine } from './audio.js';

const QS = new URLSearchParams(location.search);

// ---------- 渲染器 ----------
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const coarse = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.8 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 260);

// ---------- 加载 ----------
const loadFill = document.getElementById('loadFill');
const loadTip = document.getElementById('loadTip');
let loadedCount = 0;
function tickLoad(tip) {
  loadedCount++;
  loadFill.style.width = Math.min(100, 8 + loadedCount / 3 * 90) + '%';
  if (tip) loadTip.textContent = tip;
}
const loadGLB = (url) => new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));

// ---------- 状态 ----------
const state = {
  t: 0, speed: parseFloat(QS.get('speed') ?? '5.5'), crank: 0, odo: 0,
  glideHold: false, glide: 0,             // glide 0..1 平滑
  bellAt: -9, jawOpen: 0, bellHead: 0, bellWag: 0,
  sceneIndex: 0, autoSceneAt: 42,
  camMode: 0,                             // 0跟拍 1侧拍 2迎面 3航拍
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
    // 机位预设的自动微动
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
  if (Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 9) state.userOrbit = true;
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
const $ = (id) => document.getElementById(id);
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
    if (conf.petals && Math.random() < 0.9) setTimeout(() => audio.chirp(), 900);
    state.autoSceneAt = state.t + 42;
    flash.classList.remove('on');
  }, 320);
  if (!manual) toast('前方到站：' + SCENES[((idx % 3) + 3) % 3].name);
}
function cycleSound() {
  state.soundMode = (state.soundMode + 2) % 3; // 2 -> 0 -> 1 -> 2
  audio.mode = state.soundMode === 1 ? 0 : state.soundMode; // 模式1=仅音效(无音乐)
  audio.master && (audio.master.gain.value = state.soundMode === 0 ? 0 : 0.9);
  $('btnSound').classList.toggle('active', state.soundMode !== 0);
  toast(['音乐+音效 🎵', '已静音 🔇', '仅音效 🔔'][(state.soundMode + 1) % 3] || '静音');
}
function takePhoto() {
  audio.shutter && audio.shutter();
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
$('btnCam').onclick = () => {
  state.camMode = (state.camMode + 1) % 4;
  state.userOrbit = false;
  toast('机位：' + CAM_NAMES[state.camMode]);
};
$('btnScene').onclick = () => switchScene(state.sceneIndex + 1);
$('btnSound').onclick = () => { audio.warm(); cycleSound(); };
$('btnPhoto').onclick = () => takePhoto();
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnHelpClose').onclick = () => $('help').classList.add('hidden');
$('speedSlider').oninput = (e) => { state.speed = parseFloat(e.target.value); };

// 键盘
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
let frames = 0, slowFrames = 0, degraded = false;
let hudTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (QS.get('still')) { /* 截图模式：时间冻结但渲染一帧 */ }
  state.t += dt;

  // 滑翔平滑 + 速度
  const glideT = state.glideHold ? 1 : 0;
  state.glide += (glideT - state.glide) * Math.min(1, dt * 3.2);
  const speed = state.speed * (1 + state.glide * 0.55);
  state.crank += THREE.MathUtils.clamp(speed * 1.15, 1.2, 9.0) * dt * (state.speed > 0.15 ? 1 : 0);
  state.odo += speed * dt;

  // 摇铃反应：张嘴 + 转头 + 摆尾
  const since = state.t - state.bellAt;
  if (since >= 0 && since < 1.4) {
    const k = since / 1.4;
    state.jawOpen = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.9;
    state.bellHead = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.5;
    state.bellWag = Math.sin(since * 14) * (1 - k) * 0.5;
  } else if (state.glide > 0.5 && Math.sin(state.t * 2) > 0.96) {
    state.jawOpen = 0.5;   // 滑翔开心叫
  } else { state.jawOpen *= Math.max(0, 1 - dt * 6); state.bellHead = 0; state.bellWag = 0; }

  if (world) world.update(dt, state.t, speed, state.glide);
  if (rider) rider.update(dt, state.t, speed, state.crank, state);
  updateCamera(dt);
  audio.ambience(speed, dt);

  // 自动换场景（未被 URL 禁用）
  if (!QS.get('scene') && state.t > state.autoSceneAt) switchScene(state.sceneIndex + 1, false);

  renderer.render(scene, camera);

  // HUD
  hudTimer += dt;
  if (hudTimer > 0.15) {
    hudTimer = 0;
    speedEl.textContent = Math.round(speed * 3.6);
    odoEl.textContent = (state.odo / 1000).toFixed(2) + ' km';
  }

  // 性能降级
  frames++;
  if (!degraded && frames > 60) {
    if (dt > 0.026) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90) {
      degraded = true;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.3));
      renderer.shadowMap.enabled = false;
      scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
      console.log('quality degraded');
    }
  }
  if (frames === 3) window.__ready = true;
}

// ---------- 自适应 ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 启动 ----------
(async () => {
  resize();
  try {
    const [pelicanG, bikeG, propsG] = await Promise.all([
      loadGLB('assets/pelican.glb').then(g => { tickLoad('鹈鹕上车…'); return g; }),
      loadGLB('assets/bike.glb').then(g => { tickLoad('自行车充气…'); return g; }),
      loadGLB('assets/props.glb').then(g => { tickLoad('布置沿途风光…'); return g; }),
    ]);
    world = new World(scene, buildTemplates(propsG.scene, gradientMap), gradientMap);
    rider = new Rider(bikeG.scene, pelicanG.scene, gradientMap);
    scene.add(rider.root);

    // URL 测试参数
    if (QS.get('scene') !== null) { switchScene(parseInt(QS.get('scene')) || 0); }
    else { const conf = SCENES[0]; $('hudScene').textContent = conf.name; audio.sceneKind = conf.id; }
    if (QS.get('cam')) {
      const i = ['follow', 'side', 'front', 'top'].indexOf(QS.get('cam'));
      if (i >= 0) state.camMode = i;
    }
    if (QS.get('auto')) { /* 自动运镜演示用 */ }

    audio.startMusic();
    loadFill.style.width = '100%';
    loadTip.textContent = '出发！';
    setTimeout(() => { document.getElementById('loading').classList.add('done'); showSceneBanner(SCENES[state.sceneIndex].name); }, 420);
  } catch (err) {
    loadTip.textContent = '加载失败：' + err.message;
    console.error(err);
    window.__ready = true;
  }
  animate();
})();
