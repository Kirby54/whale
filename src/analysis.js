/* Whale — Analysis tab: any market, live chart, indicators, drawing tools and a quant desk panel
   (volatility, risk, distribution, trend vs mean reversion, benchmark, volume profile, Monte Carlo,
   position sizing, seasonality). Charts: TradingView Lightweight Charts (Apache-2.0). */
window.Analysis = (() => {
  const LC = window.LightweightCharts;
  const COLORS = { up: '#3fb950', down: '#f85149', sma20: '#58a6ff', sma50: '#d29922', sma200: '#f472b6', ema21: '#2dd4bf', bb: '#8b7cf6', vwap: '#facc15', mc: '#c4b5ff', draw: '#a68bff' };
  const IND = [
    ['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'Bollinger'], ['vwap', 'VWAP'],
    ['vol', 'Volume'], ['rsi', 'RSI'], ['macd', 'MACD'], ['mc', 'Monte Carlo'],
  ];
  const TOOLS = [['hline', 'Level', 'Click a price to draw a horizontal level'], ['trend', 'Trend line', 'Click two points'], ['fib', 'Fibonacci', 'Click the swing start, then the swing end'], ['long', 'Long', 'Click the entry, then the stop'], ['short', 'Short', 'Click the entry, then the stop'], ['measure', 'Measure', 'Click two points to measure the move']];
  const fmt = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString(LOCALE, { maximumFractionDigits: d == null ? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 4 : 6) : d, minimumFractionDigits: 0 }));
  const pct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
  const sgn = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');

  let state = { symbol: 'BTC-USD', tf: '1Y', ind: { sma20: true, sma50: true, sma200: false, ema21: false, bb: false, vwap: false, vol: true, rsi: true, macd: false, mc: false }, account: 10000, riskPct: 1, horizon: 20 };
  try { Object.assign(state, JSON.parse(localStorage.getItem('whale-analysis') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('whale-analysis', JSON.stringify(state)); } catch (e) {} };
  let hzTimer = null, built = false, data = null, bench = null, charts = {}, series = {}, drawings = [], pending = null, tool = null, refreshTimer = null, loading = 0;

  /* ---------- Layout ---------- */
  function build() {
    const host = $('analysis');
    host.innerHTML = `
      <div class="an-top">
        <div class="an-search"><input id="anSym" spellcheck="false" autocomplete="off" placeholder="Symbol: BTC, EURUSD, TSLA, gold, SPX…"><div id="anSugg" class="an-sugg hide"></div></div>
        <div class="an-tfs">${Market.TIMEFRAMES.map((t) => `<button data-tf="${t.id}">${t.id}</button>`).join('')}</div>
        <div class="an-quote" id="anQuote"></div>
        <div class="an-actions"><button class="tbtn ai" id="anAsk">✦ Ask AI</button><button class="tbtn" id="anSave">Save to journal</button></div>
      </div>
      <div class="an-bar">
        <div class="an-inds">${IND.map(([k, l]) => `<button class="chip" data-ind="${k}">${l}</button>`).join('')}</div>
        <div class="an-tools">${TOOLS.map(([k, l, h]) => `<button class="chip" data-tool="${k}" title="${h}">${l}</button>`).join('')}<button class="chip" id="anClear" title="Remove the drawings on this symbol">Clear</button></div>
      </div>
      <div class="an-body">
        <div class="an-charts">
          <div class="an-hint" id="anHint"></div>
          <div id="anMain" class="an-pane an-main"></div>
          <div id="anRsi" class="an-pane an-sub"><span class="an-pane-l">RSI 14</span></div>
          <div id="anMacd" class="an-pane an-sub"><span class="an-pane-l">MACD 12 26 9</span></div>
          <div class="an-source" id="anSource"></div>
        </div>
        <aside class="an-panel" id="anPanel"></aside>
      </div>`;
    const opts = (extra) => Object.assign({
      autoSize: true,
      localization: { locale: LOCALE, priceFormatter: (p) => fmt(p) }, // the app's language, and prices like 108,000
      layout: { background: { type: 'solid', color: '#000' }, textColor: '#8a8a8a', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: '#0f0f0f' }, horzLines: { color: '#0f0f0f' } },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', rightOffset: 6 },
      crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: '#444', labelBackgroundColor: '#1d1a2b' }, horzLine: { color: '#444', labelBackgroundColor: '#1d1a2b' } },
    }, extra || {});
    charts.main = LC.createChart($('anMain'), opts());
    // the lower panes follow the main chart (scroll and zoom happen on the main chart)
    const sub = { timeScale: { visible: false, rightOffset: 6 }, handleScroll: false, handleScale: false };
    charts.rsi = LC.createChart($('anRsi'), opts(Object.assign({ localization: { locale: LOCALE, priceFormatter: (v) => v.toFixed(1) } }, sub)));
    charts.macd = LC.createChart($('anMacd'), opts(sub));
    const line = (chart, color, extra) => chart.addLineSeries(Object.assign({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, extra || {}));
    series.candle = charts.main.addCandlestickSeries({ upColor: COLORS.up, downColor: COLORS.down, borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down });
    series.volume = charts.main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    charts.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    series.sma20 = line(charts.main, COLORS.sma20); series.sma50 = line(charts.main, COLORS.sma50); series.sma200 = line(charts.main, COLORS.sma200); series.ema21 = line(charts.main, COLORS.ema21);
    series.bbU = line(charts.main, COLORS.bb, { lineStyle: 2, lineWidth: 1 }); series.bbM = line(charts.main, COLORS.bb, { lineWidth: 1 }); series.bbL = line(charts.main, COLORS.bb, { lineStyle: 2, lineWidth: 1 });
    series.vwap = line(charts.main, COLORS.vwap, { lineWidth: 1.5 });
    series.mc95 = line(charts.main, COLORS.mc, { lineStyle: 2, lineWidth: 1 }); series.mc50 = line(charts.main, COLORS.mc, { lineWidth: 1.5 }); series.mc5 = line(charts.main, COLORS.mc, { lineStyle: 2, lineWidth: 1 });
    series.rsi = line(charts.rsi, '#c4b5ff', { lastValueVisible: true });
    [70, 30].forEach((v) => series.rsi.createPriceLine({ price: v, color: '#333', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
    series.macdH = charts.macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    series.macd = line(charts.macd, '#58a6ff'); series.macdS = line(charts.macd, '#f0883e');
    // keep the three panes scrolled and zoomed together
    charts.main.timeScale().subscribeVisibleLogicalRangeChange(followMain);
    // drawing clicks are read from the DOM: the chart's own click event drops a second click made quickly after the first
    const mainEl = $('anMain'); let down = null;
    mainEl.addEventListener('mousedown', (e) => (down = { x: e.clientX, y: e.clientY }));
    mainEl.addEventListener('click', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // that was a drag (pan), not a click
      const r = mainEl.getBoundingClientRect(), x = e.clientX - r.left;
      onChartClick({ point: { x, y: e.clientY - r.top }, time: charts.main.timeScale().coordinateToTime(x) });
    });

    // controls
    const sym = $('anSym');
    sym.value = state.symbol;
    sym.addEventListener('keydown', (e) => { if (e.key === 'Enter') { hideSugg(); load(Market.normalizeSymbol(sym.value)); } if (e.key === 'Escape') hideSugg(); });
    sym.addEventListener('input', () => { clearTimeout(sym._t); sym._t = setTimeout(suggest, 250); });
    sym.addEventListener('blur', () => setTimeout(hideSugg, 200));
    host.querySelectorAll('[data-tf]').forEach((b) => (b.onclick = () => { state.tf = b.dataset.tf; save(); load(state.symbol); }));
    host.querySelectorAll('[data-ind]').forEach((b) => (b.onclick = () => { state.ind[b.dataset.ind] = !state.ind[b.dataset.ind]; save(); render(); }));
    host.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(tool === b.dataset.tool ? null : b.dataset.tool)));
    $('anClear').onclick = () => { drawings = []; pending = null; saveDrawings(); redrawDrawings(); };
    $('anSave').onclick = saveToJournal;
    $('anAsk').onclick = askAI;
    built = true;
  }

  /* ---------- Symbol search ---------- */
  async function suggest() {
    const q = $('anSym').value.trim(); if (q.length < 2) return hideSugg();
    let list = [];
    try { list = Market.parseYahooSearch(JSON.parse(await Store.market(Market.yahooSearchUrl(q)))); } catch (e) { /* search needs the desktop app */ }
    const guess = Market.normalizeSymbol(q);
    if (guess && !list.some((x) => x.symbol === guess)) list.unshift({ symbol: guess, name: 'Open ' + guess, exchange: '', type: '' });
    const box = $('anSugg');
    box.innerHTML = list.slice(0, 8).map((x) => `<div class="an-s" data-sym="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${esc(x.name)}</span><small>${esc([x.type, x.exchange].filter(Boolean).join(' · '))}</small></div>`).join('');
    box.classList.toggle('hide', !list.length);
    box.querySelectorAll('.an-s').forEach((el) => (el.onmousedown = (e) => { e.preventDefault(); hideSugg(); load(el.dataset.sym); }));
  }
  const hideSugg = () => { const b = $('anSugg'); if (b) b.classList.add('hide'); };

  /* ---------- Data ---------- */
  async function fetchSeries(sym, tfId) {
    const errors = [], kind = Market.kindOf(sym);
    try { return Market.parseYahoo(JSON.parse(await Store.market(Market.yahooChartUrl(sym, tfId)))); } catch (e) { errors.push('Yahoo: ' + (e.message || e)); }
    if (kind === 'crypto') { try { return Market.parseBinance(JSON.parse(await Store.market(Market.binanceUrl(sym, tfId))), sym); } catch (e) { errors.push('Binance: ' + (e.message || e)); } }
    if (kind === 'fx' && Market.tf(tfId).interval === '1d') { try { return Market.parseFrankfurter(JSON.parse(await Store.market(Market.frankfurterUrl(sym, tfId))), sym); } catch (e) { errors.push('ECB: ' + (e.message || e)); } }
    if (!Store.desktop) return Market.demoSeries(sym, tfId);
    throw new Error(errors.join(' · '));
  }
  async function load(sym) {
    if (!sym) return;
    const my = ++loading;
    state.symbol = sym; save();
    $('anSym').value = sym;
    document.querySelectorAll('#analysis [data-tf]').forEach((b) => b.classList.toggle('on', b.dataset.tf === state.tf));
    $('anSource').textContent = 'Loading ' + sym + '…';
    try {
      const d = await fetchSeries(sym, state.tf);
      if (my !== loading) return;
      data = d; bench = null; drawings = loadDrawings(sym); pending = null;
      render(true);
      const b = Market.benchmarkFor(Market.kindOf(sym));
      // beta and correlation only against real prices: a demo benchmark would give meaningless numbers
      const setBench = (x) => { if (my === loading) { bench = x && !x.demo ? x : false; renderPanel(); } };
      if (b !== sym && !d.demo) fetchSeries(b, state.tf).then(setBench, () => setBench(false));
    } catch (e) {
      if (my !== loading) return;
      $('anSource').innerHTML = `<span class="msg-err">Could not load ${esc(sym)}: ${esc(e.message || e)}</span>`;
    }
  }

  /* ---------- Chart ---------- */
  const lineData = (vals) => data.candles.map((k, i) => (vals[i] == null ? { time: k.time } : { time: k.time, value: vals[i] }));
  function render(fit) {
    if (!data) return;
    const c = data.candles, closes = c.map((k) => k.close), on = state.ind, intraday = Market.tf(state.tf).interval.endsWith('m');
    document.querySelectorAll('#analysis [data-ind]').forEach((b) => b.classList.toggle('on', !!on[b.dataset.ind]));
    Object.values(charts).forEach((ch) => ch.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } }));
    series.candle.setData(c.map((k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })));
    const hasVol = c.some((k) => k.volume > 0);
    series.volume.setData(on.vol && hasVol ? c.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? 'rgba(63,185,80,.35)' : 'rgba(248,81,73,.35)' })) : []);
    series.sma20.setData(on.sma20 ? lineData(Quant.sma(closes, 20)) : []);
    series.sma50.setData(on.sma50 ? lineData(Quant.sma(closes, 50)) : []);
    series.sma200.setData(on.sma200 ? lineData(Quant.sma(closes, 200)) : []);
    series.ema21.setData(on.ema21 ? lineData(Quant.ema(closes, 21)) : []);
    const bb = Quant.bollinger(closes, 20, 2);
    series.bbU.setData(on.bb ? lineData(bb.upper) : []); series.bbM.setData(on.bb ? lineData(bb.mid) : []); series.bbL.setData(on.bb ? lineData(bb.lower) : []);
    series.vwap.setData(on.vwap && hasVol ? lineData(Quant.vwap(c)) : []);
    // Monte Carlo projection cone in the future
    if (on.mc && c.length > 30) {
      const step = medianStep(), last = c[c.length - 1], mc = Quant.monteCarlo(last.close, Quant.logReturns(closes.slice(-250)), state.horizon, { paths: 600 });
      const fut = (key) => [{ time: last.time, value: last.close }].concat(mc.map((b, i) => ({ time: last.time + step * (i + 1), value: b[key] })));
      series.mc95.setData(fut('p95')); series.mc50.setData(fut('p50')); series.mc5.setData(fut('p5'));
    } else { series.mc95.setData([]); series.mc50.setData([]); series.mc5.setData([]); }
    // lower panes
    $('anRsi').style.display = on.rsi ? '' : 'none'; $('anMacd').style.display = on.macd ? '' : 'none';
    series.rsi.setData(on.rsi ? lineData(Quant.rsi(closes, 14)) : []);
    const m = Quant.macd(closes);
    series.macd.setData(on.macd ? lineData(m.macd) : []); series.macdS.setData(on.macd ? lineData(m.signal) : []);
    series.macdH.setData(on.macd ? c.map((k, i) => (m.hist[i] == null ? { time: k.time } : { time: k.time, value: m.hist[i], color: m.hist[i] >= 0 ? 'rgba(63,185,80,.6)' : 'rgba(248,81,73,.6)' })) : []);
    redrawDrawings();
    if (fit) { charts.main.timeScale().fitContent(); }
    // align the lower panes on the main chart once their size is known
    requestAnimationFrame(() => followMain(charts.main.timeScale().getVisibleLogicalRange()));
    renderQuote();
    $('anSource').innerHTML = `Source: ${esc(data.source)} · ${c.length} bars · ${esc(Market.tf(state.tf).interval)} · ${esc(data.meta.exchange || '')}${data.demo ? ' · <span class="msg-err">demo data</span>' : ''}`;
    renderPanel();
  }
  function followMain(range) { if (range) [charts.rsi, charts.macd].forEach((c) => c.timeScale().setVisibleLogicalRange(range)); }
  const medianStep = () => { const t = data.candles.map((k) => k.time), g = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); return g[Math.floor(g.length / 2)] || 86400; };
  function renderQuote() {
    // change over the displayed period, measured the same way for every source
    const m = data.meta, last = data.candles[data.candles.length - 1].close, prev = data.candles[0].open, ch = last - prev, chp = prev ? ch / prev : 0;
    $('anQuote').innerHTML = `<div class="an-name">${esc(m.name || m.symbol)} <small>${esc(m.symbol || '')}${m.currency ? ' · ' + esc(m.currency) : ''}</small></div>
      <div class="an-price">${fmt(last)} <span style="color:${ch >= 0 ? 'var(--win)' : 'var(--loss)'}">${ch >= 0 ? '+' : ''}${fmt(ch)} (${sgn(chp)}) <small>${esc(state.tf)}</small></span></div>`;
  }

  /* ---------- Drawing tools ---------- */
  function setTool(t) {
    tool = t; pending = null;
    document.querySelectorAll('#analysis [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    const info = TOOLS.find((x) => x[0] === t);
    $('anHint').textContent = info ? info[2] + ' · Esc to cancel' : '';
    $('anHint').classList.toggle('show', !!info);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tool) setTool(null); });
  function onChartClick(param) {
    if (!tool || !data || !param.point) return;
    const price = series.candle.coordinateToPrice(param.point.y);
    const time = param.time || data.candles[data.candles.length - 1].time;
    if (price == null) return;
    if (tool === 'hline') { drawings.push({ type: 'hline', price }); return finish(); }
    if (!pending) { pending = { time, price }; $('anHint').textContent = 'Now click the second point · Esc to cancel'; return; }
    const a = pending, b = { time, price };
    if (tool === 'trend') drawings.push({ type: 'trend', a, b });
    if (tool === 'fib') drawings.push({ type: 'fib', from: a.price, to: b.price });
    if (tool === 'long' || tool === 'short') drawings.push({ type: 'position', side: tool, entry: a.price, stop: b.price });
    if (tool === 'measure') {
      const bars = data.candles.filter((k) => k.time > Math.min(a.time, b.time) && k.time <= Math.max(a.time, b.time)).length;
      $('anHint').textContent = `Move: ${fmt(b.price - a.price)} (${sgn(b.price / a.price - 1)}) over ${bars} bars`;
      pending = null; return;
    }
    finish();
  }
  function finish() { pending = null; saveDrawings(); redrawDrawings(); setTool(null); renderPanel(); }
  const dKey = () => 'whale-drawings-' + state.symbol;
  const loadDrawings = (sym) => { try { return JSON.parse(localStorage.getItem('whale-drawings-' + sym) || '[]'); } catch (e) { return []; } };
  const saveDrawings = () => { try { localStorage.setItem(dKey(), JSON.stringify(drawings)); } catch (e) {} };
  let priceLines = [], trendSeries = [];
  function redrawDrawings() {
    priceLines.forEach((pl) => series.candle.removePriceLine(pl)); priceLines = [];
    trendSeries.forEach((s) => charts.main.removeSeries(s)); trendSeries = [];
    const pl = (price, color, title, style = 2, width = 1) => priceLines.push(series.candle.createPriceLine({ price, color, title, lineStyle: style, lineWidth: width, axisLabelVisible: true }));
    drawings.forEach((d) => {
      if (d.type === 'hline') pl(d.price, COLORS.draw, '', 0, 1);
      if (d.type === 'fib') Quant.fibLevels(d.from, d.to).forEach((l) => pl(l.price, l.ratio === 0.618 || l.ratio === 0.5 ? '#d29922' : '#6b6b6b', 'Fib ' + l.ratio, 2, 1));
      if (d.type === 'position') {
        const dir = d.side === 'long' ? 1 : -1, risk = Math.abs(d.entry - d.stop), target = d.entry + dir * 2 * risk;
        pl(d.entry, '#e6e6e6', (d.side === 'long' ? 'Long' : 'Short') + ' entry', 0, 2); pl(d.stop, COLORS.down, 'Stop −1R', 2, 1); pl(target, COLORS.up, 'Target 2R', 2, 1);
      }
      if (d.type === 'trend' && d.a.time !== d.b.time) {
        const s = charts.main.addLineSeries({ color: '#c4b5ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([d.a, d.b].sort((x, y) => x.time - y.time).map((p) => ({ time: p.time, value: p.price })));
        trendSeries.push(s);
      }
    });
  }

  /* ---------- Quant panel ---------- */
  function renderPanel() {
    if (!data) return;
    const c = data.candles, closes = c.map((k) => k.close), times = c.map((k) => k.time), kind = Market.kindOf(data.meta.symbol || state.symbol);
    const ppy = Quant.periodsPerYear(times, Market.tradingDays(kind)), r = Quant.logReturns(closes), last = closes[closes.length - 1];
    const vol = Quant.realizedVol(closes, ppy), pk = Quant.parkinsonVol(c, ppy), atrs = Quant.atr(c, 14), atr = atrs[atrs.length - 1];
    const cone = Quant.volCone(closes, ppy, [10, 20, 60, 120]), cur20 = cone.find((x) => x.window === 20);
    const dd = Quant.maxDrawdown(closes), H = Quant.hurst(closes), hl = Quant.halfLife(closes), ac = Quant.autocorr(r, 1), z = Quant.zscore(closes, 20), rs = Quant.rsi(closes, 14).slice(-1)[0];
    const hasVol = c.some((k) => k.volume > 0), vp = hasVol ? Quant.volumeProfile(c, 24) : null;
    const hi = Math.max(...c.map((k) => k.high)), lo = Math.min(...c.map((k) => k.low)), prev = c[c.length - 2] || c[c.length - 1], pv = Quant.pivots(prev.high, prev.low, prev.close);
    const em = (bars) => Quant.expectedMove(last, vol, bars, ppy);
    const per = ppy === 12 ? 'per month' : ppy === 52 ? 'per week' : ppy <= 400 ? 'per day' : 'per bar';
    const hTxt = !isFinite(H) ? '—' : H > 0.55 ? 'trending' : H < 0.45 ? 'mean-reverting' : 'random walk';
    const rsTxt = rs == null ? '' : rs >= 70 ? ' · overbought' : rs <= 30 ? ' · oversold' : '';
    // benchmark
    let rel = '<p class="empty">Loading the benchmark…</p>';
    if (data.demo) rel = '<p class="empty">Available with live data.</p>';
    else if (bench === false) rel = '<p class="empty">The benchmark could not be loaded.</p>';
    else if (bench) { const ar = Quant.alignedReturns(c, bench.candles); rel = ar.n > 20 ? kv([['Benchmark', esc(bench.meta.symbol)], ['Beta', fmt(Quant.beta(ar.a, ar.b), 2)], ['Correlation', fmt(Quant.correlation(ar.a, ar.b), 2)], ['Common bars', ar.n]]) : '<p class="empty">Not enough common bars with the benchmark.</p>'; }
    else if (Market.benchmarkFor(kind) === data.meta.symbol) rel = '<p class="empty">This is the benchmark itself.</p>';
    // position sizer (from the last drawn position, else 1.5 ATR stop)
    const pos = [...drawings].reverse().find((d) => d.type === 'position');
    const entry = pos ? pos.entry : last, stop = pos ? pos.stop : last - 1.5 * (atr || last * 0.02);
    const ps = Quant.positionSize(state.account, state.riskPct, entry, stop);
    const st = tradeStats(), wins = st.names.map((n) => rOf(parse(n))).filter((x) => x > 0), losses = st.names.map((n) => rOf(parse(n))).filter((x) => x < 0);
    const k = wins.length && losses.length ? Quant.kelly(wins.length / (wins.length + losses.length), Quant.mean(wins), -Quant.mean(losses)) : NaN;
    const mc = c.length > 30 ? Quant.monteCarlo(last, Quant.logReturns(closes.slice(-250)), state.horizon, { paths: 1000 }) : null, end = mc && mc[mc.length - 1];
    const daily = Market.tf(state.tf).interval === '1d', wd = daily ? Quant.weekdayReturns(c) : null;

    $('anPanel').innerHTML = `
      ${sec('Snapshot', kv([['Last', fmt(last)], ['Period high / low', `${fmt(hi)} / ${fmt(lo)}`], ['Position in range', pct((last - lo) / (hi - lo || 1), 0)], ['Pivot (P · R1 · S1)', `${fmt(pv.p)} · ${fmt(pv.r1)} · ${fmt(pv.s1)}`]]))}
      ${sec('Volatility', kv([['Realized (annualized)', pct(vol, 1)], ['Parkinson (high-low)', data.closeOnly ? 'needs intraday highs and lows' : pct(pk, 1)], ['ATR 14', `${fmt(atr)} · ${pct(atr / last, 2)}`], ['Vol regime (20 bars)', cur20 ? `${Math.round(cur20.rank * 100)}th percentile` : '—']]) + coneSvg(cone), 'How much the price moves. Percentile = today vs its own history (vol cone).')}
      ${sec('Expected move ±1σ', kv([['Next bar', `±${fmt(em(1))} (${pct(em(1) / last)})`], ['5 bars', `±${fmt(em(5))} (${pct(em(5) / last)})`], ['20 bars', `±${fmt(em(20))} (${pct(em(20) / last)})`]]), 'About 68% of moves stay inside this range if volatility holds.')}
      ${sec('Risk', kv([[`VaR 95% (${per})`, pct(Quant.valueAtRisk(r, 0.95))], [`VaR 99% (${per})`, pct(Quant.valueAtRisk(r, 0.99))], ['Expected shortfall 95%', pct(Quant.expectedShortfall(r, 0.95))], ['Max drawdown', pct(dd.mdd, 1)], ['Sharpe (annualized)', fmt(Quant.sharpe(r, ppy), 2)], ['Sortino (annualized)', fmt(Quant.sortino(r, ppy), 2)]]), 'Historical: the loss exceeded on 5% / 1% of bars, and the average loss beyond it.')}
      ${sec('Return distribution', kv([['Skewness', fmt(Quant.skewness(r), 2)], ['Excess kurtosis (fat tails)', fmt(Quant.kurtosis(r), 2)]]) + histSvg(r))}
      ${sec('Trend or mean reversion', kv([['Hurst exponent', `${fmt(H, 2)} · ${hTxt}`], ['Autocorrelation (lag 1)', fmt(ac, 3)], ['Half-life of reversion', isFinite(hl) ? `${fmt(hl, 1)} bars` : 'none (not reverting)'], ['Z-score vs 20-bar mean', fmt(z, 2)], ['RSI 14', `${fmt(rs, 1)}${rsTxt}`]]), 'Hurst > 0.5: moves tend to continue. < 0.5: they tend to revert.')}
      ${sec('Versus benchmark', rel)}
      ${sec('Volume profile', vp ? kv([['Point of control', fmt(vp.poc)], ['Value area', `${fmt(vp.val)} – ${fmt(vp.vah)}`]]) + vpSvg(vp, last) + '<button class="tbtn an-mini" id="anVpLines">Draw POC and value area</button>' : '<p class="empty">No volume data for this market.</p>', 'Where most volume traded over the period. POC often acts as a magnet.')}
      ${sec('Monte Carlo', end ? `<div class="an-row"><label>Horizon</label><input type="range" id="anHz" min="5" max="120" step="5" value="${state.horizon}"><span>${state.horizon} bars</span></div>` + kv([['Median', fmt(end.p50)], ['50% range', `${fmt(end.p25)} – ${fmt(end.p75)}`], ['90% range', `${fmt(end.p5)} – ${fmt(end.p95)}`]]) + `<button class="tbtn an-mini" id="anMcToggle">${state.ind.mc ? 'Hide' : 'Show'} the cone on the chart</button>` : '<p class="empty">Not enough data.</p>', '1,000 simulated paths using recent returns (geometric Brownian motion).')}
      ${sec('Position sizer', `<div class="an-form">
          <label>Account<input type="number" id="anAcc" value="${state.account}"></label>
          <label>Risk %<input type="number" step="0.1" id="anRisk" value="${state.riskPct}"></label>
          <label>Entry<input type="number" step="any" id="anEntry" value="${+entry.toPrecision(8)}"></label>
          <label>Stop<input type="number" step="any" id="anStop" value="${+stop.toPrecision(8)}"></label></div>
          <div id="anPs">${psHtml(ps, entry, stop)}</div>
          <div class="note">${isFinite(k) ? `Your journal's Kelly fraction: ${pct(k, 1)} of capital (half-Kelly ${pct(k / 2, 1)}).` : 'Kelly fraction appears once your journal has winning and losing trades.'} ${pos ? 'Prices taken from your last Long/Short drawing.' : 'Stop defaults to 1.5 ATR. Draw a Long/Short to set it.'}</div>
          <div class="an-btns"><button class="tbtn an-mini" id="anPsDraw">Draw on chart</button><button class="tbtn an-mini ai" id="anPsTrade">Create trade note</button></div>`)}
      ${wd ? sec('Seasonality by weekday', wdSvg(wd), 'Average daily return by weekday over the period.') : ''}`;

    const on = (id, ev, f) => { const el = $(id); if (el) el[ev] = f; };
    on('anVpLines', 'onclick', () => { drawings.push({ type: 'hline', price: vp.poc }, { type: 'hline', price: vp.vah }, { type: 'hline', price: vp.val }); saveDrawings(); redrawDrawings(); });
    on('anHz', 'oninput', (e) => { state.horizon = +e.target.value; save(); clearTimeout(hzTimer); hzTimer = setTimeout(() => (state.ind.mc ? render() : renderPanel()), 150); });
    on('anMcToggle', 'onclick', () => { state.ind.mc = !state.ind.mc; save(); render(); });
    const recalc = () => { state.account = +$('anAcc').value || 0; state.riskPct = +$('anRisk').value || 0; save(); $('anPs').innerHTML = psHtml(Quant.positionSize(state.account, state.riskPct, +$('anEntry').value, +$('anStop').value), +$('anEntry').value, +$('anStop').value); };
    ['anAcc', 'anRisk', 'anEntry', 'anStop'].forEach((id) => on(id, 'oninput', recalc));
    on('anPsDraw', 'onclick', () => { const e = +$('anEntry').value, s = +$('anStop').value; drawings.push({ type: 'position', side: s < e ? 'long' : 'short', entry: e, stop: s }); saveDrawings(); redrawDrawings(); });
    on('anPsTrade', 'onclick', () => createTrade(+$('anEntry').value, +$('anStop').value));
  }
  const sec = (title, body, help) => `<section class="an-sec"><h3>${title}</h3>${body}${help ? `<div class="note">${help}</div>` : ''}</section>`;
  const kv = (rows) => `<div class="an-kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  function psHtml(ps, entry, stop) {
    if (!ps) return '<p class="empty">Entry and stop must differ.</p>';
    return kv([['Size', `${fmt(ps.units, ps.units >= 100 ? 0 : 4)} units`], ['Position value', fmt(ps.notional, 2)], ['Money at risk', fmt(ps.risk, 2)], ['Side', stop < entry ? 'Long' : 'Short'], ['2R target', fmt(ps.target2R)]]);
  }

  /* ---------- Small panel charts ---------- */
  function coneSvg(cone) {
    if (!cone.length) return '';
    const W = 300, H = 120, mx = Math.max(...cone.map((c) => c.max)) * 1.05, X = (i) => 40 + i * ((W - 60) / Math.max(1, cone.length - 1)), Y = (v) => H - 18 - (v / mx) * (H - 30);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    cone.forEach((c, i) => {
      const x = X(i);
      s += `<line x1="${x}" x2="${x}" y1="${Y(c.min)}" y2="${Y(c.max)}" stroke="#333"/><rect x="${x - 7}" y="${Y(c.p75)}" width="14" height="${Math.max(1, Y(c.p25) - Y(c.p75))}" fill="#1d1a2b" stroke="#3b2f6b"/>`;
      s += `<line x1="${x - 7}" x2="${x + 7}" y1="${Y(c.median)}" y2="${Y(c.median)}" stroke="#8b7cf6"/><circle cx="${x}" cy="${Y(c.current)}" r="4" fill="#facc15"/>`;
      s += `<text x="${x}" y="${H - 4}" text-anchor="middle" class="su-lbl">${c.window}b</text>`;
    });
    return s + `<text x="4" y="12" class="su-lbl">vol</text><text x="${W - 4}" y="12" text-anchor="end" class="su-lbl" fill="#facc15">● now</text></svg>`;
  }
  function histSvg(r) {
    if (r.length < 10) return '';
    const W = 300, H = 110, n = 30, m = Quant.mean(r), sd = Quant.std(r), lo = m - 4 * sd, hi = m + 4 * sd, bw = (hi - lo) / n;
    const b = new Array(n).fill(0); r.forEach((x) => { const i = Math.floor((x - lo) / bw); if (i >= 0 && i < n) b[i]++; });
    const mx = Math.max(...b), X = (v) => 6 + ((v - lo) / (hi - lo)) * (W - 12), Y = (v) => H - 16 - (v / mx) * (H - 26);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    b.forEach((v, i) => { const x0 = X(lo + i * bw); s += `<rect x="${x0}" y="${Y(v)}" width="${Math.max(1, X(lo + (i + 1) * bw) - x0 - 1)}" height="${H - 16 - Y(v)}" fill="${lo + (i + 0.5) * bw < 0 ? '#f85149' : '#3fb950'}" opacity="0.7"/>`; });
    // normal curve with the same mean / std, scaled to the counts
    const pts = []; for (let i = 0; i <= 60; i++) { const v = lo + (i / 60) * (hi - lo); pts.push(`${X(v)},${Y((r.length * bw / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-((v - m) ** 2) / (2 * sd * sd)))}`); }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#c4b5ff" stroke-width="1.5"/>`;
    return s + `<text x="${X(0)}" y="${H - 3}" text-anchor="middle" class="su-lbl">0</text><text x="${W - 4}" y="12" text-anchor="end" class="su-lbl" fill="#c4b5ff">normal</text></svg>`;
  }
  function vpSvg(vp, last) {
    const W = 300, H = 150, mx = Math.max(...vp.bins.map((b) => b.volume)) || 1, bh = (H - 8) / vp.bins.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    vp.bins.slice().reverse().forEach((b, i) => {
      const inVA = b.from >= vp.val - 1e-9 && b.to <= vp.vah + 1e-9, isPoc = vp.poc >= b.from && vp.poc <= b.to;
      s += `<rect x="70" y="${4 + i * bh}" width="${(b.volume / mx) * (W - 76)}" height="${Math.max(1, bh - 1)}" fill="${isPoc ? '#facc15' : inVA ? '#8b7cf6' : '#2a2a2a'}" opacity="${isPoc ? 0.9 : 0.75}"/>`;
      if (last >= b.from && last <= b.to) s += `<line x1="66" x2="${W}" y1="${4 + i * bh + bh / 2}" y2="${4 + i * bh + bh / 2}" stroke="#e6e6e6" stroke-dasharray="3 3"/>`;
      if (i % 4 === 0) s += `<text x="64" y="${4 + i * bh + bh / 2 + 4}" text-anchor="end" class="su-lbl">${fmt((b.from + b.to) / 2)}</text>`;
    });
    return s + '</svg>';
  }
  function wdSvg(wd) {
    const days = wd.filter((d) => d.count > 0); if (!days.length) return '';
    const W = 300, H = 110, mx = Math.max(...days.map((d) => Math.abs(d.mean))) || 1, bw = (W - 20) / days.length, mid = (H - 18) / 2 + 4;
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg"><line x1="10" x2="${W - 10}" y1="${mid}" y2="${mid}" stroke="#2a2a2a"/>`;
    days.forEach((d, i) => { const h = (Math.abs(d.mean) / mx) * (mid - 8), x = 10 + i * bw; s += `<rect x="${x + 6}" y="${d.mean >= 0 ? mid - h : mid}" width="${bw - 12}" height="${Math.max(1, h)}" rx="2" fill="${d.mean >= 0 ? '#3fb950' : '#f85149'}" opacity="0.8"/><text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" class="su-lbl">${names[d.day]}</text>`; });
    return s + '</svg>';
  }

  /* ---------- Journal and AI ---------- */
  function summary() {
    const c = data.candles, closes = c.map((k) => k.close), kind = Market.kindOf(data.meta.symbol), ppy = Quant.periodsPerYear(c.map((k) => k.time), Market.tradingDays(kind)), r = Quant.logReturns(closes);
    return [
      `Symbol: ${data.meta.symbol} (${data.meta.name}), timeframe ${state.tf} (${Market.tf(state.tf).interval} bars), source ${data.source}${data.demo ? ' (DEMO DATA, not real prices)' : ''}`,
      `Last: ${fmt(closes[closes.length - 1])}; period high ${fmt(Math.max(...c.map((k) => k.high)))}, low ${fmt(Math.min(...c.map((k) => k.low)))}`,
      `Realized vol ${pct(Quant.realizedVol(closes, ppy), 1)}, ATR14 ${fmt(Quant.atr(c, 14).slice(-1)[0])}, max drawdown ${pct(Quant.maxDrawdown(closes).mdd, 1)}, Sharpe ${fmt(Quant.sharpe(r, ppy), 2)}`,
      `VaR95 ${pct(Quant.valueAtRisk(r, 0.95))}, skew ${fmt(Quant.skewness(r), 2)}, excess kurtosis ${fmt(Quant.kurtosis(r), 2)}`,
      `Hurst ${fmt(Quant.hurst(closes), 2)}, autocorr ${fmt(Quant.autocorr(r, 1), 3)}, z-score(20) ${fmt(Quant.zscore(closes, 20), 2)}, RSI14 ${fmt(Quant.rsi(closes, 14).slice(-1)[0], 1)}`,
      `SMA20 ${fmt(Quant.sma(closes, 20).slice(-1)[0])}, SMA50 ${fmt(Quant.sma(closes, 50).slice(-1)[0])}, SMA200 ${fmt(Quant.sma(closes, 200).slice(-1)[0])}`,
      drawings.length ? `My levels: ${drawings.map((d) => d.type === 'hline' ? 'level ' + fmt(d.price) : d.type === 'position' ? `${d.side} entry ${fmt(d.entry)} stop ${fmt(d.stop)}` : d.type === 'fib' ? `fib ${fmt(d.from)}→${fmt(d.to)}` : 'trend line').join('; ')}` : '',
    ].filter(Boolean).join('\n');
  }
  function askAI() {
    if (!data) return;
    setView('ask');
    setTimeout(() => { $('askinput').value = `Analyze this market for me (levels, trend, volatility, risks, scenarios). Data:\n${summary()}`; $('askform').requestSubmit(); }, 50);
  }
  async function saveToJournal() {
    if (!data) return;
    const sym = data.meta.symbol || state.symbol, short = Market.journalName(sym), d = new Date().toISOString().slice(0, 10);
    let img = '';
    try {
      const canvas = charts.main.takeScreenshot(), blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (blob) { const name = `analysis-${short}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.png`; await Store.saveAttachment(name, new Uint8Array(await blob.arrayBuffer())); img = `![[${name}]]\n\n`; }
    } catch (e) { console.warn('chart screenshot failed', e); }
    let n = `${d} ${short} analysis`, i = 2; while (notes[n]) n = `${d} ${short} analysis ${i++}`;
    const content = `---\ntype: analysis\ndate: ${d}\nasset: ${short}\nsymbol: ${sym}\ntimeframe: ${state.tf}\nsource: ${data.source}\n---\n## Chart\n${img}## Numbers\n${summary().split('\n').map((l) => '- ' + l).join('\n')}\n\n## My analysis\n\n\n## Plan\n- [ ] \n\nAsset: [[${short}]]\n`;
    const path = `Analysis/${safeName(n)}.md`;
    notes[n] = { path, content, mtime: 0 };
    notes[n].mtime = (await Store.write(path, content)) || 0;
    status('Analysis saved · ' + path);
    open(n);
  }
  async function createTrade(entry, stop) {
    if (!data || !isFinite(entry) || !isFinite(stop) || entry === stop) return;
    const short = Market.journalName(data.meta.symbol || state.symbol), d = new Date().toISOString().slice(0, 10), side = stop < entry ? 'LONG' : 'SHORT';
    let n = `${d} ${short} ${side.toLowerCase()}`, i = 2; while (notes[n]) n = `${d} ${short} ${side.toLowerCase()} ${i++}`;
    const content = `---\ntype: trade\ndate: ${d}\nasset: ${short}\nsetup: \nside: ${side}\nentry: ${+entry.toPrecision(8)}\nstop: ${+stop.toPrecision(8)}\nexit: \nresult: \n---\n## Context\nPlanned from the Analysis tab (${data.meta.symbol}, ${state.tf}). Target 2R: ${fmt(entry + 2 * (entry - stop))}.\n\n## Mistakes / emotions\n\n`;
    const path = `Trades/${safeName(n)}.md`;
    notes[n] = { path, content, mtime: 0 };
    notes[n].mtime = (await Store.write(path, content)) || 0;
    open(n);
  }

  /* ---------- Show / hide ---------- */
  function show() {
    if (!LC) { $('analysis').innerHTML = '<p class="msg-err">The chart library did not load.</p>'; return; }
    if (!built) build();
    load(state.symbol);
    clearInterval(refreshTimer);
    // refresh the price every minute while the tab is open (live data only)
    refreshTimer = setInterval(() => { if (view === 'analysis' && data && !data.demo && !document.hidden) load(state.symbol); }, 60000);
  }
  function hide() { clearInterval(refreshTimer); if (built) setTool(null); }
  return { show, hide, load };
})();
