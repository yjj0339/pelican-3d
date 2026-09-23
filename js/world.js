// 世界模块：天空/海面/路面 Shader + 地形分块 + 道具布景 + 粒子 + 三大场景
import * as THREE from '../vendor/three.module.min.js';

// ---------- 确定性随机 ----------
let _seed = 20260923;
function rng() {
  _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const rnd = (a, b) => a + rng() * (b - a);

// ---------- 场景配置（明亮浅色铁律） ----------
export const SCENES = [
  {
    id: 'coast', name: '海岸晨风',
    sky: { top: 0x6fbdf0, mid: 0xbfe6ff, bot: 0xfff3dd },
    fog: 0xdfF0ff, fogNear: 30, fogFar: 95,
    sun: { color: 0xfff2d8, intensity: 2.1, dir: [5, 9, 4] },
    hemi: { sky: 0xcfe9ff, ground: 0xffeed6, i: 1.05 },
    grass: [0x8fd694, 0x7cc780], shoulder: 0xf3e3b8,
    road: 0xb9b2a6,
    sea: true, petals: false,
    props: ['PalmTree', 'Lighthouse', 'Sailboat', 'Rock', 'Bush', 'Sign', 'Gull'],
  },
  {
    id: 'sakura', name: '樱花原野',
    sky: { top: 0x8ed2f5, mid: 0xd9ecff, bot: 0xffe9f0 },
    fog: 0xf0e8f2, fogNear: 28, fogFar: 88,
    sun: { color: 0xfff6e6, intensity: 2.0, dir: [4, 8, 5] },
    hemi: { sky: 0xe3f0ff, ground: 0xffe4ec, i: 1.0 },
    grass: [0x9fdd8e, 0x8bcf7d], shoulder: 0xbfe8a8,
    road: 0xbcb5aa,
    sea: false, petals: true,
    props: ['CherryTree', 'PineTree', 'Fence', 'Bush', 'Windmill', 'Rock', 'Sign'],
  },
  {
    id: 'sunset', name: '落日葵海',
    sky: { top: 0xffc98a, mid: 0xffe3b0, bot: 0xfff1cf },
    fog: 0xffe7c4, fogNear: 26, fogFar: 85,
    sun: { color: 0xffd9a0, intensity: 2.3, dir: [-6, 5, 6] },
    hemi: { sky: 0xffe0b8, ground: 0xffd090, i: 0.95 },
    grass: [0xe8c86e, 0xd8b656], shoulder: 0xe8d49a,
    road: 0xb5a89a,
    sea: false, petals: false,
    props: ['Sunflowers', 'StreetLamp', 'Balloon', 'Rock', 'Fence', 'Sign', 'PineTree'],
  },
];

// ---------- 卡通渐变影调 ----------
export function makeGradientMap() {
  const data = new Uint8Array([90, 160, 215, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
export function toonify(root, gradientMap) {
  root.traverse(o => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
      const old = o.material;
      const m = new THREE.MeshToonMaterial({
        color: old.color.clone(),
        gradientMap,
        emissive: old.emissive ? old.emissive.clone() : new THREE.Color(0),
        emissiveIntensity: old.emissiveIntensity || 1,
      });
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export class World {
  constructor(scene, propTemplates, gradientMap) {
    this.scene = scene;
    this.tpl = propTemplates || null;      // 可后置注入（渐进加载）
    this.grad = gradientMap;
    this.sceneIndex = 0;
    this.scrollZ = 0;
    this.animNodes = [];   // {node, kind, seed}
    this._clouds = [];

    this._buildSky();
    this._buildLights();
    this._buildRoad();
    this._buildSea();
    this._buildTerrain();
    if (this.tpl) this._buildClouds();
    this._buildPetals();
    this._buildSpeedLines();
    this.applyScene(0, true);
  }

  // 道具模板后置注入：重铺所有分块与云
  attachPropTemplates(tpl) {
    this.tpl = tpl;
    this._buildClouds();
    this.animNodes = [];
    this.chunks.forEach((c, i) => this._populateChunk(c, i));
  }

  // ================= 天空 =================
  _buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color() },
      mid: { value: new THREE.Color() },
      bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.4).normalize() },
      sunColor: { value: new THREE.Color(0xfff0c8) },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vP; uniform vec3 top,mid,bot,sunColor; uniform vec3 sunDir;
        void main(){
          vec3 d = normalize(vP);
          vec3 c = d.y > 0.10 ? mix(mid, top, smoothstep(0.10, 0.72, d.y))
                              : mix(bot, mid, smoothstep(-0.06, 0.10, d.y));
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(s, 220.0) * 0.9 + pow(s, 18.0) * 0.16);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 18), mat);
    this.scene.add(this.sky);
  }

  // ================= 灯光 =================
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe9ff, 0xffeed6, 1.05);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    this.sun.position.set(5, 9, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -9; c.right = 9; c.top = 10; c.bottom = -4; c.far = 34;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.32);
    fill.position.set(-6, 4, -5);
    this.scene.add(fill);
    this.scene.fog = new THREE.Fog(0xdff0ff, 30, 95);
  }

  // ================= 路面（Shader 车道线 + 无限滚动） =================
  _buildRoad() {
    this.roadUniforms = {
      uScroll: { value: 0 },
      uBase: { value: new THREE.Color(0xb9b2a6) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.roadUniforms,
      vertexShader: `
        varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vW;
        uniform float uScroll; uniform vec3 uBase;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float z = vW.z + uScroll;
          float x = abs(vW.x);
          vec3 c = uBase * (0.96 + hash(floor(vec2(vW.x*8.0, z*1.3))) * 0.08);
          // 路肩暖色
          c = mix(c, uBase * vec3(1.12, 1.05, 0.9), smoothstep(1.35, 1.8, x));
          // 边线
          c = mix(c, vec3(0.98), smoothstep(0.035, 0.02, abs(x - 1.52)) * 0.9);
          // 中央虚线
          float dash = step(fract(z / 6.0), 0.5);
          c = mix(c, vec3(1.0), dash * smoothstep(0.05, 0.03, x) * 0.95);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 260), mat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.012, 60);
    road.receiveShadow = true;
    this.scene.add(road);
  }

  // ================= 海面（仅海岸场景，着色器波浪 + 浪沫） =================
  _buildSea() {
    this.seaUniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x62c4e6) },
      uColorB: { value: new THREE.Color(0x9adcf0) },
      uDeep: { value: new THREE.Color(0x4aa8d0) },
    };
    const geo = new THREE.PlaneGeometry(160, 240, 90, 90);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaUniforms,
      vertexShader: `
        uniform float uTime; varying float vH; varying vec3 vW;
        void main(){
          vec3 p = position;
          float w1 = sin(p.z * 0.14 + uTime * 1.1) * 0.14;
          float w2 = sin(p.x * 0.21 + p.z * 0.07 + uTime * 0.7) * 0.11;
          float w3 = sin(p.x * 0.55 - uTime * 1.7) * 0.04;
          p.y += w1 + w2 + w3;
          vH = w1 + w2 + w3;
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 uColorA, uColorB, uDeep; uniform float uTime;
        varying float vH; varying vec3 vW;
        void main(){
          float band = floor(vH * 14.0) / 14.0;
          vec3 c = mix(uDeep, uColorA, smoothstep(-0.2, 0.25, band));
          c = mix(c, uColorB, smoothstep(0.12, 0.3, band));
          float foam = smoothstep(0.24, 0.32, vH + sin(vW.z * 2.0 + uTime * 2.0) * 0.03);
          c = mix(c, vec3(1.0), foam);
          float shore = smoothstep(-13.5, -11.0, vW.x);
          c = mix(c, vec3(1.0, 0.99, 0.95), shore * (0.5 + 0.5 * sin(vW.z * 0.8 + uTime * 1.5)));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.position.set(-88, -0.15, 40);
    this.sea.visible = false;
    this.scene.add(this.sea);
  }

  // ================= 地形（滚动分块 + 顶点色） =================
  _buildTerrain() {
    this.chunks = [];
    const CHUNK_LEN = 60, N = 6;
    for (let i = 0; i < N; i++) {
      const geo = new THREE.PlaneGeometry(170, CHUNK_LEN, 40, 14);
      geo.rotateX(-Math.PI / 2);
      const colors = new Float32Array(geo.attributes.position.count * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.grad });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, 0, i * CHUNK_LEN - 30);
      m.receiveShadow = true;
      this.scene.add(m);
      this.chunks.push({ mesh: m, len: CHUNK_LEN, props: [] });
    }
  }
  _displaceChunk(chunk, index) {
    const conf = SCENES[this.sceneIndex];
    const pos = chunk.mesh.geometry.attributes.position;
    const col = chunk.mesh.geometry.attributes.color;
    const cA = new THREE.Color(conf.grass[0]), cB = new THREE.Color(conf.grass[1]);
    const sh = new THREE.Color(conf.shoulder);
    const wave = rnd(0.4, 1.0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const ax = Math.abs(x);
      let h = 0;
      if (ax > 7) {
        const t = Math.min(1, (ax - 7) / 26);
        h = t * t * rnd(0.0, 5.5) * 0.5
          + Math.sin(x * 0.06 + index * 2.7 + wave * 6) * 1.5 * t
          + Math.sin(x * 0.023 + z * 0.011 + index) * 2.6 * t;
        h *= t;
      }
      pos.setY(i, h);
      const c = cA.clone().lerp(cB, (Math.sin(x * 0.11 + z * 0.05 + index * 3.1) + 1) / 2);
      if (ax < 6.5) c.lerp(sh, 1 - ax / 6.5);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    chunk.mesh.geometry.computeVertexNormals();
  }

  // ================= 道具分块布景 =================
  _populateChunk(chunk, index) {
    // 清掉旧道具
    for (const p of chunk.props) {
      this.scene.remove(p.obj);
      if (p.pool) p.pool.push(p.obj);
    }
    chunk.props = [];
    if (!this.tpl) return;                 // 道具还没到，先只跑地形
    const conf = SCENES[this.sceneIndex];
    const zBase = chunk.mesh.position.z;
    const add = (name, x, z, s, ry, y = 0) => {
      const tpl = this.tpl[name];
      if (!tpl) return;
      const obj = tpl.pool.length ? tpl.pool.pop() : tpl.proto.clone(true);
      obj.position.set(x, y, zBase + z);
      obj.scale.setScalar(s);
      obj.rotation.y = ry;
      obj.visible = true;
      this.scene.add(obj);
      chunk.props.push({ obj, pool: tpl.pool });
      // 记录动画节点
      if (name === 'Windmill') {
        const hub = obj.getObjectByName('MillHub');
        if (hub) this.animNodes.push({ node: hub, kind: 'mill', seed: rnd(0, 9), obj });
      }
      if (name === 'Balloon') this.animNodes.push({ node: obj, kind: 'balloon', seed: rnd(0, 9), baseY: y });
      if (name === 'Sailboat') this.animNodes.push({ node: obj, kind: 'boat', seed: rnd(0, 9) });
      if (name === 'Gull') {
        const wl = obj.getObjectByName('GullWL'), wr = obj.getObjectByName('GullWR');
        if (wl) this.animNodes.push({ node: wl, kind: 'gullwing', seed: rnd(0, 9), base: wl.quaternion.clone() });
        if (wr) this.animNodes.push({ node: wr, kind: 'gullwing', seed: rnd(0, 9), base: wr.quaternion.clone() });
        this.animNodes.push({ node: obj, kind: 'gullfly', seed: rnd(0, 9), baseY: y, baseZ: zBase + z, baseX: x });
      }
      if (name === 'Lighthouse' || name === 'StreetLamp') { /* 发光材质已带 */ }
    };
    const inSea = (fn) => { if (conf.sea) fn(); };

    // 左右路旁（|x| 3.2..8）常规
    const side = () => (rng() < 0.5 ? -1 : 1);
    for (let i = 0; i < 9; i++) {
      const x = side() * rnd(3.4, 9);
      const z = rnd(-28, 28);
      const pick = conf.props[(rng() * conf.props.length) | 0];
      if (pick === 'Gull' || pick === 'Sailboat' || pick === 'Lighthouse') continue;
      const big = (pick === 'CherryTree' || pick === 'PineTree' || pick === 'PalmTree' || pick === 'Windmill');
      if (big && rng() < 0.6) continue; // 大件稀疏
      const s = pick === 'Sunflowers' ? rnd(0.8, 1.3)
        : pick === 'Rock' ? rnd(0.5, 1.1)
        : pick === 'Fence' ? rnd(0.9, 1.2)
        : pick === 'StreetLamp' ? rnd(0.9, 1.15)
        : pick === 'Balloon' ? rnd(0.85, 1.25)
        : pick === 'Bush' ? rnd(0.8, 1.4)
        : pick === 'Sign' ? rnd(0.9, 1.1)
        : rnd(0.85, 1.35);
      add(pick, x, z, s, pick === 'Fence' ? (x < 0 ? 0 : 0) : rnd(0, 6.28));
    }
    // 场景特征件
    if (conf.sea) {
      add('Lighthouse', rnd(-26, -20), rnd(-15, 15), rnd(0.9, 1.2), rnd(0, 6.28), 0.3);
      for (let i = 0; i < 3; i++) add('Sailboat', rnd(-55, -22), rnd(-25, 25), rnd(0.7, 1.3), rnd(0, 6.28), -0.1);
      for (let i = 0; i < 4; i++) add('Gull', rnd(-14, 14), rnd(-25, 25), rnd(0.8, 1.3), rnd(0, 6.28), rnd(4, 8));
      for (let i = 0; i < 3; i++) add('PalmTree', -rnd(4.5, 10), rnd(-26, 26), rnd(0.8, 1.2), rnd(0, 6.28));
    }
    if (conf.id === 'sakura') {
      // 樱花树：每块保底 3 棵近路侧 + 远处一排
      for (let i = 0; i < 3; i++) add('CherryTree', side() * rnd(4.0, 7.5), rnd(-24, 24), rnd(0.95, 1.35), rnd(0, 6.28));
      for (let i = 0; i < 3; i++) add('CherryTree', side() * rnd(12, 22), rnd(-26, 26), rnd(1.1, 1.6), rnd(0, 6.28));
      if (rng() < 0.8) add('Windmill', (rng() < 0.5 ? -1 : 1) * rnd(10, 18), rnd(-15, 15), rnd(0.9, 1.2), rnd(0, 6.28));
      for (let i = 0; i < 5; i++) add('Fence', (rng() < 0.5 ? -1 : 1) * rnd(4.2, 6), rnd(-26, 26), 1, 0);
      for (let i = 0; i < 4; i++) add('Bush', side() * rnd(3.6, 8), rnd(-26, 26), rnd(0.9, 1.4), rnd(0, 6.28));
    }
    if (conf.id === 'sunset') {
      // 葵海：路两侧连续向日葵带 + 低空热气球保底 2 个
      for (let i = 0; i < 10; i++) add('Sunflowers', (rng() < 0.5 ? -1 : 1) * rnd(3.2, 9), rnd(-27, 27), rnd(0.9, 1.5), rnd(0, 6.28));
      for (let i = 0; i < 4; i++) add('Sunflowers', (rng() < 0.5 ? -1 : 1) * rnd(10, 18), rnd(-27, 27), rnd(1.1, 1.7), rnd(0, 6.28));
      add('Balloon', rnd(-24, 24), rnd(-16, 16), rnd(0.9, 1.3), rnd(0, 6.28), rnd(4.5, 8));
      add('Balloon', rnd(-28, 28), rnd(-18, 18), rnd(0.8, 1.2), rnd(0, 6.28), rnd(5, 10));
      for (let i = 0; i < 3; i++) add('StreetLamp', (rng() < 0.5 ? -1 : 1) * rnd(3.6, 5), rnd(-26, 26), 1, 0);
    }
  }

  // ================= 云 =================
  _buildClouds() {
    const tpl = this.tpl && this.tpl['Cloud'];
    if (!tpl) return;
    for (let i = 0; i < 10; i++) {
      const obj = tpl.pool.length ? tpl.pool.pop() : tpl.proto.clone(true);
      obj.position.set(rnd(-90, 90), rnd(14, 30), rnd(-40, 160));
      obj.scale.setScalar(rnd(1.2, 2.8));
      obj.rotation.y = rnd(0, 6.28);
      this.scene.add(obj);
      this._clouds.push(obj);
    }
  }

  // ================= 花瓣（樱花场景） =================
  _buildPetals() {
    const N = 240;
    const geo = new THREE.PlaneGeometry(0.065, 0.045);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc4d2, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    this.petalMesh = new THREE.InstancedMesh(geo, mat, N);
    this.petalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.petalMesh.frustumCulled = false;
    this.petals = [];
    for (let i = 0; i < N; i++) {
      this.petals.push({ x: rnd(-16, 16), y: rnd(0.3, 7), z: rnd(-18, 22), ph: rnd(0, 6.28), s: rnd(0.7, 1.5) });
    }
    this.scene.add(this.petalMesh);
  }

  // ================= 速度线（滑翔时） =================
  _buildSpeedLines() {
    const N = 36;
    const geo = new THREE.BoxGeometry(0.012, 0.012, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    this.lineMesh = new THREE.InstancedMesh(geo, mat, N);
    this.lineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lineMesh.frustumCulled = false;
    this.lineMesh.visible = false;
    this.lines = [];
    for (let i = 0; i < N; i++) this.lines.push({ r: rnd(1.6, 4.5), a: rnd(0, 6.28), z: rnd(-6, 6), sp: rnd(14, 24) });
    this.scene.add(this.lineMesh);
  }

  // ================= 场景应用 / 切换 =================
  applyScene(index, instant = false) {
    this.sceneIndex = ((index % 3) + 3) % 3;
    const conf = SCENES[this.sceneIndex];
    this.skyUniforms.top.value.setHex(conf.sky.top);
    this.skyUniforms.mid.value.setHex(conf.sky.mid);
    this.skyUniforms.bot.value.setHex(conf.sky.bot);
    const sd = new THREE.Vector3(...conf.sun.dir).normalize();
    this.skyUniforms.sunDir.value.copy(sd);
    this.sun.position.set(...conf.sun.dir).multiplyScalar(2.2);
    this.sun.color.setHex(conf.sun.color);
    this.sun.intensity = conf.sun.intensity;
    this.hemi.color.setHex(conf.hemi.sky);
    this.hemi.groundColor.setHex(conf.hemi.ground);
    this.hemi.intensity = conf.hemi.i;
    this.scene.fog.color.setHex(conf.fog);
    this.scene.fog.near = conf.fogNear;
    this.scene.fog.far = conf.fogFar;
    this.roadUniforms.uBase.value.setHex(conf.road);
    this.sea.visible = conf.sea;
    this.petalMesh.visible = conf.petals;
    this.animNodes = [];
    // 重建地形与布景
    this.chunks.forEach((c, i) => { this._displaceChunk(c, i); this._populateChunk(c, i); });
    return conf;
  }

  // ================= 每帧更新 =================
  update(dt, t, speed, glideAmount) {
    this.roadUniforms.uScroll.value += speed * dt;
    this.seaUniforms.uTime.value = t;

    // 地形滚动 + 回收
    for (const c of this.chunks) {
      c.mesh.position.z -= speed * dt;
      for (const p of c.props) p.obj.position.z -= speed * dt;
      if (c.mesh.position.z < -c.len - 40) {
        c.mesh.position.z += c.len * this.chunks.length;
        const idx = Math.round(c.mesh.position.z / c.len) + 3;
        this._displaceChunk(c, (this.scrollZ++) % 97);
        this._populateChunk(c, idx);
      }
    }

    // 云慢漂
    for (const cl of this._clouds) {
      cl.position.z -= speed * dt * 0.06;
      if (cl.position.z < -60) cl.position.z += 200;
    }

    // 道具动画
    for (const a of this.animNodes) {
      if (a.node.parent === null || !a.node.parent.visible) continue;
      switch (a.kind) {
        case 'mill': a.node.rotation.z = t * (0.8 + a.seed * 0.1); break;
        case 'balloon':
          a.node.position.y = a.baseY + Math.sin(t * 0.5 + a.seed) * 0.5;
          a.node.rotation.z = Math.sin(t * 0.3 + a.seed) * 0.05;
          break;
        case 'boat':
          a.node.position.y = -0.1 + Math.sin(t * 0.8 + a.seed) * 0.08;
          a.node.rotation.z = Math.sin(t * 0.6 + a.seed) * 0.05;
          a.node.rotation.x = Math.sin(t * 0.5 + a.seed * 2) * 0.03;
          break;
        case 'gullwing': {
          const flap = Math.sin(t * 6 + a.seed * 3) * 0.5;
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), flap);
          a.node.quaternion.copy(a.base).premultiply(q);
          break;
        }
        case 'gullfly': {
          const ang = t * 0.3 + a.seed;
          a.node.position.x = a.baseX + Math.cos(ang) * 3;
          a.node.position.y = a.baseY + Math.sin(t * 0.9 + a.seed) * 0.6;
          a.node.position.z = a.baseZ + Math.sin(ang) * 4;
          a.node.rotation.y = -ang + Math.PI / 2;
          break;
        }
      }
    }

    // 花瓣
    if (this.petalMesh.visible) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
      for (let i = 0; i < this.petals.length; i++) {
        const p = this.petals[i];
        p.z -= (speed * 0.5 + 0.6) * dt * p.s;
        p.y += Math.sin(t * 1.6 + p.ph) * 0.35 * dt;
        p.x += Math.cos(t * 1.1 + p.ph) * 0.25 * dt;
        if (p.z < -20) { p.z += 42; p.y = rnd(0.5, 7); p.x = rnd(-16, 16); }
        if (p.y < 0.05) p.y = rnd(1, 7);
        e.set(t * 2.2 * p.s + p.ph, p.ph, t * 1.6);
        q.setFromEuler(e);
        v.set(p.x, p.y, p.z);
        sv.setScalar(p.s);
        m4.compose(v, q, sv);
        this.petalMesh.setMatrixAt(i, m4);
      }
      this.petalMesh.instanceMatrix.needsUpdate = true;
    }

    // 速度线（滑翔）
    this.lineMesh.visible = glideAmount > 0.05;
    if (this.lineMesh.visible) {
      const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion();
      const alpha = Math.min(1, glideAmount * 1.4);
      for (let i = 0; i < this.lines.length; i++) {
        const L = this.lines[i];
        L.z -= L.sp * dt * (0.4 + speed * 0.08);
        if (L.z < -7) L.z += 13;
        v.set(Math.cos(L.a) * L.r, Math.sin(L.a) * L.r + 1.1, L.z);
        m4.compose(v, q.identity(), new THREE.Vector3(1, 1, 0.6 + speed * 0.22 * alpha));
        this.lineMesh.setMatrixAt(i, m4);
      }
      this.lineMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------- 道具模板池 ----------
export function buildTemplates(propsScene, gradientMap) {
  const templates = {};
  const roots = {};
  propsScene.traverse(o => { if (o.parent === propsScene) roots[o.name] = o; });
  for (const [name, node] of Object.entries(roots)) {
    const proto = node.clone(true);
    toonify(proto, gradientMap);
    proto.position.set(0, 0, 0);
    proto.rotation.set(0, 0, 0);
    proto.scale.setScalar(1);
    templates[name] = { proto, pool: [] };
  }
  return templates;
}
