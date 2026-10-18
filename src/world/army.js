import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE } from '../core/utils.js';

/*
 * 三千万人列计算机
 *  - 近景：54,400 名完整的 3D 士兵（InstancedBufferGeometry），每人举黑/白旗
 *  - 中景：27 万张"士兵旗卡"
 *  - 远景：一直铺到地平线的着色器平面，用相同的 GLSL 函数逐格计算旗色
 * 三者共享 fieldProb()：中央处理器、总线、内存、外存、显示阵列都是由它定义的
 */
export const CELL = 2.2;
export const FIELD = { x0: -3000, x1: 3000, z0: 120, z1: 6120, cpu: new THREE.Vector2(0, 3120) };
const NEAR = { cx0: -136, cx1: 135, cz0: 55, cz1: 254 };
const MID = { cx0: -318, cx1: 317, cz0: 255, cz1: 681 };
const ST = { x0: -318, z0: 55, W: 636, H: 627 }; // 近景+中景的状态纹理覆盖范围
export const DISP = { cx0: -113, cx1: 113, cz0: 69, cz1: 240 };
DISP.W = DISP.cx1 - DISP.cx0 + 1; DISP.H = DISP.cz1 - DISP.cz0 + 1;

const FIELD_GLSL = /* glsl */`
#define CELL 2.2
uniform float uTime, uCompute, uWave, uAssemble, uLayout, uLift, uDispOn;
uniform sampler2D uDisplay;
uniform vec4 uDispCells;
uniform vec3 uSunDir, uSunCol, uAmb, uFogCol;
uniform float uFogDen;
${GLSL_NOISE}

float busPacket(float s, float t, float lane){
  float x = s - t * 150.;
  float pk = floor(x / 70.);
  float inPk = x - pk * 70.;
  float has = step(.3, hash12(vec2(pk, lane)));
  float bitI = floor(inPk / (CELL * 2.));
  float b = step(.42, hash12(vec2(pk * 1.7 + bitI, lane + 3.)));
  return has * step(inPk, 52.) * b;
}
float distN(vec2 wp){ return clamp(length(wp - vec2(0., 100.)) / 6500., 0., 1.); }
float assembleK(vec2 cell, vec2 wp){ return clamp((uAssemble * 1.5 - (.5 * hash12(cell * 1.7) + .5 * distN(wp))) * 4., 0., 1.); }
float layoutK(vec2 cell, vec2 wp){ return clamp((uLayout * 1.5 - (.5 * hash12(cell * 2.9) + .5 * distN(wp))) * 4., 0., 1.); }
float liftDelay(vec2 wp, float r){ return r * 2.5 + (1. - distN(wp)) * 6.; }
/* 旗帜是否展开：计算波到达之后才举旗 */
float flagActive(vec2 cell){
  vec2 wp = (cell + .5) * CELL;
  bool disp = cell.x >= uDispCells.x && cell.x <= uDispCells.z && cell.y >= uDispCells.y && cell.y <= uDispCells.w;
  if (disp) return uDispOn;
  return uCompute * step(length(wp - vec2(0., 100.)), uWave + 40.);
}

/* 返回"举黑旗"的概率；present=0 表示此格无人（通道/走廊） */
float fieldProb(vec2 cell, float t, out float present){
  present = 1.;
  vec2 wp = (cell + .5) * CELL;
  if (cell.x < -1364. || cell.x > 1363. || cell.y < 55. || cell.y > 2781.) { present = 0.; return 0.; }
  float dist = length(wp - vec2(0., 100.));
  float on = uCompute * step(dist, uWave);
  float front = uCompute * (1. - smoothstep(0., 40., abs(dist - uWave))) * step(uWave, 9000.);
  float prob = 0.;
  float corridor = 0.;
  if (cell.x >= uDispCells.x && cell.x <= uDispCells.z && cell.y >= uDispCells.y && cell.y <= uDispCells.w) {
    vec2 uv = vec2((uDispCells.z - cell.x + .5) / (uDispCells.z - uDispCells.x + 1.), (cell.y - uDispCells.y + .5) / (uDispCells.w - uDispCells.y + 1.));
    float d = texture2D(uDisplay, uv).r;
    return max((1. - d) * uDispOn, front);
  }
  // 方阵之间的过道
  if (mod(cell.x + 1364., 46.) < 1. || mod(cell.y - 55., 46.) < 1.) { present = 0.; return 0.; }
  vec2 dc = wp - vec2(0., 3120.);
  vec2 adc = abs(dc);
  float cm = max(adc.x, adc.y);
  if (cm < 650.) {                       // 中央处理器：运算器（左）+ 控制器（右）
    vec2 q = dc + 650.;
    vec2 blk = floor(q / 52.);
    vec2 bq = q - blk * 52.;
    if (bq.x < 5. || bq.y < 5. || adc.x < 10.) corridor = 1.;
    float side = step(0., dc.x);
    float rate = mix(2.5, 8., hash12(blk + side * 31.));
    float tick = floor(t * rate + hash12(blk) * 7.);
    float p = hash12(blk * 1.37 + vec2(tick * .731, tick * 1.13));
    prob = mix(.06, .94, p) * on;
  } else if (cm < 722.) {               // 环形总线
    if (cm < 668. || cm > 704.) corridor = 1.;
    float ang = atan(dc.y, dc.x);
    prob = busPacket(ang * 686. + 5000., t, 7.) * on;
  } else {
    float bw = 17.;
    float tr = abs(wp.x);
    float dz1 = abs(wp.y - 3120.), dz2 = abs(wp.y - 1400.), dz3 = abs(wp.y - 4840.);
    float dvx = abs(abs(wp.x) - 1500.);
    bool trunk = tr < bw && wp.y > 560.;
    if (trunk || dz1 < bw || dz2 < bw || dz3 < bw || dvx < bw) {   // 系统总线（轻骑兵）
      float lat, s, lane;
      if (trunk) { lat = tr; s = abs(wp.y - 3120.); lane = 1.; }
      else if (dz1 < bw) { lat = dz1; s = adc.x; lane = 2. + step(0., wp.x); }
      else if (dvx < bw) { lat = dvx; s = adc.y; lane = 4. + step(0., wp.x); }
      else if (dz2 < bw) { lat = dz2; s = abs(wp.x); lane = 6. + step(0., wp.x); }
      else { lat = dz3; s = abs(wp.x); lane = 8. + step(0., wp.x); }
      if (lat > bw - 3.5) corridor = 1.;
      prob = busPacket(s, t, lane) * on;
    } else if (abs(wp.x) > 2760. || wp.y > 5880.) {   // 外存
      vec2 blk = floor(wp / 120.); vec2 bq = wp - blk * 120.;
      if (bq.x < 6. || bq.y < 6.) corridor = 1.;
      float tick = floor(t * .2 + hash12(blk) * 5.);
      prob = mix(.25, .75, hash12(blk + tick * 1.7)) * on;
    } else {                                           // 内存
      vec2 q = wp + vec2(3000., -120.);
      vec2 bank = floor(q / 240.); vec2 bq = q - bank * 240.;
      if (bq.x < 12. || bq.y < 12.) corridor = 1.;
      float row = floor(bq.y / (CELL * 3.));
      float spd = .35 + hash12(bank) * 1.4;
      float tick = floor(t * spd + hash12(vec2(row, bank.x + bank.y * 17.)) * 10.);
      float p = hash12(vec2(row * 1.31 + tick * 3.7, bank.x * 7.1 + bank.y * 3.3));
      prob = mix(.12, .88, p) * on;
    }
  }
  present = 1. - corridor * layoutK(cell, wp);
  return max(prob * present, front);
}
float cellBit(vec2 cell, float t, out float present){
  float p = fieldProb(cell, t, present);
  return step(hash12(cell * .913 + 17.31), p);
}
mat3 rotAxis(vec3 a, float ang){ float s = sin(ang), c = cos(ang), oc = 1. - c;
  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }
`;

/* ---------- 中模士兵：最靠近金字塔的一万余人使用（朝向 -z） ---------- */
function soldierGeometryHi() {
  const parts = [];
  const put = (g, part) => {
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1));
    parts.push(g.index ? g : g);
  };
  const lathe = (pts, segs) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  for (const s of [-1, 1]) {
    put(new THREE.CylinderGeometry(0.075, 0.06, 0.8, 6, 1).translate(s * 0.1, 0.4, 0), 0);
    put(new THREE.BoxGeometry(0.11, 0.07, 0.24).translate(s * 0.1, 0.035, -0.04), 5);
    // 手臂：右臂向前持旗杆
    const arm = new THREE.CylinderGeometry(0.055, 0.045, 0.56, 6, 1).translate(0, -0.28, 0);
    if (s > 0) arm.rotateX(0.65); else arm.rotateZ(0.12);
    arm.translate(s * 0.28, 1.38, 0);
    put(arm, 6);
    const hand = new THREE.SphereGeometry(0.045, 6, 4);
    hand.translate(s > 0 ? 0.3 : -0.31, s > 0 ? 0.92 : 0.83, s > 0 ? -0.34 : 0.0);
    put(hand, 4);
  }
  put(lathe([[0.3, 0.66], [0.27, 0.8], [0.24, 0.95], [0.23, 1.0]], 10), 6);       // 长襦下摆
  const armor = lathe([[0.27, 0.86], [0.24, 1.0], [0.25, 1.15], [0.255, 1.3], [0.2, 1.42], [0.11, 1.47]], 10);
  armor.scale(1, 1, 0.78);
  put(armor, 3);
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.11, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 1.1, 1).rotateZ(-s * 0.5).translate(s * 0.25, 1.35, 0), 3);
  put(new THREE.SphereGeometry(0.105, 8, 6).scale(0.85, 1.08, 0.95).translate(0, 1.64, 0), 4);   // 头
  put(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6).translate(0, 1.5, 0), 4);
  put(new THREE.SphereGeometry(0.11, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(0.3).translate(0, 1.66, 0.01), 5); // 发
  put(new THREE.SphereGeometry(0.05, 6, 4).translate(0.05, 1.77, 0.02), 5);                      // 偏髻
  put(new THREE.CylinderGeometry(0.02, 0.02, 2.8, 4).translate(0.34, 1.6, -0.2), 2);
  const flag = new THREE.PlaneGeometry(0.95, 0.62, 6, 2);
  flag.translate(0.34 + 0.475, 2.66, -0.2);
  put(flag, 1);
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
}

/* ---------- 低模士兵几何体（朝向 -z，即面向金字塔） ---------- */
function soldierGeometry() {
  const parts = [];
  const box = (w, h, d, x, y, z, part, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1));
    parts.push(g);
  };
  box(0.32, 0.8, 0.18, 0, 0.4, 0, 0);
  box(0.46, 0.25, 0.3, 0, 0.88, 0, 6);
  box(0.44, 0.55, 0.28, 0, 1.27, 0, 3);
  box(0.2, 0.24, 0.22, 0, 1.68, 0, 4);
  box(0.12, 0.1, 0.12, 0.05, 1.84, 0.03, 5);
  box(0.11, 0.6, 0.12, -0.28, 1.22, 0, 6);
  box(0.11, 0.5, 0.12, 0.3, 1.45, -0.12, 6, 0.6);
  box(0.045, 2.8, 0.045, 0.34, 1.6, -0.2, 2);
  const flag = new THREE.PlaneGeometry(0.95, 0.62, 6, 1);
  flag.translate(0.34 + 0.475, 2.66, -0.2);
  flag.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(flag.attributes.position.count).fill(1), 1));
  parts.push(flag);
  return mergeGeometries(parts);
}

const COMMON_VS = /* glsl */`
attribute vec2 aCell;
uniform sampler2D uState;
varying vec3 vCol; varying float vFog; varying float vAlpha;
`;

const SOLDIER_VS = FIELD_GLSL + COMMON_VS + /* glsl */`
attribute float aPart;
void main(){
  vec3 p = position;
  vec3 n = normal;
  vec2 cell = aCell;
  vec2 wp = (cell + .5) * CELL;
  float r = hash12(cell * 3.1);
  float t = uTime;
  float pres;
  vec3 col;
  float bit = 0.;
  vec4 st = texture2D(uState, (cell - vec2(${ST.x0}., ${ST.z0}.) + .5) / vec2(${ST.W}., ${ST.H}.));
  pres = st.g;
  if (aPart > .5 && aPart < 1.5) {
    bit = st.r;
    float prev = st.b;
    float u = uv.x;
    p.z += sin(u * 5. - t * 9. + r * 40.) * .09 * u;
    float a = abs(bit - prev) * 1.25;
    float dx = p.x - .34;
    p.x = .34 + dx * cos(a); p.z += dx * sin(a);
    // 未启动时旗帜卷起（贴着旗杆）
    float act = st.a;
    p.x = .34 + (p.x - .34) * mix(.08, 1., act);
    p.y = 2.97 + (p.y - 2.97) * mix(.5, 1., act);
    col = mix(vec3(.86, .83, .76), vec3(.012), bit);
    col = mix(vec3(.35, .06, .04), col, act);
  } else {
    if (aPart < .5) col = vec3(.16, .13, .11);
    else if (aPart < 2.5) col = vec3(.24, .16, .09);
    else if (aPart < 3.5) col = vec3(.2, .15, .11) * (.85 + .3 * r);
    else if (aPart < 4.5) col = vec3(.5, .35, .26);
    else if (aPart < 5.5) col = vec3(.03, .025, .02);
    else col = vec3(.32, .11, .07);
  }
  // 列阵：从四散处跑步就位
  float ak = assembleK(cell, wp);
  ak = ak * ak * (3. - 2. * ak);
  vec2 sc = (vec2(hash12(cell * 1.7 + 3.), hash12(cell * 2.3 + 5.)) - .5) * 90.;
  vec3 world = vec3(wp.x, 0., wp.y) + vec3(sc.x, 0., sc.y) * (1. - ak);
  world.y += abs(sin(t * 11. + r * 30.)) * .18 * (1. - ak) * step(.001, ak);
  float vis = step(.001, ak) * pres;
  // 三日凌空：失重飞升、翻滚
  if (uLift > 0.) {
    float d = max(uLift - liftDelay(wp, r), 0.);
    vec3 ax = normalize(vec3(hash12(cell + 1.) - .5, hash12(cell + 2.) - .5, hash12(cell + 3.) - .5));
    mat3 R = rotAxis(ax, d * (.5 + r * 1.6));
    p = R * (p - vec3(0., 1., 0.)) + vec3(0., 1., 0.);
    n = R * n;
    world.y += .5 * (1.6 + r * 2.6) * d * d;
    world.xz += normalize(wp - vec2(0., 100.) + .001) * d * d * .25;
  }
  p *= vis;
  vec3 wpos = world + p;
  vec4 mv = viewMatrix * vec4(wpos, 1.);
  gl_Position = projectionMatrix * mv;
  float diff = aPart > .5 && aPart < 1.5 ? abs(dot(normalize(n), uSunDir)) : max(dot(normalize(n), uSunDir), 0.);
  vCol = col * (uAmb + uSunCol * diff);
  float dist = length(mv.xyz);
  vFog = 1. - exp(-uFogDen * uFogDen * dist * dist);
  vAlpha = 1.;
}`;

const CARD_VS = FIELD_GLSL + COMMON_VS + /* glsl */`
varying vec2 vUv; varying float vBit; varying float vAct;
void main(){
  vec2 cell = aCell;
  vec2 wp = (cell + .5) * CELL;
  float r = hash12(cell * 3.1);
  vec4 st = texture2D(uState, (cell - vec2(${ST.x0}., ${ST.z0}.) + .5) / vec2(${ST.W}., ${ST.H}.));
  float pres = st.g;
  vBit = st.r;
  vAct = st.a;
  vUv = uv;
  float ak = assembleK(cell, wp);
  vec3 p = position;
  vec3 world = vec3(wp.x + (r - .5) * .4, 0., wp.y);
  if (uLift > 0.) {
    float d = max(uLift - liftDelay(wp, r), 0.);
    float ang = d * (.5 + r * 1.6);
    p.xy = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * (p.xy - vec2(0., 1.3)) + vec2(0., 1.3);
    world.y += .5 * (1.6 + r * 2.6) * d * d;
    world.xz += normalize(wp - vec2(0., 100.) + .001) * d * d * .25;
  }
  p *= step(.999, ak) * pres;
  vec4 mv = viewMatrix * vec4(world + p, 1.);
  gl_Position = projectionMatrix * mv;
  vCol = uAmb + uSunCol * .55;
  float dist = length(mv.xyz);
  vFog = 1. - exp(-uFogDen * uFogDen * dist * dist);
  vAlpha = 1.;
}`;
const CARD_FS = /* glsl */`
uniform vec3 uFogCol;
varying vec3 vCol; varying float vFog; varying vec2 vUv; varying float vBit; varying float vAct;
void main(){
  vec2 u = vUv;
  // 剪影：身体 + 头 + 旗杆 + 旗
  float body = step(abs(u.x - .35), .13) * step(u.y, .58);
  float head = step(length((u - vec2(.35, .64)) * vec2(1., 1.8)), .07);
  float pole = step(abs(u.x - .55), .015) * step(u.y, 1.);
  float flag = step(.55, u.x) * step(.76, u.y) * step(u.x, mix(.62, 1., vAct));
  if (body + head + pole + flag < .5) discard;
  vec3 c = flag > .5 ? mix(vec3(.35, .06, .04), mix(vec3(.86, .83, .76), vec3(.012), vBit), vAct) : (pole > .5 && body < .5 ? vec3(.24, .16, .09) : vec3(.17, .13, .1));
  c *= vCol;
  gl_FragColor = vec4(mix(c, uFogCol, vFog), 1.);
}`;

const SOLDIER_FS = /* glsl */`
uniform vec3 uFogCol;
varying vec3 vCol; varying float vFog; varying float vAlpha;
void main(){ gl_FragColor = vec4(mix(vCol, uFogCol, vFog), 1.); }`;

const PLANE_VS = /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PLANE_FS = FIELD_GLSL + /* glsl */`
varying vec3 vW;
void main(){
  vec2 wp = vW.xz;
  vec2 cell = floor(wp / CELL);
  vec2 f = fract(wp / CELL) - .5;
  float pres;
  float prob = fieldProb(cell, uTime, pres);
  float bit = step(hash12(cell * .913 + 17.31), prob);
  float px = length(fwidth(wp)) / CELL;
  float lod = smoothstep(.35, 1.3, px);
  float val = mix(bit, prob, lod);
  float act = flagActive(cell);
  float body = mix(smoothstep(.34, .24, max(abs(f.x) * 1.3, abs(f.y) * 1.5)), .78, lod);
  float dotM = mix(smoothstep(.36, .26, max(abs(f.x), abs(f.y) * 1.3)), .58, lod) * act;
  vec2 wpc = (cell + .5) * CELL;
  float r = hash12(cell * 3.1);
  float ak = assembleK(cell, wpc);
  float vis = pres * step(.999, ak);
  if (uLift > 0.) vis *= step(uLift, liftDelay(wpc, r));
  bool inNear = cell.x >= ${NEAR.cx0}. && cell.x <= ${NEAR.cx1}. && cell.y >= ${NEAR.cz0}. && cell.y <= ${NEAR.cz1}.;
  if (inNear) vis = 0.;
  float gn = fbm(wp * .02) * .6 + vnoise(wp * .4) * .4;
  vec3 ground = vec3(.24, .2, .16) * (.75 + .5 * gn);
  if (pres < .5) ground = vec3(.5, .42, .3) * (.85 + .3 * gn);   // 通道：被踩实的黄土
  vec3 flagC = mix(vec3(.86, .83, .76), vec3(.012), val);
  vec3 c = mix(ground, vec3(.07, .055, .045) * (.85 + .3 * r), body * vis);
  c = mix(c, flagC, dotM * vis);
  c *= uAmb + uSunCol * max(uSunDir.y, 0.) * .85;
  float dist = length(cameraPosition - vW);
  float fg = 1. - exp(-uFogDen * uFogDen * dist * dist);
  gl_FragColor = vec4(mix(c, uFogCol, fg), 1.);
}`;

const STATE_FS = FIELD_GLSL + /* glsl */`
void main(){
  vec2 cell = vec2(${ST.x0}., ${ST.z0}.) + floor(gl_FragCoord.xy);
  float pres, pp;
  float b = cellBit(cell, uTime, pres);
  float b0 = cellBit(cell, uTime - .16, pp);
  gl_FragColor = vec4(b, pres, b0, flagActive(cell));
}`;

const LIFT_VS = FIELD_GLSL + /* glsl */`
attribute vec3 aBase; attribute float aR;
varying vec3 vCol; varying float vA;
uniform float uScale;
void main(){
  float d = max(uLift - liftDelay(aBase.xz, aR), 0.);
  vec3 p = aBase;
  p.y += 1.5 + .5 * (1.6 + aR * 2.6) * d * d;
  p.xz += normalize(aBase.xz - vec2(0., 100.) + .001) * d * d * .25;
  vec4 mv = viewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(2.4 * uScale / -mv.z, 1.2, 9.);
  vA = step(.0001, d);
  vCol = (aR > .5 ? vec3(.86, .83, .76) : vec3(.02)) * (uAmb + uSunCol * .6);
}`;
const LIFT_FS = /* glsl */`varying vec3 vCol; varying float vA; void main(){ if (vA < .5) discard; vec2 d = gl_PointCoord - .5; if (dot(d,d) > .25) discard; gl_FragColor = vec4(vCol, 1.); }`;

export class Army {
  constructor() {
    this.group = new THREE.Group();
    // 显示阵列画布：每个像素就是一名士兵
    this.dispCanvas = document.createElement('canvas');
    this.dispCanvas.width = DISP.W; this.dispCanvas.height = DISP.H;
    this.dispCtx = this.dispCanvas.getContext('2d');
    this.dispCtx.fillStyle = '#fff'; this.dispCtx.fillRect(0, 0, DISP.W, DISP.H);
    this.dispTex = new THREE.CanvasTexture(this.dispCanvas);
    this.dispTex.magFilter = this.dispTex.minFilter = THREE.NearestFilter;
    this.dispTex.generateMipmaps = false;

    this.u = {
      uTime: { value: 0 }, uCompute: { value: 0 }, uWave: { value: 0 }, uAssemble: { value: 1 }, uLayout: { value: 0 },
      uLift: { value: 0 }, uDispOn: { value: 0 }, uDisplay: { value: this.dispTex },
      uDispCells: { value: new THREE.Vector4(DISP.cx0, DISP.cz0, DISP.cx1, DISP.cz1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.3, 0.3, 0.3) },
      uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0 }, uScale: { value: innerHeight * 0.6 },
      uState: { value: null },
    };

    // 每帧把每名士兵的旗色计算进状态纹理（每个像素 = 一名士兵）
    this.stateRT = new THREE.WebGLRenderTarget(ST.W, ST.H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.u.uState.value = this.stateRT.texture;
    this.stateScene = new THREE.Scene();
    this.stateCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: STATE_FS, depthTest: false, depthWrite: false,
    }));
    sq.frustumCulled = false;
    this.stateScene.add(sq);

    // 近景士兵
    const sg = soldierGeometry();
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = sg.index;
    for (const k of ['position', 'normal', 'uv', 'aPart']) ig.setAttribute(k, sg.attributes[k]);
    const HI_Z = 100; // 前 46 排使用中模
    const cells = [], hiCells = [];
    for (let cz = NEAR.cz0; cz <= NEAR.cz1; cz++) for (let cx = NEAR.cx0; cx <= NEAR.cx1; cx++) (cz <= HI_Z ? hiCells : cells).push(cx, cz);
    ig.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
    ig.instanceCount = cells.length / 2;
    const sm = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: SOLDIER_VS, fragmentShader: SOLDIER_FS, side: THREE.DoubleSide });
    this.soldiers = new THREE.Mesh(ig, sm);
    this.soldiers.frustumCulled = false;
    this.group.add(this.soldiers);
    const hg = soldierGeometryHi();
    const hig = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'aPart']) hig.setAttribute(k, hg.attributes[k]);
    hig.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(hiCells), 2));
    hig.instanceCount = hiCells.length / 2;
    this.soldiersHi = new THREE.Mesh(hig, sm);
    this.soldiersHi.frustumCulled = false;
    this.group.add(this.soldiersHi);
    this.nearCount = ig.instanceCount + hig.instanceCount;

    // 中景旗卡
    const card = new THREE.PlaneGeometry(1.0, 2.9);
    card.translate(0.15, 1.45, 0);
    const cg = new THREE.InstancedBufferGeometry();
    cg.index = card.index;
    cg.setAttribute('position', card.attributes.position);
    cg.setAttribute('uv', card.attributes.uv);
    const mcells = [];
    for (let cz = MID.cz0; cz <= MID.cz1; cz++) for (let cx = MID.cx0; cx <= MID.cx1; cx++) mcells.push(cx, cz);
    cg.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(mcells), 2));
    cg.instanceCount = mcells.length / 2;
    this.midCount = cg.instanceCount;
    this.cards = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: CARD_VS, fragmentShader: CARD_FS, side: THREE.DoubleSide }));
    this.cards.frustumCulled = false;
    this.group.add(this.cards);

    // 远景平面
    const pw = FIELD.x1 - FIELD.x0 + 400, pd = FIELD.z1 - FIELD.z0 + 400;
    const pg = new THREE.PlaneGeometry(pw, pd, 1, 1);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, 0.15, (FIELD.z0 + FIELD.z1) / 2);
    this.plane = new THREE.Mesh(pg, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: PLANE_VS, fragmentShader: PLANE_FS }));
    this.plane.frustumCulled = false;
    this.group.add(this.plane);

    // 飞升时的远处士兵（点云）
    const N = 160000;
    const base = new Float32Array(N * 3), rr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let x, z;
      do { x = FIELD.x0 + Math.random() * (FIELD.x1 - FIELD.x0); z = FIELD.z0 + Math.random() * (FIELD.z1 - FIELD.z0); }
      while (Math.abs(x) < 700 && z < 1500);
      base[i * 3] = x; base[i * 3 + 1] = 0; base[i * 3 + 2] = z; rr[i] = Math.random();
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    lg.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    lg.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
    this.liftPoints = new THREE.Points(lg, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: LIFT_VS, fragmentShader: LIFT_FS }));
    this.liftPoints.frustumCulled = false;
    this.liftPoints.visible = false;
    this.group.add(this.liftPoints);
  }

  get totalRendered() { return this.nearCount + this.midCount; }

  update(t, light) {
    const u = this.u;
    u.uTime.value = t;
    u.uScale.value = innerHeight * 0.6;
    if (light) {
      u.uSunDir.value.copy(light.dir);
      u.uSunCol.value.copy(light.color).multiplyScalar(light.intensity * 0.32);
      u.uAmb.value.copy(light.amb);
      u.uFogCol.value.copy(light.fogColor);
      u.uFogDen.value = light.fogDensity;
    }
    this.liftPoints.visible = u.uLift.value > 0;
  }
  refreshDisplay() { this.dispTex.needsUpdate = true; }
  renderState(renderer) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.stateRT);
    renderer.render(this.stateScene, this.stateCam);
    renderer.setRenderTarget(prev);
  }
  dispose() { this.stateRT.dispose(); this.dispTex.dispose(); }
}
