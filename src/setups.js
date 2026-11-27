/* Whale — Setups tab: how each setup works (schematic chart + rules) and how it performs
   (stats, equity curve, result distribution, mistakes, trades). Also the trade card shown on trade notes. */
window.Setups = (() => {
  let selected = null;
  const GREEN = '#3fb950', RED = '#f85149', VIOLET = '#a68bff', GREY = '#6b6b6b';
  const fmtR = (r) => (r == null ? '—' : (r > 0 ? '+' : '') + Math.round(r * 100) / 100 + ' R');
  const svgEsc = (s) => esc(String(s));

  /* ---------- Data ---------- */
  // Every setup: notes of type "setup" plus setup names used in trades without a note
  function allSetups() {
    const P = allParsed(), map = new Map();
    Object.keys(P).forEach((n) => { if (P[n].type === 'setup') map.set(n.toLowerCase(), { name: n, note: n, trades: [] }); });
    Object.keys(P).forEach((n) => {
      const p = P[n]; if (p.type !== 'trade' || !p.props.setup) return;
      const key = (resolve(p.props.setup) || p.props.setup).toLowerCase();
      if (!map.has(key)) map.set(key, { name: resolve(p.props.setup) || p.props.setup, note: resolve(p.props.setup), trades: [] });
      map.get(key).trades.push(n);
    });
    return [...map.values()].map((s) => {
      const rs = s.trades.map((n) => rOf(P[n])).filter((r) => r != null);
      const st = Core.computeStats(s.trades.map((n) => ({ r: rOf(P[n]), asset: P[n].props.asset })));
      return { ...s, rs, st };
    }).sort((a, b) => b.trades.length - a.trades.length || a.name.localeCompare(b.name, LOCALE));
  }

  /* ---------- Schematic charts ---------- */
  // Closing prices of a textbook example for each pattern, plus the levels and the explanation steps
  const TEMPLATES = {
    breakout: {
      label: 'Breakout',
      closes: [62, 66, 64, 70, 74, 72, 79, 84, 90, 95, 88, 93, 97, 91, 86, 92, 98, 94, 89, 95, 99, 96, 108, 112, 110, 118, 123, 121, 129, 134],
      special: { 22: { o: 96, h: 109, l: 94.5, c: 108 } }, volume: { 22: 3.2, 23: 1.8 },
      levels: [{ y: 100, label: 'Resistance', color: GREY }],
      entryIdx: 22, entry: 108, stop: 93, targetR: 2,
      steps: ['Price compresses under a resistance that rejects it several times.', 'A strong candle closes above the resistance on high volume: the break.', 'Entry on that close; stop under the breakout candle; target at 2R.'],
      marks: [{ i: 15, y: 101.5, n: 1 }, { i: 22, y: 111, n: 2 }, { i: 25, y: 124, n: 3 }],
    },
    pullback: {
      label: 'Pullback',
      closes: [60, 64, 62, 68, 72, 70, 77, 82, 80, 87, 92, 90, 96, 93, 89, 86, 84, 86, 91, 95, 99, 104, 102, 108, 113, 117],
      special: { 17: { o: 83, h: 87.5, l: 78, c: 86.5 } }, ema: 8,
      levels: [{ y: 96, label: 'Previous high', color: GREY }],
      entryIdx: 18, entry: 88, stop: 77.5, targetR: 2,
      steps: ['A clear uptrend makes higher highs and higher lows.', 'Price pulls back to the moving average / support and prints a rejection candle.', 'Entry above the rejection candle; stop under its low; target at 2R.'],
      marks: [{ i: 9, y: 96, n: 1 }, { i: 17, y: 74, n: 2 }, { i: 20, y: 104, n: 3 }],
    },
    reversal: {
      label: 'Reversal (double bottom)',
      closes: [124, 120, 122, 115, 110, 112, 105, 100, 102, 95, 99, 104, 107, 103, 98, 95, 100, 105, 111, 115, 113, 119, 124],
      special: { 9: { o: 100, h: 101, l: 90, c: 95 }, 15: { o: 98, h: 99, l: 90.5, c: 95 } },
      levels: [{ y: 107.5, label: 'Neckline', color: GREY }],
      entryIdx: 18, entry: 111, stop: 89, targetR: 0.9,
      steps: ['A downtrend stalls: two lows at the same level form a double bottom.', 'Price climbs back and closes above the neckline between the two lows.', 'Entry on the break; stop under the lows; target = height of the pattern.'],
      marks: [{ i: 12, y: 87, n: 1 }, { i: 18, y: 115, n: 2 }, { i: 21, y: 127, n: 3 }],
    },
    range: {
      label: 'Range',
      closes: [100, 106, 103, 109, 104, 97, 93, 96, 102, 108, 105, 99, 94, 92, 97, 103, 107, 109],
      special: { 13: { o: 94.5, h: 95, l: 89, c: 92.5 } },
      levels: [{ y: 110, label: 'Range high', color: GREY }, { y: 91, label: 'Range low', color: GREY }],
      entryIdx: 14, entry: 94, stop: 87.5, targetR: 2.3,
      steps: ['Price oscillates between a clear high and low.', 'At the range low, sellers fail and a rejection candle appears.', 'Entry near the low; stop under the range; target at the range high.'],
      marks: [{ i: 4, y: 113, n: 1 }, { i: 13, y: 85, n: 2 }, { i: 16, y: 112, n: 3 }],
    },
    generic: {
      label: 'Setup',
      closes: [80, 84, 82, 88, 86, 91, 89, 94, 92, 97, 101, 99, 104, 108, 106, 112, 116],
      special: {},
      levels: [],
      entryIdx: 8, entry: 92, stop: 85, targetR: 2,
      steps: ['Wait for the conditions written in the setup rules.', 'Enter when they are all met.', 'Stop where the idea is wrong; target at least 2R.'],
      marks: [{ i: 6, y: 96, n: 1 }, { i: 8, y: 83, n: 2 }, { i: 13, y: 113, n: 3 }],
    },
  };

  function candlesOf(tpl) {
    const rnd = Core.seededRandom(31);
    let prev = tpl.closes[0] - 2;
    return tpl.closes.map((c, i) => {
      const s = tpl.special[i]; if (s) { prev = s.c; return s; }
      const o = prev, span = Math.abs(c - o) * 0.35 + 1.2;
      prev = c;
      return { o, c, h: Math.max(o, c) + rnd() * span, l: Math.min(o, c) - rnd() * span };
    });
  }

  // Schematic candlestick chart of a pattern with entry, stop, target and numbered explanation marks
  function schematic(kind, { width = 620, height = 300, targetR } = {}) {
    const tpl = TEMPLATES[kind] || TEMPLATES.generic;
    const C = candlesOf(tpl), n = C.length;
    const risk = Math.abs(tpl.entry - tpl.stop), tR = targetR || tpl.targetR, target = tpl.entry + risk * tR;
    const volH = tpl.volume ? 38 : 0, top = 16, bottom = height - 22 - volH, left = 10, right = width - 92;
    const lo = Math.min(...C.map((k) => k.l), tpl.stop) - 3, hi = Math.max(...C.map((k) => k.h), target) + 3;
    const X = (i) => left + (i + 0.5) * ((right - left) / n), Y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const cw = Math.max(4, ((right - left) / n) * 0.56);
    let s = `<svg viewBox="0 0 ${width} ${height}" class="su-svg" role="img" aria-label="${svgEsc(tpl.label)} example chart">`;
    for (let g = 0; g <= 4; g++) { const y = top + (g * (bottom - top)) / 4; s += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#161616"/>`; }
    // risk / reward zones from the entry candle
    const x0 = X(tpl.entryIdx) - cw, x1 = right;
    s += `<rect x="${x0}" y="${Y(target)}" width="${x1 - x0}" height="${Y(tpl.entry) - Y(target)}" fill="${GREEN}" opacity="0.10"/>`;
    s += `<rect x="${x0}" y="${Y(tpl.entry)}" width="${x1 - x0}" height="${Y(tpl.stop) - Y(tpl.entry)}" fill="${RED}" opacity="0.10"/>`;
    // reference levels
    tpl.levels.forEach((l) => { s += `<line x1="${left}" x2="${right}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.color}" stroke-dasharray="5 4"/><text x="${right + 6}" y="${Y(l.y) + 4}" class="su-lbl">${svgEsc(l.label)}</text>`; });
    // moving average
    if (tpl.ema) {
      const k = 2 / (tpl.ema + 1); let e = C[0].c; const pts = C.map((c, i) => { e = i ? c.c * k + e * (1 - k) : e; return `${X(i)},${Y(e)}`; });
      s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${VIOLET}" stroke-width="1.6" opacity="0.8"/><text x="${right + 6}" y="${Y(e) + 4}" class="su-lbl" fill="${VIOLET}">Moving avg</text>`;
    }
    // candles
    C.forEach((k, i) => {
      const up = k.c >= k.o, col = up ? GREEN : RED, x = X(i);
      s += `<line x1="${x}" x2="${x}" y1="${Y(k.h)}" y2="${Y(k.l)}" stroke="${col}" stroke-width="1.2"/>`;
      s += `<rect x="${x - cw / 2}" y="${Y(Math.max(k.o, k.c))}" width="${cw}" height="${Math.max(1.5, Math.abs(Y(k.o) - Y(k.c)))}" fill="${col}" rx="1"/>`;
    });
    // volume
    if (tpl.volume) {
      const vb = height - 18;
      C.forEach((k, i) => { const v = (tpl.volume[i] || 0.6 + (Math.abs(k.c - k.o) / 12)) ; const h = Math.min(volH - 4, v * 11); s += `<rect x="${X(i) - cw / 2}" y="${vb - h}" width="${cw}" height="${h}" fill="${tpl.volume[i] ? VIOLET : '#2a2a2a'}"/>`; });
      s += `<text x="${right + 6}" y="${height - 22}" class="su-lbl">Volume</text>`;
    }
    // entry / stop / target
    const line = (v, color, label, dash) => `<line x1="${x0}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}" stroke="${color}" stroke-width="1.4" ${dash ? 'stroke-dasharray="4 3"' : ''}/><text x="${right + 6}" y="${Y(v) + 4}" class="su-lbl" fill="${color}">${label}</text>`;
    s += line(target, GREEN, `Target ${fmtR(tR)}`, true) + line(tpl.entry, '#e6e6e6', 'Entry', false) + line(tpl.stop, RED, 'Stop −1 R', true);
    s += `<path d="M${X(tpl.entryIdx)} ${Y(tpl.entry) + 16} l-6 9 h12 z" fill="#e6e6e6"/>`;
    // numbered explanation marks
    tpl.marks.forEach((m) => { s += `<circle cx="${X(m.i)}" cy="${Y(m.y)}" r="9" fill="#0b0b0b" stroke="${VIOLET}"/><text x="${X(m.i)}" y="${Y(m.y) + 4}" text-anchor="middle" class="su-num">${m.n}</text>`; });
    return s + '</svg>';
  }

  /* ---------- Small charts ---------- */
  function equitySvg(rs) {
    if (!rs.length) return '<p class="empty">No results yet.</p>';
    const W = 420, H = 150, pad = 14, pts = [0]; rs.forEach((r) => pts.push(pts[pts.length - 1] + r));
    const mn = Math.min(0, ...pts), mx = Math.max(0, ...pts), X = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, pts.length - 1), Y = (v) => H - pad - ((v - mn) * (H - 2 * pad)) / Math.max(1e-9, mx - mn);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg"><line x1="${pad}" x2="${W - pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2a2a2a" stroke-dasharray="3 4"/>`;
    s += `<polyline points="${pts.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="${VIOLET}" stroke-width="2"/>`;
    pts.forEach((v, i) => { if (i) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.2" fill="${rs[i - 1] >= 0 ? GREEN : RED}"/>`; });
    return s + '</svg>';
  }
  function distributionSvg(rs) {
    const B = Core.rBuckets(rs, 1);
    if (!B.length) return '<p class="empty">No results yet.</p>';
    const W = 420, H = 150, pad = 16, mx = Math.max(...B.map((b) => b.count)), bw = (W - 2 * pad) / B.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    B.forEach((b, i) => {
      const h = b.count ? Math.max(4, (b.count / mx) * (H - 2 * pad - 14)) : 0, x = pad + i * bw;
      s += `<rect x="${x + 3}" y="${H - pad - 12 - h}" width="${bw - 6}" height="${h}" rx="3" fill="${b.from < 0 ? RED : GREEN}" opacity="0.85"/>`;
      if (b.count) s += `<text x="${x + bw / 2}" y="${H - pad - 16 - h}" text-anchor="middle" class="su-lbl">${b.count}</text>`;
      s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="su-lbl">${b.from >= 0 ? '+' : ''}${b.from}R</text>`;
    });
    return s + '</svg>';
  }
  function rrBar(r) {
    if (r == null) return '';
    const w = Math.min(100, Math.abs(r) * 25);
    return `<span class="su-rr"><span style="width:${w}%;background:${r >= 0 ? GREEN : RED};${r >= 0 ? 'left:50%' : `right:50%`}"></span></span>`;
  }

  /* ---------- Trade card (on trade notes) ---------- */
  function tradeCard(p, name) {
    const g = Core.tradeGeometry({ entry: p.props.entry, stop: p.props.stop, exit: p.props.exit, side: p.props.side });
    if (!g) return '';
    const W = 640, H = 170, left = 12, right = W - 150, top = 14, bottom = H - 14, dir = g.side === 'LONG' ? 1 : -1;
    const tgt = g.exit != null && g.r > 0 ? g.exit : g.entry + dir * g.risk * 2;
    const vals = [g.entry, g.stop, tgt].concat(g.exit != null ? [g.exit] : []);
    const lo = Math.min(...vals) - g.risk * 0.4, hi = Math.max(...vals) + g.risk * 0.4;
    const Y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top), xE = left + 90;
    // a small price path from the entry to the exit (or to where it is now), deterministic per note
    const rnd = Core.seededRandom([...String(name)].reduce((a, c) => a + c.charCodeAt(0), 7)), end = g.exit != null ? g.exit : g.entry;
    const path = [[left, Y(g.entry - dir * g.risk * 0.3)], [xE, Y(g.entry)]];
    for (let i = 1; i <= 7; i++) { const t = i / 8; path.push([xE + t * (right - xE), Y(g.entry + (end - g.entry) * t + (rnd() - 0.5) * g.risk * 0.5 * (1 - t))]); }
    path.push([right, Y(end)]);
    const lbl = (v, color, text) => `<line x1="${xE}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}" stroke="${color}" stroke-width="1.3" stroke-dasharray="4 3"/><text x="${right + 8}" y="${Y(v) + 4}" class="su-lbl" fill="${color}">${text}</text>`;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg" role="img" aria-label="Trade: entry, stop and exit">`;
    s += `<rect x="${xE}" y="${Math.min(Y(g.entry), Y(tgt))}" width="${right - xE}" height="${Math.abs(Y(tgt) - Y(g.entry))}" fill="${GREEN}" opacity="0.12"/>`;
    s += `<rect x="${xE}" y="${Math.min(Y(g.entry), Y(g.stop))}" width="${right - xE}" height="${Math.abs(Y(g.stop) - Y(g.entry))}" fill="${RED}" opacity="0.12"/>`;
    s += lbl(g.stop, RED, `Stop ${g.stop} · −1 R`) + lbl(g.entry, '#e6e6e6', `Entry ${g.entry}`);
    if (g.exit != null) s += lbl(g.exit, g.r >= 0 ? GREEN : RED, `Exit ${g.exit} · ${fmtR(g.r)}`);
    else s += lbl(tgt, GREEN, `2R target ${Math.round(tgt * 1e4) / 1e4}`);
    s += `<polyline points="${path.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${VIOLET}" stroke-width="2"/>`;
    s += `<circle cx="${xE}" cy="${Y(g.entry)}" r="4" fill="#e6e6e6"/>`;
    if (g.exit != null) s += `<circle cx="${right}" cy="${Y(g.exit)}" r="4" fill="${g.r >= 0 ? GREEN : RED}"/>`;
    s += `<text x="${left}" y="${top + 6}" class="su-lbl">${g.side} · risk ${Math.round(g.risk * 1e4) / 1e4}</text></svg>`;
    return `<div class="su-trade">${s}</div>`;
  }

  /* ---------- View ---------- */
  function show(name) {
    const list = allSetups();
    if (name) selected = name;
    if (!selected || !list.some((s) => s.name === selected)) selected = list.length ? list[0].name : null;
    const host = $('setups');
    if (!list.length) {
      host.innerHTML = `<h1>Setups</h1><p class="sub">No setup yet. Create a note with <code>type: setup</code> (for example "Breakout") and link your trades to it with <code>setup: Breakout</code>.</p>`;
      return;
    }
    const s = list.find((x) => x.name === selected), P = allParsed();
    const noteP = s.note ? P[s.note] : null, sec = Core.setupSections(noteP ? noteP.body : '');
    const kind = Core.setupTemplate(s.name, sec.description + ' ' + sec.rules.join(' '));
    const tpl = TEMPLATES[kind];
    const wins = s.rs.filter((r) => r > 0), avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
    const longs = s.trades.filter((n) => (P[n].props.side || '').toUpperCase() === 'LONG'), shorts = s.trades.filter((n) => (P[n].props.side || '').toUpperCase() === 'SHORT');
    const wr = (ns) => { const r = ns.map((n) => rOf(P[n])).filter((x) => x != null); return r.length ? Math.round((r.filter((x) => x > 0).length / r.length) * 100) + '%' : '—'; };
    // mistakes and emotions linked from this setup's trades
    const mistakes = {};
    s.trades.forEach((n) => P[n].links.forEach((l) => { if (P[l] && P[l].type === 'emotion') mistakes[l] = (mistakes[l] || 0) + 1; }));
    const trades = s.trades.slice().sort((a, b) => noteDate(b, P[b]).localeCompare(noteDate(a, P[a])));
    const sorted = s.trades.slice().sort((a, b) => noteDate(a, P[a]).localeCompare(noteDate(b, P[b]))).map((n) => rOf(P[n])).filter((r) => r != null);

    host.innerHTML = `
      <div class="su-layout">
        <aside class="su-list">
          <div class="su-list-h">SETUPS</div>
          ${list.map((x) => `<button class="su-item ${x.name === selected ? 'on' : ''}" data-s="${svgEsc(x.name)}">
            <span>${svgEsc(x.name)}</span><small>${x.trades.length} trade${x.trades.length === 1 ? '' : 's'} · ${x.st.count ? x.st.winrate + '%' : '—'}</small></button>`).join('')}
        </aside>
        <section class="su-main">
          <div class="su-head">
            <div><h1>${svgEsc(s.name)}</h1><div class="sub">${svgEsc(sec.description || 'Add a description and a "## Rules" list to the setup note to explain it here.')}</div></div>
            ${s.note ? `<button class="tbtn" data-n="${svgEsc(s.note)}">Open note</button>` : `<button class="tbtn" data-n="${svgEsc(s.name)}">Create note</button>`}
          </div>
          <div class="su-grid">
            <div class="card su-card">
              <div class="su-card-h"><h3>How it looks</h3><span class="chip on">${svgEsc(tpl.label)} pattern</span></div>
              ${schematic(kind, { targetR: kind === 'reversal' ? undefined : avgWin ? Math.max(1, Math.min(4, avgWin)) : undefined })}
              <ol class="su-steps">${tpl.steps.map((t) => `<li>${svgEsc(t)}</li>`).join('')}</ol>
              <div class="note">Schematic example of the pattern, not real prices${avgWin && kind !== 'reversal' ? ` · target set to your average win (${fmtR(avgWin)})` : ''}.</div>
            </div>
            <div class="card su-card">
              <h3>Rules</h3>
              ${sec.rules.length ? `<ol class="su-rules">${sec.rules.map((r) => `<li>${inline(r)}</li>`).join('')}</ol>` : '<p class="empty">No rules yet. Add a "## Rules" list to the setup note.</p>'}
              <h3 style="margin-top:18px">Common mistakes</h3>
              ${Object.keys(mistakes).length ? `<div class="su-chips">${Object.entries(mistakes).sort((a, b) => b[1] - a[1]).map(([m, c]) => `<a class="chip" data-n="${svgEsc(m)}">${svgEsc(m)} · ${c}</a>`).join('')}</div>` : '<p class="empty">No emotion or mistake linked from these trades.</p>'}
            </div>
          </div>
          <div class="cards">
            <div class="card"><div class="l">Trades</div><div class="v">${s.trades.length}</div></div>
            <div class="card"><div class="l">Win rate</div><div class="v">${s.st.count ? s.st.winrate + '%' : '—'}</div></div>
            <div class="card"><div class="l">Total</div><div class="v" style="color:${s.st.total >= 0 ? 'var(--win)' : 'var(--loss)'}">${s.st.count ? fmtR(s.st.total) : '—'}</div></div>
            <div class="card"><div class="l">Average R</div><div class="v">${fmtR(s.st.avg)}</div></div>
            <div class="card"><div class="l">Profit factor</div><div class="v">${s.st.profitFactor ?? '—'}</div></div>
            <div class="card"><div class="l">Long / short win rate</div><div class="v" style="font-size:20px">${wr(longs)} / ${wr(shorts)}</div></div>
          </div>
          <div class="su-grid2">
            <div class="card su-card"><h3>Equity curve</h3>${equitySvg(sorted)}</div>
            <div class="card su-card"><h3>Result distribution</h3>${distributionSvg(s.rs)}</div>
          </div>
          <h3 style="margin:22px 0 8px">Trades</h3>
          ${trades.length ? `<table><tr><th>Date</th><th>Trade</th><th>Asset</th><th>Side</th><th>Result</th><th></th></tr>
            ${trades.map((n) => { const p = P[n], r = rOf(p); return `<tr class="click" data-n="${svgEsc(n)}"><td>${noteDate(n, p)}</td><td>${svgEsc(n)}</td><td>${svgEsc(p.props.asset || '')}</td><td>${svgEsc(p.props.side || '')}</td><td style="color:${r == null ? 'var(--tx3)' : r >= 0 ? 'var(--win)' : 'var(--loss)'}">${fmtR(r)}</td><td style="width:160px">${rrBar(r)}</td></tr>`; }).join('')}
          </table>` : '<p class="empty">No trade uses this setup yet.</p>'}
        </section>
      </div>`;
    host.querySelectorAll('.su-item').forEach((b) => (b.onclick = () => show(b.dataset.s)));
  }

  return { show, tradeCard, schematic };
})();
