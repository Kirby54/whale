/* Whale — interface principale */

/* ---------- État ---------- */
// notes : nom de la note -> { path: "Trades/x.md", content: "..." }
let notes = {};
let cur = null, editing = false, view = 'note', vault = null;
const closed = new Set();
const pending = {}; // écritures en attente (anti-rebond)

const TYPE_DIR = { trade: 'Trades', setup: 'Setups', actif: 'Actifs', emotion: 'Émotions' };
const TYPE_LABEL = { trade: 'Trade', setup: 'Setup', actif: 'Actif', emotion: 'Émotion / erreur', conversation: 'Conversation IA', note: 'Note' };
const LABELS = { type: 'Type', actif: 'Actif', setup: 'Setup', sens: 'Sens', entree: 'Entrée', stop: 'Stop loss', sortie: 'Sortie', resultat: 'Résultat', marche: 'Marché', tags: 'Tags', date: 'Date', source: 'Source', pnl: 'P&L', quantite: 'Quantité', resume: 'Résumé' };
const TYPE_COLOR = { setup: '#58a6ff', actif: '#bc8cff', emotion: '#d29922', conversation: '#39c5cf' };
const IMG_EXT = Core.IMG_EXT;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { stem, dirOf, safeName, reEsc } = Core;
function status(msg) { $('status').textContent = msg; }

/* ---------- Collection de notes avec cache ----------
   « notes » est enveloppé dans un Proxy : ajouter, remplacer ou supprimer une note
   incrémente namesVersion, ce qui invalide le résolveur de liens et le cache d'analyse. */
let namesVersion = 0;
function makeNotes(obj) {
  namesVersion++;
  return new Proxy(obj, {
    set(t, k, v) { if (!(k in t)) namesVersion++; t[k] = v; return true; },
    deleteProperty(t, k) { delete t[k]; namesVersion++; return true; },
  });
}
notes = makeNotes({});

/* ---------- Chargement / sauvegarde ---------- */
async function loadAll() {
  const files = await Store.list();
  const next = {};
  files.sort((a, b) => a.path.localeCompare(b.path, 'fr')).forEach((f) => { next[stem(f.path)] = { path: f.path, content: f.content, mtime: f.mtime || 0 }; });
  // garder le texte en cours de frappe s'il n'est pas encore écrit
  Object.keys(pending).forEach((n) => { if (notes[n]) next[n] = notes[n]; });
  notes = makeNotes(next);
}
function queueWrite(name) {
  clearTimeout(pending[name]);
  pending[name] = setTimeout(() => flushOne(name), 400);
  status('Modification…');
}
async function flushOne(name) {
  clearTimeout(pending[name]); delete pending[name];
  const n = notes[name]; if (!n) return;
  try { await Store.write(n.path, n.content); status('Enregistré · ' + n.path); }
  catch (e) { status('Erreur : ' + e); }
}
function flushAll() { return Promise.all(Object.keys(pending).map(flushOne)); }

/* ---------- Analyse des notes (avec cache) ---------- */
let resolverVersion = -1, resolver = null;
function resolve(t) {
  if (resolverVersion !== namesVersion) { resolver = Core.makeResolver(Object.keys(notes)); resolverVersion = namesVersion; }
  return resolver(t);
}
const parseCache = new Map(); // nom -> { content, version, parsed }
function parse(name) {
  const raw = notes[name] ? notes[name].content : '';
  const c = parseCache.get(name);
  if (c && c.content === raw && c.version === namesVersion) return c.parsed;
  const base = c && c.content === raw ? c.base : Core.parseRaw(raw);
  const links = new Set(base.targets.map((t) => resolve(t) || t));
  ['actif', 'setup'].forEach((k) => { const r = base.props[k] && resolve(base.props[k]); if (r) links.add(r); });
  links.delete(name);
  const parsed = { props: base.props, body: base.body, links: [...links], type: base.type };
  parseCache.set(name, { content: raw, version: namesVersion, base, parsed });
  return parsed;
}
function allParsed() { const o = {}; for (const n of Object.keys(notes)) o[n] = parse(n); return o; }
function rOf(p) { return Core.rOf(p.props); }
function colorOf(p) {
  if (p.type === 'trade') { const r = rOf(p); return r == null ? '#888888' : r >= 0 ? '#3fb950' : '#f85149'; }
  return TYPE_COLOR[p.type] || '#9a9a9a';
}
// Date d'une note : propriété "date", sinon AAAA-MM-JJ au début du nom, sinon date du fichier
function noteDate(name, p) {
  p = p || parse(name);
  const d = (p.props.date || '').match(/\d{4}-\d{2}-\d{2}/) || name.match(/^\d{4}-\d{2}-\d{2}/);
  if (d) return d[0];
  const t = notes[name] && notes[name].mtime;
  return t ? new Date(t * 1000).toISOString().slice(0, 10) : '';
}
// Modifie des propriétés du frontmatter (null = supprimer) en gardant l'ordre existant
function setProps(name, updates) { notes[name].content = Core.setPropsText(notes[name].content, updates); }
// Statistiques des trades qui ont un résultat en R
function tradeStats(P) {
  P = P || allParsed();
  const tr = Object.keys(P).filter((n) => P[n].type === 'trade' && rOf(P[n]) != null).sort();
  return { names: tr, ...Core.computeStats(tr.map((n) => ({ r: rOf(P[n]), setup: P[n].props.setup, actif: P[n].props.actif }))) };
}

/* ---------- Markdown ---------- */
function imgTag(src, alt) {
  if (/^(https?:|data:image)/.test(src)) return `<img alt="${esc(alt)}" src="${esc(src)}">`;
  return `<img alt="${esc(alt)}" data-src="${esc(src)}">`;
}
function inline(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (all, t) => {
    if (!IMG_EXT.test(t)) return all;
    return imgTag(t.includes('/') ? t : 'attachments/' + t, t);
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => imgTag(decodeURI(u), a));
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, a) => {
    const r = resolve(t); return `<a class="il${r ? '' : ' un'}" data-n="${esc(r || t.trim())}">${a || t}</a>`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--acc2)">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
function md(body) {
  const out = []; let list = false;
  body.split(/\r?\n/).forEach((l) => {
    const li = l.match(/^\s*[-*] (.*)/);
    if (!li && list) { out.push('</ul>'); list = false; }
    if (li) {
      if (!list) { out.push('<ul>'); list = true; }
      const task = li[1].match(/^\[( |x)\] (.*)/i);
      out.push(task ? `<li class="task">${task[1] === ' ' ? '☐' : '☑'} ${inline(task[2])}</li>` : '<li>' + inline(li[1]) + '</li>');
      return;
    }
    const h = l.match(/^(#{1,3}) (.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); return; }
    if (/^> /.test(l)) { out.push('<blockquote>' + inline(l.slice(2)) + '</blockquote>'); return; }
    if (l.trim()) out.push('<p>' + inline(l) + '</p>');
  });
  if (list) out.push('</ul>');
  return out.join('');
}
const blobCache = {};
async function loadImages(root) {
  for (const img of root.querySelectorAll('img[data-src]')) {
    const src = img.dataset.src;
    try {
      if (!blobCache[src]) blobCache[src] = URL.createObjectURL(new Blob([await Store.readBytes(src)]));
      img.src = blobCache[src];
    } catch (e) { img.replaceWith(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Image introuvable : ' + src })); }
  }
}
function propsHtml(p) {
  const ks = Object.keys(p.props); if (!ks.length) return '';
  return '<div class="props">' + ks.map((k) => {
    let v = esc(p.props[k]);
    if (k === 'resultat') { const r = rOf(p); if (r != null) v = `<span class="tag" style="background:${r >= 0 ? '#12301b' : '#3a1414'};color:${r >= 0 ? '#56d364' : '#ff7b72'}">${r > 0 ? '+' : ''}${r} R</span>`; }
    else if (k === 'sens' && v) v = `<span class="tag" style="background:#1d1a2b;color:#a68bff">${v}</span>`;
    else if ((k === 'actif' || k === 'setup') && resolve(p.props[k] || '')) v = `<a class="il" data-n="${esc(resolve(p.props[k]))}">${v}</a>`;
    else if (k === 'type') v = TYPE_LABEL[p.props[k]] || v;
    else if (k === 'tags' && v) v = p.props[k].split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="tag" style="background:#161b22;color:#8b949e;margin-right:4px">#${esc(t)}</span>`).join('');
    return `<div class="prow"><div class="pk">${LABELS[k] || esc(k)}</div><div class="pv">${v}</div></div>`;
  }).join('') + '</div>';
}

/* ---------- Arborescence (vrais dossiers du coffre) ---------- */
function renderTree() {
  const q = $('search').value.trim().toLowerCase();
  const P = allParsed();
  const root = { dirs: {}, files: [] };
  Object.keys(notes).forEach((n) => {
    if (q && !n.toLowerCase().includes(q) && !notes[n].content.toLowerCase().includes(q)) return;
    let node = root;
    const parts = notes[n].path.split('/'); parts.pop();
    let acc = '';
    parts.forEach((d) => { acc = acc ? acc + '/' + d : d; node = node.dirs[d] = node.dirs[d] || { dirs: {}, files: [], key: acc }; });
    node.files.push(n);
  });
  const draw = (node, depth) => {
    const pad = 8 + depth * 14;
    let h = '';
    Object.keys(node.dirs).sort((a, b) => a.localeCompare(b, 'fr')).forEach((d) => {
      const sub = node.dirs[d], isClosed = closed.has(sub.key) && !q;
      h += `<div class="folder${isClosed ? ' closed' : ''}" data-f="${esc(sub.key)}" style="padding-left:${pad}px"><span class="chev">▾</span>${esc(d)}</div>`;
      if (!isClosed) h += draw(sub, depth + 1);
    });
    const files = node.files.sort((a, b) => (P[a].type === 'trade' && P[b].type === 'trade' ? b.localeCompare(a, 'fr') : a.localeCompare(b, 'fr')));
    files.forEach((n) => { h += `<div class="file${n === cur ? ' on' : ''}" data-n="${esc(n)}" style="padding-left:${pad + 16}px" title="${esc(notes[n].path)}"><i class="dot" style="background:${colorOf(P[n])}"></i>${esc(n)}</div>`; });
    return h;
  };
  $('tree').innerHTML = draw(root, 0) || '<div class="empty" style="padding:8px">Aucune note</div>';
}

/* ---------- Note ---------- */
function renderNote() {
  if (!cur || !notes[cur]) cur = notes['Bienvenue'] ? 'Bienvenue' : Object.keys(notes)[0] || null;
  if (!cur) {
    $('title').value = ''; $('crumb').innerHTML = '';
    $('reader').innerHTML = '<p class="empty">Aucune note. Crée un trade avec le bouton +.</p>';
    $('reader').style.display = 'block'; $('editor').style.display = 'none';
    renderLinks(null); return;
  }
  const p = parse(cur);
  if (document.activeElement !== $('title')) $('title').value = cur;
  const d = dirOf(notes[cur].path);
  $('crumb').innerHTML = (d ? esc(d.replace(/\//g, ' / ')) + ' / ' : '') + `<b>${esc(cur)}</b>`;
  $('editor').style.display = editing ? 'block' : 'none';
  $('reader').style.display = editing ? 'none' : 'block';
  $('btnMode').textContent = editing ? 'Lecture' : 'Édition';
  if (editing) { if ($('editor').value !== notes[cur].content) $('editor').value = notes[cur].content; autosize(); }
  else { $('reader').innerHTML = propsHtml(p) + md(p.body); loadImages($('reader')); }
  renderLinks(p);
}
function renderLinks(p) {
  if (!p) { $('backlinks').innerHTML = $('outlinks').innerHTML = ''; $('blc').textContent = $('olc').textContent = ''; return; }
  const P = allParsed();
  const back = Object.keys(P).filter((n) => n !== cur && P[n].links.includes(cur));
  $('blc').textContent = back.length; $('olc').textContent = p.links.length;
  const snip = (n) => { const b = P[n].body; const i = b.toLowerCase().indexOf('[[' + cur.toLowerCase()); const s = i < 0 ? b.slice(0, 80) : b.slice(Math.max(0, i - 30), i + 50); return esc(s.replace(/\n/g, ' ')); };
  const row = (n, extra) => `<div class="bl" data-n="${esc(n)}"><span style="display:flex;align-items:center;gap:8px"><i class="dot" style="background:${notes[n] ? colorOf(P[n]) : '#444'}"></i>${esc(n)}</span>${extra || ''}</div>`;
  $('backlinks').innerHTML = back.map((n) => row(n, `<small>${snip(n)}</small>`)).join('') || '<div class="empty">Aucun rétrolien</div>';
  $('outlinks').innerHTML = p.links.map((n) => row(n)).join('') || '<div class="empty">Aucun lien</div>';
}
function autosize() { const e = $('editor'); e.style.height = 'auto'; e.style.height = Math.max(e.scrollHeight, window.innerHeight * 0.6) + 'px'; }

async function open(n) {
  await flushAll();
  if (!notes[n]) {
    const path = safeName(n) + '.md';
    notes[n] = { path, content: `# ${n}\n\n` };
    await Store.write(path, notes[n].content);
    editing = true;
  }
  cur = n; setView('note'); renderTree();
}
const VIEWS = { note: 'btnNotes', graph: 'btnGraph', dash: 'btnDash', timeline: 'btnTimeline', table: 'btnTable', ask: 'btnAsk' };
function setView(v) {
  view = v;
  Object.keys(VIEWS).forEach((k) => { $(k + 'view').classList.toggle('on', k === v); $(VIEWS[k]).classList.toggle('on', k === v); });
  $('btnMode').style.display = $('btnDel').style.display = $('btnClassify').style.display = v === 'note' ? '' : 'none';
  $('right').classList.toggle('hide', v !== 'note');
  $('side').classList.toggle('hide', v !== 'note');
  $('tabbar').style.display = v === 'graph' ? 'none' : '';
  $('more').classList.add('hide');
  if (v === 'graph') Graph.show(); else Graph.hide();
  if (v === 'dash') { $('crumb').innerHTML = '<b>Tableau de bord</b>'; renderDash(); }
  if (v === 'timeline') { $('crumb').innerHTML = '<b>Timeline</b> · toutes tes notes dans le temps'; Views.timeline(); }
  if (v === 'table') { $('crumb').innerHTML = '<b>Tableau des trades</b>'; Views.table(); }
  if (v === 'ask') { $('crumb').innerHTML = '<b>Demander</b> · pose une question à ton journal'; AI.showAsk(); }
  if (v === 'note') renderNote();
}
function refreshAll() { renderTree(); if (view === 'note') renderNote(); else setView(view); }

/* ---------- Actions ---------- */
async function newTrade() {
  await flushAll();
  const d = new Date().toISOString().slice(0, 10);
  let n = `${d} Nouveau trade`, i = 2;
  while (notes[n]) n = `${d} Nouveau trade ${i++}`;
  const content = `---\ntype: trade\ndate: ${d}\nactif: \nsetup: \nsens: LONG\nentree: \nstop: \nsortie: \nresultat: \n---\n## Contexte\n\n\n## Erreurs / émotions\n\n`;
  notes[n] = { path: `${TYPE_DIR.trade}/${safeName(n)}.md`, content };
  await Store.write(notes[n].path, content);
  cur = n; editing = true; setView('note'); renderTree(); $('editor').focus();
}
async function deleteCur() {
  if (!cur || !confirm(`Mettre « ${cur} » à la corbeille ?\nLe fichier sera déplacé dans le dossier .trash du coffre.`)) return;
  clearTimeout(pending[cur]); delete pending[cur];
  try { await Store.trash(notes[cur].path); delete notes[cur]; cur = null; renderTree(); renderNote(); status('Note mise à la corbeille'); }
  catch (e) { alert('Impossible de supprimer : ' + e); }
}
async function renameCur(nn) {
  nn = nn.trim();
  if (!nn || nn === cur) { $('title').value = cur; return; }
  if (resolve(nn) && resolve(nn) !== cur) { alert('Une note porte déjà ce nom.'); $('title').value = cur; return; }
  await flushAll();
  const old = cur, from = notes[old].path, d = dirOf(from);
  const to = (d ? d + '/' : '') + safeName(nn) + '.md';
  try { await Store.rename(from, to); } catch (e) { alert('Impossible de renommer : ' + e); $('title').value = cur; return; }
  notes[nn] = { path: to, content: notes[old].content }; delete notes[old];
  // mettre à jour les liens [[ancien nom]] et les propriétés actif/setup
  for (const k of Object.keys(notes)) {
    const c = notes[k].content, nc = Core.renameInContent(c, old, nn);
    if (nc !== c) { notes[k].content = nc; await Store.write(notes[k].path, nc); }
  }
  cur = nn; renderTree(); renderNote(); status('Renommée en ' + to);
}
async function pasteImage(e) {
  const item = [...(e.clipboardData || {}).items || []].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  const file = item.getAsFile(); const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const name = `chart-${ts}.${ext}`;
  try {
    await Store.saveAttachment(name, new Uint8Array(await file.arrayBuffer()));
    const ed = $('editor'), s = ed.selectionStart, ins = `![[${name}]]\n`;
    ed.value = ed.value.slice(0, s) + ins + ed.value.slice(ed.selectionEnd);
    ed.selectionStart = ed.selectionEnd = s + ins.length;
    notes[cur].content = ed.value; queueWrite(cur); status('Image enregistrée · attachments/' + name);
  } catch (err) { alert("Impossible d'enregistrer l'image : " + err); }
}
async function changeVault() {
  const path = await Store.pickFolder();
  if (!path) return;
  await flushAll();
  try { vault = await Store.setVault(path); } catch (e) { alert(String(e)); return; }
  await afterVault();
}
async function afterVault() {
  $('vault').textContent = vault.name; $('vault').title = vault.path;
  await loadAll();
  if (vault.created && Object.keys(notes).length === 0) {
    for (const [p, c] of window.SEED) await Store.write(p, c);
    await loadAll();
  }
  cur = null; renderTree(); setView('graph');
  status(Object.keys(notes).length + ' notes · ' + vault.name);
}

/* ---------- Tableau de bord ---------- */
function renderDash() {
  const st = tradeStats();
  const fmt = (x) => (x > 0 ? '+' : '') + Math.round(x * 100) / 100 + ' R';
  const tbl = (g, label) => `<h3 style="margin:22px 0 8px">Par ${label}</h3><table><tr><th>${label}</th><th>Trades</th><th>Réussite</th><th>Total</th></tr>` +
    Object.keys(g).map((v) => {
      const s = g[v], r = resolve(v);
      return `<tr class="click" ${r ? `data-n="${esc(r)}"` : ''}><td>${esc(v)}</td><td>${s.count}</td><td>${s.winrate} %</td><td style="color:${s.total >= 0 ? 'var(--win)' : 'var(--loss)'}">${fmt(s.total)}</td></tr>`;
    }).join('') + '</table>';
  $('dash').innerHTML = `<h1 style="margin:0;font-size:26px">Tableau de bord</h1>
  <div style="color:var(--tx3)">Calculé à partir de la propriété <code style="font-family:var(--mono)">resultat</code> (en R) de tes notes de trade.</div>
  <div class="cards">
    <div class="card"><div class="l">Trades</div><div class="v">${st.count}</div></div>
    <div class="card"><div class="l">Taux de réussite</div><div class="v">${st.winrate} %</div></div>
    <div class="card"><div class="l">Total</div><div class="v" style="color:${st.total >= 0 ? 'var(--win)' : 'var(--loss)'}">${fmt(st.total)}</div></div>
    <div class="card"><div class="l">R moyen</div><div class="v">${st.avg != null ? fmt(st.avg) : '—'}</div></div>
    <div class="card"><div class="l">Profit factor</div><div class="v">${st.profitFactor != null ? st.profitFactor : '—'}</div></div>
  </div>
  <h3 style="margin:0 0 8px">Courbe des gains (en R)</h3><canvas id="eq"></canvas>
  ${st.count ? tbl(st.bySetup, 'setup') + tbl(st.byActif, 'actif') : '<p class="empty">Ajoute une valeur à « resultat » dans tes trades pour voir les stats.</p>'}`;
  const pts = st.equity, rs = pts.slice(1).map((v, i) => v - pts[i]);
  const c = $('eq'), dpr = devicePixelRatio || 1, W = c.clientWidth, Hh = c.clientHeight;
  c.width = W * dpr; c.height = Hh * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const mn = pts.reduce((a, b) => Math.min(a, b), 0), mx = pts.reduce((a, b) => Math.max(a, b), 0), pad = 20;
  const sx = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, pts.length - 1);
  const sy = (v) => Hh - pad - ((v - mn) * (Hh - 2 * pad)) / Math.max(1e-9, mx - mn);
  x.strokeStyle = '#222'; x.setLineDash([3, 4]); x.beginPath(); x.moveTo(pad, sy(0)); x.lineTo(W - pad, sy(0)); x.stroke(); x.setLineDash([]);
  x.strokeStyle = '#8b6cef'; x.lineWidth = 2; x.beginPath();
  pts.forEach((v, i) => (i ? x.lineTo(sx(i), sy(v)) : x.moveTo(sx(i), sy(v)))); x.stroke();
  pts.forEach((v, i) => { if (!i) return; x.fillStyle = rs[i - 1] >= 0 ? '#3fb950' : '#f85149'; x.beginPath(); x.arc(sx(i), sy(v), 3.5, 0, 7); x.fill(); });
}

/* ---------- Événements ---------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-n]'); if (a) { open(a.dataset.n); return; }
  const f = e.target.closest('.folder');
  if (f) { const k = f.dataset.f; closed.has(k) ? closed.delete(k) : closed.add(k); renderTree(); }
});
$('search').addEventListener('input', renderTree);
$('btnNotes').onclick = () => setView('note');
$('btnGraph').onclick = () => setView('graph');
$('btnDash').onclick = () => setView('dash');
$('btnTimeline').onclick = () => setView('timeline');
$('btnTable').onclick = () => setView('table');
$('btnAsk').onclick = () => setView('ask');
$('btnImport').onclick = () => Importer.open();
$('btnSettings').onclick = () => AI.openSettings();
$('btnClassify').onclick = () => AI.classifyCurrent();
$('btnNew').onclick = newTrade;
$('btnVault').onclick = changeVault;
$('btnDel').onclick = deleteCur;
$('btnMode').onclick = () => { editing = !editing; renderNote(); if (editing) $('editor').focus(); };
$('editor').addEventListener('input', () => {
  if (!cur) return;
  notes[cur].content = $('editor').value; queueWrite(cur); autosize();
  clearTimeout(window._rt); window._rt = setTimeout(() => { renderTree(); renderLinks(parse(cur)); }, 300);
});
$('editor').addEventListener('paste', pasteImage);
$('title').addEventListener('change', () => renameCur($('title').value));
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('title').blur(); } });
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'e') { e.preventDefault(); if (view !== 'note') setView('note'); editing = !editing; renderNote(); if (editing) $('editor').focus(); }
  if (k === 'g') { e.preventDefault(); setView(view === 'graph' ? 'note' : 'graph'); }
  if (k === 'n') { e.preventDefault(); newTrade(); }
  if (k === 's') { e.preventDefault(); flushAll(); }
});
// Relire le disque quand on revient sur la fenêtre (fichiers modifiés ailleurs)
window.addEventListener('focus', async () => {
  if (!vault || Object.keys(pending).length) return;
  const before = JSON.stringify(notes);
  await loadAll();
  if (JSON.stringify(notes) !== before) { renderTree(); if (view === 'note' && !editing) renderNote(); if (view === 'dash') renderDash(); }
});
window.addEventListener('beforeunload', flushAll);

/* ---------- Démarrage ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  try { vault = await Store.getVault(); await afterVault(); }
  catch (e) { status('Erreur : ' + e); console.error(e); }
});
