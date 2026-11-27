/* Whale — the terminal's other views (Analysis tab): Company (SEC filings), News, Grid of charts, Macro (rates, risk
   gauges, US economy from FRED), Screener, Correlation matrix, and the Data sources window for the user's own keys. */
window.Desk = (() => {
  const U = () => Analysis.util;
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : Object.assign(Array.isArray(d) ? [] : {}, d, v); } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const timeAgo = (t) => { if (!t) return ''; const s = (Date.now() - t) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const go = (fn, symbol) => Analysis.go({ fn, symbol });
  // each render gets a token, so an older request that finishes late never overwrites a newer view
  const begin = (el) => (el._tok = {});
  const alive = (el, tok) => el._tok === tok;
  const tile = (label, value, sub, attrs = '') => `<div class="dk-tile"${attrs}><div class="l">${label}</div><div class="v">${value}</div>${sub != null ? `<div class="s">${sub}</div>` : ''}</div>`;
  const kindLabel = { fx: 'a currency pair', crypto: 'a cryptocurrency', future: 'a futures contract', index: 'an index', stock: 'a stock' };

  /* ---------- Company: SEC filings ---------- */
  const cikCache = new Map(), factsCache = new Map();
  async function company(el, sym, cur) {
    const tok = begin(el), kind = Market.kindOf(sym), name = Market.displayName(sym);
    const head = (sub) => `<div class="dk-h"><h2>${esc(name)}</h2><span class="dk-sub">${sub}</span><div class="dk-right"><button class="an-ghost" data-go="chart">Chart</button><button class="an-ghost" data-go="news">News</button></div></div>`;
    const bindHead = () => el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go, sym)));
    if (kind !== 'stock') {
      el.innerHTML = `<div class="dk">${head('Company data')}<p class="dk-msg">Company results come from the filings US-listed companies send to the SEC, so this view is for stocks such as AAPL, MSFT or NVDA. ${esc(sym)} is ${kindLabel[kind]}.</p></div>`;
      return bindHead();
    }
    el.innerHTML = `<div class="dk">${head('Loading the SEC filings…')}</div>`; bindHead();
    try {
      let hit = cikCache.get(sym);
      if (!hit) { hit = Market.parseSecSearch(JSON.parse(await Store.market(Market.secSearchUrl(sym))), sym); if (hit) cikCache.set(sym, hit); }
      if (!hit) throw new Error(`No SEC filings found for ${sym}. Only companies listed in the US file with the SEC.`);
      let f = factsCache.get(hit.cik);
      if (!f) { f = Market.parseSecFacts(JSON.parse(await Store.market(Market.secFactsUrl(hit.cik)))); factsCache.set(hit.cik, f); }
      let price = cur && cur.meta.symbol === sym && !cur.demo ? cur.candles[cur.candles.length - 1].close : null;
      if (price == null) { try { const d = await U().fetchSeries(sym, '1M'); if (!d.demo) price = d.candles[d.candles.length - 1].close; } catch (e) {} }
      if (!alive(el, tok)) return;
      renderCompany(el, sym, f, price, head);
      bindHead();
    } catch (e) {
      if (!alive(el, tok)) return;
      el.innerHTML = `<div class="dk">${head('Company data')}<p class="dk-msg">${esc(Store.desktop ? e.message || e : 'Company data from the SEC works in the desktop app.')}</p></div>`;
      bindHead();
    }
  }
  function renderCompany(el, sym, f, price, head) {
    const { fmt, pct, sgn, fmtBig } = U(), r = Market.fundamentals(f, price), b = f.balance;
    const lastEnd = [f.years, f.quarters].flat().reduce((m, x) => (x.end > m ? x.end : m), '');
    const ly = f.years[f.years.length - 1];
    el.innerHTML = `<div class="dk">${head(`${esc(f.name || sym)} · ${esc(sym)} · CIK ${f.cik} · latest period ${esc(lastEnd)}`)}
      <div class="dk-tiles">
        ${tile('Price', fmt(price))}${tile('Market cap', fmtBig(r.marketCap))}${tile('P/E (TTM)', fmt(r.pe, 1))}${tile('Price / sales', fmt(r.ps, 1))}
        ${tile('Revenue (TTM)', fmtBig(f.ttm.revenue))}${tile('Net income (TTM)', fmtBig(f.ttm.netIncome))}${tile('EPS (TTM)', fmt(f.ttm.eps, 2))}${tile('Revenue growth', `<span class="${r.revenueGrowth >= 0 ? 'up' : 'dn'}">${sgn(r.revenueGrowth, 1)}</span>`, 'last fiscal year')}
        ${tile('Gross margin', pct(r.grossMargin, 1))}${tile('Operating margin', pct(r.opMargin, 1))}${tile('Net margin', pct(r.netMargin, 1))}${tile('Return on equity', pct(r.roe, 1))}
        ${tile('Debt / equity', fmt(r.debtToEquity, 2))}${tile('Cash', fmtBig(b.cash && b.cash.value))}${tile('Free cash flow', fmtBig(r.fcf), ly ? 'FY ' + ly.end.slice(0, 4) : '')}${tile('Shares', fmtBig(f.shares))}
      </div>
      <div class="dk-grid2">
        <div class="dk-card"><h3>Quarterly revenue and net income</h3>${barsSvg(f.quarters, (q) => q.end.slice(2, 7) + (q.derived ? '*' : ''))}</div>
        <div class="dk-card"><h3>Yearly revenue and net income</h3>${barsSvg(f.years, (y) => 'FY' + y.end.slice(2, 4))}</div>
      </div>
      <div class="dk-card"><h3>Results by fiscal year</h3>${yearsTable(f.years)}</div>
      <p class="dk-src">Source: SEC EDGAR (10-K and 10-Q filings). TTM = ${f.ttmFromQuarters ? 'last four quarters' : 'last fiscal year'}. Quarters marked * are the year minus its first three quarters. Not investment advice.</p>
    </div>`;
  }
  function barsSvg(rows, label) {
    const { fmtBig } = U();
    if (!rows.length) return '<p class="dk-msg">No data in the filings.</p>';
    const W = 560, H = 200, left = 6, vals = rows.flatMap((r) => [r.revenue || 0, r.netIncome || 0]), max = Math.max(...vals, 0), min = Math.min(...vals, 0), span = max - min || 1;
    const Y = (v) => 22 + ((max - v) / span) * (H - 50), zero = Y(0), bw = (W - left) / rows.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg"><line x1="0" x2="${W}" y1="${zero}" y2="${zero}" stroke="#222"/>`;
    rows.forEach((r, i) => {
      const x = left + i * bw + bw * 0.14, w = bw * 0.34, op = r.derived ? 0.55 : 0.9;
      const bar = (v, c, dx) => `<rect x="${x + dx}" y="${Math.min(Y(v), zero)}" width="${w}" height="${Math.max(1, Math.abs(Y(v) - zero))}" fill="${c}" opacity="${op}" rx="2"/>`;
      if (r.revenue != null) s += bar(r.revenue, '#8b7cf6', 0) + `<text x="${x + w / 2}" y="${Math.min(Y(r.revenue), zero) - 5}" text-anchor="middle" class="su-lbl" style="font-size:9.5px">${fmtBig(r.revenue)}</text>`;
      if (r.netIncome != null) s += bar(r.netIncome, r.netIncome >= 0 ? '#3fb950' : '#f85149', w + 2);
      s += `<text x="${x + w + 1}" y="${H - 8}" text-anchor="middle" class="su-lbl">${esc(label(r))}</text>`;
    });
    return s + `</svg><div class="yc-legend"><span><i style="background:#8b7cf6"></i>Revenue</span><span><i style="background:#3fb950"></i>Net income</span></div>`;
  }
  function yearsTable(years) {
    const { fmtBig, fmt, pct } = U(), ys = years.slice(-6);
    if (!ys.length) return '<p class="dk-msg">No yearly data in the filings.</p>';
    const rowsDef = [
      ['Revenue', (y) => fmtBig(y.revenue)], ['Gross profit', (y) => fmtBig(y.grossProfit)], ['Operating income', (y) => fmtBig(y.opIncome)],
      ['Net income', (y) => fmtBig(y.netIncome)], ['EPS (diluted)', (y) => fmt(y.eps, 2)], ['Net margin', (y) => (y.revenue ? pct(y.netIncome / y.revenue, 1) : '—')],
      ['Operating cash flow', (y) => fmtBig(y.ocf)], ['Capital expenditure', (y) => fmtBig(y.capex)], ['Free cash flow', (y) => (y.ocf != null ? fmtBig(y.ocf - (y.capex || 0)) : '—')],
    ];
    return `<table class="dk-table"><tr><th>Fiscal year</th>${ys.map((y) => `<th>${esc(y.end.slice(0, 7))}</th>`).join('')}</tr>${rowsDef.map(([l, f]) => `<tr><td>${l}</td>${ys.map((y) => `<td>${f(y)}</td>`).join('')}</tr>`).join('')}</table>`;
  }

  /* ---------- News ---------- */
  const newsCache = new Map();
  async function news(el, sym, cur) {
    const tok = begin(el), key = sym || '__market';
    const title = sym ? Market.displayName(sym) : 'Markets';
    const head = `<div class="dk-h"><h2>${esc(title)} news</h2><span class="dk-sub">Yahoo Finance and Google News, newest first</span>
      <div class="dk-right"><div class="an-seg">${sym ? `<button class="on" data-scope="symbol">${esc(title)}</button>` : `<button data-scope="symbol">${esc(Market.displayName(Analysis.util.current() ? Analysis.util.current().meta.symbol : 'BTC-USD'))}</button>`}<button class="${sym ? '' : 'on'}" data-scope="market">Markets</button></div>
      <button class="an-ghost" id="nwReload">Refresh</button></div></div>`;
    const bind = () => {
      el.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => Analysis.go({ fn: b.dataset.scope === 'market' ? 'topnews' : 'news' })));
      if ($('nwReload')) $('nwReload').onclick = () => { newsCache.delete(key); news(el, sym, cur); };
      el.querySelectorAll('[data-url]').forEach((a) => (a.onclick = () => Store.openUrl(a.dataset.url)));
    };
    const cached = newsCache.get(key);
    if (cached && Date.now() - cached.at < 5 * 60000) { el.innerHTML = `<div class="dk">${head}${list(cached.items)}</div>`; return bind(); }
    el.innerHTML = `<div class="dk">${head}<p class="dk-msg">Loading the news…</p></div>`; bind();
    const kind = sym ? Market.kindOf(sym) : null;
    const name = cur && cur.meta.symbol === sym && cur.meta.name && !cur.demo ? cur.meta.name : Market.displayName(sym || '');
    const q = !sym ? 'stock market' : kind === 'fx' ? `${sym.slice(0, 3)} ${sym.slice(3, 6)} forex` : kind === 'crypto' ? `${name} crypto` : kind === 'stock' ? `${name} stock` : `${name} market`;
    const reqs = [Store.market(Market.googleNewsUrl(q)).then((x) => Market.parseRss(x, 'google'))];
    if (!sym) reqs.push(Store.market(Market.yahooNewsUrl('^GSPC')).then((x) => Market.parseRss(x, 'yahoo')));
    else if (kind !== 'fx') reqs.push(Store.market(Market.yahooNewsUrl(sym)).then((x) => Market.parseRss(x, 'yahoo')));
    const res = await Promise.allSettled(reqs);
    if (!alive(el, tok)) return;
    const items = Market.mergeNews(res.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    if (items.length) newsCache.set(key, { at: Date.now(), items });
    el.innerHTML = `<div class="dk">${head}${items.length ? list(items) : `<p class="dk-msg">${Store.desktop ? 'The news sources did not answer. Try again in a moment.' : 'News works in the desktop app.'}</p>`}</div>`;
    bind();
  }
  const list = (items) => items.map((n) => `<div class="nw-item"><div class="nw-meta"><b>${esc(n.source || 'News')}</b><span>${timeAgo(n.time)}</span></div>
    <a class="nw-title" data-url="${esc(n.link)}" title="Open in your browser">${esc(n.title)}</a>${n.desc ? `<div class="nw-desc">${esc(n.desc)}</div>` : ''}</div>`).join('') + '<p class="dk-src">Articles open in your web browser.</p>';

  /* ---------- Grid: several charts side by side ---------- */
  let gridCharts = [];
  function leave(tab) { if (tab !== 'grid') { gridCharts.forEach((c) => { try { c.remove(); } catch (e) {} }); gridCharts = []; } }
  function miniChart(box) {
    const LC = window.LightweightCharts;
    return LC.createChart(box, {
      autoSize: true,
      localization: { locale: LOCALE, priceFormatter: (p) => U().fmt(p) },
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8a91a8', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 10.5, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
      crosshair: { vertLine: { color: 'rgba(255,255,255,0.2)', style: 3, labelBackgroundColor: '#1b1f33' }, horzLine: { color: 'rgba(255,255,255,0.2)', style: 3, labelBackgroundColor: '#1b1f33' } },
    });
  }
  function grid(el) {
    leave(null);
    const st = read('whale-grid', { n: 4, tf: '6M', syms: [] }), watch = Watch.list();
    const syms = Array.from({ length: st.n }, (_, i) => st.syms[i] || watch[i] || Market.DEFAULT_WATCH[i]);
    const cols = st.n === 6 ? 3 : 2, rows = st.n === 2 ? 1 : 2;
    el.innerHTML = `<div class="gr-top"><div class="an-seg">${[2, 4, 6].map((n) => `<button data-n="${n}" class="${n === st.n ? 'on' : ''}">${n} charts</button>`).join('')}</div>
      <div class="an-seg">${['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'].map((t) => `<button data-gtf="${t}" class="${t === st.tf ? 'on' : ''}">${t}</button>`).join('')}</div>
      <span class="dk-sub" style="margin-left:auto">Click a chart's symbol to change it</span></div>
      <div class="gr" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))">${syms.map((s, i) => `<div class="gr-cell">
        <div class="gr-h"><input value="${esc(s)}" data-i="${i}" spellcheck="false" title="Type a symbol and press Enter"><span class="gr-px" id="grPx${i}">…</span><a class="gr-open" data-sym="${esc(s)}">Open ↗</a></div>
        <div class="gr-chart" id="grC${i}"></div></div>`).join('')}</div>`;
    el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { st.n = +b.dataset.n; write('whale-grid', st); grid(el); }));
    el.querySelectorAll('[data-gtf]').forEach((b) => (b.onclick = () => { st.tf = b.dataset.gtf; write('whale-grid', st); grid(el); }));
    el.querySelectorAll('.gr-open').forEach((a) => (a.onclick = () => go('chart', a.dataset.sym)));
    el.querySelectorAll('.gr-h input').forEach((inp) => (inp.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const s = Market.normalizeSymbol(inp.value); if (!s) return;
      st.syms = syms.slice(); st.syms[+inp.dataset.i] = s; write('whale-grid', st); grid(el);
    }));
    const { COLORS, rgba, fmt, sgn } = U();
    syms.forEach(async (s, i) => {
      const chart = miniChart($('grC' + i)); gridCharts.push(chart);
      const area = chart.addAreaSeries({ lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 3 });
      try {
        const d = await U().fetchSeries(s, st.tf);
        if (!gridCharts.includes(chart)) return;
        const c = d.candles, up = c[c.length - 1].close >= c[0].open, tone = up ? COLORS.up : COLORS.down;
        area.applyOptions({ lineColor: tone, topColor: rgba(tone, 0.18), bottomColor: rgba(tone, 0) });
        area.setData(c.map((k) => ({ time: k.time, value: k.close })));
        chart.applyOptions({ timeScale: { timeVisible: Market.tf(st.tf).interval.endsWith('m') } });
        chart.timeScale().fitContent();
        $('grPx' + i).innerHTML = `${fmt(c[c.length - 1].close)} <span class="${up ? 'up' : 'dn'}">${sgn(c[c.length - 1].close / c[0].open - 1)}</span>${d.demo ? ' <span class="wl-demo">demo</span>' : ''}`;
      } catch (e) { if ($('grPx' + i)) $('grPx' + i).innerHTML = '<span class="dn">no data</span>'; }
    });
  }

  /* ---------- Macro ---------- */
  async function macro(el) {
    const tok = begin(el);
    el.innerHTML = `<div class="dk"><div class="dk-h"><h2>Macro</h2><span class="dk-sub">Rates, risk gauges and the US economy</span><div class="dk-right"><button class="an-ghost" id="mcSrc">Data sources</button></div></div>
      <div id="mcMarkets"><p class="dk-msg">Loading the markets…</p></div><div id="mcEco"></div></div>`;
    $('mcSrc').onclick = dataSources;
    const syms = [...new Set(Market.RATES.map((r) => r.sym).concat(Market.GAUGES.map((g) => g.sym)))];
    const got = await U().fetchMany(syms, '1y');
    if (!alive(el, tok)) return;
    const { fmt, sgn } = U(), closes = (s) => (got[s] ? got[s].candles.map((k) => k.close) : []);
    const at = (s, back) => { const c = closes(s); return c.length > back ? c[c.length - 1 - back] : null; };
    const anyDemo = syms.some((s) => got[s] && got[s].demo);
    $('mcMarkets').innerHTML = `<div class="dk-grid2">
        <div class="dk-card"><h3>US yield curve</h3>${curveSvg(Market.RATES.map((r) => ({ name: r.name, now: at(r.sym, 0), m1: at(r.sym, 21), y1: at(r.sym, 250) })))}</div>
        <div class="dk-card"><h3>Curve signals</h3><div class="dk-tiles" style="margin:0">
          ${tile('10Y − 3M spread', at('^TNX', 0) != null && at('^IRX', 0) != null ? fmt(at('^TNX', 0) - at('^IRX', 0), 2) + ' pts' : '—', at('^TNX', 0) - at('^IRX', 0) < 0 ? '<span class="dn">inverted: often seen before recessions</span>' : 'normal: long rates above short rates')}
          ${tile('10Y yield, 1 month', at('^TNX', 0) != null && at('^TNX', 21) != null ? `${(at('^TNX', 0) - at('^TNX', 21) >= 0 ? '+' : '') + fmt((at('^TNX', 0) - at('^TNX', 21)) * 100, 0)} bp` : '—', 'change in basis points')}
          ${tile('VIX', fmt(at('^VIX', 0), 1), at('^VIX', 0) > 25 ? '<span class="dn">high fear</span>' : at('^VIX', 0) < 15 ? 'calm markets' : 'normal')}
        </div></div></div>
      <div class="dk-tiles">${Market.GAUGES.map((g) => { const c = closes(g.sym), m = c.length > 21 ? c[c.length - 1] / c[c.length - 22] - 1 : null;
        return tile(esc(g.name), c.length ? fmt(c[c.length - 1]) : '—', `<span class="${m >= 0 ? 'up' : 'dn'}">${m != null ? sgn(m) + ' 1M' : ''}</span>${U().sparkSvg(c.slice(-120), 70, 22)}`, ` class="dk-tile click" data-sym="${esc(g.sym)}"`); }).join('')}</div>
      ${anyDemo ? '<p class="dk-src">Some markets show demo data: live prices for indices, rates and commodities work in the desktop app.</p>' : ''}`;
    $('mcMarkets').querySelectorAll('[data-sym]').forEach((t) => (t.onclick = () => go('chart', t.dataset.sym)));
    economy(el, tok);
  }
  function curveSvg(pts) {
    const { fmt } = U(), all = pts.flatMap((p) => [p.now, p.m1, p.y1]).filter((v) => v != null);
    if (!all.length) return '<p class="dk-msg">No rates data.</p>';
    const W = 520, H = 190, lo = Math.min(...all) - 0.2, hi = Math.max(...all) + 0.2, X = (i) => 40 + i * ((W - 80) / (pts.length - 1)), Y = (v) => 16 + ((hi - v) / (hi - lo)) * (H - 46);
    const line = (key, color, dash) => { const p = pts.map((x, i) => (x[key] != null ? `${X(i)},${Y(x[key])}` : null)).filter(Boolean); return p.length > 1 ? `<polyline points="${p.join(' ')}" fill="none" stroke="${color}" stroke-width="${key === 'now' ? 2.2 : 1.4}"${dash ? ' stroke-dasharray="4 4"' : ''}/>` : ''; };
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">` + line('y1', '#444', true) + line('m1', '#777', true) + line('now', '#a68bff');
    pts.forEach((p, i) => { s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="su-lbl">${p.name}</text>`; if (p.now != null) s += `<circle cx="${X(i)}" cy="${Y(p.now)}" r="3.5" fill="#a68bff"/><text x="${X(i)}" y="${Y(p.now) - 9}" text-anchor="middle" class="su-num">${fmt(p.now, 2)}%</text>`; });
    return s + `</svg><div class="yc-legend"><span><i style="background:#a68bff"></i>Today</span><span><i style="background:#777"></i>1 month ago</span><span><i style="background:#444"></i>1 year ago</span></div>`;
  }
  async function economy(el, tok) {
    const box = $('mcEco'); if (!box) return;
    if (!U().keys().fred) {
      box.innerHTML = `<div class="dk-card" style="margin-top:4px"><h3>US economy (FRED)</h3><p style="margin:0 0 10px;color:var(--tx2);font-size:13.5px">Inflation, unemployment, Fed rate, GDP growth, jobless claims, credit spreads and more, from the St. Louis Fed. It needs your own free FRED key: create an account, copy the key, and paste it in Data sources.</p>
        <div class="an-btns"><button class="an-ghost ai" id="ecoGet">Get a free key</button><button class="an-ghost" id="ecoAdd">Add my key</button></div></div>`;
      $('ecoGet').onclick = () => Store.openUrl('https://fredaccount.stlouisfed.org/apikeys');
      $('ecoAdd').onclick = dataSources;
      return;
    }
    box.innerHTML = '<p class="dk-msg">Loading the US economy from FRED…</p>';
    const start = new Date(Date.now() - 11 * 365 * 86400000).toISOString().slice(0, 10);
    const res = await Promise.allSettled(Market.MACRO.map((m) => Store.marketKeyed('fred', Market.fredUrl(m.id, start)).then((t) => Market.parseFred(JSON.parse(t), m))));
    if (!alive(el, tok)) return;
    const { fmt } = U();
    const tiles = Market.MACRO.map((m, i) => {
      const r = res[i]; if (r.status !== 'fulfilled' || !r.value.length) return tile(esc(m.name), '—', 'not available');
      const v = r.value, last = v[v.length - 1], prev = v[v.length - 2], d = prev ? last.value - prev.value : null;
      return tile(esc(m.name), `${fmt(last.value, 2)} <small style="font-size:11px;color:var(--tx3)">${esc(m.unit)}</small>`, `<span>${esc(last.date)}${d != null ? ` · <span class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : ''}${fmt(d, 2)}</span>` : ''}</span>${U().sparkSvg(v.slice(-60).map((x) => x.value), 70, 22, '#a68bff')}`);
    });
    const failed = res.every((r) => r.status === 'rejected');
    box.innerHTML = `<div class="dk-h" style="margin-top:8px"><h2 style="font-size:16px">US economy</h2><span class="dk-sub">FRED, Federal Reserve Bank of St. Louis</span></div>` +
      (failed ? `<p class="dk-msg">FRED did not answer: ${esc(res[0].reason && (res[0].reason.message || res[0].reason))}</p>` : `<div class="dk-tiles">${tiles.join('')}</div>`);
  }

  /* ---------- Screener ---------- */
  const FILTERS = [
    ['', 'All'], ['oversold', 'Oversold (RSI < 30)'], ['overbought', 'Overbought (RSI > 70)'], ['above200', 'Above SMA 200'], ['below200', 'Below SMA 200'],
    ['high', 'Near 52-week high'], ['movers', 'Big movers today'],
  ];
  const pass = (r, f) => !f || (f === 'oversold' ? r.rsi < 30 : f === 'overbought' ? r.rsi > 70 : f === 'above200' ? r.vsSma200 > 0 : f === 'below200' ? r.vsSma200 < 0 : f === 'high' ? r.fromHigh > -0.05 : f === 'movers' ? Math.abs(r.chg1d) > 0.03 : true);
  const scrCache = new Map();
  async function screener(el) {
    const tok = begin(el), st = read('whale-screener', { uni: 'US mega caps', sort: 'chg1d', dir: -1, filter: '' });
    const unis = Object.assign({ Watchlist: Watch.list() }, Market.UNIVERSES);
    if (!unis[st.uni]) st.uni = 'US mega caps';
    const syms = unis[st.uni];
    const head = `<div class="dk-h"><h2>Screener</h2><span class="dk-sub">${syms.length} markets · daily data</span><div class="dk-right"><div class="an-seg">${Object.keys(unis).map((u) => `<button data-uni="${esc(u)}" class="${u === st.uni ? 'on' : ''}">${esc(u)}</button>`).join('')}</div></div></div>
      <div class="dk-bar">${FILTERS.map(([k, l]) => `<button class="chip${st.filter === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>`;
    const bindTop = () => {
      el.querySelectorAll('[data-uni]').forEach((b) => (b.onclick = () => { st.uni = b.dataset.uni; write('whale-screener', st); screener(el); }));
      el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; write('whale-screener', st); screener(el); }));
    };
    const key = st.uni + '|' + syms.join(',');
    let rows = scrCache.get(key);
    if (!rows || Date.now() - rows.at > 5 * 60000) {
      el.innerHTML = `<div class="dk">${head}<p class="dk-msg" id="scrProg">Loading ${syms.length} markets…</p></div>`; bindTop();
      const got = await U().fetchMany(syms, '1y', (n, t) => { if (alive(el, tok) && $('scrProg')) $('scrProg').textContent = `Loading ${n} / ${t} markets…`; });
      if (!alive(el, tok)) return;
      rows = { at: Date.now(), list: syms.map((s) => { const d = got[s]; if (!d || d.candles.length < 2) return null; const m = Quant.metrics(d.candles, Market.tradingDays(Market.kindOf(s))); return m && Object.assign({ sym: s, demo: d.demo, closes: d.candles.slice(-60).map((k) => k.close) }, m); }).filter(Boolean) };
      scrCache.set(key, rows);
    }
    const { fmt, pct, sgn } = U(), cols = [
      ['sym', 'Market'], ['last', 'Last'], ['chg1d', '1D'], ['chg1w', '1W'], ['chg1m', '1M'], ['ytd', 'YTD'], ['vol', 'Vol (ann.)'], ['rsi', 'RSI 14'], ['vsSma200', 'vs SMA 200'], ['fromHigh', 'From 52w high'], ['z', 'Z-score 20'],
    ];
    const shown = rows.list.filter((r) => pass(r, st.filter)).sort((a, b) => {
      const x = a[st.sort], y = b[st.sort];
      if (st.sort === 'sym') return st.dir * String(x).localeCompare(String(y));
      return st.dir * ((x == null || !isFinite(x) ? -Infinity : x) - (y == null || !isFinite(y) ? -Infinity : y));
    });
    const chg = (v) => `<span class="${v >= 0 ? 'up' : 'dn'}">${sgn(v, 1)}</span>`;
    el.innerHTML = `<div class="dk">${head}
      <table class="dk-table"><tr>${cols.map(([k, l]) => `<th class="sort${st.sort === k ? ' on' : ''}" data-sort="${k}">${l}${st.sort === k ? (st.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}<th>60 days</th></tr>
      ${shown.map((r) => `<tr class="click" data-sym="${esc(r.sym)}"><td><b>${esc(Market.displayName(r.sym))}</b> <small style="color:#555;font-family:var(--mono)">${esc(r.sym)}</small>${r.demo ? ' <span class="wl-demo">demo</span>' : ''}</td>
        <td>${fmt(r.last)}</td><td>${chg(r.chg1d)}</td><td>${chg(r.chg1w)}</td><td>${chg(r.chg1m)}</td><td>${chg(r.ytd)}</td><td>${pct(r.vol, 0)}</td>
        <td class="${r.rsi > 70 ? 'dn' : r.rsi < 30 ? 'up' : ''}">${fmt(r.rsi, 0)}</td><td>${chg(r.vsSma200)}</td><td>${pct(r.fromHigh, 1)}</td><td>${fmt(r.z, 2)}</td><td>${U().sparkSvg(r.closes, 80, 20)}</td></tr>`).join('')}</table>
      ${shown.length ? '' : '<p class="dk-msg">No market matches this filter.</p>'}
      <p class="dk-src">Click a column to sort, a row to open its chart. Vol = realized volatility over the last month, annualized. Not investment advice.</p></div>`;
    bindTop();
    el.querySelectorAll('[data-sort]').forEach((th) => (th.onclick = () => { const k = th.dataset.sort; st.dir = st.sort === k ? -st.dir : k === 'sym' ? 1 : -1; st.sort = k; write('whale-screener', st); screener(el); }));
    el.querySelectorAll('tr[data-sym]').forEach((tr) => (tr.onclick = () => go('chart', tr.dataset.sym)));
  }

  /* ---------- Correlation ---------- */
  async function corr(el) {
    const tok = begin(el), st = read('whale-corr', { uni: 'Watchlist' });
    const unis = Object.assign({ Watchlist: Watch.list() }, Market.UNIVERSES);
    if (!unis[st.uni]) st.uni = 'Watchlist';
    const syms = unis[st.uni].slice(0, 16);
    el.innerHTML = `<div class="dk"><div class="dk-h"><h2>Correlation</h2><span class="dk-sub">Daily returns over one year${unis[st.uni].length > 16 ? ' · first 16 markets' : ''}</span><div class="dk-right"><div class="an-seg">${Object.keys(unis).map((u) => `<button data-uni="${esc(u)}" class="${u === st.uni ? 'on' : ''}">${esc(u)}</button>`).join('')}</div></div></div><div id="cmBody"><p class="dk-msg">Loading ${syms.length} markets…</p></div></div>`;
    el.querySelectorAll('[data-uni]').forEach((b) => (b.onclick = () => { st.uni = b.dataset.uni; write('whale-corr', st); corr(el); }));
    const got = await U().fetchMany(syms, '1y');
    if (!alive(el, tok)) return;
    // demo prices are left out: their correlations would mean nothing
    const ok = syms.filter((s) => got[s] && !got[s].demo && got[s].candles.length > 30), left = syms.filter((s) => !ok.includes(s));
    if (ok.length < 2) { $('cmBody').innerHTML = `<p class="dk-msg">${Store.desktop ? 'Not enough data for these markets.' : 'Live prices for most markets work in the desktop app (crypto works here).'}</p>`; return; }
    const m = Quant.correlationMatrix(ok.map((s) => ({ sym: s, candles: got[s].candles, key: (t) => Market.dayKey(t, Market.kindOf(s)) })));
    const color = (c) => (c == null ? '#111' : c >= 0 ? `rgba(139,124,246,${0.12 + 0.75 * c})` : `rgba(248,81,73,${0.12 + 0.75 * -c})`);
    const pairs = [];
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) if (m.m[i][j] != null) pairs.push([ok[i], ok[j], m.m[i][j]]);
    pairs.sort((a, b) => b[2] - a[2]);
    const pairList = (ps) => ps.map(([a, b, c]) => `<div class="al-row"><span>${esc(Market.displayName(a))} · ${esc(Market.displayName(b))}</span><b>${c.toFixed(2)}</b></div>`).join('');
    $('cmBody').innerHTML = `<div style="overflow:auto"><table class="cm"><tr><th></th>${ok.map((s) => `<th>${esc(Market.displayName(s))}</th>`).join('')}</tr>
      ${ok.map((s, i) => `<tr><th class="r">${esc(Market.displayName(s))}</th>${ok.map((t, j) => `<td class="${i === j ? 'self' : ''}" style="background:${i === j ? '#0d0d0d' : color(m.m[i][j])}" title="${esc(s)} / ${esc(t)} · ${m.n[i][j]} common days">${i === j ? '1' : m.m[i][j] == null ? '—' : m.m[i][j].toFixed(2)}</td>`).join('')}</tr>`).join('')}</table></div>
      <div class="dk-grid2" style="margin-top:16px"><div class="dk-card"><h3>Move together the most</h3>${pairList(pairs.slice(0, 6))}</div><div class="dk-card"><h3>Best diversifiers</h3>${pairList(pairs.slice(-6).reverse())}</div></div>
      <p class="dk-src">1 = always move together, 0 = unrelated, −1 = move opposite. Markets are matched by calendar day.${left.length ? ` Left out (no live data): ${esc(left.join(', '))}.` : ''}</p>`;
  }

  /* ---------- Data sources and the user's own keys ---------- */
  async function dataSources() {
    let k = await Store.dataKeys().catch(() => ({}));
    const FREE = [['Yahoo Finance', 'Prices of stocks, ETFs, indices, forex, futures and crypto, symbol search, news'], ['Binance', 'Crypto prices'], ['ECB (Frankfurter)', 'Forex reference rates'], ['SEC EDGAR', 'US company filings: results, balance sheet, cash flow'], ['Google News', 'Headlines']];
    const KEYED = [
      ['fred', 'FRED (St. Louis Fed)', 'US economy: inflation, jobs, rates, GDP. Free key.', 'https://fredaccount.stlouisfed.org/apikeys'],
      ['polygon', 'Polygon.io', 'US stock prices from an official market data feed (free plan has a 15-minute delay).', 'https://polygon.io/'],
      ['finnhub', 'Finnhub', 'Live quotes for US stocks (free plan).', 'https://finnhub.io/register'],
    ];
    Modal.show(`<h2>Data sources</h2><div class="sub">The free sources need nothing. Add your own key to unlock more.</div>
      ${FREE.map(([n, d]) => `<div class="ds-row"><span><b>${n}</b><br><small>${d}</small></span><span class="ds-ok" style="flex:none">● on</span></div>`).join('')}
      ${KEYED.map(([id, n, d]) => `<div class="ds-key"><div class="ds-row" style="border:0;padding-bottom:0"><span><b>${n}</b><br><small>${d}</small></span>${k[id] ? '<span class="ds-ok" style="flex:none">● key saved</span>' : ''}</div>
        <div class="krow"><input type="password" id="dk_${id}" autocomplete="off" placeholder="${k[id] ? 'Key saved · paste a new one to replace it' : 'Paste your key'}"><button class="tbtn" data-save="${id}">Save</button>${k[id] ? `<button class="tbtn" data-forget="${id}">Remove</button>` : ''}<button class="tbtn" data-get="${id}">Get a key</button></div></div>`).join('')}
      <div class="note" style="margin-top:14px">${Store.desktop ? 'Keys are kept in the Windows Credential Manager of this computer, never in your notes, and each key is only sent to its own provider.' : 'Your own keys work in the desktop app.'}</div>
      <div class="actions"><button class="tbtn" id="dsClose">Close</button></div>`);
    $('dsClose').onclick = Modal.close;
    document.querySelectorAll('#mbox [data-get]').forEach((b) => (b.onclick = () => Store.openUrl(KEYED.find((x) => x[0] === b.dataset.get)[3])));
    document.querySelectorAll('#mbox [data-save]').forEach((b) => (b.onclick = async () => {
      const id = b.dataset.save, v = $('dk_' + id).value.trim(); if (!v) return;
      try { k = await Store.setDataKey(id, v); U().setKeys(k); Watch.toast(`${esc(KEYED.find((x) => x[0] === id)[1])} key saved`); dataSources(); } catch (e) { alert(e.message || e); }
    }));
    document.querySelectorAll('#mbox [data-forget]').forEach((b) => (b.onclick = async () => {
      try { k = await Store.forgetDataKey(b.dataset.forget); U().setKeys(k); dataSources(); } catch (e) { alert(e.message || e); }
    }));
  }
  if ($('btnData')) $('btnData').onclick = () => { $('more').classList.add('hide'); dataSources(); };

  return { company, news, grid, macro, screener, corr, leave, dataSources };
})();
