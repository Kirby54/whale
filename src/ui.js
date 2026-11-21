/* Whale — menu « Plus », palette Ctrl+K (chercher ou demander) et statut de l'IA */
(() => {
  /* ---------- Menu Plus ---------- */
  $('btnMore').onclick = (e) => { e.stopPropagation(); $('more').classList.toggle('hide'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('#more') && e.target.id !== 'btnMore') $('more').classList.add('hide'); });

  /* ---------- Statut de l'IA (bas de la barre) ---------- */
  let running = 0;
  const raw = Store.ai;
  const showStatus = () => {
    const el = $('aistatus');
    el.classList.toggle('run', running > 0);
    el.textContent = running > 0 ? 'IA EN COURS' : 'AUCUNE IA EN COURS';
  };
  Store.ai = async (body) => { running++; showStatus(); try { return await raw(body); } finally { running--; showStatus(); } };

  /* ---------- Palette Ctrl+K ---------- */
  const ACTIONS = [
    ['Écrire un nouveau trade', () => newTrade()],
    ['Ouvrir le cerveau', () => setView('graph')],
    ['Importer des notes, conversations ou trades', () => Importer.open()],
    ['Tableau de bord', () => setView('dash')],
    ['Timeline', () => setView('timeline')],
    ['Tableau des trades', () => setView('table')],
    ['Classer toutes les notes sans tags (IA)', () => AI.classifyAll()],
    ["Réglages de l'IA", () => AI.openSettings()],
    ['Changer de coffre', () => changeVault()],
  ];
  let items = [], sel = 0;
  const pal = $('palette'), inp = $('pinput');

  function openPal() { pal.classList.remove('hide'); inp.value = ''; render(); setTimeout(() => inp.focus(), 10); }
  function closePal() { pal.classList.add('hide'); }
  function render() {
    const q = inp.value.trim(), ql = q.toLowerCase();
    items = [];
    if (q) items.push({ label: `<span class="ask">✦ Demander à l'IA :</span> ${esc(q)}`, hint: 'Entrée', run: () => { setView('ask'); setTimeout(() => { $('askinput').value = q; $('askform').requestSubmit(); }, 30); } });
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
    $('presults').innerHTML = items.map((it, i) => `<div class="pr ${i === sel ? 'on' : ''}" data-i="${i}">${it.label}<small>${it.hint || ''}</small></div>`).join('') || '<div class="pr">Aucun résultat</div>';
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

/* ---------- Barre de titre intégrée (app desktop seulement) ---------- */
(() => {
  const T = window.__TAURI__;
  if (!T || !T.window) return;
  document.body.classList.add('desktop');
  const win = T.window.getCurrentWindow();
  $('winMin').onclick = () => win.minimize();
  $('winMax').onclick = () => win.toggleMaximize();
  $('winClose').onclick = async () => { await flushAll(); win.close(); };
})();
