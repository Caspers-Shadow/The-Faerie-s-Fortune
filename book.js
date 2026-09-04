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
  const paper = 0xb99a6b;

  function rendererFor(canvas, alpha = true) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    return renderer;
  }

  function addLights(scene) {
    scene.add(new THREE.HemisphereLight(0xd6bd8b, 0x25150f, .78));
    const key = new THREE.DirectionalLight(0xe5c98d, .62);
    key.position.set(-3, 7, 1);
    scene.add(key);
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
  const closedShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.45, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x070403, transparent: true, opacity: .38, depthWrite: false })
  );
  closedShadow.rotation.x = -Math.PI / 2;
  closedShadow.position.y = -.36;
  closedBook.add(closedShadow);
  closedBook.rotation.set(-.05, -.18, .03);
  closedScene.add(closedBook);

  // Full open book: two covers, stacked paper, and a separate turning leaf.
  const fullRenderer = rendererFor(fullCanvas);
  const fullScene = new THREE.Scene();
  // An orthographic, straight-down camera keeps the spread flat like a magazine
  // laid on the table. This removes the foreshortening that made the far edge
  // look raised and keeps both pages equally readable at every screen size.
  const fullCamera = new THREE.OrthographicCamera(-5, 5, 3.5, -3.5, .1, 50);
  fullCamera.position.set(0, 10, 0);
  // Pick a stable screen-up axis; the default Y-up vector is parallel to the
  // camera direction in a top-down view and can produce an undefined roll.
  fullCamera.up.set(0, 0, -1);
  fullCamera.lookAt(0, 0, 0);
  addLights(fullScene);
  const openBook = new THREE.Group();
  openBook.rotation.x = 0;
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
  // Subdivide both axes so the sheet can bow and twist like a real magazine
  // page instead of rotating as a rigid rectangle.
  const turningGeometry = new THREE.PlaneGeometry(pageW, pageH, 32, 18);
  turningGeometry.translate(pageW / 2, 0, 0);
  const turningBaseX = new Float32Array(turningGeometry.attributes.position.count);
  const turningBaseY = new Float32Array(turningGeometry.attributes.position.count);
  for (let i = 0; i < turningBaseX.length; i++) {
    turningBaseX[i] = turningGeometry.attributes.position.getX(i);
    turningBaseY[i] = turningGeometry.attributes.position.getY(i);
  }
  const turningPage = new THREE.Mesh(turningGeometry, paperMaterial());
  turningPage.rotation.x = -Math.PI / 2;
  turningPage.visible = false;
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
    gradient.addColorStop(0, side === 'left' ? '#a98b5e' : '#d2b985');
    gradient.addColorStop(.1, '#d8c08e');
    gradient.addColorStop(1, side === 'left' ? '#d2b985' : '#ae905f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(104,72,35,.18)';
    ctx.lineWidth = 2;
    for (let y = 255; y < 1130; y += 56) { ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(810, y); ctx.stroke(); }
    ctx.fillStyle = '#3a2413';
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    const x = side === 'left' ? 775 : 125;
    ctx.font = '700 46px Georgia';
    ctx.fillText(data?.title || 'The Party Chronicle', x, 115);
    ctx.font = '22px monospace';
    ctx.fillStyle = '#634521';
    ctx.fillText(data?.date || '', x, 158);
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
    ctx.fillStyle = '#634521';
    ctx.textAlign = 'center';
    ctx.fillText(`${data?.page || 1} / ${data?.total || 1}`, 450, 1175);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }

  let currentData = { title: 'The Party Chronicle', date: '', notes: [], page: 1, total: 1 };
  function blankTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1240;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#a98b5e');
    gradient.addColorStop(.1, '#d8c08e');
    gradient.addColorStop(1, '#d2b985');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(104,72,35,.14)';
    ctx.lineWidth = 2;
    for (let y = 255; y < 1130; y += 56) {
      ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(810, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(99,69,33,.35)';
    ctx.font = 'italic 26px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('✦', 450, 1175);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }
  function coverTexture(side) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1240;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#321713';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d2a554';
    ctx.lineWidth = 10;
    ctx.strokeRect(46, 46, canvas.width - 92, canvas.height - 92);
    ctx.strokeStyle = 'rgba(231,192,110,.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(72, 72, canvas.width - 144, canvas.height - 144);
    ctx.fillStyle = '#f0dba8';
    ctx.textAlign = 'center';
    ctx.font = '700 42px Georgia';
    ctx.fillText(side === 'left' ? 'THE FAERIE’S' : 'PARTY CHRONICLE', 450, 520);
    ctx.font = '700 54px Georgia';
    ctx.fillText(side === 'left' ? 'FORTUNE' : 'BACK COVER', 450, 590);
    ctx.font = '22px monospace';
    ctx.fillStyle = '#d2a554';
    ctx.fillText('✦', 450, 680);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }
  function showBackCover() {
    if (leftPage.material.map) leftPage.material.map.dispose();
    if (rightPage.material.map) rightPage.material.map.dispose();
    leftPage.material.map = coverTexture('left');
    rightPage.material.map = coverTexture('right');
    leftPage.material.needsUpdate = rightPage.material.needsUpdate = true;
  }
  let currentSpread = {
    left: null,
    right: currentData,
  };
  function replaceMap(mesh, texture) {
    if (mesh.material.map) mesh.material.map.dispose();
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  }
  function setSpreadData(spread) {
    currentSpread = spread || currentSpread;
    currentData = currentSpread.right || currentData;
    replaceMap(leftPage, currentSpread.left?.cover
      ? coverTexture('left')
      : currentSpread.left?.blank
        ? blankTexture()
        : pageTexture(currentSpread.left, 'left'));
    replaceMap(rightPage, currentSpread.right?.blank
      ? blankTexture()
      : pageTexture(currentSpread.right || currentData, 'right'));
  }
  setSpreadData(currentSpread);

  let turning = false;
  let turningStartedAt = 0;
  let turnWatchdog = null;
  function turn(direction) {
    // A hidden/background tab can suspend requestAnimationFrame. Never let a
    // suspended animation permanently swallow the next page request.
    if (turning && performance.now() - turningStartedAt < 1800) return;
    if (turnWatchdog) window.clearTimeout(turnWatchdog);
    turning = true;
    turningStartedAt = performance.now();
    turningPage.visible = true;
    turningPivot.rotation.z = 0;
    // Forward turns the right leaf; backward turns the left leaf. The new
    // spread is painted after the leaf finishes travelling.
    const turningData = direction > 0 ? currentSpread.right : currentSpread.left;
    replaceMap(turningPage, turningData?.cover
      ? coverTexture('left')
      : turningData?.blank
        ? blankTexture()
        : pageTexture(turningData || currentData, direction > 0 ? 'right' : 'left'));
    const start = performance.now();
    const duration = reducedMotion ? 1 : 720;
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = .5 - Math.cos(p * Math.PI) / 2;
      // A magazine page bows upward and twists at the spine halfway through
      // its travel. The extra rows are what create the curled-sheet silhouette
      // seen in the MOD3 flipbook example.
      const positions = turningGeometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = turningBaseX[i];
        const baseY = turningBaseY[i];
        // turningGeometry is translated so its hinge is x=0 and free edge is
        // x=pageW; do not offset this coordinate or the bound edge will bend.
        const u = x / pageW;
        const v = baseY / pageH + .5;
        const travel = Math.sin(p * Math.PI);
        // Bend each column progressively from the spine. Unlike rotating the
        // whole leaf as one rigid card, this keeps the bound edge fixed and
        // lets the free edge travel around the hinge like MOD3's Bend/Pivot.
        const hingeProgress = Math.pow(Math.max(0, Math.min(1, u)), .86);
        const angle = direction * eased * Math.PI * hingeProgress;
        const bow = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * travel * -.18;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        positions.setX(i, x * c - bow * s);
        positions.setY(i, baseY);
        positions.setZ(i, x * s + bow * c);
      }
      positions.needsUpdate = true;
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        turningPivot.rotation.z = 0;
        turningPage.visible = false;
        turning = false;
        turningStartedAt = 0;
        if (turnWatchdog) { window.clearTimeout(turnWatchdog); turnWatchdog = null; }
      }
    }
    requestAnimationFrame(frame);
    turnWatchdog = window.setTimeout(() => {
      if (!turning) return;
      turningPivot.rotation.z = 0;
      turningPage.visible = false;
      turning = false;
      turningStartedAt = 0;
      turnWatchdog = null;
    }, reducedMotion ? 80 : 1500);
  }

  let isOpen = false;
  window.addEventListener('ff:book-open', () => { isOpen = true; resize(); });
  window.addEventListener('ff:book-close', () => { isOpen = false; });
  window.addEventListener('ff:book-cover', showBackCover);
  window.addEventListener('ff:book-spread', e => setSpreadData(e.detail));
  window.addEventListener('ff:book-turn', e => turn(e.detail.direction));

  // MOD3-style direct manipulation: click either half of the spread to turn
  // in that direction, or use the keyboard arrows while the book is open.
  fullCanvas.addEventListener('click', event => {
    if (!isOpen || turning) return;
    const rect = fullCanvas.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / Math.max(1, rect.width);
    // Ignore the dark table surround; only the physical spread is clickable.
    if (normalizedX < .16 || normalizedX > .84) return;
    const direction = normalizedX < .5 ? -1 : 1;
    window.dispatchEvent(new CustomEvent('ff:book-control', { detail: { direction } }));
  });
  document.addEventListener('keydown', event => {
    if (!isOpen || turning) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('ff:book-control', {
        detail: { direction: event.key === 'ArrowLeft' ? -1 : 1 },
      }));
    }
  });

  function resize() {
    const cw = Math.max(1, closedCanvas.clientWidth);
    const ch = Math.max(1, closedCanvas.clientHeight);
    closedRenderer.setSize(cw, ch, false);
    closedCamera.aspect = cw / ch;
    closedCamera.updateProjectionMatrix();
    const fw = Math.max(1, fullCanvas.clientWidth);
    const fh = Math.max(1, fullCanvas.clientHeight);
    fullRenderer.setSize(fw, fh, false);
    const aspect = fw / fh;
    // Fit the whole physical spread, including its cover overhang, while
    // retaining a comfortable margin on wide and narrow screens.
    const viewH = Math.max(5.7, 7.9 / aspect);
    const halfH = viewH / 2;
    const halfW = halfH * aspect;
    fullCamera.left = -halfW;
    fullCamera.right = halfW;
    fullCamera.top = halfH;
    fullCamera.bottom = -halfH;
    fullCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  closedRenderer.render(closedScene, closedCamera);
  if (trigger) trigger.classList.add('book-webgl-ready');

  function render() {
    closedBook.rotation.y += reducedMotion ? 0 : .0012;
    closedRenderer.render(closedScene, closedCamera);
    if (isOpen || turning) fullRenderer.render(fullScene, fullCamera);
    requestAnimationFrame(render);
  }
  render();
})();
