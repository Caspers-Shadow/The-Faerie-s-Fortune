// Placeholder dice geometry for now. Each face gets a number by grouping
// triangles that share a normal (works for any convex shape, no UV mapping
// needed). When you roll, we figure out which way the die needs to end up
// facing so the number showing is actually the result, not just whatever
// it lands on.
//
// To swap in real Blender models later: export each die as .glb, add the
// GLTFLoader script tag, and in DICE_CONFIG point a die's build() at
// THREE.GLTFLoader instead. If the model has numbers baked in already you
// can skip addFaceNumbers(), but you'll need to set userData.value /
// userData.faceNormal yourself on each face or landing-on-result breaks.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// theme colors also drive dice gem colors, so the set matches the table
const THEME_META = {
  emerald:   { name: 'Emerald Table',    swatch: ['#1B3A2F', '#E8C77A'], torch: 0xffcf99, rim: 0xbcd4ff,
    dice: { d4: 0xA5453A, d6base: '#EFE3C8', d8: 0x2F6B4F, d10: 0xC9A356, d12: 0x5B3E8C, d20: 0xE8B93E },
    particles: [{ type: 'firefly', count: 16, color: '#E8C77A' }] },
  dragon:    { name: 'Dragonfire Hoard', swatch: ['#3B1414', '#FBD98A'], torch: 0xff8a50, rim: 0xff5a3c,
    dice: { d4: 0xE8532E, d6base: '#F6E2C8', d8: 0x8C2A1E, d10: 0xE8B93E, d12: 0x7A2E17, d20: 0xFFD24A },
    particles: [{ type: 'ember', count: 16, color: '#FF7A3D' }, { type: 'smoke', count: 5, color: 'rgba(140,90,70,0.28)' }] },
  moon:      { name: 'Ninth Moon',       swatch: ['#16213A', '#E4ECFB'], torch: 0xbcd4ff, rim: 0xe4ecfb,
    dice: { d4: 0x5B6FA8, d6base: '#E7EDFB', d8: 0x2E3B63, d10: 0x8FA3C4, d12: 0x3A2E63, d20: 0xB9C9EA },
    particles: [{ type: 'star', count: 24, color: '#E4ECFB' }], fairy: true },
  parchment: { name: 'Sunlit Parchment', swatch: ['#D3A272', '#8C5A1E'], torch: 0xffe0a0, rim: 0xffcf8a,
    dice: { d4: 0xB5622E, d6base: '#FBF3E1', d8: 0x6E7A3E, d10: 0xC98F3E, d12: 0x8C5A1E, d20: 0xE0A93E },
    particles: [{ type: 'mote', count: 14, color: '#F0C987' }] },
  frost:     { name: 'Frostspire',       swatch: ['#A8C8E0', '#5D7E97'], torch: 0xdff0ff, rim: 0xffffff,
    dice: { d4: 0x6E9EC9, d6base: '#F3F9FF', d8: 0x3D6E8C, d10: 0x8FB3D6, d12: 0x4E6FA8, d20: 0xBFE0FF },
    particles: [{ type: 'snow', count: 26, color: '#BFE0FF' }], fairy: true },
};
const THEME_ORDER = ['emerald', 'dragon', 'moon', 'parchment', 'frost'];
const savedTheme = localStorage.getItem('ff-theme');
let currentThemeId = THEME_ORDER.includes(savedTheme) ? savedTheme : 'emerald';

// Face-finding: works on any convex polyhedron by clustering triangles that
// share a surface normal (one cluster = one real face). -0 is normalized to
// 0 before building the cluster key. Without that, floating-point noise on
// coordinates that are mathematically zero can split a single face into two
// clusters, which is what caused faces with a missing or doubled number.
function roundKey(n) {
  let r = Math.round(n * 100) / 100;
  if (Math.abs(r) < 0.005) r = 0; // snap -0 and float jitter near zero to a single value
  return r.toFixed(2);
}

function readTriangle(geometry, triIndex) {
  const pos = geometry.attributes.position;
  if (geometry.index) {
    const idx = geometry.index.array;
    const a = idx[triIndex * 3], b = idx[triIndex * 3 + 1], c = idx[triIndex * 3 + 2];
    return [
      new THREE.Vector3().fromBufferAttribute(pos, a),
      new THREE.Vector3().fromBufferAttribute(pos, b),
      new THREE.Vector3().fromBufferAttribute(pos, c),
    ];
  }
  const base = triIndex * 3;
  return [
    new THREE.Vector3().fromBufferAttribute(pos, base),
    new THREE.Vector3().fromBufferAttribute(pos, base + 1),
    new THREE.Vector3().fromBufferAttribute(pos, base + 2),
  ];
}

function findFaces(geometry) {
  const triCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  const clusters = new Map();
  for (let t = 0; t < triCount; t++) {
    const [v0, v1, v2] = readTriangle(geometry, t);
    const normal = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
    const key = roundKey(normal.x) + ',' + roundKey(normal.y) + ',' + roundKey(normal.z);
    if (!clusters.has(key)) clusters.set(key, { normalSum: new THREE.Vector3(), points: new Map() });
    const cluster = clusters.get(key);
    cluster.normalSum.add(normal);
    [v0, v1, v2].forEach(v => {
      const pKey = v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4);
      if (!cluster.points.has(pKey)) cluster.points.set(pKey, v);
    });
  }
  const faces = [];
  clusters.forEach(cluster => {
    const normal = cluster.normalSum.clone().normalize();
    const pts = [...cluster.points.values()];
    const centroid = new THREE.Vector3();
    pts.forEach(p => centroid.add(p));
    centroid.multiplyScalar(1 / pts.length);
    if (normal.dot(centroid) < 0) normal.negate();
    faces.push({ centroid, normal });
  });
  return faces;
}

function numberTexture(text, textColor, haloColor) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.font = '900 90px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.strokeStyle = haloColor;
  ctx.fillStyle = textColor;
  ctx.strokeText(text, size / 2, size / 2 + 2);
  ctx.fillText(text, size / 2, size / 2 + 2);
  if (text === '6' || text === '9') { // underline so a spinning 6 can't read as a 9
    ctx.lineWidth = 5;
    ctx.strokeStyle = textColor;
    ctx.beginPath();
    ctx.moveTo(size / 2 - 15, size / 2 + 32);
    ctx.lineTo(size / 2 + 15, size / 2 + 32);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// labels: array of {value, text}, one entry per real face, in cluster order.
// Also stamps userData.value / userData.faceNormal on each number plane, in
// `mesh`'s PARENT-local frame, so rollCurrentDie() can look up "which way do
// I need to turn to show a 7" without caring how deep the mesh is nested.
function addFaceNumbers(mesh, geometry, planeSize, textColor, haloColor, labels) {
  const faces = findFaces(geometry);
  faces.forEach((face, i) => {
    const label = labels[i % labels.length];
    const tex = numberTexture(label.text, textColor, haloColor);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.05, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), mat);
    plane.position.copy(face.centroid).addScaledVector(face.normal, 0.012);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
    plane.userData.value = label.value;
    plane.userData.faceNormal = face.normal.clone().applyQuaternion(mesh.quaternion);
    mesh.add(plane);
  });
}

function seqLabels(a, b) { const out = []; for (let i = a; i <= b; i++) out.push({ value: i, text: String(i) }); return out; }

// Dice geometry (placeholders, ready to be swapped for Blender exports)
function pipTexture(pips, baseColor) {
  const layout = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] }[pips];
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = '#1C1712';
  const r = 11;
  layout.forEach(i => {
    const row = Math.floor(i / 3), col = i % 3;
    const x = 26 + col * 38, y = 26 + row * 38;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function buildD6() {
  const base = THEME_META[currentThemeId].dice.d6base;
  const order = [1, 6, 2, 5, 3, 4]; // +x -x +y -y +z -z, opposite faces sum to 7
  const mats = order.map(n => new THREE.MeshStandardMaterial({ map: pipTexture(n, base), roughness: 0.55, metalness: 0.05 }));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mats);
  const normals = { 1:[1,0,0], 6:[-1,0,0], 2:[0,1,0], 5:[0,-1,0], 3:[0,0,1], 4:[0,0,-1] };
  Object.keys(normals).forEach(val => {
    const marker = new THREE.Object3D();
    marker.userData.value = Number(val);
    marker.userData.faceNormal = new THREE.Vector3(...normals[val]);
    mesh.add(marker);
  });
  return mesh;
}

function gemMaterial(colorHex, metalness = 0.35, roughness = 0.35) {
  const c = new THREE.Color(colorHex);
  return new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.12), metalness, roughness });
}

const IVORY = '#F3E3D2', IVORY_HALO = 'rgba(15,10,10,0.6)';
const INK = '#241608', INK_HALO = 'rgba(255,250,235,0.65)';

function buildD4() {
  const geo = new THREE.TetrahedronGeometry(0.72);
  const mesh = new THREE.Mesh(geo, gemMaterial(THEME_META[currentThemeId].dice.d4));
  addFaceNumbers(mesh, geo, 0.4, IVORY, IVORY_HALO, seqLabels(1, 4));
  return mesh;
}
function buildD8() {
  const geo = new THREE.OctahedronGeometry(0.68);
  const mesh = new THREE.Mesh(geo, gemMaterial(THEME_META[currentThemeId].dice.d8));
  addFaceNumbers(mesh, geo, 0.32, IVORY, IVORY_HALO, seqLabels(1, 8));
  return mesh;
}
function buildD12() {
  const geo = new THREE.DodecahedronGeometry(0.66);
  const mesh = new THREE.Mesh(geo, gemMaterial(THEME_META[currentThemeId].dice.d12));
  addFaceNumbers(mesh, geo, 0.34, IVORY, IVORY_HALO, seqLabels(1, 12));
  return mesh;
}
function buildD20() {
  const geo = new THREE.IcosahedronGeometry(0.68);
  const mesh = new THREE.Mesh(geo, gemMaterial(THEME_META[currentThemeId].dice.d20, 0.5, 0.25));
  addFaceNumbers(mesh, geo, 0.22, INK, INK_HALO, seqLabels(1, 20));
  return mesh;
}
function buildBipyramid(colorHex, labelsTop, labelsBottom) {
  const group = new THREE.Group();
  const mat = gemMaterial(colorHex, 0.55, 0.3);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.62, 5, 1, true), mat);
  top.position.y = 0.31;
  addFaceNumbers(top, top.geometry, 0.24, INK, INK_HALO, labelsTop);
  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.62, 5, 1, true), mat);
  bottom.position.y = -0.31; bottom.rotation.x = Math.PI; bottom.rotation.y = Math.PI / 5;
  addFaceNumbers(bottom, bottom.geometry, 0.24, INK, INK_HALO, labelsBottom);
  group.add(top, bottom);
  return group;
}
function buildD10() {
  return buildBipyramid(THEME_META[currentThemeId].dice.d10, seqLabels(1, 5), seqLabels(6, 10));
}
function buildD100() {
  const top = [0, 10, 20, 30, 40].map(v => ({ value: v, text: String(v) }));
  const bottom = [50, 60, 70, 80, 90].map(v => ({ value: v, text: String(v) }));
  return buildBipyramid(THEME_META[currentThemeId].dice.d10, top, bottom);
}

const DICE_CONFIG = {
  d4:  { label: 'd4',  build: buildD4,  results: range(1, 4) },
  d6:  { label: 'd6',  build: buildD6,  results: range(1, 6) },
  d8:  { label: 'd8',  build: buildD8,  results: range(1, 8) },
  d10: { label: 'd10', build: buildD10, results: range(1, 10) },
  d12: { label: 'd12', build: buildD12, results: range(1, 12) },
  d20: { label: 'd20', build: buildD20, results: range(1, 20), critical: true },
  d100:{ label: 'd%',  build: buildD100, results: range(0, 9).map(n => n * 10), suffix: '%' },
};
const DICE_ORDER = ['d4','d6','d8','d10','d12','d20','d100'];
function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

// Scene
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
camera.position.set(0, 3.1, 3.4);
camera.lookAt(0, 0, 0);
const REVEAL_DIR = camera.position.clone().normalize(); // the direction a face should point to read clearly

scene.add(new THREE.AmbientLight(0x8899aa, 0.55));
const torch = new THREE.PointLight(0xffbf80, 1.4, 8, 2);
torch.position.set(1.4, 2.2, 1.6);
scene.add(torch);
const rimLight = new THREE.DirectionalLight(0xbcd4ff, 0.35);
rimLight.position.set(-2, 1.5, -1.5);
scene.add(rimLight);

let currentType = 'd20';
let dieObj = null;
let rolling = false;

function mountDie(type) {
  if (dieObj) scene.remove(dieObj);
  dieObj = DICE_CONFIG[type].build();
  dieObj.rotation.set(0.4, 0.6, 0.1);
  dieObj.scale.setScalar(1);
  scene.add(dieObj);
}

function resize() {
  const wrap = document.getElementById('trayWrap');
  const size = wrap.clientWidth;
  renderer.setSize(size, size, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let t = 0;
function tick() {
  t += 0.016;
  if (!reducedMotion) torch.intensity = 1.3 + Math.sin(t * 6) * 0.08 + Math.sin(t * 13) * 0.04;
  if (dieObj && !rolling) dieObj.rotation.y += reducedMotion ? 0 : 0.0025;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// tumble chaotically, then slerp onto the face that
// carries the rolled value so what's showing when it stops IS the result.
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function findTarget(root, value) {
  let normal = null, plane = null;
  root.traverse(o => { if (o.userData && o.userData.value === value) { normal = o.userData.faceNormal; plane = o; } });
  return { normal, plane };
}

function popHighlight(plane) {
  if (!plane || reducedMotion) return;
  const start = performance.now(), dur = 380;
  function f(now) {
    const p = Math.min((now - start) / dur, 1);
    plane.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.5);
    if (p < 1) requestAnimationFrame(f); else plane.scale.setScalar(1);
  }
  requestAnimationFrame(f);
}

function rollCurrentDie() {
  if (rolling || !dieObj) return;
  rolling = true;
  setControlsEnabled(false);
  document.getElementById('trayWrap').classList.remove('crit', 'fail');
  const hud = document.getElementById('resultHud');
  hud.classList.remove('crit', 'fail');
  hud.innerHTML = '<span class="tag">rolling…</span>';
  document.getElementById('hint').textContent = 'Rolling…';

  const cfg = DICE_CONFIG[currentType];
  const finalValue = cfg.results[Math.floor(Math.random() * cfg.results.length)];
  const target = findTarget(dieObj, finalValue);
  const targetNormal = (target.normal || new THREE.Vector3(0, 1, 0)).clone().normalize();
  const targetQuat = new THREE.Quaternion().setFromUnitVectors(targetNormal, REVEAL_DIR);

  if (reducedMotion) {
    dieObj.quaternion.copy(targetQuat);
    dieObj.position.y = 0;
    finishRoll(finalValue, cfg, target.plane);
    rolling = false;
    setControlsEnabled(true);
    return;
  }

  const startRot = dieObj.rotation.clone();
  const spins = { x: 2 + Math.random() * 2, y: 3 + Math.random() * 2, z: 1 + Math.random() * 1.5 };
  const totalDuration = 1100;
  const tumbleDuration = totalDuration * 0.6;
  const settleDuration = totalDuration - tumbleDuration;
  const start = performance.now();
  let phase2StartQuat = null;

  function frame(now) {
    const elapsed = now - start;
    const hopP = Math.min(elapsed / totalDuration, 1);
    dieObj.position.y = Math.sin(hopP * Math.PI) * 0.55 * (1 - hopP * 0.3);

    if (elapsed < tumbleDuration) {
      const p = easeOutCubic(Math.min((elapsed / tumbleDuration) * 1.1, 1));
      dieObj.rotation.x = startRot.x + spins.x * Math.PI * 2 * p;
      dieObj.rotation.y = startRot.y + spins.y * Math.PI * 2 * p;
      dieObj.rotation.z = startRot.z + spins.z * Math.PI * 2 * p;
      requestAnimationFrame(frame);
    } else {
      if (!phase2StartQuat) phase2StartQuat = dieObj.quaternion.clone();
      const p2 = Math.min((elapsed - tumbleDuration) / settleDuration, 1);
      const eased = easeOutCubic(p2);
      dieObj.quaternion.slerpQuaternions(phase2StartQuat, targetQuat, eased);
      dieObj.scale.setScalar(1 + Math.sin(p2 * Math.PI) * 0.05);
      if (p2 < 1) {
        requestAnimationFrame(frame);
      } else {
        dieObj.quaternion.copy(targetQuat);
        dieObj.scale.setScalar(1);
        dieObj.position.y = 0;
        finishRoll(finalValue, cfg, target.plane);
        rolling = false;
        setControlsEnabled(true);
      }
    }
  }
  requestAnimationFrame(frame);
}

function finishRoll(value, cfg, winningPlane) {
  const display = value + (cfg.suffix || '');
  const isCrit = cfg.critical && value === Math.max(...cfg.results);
  const isFail = cfg.critical && value === Math.min(...cfg.results);

  const hud = document.getElementById('resultHud');
  const wrap = document.getElementById('trayWrap');
  hud.innerHTML = display + `<span class="tag">${cfg.label}</span>`;
  hud.classList.toggle('crit', isCrit);
  hud.classList.toggle('fail', isFail);
  wrap.classList.toggle('crit', isCrit);
  wrap.classList.toggle('fail', isFail);
  document.getElementById('hint').textContent = isCrit ? 'Critical hit!' : isFail ? 'Fumble…' : 'Click the tray, or press Enter / Space, to roll';

  popHighlight(winningPlane);
  recordRoll(cfg, display, isCrit, isFail);
}

// Dice tabs + theme swatches get disabled mid-roll so a switch can't yank
// the die out from under an in-flight animation.
function setControlsEnabled(enabled) {
  document.querySelectorAll('.die-btn, .theme-swatch').forEach(b => { b.disabled = !enabled; });
}

const selectEl = document.getElementById('diceSelect');
DICE_ORDER.forEach(type => {
  const btn = document.createElement('button');
  btn.className = 'die-btn' + (type === currentType ? ' active' : '');
  btn.textContent = DICE_CONFIG[type].label;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', type === currentType ? 'true' : 'false');
  btn.addEventListener('click', () => {
    if (rolling) return;
    currentType = type;
    mountDie(type);
    document.getElementById('resultHud').innerHTML = '-';
    document.getElementById('resultHud').classList.remove('crit', 'fail');
    document.getElementById('trayWrap').classList.remove('crit', 'fail');
    document.getElementById('hint').textContent = 'Click the tray, or press Enter / Space, to roll';
    [...selectEl.children].forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
  });
  selectEl.appendChild(btn);
});

const tray = document.getElementById('tray');
tray.addEventListener('click', rollCurrentDie);
tray.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rollCurrentDie(); } });

// fantasy backdrops, built in code and redrawn per theme
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function landscapeSVG(cls) {
  return el('svg', { class: 'landscape-layer ' + cls, viewBox: '0 0 1200 220', preserveAspectRatio: 'none' });
}
function pineTree(x, baseY, scale, color) {
  const g = el('g', { transform: `translate(${x},${baseY}) scale(${scale})` });
  g.appendChild(el('path', { d: 'M-4,2 C-3,-18 -3,-42 0,-69 C3,-42 3,-18 4,2 Z', fill: '#3b2a1a' }));
  g.appendChild(el('path', {
    d: 'M0,-78 C-8,-69 -7,-62 -17,-55 C-10,-56 -8,-52 -5,-50 C-18,-45 -19,-36 -31,-29 C-22,-30 -18,-26 -14,-23 C-31,-18 -34,-8 -43,-1 C-30,-3 -24,0 -18,4 L18,4 C24,0 30,-3 43,-1 C34,-8 31,-18 14,-23 C18,-26 22,-30 31,-29 C19,-36 18,-45 5,-50 C8,-52 10,-56 17,-55 C7,-62 8,-69 0,-78 Z',
    fill: color
  }));
  g.appendChild(el('path', { d: 'M-22,-18 C-11,-14 11,-14 24,-20 M-14,-39 C-6,-36 8,-36 16,-41', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 2, fill: 'none' }));
  return g;
}
function oakTree(x, baseY, scale, trunkColor, canopyColor) {
  const g = el('g', { transform: `translate(${x},${baseY}) scale(${scale})` });
  g.appendChild(el('rect', { x: -4, y: -18, width: 8, height: 20, fill: trunkColor }));
  [[0, -40, 22], [-16, -32, 16], [16, -30, 17], [-8, -52, 15], [10, -50, 16]].forEach(([bx, by, r]) => {
    g.appendChild(el('circle', { cx: bx, cy: by, r, fill: canopyColor }));
  });
  return g;
}
function bareTree(x, baseY, scale, color) {
  const g = el('g', { transform: `translate(${x},${baseY}) scale(${scale})` });
  g.appendChild(el('path', {
    d: 'M0,0 L0,-40 M0,-40 L-14,-56 M0,-40 L12,-58 M0,-28 L-16,-40 M0,-22 L16,-34 M0,-34 L6,-52',
    stroke: color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round'
  }));
  return g;
}
function mountainRange(w, h, peaks, color, opacity) {
  let d = `M0,${h} `;
  const step = w / peaks;
  for (let i = 0; i <= peaks; i++) {
    const x = i * step;
    const y = h - (h * 0.3 + Math.random() * h * 0.5);
    d += `L${x},${y} `;
  }
  d += `L${w},${h} Z`;
  return el('path', { d, fill: color, opacity });
}
function hillPath(w, h, baseline, amp, color, opacity) {
  let d = `M0,${h} L0,${baseline} `;
  const segs = 6, step = w / segs;
  for (let i = 1; i <= segs; i++) {
    const x = i * step;
    const y = baseline + Math.sin(i * 1.7) * amp;
    d += `Q${x - step / 2},${y - amp} ${x},${y} `;
  }
  d += `L${w},${h} Z`;
  return el('path', { d, fill: color, opacity });
}
function sunGlow(cx, cy, r, color) {
  const g = el('g', {});
  g.appendChild(el('circle', { cx, cy, r: r * 1.8, fill: color, opacity: 0.15 }));
  g.appendChild(el('circle', { cx, cy, r, fill: color, opacity: 0.92 }));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.appendChild(el('line', {
      x1: cx + Math.cos(a) * (r + 8), y1: cy + Math.sin(a) * (r + 8),
      x2: cx + Math.cos(a) * (r + 22), y2: cy + Math.sin(a) * (r + 22),
      stroke: color, 'stroke-width': 3, opacity: 0.55, 'stroke-linecap': 'round'
    }));
  }
  return g;
}
function crescentMoon(cx, cy, r, glowColor, bgColor) {
  const g = el('g', {});
  g.appendChild(el('circle', { cx, cy, r: r * 1.4, fill: glowColor, opacity: 0.15 }));
  g.appendChild(el('circle', { cx, cy, r, fill: glowColor, opacity: 0.92 }));
  g.appendChild(el('circle', { cx: cx + r * 0.42, cy: cy - r * 0.28, r: r * 0.86, fill: bgColor }));
  return g;
}

function buildLandscape(themeId, container) {
  const w = 1200, h = 220;
  const back = landscapeSVG('landscape-back');
  const front = landscapeSVG('landscape-front');

  if (themeId === 'emerald') {
    back.appendChild(mountainRange(w, h, 8, 'var(--felt-dark)', 0.35));
    for (let i = 0; i < 9; i++) {
      front.appendChild(pineTree((i + 0.5) * (w / 9) + (Math.random() * 36 - 18), h - 6, 0.7 + Math.random() * 0.7,
        i % 2 ? 'var(--felt-dark)' : 'var(--felt)'));
    }
    front.appendChild(el('rect', { x: 0, y: h - 14, width: w, height: 14, fill: 'var(--felt-dark)' }));
  } else if (themeId === 'dragon') {
    back.appendChild(el('ellipse', { cx: 760, cy: 90, rx: 160, ry: 90, fill: '#ff7a3d', opacity: 0.14 }));
    back.appendChild(mountainRange(w, h, 7, 'var(--felt-dark)', 0.4));
    front.appendChild(mountainRange(w, h, 9, 'var(--felt-dark)', 0.95));
    front.appendChild(el('path', {
      d: 'M700,120 L730,90 L715,140 L750,105 L735,150', stroke: '#FF9A5A', 'stroke-width': 3, fill: 'none', opacity: 0.85
    }));
  } else if (themeId === 'moon') {
    back.appendChild(crescentMoon(1010, 55, 34, '#E4ECFB', 'var(--bg)'));
    back.appendChild(hillPath(w, h, 150, 22, 'var(--felt-dark)', 0.35));
    for (let i = 0; i < 5; i++) {
      front.appendChild(bareTree(120 + i * 230 + (Math.random() * 40 - 20), h - 20, 0.8 + Math.random() * 0.5, 'var(--felt-dark)'));
    }
    front.appendChild(hillPath(w, h, 170, 18, 'var(--felt-dark)', 0.9));
  } else if (themeId === 'parchment') {
    back.appendChild(sunGlow(300, 130, 30, 'var(--accent-bright)'));
    back.appendChild(hillPath(w, h, 155, 20, 'var(--felt-dark)', 0.3));
    for (let i = 0; i < 5; i++) {
      front.appendChild(oakTree(150 + i * 230 + (Math.random() * 40 - 20), h - 16, 0.75 + Math.random() * 0.55,
        '#5C4326', 'var(--felt-dark)'));
    }
    front.appendChild(hillPath(w, h, 172, 16, 'var(--felt-dark)', 0.85));
  } else if (themeId === 'frost') {
    back.appendChild(mountainRange(w, h, 8, 'var(--accent-bright)', 0.4));
    for (let i = 0; i < 8; i++) {
      front.appendChild(pineTree((i + 0.5) * (w / 8) + (Math.random() * 36 - 18), h - 6, 0.65 + Math.random() * 0.6,
        i % 2 ? 'var(--felt-dark)' : 'var(--accent-dark)'));
    }
    front.appendChild(el('rect', { x: 0, y: h - 12, width: w, height: 12, fill: 'var(--accent-bright)', opacity: 0.9 }));
  }

  container.appendChild(back);
  container.appendChild(front);
}

function buildAmbience(themeId) {
  const wrap = document.getElementById('ambience');
  wrap.innerHTML = '';
  buildLandscape(themeId, wrap);
  if (reducedMotion) return;

  const meta = THEME_META[themeId];
  meta.particles.forEach(p => {
    for (let i = 0; i < p.count; i++) {
      const div = document.createElement('div');
      div.className = 'particle p-' + p.type;
      div.style.setProperty('--glow', p.color);
      div.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
      div.style.left = Math.random() * 100 + 'vw';
      if (p.type === 'star') div.style.top = Math.random() * 55 + 'vh';
      const baseDur = { ember: 5, smoke: 14, snow: 10, star: 4, firefly: 13, mote: 15 }[p.type] || 12;
      const dur = baseDur + Math.random() * baseDur * 0.6;
      div.style.animationDuration = dur + 's';
      div.style.animationDelay = (-Math.random() * dur) + 's';
      const size = p.type === 'star' ? 2 + Math.random() * 2 : p.type === 'smoke' ? 16 + Math.random() * 12 : 3 + Math.random() * 3;
      div.style.width = div.style.height = size + 'px';
      wrap.appendChild(div);
    }
  });

  if (meta.fairy) {
    for (let i = 0; i < 2; i++) {
      const f = document.createElement('div');
      f.className = 'fairy';
      f.style.setProperty('--glow', themeId === 'frost' ? '#BFE0FF' : '#E4ECFB');
      const dur = 20 + Math.random() * 6;
      f.style.animationDuration = dur + 's';
      f.style.animationDelay = (-Math.random() * dur) + 's';
      wrap.appendChild(f);
    }
  }
}

// Apply a theme: re-tint the lights, redraw the backdrop, and rebuild the
// current die in the new palette. Single entry point, used on load and on
// every swatch click.
function applyTheme(themeId) {
  currentThemeId = themeId;
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('ff-theme', themeId);
  const meta = THEME_META[themeId];
  torch.color.setHex(meta.torch);
  rimLight.color.setHex(meta.rim);
  buildAmbience(themeId);
  mountDie(currentType);
  document.getElementById('resultHud').innerHTML = '-';
  document.getElementById('resultHud').classList.remove('crit', 'fail');
  document.getElementById('trayWrap').classList.remove('crit', 'fail');
  document.getElementById('hint').textContent = 'Click the tray, or press Enter / Space, to roll';
}

const themeSelectEl = document.getElementById('themeSelect');
THEME_ORDER.forEach(id => {
  const meta = THEME_META[id];
  const btn = document.createElement('button');
  btn.className = 'theme-swatch' + (id === currentThemeId ? ' active' : '');
  btn.style.background = `linear-gradient(135deg, ${meta.swatch[0]}, ${meta.swatch[1]})`;
  btn.title = meta.name;
  btn.setAttribute('aria-label', meta.name);
  btn.setAttribute('aria-pressed', id === currentThemeId ? 'true' : 'false');
  btn.addEventListener('click', () => {
    if (rolling) return;
    applyTheme(id);
    [...themeSelectEl.querySelectorAll('.theme-swatch')].forEach(b => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  });
  themeSelectEl.appendChild(btn);
});

applyTheme(currentThemeId);
