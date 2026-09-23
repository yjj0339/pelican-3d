// 鹈鹕兜风 3D · 海滨晨骑
// Blender 建模 GLB + Three.js 实时渲染：蹬车 IK / 海浪 / 围巾布料 / 海鸥 / 加速互动
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js';

// ---------- 与 Blender 脚本一致的尺寸常量 ----------
const WHEEL_R = 0.34;
const BB = { x: -0.03, y: 0.30 }, CRANK_R = 0.17;
const HIP = { x: -0.16, y: 0.71 }, HIP_Z = 0.105;
const LEG_A = 0.30, LEG_B = 0.33, PEDAL_Z = 0.15, ANKLE_DY = 0.065;
const GEAR = 2.6;                    // 轮转速 / 曲柄转速

const CAM_PRESET = new URLSearchParams(location.search).get('cam') || '';

// ---------- 确定性随机（布景用，方便复现） ----------
let _seed = 20260923;
function rng() {
  _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const rnd = (a, b) => a + rng() * (b - a);

// ---------- 渲染器 / 场景 ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe4f4ff, 26, 78);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

// ---------- 天空穹顶（浅色渐变 + 太阳光晕） ----------
{
  const skyGeo = new THREE.SphereGeometry(95, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6fbdf0) },
      mid: { value: new THREE.Color(0xbfe6ff) },
      bot: { value: new THREE.Color(0xfff3dd) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vP; uniform vec3 top,mid,bot;',
      'void main(){ float h = normalize(vP).y;',
      'vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h));',
      'gl_FragColor = vec4(c, 1.0); }',
    ].join('\n'),
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 256;
  const g = cvs.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,246,215,1)');
  grd.addColorStop(0.25, 'rgba(255,236,180,.85)');
  grd.addColorStop(1, 'rgba(255,236,180,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, fog: false, depthWrite: false }));
  sun.position.set(-26, 17, -55); sun.scale.setScalar(26);
  scene.add(sun);
}

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0xfff0d8, 1.05));
const sunLight = new THREE.DirectionalLight(0xfff4de, 1.9);
sunLight.position.set(5, 9, 4.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -7; sunLight.shadow.camera.right = 7;
sunLight.shadow.camera.top = 8; sunLight.shadow.camera.bottom = -4;
sunLight.shadow.camera.far = 30;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);
const fill = new THREE.DirectionalLight(0xbfe0ff, 0.35);
fill.position.set(-6, 4, -5);
scene.add(fill);

// ---------- 地面：海面 / 浪花 / 沙滩 / 公路 / 草地 ----------
let seaGeo, seaPos, foamGeo, foamPos;
{
  seaGeo = new THREE.PlaneGeometry(150, 26, 110, 18);
  seaGeo.rotateX(-Math.PI / 2);
  seaPos = seaGeo.attributes.position;
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x6ecfe8, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.94 }));
  sea.position.set(0, 0.02, -15.5);
  sea.receiveShadow = true;
  scene.add(sea);
}
{
  foamGeo = new THREE.PlaneGeometry(150, 1.1, 110, 3);
  foamGeo.rotateX(-Math.PI / 2);
  foamPos = foamGeo.attributes.position;
  const foam = new THREE.Mesh(foamGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.85 }));
  foam.position.set(0, 0.045, -2.6);
  scene.add(foam);
}
{
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(150, 2.6), new THREE.MeshStandardMaterial({ color: 0xf6e9c6, roughness: 0.95 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, -1.35);
  sand.receiveShadow = true; scene.add(sand);
}
let roadTex;
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b5ada1'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 4, 512, 6); g.fillRect(0, 118, 512, 6);
  g.fillRect(30, 60, 130, 8);
  roadTex = new THREE.CanvasTexture(c);
  roadTex.wrapS = THREE.RepeatWrapping; roadTex.repeat.set(46, 1);
  roadTex.colorSpace = THREE.SRGBColorSpace;
  roadTex.anisotropy = 8;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 1.35), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.012, 0.32);
  road.receiveShadow = true; scene.add(road);
}
{
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(150, 7), new THREE.MeshStandardMaterial({ color: 0xa9de9d, roughness: 0.95 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.005, 4.4);
  grass.receiveShadow = true; scene.add(grass);
}

// ---------- GLB 加载 ----------
const loader = new GLTFLoader();
const loadFill = document.getElementById('loadFill');
const loadTip = document.getElementById('loadTip');
let loadDone = 0;
function tickLoad(tip) { loadDone++; loadFill.style.width = (loadDone / 2 * 88 + 6) + '%'; if (tip) loadTip.textContent = tip; }
function loadGLB(url) { return new Promise((res, rej) => loader.load(url, res, undefined, rej)); }

// ---------- 命名节点引用 ----------
const P = {};
const rig = new THREE.Group();
scene.add(rig);
const TPL = {};
const gullTpl = new THREE.Group();

function collectGroup(sceneRoot, prefix) {
  const grp = new THREE.Group();
  const nodes = [];
  sceneRoot.traverse(o => { if (o.name.startsWith(prefix)) nodes.push(o); });
  for (const n of nodes) grp.add(n.clone(true));
  return grp;
}

// ---------- 滚动布景 ----------
const scrollers = [];
function place(obj, x, y, z, s, ry, parallax) {
  obj.position.set(x, y, z);
  obj.scale.setScalar(s);
  obj.rotation.y = ry;
  obj.traverse(o => { if (o.isMesh) { o.castShadow = parallax === 1; o.receiveShadow = parallax === 1; } });
  scene.add(obj);
  scrollers.push({ obj, parallax });
}

// ---------- 动画状态 ----------
const state = {
  t: 0, speed: 2.6, crank: 0, bellAt: -9, boost: false,
  camAz: 0.32, camEl: 0.16, camR: 2.9,
};

// ---------- 围巾布料（红丝带） ----------
let scarf, scarfGeo;
const SCARF_N = 16, SCARF_SEG = 0.052;
function buildScarf() {
  scarfGeo = new THREE.BufferGeometry();
  const verts = new Float32Array(SCARF_N * 2 * 3);
  const idx = [];
  for (let i = 0; i < SCARF_N - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  scarfGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  scarfGeo.setIndex(idx);
  const smat = new THREE.MeshStandardMaterial({ color: 0xe8452f, roughness: 0.7, side: THREE.DoubleSide });
  scarf = new THREE.Mesh(scarfGeo, smat);
  scarf.frustumCulled = false;
  rig.add(scarf);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), smat);
  knot.position.set(-0.01, 1.06, 0);
  rig.add(knot);
}
function updateScarf() {
  const t = state.t, amp = 0.022 + state.speed * 0.012;
  const pos = scarfGeo.attributes.position;
  for (let i = 0; i < SCARF_N; i++) {
    const k = i / (SCARF_N - 1);
    const x = -0.01 - i * SCARF_SEG * (0.75 + state.speed * 0.06);
    const y = 1.06 - k * 0.10 + Math.sin(t * 6 - i * 0.75) * amp * (0.25 + k);
    const z = Math.sin(t * 4.2 - i * 0.55) * amp * 0.7 * k;
    const w = 0.026 * (1 - k * 0.55);
    pos.setXYZ(i * 2, x, y, z - w);
    pos.setXYZ(i * 2 + 1, x, y, z + w);
  }
  pos.needsUpdate = true;
  scarfGeo.computeVertexNormals();
}

// ---------- 花瓣粒子 ----------
const PETALS = 34;
let petalMesh;
const petalData = [];
function buildPetals() {
  const geo = new THREE.PlaneGeometry(0.045, 0.03);
  const m = new THREE.MeshBasicMaterial({ color: 0xffc9d4, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  petalMesh = new THREE.InstancedMesh(geo, m, PETALS);
  petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(petalMesh);
  for (let i = 0; i < PETALS; i++) {
    petalData.push({ x: rnd(-30, 30), y: rnd(0.3, 3.2), z: rnd(-3, 5), ph: rnd(0, 6.28), s: rnd(0.7, 1.4) });
  }
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _sv = new THREE.Vector3();
function updatePetals(dt) {
  for (let i = 0; i < PETALS; i++) {
    const p = petalData[i];
    p.x -= (state.speed * 0.45 + 0.35) * dt * p.s;
    p.y += Math.sin(state.t * 1.7 + p.ph) * 0.12 * dt;
    if (p.x < -32) { p.x += 64; p.y = rnd(0.3, 3.2); p.z = rnd(-3, 5); }
    _e.set(state.t * 2 * p.s + p.ph, p.ph, state.t * 1.5);
    _q.setFromEuler(_e);
    _v.set(p.x, p.y, p.z);
    _sv.set(p.s, p.s, p.s);
    _m4.compose(_v, _q, _sv);
    petalMesh.setMatrixAt(i, _m4);
  }
  petalMesh.instanceMatrix.needsUpdate = true;
}

// ---------- 海鸥 ----------
const gulls = [];
function addGulls() {
  for (let i = 0; i < 3; i++) {
    const g = gullTpl.clone(true);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    scene.add(g);
    gulls.push({
      grp: g, wl: g.getObjectByName('GullWingL'), wr: g.getObjectByName('GullWingR'),
      cx: rnd(-8, 8), cy: rnd(2.6, 4.2), cz: rnd(-9, -5), r: rnd(2.5, 5), ph: rnd(0, 6.28), sp: rnd(0.25, 0.45),
    });
  }
}
function updateGulls() {
  for (const g of gulls) {
    const a = state.t * g.sp + g.ph;
    g.grp.position.set(g.cx + Math.cos(a) * g.r, g.cy + Math.sin(state.t * 0.8 + g.ph) * 0.25, g.cz + Math.sin(a) * g.r * 0.6);
    g.grp.rotation.y = -a;
    const flap = Math.sin(state.t * 7 + g.ph) * 0.55;
    if (g.wl) g.wl.rotation.x = flap;
    if (g.wr) g.wr.rotation.x = -flap;
  }
}

// ---------- 车 + 鹈鹕装配 ----------
let headGrp, tailGrp, wingL, wingR;
function assemble(gltf) {
  const root = gltf.scene;
  root.traverse(o => {
    if (o.isMesh) o.castShadow = true;
    if (o.name) P[o.name] = o;
  });
  rig.add(root);
  headGrp = new THREE.Group();
  headGrp.position.set(0.045, 1.165, 0);
  rig.add(headGrp);
  const headParts = [P.Head, P.BeakUpper, P.Pouch, P.EyeL, P.EyeR, P.PupilL, P.PupilR, P.Crest0, P.Crest1, P.Crest2];
  for (const h of headParts) { if (h) headGrp.attach(h); }
  tailGrp = new THREE.Group();
  tailGrp.position.set(-0.29, 0.865, 0);
  rig.add(tailGrp);
  if (P.Tail) tailGrp.attach(P.Tail);
  wingL = P.WingL; wingR = P.WingR;
  if (wingL && P.WingTipL) wingL.attach(P.WingTipL);
  if (wingR && P.WingTipR) wingR.attach(P.WingTipR);
}

// ---------- 两腿 IK ----------
function ikKnee(Hx, Hy, Tx, Ty) {
  let dx = Tx - Hx, dy = Ty - Hy;
  let d = Math.hypot(dx, dy);
  const maxD = LEG_A + LEG_B - 1e-4;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; Tx = Hx + dx; Ty = Hy + dy; }
  const base = Math.atan2(dy, dx);
  const cosA = Math.min(1, Math.max(-1, (LEG_A * LEG_A + d * d - LEG_B * LEG_B) / (2 * LEG_A * d)));
  const A = Math.acos(cosA);
  let best = null;
  for (const bend of [1, -1]) {
    const ka = base + bend * A;
    const kx = Hx + LEG_A * Math.cos(ka), ky = Hy + LEG_A * Math.sin(ka);
    if (!best || kx > best.x) best = { x: kx, y: ky };
  }
  return best;
}
function poseLeg(s, pedalAng, up, low, foot) {
  const px = BB.x + CRANK_R * Math.cos(pedalAng);
  const py = BB.y + CRANK_R * Math.sin(pedalAng);
  const hz = s * HIP_Z, pz = s * PEDAL_Z;
  const Tx = px, Ty = py + ANKLE_DY;
  const K = ikKnee(HIP.x, HIP.y, Tx, Ty);
  up.position.set(HIP.x, HIP.y, hz);
  up.rotation.z = Math.atan2(K.x - HIP.x, -(K.y - HIP.y));
  low.position.set(K.x, K.y, hz);
  low.rotation.z = Math.atan2(Tx - K.x, -(Ty - K.y));
  foot.position.set(Tx, Ty, pz);
  foot.rotation.z = -0.08;
}

// ---------- 道具布景 ----------
function scatterProps() {
  const hills = [TPL.Hill0, TPL.Hill1, TPL.Hill2];
  const clouds = [TPL.Cloud0, TPL.Cloud1, TPL.Cloud2];
  const rocks = [TPL.Rock0, TPL.Rock1];
  const grass = [TPL.Grass0, TPL.Grass1];
  const at = (arr, i) => arr[i % arr.length].clone(true);
  for (let i = 0; i < 6; i++) place(at(hills, i), -60 + i * 20 + rnd(-4, 4), 0, rnd(-34, -26), rnd(1.6, 2.6), rnd(0, 6), 0.12);
  for (let i = 0; i < 8; i++) place(at(clouds, i), -60 + i * 15 + rnd(-5, 5), rnd(4.2, 7.5), rnd(-30, -10), rnd(1.2, 2.4), 0, 0.25);
  for (let i = 0; i < 3; i++) place(TPL.Buoy.clone(true), rnd(-30, 30), 0.02, rnd(-11, -6), 1, rnd(0, 6), 0.9);
  for (let i = 0; i < 7; i++) place(TPL.Palm.clone(true), -52 + i * 15 + rnd(-4, 4), 0, rnd(-2.35, -1.7), rnd(0.8, 1.25), rnd(0, 6.28), 1);
  for (let i = 0; i < 3; i++) place(TPL.Umb.clone(true), -40 + i * 30 + rnd(-6, 6), 0, rnd(-2.2, -1.8), rnd(0.9, 1.1), rnd(0, 6.28), 1);
  for (let i = 0; i < 6; i++) place(at(rocks, i), rnd(-55, 55), 0, rnd(-2.4, -1.6), rnd(0.5, 1.1), rnd(0, 6), 1);
  for (let i = 0; i < 5; i++) place(TPL.Starfish.clone(true), rnd(-55, 55), 0.005, rnd(-2.3, -1.5), rnd(0.7, 1.2), rnd(0, 6), 1);
  for (let i = 0; i < 16; i++) place(at(grass, i), -60 + i * 7.5 + rnd(-2, 2), 0, rnd(1.1, 1.6), rnd(0.8, 1.5), rnd(0, 6), 1);
  place(TPL.Sign.clone(true), -18, 0, -1.45, 1, 0, 1);
  place(TPL.Sign.clone(true), 34, 0, -1.45, 1, 0, 1);
}

// ---------- 相机预设（截图用） ----------
function applyCamPreset() {
  if (CAM_PRESET === 'side') { state.camAz = 0.02; state.camEl = 0.10; state.camR = 3.1; }
  else if (CAM_PRESET === 'front') { state.camAz = 1.25; state.camEl = 0.12; state.camR = 3.0; }
  else if (CAM_PRESET === 'top') { state.camAz = 0.5; state.camEl = 0.62; state.camR = 4.2; }
}

// ---------- 交互：拖动 / 缩放 / 按住加速 / 点按摇铃 ----------
const pointers = new Map();
let downAt = 0, downXY = null, pinchD = 0;

canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = performance.now(); downXY = { x: e.clientX, y: e.clientY };
  if (pointers.size === 2) {
    const vals = Array.from(pointers.values());
    pinchD = Math.hypot(vals[0].x - vals[1].x, vals[0].y - vals[1].y);
  }
  state.boost = true;
  bell.warm();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    state.camAz = THREE.MathUtils.clamp(state.camAz - dx * 0.004, -1.2, 1.5);
    state.camEl = THREE.MathUtils.clamp(state.camEl + dy * 0.003, 0.03, 0.75);
  } else if (pointers.size === 2) {
    const vals = Array.from(pointers.values());
    const d = Math.hypot(vals[0].x - vals[1].x, vals[0].y - vals[1].y);
    state.camR = THREE.MathUtils.clamp(state.camR * (pinchD / (d || 1)), 1.7, 5.5);
    pinchD = d;
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) state.boost = false;
  const dt = performance.now() - downAt;
  const moved = downXY ? Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) : 99;
  if (dt < 260 && moved < 8) ringBell();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (pointers.size === 0) state.boost = false; });
canvas.addEventListener('wheel', e => {
  state.camR = THREE.MathUtils.clamp(state.camR * (1 + Math.sign(e.deltaY) * 0.08), 1.7, 5.5);
}, { passive: true });

// ---------- 铃铛音效 ----------
const bell = createBell();
function ringBell() {
  state.bellAt = state.t;
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 900);
  bell.ding();
}
function createBell() {
  let ctx = null;
  function warm() {
    if (!ctx && window.AudioContext) ctx = new AudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function tone(freq, gain, dur) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, t0);
    vol.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
  function ding() {
    tone(2093, 0.20, 0.9);
    tone(2637, 0.12, 0.7);
    tone(3520, 0.06, 0.4);
  }
  return { warm, ding };
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.t += dt;

  const target = state.boost ? 6.2 : 2.6;
  state.speed += (target - state.speed) * Math.min(1, dt * 2.2);
  const v = state.speed;
  const wheelW = v / WHEEL_R;
  const crankW = wheelW / GEAR;
  state.crank += crankW * dt;

  roadTex.offset.x -= v * dt / (150 / 46);
  for (const s of scrollers) {
    s.obj.position.x -= v * s.parallax * dt;
    if (s.obj.position.x < -62) s.obj.position.x += 124;
  }

  // 海浪
  for (let i = 0; i < seaPos.count; i++) {
    const x = seaPos.getX(i), z = seaPos.getZ(i);
    seaPos.setY(i, Math.sin(x * 0.32 + state.t * 1.1) * 0.055 + Math.sin(x * 0.13 + z * 0.55 + state.t * 0.7) * 0.05);
  }
  seaPos.needsUpdate = true;
  seaGeo.computeVertexNormals();
  for (let i = 0; i < foamPos.count; i++) {
    const x = foamPos.getX(i), z = foamPos.getZ(i);
    foamPos.setY(i, Math.sin(x * 0.5 + state.t * 1.6 + z * 2.0) * 0.03);
  }
  foamPos.needsUpdate = true;

  // 车 + 鹈鹕
  rig.position.y = Math.sin(state.t * wheelW * 2) * 0.005 + Math.sin(state.t * 3.1) * 0.003;
  if (P.WheelF) P.WheelF.rotation.z -= wheelW * dt;
  if (P.WheelR) P.WheelR.rotation.z -= wheelW * dt;
  if (P.Crank) P.Crank.rotation.z = -state.crank;
  const aL = -Math.PI / 2 - state.crank;
  if (P.LegUpL) poseLeg(-1, aL, P.LegUpL, P.LegLowL, P.FootL);
  if (P.LegUpR) poseLeg(1, aL + Math.PI, P.LegUpR, P.LegLowR, P.FootR);
  if (P.PedalL) {
    P.PedalL.position.set(BB.x + CRANK_R * Math.cos(aL), BB.y + CRANK_R * Math.sin(aL), -PEDAL_Z);
    P.PedalR.position.set(BB.x + CRANK_R * Math.cos(aL + Math.PI), BB.y + CRANK_R * Math.sin(aL + Math.PI), PEDAL_Z);
  }

  // 翅膀：巡航微摆，摇铃/加速时扑扇
  const sinceBell = state.t - state.bellAt;
  const burst = sinceBell < 1.2 ? Math.sin(sinceBell * 18) * 0.5 * (1 - sinceBell / 1.2) : 0;
  const flapAmp = state.boost ? 0.16 : 0.05;
  const flap = Math.sin(state.t * (state.boost ? 9 : 3)) * flapAmp + burst;
  if (wingL) wingL.rotation.x = flap;
  if (wingR) wingR.rotation.x = -flap;
  if (headGrp) {
    headGrp.rotation.z = Math.sin(state.t * 2.2) * 0.045 - (state.boost ? 0.06 : 0);
    headGrp.rotation.y = sinceBell < 1.0 ? Math.sin(Math.min(1, Math.max(0, sinceBell) / 0.25) * Math.PI * 0.5) * 0.6 : 0;
  }
  if (tailGrp) tailGrp.rotation.z = Math.sin(state.t * 3.2 + 1) * 0.06 + (state.boost ? 0.1 : 0);

  updateScarf();
  updatePetals(dt);
  updateGulls();

  // 相机
  const tgt = new THREE.Vector3(0.05, 0.82, 0);
  camera.position.set(
    tgt.x + state.camR * Math.sin(state.camAz) * Math.cos(state.camEl),
    tgt.y + state.camR * Math.sin(state.camEl),
    tgt.z + state.camR * Math.cos(state.camAz) * Math.cos(state.camEl)
  );
  camera.lookAt(tgt);
  const targetFov = state.boost ? 48 : (innerWidth < 640 ? 50 : 42);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  frames++;
  if (frames === 3) window.__ready = true;
}

// ---------- 启动 ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  if (innerWidth < 640) state.camR = Math.max(state.camR, 3.6);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

(async () => {
  resize();
  applyCamPreset();
  try {
    const bikeP = loadGLB('assets/pelican_bike.glb').then(g => { tickLoad('鹈鹕上车成功…'); return g; });
    const propsP = loadGLB('assets/scenery.glb').then(g => { tickLoad('海边布景就绪…'); return g; });
    const bike = await bikeP;
    const props = await propsP;
    assemble(bike);
    const ps = props.scene;
    TPL.Palm = collectGroup(ps, 'Palm_');
    TPL.Umb = collectGroup(ps, 'Umb_');
    TPL.Buoy = collectGroup(ps, 'Buoy');
    TPL.Rock0 = collectGroup(ps, 'Rock0');
    TPL.Rock1 = collectGroup(ps, 'Rock1');
    TPL.Grass0 = collectGroup(ps, 'Grass0');
    TPL.Grass1 = collectGroup(ps, 'Grass1');
    TPL.Cloud0 = collectGroup(ps, 'Cloud0');
    TPL.Cloud1 = collectGroup(ps, 'Cloud1');
    TPL.Cloud2 = collectGroup(ps, 'Cloud2');
    TPL.Hill0 = collectGroup(ps, 'Hill0');
    TPL.Hill1 = collectGroup(ps, 'Hill1');
    TPL.Hill2 = collectGroup(ps, 'Hill2');
    TPL.Starfish = collectGroup(ps, 'Starfish');
    TPL.Sign = collectGroup(ps, 'Sign_');
    {
      const nodes = [];
      ps.traverse(o => { if (o.name.startsWith('Gull')) nodes.push(o); });
      for (const n of nodes) gullTpl.add(n.clone(true));
    }
    scatterProps();
    addGulls();
    buildScarf();
    buildPetals();
    loadFill.style.width = '100%';
    loadTip.textContent = '出发！';
    setTimeout(() => document.getElementById('loader').classList.add('done'), 350);
  } catch (err) {
    loadTip.textContent = '加载失败：' + err.message;
    console.error(err);
  }
  animate();
})();

// 速度表
const speedEl = document.getElementById('speed');
setInterval(() => { speedEl.textContent = Math.round(state.speed * 7.2); }, 120);
