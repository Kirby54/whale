/* Whale — vue « Cerveau » : un nuage de points en forme de baleine.
   Chaque note est un point, coloré selon son dossier ; la poussière autour dessine la silhouette.
   Légende des dossiers (survol / clic pour mettre en avant) et histogramme du temps (fenêtre glissable). */
window.Graph = (() => {
  const PALETTE = ['#8b7cf6', '#2dd4bf', '#4f8cf7', '#facc15', '#fb923c', '#4ade80', '#f472b6', '#f87171', '#22d3ee', '#a3e635', '#e879f9', '#94a3b8'];
  const N_CLOUD = 7000;
  let R, S, C, G, pts, linkLines, ray, inited = false, running = false;
  let zoom = 1, ry = 0.25, rx = 0.1, drag = false, moved = 0, lx = 0, ly = 0, auto = true, tt = 0;
  let cloud = [], folders = [], folderOfPt = [], noteAt = {}, nameOfPt = {}, dateOfPt = {};
  let selFolder = null, hoverFolder = null, hoverPt = null, range = null, bins = [];
  const wrap = $('graphview'), cv = $('gcanvas'), tip = $('gtip'), mouse = new THREE.Vector2(-9, -9);

  /* ---------- Silhouette de baleine ---------- */
  function whaleCloud() {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const P = [];
    const body = Math.floor(N_CLOUD * 0.8);
    for (let i = 0; i < body; i++) {
      const t = Math.pow(rnd(), 0.85), a = rnd() * Math.PI * 2;
      const r = (0.62 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.05, 1)), 0.6) * (1 - 0.75 * t) + 0.07) * Math.pow(rnd(), 0.35);
      let y = r * Math.cos(a) * 0.8; if (y < 0) y *= 0.75;
      P.push(new THREE.Vector3(-1.7 + 3.3 * t, y + 0.15 * Math.sin(t * 3), r * Math.sin(a)));
    }
    const rest = N_CLOUD - body;
    // Nageoire caudale (horizontale), rattachée au bout du corps
    for (let i = 0; i < rest * 0.5; i++) { const s = Math.pow(rnd(), 0.8), side = rnd() < 0.5 ? -1 : 1, u = rnd(); P.push(new THREE.Vector3(1.55 + 0.5 * s + 0.12 * u * s, 0.05 + 0.1 * s + (rnd() - 0.5) * 0.04, side * (0.03 + 0.7 * s * (1 - 0.45 * u)))); }
    // Nageoires pectorales
    for (let i = 0; i < rest * 0.32; i++) { const s = rnd(), side = rnd() < 0.5 ? -1 : 1, w = (1 - s) * 0.18; P.push(new THREE.Vector3(-0.75 + 0.45 * s + (rnd() - 0.5) * w, -0.22 - 0.28 * s + (rnd() - 0.5) * 0.05, side * (0.28 + 0.5 * s + (rnd() - 0.5) * w))); }
    // Aileron dorsal, posé sur le dos
    while (P.length < N_CLOUD) { const s = rnd(), h = 0.2 * Math.pow(1 - s, 0.8) * Math.min(1, s / 0.25); P.push(new THREE.Vector3(0.38 + 0.36 * s, 0.3 + rnd() * h, (rnd() - 0.5) * 0.04)); }
    return { P, rnd };
  }

  /* ---------- Initialisation WebGL ---------- */
  function init() {
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    R.setClearColor(0x000000, 1); R.setPixelRatio(Math.min(devicePixelRatio, 2));
    S = new THREE.Scene(); C = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    ray = new THREE.Raycaster();
    G = new THREE.Group(); S.add(G);
    const { P } = whaleCloud(); cloud = P;
    const geo = new THREE.BufferGeometry().setFromPoints(P);
    geo.setAttribute('acolor', new THREE.BufferAttribute(new Float32Array(N_CLOUD * 3), 3));
    geo.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(N_CLOUD), 1));
    geo.setAttribute('aalpha', new THREE.BufferAttribute(new Float32Array(N_CLOUD), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: R.getPixelRatio() }, uDist: { value: 5 } },
      vertexShader: `attribute vec3 acolor; attribute float asize; attribute float aalpha;
        uniform float uPR; uniform float uDist; varying vec3 vC; varying float vA;
        void main(){ vC=acolor; vA=aalpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=asize*uPR*(uDist/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
          gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.2,d)); }`,
      transparent: true, depthWrite: false,
    });
    pts = new THREE.Points(geo, mat); G.add(pts);
    linkLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xa68bff, transparent: true, opacity: 0.55 }));
    G.add(linkLines);

    new ResizeObserver(resize).observe(wrap);
    cv.addEventListener('pointerdown', (e) => { drag = true; moved = 0; auto = false; lx = e.clientX; ly = e.clientY; cv.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', () => {
      if (!drag) return; drag = false; cv.style.cursor = 'grab';
      if (moved < 5 && hoverPt != null) open(nameOfPt[hoverPt]);
      setTimeout(() => (auto = true), 4000);
    });
    cv.addEventListener('pointermove', (e) => {
      const b = cv.getBoundingClientRect();
      mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      tip.style.left = e.clientX - wrap.getBoundingClientRect().left + 'px'; tip.style.top = e.clientY - wrap.getBoundingClientRect().top + 'px';
      if (drag) {
        moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
        ry += (e.clientX - lx) * 0.006; rx = Math.max(-1.1, Math.min(1.1, rx + (e.clientY - ly) * 0.005));
        lx = e.clientX; ly = e.clientY;
      }
    });
    cv.addEventListener('pointerleave', () => mouse.set(-9, -9));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.35, Math.min(2.5, zoom * (1 + e.deltaY * 0.001))); }, { passive: false });
    initHist();
    inited = true;
  }
  function resize() {
    if (!R) return; const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); drawHist();
  }

  /* ---------- Données : dossiers, notes, régions ---------- */
  const folderName = (path) => (path.includes('/') ? path.split('/')[0] : 'Notes');
  function build() {
    const names = Object.keys(notes);
    const counts = {};
    names.forEach((n) => { const f = folderName(notes[n].path); counts[f] = (counts[f] || 0) + 1; });
    folders = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'fr'))
      .map((name, i) => ({ name, count: counts[name], color: new THREE.Color(PALETTE[i % PALETTE.length]), hex: PALETTE[i % PALETTE.length] }));
    if (selFolder != null && !counts[selFolder]) selFolder = null;

    // Chaque dossier occupe une tranche de la baleine (de la tête à la queue)
    const order = cloud.map((p, i) => [p.x, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const total = names.length || 1;
    const shares = folders.map((f) => Math.max(f.count / total, 0.06));
    const sum = shares.reduce((a, b) => a + b, 0) || 1;
    folderOfPt = new Array(N_CLOUD);
    const slices = []; let start = 0;
    folders.forEach((f, fi) => {
      const len = fi === folders.length - 1 ? N_CLOUD - start : Math.round((shares[fi] / sum) * N_CLOUD);
      const sl = order.slice(start, start + len); sl.forEach((i) => (folderOfPt[i] = fi)); slices.push(sl); start += len;
    });
    if (!folders.length) order.forEach((i) => (folderOfPt[i] = -1));

    // Placer chaque note sur un point de la tranche de son dossier
    noteAt = {}; nameOfPt = {}; dateOfPt = {};
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const byFolder = {}; names.sort().forEach((n) => { const f = folderName(notes[n].path); (byFolder[f] = byFolder[f] || []).push(n); });
    folders.forEach((f, fi) => {
      const sl = slices[fi].slice(); const list = byFolder[f.name] || [];
      list.forEach((n) => {
        if (!sl.length) return;
        const k = Math.floor(rnd() * sl.length); const idx = sl.splice(k, 1)[0];
        noteAt[n] = idx; nameOfPt[idx] = n; dateOfPt[idx] = noteDate(n);
      });
    });
    buildBins(); renderLegend(); style(); drawHist();
  }

  /* ---------- Apparence des points ---------- */
  function inRange(idx) {
    if (!range) return true;
    const d = dateOfPt[idx]; if (!d) return false;
    return d >= range[0] && d <= range[1];
  }
  function style() {
    if (!pts) return;
    const col = pts.geometry.attributes.acolor.array, size = pts.geometry.attributes.asize.array, al = pts.geometry.attributes.aalpha.array;
    const active = hoverFolder != null ? hoverFolder : selFolder != null ? folders.findIndex((f) => f.name === selFolder) : -1;
    const grey = new THREE.Color('#6b6b6b');
    for (let i = 0; i < N_CLOUD; i++) {
      const fi = folderOfPt[i]; const c = fi >= 0 && folders[fi] ? folders[fi].color : grey;
      const isNote = nameOfPt[i] !== undefined;
      let s, a;
      if (!isNote) { s = 2; a = active < 0 ? 0.34 : fi === active ? 0.45 : 0.16; }
      else if (active < 0) { s = 3.6; a = 0.85; }
      else if (fi === active) { s = 5; a = 1; }
      else { s = 1.9; a = 0.22; }
      if (isNote && !inRange(i)) { a *= 0.12; s = Math.min(s, 2); }
      if (i === hoverPt) { s = 9; a = 1; }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; size[i] = s; al[i] = a;
    }
    pts.geometry.attributes.acolor.needsUpdate = pts.geometry.attributes.asize.needsUpdate = pts.geometry.attributes.aalpha.needsUpdate = true;
  }
  function setLinks(idx) {
    const arr = [];
    if (idx != null) {
      const n = nameOfPt[idx], p = parse(n), a = cloud[idx];
      const linked = new Set(p.links);
      Object.keys(notes).forEach((m) => { if (m !== n && parse(m).links.includes(n)) linked.add(m); });
      linked.forEach((m) => { const j = noteAt[m]; if (j != null) { const b = cloud[j]; arr.push(a.x, a.y, a.z, b.x, b.y, b.z); } });
    }
    linkLines.geometry.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); linkLines.geometry = g;
  }

  /* ---------- Légende des dossiers ---------- */
  function renderLegend() {
    const el = $('glegend');
    el.classList.toggle('sel', selFolder != null);
    el.innerHTML = `<div class="lh"><span>DOSSIERS</span><span>${folders.length}</span></div>` +
      folders.map((f, i) => `<div class="lr ${selFolder === f.name ? 'on' : ''}" data-i="${i}"><i style="background:${f.hex}"></i><span>${esc(f.name)}</span><span class="c">${f.count}</span></div>`).join('');
    el.querySelectorAll('.lr').forEach((r) => {
      const i = +r.dataset.i;
      r.onmouseenter = () => { hoverFolder = i; style(); };
      r.onmouseleave = () => { hoverFolder = null; style(); };
      r.onclick = () => { selFolder = selFolder === folders[i].name ? null : folders[i].name; renderLegend(); style(); };
    });
  }

  /* ---------- Histogramme du temps ---------- */
  const hc = $('ghist'); let hDrag = null;
  const addDays = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  function buildBins() {
    const ds = Object.values(dateOfPt).filter(Boolean).sort();
    bins = [];
    if (!ds.length) return;
    const first = ds[0], last = ds[ds.length - 1];
    const span = Math.round((new Date(last) - new Date(first)) / 864e5) + 1;
    const step = span <= 60 ? 1 : span <= 420 ? 7 : 30;
    const n = Math.min(90, Math.ceil(span / step));
    for (let i = 0; i < n; i++) bins.push({ from: addDays(first, i * step), to: addDays(first, (i + 1) * step - 1), count: 0 });
    ds.forEach((d) => { const i = Math.min(n - 1, Math.floor((new Date(d) - new Date(first)) / 864e5 / step)); bins[i].count++; });
    if (range && (range[1] < first || range[0] > last)) range = null;
  }
  function drawHist() {
    const dpr = devicePixelRatio || 1, W = hc.clientWidth, H = hc.clientHeight;
    if (!W) return;
    hc.width = W * dpr; hc.height = H * dpr;
    const x = hc.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    if (!bins.length) { $('ghistlabel').textContent = ''; return; }
    const mx = Math.max(...bins.map((b) => b.count), 1), bw = W / bins.length;
    let i0 = -1, i1 = -1;
    if (range) bins.forEach((b, i) => { if (b.to >= range[0] && b.from <= range[1]) { if (i0 < 0) i0 = i; i1 = i; } });
    bins.forEach((b, i) => {
      const h = Math.max(b.count ? 3 : 1, (b.count / mx) * (H - 6));
      x.fillStyle = range ? (i >= i0 && i <= i1 ? '#e5e5e5' : '#4a4a4a') : '#8a8a8a';
      x.fillRect(i * bw + 0.5, H - h, Math.max(1, bw - 1.5), h);
    });
    if (range && i0 >= 0) { x.strokeStyle = '#e5e5e5'; x.lineWidth = 1; x.strokeRect(i0 * bw + 0.5, 0.5, (i1 - i0 + 1) * bw - 1, H - 1); }
    const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const nIn = range ? Object.keys(dateOfPt).filter((k) => inRange(+k)).length : Object.keys(nameOfPt).length;
    $('ghistlabel').textContent = range ? `${fmt(range[0])} → ${fmt(range[1])} · ${nIn} notes` : `${fmt(bins[0].from)} → ${fmt(bins[bins.length - 1].to)} · double-clic : tout`;
  }
  function initHist() {
    const binAt = (e) => { const b = hc.getBoundingClientRect(); return Math.max(0, Math.min(bins.length - 1, Math.floor(((e.clientX - b.left) / b.width) * bins.length))); };
    hc.addEventListener('pointerdown', (e) => {
      if (!bins.length) return; e.preventDefault(); hc.setPointerCapture(e.pointerId);
      const i = binAt(e);
      let i0 = -1, i1 = -1;
      if (range) bins.forEach((b, k) => { if (b.to >= range[0] && b.from <= range[1]) { if (i0 < 0) i0 = k; i1 = k; } });
      if (range && i > i0 && i < i1) hDrag = { mode: 'move', start: i, i0, i1 };
      else if (range && i === i0 && i1 > i0) hDrag = { mode: 'left', i1 };
      else if (range && i === i1 && i1 > i0) hDrag = { mode: 'right', i0 };
      else { hDrag = { mode: 'new', a: i }; range = [bins[i].from, bins[i].to]; }
      drawHist(); style();
    });
    hc.addEventListener('pointermove', (e) => {
      if (!hDrag) return; const i = binAt(e);
      let a, b;
      if (hDrag.mode === 'new') { a = Math.min(hDrag.a, i); b = Math.max(hDrag.a, i); }
      else if (hDrag.mode === 'move') { const d = Math.max(-hDrag.i0, Math.min(bins.length - 1 - hDrag.i1, i - hDrag.start)); a = hDrag.i0 + d; b = hDrag.i1 + d; }
      else if (hDrag.mode === 'left') { a = Math.min(i, hDrag.i1); b = hDrag.i1; }
      else { a = hDrag.i0; b = Math.max(i, hDrag.i0); }
      range = [bins[a].from, bins[b].to]; drawHist(); style();
    });
    hc.addEventListener('pointerup', () => { hDrag = null; });
    hc.addEventListener('dblclick', () => { range = null; drawHist(); style(); });
  }

  /* ---------- Boucle d'animation ---------- */
  function frame() {
    if (!running) return;
    tt += 0.016; if (auto && !drag) ry += 0.0012;
    const d = zoom * Math.max(7.2 / (C.aspect || 1), 4.2);
    C.position.set(0, d * 0.08, d); C.lookAt(0, 0.05, 0);
    pts.material.uniforms.uDist.value = d;
    G.rotation.set(rx, ry, 0.03 * Math.sin(tt * 0.6)); G.position.set(-0.2, 0.3 + 0.03 * Math.sin(tt * 0.8), 0); G.updateMatrixWorld();

    // Survol : la note la plus proche du curseur
    ray.params.Points.threshold = 0.035 * zoom;
    ray.setFromCamera(mouse, C);
    let best = null;
    if (!drag) for (const h of ray.intersectObject(pts)) { const i = h.index; if (nameOfPt[i] !== undefined && inRange(i)) { best = i; break; } }
    if (best !== hoverPt) {
      hoverPt = best; style(); setLinks(best);
      if (best != null) { const n = nameOfPt[best]; tip.innerHTML = `${esc(n)}<small>${esc(folderName(notes[n].path))}</small>`; tip.style.display = 'block'; cv.style.cursor = 'pointer'; }
      else { tip.style.display = 'none'; if (!drag) cv.style.cursor = 'grab'; }
    }
    R.render(S, C);
    requestAnimationFrame(frame);
  }

  return {
    show() { if (!inited) init(); resize(); build(); if (!running) { running = true; frame(); } },
    hide() { running = false; tip.style.display = 'none'; },
  };
})();
