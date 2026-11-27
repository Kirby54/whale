/* Whale — Analysis tab, a personal market terminal: command bar (TSLA GP, AAPL DES, ECO…), a minimal live chart with
   indicators and editable drawings, a quant desk panel, a watchlist with alerts, and the Company, News, Grid, Macro,
   Screener and Correlation views (desk.js). Charts: TradingView Lightweight Charts (Apache-2.0). */
window.Analysis = (() => {
  const LC = window.LightweightCharts;
  const COLORS = { up: Theme.c.up, down: Theme.c.down, sma20: Theme.c.blue, sma50: Theme.c.warn, sma200: Theme.c.violet, ema21: Theme.c.teal, bb: Theme.c.accent, vwap: Theme.c.yellow, mc: Theme.c.accent2, draw: Theme.c.accent2 };
  const IND = [
    ['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'Bollinger bands'], ['vwap', 'VWAP'],
    ['vol', 'Volume'], ['rsi', 'RSI 14'], ['macd', 'MACD'], ['mc', 'Monte Carlo cone'],
  ];
  const IND_COLOR = { sma20: COLORS.sma20, sma50: COLORS.sma50, sma200: COLORS.sma200, ema21: COLORS.ema21, bb: COLORS.bb, vwap: COLORS.vwap, vol: Theme.c.text2, rsi: Theme.c.accent2, macd: Theme.c.blue, mc: COLORS.mc };
  const TOOLS = [['hline', 'Level', 'Click a price to draw a horizontal level'], ['trend', 'Trend line', 'Click two points'], ['fib', 'Fibonacci', 'Click the swing start, then the swing end'], ['long', 'Long', 'Click the entry, then the stop'], ['short', 'Short', 'Click the entry, then the stop'], ['measure', 'Measure', 'Click two points to measure the move']];
  const TYPES = [['candles', 'Candles'], ['bars', 'Bars'], ['area', 'Area'], ['line', 'Line']];
  const TABS = [['chart', 'Chart', 'GP'], ['company', 'Company', 'DES'], ['news', 'News', 'N'], ['grid', 'Grid', 'GRID'], ['macro', 'Macro', 'ECO'], ['screener', 'Screener', 'EQS'], ['corr', 'Correlation', 'CORR']];
  const svg = (body) => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICON = {
    select: svg('<path d="M5 3l11 6.5-4.6 1.4L9.3 16z"/>'),
    hline: svg('<path d="M2.5 10h15"/><circle cx="10" cy="10" r="1.8"/>'),
    trend: svg('<path d="M4 15.5L16 4.5"/><circle cx="4" cy="15.5" r="1.7"/><circle cx="16" cy="4.5" r="1.7"/>'),
    fib: svg('<path d="M3 4h14"/><path d="M3 8h14" opacity=".55"/><path d="M3 12h14" opacity=".55"/><path d="M3 16h14"/>'),
    long: svg('<path d="M3 14l4.5-4.5 3 3L17 6"/><path d="M12.5 6H17v4.5"/>'),
    short: svg('<path d="M3 6l4.5 4.5 3-3L17 14"/><path d="M12.5 14H17V9.5"/>'),
    measure: svg('<path d="M3.5 13.5l10-10 3 3-10 10z"/><path d="M7 10l1.4 1.4M9.5 7.5l1.4 1.4M12 5l1.4 1.4"/>'),
    trash: svg('<path d="M4 6h12M8.5 6V4h3v2M6 6l.8 10.5h6.4L14 6"/>'),
    area: svg('<path d="M3 15l4-5 3 3 7-8v12H3z" fill="currentColor" opacity=".22" stroke="none"/><path d="M3 15l4-5 3 3 7-8"/>'),
    line: svg('<path d="M3 14l4-5 3 3 7-8"/>'),
    candles: svg('<path d="M6.5 3v14M13.5 5v12"/><rect x="5" y="6.5" width="3" height="6.5" rx=".4"/><rect x="12" y="8" width="3" height="5" rx=".4"/>'),
    bars: svg('<path d="M6 4v12M4 7h2M6 13h2M14 6v10M12 9h2M14 12h2"/>'),
    search: svg('<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5L17 17"/>'),
  };
  const fmt = (v, d) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString(LOCALE, { maximumFractionDigits: d == null ? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 4 : 6) : d, minimumFractionDigits: 0 }));
  const pct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
  const sgn = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
  // 478.8B, 1.2T, 350M (company figures)
  const fmtBig = (v) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); for (const [n, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (a >= n) return (v / n).toFixed(a >= n * 100 ? 0 : 1) + u; return fmt(v, 2); };
  const rgba = Theme.alpha; // colors come from the theme tokens (style.css)
  // A small sparkline for lists and tiles
  function sparkSvg(vals, w = 84, h = 24, color) {
    const v = (vals || []).filter((x) => x != null && isFinite(x)); if (v.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const lo = Math.min(...v), hi = Math.max(...v), c = color || (v[v.length - 1] >= v[0] ? COLORS.up : COLORS.down);
    const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  }

  let state = { symbol: 'BTC-USD', tf: '1Y', type: 'candles', tab: 'chart', ptab: 'watch', newsScope: 'symbol', ind: { sma20: false, sma50: true, sma200: false, ema21: false, bb: false, vwap: false, vol: true, rsi: false, macd: false, mc: false }, account: 10000, riskPct: 1, horizon: 20 };
  try { Object.assign(state, JSON.parse(localStorage.getItem('whale-analysis') || '{}')); } catch (e) {}
  // candles became the default chart: switch once, the user's later choice is kept
  if (!state.candlesDefault) { state.type = 'candles'; state.candlesDefault = true; }
  const save = () => { try { localStorage.setItem('whale-analysis', JSON.stringify(state)); } catch (e) {} };
  let selected = null, drag = null, redrawRaf = 0, panelDirty = true, dataKeys = { fred: false, polygon: false, finnhub: false }, live = null;
  const DRAW_COLORS = [Theme.c.accent2, Theme.c.blue, Theme.c.teal, Theme.c.up, Theme.c.yellow, Theme.c.orange, Theme.c.down, Theme.c.text];
  const uid = () => Math.random().toString(36).slice(2, 10);
  let hzTimer = null, built = false, data = null, bench = null, charts = {}, series = {}, drawings = [], pending = null, tool = null, refreshTimer = null, loading = 0;

  /* ---------- Layout ---------- */
  function build() {
    const host = $('analysis');
    host.innerHTML = `
      <div class="an-head glass-bar">
        <div class="an-search">${ICON.search}<input id="anSym" spellcheck="false" autocomplete="off" placeholder="Symbol or command: TSLA, EURUSD, AAPL DES, ECO, BTC ALRT 70000"><div id="anSugg" class="an-sugg glass-menu hide"></div></div>
        <nav class="an-tabs">${TABS.map(([k, l, code]) => `<button data-tab="${k}" title="${l} (${code})">${l}<small>${code}</small></button>`).join('')}</nav>
        <div class="an-actions"><button class="an-ghost ai" id="anAsk">✦ Ask AI</button><button class="an-ghost" id="anSave">Save to journal</button></div>
      </div>
      <div class="an-views">
        <section class="an-view" data-view="chart">
          <div class="an-sub">
            <div class="an-quote" id="anQuote"></div>
            <div class="an-ctrl">
              <div class="an-seg">${Market.TIMEFRAMES.map((t) => `<button data-tf="${t.id}">${t.id}</button>`).join('')}</div>
              <div class="an-seg an-seg-i">${TYPES.map(([k, l]) => `<button data-ctype="${k}" title="${l} chart">${ICON[k]}<span>${l}</span></button>`).join('')}</div>
              <div class="an-menu"><button class="an-ghost" id="anIndBtn">Indicators <span id="anIndN"></span></button>
                <div class="an-pop glass-menu hide" id="anIndPop">${IND.map(([k, l]) => `<button class="an-pi" data-ind="${k}"><i style="background:${IND_COLOR[k]}"></i><span>${l}</span><b></b></button>`).join('')}</div></div>
            </div>
          </div>
          <div class="an-body">
            <div class="an-rail glass-bar">
              <button data-tool="" title="Select and move drawings (Esc)" aria-label="Select and move drawings">${ICON.select}</button><span class="an-rail-sep"></span>
              ${TOOLS.map(([k, l, h]) => `<button data-tool="${k}" title="${l}: ${h}" aria-label="${l}">${ICON[k]}</button>`).join('')}<span class="an-rail-sep"></span>
              <button id="anClear" title="Remove all drawings on this symbol" aria-label="Remove all drawings">${ICON.trash}</button>
            </div>
            <div class="an-charts">
              <div class="an-legend" id="anLegend"></div>
              <div class="an-hint" id="anHint"></div>
              <div class="an-edit glass-menu hide" id="anEdit">
                <b id="anEditT"></b>
                <input id="anEditName" spellcheck="false" placeholder="Name it, e.g. weekly resistance">
                <span class="an-edit-c" id="anEditC">${DRAW_COLORS.map((c) => `<button data-c="${c}" style="background:${c}" title="Color"></button>`).join('')}</span>
                <label id="anEditRRw">Target <input type="number" id="anEditRR" min="0.1" step="0.1"> R</label>
                <button class="an-ghost an-mini" id="anEditAlert" title="Get an alert when the price reaches this level">Alert</button>
                <button class="an-ghost an-mini" id="anEditDel" title="Delete this drawing (Delete key)">Delete</button>
              </div>
              <div id="anMain" class="an-pane an-main"></div>
              <div id="anRsi" class="an-pane an-lower"><span class="an-pane-l">RSI 14</span></div>
              <div id="anMacd" class="an-pane an-lower"><span class="an-pane-l">MACD 12 26 9</span></div>
              <div class="an-source"><span id="anSource"></span><a class="an-attr" id="anAttr">Charts by TradingView</a></div>
            </div>
            <aside class="an-panel glass-menu">
              <div class="an-ptabs"><button data-ptab="watch">Watchlist</button><button data-ptab="stats">Stats</button><button data-ptab="draw">Drawings</button></div>
              <div class="an-pbody" data-pbody="watch" id="anPWatch"></div>
              <div class="an-pbody" data-pbody="stats" id="anPanel"></div>
              <div class="an-pbody" data-pbody="draw"><div id="anDl"></div></div>
            </aside>
          </div>
        </section>
        ${TABS.slice(1).map(([k]) => `<section class="an-view hide" data-view="${k}"></section>`).join('')}
      </div>`;
    const opts = (extra) => Object.assign({
      autoSize: true,
      localization: { locale: LOCALE, priceFormatter: (p) => fmt(p) }, // the app's language, and prices like 108,000
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: Theme.c.text2, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: Theme.c.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: { borderVisible: false, rightOffset: 4, barSpacing: 6, minBarSpacing: 0.4 },
      crosshair: {
        mode: LC.CrosshairMode.Normal,
        vertLine: { color: Theme.c.crosshair, width: 1, style: 3, labelBackgroundColor: Theme.c.chartLabel },
        horzLine: { color: Theme.c.crosshair, width: 1, style: 3, labelBackgroundColor: Theme.c.chartLabel },
      },
    }, extra || {});
    charts.main = LC.createChart($('anMain'), opts());
    // the lower panes follow the main chart (scroll and zoom happen on the main chart)
    const sub = { timeScale: { visible: false, rightOffset: 4 }, handleScroll: false, handleScale: false, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.15 } } };
    charts.rsi = LC.createChart($('anRsi'), opts(Object.assign({ localization: { locale: LOCALE, priceFormatter: (v) => v.toFixed(1) } }, sub)));
    charts.macd = LC.createChart($('anMacd'), opts(sub));
    const line = (chart, color, extra) => chart.addLineSeries(Object.assign({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, extra || {}));
    series.volume = charts.main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    charts.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
    series.sma20 = line(charts.main, COLORS.sma20); series.sma50 = line(charts.main, COLORS.sma50); series.sma200 = line(charts.main, COLORS.sma200); series.ema21 = line(charts.main, COLORS.ema21);
    series.bbU = line(charts.main, rgba(COLORS.bb, 0.7), { lineStyle: 2 }); series.bbM = line(charts.main, rgba(COLORS.bb, 0.45)); series.bbL = line(charts.main, rgba(COLORS.bb, 0.7), { lineStyle: 2 });
    series.vwap = line(charts.main, COLORS.vwap);
    series.mc95 = line(charts.main, COLORS.mc, { lineStyle: 2 }); series.mc50 = line(charts.main, COLORS.mc); series.mc5 = line(charts.main, COLORS.mc, { lineStyle: 2 });
    makePriceSeries();
    series.rsi = line(charts.rsi, Theme.c.accent2, { lastValueVisible: true, lineWidth: 1.5 });
    [70, 30].forEach((v) => series.rsi.createPriceLine({ price: v, color: Theme.c.line2, lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
    series.macdH = charts.macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    series.macd = line(charts.macd, Theme.c.blue, { lineWidth: 1.5 }); series.macdS = line(charts.macd, Theme.c.orange, { lineWidth: 1.5 });
    charts.main.subscribeCrosshairMove((p) => renderLegend(p && p.time != null ? p.time : null));
    // keep the three panes scrolled and zoomed together
    charts.main.timeScale().subscribeVisibleLogicalRangeChange(followMain);
    // Mouse on the main chart, read from the DOM (the chart's own click event drops a second click made quickly after the first):
    // with a tool, clicks place points; without one, a click selects a drawing and dragging a drawing moves it.
    const mainEl = $('anMain'); let down = null;
    const local = (e) => { const r = mainEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    mainEl.addEventListener('mousedown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (tool || e.button !== 0 || !data) return;
      const { x, y } = local(e), h = hitTest(x, y);
      if (!h) return;
      // capture phase: the chart never sees this press, so it does not pan while a drawing is dragged
      e.stopPropagation(); e.preventDefault();
      select(h.d.id);
      // the starting price and bar are fixed now: the price scale may rescale while the drawing moves
      drag = { d: h.d, part: h.part, orig: JSON.parse(JSON.stringify(h.d)), p0: series.price.coordinateToPrice(y), l0: logicalAt(x), moved: false };
      const move = (ev) => { const q = local(ev); drag.moved = true; applyDrag(q.x, q.y); };
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        const moved = drag.moved; drag = null;
        if (moved) { saveDrawings(); redrawDrawings(); renderPanel(); }
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    }, true);
    mainEl.addEventListener('mousemove', (e) => {
      const h = drag || tool || !data ? null : hitTest(local(e).x, local(e).y);
      mainEl.classList.toggle('an-ns', !!h && h.cursor === 'ns');
      mainEl.classList.toggle('an-mv', !!h && h.cursor === 'mv');
    });
    mainEl.addEventListener('click', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // that was a drag, not a click
      const { x, y } = local(e);
      if (tool) return onChartClick({ point: { x, y }, time: charts.main.timeScale().coordinateToTime(x) });
      const h = data && hitTest(x, y);
      select(h ? h.d.id : null);
    });
    // selected drawing: name, color, target in R, delete
    $('anEditName').addEventListener('input', (e) => { const d = selDrawing(); if (!d) return; d.name = e.target.value; scheduleRedraw(); saveDrawings(); renderDrawList(); });
    $('anEditName').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
    $('anEditC').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { const d = selDrawing(); if (!d) return; d.color = b.dataset.c; saveDrawings(); redrawDrawings(); updateEditor(); renderDrawList(); }));
    $('anEditRR').addEventListener('input', (e) => { const d = selDrawing(); if (!d || !(+e.target.value > 0)) return; d.rr = +e.target.value; saveDrawings(); scheduleRedraw(); renderDrawList(); });
    $('anEditRR').addEventListener('change', () => renderPanel());
    $('anEditDel').onclick = () => removeDrawing(selected);

    $('anEditAlert').onclick = () => { const d = selDrawing(); if (d && d.type === 'hline') Watch.addAlert(state.symbol, null, d.price, d.name); };

    // controls
    const sym = $('anSym');
    sym.value = state.symbol;
    sym.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // a suggestion is used only if it was made for what is typed now (typing fast can beat the suggestions)
        const box = $('anSugg'), pick = box.dataset.q === sym.value.trim() ? box.querySelector('.an-s.on[data-sym]') : null;
        hideSugg();
        if (pick && !Market.parseCommand(sym.value)) go({ fn: state.tab === 'company' || state.tab === 'news' ? state.tab : 'chart', symbol: pick.dataset.sym }); else runInput(sym.value);
      }
      if (e.key === 'Escape') { hideSugg(); sym.blur(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveSugg(e.key === 'ArrowDown' ? 1 : -1); }
    });
    sym.addEventListener('input', () => { clearTimeout(sym._t); sym._t = setTimeout(suggest, 200); });
    sym.addEventListener('focus', () => { sym.select(); suggest(); });
    sym.addEventListener('blur', () => setTimeout(() => { hideSugg(); sym.value = state.symbol; }, 200));
    host.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
    host.querySelectorAll('[data-ptab]').forEach((b) => (b.onclick = () => setPanelTab(b.dataset.ptab)));
    host.querySelectorAll('[data-tf]').forEach((b) => (b.onclick = () => { state.tf = b.dataset.tf; save(); load(state.symbol); }));
    host.querySelectorAll('[data-ctype]').forEach((b) => (b.onclick = () => { state.type = b.dataset.ctype; save(); makePriceSeries(); render(); }));
    host.querySelectorAll('[data-ind]').forEach((b) => (b.onclick = () => { state.ind[b.dataset.ind] = !state.ind[b.dataset.ind]; save(); render(); }));
    host.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(tool === (b.dataset.tool || null) ? null : b.dataset.tool)));
    $('anIndBtn').onclick = (e) => { e.stopPropagation(); $('anIndPop').classList.toggle('hide'); };
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.an-menu')) { const p = $('anIndPop'); if (p) p.classList.add('hide'); } });
    $('anAttr').onclick = () => Store.openUrl('https://www.tradingview.com/');
    $('anClear').onclick = () => {
      if (drawings.length && !confirm(`Remove all ${drawings.length} drawings on ${state.symbol}?`)) return;
      drawings = []; pending = null; selected = null; saveDrawings(); redrawDrawings(); updateEditor(); renderPanel(); renderDrawList();
    };
    $('anSave').onclick = saveToJournal;
    $('anAsk').onclick = askAI;
    built = true;
    setTab(state.tab, true); setPanelTab(state.ptab);
  }

  /* ---------- Tabs and the command bar ---------- */
  function setTab(t, quiet) {
    if (!TABS.some(([k]) => k === t)) t = 'chart';
    state.tab = t; save();
    document.querySelectorAll('#analysis [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('#analysis .an-view').forEach((v) => v.classList.toggle('hide', v.dataset.view !== t));
    if (t !== 'chart') setTool(null);
    if (window.Desk) Desk.leave(t);
    if (quiet || !window.Desk) return;
    const el = document.querySelector(`#analysis .an-view[data-view="${t}"]`), cur = data && data.meta.symbol === state.symbol ? data : null;
    if (t === 'company') Desk.company(el, state.symbol, cur);
    if (t === 'news') Desk.news(el, state.newsScope === 'market' ? null : state.symbol, cur);
    if (t === 'grid') Desk.grid(el);
    if (t === 'macro') Desk.macro(el);
    if (t === 'screener') Desk.screener(el);
    if (t === 'corr') Desk.corr(el);
  }
  function setPanelTab(t) {
    state.ptab = t; save();
    document.querySelectorAll('#analysis [data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === t));
    document.querySelectorAll('#analysis [data-pbody]').forEach((b) => b.classList.toggle('hide', b.dataset.pbody !== t));
    if (t === 'stats' && panelDirty) renderPanel();
    if (t === 'draw') renderDrawList();
    if (t === 'watch' && window.Watch) Watch.mount($('anPWatch'));
  }
  // Enter in the command bar: a command ("AAPL DES", "ECO"), or a symbol for the current view
  function runInput(text) {
    const cmd = Market.parseCommand(text);
    if (cmd) return go(cmd);
    const sym = Market.normalizeSymbol(text); if (!sym) return;
    go({ fn: state.tab === 'company' || state.tab === 'news' ? state.tab : 'chart', symbol: sym });
  }
  // Runs a command from the command bar or the Ctrl+K palette
  async function go(cmd) {
    if (!cmd) return;
    const newSym = cmd.symbol && cmd.symbol !== state.symbol;
    if (cmd.symbol) { state.symbol = cmd.symbol; save(); }
    if (cmd.fn === 'news') state.newsScope = 'symbol';
    if (cmd.fn === 'topnews') state.newsScope = 'market';
    const tab = { chart: 'chart', alert: 'chart', watch: 'chart', company: 'company', news: 'news', topnews: 'news', macro: 'macro', screener: 'screener', corr: 'corr', grid: 'grid' }[cmd.fn] || 'chart';
    state.tab = tab; save();
    if (view !== 'analysis') setView('analysis'); // show() loads state.symbol and opens state.tab
    else { if (newSym) load(state.symbol); setTab(tab); }
    if (cmd.fn === 'watch' || cmd.fn === 'alert') setPanelTab('watch');
    if (cmd.fn === 'alert' && cmd.price) Watch.addAlert(cmd.symbol, cmd.op, cmd.price);
    if ($('anSym')) $('anSym').value = state.symbol;
  }

  /* ---------- Symbol search ---------- */
  const HELP = [['GP', 'Chart', 'TSLA GP'], ['DES', 'Company: results and ratios', 'AAPL DES'], ['N', 'News', 'NVDA N'], ['ALRT', 'Price alert', 'BTC ALRT 70000'], ['W', 'Watchlist', 'W'], ['ECO', 'Macro: rates, economy', 'ECO'], ['EQS', 'Screener', 'EQS'], ['CORR', 'Correlation matrix', 'CORR'], ['GRID', 'Several charts', 'GRID'], ['TOP', 'Market news', 'TOP']];
  async function suggest() {
    const box = $('anSugg'), q = $('anSym').value.trim();
    const show = (html) => { box.dataset.q = q; box.innerHTML = html; box.classList.toggle('hide', !html); box.querySelectorAll('.an-s').forEach((el) => (el.onmousedown = (e) => { e.preventDefault(); hideSugg(); if (el.dataset.cmd) { $('anSym').value = el.dataset.cmd; runInput(el.dataset.cmd); } else go({ fn: state.tab === 'company' || state.tab === 'news' ? state.tab : 'chart', symbol: el.dataset.sym }); })); };
    // empty or same as the current symbol: list the commands, Bloomberg style
    if (!q || q === state.symbol) return show(`<div class="an-s-h">Commands · type a symbol, then a function</div>` + HELP.map(([k, l, ex]) => `<div class="an-s an-s-cmd" data-cmd="${esc(ex)}"><b>${k}</b><span>${esc(l)}</span><small>${esc(ex)}</small></div>`).join(''));
    const cmd = Market.parseCommand(q);
    if (cmd) { const t = HELP.find(([k]) => Market.parseCommand('X ' + k)?.fn === cmd.fn || Market.parseCommand(k)?.fn === cmd.fn); return show(`<div class="an-s an-s-cmd on" data-cmd="${esc(q)}"><b>↵</b><span>${esc(t ? t[1] : cmd.fn)}${cmd.symbol ? ' · ' + esc(cmd.symbol) : ''}</span><small>Enter</small></div>`); }
    let list = [];
    try { list = Market.parseYahooSearch(JSON.parse(await Store.market(Market.yahooSearchUrl(q)))); } catch (e) { /* search needs the desktop app */ }
    if ($('anSym').value.trim() !== q) return; // the user kept typing
    const guess = Market.normalizeSymbol(q);
    if (guess && !list.some((x) => x.symbol === guess)) list.unshift({ symbol: guess, name: 'Open ' + guess, exchange: '', type: '' });
    show(list.slice(0, 8).map((x, i) => `<div class="an-s${i === 0 ? ' on' : ''}" data-sym="${esc(x.symbol)}"><b>${esc(x.symbol)}</b><span>${esc(x.name)}</span><small>${esc([x.type, x.exchange].filter(Boolean).join(' · '))}</small></div>`).join(''));
  }
  function moveSugg(dir) {
    const items = [...$('anSugg').querySelectorAll('.an-s')]; if (!items.length) return;
    const i = items.findIndex((x) => x.classList.contains('on')), n = Math.max(0, Math.min(items.length - 1, i + dir));
    items.forEach((x, j) => x.classList.toggle('on', j === n));
    if (items[n].dataset.cmd) $('anSym').value = items[n].dataset.cmd;
  }
  const hideSugg = () => { const b = $('anSugg'); if (b) b.classList.add('hide'); };

  /* ---------- Data ---------- */
  async function fetchSeries(sym, tfId) {
    const errors = [], kind = Market.kindOf(sym);
    if (kind === 'stock' && dataKeys.polygon) { try { return Market.parsePolygon(JSON.parse(await Store.marketKeyed('polygon', Market.polygonUrl(sym, tfId))), sym); } catch (e) { errors.push('Polygon: ' + (e.message || e)); } }
    try { return Market.parseYahoo(JSON.parse(await Store.market(Market.yahooChartUrl(sym, tfId)))); } catch (e) { errors.push('Yahoo: ' + (e.message || e)); }
    if (kind === 'crypto') { try { return Market.parseBinance(JSON.parse(await Store.market(Market.binanceUrl(sym, tfId))), sym); } catch (e) { errors.push('Binance: ' + (e.message || e)); } }
    if (kind === 'fx' && Market.tf(tfId).interval === '1d') { try { return Market.parseFrankfurter(JSON.parse(await Store.market(Market.frankfurterUrl(sym, tfId))), sym); } catch (e) { errors.push('ECB: ' + (e.message || e)); } }
    if (!Store.desktop) return Market.demoSeries(sym, tfId);
    throw new Error(errors.join(' · '));
  }
  // soft: a refresh of the same market (keeps the zoom, the selection and the benchmark)
  async function load(sym, soft) {
    if (!sym) return;
    const my = ++loading;
    state.symbol = sym; save();
    if (document.activeElement !== $('anSym')) $('anSym').value = sym;
    document.querySelectorAll('#analysis [data-tf]').forEach((b) => b.classList.toggle('on', b.dataset.tf === state.tf));
    if (!soft) $('anSource').textContent = 'Loading ' + sym + '…';
    try {
      const d = await fetchSeries(sym, state.tf);
      if (my !== loading) return;
      const kind = Market.kindOf(sym);
      live = null;
      if (kind === 'stock' && dataKeys.finnhub) Store.marketKeyed('finnhub', Market.finnhubQuoteUrl(sym)).then((t) => { if (my === loading) { live = Market.parseFinnhubQuote(JSON.parse(t)); renderQuote(); } }).catch(() => {});
      if (soft && data && data.meta.symbol === d.meta.symbol) { data = d; render(false); return; }
      data = d; bench = null; drawings = loadDrawings(sym); pending = null; selected = null; updateEditor();
      render(true);
      if (window.Watch) Watch.render();
      if (state.tab === 'company' || state.tab === 'news') setTab(state.tab);
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
  // The price series changes with the chart type; drawings are attached to it, so they are redrawn
  function makePriceSeries() {
    if (series.price) { priceLines.forEach((pl) => series.price.removePriceLine(pl)); priceLines = []; charts.main.removeSeries(series.price); }
    const t = state.type, base = { priceLineVisible: true, priceLineWidth: 1, priceLineStyle: 2, lastValueVisible: true };
    // rising candles hollow, falling candles filled: the direction does not depend on color alone
    if (t === 'candles') series.price = charts.main.addCandlestickSeries(Object.assign({ upColor: rgba(COLORS.up, 0), downColor: COLORS.down, borderVisible: true, borderUpColor: COLORS.up, borderDownColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down }, base));
    else if (t === 'bars') series.price = charts.main.addBarSeries(Object.assign({ upColor: COLORS.up, downColor: COLORS.down, thinBars: true }, base));
    else if (t === 'line') series.price = charts.main.addLineSeries(Object.assign({ color: COLORS.up, lineWidth: 2, crosshairMarkerRadius: 3 }, base));
    else series.price = charts.main.addAreaSeries(Object.assign({ lineColor: COLORS.up, topColor: rgba(COLORS.up, 0.2), bottomColor: rgba(COLORS.up, 0), lineWidth: 2, crosshairMarkerRadius: 3 }, base));
    document.querySelectorAll('#analysis [data-ctype]').forEach((b) => b.classList.toggle('on', b.dataset.ctype === t));
  }
  const lineData = (vals) => data.candles.map((k, i) => (vals[i] == null ? { time: k.time } : { time: k.time, value: vals[i] }));
  function render(fit) {
    if (!data) return;
    const c = data.candles, closes = c.map((k) => k.close), on = state.ind, intraday = Market.tf(state.tf).interval.endsWith('m');
    document.querySelectorAll('#analysis [data-ind]').forEach((b) => b.classList.toggle('on', !!on[b.dataset.ind]));
    const nOn = IND.filter(([k]) => on[k]).length; $('anIndN').textContent = nOn ? nOn : '';
    Object.values(charts).forEach((ch) => ch.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } }));
    const ohlc = state.type === 'candles' || state.type === 'bars';
    series.price.setData(ohlc ? c.map((k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })) : c.map((k) => ({ time: k.time, value: k.close })));
    // line and area take the color of the move over the period, like a quote screen
    const tone = closes[closes.length - 1] >= c[0].open ? COLORS.up : COLORS.down;
    if (state.type === 'area') series.price.applyOptions({ lineColor: tone, topColor: rgba(tone, 0.2), bottomColor: rgba(tone, 0), priceLineColor: tone });
    if (state.type === 'line') series.price.applyOptions({ color: tone, priceLineColor: tone });
    const hasVol = c.some((k) => k.volume > 0);
    // volume under candles or bars takes their direction at 40 % opacity; under a line it stays neutral
    const volColor = (k) => (ohlc ? rgba(k.close >= k.open ? COLORS.up : COLORS.down, 0.4) : k.close >= k.open ? Theme.c.volUp : Theme.c.volDown);
    series.volume.setData(on.vol && hasVol ? c.map((k) => ({ time: k.time, value: k.volume, color: volColor(k) })) : []);
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
    series.macdH.setData(on.macd ? c.map((k, i) => (m.hist[i] == null ? { time: k.time } : { time: k.time, value: m.hist[i], color: m.hist[i] >= 0 ? Theme.alpha(Theme.c.up, 0.45) : Theme.alpha(Theme.c.down, 0.45) })) : []);
    redrawDrawings();
    if (fit) { charts.main.timeScale().fitContent(); }
    // align the lower panes on the main chart once their size is known
    requestAnimationFrame(() => followMain(charts.main.timeScale().getVisibleLogicalRange()));
    renderQuote(); renderLegend(null);
    $('anSource').innerHTML = `${esc(data.source)} · ${c.length} bars · ${esc(Market.tf(state.tf).interval)}${data.meta.exchange ? ' · ' + esc(data.meta.exchange) : ''}${data.demo ? ' · <span class="msg-err">demo data</span>' : ''}`;
    panelDirty = true; renderPanel();
  }
  function followMain(range) { if (range) [charts.rsi, charts.macd].forEach((c) => c.timeScale().setVisibleLogicalRange(range)); }
  const medianStep = () => { const t = data.candles.map((k) => k.time), g = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); return g[Math.floor(g.length / 2)] || 86400; };
  function renderQuote() {
    if (!data) return;
    // change over the displayed period, measured the same way for every source; a live quote (Finnhub) replaces the last price
    const m = data.meta, lastBar = data.candles[data.candles.length - 1].close, last = live ? live.price : lastBar, prev = data.candles[0].open, ch = last - prev, chp = prev ? ch / prev : 0;
    $('anQuote').innerHTML = `<div class="an-q-name"><b>${esc(Market.displayName ? Market.displayName(m.symbol || state.symbol) : m.symbol)}</b><span>${esc(m.name && m.name !== m.symbol ? m.name : m.symbol || '')}</span>${m.currency ? `<span>${esc(m.currency)}</span>` : ''}${live ? '<span class="an-live">● live · Finnhub</span>' : ''}</div>
      <div class="an-q-px"><span class="an-q-last">${fmt(last)}</span><span class="an-q-chg ${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${fmt(ch)} · ${sgn(chp)}</span><span class="an-q-tf">${esc(state.tf)}</span></div>`;
  }
  // O H L C of the bar under the mouse (or the last bar), top left of the chart
  function renderLegend(time) {
    const el = $('anLegend'); if (!el || !data) return;
    const c = data.candles; let i = time == null ? c.length - 1 : idxOfTime(time);
    if (i < 0 || i >= c.length) i = c.length - 1;
    const k = c[i], prev = c[i - 1], ch = prev ? k.close / prev.close - 1 : null, intraday = Market.tf(state.tf).interval.endsWith('m');
    const d = new Date(k.time * 1000).toLocaleString(LOCALE, intraday ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
    const v = (l, x) => `<span>${l} <b>${fmt(x)}</b></span>`;
    el.innerHTML = `<span class="an-lg-d">${esc(d)}</span>` + (data.closeOnly ? v('C', k.close) : v('O', k.open) + v('H', k.high) + v('L', k.low) + v('C', k.close)) + (ch != null ? `<span class="${ch >= 0 ? 'up' : 'dn'}">${sgn(ch)}</span>` : '') + (k.volume ? `<span>Vol <b>${fmtBig(k.volume)}</b></span>` : '');
  }

  /* ---------- Drawing tools ---------- */
  function setTool(t) {
    tool = t || null; pending = null;
    document.querySelectorAll('#analysis [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === (tool || '')));
    const info = TOOLS.find((x) => x[0] === t);
    $('anHint').textContent = info ? info[2] + ' · Esc to cancel' : '';
    $('anHint').classList.toggle('show', !!info);
  }
  document.addEventListener('keydown', (e) => {
    if (view !== 'analysis') return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape' && tool) setTool(null);
    else if (e.key === 'Escape' && selected && !typing) select(null);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !typing) { e.preventDefault(); removeDrawing(selected); }
  });
  const add = (d) => { d.id = uid(); drawings.push(d); return d; };
  function onChartClick(param) {
    if (!tool || !data || !param.point) return;
    const price = series.price.coordinateToPrice(param.point.y);
    const time = param.time || data.candles[data.candles.length - 1].time;
    if (price == null) return;
    if (tool === 'hline') return finish(add({ type: 'hline', price }));
    if (!pending) { pending = { time, price }; $('anHint').textContent = 'Now click the second point · Esc to cancel'; return; }
    const a = pending, b = { time, price };
    let nd = null;
    if (tool === 'trend') nd = add({ type: 'trend', a, b });
    if (tool === 'fib') nd = add({ type: 'fib', from: a.price, to: b.price });
    if (tool === 'long' || tool === 'short') nd = add({ type: 'position', side: a.price > b.price ? 'long' : 'short', entry: a.price, stop: b.price, rr: 2 });
    if (tool === 'measure') {
      const bars = data.candles.filter((k) => k.time > Math.min(a.time, b.time) && k.time <= Math.max(a.time, b.time)).length;
      $('anHint').textContent = `Move: ${fmt(b.price - a.price)} (${sgn(b.price / a.price - 1)}) over ${bars} bars`;
      pending = null; return;
    }
    finish(nd);
  }
  // a new drawing is selected right away, so it can be named or moved
  function finish(nd) { pending = null; setTool(null); if (nd) selected = nd.id; saveDrawings(); redrawDrawings(); updateEditor(); renderPanel(); }
  const dKey = () => 'whale-drawings-' + state.symbol;
  const loadDrawings = (sym) => {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('whale-drawings-' + sym) || '[]'); } catch (e) {}
    return (Array.isArray(list) ? list : []).map((d) => Object.assign({ id: uid() }, d)); // drawings saved before ids existed get one
  };
  const saveDrawings = () => { try { localStorage.setItem(dKey(), JSON.stringify(drawings)); } catch (e) {} };
  let priceLines = [], trendSeries = [];
  const rrOf = (d) => d.rr || 2;
  const targetOf = (d) => d.entry + (d.side === 'long' ? 1 : -1) * rrOf(d) * Math.abs(d.entry - d.stop);
  const colorOf = (d) => d.color || (d.type === 'trend' ? Theme.c.accent2 : COLORS.draw);
  const selDrawing = () => drawings.find((d) => d.id === selected) || null;
  // a trend line is shown only if its points fall in the loaded bars, so a line drawn on daily bars does not stretch a 5-minute chart
  const trendVisible = (d) => { const c = data.candles, t0 = Math.min(d.a.time, d.b.time), t1 = Math.max(d.a.time, d.b.time); return d.a.time !== d.b.time && t0 >= c[0].time && t1 <= c[c.length - 1].time + 300 * medianStep(); };
  function redrawDrawings() {
    priceLines.forEach((pl) => series.price.removePriceLine(pl)); priceLines = [];
    trendSeries.forEach((s) => charts.main.removeSeries(s)); trendSeries = [];
    if (!data) return;
    const pl = (price, color, title, style = 2, width = 1) => priceLines.push(series.price.createPriceLine({ price, color, title, lineStyle: style, lineWidth: width, axisLabelVisible: true }));
    drawings.forEach((d) => {
      const sel = d.id === selected, w = sel ? 1 : 0, nm = d.name ? d.name.trim() : '';
      if (d.type === 'hline') pl(d.price, colorOf(d), nm, 0, 1 + w);
      if (d.type === 'fib') Quant.fibLevels(d.from, d.to).forEach((l) => pl(l.price, l.ratio === 0.618 || l.ratio === 0.5 ? Theme.c.warn : sel ? Theme.c.text2 : Theme.c.neutral, (l.ratio === 1 && nm ? nm + ' · ' : '') + 'Fib ' + l.ratio, sel ? 0 : 2, 1));
      if (d.type === 'position') {
        pl(d.entry, Theme.c.text, (nm ? nm + ' · ' : '') + (d.side === 'long' ? 'Long' : 'Short') + ' entry', 0, 2 + w);
        pl(d.stop, COLORS.down, 'Stop −1R', sel ? 0 : 2, 1 + w);
        pl(targetOf(d), COLORS.up, `Target ${+rrOf(d).toFixed(2)}R`, sel ? 0 : 2, 1 + w);
      }
      if (d.type === 'trend' && trendVisible(d)) {
        const s = charts.main.addLineSeries({ color: colorOf(d), lineWidth: 2 + w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, pointMarkersVisible: sel, pointMarkersRadius: 4, title: nm });
        s.setData([d.a, d.b].sort((x, y) => x.time - y.time).map((p) => ({ time: p.time, value: p.price })));
        trendSeries.push(s);
      }
    });
  }
  const scheduleRedraw = () => { if (!redrawRaf) redrawRaf = requestAnimationFrame(() => { redrawRaf = 0; redrawDrawings(); }); };

  /* ---------- Editing drawings: hit testing, dragging, selection ---------- */
  // Bar index <-> time, also before and after the loaded bars (a trend line can end in the future)
  function idxOfTime(t) {
    const c = data.candles, n = c.length, st = medianStep();
    if (t > c[n - 1].time) return n - 1 + Math.round((t - c[n - 1].time) / st);
    if (t < c[0].time) return Math.round((t - c[0].time) / st);
    let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m].time < t) lo = m + 1; else hi = m; } return lo;
  }
  function timeOfIdx(i) { const c = data.candles, n = c.length; return i < 0 ? c[0].time + i * medianStep() : i >= n ? c[n - 1].time + (i - n + 1) * medianStep() : c[i].time; }
  const logicalAt = (x) => charts.main.timeScale().coordinateToLogical(x);
  const segDist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; return Math.hypot(x - ax - t * dx, y - ay - t * dy); };
  // The drawing part under the mouse (closest one), or null
  function hitTest(x, y) {
    if (y > $('anMain').clientHeight - charts.main.timeScale().height()) return null; // on the time axis
    const Y = (p) => series.price.priceToCoordinate(p), X = (t) => charts.main.timeScale().timeToCoordinate(t);
    let best = null;
    const consider = (dist, h) => { if (dist <= h.tol && (!best || dist < best.dist)) best = Object.assign(h, { dist }); };
    const level = (d, price, part) => { const yy = Y(price); if (yy != null) consider(Math.abs(y - yy), { d, part, cursor: 'ns', tol: 5 }); };
    drawings.forEach((d) => {
      if (d.type === 'hline') level(d, d.price, 'price');
      if (d.type === 'fib') Quant.fibLevels(d.from, d.to).forEach((l) => level(d, l.price, l.ratio === 1 ? 'from' : l.ratio === 0 ? 'to' : 'fib'));
      if (d.type === 'position') { level(d, d.entry, 'entry'); level(d, d.stop, 'stop'); level(d, targetOf(d), 'target'); }
      if (d.type === 'trend' && trendVisible(d)) {
        const ax = X(d.a.time), ay = Y(d.a.price), bx = X(d.b.time), by = Y(d.b.price);
        if ([ax, ay, bx, by].some((v) => v == null)) return;
        consider(Math.hypot(x - ax, y - ay) - 2, { d, part: 'a', cursor: 'mv', tol: 7 }); // ends win over the line itself
        consider(Math.hypot(x - bx, y - by) - 2, { d, part: 'b', cursor: 'mv', tol: 7 });
        consider(segDist(x, y, ax, ay, bx, by), { d, part: 'line', cursor: 'mv', tol: 5 });
      }
    });
    return best;
  }
  function applyDrag(x, y) {
    const { d, part, orig, p0, l0 } = drag;
    const p = series.price.coordinateToPrice(y);
    if (p == null || p0 == null) return;
    const dp = p - p0;
    if (part === 'price') d.price = p;
    else if (part === 'from') d.from = p;
    else if (part === 'to') d.to = p;
    else if (part === 'fib') { d.from = orig.from + dp; d.to = orig.to + dp; }
    else if (part === 'entry') { d.entry = orig.entry + dp; d.stop = orig.stop + dp; } // the entry moves the whole position
    else if (part === 'stop') { if (p !== d.entry) { d.stop = p; d.side = p < d.entry ? 'long' : 'short'; } }
    else if (part === 'target') { const risk = Math.abs(d.entry - d.stop), dir = d.side === 'long' ? 1 : -1; if (risk) d.rr = Math.max(0.1, Math.round((dir * (p - d.entry) / risk) * 10) / 10); }
    else if (part === 'a' || part === 'b') { const l = logicalAt(x); if (l != null) d[part] = { time: timeOfIdx(Math.round(l)), price: p }; }
    else if (part === 'line') {
      const l = logicalAt(x), di = l != null && l0 != null ? Math.round(l - l0) : 0;
      ['a', 'b'].forEach((k) => (d[k] = { time: timeOfIdx(idxOfTime(orig[k].time) + di), price: orig[k].price + dp }));
    }
    scheduleRedraw();
    if (d.type === 'position') syncSizer(d);
    updateEditor(); renderDrawList();
  }
  function select(id) {
    if (id === selected) return;
    selected = id; redrawDrawings(); updateEditor(); renderDrawList();
    const d = selDrawing(); if (d && d.type === 'position') syncSizer(d);
  }
  function removeDrawing(id) {
    if (!id) return;
    drawings = drawings.filter((d) => d.id !== id);
    if (selected === id) selected = null;
    saveDrawings(); redrawDrawings(); updateEditor(); renderPanel();
  }
  const TYPE_NAME = { hline: 'Level', fib: 'Fibonacci', position: 'Position', trend: 'Trend line' };
  function updateEditor() {
    const box = $('anEdit'); if (!box) return;
    const d = selDrawing(); box.classList.toggle('hide', !d); if (!d) return;
    $('anEditT').textContent = d.type === 'position' ? (d.side === 'long' ? 'Long' : 'Short') : TYPE_NAME[d.type];
    if (document.activeElement !== $('anEditName')) $('anEditName').value = d.name || '';
    $('anEditC').style.display = d.type === 'hline' || d.type === 'trend' ? '' : 'none';
    $('anEditC').querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', colorOf(d) === b.dataset.c));
    $('anEditRRw').style.display = d.type === 'position' ? '' : 'none';
    $('anEditAlert').style.display = d.type === 'hline' ? '' : 'none';
    if (d.type === 'position' && document.activeElement !== $('anEditRR')) $('anEditRR').value = rrOf(d);
  }
  // What a drawing is, in one line (drawings list, AI summary)
  function describe(d) {
    if (d.type === 'hline') return fmt(d.price);
    if (d.type === 'fib') return `${fmt(d.from)} → ${fmt(d.to)}`;
    if (d.type === 'position') return `entry ${fmt(d.entry)} · stop ${fmt(d.stop)} · target ${fmt(targetOf(d))} (${+rrOf(d).toFixed(2)}R)`;
    return `${fmt(d.a.price)} → ${fmt(d.b.price)}`;
  }
  function renderDrawList() {
    const box = $('anDl'); if (!box) return;
    if (!drawings.length) { box.innerHTML = '<p class="empty">Use the tools on the left of the chart to draw. Click a drawing to select it, drag it to move it.</p>'; return; }
    box.innerHTML = drawings.map((d) => `<div class="an-dl${d.id === selected ? ' on' : ''}" data-id="${d.id}">
        <i style="background:${d.type === 'position' ? (d.side === 'long' ? COLORS.up : COLORS.down) : d.type === 'fib' ? Theme.c.warn : colorOf(d)}"></i>
        <span><b>${esc(d.name || (d.type === 'position' ? (d.side === 'long' ? 'Long' : 'Short') : TYPE_NAME[d.type]))}</b><small>${esc(describe(d))}</small></span>
        <button data-del="${d.id}" title="Delete">×</button></div>`).join('');
    box.querySelectorAll('.an-dl').forEach((el) => (el.onclick = (e) => { if (e.target.dataset.del) removeDrawing(e.target.dataset.del); else select(el.dataset.id); }));
  }
  // Position sizer follows the selected (or dragged) position
  function syncSizer(d) {
    const e = $('anEntry'), s = $('anStop'); if (!e || !s) return;
    e.value = +d.entry.toPrecision(8); s.value = +d.stop.toPrecision(8); recalcSizer();
  }
  function recalcSizer() {
    state.account = +$('anAcc').value || 0; state.riskPct = +$('anRisk').value || 0; save();
    const e = +$('anEntry').value, s = +$('anStop').value;
    $('anPs').innerHTML = psHtml(Quant.positionSize(state.account, state.riskPct, e, s), e, s);
  }

  /* ---------- Quant panel ---------- */
  function renderPanel() {
    if (!data) return;
    // the quant panel is heavy (Monte Carlo): it is computed when its tab is open
    if (state.ptab !== 'stats') { panelDirty = true; return; }
    panelDirty = false;
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
    // position sizer (from the selected position, else the last drawn one, else a 1.5 ATR stop)
    const pos = (selDrawing() && selDrawing().type === 'position' && selDrawing()) || [...drawings].reverse().find((d) => d.type === 'position');
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
          <div class="note">${isFinite(k) ? `Your journal's Kelly fraction: ${pct(k, 1)} of capital (half-Kelly ${pct(k / 2, 1)}).` : 'Kelly fraction appears once your journal has winning and losing trades.'} ${pos ? 'Prices follow your Long/Short drawing: drag its lines on the chart.' : 'Stop defaults to 1.5 ATR. Draw a Long/Short to set it.'}</div>
          <div class="an-btns"><button class="tbtn an-mini" id="anPsDraw">Draw on chart</button><button class="tbtn an-mini ai" id="anPsTrade">Create trade note</button></div>`)}
      ${wd ? sec('Seasonality by weekday', wdSvg(wd), 'Average daily return by weekday over the period.') : ''}`;

    const on = (id, ev, f) => { const el = $(id); if (el) el[ev] = f; };
    on('anVpLines', 'onclick', () => { add({ type: 'hline', price: vp.poc, name: 'POC', color: Theme.c.yellow }); add({ type: 'hline', price: vp.vah, name: 'VAH', color: Theme.c.accent }); add({ type: 'hline', price: vp.val, name: 'VAL', color: Theme.c.accent }); saveDrawings(); redrawDrawings(); renderDrawList(); });
    on('anHz', 'oninput', (e) => { state.horizon = +e.target.value; save(); clearTimeout(hzTimer); hzTimer = setTimeout(() => (state.ind.mc ? render() : renderPanel()), 150); });
    on('anMcToggle', 'onclick', () => { state.ind.mc = !state.ind.mc; save(); render(); });
    ['anAcc', 'anRisk', 'anEntry', 'anStop'].forEach((id) => on(id, 'oninput', recalcSizer));
    on('anPsDraw', 'onclick', () => { const e = +$('anEntry').value, s = +$('anStop').value; if (!isFinite(e) || !isFinite(s) || e === s) return; finish(add({ type: 'position', side: s < e ? 'long' : 'short', entry: e, stop: s, rr: 2 })); });
    renderDrawList();
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
      s += `<line x1="${x}" x2="${x}" y1="${Y(c.min)}" y2="${Y(c.max)}" stroke="${Theme.c.line2}"/><rect x="${x - 7}" y="${Y(c.p75)}" width="14" height="${Math.max(1, Y(c.p25) - Y(c.p75))}" fill="${Theme.c.accentSoft}" stroke="${Theme.c.accentEdge}"/>`;
      s += `<line x1="${x - 7}" x2="${x + 7}" y1="${Y(c.median)}" y2="${Y(c.median)}" stroke="${Theme.c.accent}"/><circle cx="${x}" cy="${Y(c.current)}" r="4" fill="${Theme.c.yellow}"/>`;
      s += `<text x="${x}" y="${H - 4}" text-anchor="middle" class="su-lbl">${c.window}b</text>`;
    });
    return s + `<text x="4" y="12" class="su-lbl">vol</text><text x="${W - 4}" y="12" text-anchor="end" class="su-lbl" fill="${Theme.c.yellow}">● now</text></svg>`;
  }
  function histSvg(r) {
    if (r.length < 10) return '';
    const W = 300, H = 110, n = 30, m = Quant.mean(r), sd = Quant.std(r), lo = m - 4 * sd, hi = m + 4 * sd, bw = (hi - lo) / n;
    const b = new Array(n).fill(0); r.forEach((x) => { const i = Math.floor((x - lo) / bw); if (i >= 0 && i < n) b[i]++; });
    const mx = Math.max(...b), X = (v) => 6 + ((v - lo) / (hi - lo)) * (W - 12), Y = (v) => H - 16 - (v / mx) * (H - 26);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    b.forEach((v, i) => { const x0 = X(lo + i * bw); s += `<rect x="${x0}" y="${Y(v)}" width="${Math.max(1, X(lo + (i + 1) * bw) - x0 - 1)}" height="${H - 16 - Y(v)}" fill="${lo + (i + 0.5) * bw < 0 ? Theme.c.down : Theme.c.up}" opacity="0.7"/>`; });
    // normal curve with the same mean / std, scaled to the counts
    const pts = []; for (let i = 0; i <= 60; i++) { const v = lo + (i / 60) * (hi - lo); pts.push(`${X(v)},${Y((r.length * bw / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-((v - m) ** 2) / (2 * sd * sd)))}`); }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${Theme.c.accent2}" stroke-width="1.5"/>`;
    return s + `<text x="${X(0)}" y="${H - 3}" text-anchor="middle" class="su-lbl">0</text><text x="${W - 4}" y="12" text-anchor="end" class="su-lbl" fill="${Theme.c.accent2}">normal</text></svg>`;
  }
  function vpSvg(vp, last) {
    const W = 300, H = 150, mx = Math.max(...vp.bins.map((b) => b.volume)) || 1, bh = (H - 8) / vp.bins.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg">`;
    vp.bins.slice().reverse().forEach((b, i) => {
      const inVA = b.from >= vp.val - 1e-9 && b.to <= vp.vah + 1e-9, isPoc = vp.poc >= b.from && vp.poc <= b.to;
      s += `<rect x="70" y="${4 + i * bh}" width="${(b.volume / mx) * (W - 76)}" height="${Math.max(1, bh - 1)}" fill="${isPoc ? Theme.c.yellow : inVA ? Theme.c.accent : Theme.c.line2}" opacity="${isPoc ? 0.9 : 0.75}"/>`;
      if (last >= b.from && last <= b.to) s += `<line x1="66" x2="${W}" y1="${4 + i * bh + bh / 2}" y2="${4 + i * bh + bh / 2}" stroke="${Theme.c.text}" stroke-dasharray="3 3"/>`;
      if (i % 4 === 0) s += `<text x="64" y="${4 + i * bh + bh / 2 + 4}" text-anchor="end" class="su-lbl">${fmt((b.from + b.to) / 2)}</text>`;
    });
    return s + '</svg>';
  }
  function wdSvg(wd) {
    const days = wd.filter((d) => d.count > 0); if (!days.length) return '';
    const W = 300, H = 110, mx = Math.max(...days.map((d) => Math.abs(d.mean))) || 1, bw = (W - 20) / days.length, mid = (H - 18) / 2 + 4;
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let s = `<svg viewBox="0 0 ${W} ${H}" class="su-svg"><line x1="10" x2="${W - 10}" y1="${mid}" y2="${mid}" stroke="${Theme.c.line2}"/>`;
    days.forEach((d, i) => { const h = (Math.abs(d.mean) / mx) * (mid - 8), x = 10 + i * bw; s += `<rect x="${x + 6}" y="${d.mean >= 0 ? mid - h : mid}" width="${bw - 12}" height="${Math.max(1, h)}" rx="2" fill="${d.mean >= 0 ? Theme.c.up : Theme.c.down}" opacity="0.8"/><text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" class="su-lbl">${names[d.day]}</text>`; });
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
      drawings.length ? `My drawings: ${drawings.map((d) => `${d.name ? `"${d.name}" ` : ''}${d.type === 'position' ? d.side : TYPE_NAME[d.type].toLowerCase()} ${describe(d)}`).join('; ')}` : '',
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
    Store.dataKeys().then((k) => { dataKeys = k; }).catch(() => {});
    load(state.symbol);
    setTab(state.tab); setPanelTab(state.ptab);
    clearInterval(refreshTimer);
    // refresh the price every minute while the chart is open (live data only), without moving the chart
    refreshTimer = setInterval(() => { if (view === 'analysis' && state.tab === 'chart' && data && !data.demo && !document.hidden && !drag) load(state.symbol, true); }, 60000);
  }
  function hide() { clearInterval(refreshTimer); if (built) setTool(null); if (window.Desk) Desk.leave(null); }

  /* ---------- Shared with desk.js and watch.js ---------- */
  // Daily closes for many markets: one Yahoo request per 20 symbols in the desktop app, else one per market (4 at a time)
  async function fetchMany(symbols, range = '1y', onProgress) {
    const out = {}, todo = [...new Set(symbols.filter(Boolean))];
    const tick = () => onProgress && onProgress(Object.keys(out).length, todo.length);
    if (Store.desktop) {
      for (let i = 0; i < todo.length; i += 20) {
        try { Object.assign(out, Market.parseYahooSpark(JSON.parse(await Store.market(Market.yahooSparkUrl(todo.slice(i, i + 20), range, '1d'))))); } catch (e) {}
        tick();
      }
    }
    const missing = todo.filter((x) => !out[x]), tfId = range === '1y' ? '1Y' : range === '5y' ? '5Y' : '3M';
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const x = missing[next++];
        try { const d = await fetchSeries(x, tfId); out[x] = { candles: d.candles, demo: !!d.demo, prevClose: null }; } catch (e) {}
        tick();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out;
  }
  const util = { fmt, pct, sgn, fmtBig, rgba, sparkSvg, fetchSeries, fetchMany, COLORS, keys: () => dataKeys, setKeys: (k) => { dataKeys = k; }, current: () => data };
  return { show, hide, load, go, util };
})();
