/* Whale — "Brain" view: a whale-shaped point cloud.
   Every note is a point, colored by its folder; the dust around it draws the silhouette.
   Folder legend (hover / click to highlight) and time histogram (draggable window). */
window.Graph = (() => {
  const PALETTE = ['#8b7cf6', '#2dd4bf', '#4f8cf7', '#facc15', '#fb923c', '#4ade80', '#f472b6', '#f87171', '#22d3ee', '#a3e635', '#e879f9', '#94a3b8'];
  let N_CLOUD = 22000; // grows with the vault
  let BODY_N = 0;     // the first BODY_N points are the body (skin + pleats); fins and flukes come after
  let R, S, C, G, pts, linkLines, webLines, ray, inited = false, running = false;
  let zoom = 1, ry = 0.35, rx = 0.42, drag = false, moved = 0, lx = 0, ly = 0, auto = true, tt = 0;
  let cloud = [], folders = [], folderOfPt = [], noteAt = {}, nameOfPt = {}, dateOfPt = {};
  let selFolder = null, hoverFolder = null, hoverPt = null, range = null, bins = [], lit = null; // lit: notes lit up by the AI
  const wrap = $('graphview'), cv = $('gcanvas'), tip = $('gtip'), mouse = new THREE.Vector2(-9, -9);

  /* ---------- Whale silhouette (humpback anatomy) ----------
     Points sit mostly on the skin so the 3D volume reads clearly:
     flat broad head, deep belly with throat pleats, long knobbly pectoral fins,
     small dorsal fin, thin tail stock and wide swept-back flukes with a central notch. */
  const X0 = -1.75, X1 = 1.55;                     // snout -> tail stock
  const tOf = (x) => (x - X0) / (X1 - X0);
  const radius = (t) => 0.035 + (t < 0.32 ? 0.5 * Math.pow(Math.sin((t / 0.32) * Math.PI / 2), 0.8) : 0.5 * Math.pow(1 - Math.pow((t - 0.32) / 0.68, 1.7), 1.2));
  const spineY = (t) => 0.07 * Math.sin(Math.PI * t) - 0.06 * t - 0.03 * Math.max(0, 0.12 - t) / 0.12;
  function whaleCloud() {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const P = [];
    const n = (f) => Math.floor(N_CLOUD * f);
    const skin = (t, a, depth) => {
      const r = radius(t) * depth, c = Math.cos(a);
      return new THREE.Vector3(X0 + t * (X1 - X0), spineY(t) + r * c * (c > 0 ? 0.74 : 0.95), r * Math.sin(a));
    };
    // Body: 88% on the skin, 12% inside
    for (let i = 0, N = n(0.62); i < N; i++) {
      const t = Math.pow(rnd(), 0.9), a = rnd() * Math.PI * 2;
      P.push(skin(t, a, rnd() < 0.88 ? 0.97 + rnd() * 0.05 : Math.pow(rnd(), 0.5)));
    }
    // Throat pleats: lines along the lower front of the body
    for (let i = 0, N = n(0.08); i < N; i++) {
      const t = 0.03 + rnd() * 0.45, k = Math.round((rnd() - 0.5) * 22);
      const a = Math.PI + k * 0.085 + (rnd() - 0.5) * 0.012;
      P.push(skin(t, a, 1.0));
    }
    BODY_N = P.length;
    // Pectoral fins: long (a third of the body), swept back and down, knobbly leading edge
    for (let i = 0, N = n(0.12); i < N; i++) {
      const side = rnd() < 0.5 ? -1 : 1, u = rnd(), v = rnd() * 2 - 1;
      const t0 = 0.3, r0 = radius(t0), base = new THREE.Vector3(X0 + t0 * (X1 - X0), spineY(t0) - r0 * 0.55, side * r0 * 0.78);
      const dir = new THREE.Vector3(0.62, -0.5, side * 0.6).normalize();
      const width = (0.17 * Math.pow(1 - u, 0.55) + 0.015) * (1 + (v < 0 ? 0.08 * Math.sin(u * 34) : 0));
      const p = base.addScaledVector(dir, u * 1.15);
      p.x += v * width; p.y += v * width * 0.25 + (rnd() - 0.5) * 0.012;
      P.push(p);
    }
    // Dorsal fin: small hump two thirds along the back
    for (let i = 0, N = n(0.025); i < N; i++) {
      const s = rnd(), t = 0.64 + 0.08 * s, top = spineY(t) + radius(t) * 0.74;
      const h = 0.11 * Math.min(1, s / 0.35) * Math.pow(1 - s, 0.7);
      P.push(new THREE.Vector3(X0 + t * (X1 - X0), top + rnd() * h, (rnd() - 0.5) * 0.025));
    }
    // Flukes: wide, horizontal, swept back, notch in the middle of the trailing edge
    while (P.length < N_CLOUD) {
      const s = rnd() * 2 - 1, as = Math.abs(s);
      const le = X1 - 0.04 + 0.36 * Math.pow(as, 1.3);
      let te = le + 0.34 * (1 - Math.pow(as, 1.8)) + 0.035;
      if (as < 0.09) te -= 0.13 * (1 - as / 0.09);
      const x = le + (te - le) * rnd();
      P.push(new THREE.Vector3(x, spineY(1) + 0.05 * as + (rnd() - 0.5) * 0.02 * (1 - as), s * 0.78));
    }
    return { P, rnd };
  }

  // (Re)creates the cloud and its attributes for N_CLOUD points
  function makeGeometry() {
    cloud = whaleCloud().P;
    const geo = new THREE.BufferGeometry().setFromPoints(cloud);
    geo.setAttribute('acolor', new THREE.BufferAttribute(new Float32Array(N_CLOUD * 3), 3));
    geo.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(N_CLOUD), 1));
    geo.setAttribute('aalpha', new THREE.BufferAttribute(new Float32Array(N_CLOUD), 1));
    return geo;
  }

  /* ---------- Water around the whale ----------
     Faint particles streaming past the body from head to tail, as if the whale swims forward,
     in random clusters like plankton. Purely decorative: no notes, not clickable. */
  function makeDust(count) {
    let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    // The water streams along x (see the shader), so particles are spread over the whole stream length,
    // in a tube around the whale's axis; the shader pushes them around the body as they pass.
    const XMIN = -4.3, SPAN = 9.0;
    const around = (rho, a) => [rho * Math.cos(a) * 0.85, rho * Math.sin(a)];
    // Random clusters (a few dense ones, many light ones) that drift past like clouds of plankton
    const clusters = Array.from({ length: 120 }, () => {
      const [y, z] = around(0.25 + rnd() * 0.85, rnd() * Math.PI * 2);
      return { c: [XMIN + rnd() * SPAN, y, z], spread: 0.05 + rnd() * 0.22, weight: Math.pow(rnd(), 3) };
    });
    const totalW = clusters.reduce((s, k) => s + k.weight, 0);
    const pickCluster = () => { let r = rnd() * totalW; for (const k of clusters) { r -= k.weight; if (r <= 0) return k; } return clusters[0]; };
    const pos = new Float32Array(count * 3), size = new Float32Array(count), alpha = new Float32Array(count), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let x, y, z;
      const roll = rnd();
      if (roll < 0.66) { const k = pickCluster(); x = k.c[0] + gauss() * k.spread * 1.6; y = k.c[1] + gauss() * k.spread; z = k.c[2] + gauss() * k.spread; }
      else if (roll < 0.95) { x = XMIN + rnd() * SPAN; [y, z] = around(0.15 - Math.log(1 - rnd() * 0.999) * 0.32, rnd() * Math.PI * 2); } // close halo
      else { x = XMIN + rnd() * SPAN; [y, z] = around(0.8 + rnd() * 1.6, rnd() * Math.PI * 2); } // a few further away
      pos[i * 3] = XMIN + (((x - XMIN) % SPAN) + SPAN) % SPAN; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      size[i] = 0.8 + rnd() * 1.0;
      alpha[i] = 0.11 + Math.pow(rnd(), 2) * 0.27; // still dimmer than the whale's own points
      phase[i] = rnd() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('asize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aalpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aphase', new THREE.BufferAttribute(phase, 1));
    const u = pts.material.uniforms; // share time, pixel ratio and camera distance with the whale
    return new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uPR: u.uPR, uDist: u.uDist },
      vertexShader: `attribute float asize; attribute float aalpha; attribute float aphase;
        uniform float uTime; uniform float uPR; uniform float uDist; varying float vA;
        // Same body shape as the whale (radius / spine along x), to make the water flow around it
        float rad(float t){ return 0.035 + (t < 0.32 ? 0.5 * pow(sin(t / 0.32 * 1.5708), 0.8) : 0.5 * pow(max(0.0, 1.0 - pow((t - 0.32) / 0.68, 1.7)), 1.2)); }
        float spY(float t){ return 0.07 * sin(3.14159 * t) - 0.06 * t - 0.03 * max(0.0, 0.12 - t) / 0.12; }
        void main(){
          // The whale swims forward: the water streams past it from the head (-x) to the tail (+x), then loops
          const float XMIN = -4.3, XMAX = 4.7, SPAN = 9.0;
          vec3 p = position;
          p.x = XMIN + mod(p.x - XMIN + uTime * 0.16, SPAN);
          // gentle currents: each particle sways and rises / sinks a little
          p.y += 0.05 * sin(uTime * 0.7 + p.x * 1.9 + aphase) + 0.03 * sin(uTime * 0.23 + aphase * 2.3);
          p.z += 0.05 * cos(uTime * 0.6 + p.x * 1.6 + aphase * 1.3);
          // flow around the body instead of through it
          if (p.x > -1.75 && p.x < 1.55) {
            float t = (p.x + 1.75) / 3.3, r = rad(t) * 1.12;
            vec2 q = vec2((p.y - spY(t)) / (r * 0.95), p.z / r);
            float d = length(q);
            if (d < 1.06) { q *= (1.06 + 0.04 * fract(aphase)) / max(d, 0.001); p.y = spY(t) + q.x * r * 0.95; p.z = q.y * r; }
          }
          // fade in at the front and out at the back so the loop is invisible
          float edge = smoothstep(XMIN, XMIN + 0.9, p.x) * (1.0 - smoothstep(XMAX - 0.9, XMAX, p.x));
          vA = aalpha * edge * (0.7 + 0.3 * sin(uTime * 0.5 + aphase * 3.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = asize * uPR * (uDist / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(0.72, 0.78, 0.92, vA * smoothstep(0.5, 0.2, d)); }`,
      transparent: true, depthWrite: false,
    }));
  }

  /* ---------- WebGL setup ---------- */
  function init() {
    R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    R.setClearColor(0x000000, 1); R.setPixelRatio(Math.min(devicePixelRatio, 2));
    S = new THREE.Scene(); C = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    ray = new THREE.Raycaster();
    G = new THREE.Group(); S.add(G);
    // Gentle swimming: the rear of the body and the flukes undulate (same motion for points and threads)
    // + a band of light that travels from the tail to the head every 9 s (6 s of travel, then a short pause)
    const SWIM = `uniform float uTime;
      vec3 swim(vec3 p){ float k = clamp((p.x - 0.1) / 2.2, 0.0, 1.0); p.y += 0.09 * k * k * sin(uTime * 1.2 - p.x * 1.8); return p; }
      float sweep(vec3 p){ float c = mod(uTime, 9.0) / 6.0; if (c > 1.0) return 0.0;
        float x = mix(2.7, -2.2, c); float d = (p.x - x) / 0.22; return exp(-d * d); }`;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: R.getPixelRatio() }, uDist: { value: 5 }, uTime: { value: 0 } },
      vertexShader: `attribute vec3 acolor; attribute float asize; attribute float aalpha;
        uniform float uPR; uniform float uDist; varying vec3 vC; varying float vA; ${SWIM}
        void main(){ float g = sweep(position);
          vC = mix(acolor, vec3(1.0), g * 0.3); vA = min(1.0, aalpha + g * 0.22);
          vec4 mv=modelViewMatrix*vec4(swim(position),1.0);
          gl_PointSize=asize*(1.0 + g * 0.4)*uPR*(uDist/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
          gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.3,d)); }`,
      transparent: true, depthWrite: false,
    });
    pts = new THREE.Points(makeGeometry(), mat); G.add(pts);
    G.add(makeDust(40000));
    const lineMat = (opacity, color) => new THREE.ShaderMaterial({
      uniforms: { uTime: mat.uniforms.uTime, uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color || '#ffffff') }, uUseColor: { value: color ? 1 : 0 } },
      vertexShader: `attribute vec3 color; varying vec3 vC; varying float vG; ${SWIM}
        void main(){ vC=color; vG=sweep(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(swim(position),1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; uniform float uUseColor; varying vec3 vC; varying float vG;
        void main(){ vec3 c = uUseColor > 0.5 ? uColor : vC; gl_FragColor=vec4(mix(c, vec3(1.0), vG * 0.3), min(1.0, uOpacity + vG * 0.2)); }`,
      transparent: true, depthWrite: false,
    });
    // Every link between notes, always visible as thin threads (colored by the notes' folders)
    webLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0.3));
    G.add(webLines);
    // Links of the hovered note, brighter
    linkLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0.85, '#c4b5ff'));
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

  /* ---------- Data: folders, notes, regions ---------- */
  const folderName = (path) => (path.includes('/') ? path.split('/')[0] : 'Notes');
  function build() {
    const names = Object.keys(notes);
    const needed = Math.max(22000, Math.ceil((names.length * 1.6) / 0.7));
    if (needed !== N_CLOUD) { N_CLOUD = needed; pts.geometry.dispose(); pts.geometry = makeGeometry(); }
    const counts = {};
    names.forEach((n) => { const f = folderName(notes[n].path); counts[f] = (counts[f] || 0) + 1; });
    folders = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, LOCALE))
      .map((name, i) => ({ name, count: counts[name], color: new THREE.Color(PALETTE[i % PALETTE.length]), hex: PALETTE[i % PALETTE.length] }));
    if (selFolder != null && !counts[selFolder]) selFolder = null;

    noteAt = {}; nameOfPt = {}; dateOfPt = {};
    folderOfPt = new Array(N_CLOUD).fill(-1);
    if (names.length && names.length <= MEANING_MAX) placeByMeaning(names); else placeBySlices(names);
    names.forEach((n) => { const i = noteAt[n]; if (i != null) dateOfPt[i] = noteDate(n); });
    buildWeb(); buildBins(); renderLegend(); style(); drawHist();
  }

  /* ---------- Placing notes ----------
     Up to MEANING_MAX notes: by meaning. Notes about the same things (shared key words, TF-IDF)
     or linked with [[ ]] end up close together, computed locally (core.js: similarityEdges, layout3d).
     Bigger vaults fall back to one slice of the body per folder. */
  const MEANING_MAX = 3000;
  let layoutCache = { key: '', pos: {} };
  const folderIndex = (n) => folders.findIndex((f) => f.name === folderName(notes[n].path));

  // Spatial grid over the cloud, to find the nearest free point quickly
  function makeGrid(indices, cell) {
    const g = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    indices.forEach((i) => { const p = cloud[i], k = key(p.x, p.y, p.z); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
    return {
      nearest(target, taken) {
        const cx = Math.floor(target.x / cell), cy = Math.floor(target.y / cell), cz = Math.floor(target.z / cell);
        for (let r = 0; r < 40; r++) {
          let best = -1, bd = Infinity;
          for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const list = g.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!list) continue;
            for (const i of list) { if (taken && taken.has(i)) continue; const d = cloud[i].distanceToSquared(target); if (d < bd) { bd = d; best = i; } }
          }
          if (best >= 0) return best;
        }
        return -1;
      },
    };
  }

  function placeByMeaning(names) {
    const key = names.length + ':' + namesVersion + ':' + names.reduce((s, n) => s + notes[n].content.length, 0);
    if (layoutCache.key !== key) {
      const index = new Map(names.map((n, i) => [n, i]));
      const docs = names.map((n) => { const p = parse(n); return { text: `${n} ${n} ${p.props.asset || ''} ${p.props.setup || ''} ${p.props.tags || ''} ${p.body}` }; });
      const edges = Core.similarityEdges(docs, 5);
      names.forEach((n, i) => parse(n).links.forEach((m) => { const j = index.get(m); if (j != null && j !== i) edges.push({ a: Math.min(i, j), b: Math.max(i, j), w: 1.2 }); }));
      const L = Core.layout3d(names.length, edges, { seed: 11 });
      layoutCache = { key, pos: Object.fromEntries(names.map((n, i) => [n, L[i]])) };
    }
    // Layout coordinates -> a spot on the whale's skin (x along the body, y/z around it)
    const grid = makeGrid([...Array(BODY_N).keys()], 0.06), taken = new Set();
    names.forEach((n) => {
      const [u, v, w] = layoutCache.pos[n] || [0, 0, 0];
      const t = 0.05 + 0.85 * (u + 1) / 2, a = Math.atan2(w, v || 1e-6);
      const r = radius(t), c = Math.cos(a);
      const target = new THREE.Vector3(X0 + t * (X1 - X0), spineY(t) + r * c * (c > 0 ? 0.74 : 0.95), r * Math.sin(a));
      const idx = grid.nearest(target, taken);
      if (idx < 0) return;
      taken.add(idx); noteAt[n] = idx; nameOfPt[idx] = n; folderOfPt[idx] = folderIndex(n);
    });
    // The dust takes the color of the nearest note, so folders show as soft colored areas
    const placed = Object.values(noteAt), noteGrid = makeGrid(placed, 0.25);
    for (let i = 0; i < N_CLOUD; i++) {
      if (nameOfPt[i] !== undefined) continue;
      const j = noteGrid.nearest(cloud[i], null);
      folderOfPt[i] = j >= 0 ? folderOfPt[j] : -1;
    }
  }

  function placeBySlices(names) {
    // Each folder takes a slice of the body (from head to tail); fins and flukes take the color of the nearest slice
    const order = cloud.slice(0, BODY_N).map((p, i) => [p.x, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const total = names.length || 1;
    const shares = folders.map((f) => Math.max(f.count / total, 0.06));
    const sum = shares.reduce((a, b) => a + b, 0) || 1;
    const slices = [], maxX = []; let start = 0;
    folders.forEach((f, fi) => {
      const len = fi === folders.length - 1 ? BODY_N - start : Math.round((shares[fi] / sum) * BODY_N);
      const sl = order.slice(start, start + len); sl.forEach((i) => (folderOfPt[i] = fi)); slices.push(sl); start += len;
      maxX.push(sl.length ? cloud[sl[sl.length - 1]].x : -Infinity);
    });
    for (let i = BODY_N; i < N_CLOUD && folders.length; i++) {
      const fi = maxX.findIndex((x) => cloud[i].x <= x);
      folderOfPt[i] = fi < 0 ? folders.length - 1 : fi;
    }
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const byFolder = {}; names.slice().sort().forEach((n) => { const f = folderName(notes[n].path); (byFolder[f] = byFolder[f] || []).push(n); });
    folders.forEach((f, fi) => {
      const sl = slices[fi].slice();
      (byFolder[f.name] || []).forEach((n) => {
        if (!sl.length) return;
        const idx = sl.splice(Math.floor(rnd() * sl.length), 1)[0];
        noteAt[n] = idx; nameOfPt[idx] = n;
      });
    });
  }

  // Thin threads for every [[link]] between two notes (each pair drawn once)
  function buildWeb() {
    const pos = [], col = [], seen = new Set();
    Object.keys(noteAt).forEach((n) => {
      const i = noteAt[n], a = cloud[i];
      const c = folders[folderOfPt[i]] ? folders[folderOfPt[i]].color : new THREE.Color('#888888');
      parse(n).links.forEach((m) => {
        const j = noteAt[m];
        if (j == null || j === i) return;
        const key = i < j ? i + '-' + j : j + '-' + i;
        if (seen.has(key)) return;
        seen.add(key);
        const b = cloud[j];
        const c2 = folders[folderOfPt[j]] ? folders[folderOfPt[j]].color : c;
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        col.push(c.r, c.g, c.b, c2.r, c2.g, c2.b);
      });
    });
    webLines.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    webLines.geometry = g;
  }

  /* ---------- Point appearance ---------- */
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
      if (!isNote) { s = 1.3; a = active < 0 ? 0.55 : fi === active ? 0.7 : 0.2; }
      else if (active < 0) { s = 2.4; a = 0.9; }
      else if (fi === active) { s = 3.4; a = 1; }
      else { s = 1.3; a = 0.22; }
      if (isNote && lit) { if (lit.has(nameOfPt[i])) { s = 4.2; a = 1; } else { s = Math.min(s, 1.4); a = Math.min(a, 0.22); } }
      if (isNote && !inRange(i)) { a *= 0.12; s = Math.min(s, 1.4); }
      if (i === hoverPt) { s = 6; a = 1; }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; size[i] = s; al[i] = a;
    }
    pts.geometry.attributes.acolor.needsUpdate = pts.geometry.attributes.asize.needsUpdate = pts.geometry.attributes.aalpha.needsUpdate = true;
    // Threads fade when something is highlighted, so the highlight stands out
    if (webLines) webLines.material.uniforms.uOpacity.value = active >= 0 || lit || range || hoverPt != null ? 0.1 : 0.3;
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
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(arr.length).fill(1), 3)); linkLines.geometry = g;
  }

  /* ---------- Folder legend ---------- */
  function renderLegend() {
    const el = $('glegend');
    el.classList.toggle('sel', selFolder != null);
    el.innerHTML = `<div class="lh"><span>FOLDERS</span><span>${folders.length}</span></div>` +
      folders.map((f, i) => `<div class="lr ${selFolder === f.name ? 'on' : ''}" data-i="${i}"><i style="background:${f.hex}"></i><span>${esc(f.name)}</span><span class="c">${f.count}</span></div>`).join('');
    el.querySelectorAll('.lr').forEach((r) => {
      const i = +r.dataset.i;
      r.onmouseenter = () => { hoverFolder = i; style(); };
      r.onmouseleave = () => { hoverFolder = null; style(); };
      r.onclick = () => { selFolder = selFolder === folders[i].name ? null : folders[i].name; lit = null; renderLegend(); style(); };
    });
  }

  /* ---------- Time histogram ---------- */
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
    const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const nIn = range ? Object.keys(dateOfPt).filter((k) => inRange(+k)).length : Object.keys(nameOfPt).length;
    $('ghistlabel').textContent = range ? `${fmt(range[0])} → ${fmt(range[1])} · ${nIn} notes` : `${fmt(bins[0].from)} → ${fmt(bins[bins.length - 1].to)} · double-click: all`;
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
    hc.addEventListener('dblclick', () => { range = null; lit = null; drawHist(); style(); });
  }

  /* ---------- Animation loop ---------- */
  function frame() {
    if (!running) return;
    tt += 0.016; if (auto && !drag) ry += 0.0012;
    const d = zoom * Math.max(7.2 / (C.aspect || 1), 4.2);
    C.position.set(0, d * 0.08, d); C.lookAt(0, 0.05, 0);
    pts.material.uniforms.uDist.value = d;
    pts.material.uniforms.uTime.value = performance.now() / 1000; // real time: same speed whatever the frame rate
    G.rotation.set(rx, ry, 0.03 * Math.sin(tt * 0.6)); G.position.set(-0.2, 0.3 + 0.03 * Math.sin(tt * 0.8), 0); G.updateMatrixWorld();

    // Hover: the note closest to the cursor
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

  // Called by the AI: highlights a folder, a period and/or notes. Returns the number of notes lit.
  function focus({ folder, from, to, names } = {}) {
    selFolder = folder && folders.some((f) => f.name === folder) ? folder : null;
    range = from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? [from <= to ? from : to, from <= to ? to : from] : null;
    lit = names && names.length ? new Set(names.filter((n) => noteAt[n] != null)) : null;
    if (lit && !lit.size) lit = null;
    renderLegend(); style(); drawHist();
    return Object.keys(nameOfPt).filter((k) => {
      const i = +k, n = nameOfPt[i];
      if (lit && !lit.has(n)) return false;
      if (selFolder && folders[folderOfPt[i]].name !== selFolder) return false;
      return inRange(i);
    }).length;
  }
  function clearFocus() { selFolder = null; range = null; lit = null; renderLegend(); style(); drawHist(); }

  return {
    focus, clearFocus,
    folders: () => folders.map((f) => f.name),
    show() { if (!inited) init(); resize(); build(); if (!running) { running = true; frame(); } },
    hide() { running = false; tip.style.display = 'none'; },
  };
})();
