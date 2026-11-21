/* Whale — main interface */

/* ---------- State ---------- */
// notes: note name -> { path: "Trades/x.md", content: "...", mtime (ms, as last seen on disk) }
let notes = {};
let cur = null, editing = true, view = 'note', vault = null; // editing = live-preview editor, otherwise reading view
const closed = new Set();
const pending = {}; // pending writes (debounced)
const dirty = new Set(); // notes with changes not yet saved to disk (pending, retrying or in conflict)

const TYPE_DIR = { trade: 'Trades', setup: 'Setups', asset: 'Assets', emotion: 'Emotions' };
const TYPE_LABEL = { trade: 'Trade', setup: 'Setup', asset: 'Asset', emotion: 'Emotion / mistake', conversation: 'AI conversation', note: 'Note' };
const LABELS = { type: 'Type', asset: 'Asset', setup: 'Setup', side: 'Side', entry: 'Entry', stop: 'Stop loss', exit: 'Exit', result: 'Result', market: 'Market', tags: 'Tags', date: 'Date', source: 'Source', pnl: 'P&L', quantity: 'Quantity', summary: 'Summary' };
const TYPE_COLOR = { setup: '#58a6ff', asset: '#bc8cff', emotion: '#d29922', conversation: '#39c5cf' };
const IMG_EXT = Core.IMG_EXT;
const LOCALE = 'en-US';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { stem, dirOf, safeName, reEsc } = Core;
const byName = (a, b) => a.localeCompare(b, LOCALE);
function status(msg) { $('status').textContent = msg; }

/* ---------- Note collection with cache ----------
   "notes" is wrapped in a Proxy: adding, replacing or deleting a note bumps
   namesVersion, which invalidates the link resolver and the parse cache. */
let namesVersion = 0;
function makeNotes(obj) {
  namesVersion++;
  return new Proxy(obj, {
    set(t, k, v) { if (!(k in t)) namesVersion++; t[k] = v; return true; },
    deleteProperty(t, k) { delete t[k]; namesVersion++; return true; },
  });
}
notes = makeNotes({});

/* ---------- Loading / saving ---------- */
async function loadAll() {
  const files = await Store.list();
  const next = {};
  files.sort((a, b) => byName(a.path, b.path)).forEach((f) => { next[stem(f.path)] = { path: f.path, content: f.content, mtime: f.mtime || 0 }; });
  // keep text that is being typed and not saved yet
  dirty.forEach((n) => { if (notes[n]) next[n] = notes[n]; });
  notes = makeNotes(next);
}
function queueWrite(name) {
  dirty.add(name);
  clearTimeout(pending[name]);
  pending[name] = setTimeout(() => flushOne(name), 400);
  status('Editing…');
}
async function flushOne(name) {
  clearTimeout(pending[name]); delete pending[name];
  await saveNote(name);
}
/* Saves a note safely. The write is refused if the file was changed in another app since we last
   read it (conflict dialog). If the disk write fails, the change is kept and retried. */
const retryTimers = {};
async function saveNote(name, { force = false } = {}) {
  const n = notes[name]; if (!n) return true;
  clearTimeout(retryTimers[name]);
  try {
    const m = await Store.write(n.path, n.content, force ? null : n.mtime);
    if (m) n.mtime = m;
    if (!pending[name]) dirty.delete(name);
    status('Saved · ' + n.path);
    return true;
  } catch (e) {
    const msg = String((e && e.message) || e);
    dirty.add(name);
    if (msg.includes('CONFLICT')) { await resolveConflict(name); return false; }
    status(`Could not save ${n.path}, retrying… (${msg})`);
    retryTimers[name] = setTimeout(() => saveNote(name), 3000);
    return false;
  }
}
let conflictOpen = false;
async function resolveConflict(name) {
  if (conflictOpen) return;
  conflictOpen = true;
  const mine = notes[name];
  let theirs = null;
  try { theirs = await Store.readNote(mine.path); } catch (e) {}
  const useTheirs = () => { if (theirs) { mine.content = theirs.content; mine.mtime = theirs.mtime; } edNote = null; };
  const finish = () => { conflictOpen = false; Modal.close(); refreshAll(); };
  Modal.show(`<h2>This note was changed in another app</h2>
    <div class="sub">"${esc(name)}" was modified on disk while you were editing it in Whale. Which version do you want to keep?</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="tbtn ai" id="cfMine">Keep my version</button>
      <button class="tbtn" id="cfTheirs">Use the other version</button>
      <button class="tbtn" id="cfBoth">Keep both</button>
    </div>
    <div class="note">"Keep both" saves your version as a separate note next to the original.</div>`);
  $('cfMine').onclick = async () => { conflictOpen = false; Modal.close(); await saveNote(name, { force: true }); refreshAll(); };
  $('cfTheirs').onclick = () => { dirty.delete(name); useTheirs(); finish(); };
  $('cfBoth').onclick = async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
    const copy = `${name} (conflict ${stamp})`;
    const path = (dirOf(mine.path) ? dirOf(mine.path) + '/' : '') + safeName(copy) + '.md';
    try {
      const m = await Store.write(path, mine.content);
      notes[copy] = { path, content: mine.content, mtime: m || 0 };
      dirty.delete(name); useTheirs(); finish();
    } catch (e) { alert('Could not save the copy: ' + e); }
  };
}
function flushAll() { return Promise.all(Object.keys(pending).map(flushOne)); }

/* ---------- Note parsing (cached) ---------- */
let resolverVersion = -1, resolver = null;
function resolve(t) {
  if (resolverVersion !== namesVersion) { resolver = Core.makeResolver(Object.keys(notes)); resolverVersion = namesVersion; }
  return resolver(t);
}
const parseCache = new Map(); // name -> { content, version, base, parsed }
function parse(name) {
  const raw = notes[name] ? notes[name].content : '';
  const c = parseCache.get(name);
  if (c && c.content === raw && c.version === namesVersion) return c.parsed;
  const base = c && c.content === raw ? c.base : Core.parseRaw(raw);
  const links = new Set(base.targets.map((t) => resolve(t) || t));
  ['asset', 'setup'].forEach((k) => { const r = base.props[k] && resolve(base.props[k]); if (r) links.add(r); });
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
// Date of a note: "date" property, else YYYY-MM-DD at the start of the name, else the file date
function noteDate(name, p) {
  p = p || parse(name);
  const d = (p.props.date || '').match(/\d{4}-\d{2}-\d{2}/) || name.match(/^\d{4}-\d{2}-\d{2}/);
  if (d) return d[0];
  const t = notes[name] && notes[name].mtime;
  return t ? new Date(t).toISOString().slice(0, 10) : '';
}
// Sets frontmatter properties (null = remove) while keeping the existing order
function setProps(name, updates) { notes[name].content = Core.setPropsText(notes[name].content, updates); }
// Stats of the trades that have a result in R
function tradeStats(P) {
  P = P || allParsed();
  const tr = Object.keys(P).filter((n) => P[n].type === 'trade' && rOf(P[n]) != null).sort();
  return { names: tr, ...Core.computeStats(tr.map((n) => ({ r: rOf(P[n]), setup: P[n].props.setup, asset: P[n].props.asset }))) };
}

/* ---------- Markdown (reading view) ---------- */
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
    } catch (e) { img.replaceWith(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Image not found: ' + src })); }
  }
}
function propsHtml(p) {
  const ks = Object.keys(p.props); if (!ks.length) return '';
  return '<div class="props">' + ks.map((k) => {
    let v = esc(p.props[k]);
    if (k === 'result') { const r = rOf(p); if (r != null) v = `<span class="tag" style="background:${r >= 0 ? '#12301b' : '#3a1414'};color:${r >= 0 ? '#56d364' : '#ff7b72'}">${r > 0 ? '+' : ''}${r} R</span>`; }
    else if (k === 'side' && v) v = `<span class="tag" style="background:#1d1a2b;color:#a68bff">${v}</span>`;
    else if ((k === 'asset' || k === 'setup') && resolve(p.props[k] || '')) v = `<a class="il" data-n="${esc(resolve(p.props[k]))}">${v}</a>`;
    else if (k === 'type') v = TYPE_LABEL[p.props[k]] || v;
    else if (k === 'tags' && v) v = p.props[k].split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="tag" style="background:#161b22;color:#8b949e;margin-right:4px">#${esc(t)}</span>`).join('');
    return `<div class="prow"><div class="pk">${LABELS[k] || esc(k)}</div><div class="pv">${v}</div></div>`;
  }).join('') + '</div>';
}

/* ---------- File tree (real vault folders) ---------- */
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
    Object.keys(node.dirs).sort(byName).forEach((d) => {
      const sub = node.dirs[d], isClosed = closed.has(sub.key) && !q;
      h += `<div class="folder${isClosed ? ' closed' : ''}" data-f="${esc(sub.key)}" style="padding-left:${pad}px"><span class="chev">▾</span>${esc(d)}</div>`;
      if (!isClosed) h += draw(sub, depth + 1);
    });
    const files = node.files.sort((a, b) => (P[a].type === 'trade' && P[b].type === 'trade' ? byName(b, a) : byName(a, b)));
    files.forEach((n) => { h += `<div class="file${n === cur ? ' on' : ''}" data-n="${esc(n)}" style="padding-left:${pad + 16}px" title="${esc(notes[n].path)}"><i class="dot" style="background:${colorOf(P[n])}"></i>${esc(n)}</div>`; });
    return h;
  };
  $('tree').innerHTML = draw(root, 0) || '<div class="empty" style="padding:8px">No notes</div>';
}

/* ---------- Note ---------- */
function renderNote() {
  if (!cur || !notes[cur]) cur = notes['Welcome'] ? 'Welcome' : notes['Bienvenue'] ? 'Bienvenue' : Object.keys(notes)[0] || null;
  if (!cur) {
    $('title').value = ''; $('crumb').innerHTML = '';
    $('reader').innerHTML = '<p class="empty">No notes yet. Create a trade with Write.</p>';
    $('reader').style.display = 'block'; $('editorhost').style.display = 'none';
    renderLinks(null); return;
  }
  const p = parse(cur);
  if (document.activeElement !== $('title')) $('title').value = cur;
  const d = dirOf(notes[cur].path);
  $('crumb').innerHTML = (d ? esc(d.replace(/\//g, ' / ')) + ' / ' : '') + `<b>${esc(cur)}</b>`;
  $('editorhost').style.display = editing ? 'block' : 'none';
  $('reader').style.display = editing ? 'none' : 'block';
  $('btnMode').textContent = editing ? 'Read' : 'Edit';
  if (editing) {
    const ed = getEditor();
    if (edNote !== cur || ed.getDoc() !== notes[cur].content) { ed.setDoc(notes[cur].content); edNote = cur; }
  } else { $('reader').innerHTML = propsHtml(p) + md(p.body); loadImages($('reader')); }
  renderLinks(p);
}
function renderLinks(p) {
  if (!p) { $('backlinks').innerHTML = $('outlinks').innerHTML = ''; $('blc').textContent = $('olc').textContent = ''; return; }
  const P = allParsed();
  const back = Object.keys(P).filter((n) => n !== cur && P[n].links.includes(cur));
  $('blc').textContent = back.length; $('olc').textContent = p.links.length;
  const snip = (n) => { const b = P[n].body; const i = b.toLowerCase().indexOf('[[' + cur.toLowerCase()); const s = i < 0 ? b.slice(0, 80) : b.slice(Math.max(0, i - 30), i + 50); return esc(s.replace(/\n/g, ' ')); };
  const row = (n, extra) => `<div class="bl" data-n="${esc(n)}"><span style="display:flex;align-items:center;gap:8px"><i class="dot" style="background:${notes[n] ? colorOf(P[n]) : '#444'}"></i>${esc(n)}</span>${extra || ''}</div>`;
  $('backlinks').innerHTML = back.map((n) => row(n, `<small>${snip(n)}</small>`)).join('') || '<div class="empty">No backlinks</div>';
  $('outlinks').innerHTML = p.links.map((n) => row(n)).join('') || '<div class="empty">No links</div>';
}

/* ---------- Live-preview editor (CodeMirror 6, see editor/whale-editor.js) ---------- */
let editorInst = null, edNote = null;
function allTags() {
  const tags = new Set();
  for (const n of Object.keys(notes)) {
    const p = parse(n);
    (p.props.tags || '').split(',').forEach((t) => { t = t.trim().replace(/^#/, ''); if (t) tags.add(t); });
    for (const m of p.body.matchAll(/(?:^|[\s(])#([\p{L}\d_][\p{L}\d_\-/]*)/gu)) tags.add(m[1]);
  }
  return [...tags].sort(byName);
}
async function imageUrl(src) {
  const path = src.includes('/') ? src : 'attachments/' + src;
  if (!blobCache[path]) blobCache[path] = URL.createObjectURL(new Blob([await Store.readBytes(path)]));
  return blobCache[path];
}
async function saveImage(file) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const name = `chart-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.${ext}`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await Store.saveAttachment(name, bytes);
    blobCache['attachments/' + name] = URL.createObjectURL(new Blob([bytes], { type: file.type }));
    status('Image saved · attachments/' + name);
    return `![[${name}]]\n`;
  } catch (err) { alert('Could not save the image: ' + err); return null; }
}
let linkTimer = null;
function getEditor() {
  if (editorInst) return editorInst;
  editorInst = WhaleEditor.create($('editorhost'), {
    placeholder: 'Start writing… [[ to link a note, # for a tag, Ctrl+V to paste a chart screenshot',
    onChange(text) {
      if (!cur || edNote !== cur) return;
      notes[cur].content = text; queueWrite(cur);
      clearTimeout(linkTimer); linkTimer = setTimeout(() => { renderTree(); renderLinks(parse(cur)); }, 300);
    },
    getNoteNames: () => Object.keys(notes).filter((n) => n !== cur),
    describeNote: (n) => dirOf(notes[n].path),
    getTags: allTags,
    resolveNote: (t) => resolve(t),
    onOpenLink: (t) => open(resolve(t) || t),
    resolveImage: imageUrl,
    onPasteImage: saveImage,
  });
  return editorInst;
}

async function open(n) {
  await flushAll();
  if (!notes[n]) {
    const path = safeName(n) + '.md';
    notes[n] = { path, content: `# ${n}\n\n`, mtime: 0 };
    notes[n].mtime = (await Store.write(path, notes[n].content)) || 0;
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
  if (window.AIPanel) AIPanel.onView(v);
  if (v === 'graph') Graph.show(); else Graph.hide();
  if (v === 'dash') { $('crumb').innerHTML = '<b>Dashboard</b>'; renderDash(); }
  if (v === 'timeline') { $('crumb').innerHTML = '<b>Timeline</b> · all your notes over time'; Views.timeline(); }
  if (v === 'table') { $('crumb').innerHTML = '<b>Trades table</b>'; Views.table(); }
  if (v === 'ask') { $('crumb').innerHTML = '<b>Ask</b> · ask your journal a question'; AI.showAsk(); }
  if (v === 'note') renderNote();
}
function refreshAll() { renderTree(); if (view === 'note') renderNote(); else setView(view); }

/* ---------- Actions ---------- */
async function newTrade() {
  await flushAll();
  const d = new Date().toISOString().slice(0, 10);
  let n = `${d} New trade`, i = 2;
  while (notes[n]) n = `${d} New trade ${i++}`;
  const content = `---\ntype: trade\ndate: ${d}\nasset: \nsetup: \nside: LONG\nentry: \nstop: \nexit: \nresult: \n---\n## Context\n\n\n## Mistakes / emotions\n\n`;
  notes[n] = { path: `${TYPE_DIR.trade}/${safeName(n)}.md`, content, mtime: 0 };
  notes[n].mtime = (await Store.write(notes[n].path, content)) || 0;
  cur = n; editing = true; setView('note'); renderTree(); getEditor().focus();
}
async function deleteCur() {
  if (!cur || !confirm(`Move "${cur}" to the trash?\nThe file will be moved to the vault's .trash folder.`)) return;
  clearTimeout(pending[cur]); delete pending[cur]; clearTimeout(retryTimers[cur]); dirty.delete(cur);
  try { await Store.trash(notes[cur].path); delete notes[cur]; cur = null; renderTree(); renderNote(); status('Note moved to the trash'); }
  catch (e) { alert('Could not delete: ' + e); }
}
async function renameCur(nn) {
  nn = nn.trim();
  if (!nn || nn === cur) { $('title').value = cur; return; }
  if (resolve(nn) && resolve(nn) !== cur) { alert('A note with this name already exists.'); $('title').value = cur; return; }
  await flushAll();
  const old = cur, from = notes[old].path, d = dirOf(from);
  const to = (d ? d + '/' : '') + safeName(nn) + '.md';
  try { await Store.rename(from, to); } catch (e) { alert('Could not rename: ' + e); $('title').value = cur; return; }
  notes[nn] = { path: to, content: notes[old].content, mtime: notes[old].mtime }; delete notes[old];
  // update [[old name]] links and asset/setup properties everywhere
  for (const k of Object.keys(notes)) {
    const c = notes[k].content, nc = Core.renameInContent(c, old, nn);
    if (nc !== c) { notes[k].content = nc; await saveNote(k); }
  }
  cur = nn; renderTree(); renderNote(); status('Renamed to ' + to);
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

/* ---------- Dashboard ---------- */
function renderDash() {
  const st = tradeStats();
  const fmt = (x) => (x > 0 ? '+' : '') + Math.round(x * 100) / 100 + ' R';
  const tbl = (g, label) => `<h3 style="margin:22px 0 8px">By ${label}</h3><table><tr><th>${label}</th><th>Trades</th><th>Win rate</th><th>Total</th></tr>` +
    Object.keys(g).map((v) => {
      const s = g[v], r = resolve(v);
      return `<tr class="click" ${r ? `data-n="${esc(r)}"` : ''}><td>${esc(v)}</td><td>${s.count}</td><td>${s.winrate}%</td><td style="color:${s.total >= 0 ? 'var(--win)' : 'var(--loss)'}">${fmt(s.total)}</td></tr>`;
    }).join('') + '</table>';
  $('dash').innerHTML = `<h1 style="margin:0;font-size:26px">Dashboard</h1>
  <div style="color:var(--tx3)">Computed from the <code style="font-family:var(--mono)">result</code> property (in R) of your trade notes.</div>
  <div class="cards">
    <div class="card"><div class="l">Trades</div><div class="v">${st.count}</div></div>
    <div class="card"><div class="l">Win rate</div><div class="v">${st.winrate}%</div></div>
    <div class="card"><div class="l">Total</div><div class="v" style="color:${st.total >= 0 ? 'var(--win)' : 'var(--loss)'}">${fmt(st.total)}</div></div>
    <div class="card"><div class="l">Average R</div><div class="v">${st.avg != null ? fmt(st.avg) : '—'}</div></div>
    <div class="card"><div class="l">Profit factor</div><div class="v">${st.profitFactor != null ? st.profitFactor : '—'}</div></div>
  </div>
  <h3 style="margin:0 0 8px">Equity curve (in R)</h3><canvas id="eq"></canvas>
  ${st.count ? tbl(st.bySetup, 'setup') + tbl(st.byAsset, 'asset') : '<p class="empty">Fill in "result" on your trades to see stats.</p>'}`;
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

/* ---------- Events ---------- */
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
$('btnMode').onclick = () => { editing = !editing; renderNote(); if (editing) getEditor().focus(); };
$('title').addEventListener('change', () => renameCur($('title').value));
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('title').blur(); } });
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'e') { e.preventDefault(); if (view !== 'note') setView('note'); editing = !editing; renderNote(); if (editing) getEditor().focus(); }
  if (k === 'g') { e.preventDefault(); setView(view === 'graph' ? 'note' : 'graph'); }
  if (k === 'n') { e.preventDefault(); newTrade(); }
  if (k === 's') { e.preventDefault(); flushAll(); }
});
// Re-read the disk when the window comes back (notes edited in another app show up;
// notes with unsaved changes are kept and protected by the conflict check on save)
async function reloadFromDisk() {
  if (!vault || conflictOpen) return;
  const before = JSON.stringify(notes);
  await loadAll();
  if (JSON.stringify(notes) !== before) { renderTree(); if (view === 'note') renderNote(); if (view === 'dash') renderDash(); }
}
window.addEventListener('focus', reloadFromDisk);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadFromDisk(); });
window.addEventListener('beforeunload', flushAll);

/* ---------- Startup ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  try { vault = await Store.getVault(); await afterVault(); }
  catch (e) { status('Error: ' + e); console.error(e); }
});
