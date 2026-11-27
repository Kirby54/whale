/* Whale — "More" menu, Ctrl+K palette (search or ask) and AI status */
(() => {
  /* ---------- More menu ---------- */
  $('btnMore').onclick = (e) => { e.stopPropagation(); $('more').classList.toggle('hide'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#more') && e.target.id !== 'btnMore') $('more').classList.add('hide'); });

  /* ---------- AI status (bottom of the sidebar) ---------- */
  let running = 0;
  const raw = Store.ai;
  const showStatus = () => {
    const el = $('aistatus');
    el.classList.toggle('run', running > 0);
    el.textContent = running > 0 ? 'AI RUNNING' : 'NO AI RUNNING NOW';
  };
  Store.ai = async (body) => { running++; showStatus(); try { return await raw(body); } finally { running--; showStatus(); } };

  /* ---------- Ctrl+K palette ---------- */
  const ACTIONS = [
    ['Write a new trade', () => newTrade()],
    ['Open the brain', () => setView('graph')],
    ['Import notes, conversations or trades', () => Importer.open()],
    ['Dashboard', () => setView('dash')],
    ['Timeline', () => setView('timeline')],
    ['Trades table', () => setView('table')],
    ['Setups', () => setView('setups')],
    ['Classify all notes without tags (AI)', () => AI.classifyAll()],
    ['AI settings', () => AI.openSettings()],
    ['Change vault', () => changeVault()],
  ];
  let items = [], sel = 0;
  const pal = $('palette'), inp = $('pinput');

  function openPal() { pal.classList.remove('hide'); inp.value = ''; render(); setTimeout(() => inp.focus(), 10); }
  function closePal() { pal.classList.add('hide'); }
  function render() {
    const q = inp.value.trim(), ql = q.toLowerCase();
    items = [];
    if (q) items.push({ label: `<span class="ask">✦ Ask the AI:</span> ${esc(q)}`, hint: 'Enter', run: () => { setView('ask'); setTimeout(() => { $('askinput').value = q; $('askform').requestSubmit(); }, 30); } });
    const names = Object.keys(notes);
    let found;
    if (q) {
      const inName = names.filter((n) => n.toLowerCase().includes(ql));
      const inBody = names.filter((n) => !inName.includes(n) && notes[n].content.toLowerCase().includes(ql));
      found = inName.concat(inBody).slice(0, 30);
    } else found = names.slice().sort((a, b) => noteDate(b).localeCompare(noteDate(a))).slice(0, 8);
    found.forEach((n) => { const p = parse(n); items.push({ label: `<i class="dot" style="background:${colorOf(p)}"></i>${esc(n)}`, hint: esc(dirOf(notes[n].path) || TYPE_LABEL[p.type] || ''), run: () => open(n) }); });
    ACTIONS.filter(([l]) => !q || l.toLowerCase().includes(ql)).forEach(([l, f]) => items.push({ label: esc(l), hint: 'action', run: f }));
    sel = 0; paint();
  }
  function paint() {
    $('presults').innerHTML = items.map((it, i) => `<div class="pr ${i === sel ? 'on' : ''}" data-i="${i}">${it.label}<small>${it.hint || ''}</small></div>`).join('') || '<div class="pr">No results</div>';
    const on = $('presults').querySelector('.pr.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function run(i) { const it = items[i]; if (!it) return; closePal(); it.run(); }
  inp.addEventListener('input', render);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') closePal();
  });
  $('presults').addEventListener('mousedown', (e) => { const r = e.target.closest('.pr[data-i]'); if (r) { e.preventDefault(); run(+r.dataset.i); } });
  pal.addEventListener('mousedown', (e) => { if (e.target === pal) closePal(); });
  $('openPalette').onclick = openPal;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('hide') ? openPal() : closePal(); }
  });
})();

/* ---------- Built-in title bar (desktop app only) ---------- */
(() => {
  const T = window.__TAURI__;
  if (!T || !T.window) return;
  document.body.classList.add('desktop');
  const win = T.window.getCurrentWindow();
  $('winMin').onclick = () => win.minimize();
  $('winMax').onclick = () => win.toggleMaximize();
  $('winClose').onclick = async () => { await flushAll(); win.close(); };
})();

/* ---------- Logo picker (3 options) ---------- */
(() => {
  const LOGOS = {
    a: { name: 'Ocean gem', mark: 'img/logo-a.svg', app: 'img/logo-a-app.svg' },
    b: { name: 'Violet gem', mark: 'img/logo-b.svg', app: 'img/logo-b-app.svg' },
    c: { name: 'Gradient', mark: 'img/logo-c.svg', app: 'img/logo-c.svg' },
  };
  let current = 'a';
  try { const s = localStorage.getItem('whale-logo'); if (LOGOS[s]) current = s; } catch (e) {}
  const apply = (k) => {
    current = k;
    document.querySelectorAll('[data-logo]').forEach((img) => (img.src = LOGOS[k].mark));
    try { localStorage.setItem('whale-logo', k); } catch (e) {}
  };
  apply(current);
  $('btnLogo').onclick = () => {
    $('more').classList.add('hide');
    Modal.show(`<h2>Choose the logo</h2>
      <div class="sub">The logo changes right away in the title bar and the sidebar.</div>
      <div class="logos">${Object.keys(LOGOS).map((k) => `<button data-k="${k}" class="${k === current ? 'on' : ''}"><img src="${LOGOS[k].app}" alt="">${LOGOS[k].name}</button>`).join('')}</div>
      <div class="note" style="margin-top:12px">The .exe and taskbar icon is set at build time. To change it: <code>npx tauri icon assets/concepts/&lt;name&gt;-app.svg</code> (a-ocean-gem, b-violet-gem or c-gradient), then rebuild.</div>
      <div class="actions"><button class="tbtn" id="logoOk">Close</button></div>`);
    document.querySelectorAll('.logos button').forEach((b) => (b.onclick = () => {
      apply(b.dataset.k);
      document.querySelectorAll('.logos button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('logoOk').onclick = Modal.close;
  };
})();
