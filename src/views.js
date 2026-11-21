/* Whale — vues Timeline et Tableau des trades */
window.Views = (() => {
  let tlType = 'all', tlQuery = '';
  let sortKey = 'date', sortDir = -1, tQuery = '';

  const snippet = (p) => {
    if (p.props.resume) return p.props.resume;
    const line = p.body.split(/\r?\n/).map((l) => l.replace(/^#+\s*|\*\*|\[\[|\]\]/g, '').trim()).find((l) => l && !l.startsWith('!'));
    return line || '';
  };
  const rTag = (r) => (r == null ? '' : `<span class="tl-r" style="color:${r >= 0 ? 'var(--win)' : 'var(--loss)'}">${r > 0 ? '+' : ''}${r} R</span>`);

  /* ---------- Timeline ---------- */
  function timeline() {
    const P = allParsed();
    const types = [...new Set(Object.values(P).map((p) => p.type))];
    const q = tlQuery.toLowerCase();
    const items = Object.keys(P)
      .map((n) => ({ n, p: P[n], d: noteDate(n, P[n]) }))
      .filter((x) => x.d && (tlType === 'all' || x.p.type === tlType) && (!q || x.n.toLowerCase().includes(q) || notes[x.n].content.toLowerCase().includes(q)))
      .sort((a, b) => b.d.localeCompare(a.d) || a.n.localeCompare(b.n));
    let html = `<h1>Timeline</h1><div class="sub">${items.length} note(s), classées par date (propriété « date », date dans le nom, ou date du fichier).</div>
      <div class="filters">
        <button class="chip ${tlType === 'all' ? 'on' : ''}" data-t="all">Tout</button>
        ${types.map((t) => `<button class="chip ${tlType === t ? 'on' : ''}" data-t="${t}"><i class="dot" style="background:${colorOf({ type: t, props: { resultat: '1' } })}"></i>${TYPE_LABEL[t] || t}</button>`).join('')}
        <input class="search2" id="tlSearch" placeholder="Filtrer…" value="${esc(tlQuery)}" style="margin-left:auto">
      </div>`;
    let month = '';
    items.forEach(({ n, p, d }) => {
      const mo = d.slice(0, 7);
      if (mo !== month) { month = mo; html += `<div class="tl-month">${new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div>`; }
      html += `<div class="tl-item" data-n="${esc(n)}"><div class="tl-day">${d.slice(8, 10)}</div><div class="tl-main">
        <div class="tl-title"><i class="dot" style="background:${colorOf(p)}"></i><span>${esc(n)}</span><span class="note" style="margin:0">${TYPE_LABEL[p.type] || p.type}</span>${p.type === 'trade' ? rTag(rOf(p)) : ''}</div>
        <div class="tl-snip">${esc(snippet(p))}</div></div></div>`;
    });
    if (!items.length) html += '<p class="empty">Aucune note pour ce filtre.</p>';
    $('timeline').innerHTML = html;
    $('timeline').querySelectorAll('.chip').forEach((b) => (b.onclick = () => { tlType = b.dataset.t; timeline(); }));
    const s = $('tlSearch');
    s.oninput = () => { tlQuery = s.value; const pos = s.selectionStart; timeline(); $('tlSearch').focus(); $('tlSearch').setSelectionRange(pos, pos); };
  }

  /* ---------- Tableau des trades ---------- */
  const COLS = [
    ['date', 'Date'], ['name', 'Trade'], ['actif', 'Actif'], ['setup', 'Setup'], ['sens', 'Sens'],
    ['entree', 'Entrée'], ['stop', 'Stop'], ['sortie', 'Sortie'], ['resultat', 'Résultat'], ['tags', 'Tags'],
  ];
  function table() {
    const P = allParsed(); const q = tQuery.toLowerCase();
    let rows = Object.keys(P).filter((n) => P[n].type === 'trade').map((n) => {
      const p = P[n];
      return { name: n, date: noteDate(n, p), actif: p.props.actif || '', setup: p.props.setup || '', sens: p.props.sens || '', entree: p.props.entree || '', stop: p.props.stop || '', sortie: p.props.sortie || '', resultat: rOf(p), tags: p.props.tags || '' };
    });
    if (q) rows = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null || x === '') return 1; if (y == null || y === '') return -1;
      const nx = parseFloat(x), ny = parseFloat(y);
      const c = !isNaN(nx) && !isNaN(ny) && sortKey !== 'date' ? nx - ny : String(x).localeCompare(String(y), 'fr');
      return c * sortDir;
    });
    const rs = rows.map((r) => r.resultat).filter((r) => r != null);
    const tot = rs.reduce((a, b) => a + b, 0);
    $('tradetable').innerHTML = `<h1>Tableau des trades</h1>
      <div class="sub">${rows.length} trade(s) · ${rs.length ? `${Math.round(rs.filter((r) => r > 0).length / rs.length * 100)} % gagnants · total <b style="color:${tot >= 0 ? 'var(--win)' : 'var(--loss)'}">${tot > 0 ? '+' : ''}${Math.round(tot * 100) / 100} R</b>` : 'aucun résultat renseigné'} · clique sur une colonne pour trier</div>
      <div class="filters"><input class="search2" id="tSearch" placeholder="Filtrer (actif, setup, tag…)" value="${esc(tQuery)}"></div>
      <table><tr>${COLS.map(([k, l]) => `<th data-k="${k}">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr class="click" data-n="${esc(r.name)}">${COLS.map(([k]) => {
        if (k === 'resultat') return `<td style="color:${r.resultat == null ? 'var(--tx3)' : r.resultat >= 0 ? 'var(--win)' : 'var(--loss)'}">${r.resultat == null ? '—' : (r.resultat > 0 ? '+' : '') + r.resultat + ' R'}</td>`;
        if (k === 'tags') return `<td class="tags">${esc(r.tags)}</td>`;
        return `<td>${esc(r[k] || '')}</td>`;
      }).join('')}</tr>`).join('')}</table>
      ${rows.length ? '' : '<p class="empty">Aucun trade.</p>'}`;
    $('tradetable').querySelectorAll('th').forEach((th) => (th.onclick = () => { const k = th.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'date' || k === 'resultat' ? -1 : 1; } table(); }));
    const s = $('tSearch');
    s.oninput = () => { tQuery = s.value; const pos = s.selectionStart; table(); $('tSearch').focus(); $('tSearch').setSelectionRange(pos, pos); };
  }

  return { timeline, table };
})();
