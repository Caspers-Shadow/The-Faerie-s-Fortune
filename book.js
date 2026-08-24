// Physical Three.js chronicle. The small renderer keeps a closed book beside
// the table; the full-screen renderer opens it and turns real page meshes.
(function setupChronicleBook() {
  const closedCanvas = document.getElementById('bookClosedScene');
  const fullCanvas = document.getElementById('bookFullscreenScene');
  if (!closedCanvas || !fullCanvas || typeof THREE === 'undefined') return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const trigger = document.getElementById('hamburgerBtn');
  const leather = 0x733d28;
  const leatherDark = 0x24100c;
  const gold = 0xe0b65f;
  const paper = 0xe8d5a7;

  function rendererFor(canvas, alpha = true) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    return renderer;
  }

  // Both scenes share one warm key light that flickers gently, like the
  // dice tray's torch, so the whole site feels lit from the same source
  // rather than each piece having its own flat studio lighting.
  const keyLights = [];
  function addLights(scene) {
    scene.add(new THREE.HemisphereLight(0xffe5bd, 0x25150f, 1.1));
    const key = new THREE.DirectionalLight(0xffd28d, 1.15);
    key.position.set(-3, 6, 4);
    scene.add(key);
    keyLights.push(key);
    const rim = new THREE.PointLight(0x8fa8ff, .45, 15);
    rim.position.set(4, 2, -2);
    scene.add(rim);
  }

  function coverMaterial() {
    return new THREE.MeshStandardMaterial({ color: leather, emissive: 0x1a0805, emissiveIntensity: .22, roughness: .66, metalness: .1 });
  }
  function goldMaterial() {
    return new THREE.MeshStandardMaterial({ color: gold, roughness: .32, metalness: .78 });
  }
  function paperMaterial(texture) {
    return new THREE.MeshStandardMaterial({ color: paper, map: texture || null, roughness: .88, side: THREE.DoubleSide });
  }
  function shadowMaterial(opacity) {
    return new THREE.MeshBasicMaterial({ color: 0x070403, transparent: true, opacity, depthWrite: false });
  }

  function addCoverDetails(group, width, height, y) {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(.48, .035, 10, 48), goldMaterial());
    frame.rotation.x = Math.PI / 2;
    frame.position.set(0, y, 0);
    group.add(frame);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.16), new THREE.MeshStandardMaterial({ color: 0x7fc6b0, emissive: 0x234a3b, emissiveIntensity: .55, roughness: .22 }));
    gem.position.set(0, y + .04, 0);
    group.add(gem);
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width * .88, .02, height * .84)),
      new THREE.LineBasicMaterial({ color: gold })
    );
    border.position.y = y;
    group.add(border);
  }

  // A leather strap with a small buckle, running across the closed cover.
  // Real journals like this almost always have one holding it shut.
  function addClasp(group, width, y) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(.22, .04, 2.0), new THREE.MeshStandardMaterial({ color: leatherDark, roughness: .6 }));
    strap.position.set(width * .3, y + .02, 0);
    group.add(strap);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(.09, .018, 8, 16), goldMaterial());
    buckle.rotation.x = Math.PI / 2;
    buckle.position.set(width * .3, y + .05, .55);
    group.add(buckle);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .12, 6), goldMaterial());
    pin.rotation.z = Math.PI / 2;
    pin.position.set(width * .3, y + .05, .55);
    group.add(pin);
  }

  // Closed tabletop book.
  const closedRenderer = rendererFor(closedCanvas);
  const closedScene = new THREE.Scene();
  const closedCamera = new THREE.PerspectiveCamera(34, 1.45, .1, 30);
  closedCamera.position.set(3.05, 2.7, 3.65);
  closedCamera.lookAt(0, 0, 0);
  addLights(closedScene);
  const closedBook = new THREE.Group();
  const closedCover = new THREE.Mesh(new THREE.BoxGeometry(2.8, .18, 1.92), coverMaterial());
  const closedPages = new THREE.Mesh(new THREE.BoxGeometry(2.61, .34, 1.73), paperMaterial());
  const closedBack = new THREE.Mesh(new THREE.BoxGeometry(2.8, .16, 1.92), new THREE.MeshStandardMaterial({ color: leatherDark, roughness: .78 }));
  closedCover.position.y = .25;
  closedBack.position.y = -.25;
  closedBook.add(closedBack, closedPages, closedCover);
  addCoverDetails(closedBook, 2.8, 1.92, .35);
  addClasp(closedBook, 2.8, .25);
  const closedShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 2.5), shadowMaterial(.38));
  closedShadow.rotation.x = -Math.PI / 2;
  closedShadow.position.y = -.36;
  closedBook.add(closedShadow);
  closedBook.rotation.set(-.05, -.18, .03);
  closedScene.add(closedBook);
  const closedRestY = closedBook.position.y;

  // Full open book: two covers, stacked paper, and a separate turning leaf.
  const fullRenderer = rendererFor(fullCanvas);
  const fullScene = new THREE.Scene();
  const fullCamera = new THREE.PerspectiveCamera(34, 1.65, .1, 50);
  fullCamera.position.set(0, 7.4, 8.6);
  fullCamera.lookAt(0, 0, 0);
  addLights(fullScene);
  const openBook = new THREE.Group();
  openBook.rotation.x = -.05;
  fullScene.add(openBook);

  const pageW = 3.7;
  const pageH = 5.15;
  const thickness = .18;
  const leftCover = new THREE.Mesh(new THREE.BoxGeometry(pageW + .28, thickness, pageH + .3), coverMaterial());
  leftCover.position.set(-pageW / 2 - .08, -.22, 0);
  leftCover.rotation.z = -.025;
  const rightCover = leftCover.clone();
  rightCover.position.x = pageW / 2 + .08;
  rightCover.rotation.z = .025;
  openBook.add(leftCover, rightCover);

  const leftStack = new THREE.Mesh(new THREE.BoxGeometry(pageW, .22, pageH), paperMaterial());
  leftStack.position.set(-pageW / 2, -.07, 0);
  const rightStack = leftStack.clone();
  rightStack.position.x = pageW / 2;
  openBook.add(leftStack, rightStack);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, pageH + .18, 24), new THREE.MeshStandardMaterial({ color: leatherDark, roughness: .7 }));
  spine.rotation.x = Math.PI / 2;
  spine.position.y = -.05;
  openBook.add(spine);

  // A soft shadow under the whole open book, grounding it on the table
  // the same way the closed book already has one.
  const openShadow = new THREE.Mesh(new THREE.PlaneGeometry(pageW * 2.5, pageH * 1.4), shadowMaterial(.3));
  openShadow.rotation.x = -Math.PI / 2;
  openShadow.position.y = -.42;
  openBook.add(openShadow);

  const leftPage = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageH), paperMaterial());
  leftPage.rotation.x = -Math.PI / 2;
  leftPage.position.set(-pageW / 2, .07, 0);
  openBook.add(leftPage);

  const rightPage = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageH), paperMaterial());
  rightPage.rotation.x = -Math.PI / 2;
  rightPage.position.set(pageW / 2, .075, 0);
  openBook.add(rightPage);

  const turningPivot = new THREE.Group();
  turningPivot.position.set(0, .1, 0);
  const turningGeometry = new THREE.PlaneGeometry(pageW, pageH, 22, 1);
  turningGeometry.translate(pageW / 2, 0, 0);
  const turningPage = new THREE.Mesh(turningGeometry, paperMaterial());
  turningPage.rotation.x = -Math.PI / 2;
  turningPivot.add(turningPage);
  openBook.add(turningPivot);

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxY) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = word;
        if (y > maxY) return y;
      } else line = test;
    }
    if (line && y <= maxY) ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  function pageTexture(data, side) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1240;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, side === 'left' ? '#c5aa76' : '#efe0b8');
    gradient.addColorStop(.1, '#f0dfb4');
    gradient.addColorStop(1, side === 'left' ? '#efe0b8' : '#c9ae79');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // gutter shadow: a soft dark edge on whichever side sits at the spine
    const gutterGrad = ctx.createLinearGradient(side === 'left' ? canvas.width : 0, 0, side === 'left' ? canvas.width - 90 : 90, 0);
    gutterGrad.addColorStop(0, 'rgba(40,20,8,0.28)');
    gutterGrad.addColorStop(1, 'rgba(40,20,8,0)');
    ctx.fillStyle = gutterGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(104,72,35,.18)';
    ctx.lineWidth = 2;
    for (let y = 255; y < 1130; y += 56) { ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(810, y); ctx.stroke(); }

    ctx.fillStyle = '#55351d';
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    const x = side === 'left' ? 775 : 125;
    ctx.font = '700 46px Georgia';
    ctx.fillText(data?.title || 'The Party Chronicle', x, 115);

    // a hand-drawn-feeling rule under the title instead of a straight one
    ctx.strokeStyle = 'rgba(85,53,29,.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const ruleY = 132, ruleStart = side === 'left' ? 775 : 125, ruleEnd = side === 'left' ? 500 : 400;
    ctx.moveTo(ruleStart, ruleY);
    ctx.bezierCurveTo(
      ruleStart - (ruleStart - ruleEnd) * .3, ruleY + 4,
      ruleStart - (ruleStart - ruleEnd) * .7, ruleY - 3,
      ruleEnd, ruleY
    );
    ctx.stroke();

    ctx.font = '22px monospace';
    ctx.fillStyle = '#86633d';
    ctx.fillText(data?.date || '', x, 168);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3e2a1a';
    let y = 235;
    const notes = data?.notes || [];
    if (!notes.length) {
      ctx.font = 'italic 30px Georgia';
      ctx.fillText('No notes written in this session.', 125, y);
    } else {
      for (const note of notes) {
        ctx.font = '700 25px Georgia';
        ctx.fillText(note.author || 'Someone', 125, y);
        ctx.font = '27px Georgia';
        y = wrapText(ctx, note.text, 125, y + 35, 650, 38, 1080) + 22;
        if (y > 1080) break;
      }
    }
    ctx.font = '20px monospace';
    ctx.fillStyle = '#86633d';
    ctx.textAlign = 'center';
    ctx.fillText(`${data?.page || 1} / ${data?.total || 1}`, 450, 1175);

    // faint deckled vignette so the page doesn't read as a flat cut rectangle
    const vignette = ctx.createRadialGradient(450, 620, 500, 450, 620, 720);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(60,35,15,0.16)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  let currentData = { title: 'The Party Chronicle', date: '', notes: [], page: 1, total: 1 };
  function setPageData(data) {
    currentData = data || currentData;
    if (leftPage.material.map) leftPage.material.map.dispose();
    if (rightPage.material.map) rightPage.material.map.dispose();
    leftPage.material.map = pageTexture(currentData, 'left');
    rightPage.material.map = pageTexture(currentData, 'right');
    leftPage.material.needsUpdate = rightPage.material.needsUpdate = true;
  }
  setPageData(currentData);

  let turning = false;
  function turn(direction) {
    if (turning) return;
    turning = true;
    turningPivot.rotation.z = direction > 0 ? 0 : Math.PI;
    turningPage.material.map = pageTexture(currentData, direction > 0 ? 'right' : 'left');
    turningPage.material.needsUpdate = true;
    const from = turningPivot.rotation.z;
    const to = direction > 0 ? Math.PI : 0;
    const start = performance.now();
    const duration = reducedMotion ? 1 : 720;
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = .5 - Math.cos(p * Math.PI) / 2;
      turningPivot.rotation.z = from + (to - from) * eased;
      // A magazine page bows upward halfway through its travel.
      const positions = turningGeometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const baseY = positions.getY(i);
        const bend = Math.sin((x / pageW) * Math.PI) * Math.sin(p * Math.PI) * .34;
        positions.setZ(i, bend);
        positions.setY(i, baseY);
      }
      positions.needsUpdate = true;
      if (p < 1) requestAnimationFrame(frame);
      else { turningPivot.rotation.z = 0; turning = false; }
    }
    requestAnimationFrame(frame);
  }

  let isOpen = false;
  window.addEventListener('ff:book-open', () => { isOpen = true; resize(); });
  window.addEventListener('ff:book-close', () => { isOpen = false; });
  window.addEventListener('ff:book-page', e => setPageData(e.detail));
  window.addEventListener('ff:book-turn', e => turn(e.detail.direction));

  function resize() {
    const cw = Math.max(1, closedCanvas.clientWidth);
    const ch = Math.max(1, closedCanvas.clientHeight);
    closedRenderer.setSize(cw, ch, false);
    closedCamera.aspect = cw / ch;
    closedCamera.updateProjectionMatrix();
    const fw = Math.max(1, fullCanvas.clientWidth);
    const fh = Math.max(1, fullCanvas.clientHeight);
    fullRenderer.setSize(fw, fh, false);
    fullCamera.aspect = fw / fh;
    fullCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  closedRenderer.render(closedScene, closedCamera);
  if (trigger) trigger.classList.add('book-webgl-ready');

  let t = 0;
  function render() {
    t += 0.016;
    if (!reducedMotion) {
      // one shared candlelit flicker across both scenes
      const flicker = 1.15 + Math.sin(t * 6) * 0.08 + Math.sin(t * 13) * 0.04;
      keyLights.forEach(l => { l.intensity = flicker; });
      // the closed book gets a slow idle bob, like it's resting on a
      // slightly uneven table rather than floating
      closedBook.position.y = closedRestY + Math.sin(t * 0.9) * 0.02;
      closedBook.rotation.y += 0.0012;
    }
    closedRenderer.render(closedScene, closedCamera);
    if (isOpen || turning) fullRenderer.render(fullScene, fullCamera);
    requestAnimationFrame(render);
  }
  render();
})();
