/* Whale — Timeline and Trades table views */
window.Views = (() => {
  let tlType = 'all', tlQuery = '';
  let sortKey = 'date', sortDir = -1, tQuery = '';

  const snippet = (p) => {
    if (p.props.summary) return p.props.summary;
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
    let html = `<h1>Timeline</h1><div class="sub">${items.length} note(s), sorted by date ("date" property, date in the name, or file date).</div>
      <div class="filters">
        <button class="chip ${tlType === 'all' ? 'on' : ''}" data-t="all">All</button>
        ${types.map((t) => `<button class="chip ${tlType === t ? 'on' : ''}" data-t="${t}"><i class="dot" style="background:${colorOf({ type: t, props: { result: '1' } })}"></i>${TYPE_LABEL[t] || t}</button>`).join('')}
        <input class="search2" id="tlSearch" placeholder="Filter…" value="${esc(tlQuery)}" style="margin-left:auto">
      </div>`;
    let month = '';
    items.forEach(({ n, p, d }) => {
      const mo = d.slice(0, 7);
      if (mo !== month) { month = mo; html += `<div class="tl-month">${new Date(d + 'T12:00:00').toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })}</div>`; }
      html += `<div class="tl-item" data-n="${esc(n)}"><div class="tl-day">${d.slice(8, 10)}</div><div class="tl-main">
        <div class="tl-title"><i class="dot" style="background:${colorOf(p)}"></i><span>${esc(n)}</span><span class="note" style="margin:0">${TYPE_LABEL[p.type] || p.type}</span>${p.type === 'trade' ? rTag(rOf(p)) : ''}</div>
        <div class="tl-snip">${esc(snippet(p))}</div></div></div>`;
    });
    if (!items.length) html += '<p class="empty">No notes for this filter.</p>';
    $('timeline').innerHTML = html;
    $('timeline').querySelectorAll('.chip').forEach((b) => (b.onclick = () => { tlType = b.dataset.t; timeline(); }));
    const s = $('tlSearch');
    s.oninput = () => { tlQuery = s.value; const pos = s.selectionStart; timeline(); $('tlSearch').focus(); $('tlSearch').setSelectionRange(pos, pos); };
  }

  /* ---------- Trades table ---------- */
  const COLS = [
    ['date', 'Date'], ['name', 'Trade'], ['asset', 'Asset'], ['setup', 'Setup'], ['side', 'Side'],
    ['entry', 'Entry'], ['stop', 'Stop'], ['exit', 'Exit'], ['result', 'Result'], ['tags', 'Tags'],
  ];
  function table() {
    const P = allParsed(); const q = tQuery.toLowerCase();
    let rows = Object.keys(P).filter((n) => P[n].type === 'trade').map((n) => {
      const p = P[n];
      return { name: n, date: noteDate(n, p), asset: p.props.asset || '', setup: p.props.setup || '', side: p.props.side || '', entry: p.props.entry || '', stop: p.props.stop || '', exit: p.props.exit || '', result: rOf(p), tags: p.props.tags || '' };
    });
    if (q) rows = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null || x === '') return 1; if (y == null || y === '') return -1;
      const nx = parseFloat(x), ny = parseFloat(y);
      const c = !isNaN(nx) && !isNaN(ny) && sortKey !== 'date' ? nx - ny : String(x).localeCompare(String(y), LOCALE);
      return c * sortDir;
    });
    const rs = rows.map((r) => r.result).filter((r) => r != null);
    const tot = rs.reduce((a, b) => a + b, 0);
    $('tradetable').innerHTML = `<h1>Trades table</h1>
      <div class="sub">${rows.length} trade(s) · ${rs.length ? `${Math.round(rs.filter((r) => r > 0).length / rs.length * 100)}% winners · total <b style="color:${tot >= 0 ? 'var(--win)' : 'var(--loss)'}">${tot > 0 ? '+' : ''}${Math.round(tot * 100) / 100} R</b>` : 'no results filled in'} · click a column to sort</div>
      <div class="filters"><input class="search2" id="tSearch" placeholder="Filter (asset, setup, tag…)" value="${esc(tQuery)}"></div>
      <table><tr>${COLS.map(([k, l]) => `<th data-k="${k}">${l}${sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr class="click" data-n="${esc(r.name)}">${COLS.map(([k]) => {
        if (k === 'result') return `<td style="color:${r.result == null ? 'var(--tx3)' : r.result >= 0 ? 'var(--win)' : 'var(--loss)'}">${r.result == null ? '—' : (r.result > 0 ? '+' : '') + r.result + ' R'}</td>`;
        if (k === 'tags') return `<td class="tags">${esc(r.tags)}</td>`;
        return `<td>${esc(r[k] || '')}</td>`;
      }).join('')}</tr>`).join('')}</table>
      ${rows.length ? '' : '<p class="empty">No trades.</p>'}`;
    $('tradetable').querySelectorAll('th').forEach((th) => (th.onclick = () => { const k = th.dataset.k; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'date' || k === 'result' ? -1 : 1; } table(); }));
    const s = $('tSearch');
    s.oninput = () => { tQuery = s.value; const pos = s.selectionStart; table(); $('tSearch').focus(); $('tSearch').setSelectionRange(pos, pos); };
  }

  return { timeline, table };
})();
