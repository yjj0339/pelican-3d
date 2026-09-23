// 骑手模块：鹈鹕 + 自行车装配与动画（踩踏 IK / 翅膀 / 围巾 / 喙 / 滑翔）
import * as THREE from '../vendor/three.module.min.js';

// 与 Blender 建模一致的常量（游戏坐标 = glTF 坐标）
export const WHEEL_R = 0.34;
const BB = new THREE.Vector3(0, 0.30, -0.06);
const CRANK_R = 0.165;
const HIP = { x: 0.10, y: 1.00, z: -0.27 };
const LEG_A = 0.421, LEG_B = 0.4405;   // 髋->膝 / 膝->踝 骨长
const PEDAL_X = 0.115;

export class Rider {
  constructor(bikeScene, pelicanScene, gradientMap) {
    this.root = new THREE.Group();      // 整车 + 鹈鹕（统一 bob/俯仰）
    this.bike = bikeScene;
    this.pelican = pelicanScene;
    toonRig(this.bike, gradientMap);
    toonRig(this.pelican, gradientMap);
    this.root.add(this.bike, this.pelican);

    const N = (root, name) => root.getObjectByName(name);
    this.n = {
      steer: N(this.bike, 'B_Steer'),
      wheelF: N(this.bike, 'B_WheelF'),
      wheelR: N(this.bike, 'B_WheelR'),
      crank: N(this.bike, 'B_Crank'),
      pedalL: N(this.bike, 'B_PedalL'),
      pedalR: N(this.bike, 'B_PedalR'),
      head: N(this.pelican, 'P_Head'),
      jaw: N(this.pelican, 'P_BeakLower'),
      wingL: N(this.pelican, 'P_WingL'),
      wingR: N(this.pelican, 'P_WingR'),
      tail: N(this.pelican, 'P_Tail'),
      hipL: N(this.pelican, 'P_HipL'), hipR: N(this.pelican, 'P_HipR'),
      kneeL: N(this.pelican, 'P_KneeL'), kneeR: N(this.pelican, 'P_KneeR'),
      footL: N(this.pelican, 'P_FootL'), footR: N(this.pelican, 'P_FootR'),
      scarf1: N(this.pelican, 'P_Scarf1'),
      scarf2: N(this.pelican, 'P_Scarf2'),
      scarf3: N(this.pelican, 'P_Scarf3'),
    };
    // 翅膀四元数基座
    this.wingQ = new THREE.Quaternion();
    this._qy = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._Y = new THREE.Vector3(0, 1, 0);
    this._X = new THREE.Vector3(1, 0, 0);
  }

  // speed: m/s; crank: 曲柄累计角; dt; t: 秒; state: {glide, bellAge, headYaw...}
  update(dt, t, speed, crank, st) {
    const n = this.n;
    const wheelW = speed / WHEEL_R;
    if (n.wheelF) n.wheelF.rotation.x += wheelW * dt;
    if (n.wheelR) n.wheelR.rotation.x += wheelW * dt;

    // 曲柄 + 脚蹬保持水平
    const cadence = speed > 0.15 ? THREE.MathUtils.clamp(speed * 1.15, 1.2, 9.0) : 0;
    if (n.crank) n.crank.rotation.x = crank;
    if (n.pedalL) n.pedalL.rotation.x = -crank;
    if (n.pedalR) n.pedalR.rotation.x = -crank;

    // 两腿 IK（矢状面，绕 X）
    const aL = crank;                 // 左脚蹬相位
    this._poseLeg(-1, aL, n.hipL, n.kneeL, n.footL);
    this._poseLeg(1, aL + Math.PI, n.hipR, n.kneeR, n.footR);

    // 车体：轻微颠簸 / 滑翔抬升俯仰
    const glide = st.glide;
    const bob = Math.sin(crank * 2) * 0.012 * Math.min(1, speed / 4) + Math.sin(t * 3.1) * 0.004;
    this.root.position.y = bob + glide * (0.55 + Math.sin(t * 2.2) * 0.07);
    this.root.rotation.x = -0.10 * glide + Math.sin(t * 1.3) * 0.004;
    this.root.rotation.z = Math.sin(crank) * 0.008 * Math.min(1, speed / 4);
    // 车把：绕头管轴（约后倾 17°）小幅摆动
    if (n.steer) {
      const headAxis = this._headAxis || (this._headAxis = new THREE.Vector3(0, Math.cos(0.30), -Math.sin(0.30)).normalize());
      const steerAng = Math.sin(t * 0.7) * 0.06;
      n.steer.quaternion.setFromAxisAngle(headAxis, steerAng);
    }

    // 头：巡游左顾右盼 + 摇铃回应
    if (n.head) {
      n.head.rotation.y = Math.sin(t * 0.5) * 0.14 + st.bellHead;
      n.head.rotation.x = Math.sin(t * 0.83 + 1) * 0.05 - glide * 0.18;
      n.head.rotation.z = Math.sin(t * 0.61) * 0.04;
    }
    // 喙：摇铃/滑翔时张开
    if (n.jaw) {
      const open = st.jawOpen;
      n.jaw.rotation.x = open * 0.5 + Math.sin(t * 9) * 0.02 * open;
    }
    // 尾巴
    if (n.tail) {
      n.tail.rotation.x = Math.sin(t * 3.2 + 1) * 0.05 + st.bellWag * 0.35;
      n.tail.rotation.z = Math.sin(t * 2.1) * 0.04;
    }

    // 翅膀：折叠(0) -> 滑翔展开扑扇(1)
    const spread = glide;
    const flap = Math.sin(t * (glide > 0.3 ? 5.2 : 2.6)) * (0.06 + 0.32 * glide);
    for (const [wing, sx] of [[n.wingL, -1], [n.wingR, 1]]) {
      if (!wing) continue;
      this._qy.setFromAxisAngle(this._Y, sx * spread * (Math.PI / 2) * 0.92);
      this._qp.setFromAxisAngle(this._X, flap);
      this.wingQ.copy(this._qy).multiply(this._qp);
      wing.quaternion.copy(this.wingQ);
    }

    // 围巾：随风飘
    const windK = 0.3 + speed * 0.09 + glide * 0.8;
    if (n.scarf1) n.scarf1.rotation.x = 0.15 + Math.sin(t * 6.0) * 0.10 * windK;
    if (n.scarf2) n.scarf2.rotation.x = 0.10 + Math.sin(t * 5.2 - 0.9) * 0.14 * windK + glide * 0.25;
    if (n.scarf3) n.scarf3.rotation.x = 0.05 + Math.sin(t * 4.6 - 1.8) * 0.18 * windK + glide * 0.45;
    if (n.scarf1) n.scarf1.rotation.y = Math.sin(t * 3.4) * 0.06 * windK;
    if (n.scarf2) n.scarf2.rotation.y = Math.sin(t * 3.0 - 0.7) * 0.08 * windK;
  }

  // 平面两骨 IK：目标 = 脚蹬位置上方
  _poseLeg(sx, ang, hip, knee, foot) {
    if (!hip || !knee || !foot) return;
    const px = BB.x, py = BB.y + CRANK_R * Math.cos(ang), pz = BB.z + CRANK_R * Math.sin(ang);
    // 脚踝目标：脚蹬上方 4.5cm，略前
    let ty = py + 0.045, tz = pz + 0.012;
    const hx = HIP.x * -sx; // 左腿在 -x
    const hy = HIP.y, hz = HIP.z;
    let dy = ty - hy, dz = tz - hz;
    let d = Math.hypot(dy, dz);
    const dMax = LEG_A + LEG_B - 1e-4;
    if (d > dMax) { dy *= dMax / d; dz *= dMax / d; d = dMax; ty = hy + dy; tz = hz + dz; }
    // 角度（从 -Y 起量，朝 +Z 为正）
    const psi = Math.atan2(dz, -dy);
    const cosA = THREE.MathUtils.clamp((LEG_A * LEG_A + d * d - LEG_B * LEG_B) / (2 * LEG_A * d), -1, 1);
    const A = Math.acos(cosA);
    const kneeAng = psi - A;   // 膝盖朝前(+Z)
    const ky = hy - Math.cos(kneeAng) * LEG_A;
    const kz = hz + Math.sin(kneeAng) * LEG_A;
    // 大腿方向角 -> rotation.x（推导：局部 -Y 旋转 θ 后 = (0,-cosθ,-sinθ)）
    const thighDir = [ky - hy, kz - hz];
    const shinDir = [ty - ky, tz - kz];
    const th = Math.atan2(-thighDir[1], -thighDir[0]);
    const sh = Math.atan2(-shinDir[1], -shinDir[0]);
    hip.rotation.set(th, 0, 0);
    hip.position.set(hx, hy, hz);
    knee.rotation.set(sh - th, 0, 0);
    foot.rotation.set(-sh - 0.12, 0, 0);
  }
}

function toonRig(root, gradientMap) {
  root.traverse(o => {
    if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
      const old = o.material;
      o.material = new THREE.MeshToonMaterial({
        color: old.color.clone(),
        gradientMap,
        emissive: old.emissive ? old.emissive.clone() : new THREE.Color(0),
        emissiveIntensity: old.emissiveIntensity || 1,
      });
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
}
