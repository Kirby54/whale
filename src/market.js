/* Whale — market data: symbols and free data sources (no API key).
   Yahoo Finance (stocks, ETFs, indices, forex, futures, crypto), Binance (crypto fallback),
   Frankfurter / ECB (forex fallback, daily closes only).
   Used by the Analysis tab (window.Market) and by the Node tests (require('./market.js')). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Market = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FX = 'USD EUR GBP JPY CHF CAD AUD NZD SEK NOK DKK PLN CZK HUF TRY ZAR MXN SGD HKD CNH CNY INR BRL KRW ILS THB'.split(' ');
  const CRYPTO = 'BTC ETH SOL XRP BNB ADA DOGE AVAX DOT LINK MATIC POL LTC TRX TON SHIB ATOM UNI XLM NEAR APT ARB OP SUI PEPE BCH ETC FIL HBAR ICP INJ RNDR TIA SEI WIF BONK AAVE MKR'.split(' ');
  const ALIASES = {
    SPX: '^GSPC', SP500: '^GSPC', 'S&P500': '^GSPC', US500: '^GSPC', NDX: '^NDX', NAS100: '^NDX', US100: '^NDX', NASDAQ: '^IXIC',
    DOW: '^DJI', US30: '^DJI', DJI: '^DJI', DJIA: '^DJI', RUSSELL: '^RUT', RUT: '^RUT', US2000: '^RUT',
    DAX: '^GDAXI', GER40: '^GDAXI', DE40: '^GDAXI', CAC: '^FCHI', CAC40: '^FCHI', FRA40: '^FCHI', FTSE: '^FTSE', UK100: '^FTSE',
    STOXX50: '^STOXX50E', EU50: '^STOXX50E', NIKKEI: '^N225', JP225: '^N225', HSI: '^HSI', VIX: '^VIX',
    GOLD: 'GC=F', XAU: 'GC=F', XAUUSD: 'GC=F', SILVER: 'SI=F', XAG: 'SI=F', XAGUSD: 'SI=F', COPPER: 'HG=F',
    OIL: 'CL=F', WTI: 'CL=F', USOIL: 'CL=F', BRENT: 'BZ=F', UKOIL: 'BZ=F', NATGAS: 'NG=F', GAS: 'NG=F',
    DXY: 'DX-Y.NYB', USDX: 'DX-Y.NYB', US10Y: '^TNX', TNX: '^TNX',
  };
  // Turns what the user types into a Yahoo Finance symbol ("eurusd" -> "EURUSD=X", "btc" -> "BTC-USD", "gold" -> "GC=F")
  function normalizeSymbol(input) {
    const s = String(input || '').trim().toUpperCase().replace(/\s+/g, '').replace('/', '');
    if (!s) return '';
    if (ALIASES[s]) return ALIASES[s];
    if (/[=^.]/.test(s) || /-/.test(s)) return s; // already a Yahoo symbol
    if (CRYPTO.includes(s)) return s + '-USD';
    for (const q of ['USDT', 'USDC', 'USD', 'EUR']) {
      if (s.endsWith(q) && CRYPTO.includes(s.slice(0, -q.length))) return s.slice(0, -q.length) + '-' + (q === 'EUR' ? 'EUR' : 'USD');
    }
    const fx = s.match(/^([A-Z]{3})([A-Z]{3})$/);
    if (fx && FX.includes(fx[1]) && FX.includes(fx[2])) return `${fx[1]}${fx[2]}=X`;
    return s;
  }
  const kindOf = (sym) => (/=X$/.test(sym) ? 'fx' : /-(USD|EUR)$/.test(sym) && CRYPTO.includes(sym.split('-')[0]) ? 'crypto' : /=F$/.test(sym) ? 'future' : /^\^/.test(sym) ? 'index' : 'stock');
  // Trading days per year, to annualize volatility
  const tradingDays = (kind) => (kind === 'crypto' ? 365 : kind === 'fx' ? 260 : 252);
  // Benchmark used for beta / correlation
  const benchmarkFor = (kind) => (kind === 'crypto' ? 'BTC-USD' : kind === 'fx' ? 'DX-Y.NYB' : '^GSPC');
  // Short name for the journal (TSLA, EURUSD, BTC, GOLD…)
  function journalName(sym) {
    const alias = Object.keys(ALIASES).find((k) => ALIASES[k] === sym && /^[A-Z]+$/.test(k) && k.length > 3);
    if (/=X$/.test(sym)) return sym.replace('=X', '');
    if (/-(USD|EUR)$/.test(sym)) return sym.split('-')[0];
    return alias || sym.replace(/^\^/, '');
  }

  // Readable names for lists and tiles ("^GSPC" -> "S&P 500", "EURUSD=X" -> "EUR/USD", "BTC-USD" -> "BTC")
  const NAMES = {
    '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones', '^RUT': 'Russell 2000', '^GDAXI': 'DAX', '^FCHI': 'CAC 40',
    '^FTSE': 'FTSE 100', '^STOXX50E': 'Euro Stoxx 50', '^N225': 'Nikkei 225', '^HSI': 'Hang Seng', '^VIX': 'VIX', '^TNX': 'US 10Y yield',
    '^IRX': 'US 3M yield', '^FVX': 'US 5Y yield', '^TYX': 'US 30Y yield', 'GC=F': 'Gold', 'SI=F': 'Silver', 'HG=F': 'Copper', 'CL=F': 'Oil WTI',
    'BZ=F': 'Brent', 'NG=F': 'Natural gas', 'ZC=F': 'Corn', 'ZW=F': 'Wheat', 'DX-Y.NYB': 'Dollar index',
  };
  function displayName(sym) {
    if (NAMES[sym]) return NAMES[sym];
    if (/=X$/.test(sym)) return sym.slice(0, 3) + '/' + sym.slice(3, 6);
    if (/-(USD|EUR)$/.test(sym) && CRYPTO.includes(sym.split('-')[0])) return sym.split('-')[0];
    return sym;
  }

  /* ---------- Timeframes ---------- */
  const TIMEFRAMES = [
    { id: '1D', range: '1d', interval: '5m', days: 1 },
    { id: '5D', range: '5d', interval: '15m', days: 5 },
    { id: '1M', range: '1mo', interval: '60m', days: 31 },
    { id: '3M', range: '3mo', interval: '1d', days: 92 },
    { id: '6M', range: '6mo', interval: '1d', days: 183 },
    { id: '1Y', range: '1y', interval: '1d', days: 366 },
    { id: '5Y', range: '5y', interval: '1wk', days: 1827 },
    { id: 'MAX', range: 'max', interval: '1mo', days: null },
  ];
  const tf = (id) => TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES[5];

  /* ---------- Yahoo Finance ---------- */
  const yahooChartUrl = (sym, tfId) => { const t = tf(tfId); return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${t.range}&interval=${t.interval}&includePrePost=false`; };
  const yahooSearchUrl = (q) => `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
  function parseYahoo(json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r) throw new Error((json && json.chart && json.chart.error && json.chart.error.description) || 'Symbol not found');
    const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, ts = r.timestamp || [];
    const candles = [];
    ts.forEach((t, i) => {
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
      if ([o, h, l, c].every((x) => typeof x === 'number' && isFinite(x))) {
        if (candles.length && candles[candles.length - 1].time === t) return;
        candles.push({ time: t, open: o, high: h, low: l, close: c, volume: (q.volume && q.volume[i]) || 0 });
      }
    });
    if (!candles.length) throw new Error('No price data');
    const m = r.meta || {};
    return {
      candles,
      meta: { symbol: m.symbol, name: m.longName || m.shortName || m.symbol, currency: m.currency || '', exchange: m.fullExchangeName || m.exchangeName || '', type: m.instrumentType || '', price: m.regularMarketPrice ?? candles[candles.length - 1].close, prevClose: m.chartPreviousClose ?? m.previousClose ?? null },
      source: 'Yahoo Finance',
    };
  }
  function parseYahooSearch(json) {
    return ((json && json.quotes) || []).filter((q) => q.symbol).map((q) => ({ symbol: q.symbol, name: q.longname || q.shortname || q.symbol, exchange: q.exchDisp || q.exchange || '', type: q.typeDisp || q.quoteType || '' }));
  }

  /* ---------- Binance (crypto fallback) ---------- */
  const BINANCE_INTERVAL = { '5m': '5m', '15m': '15m', '60m': '1h', '1d': '1d', '1wk': '1w', '1mo': '1M' };
  function binanceUrl(sym, tfId, now = Date.now()) {
    const t = tf(tfId), pair = sym.split('-')[0] + 'USDT';
    const start = t.days ? `&startTime=${now - t.days * 86400000}` : '';
    return `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${BINANCE_INTERVAL[t.interval]}&limit=1000${start}`;
  }
  function parseBinance(json, sym) {
    if (!Array.isArray(json) || !json.length) throw new Error('No price data');
    const candles = json.map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    const last = candles[candles.length - 1];
    return { candles, meta: { symbol: sym, name: sym.split('-')[0] + ' / USDT', currency: 'USDT', exchange: 'Binance', type: 'CRYPTOCURRENCY', price: last.close, prevClose: candles.length > 1 ? candles[candles.length - 2].close : null }, source: 'Binance' };
  }

  /* ---------- Frankfurter / ECB (forex fallback, daily closes) ---------- */
  function frankfurterUrl(sym, tfId, now = new Date()) {
    const t = tf(tfId), from = sym.slice(0, 3), to = sym.slice(3, 6);
    const start = new Date(now.getTime() - (t.days || 3650) * 86400000).toISOString().slice(0, 10);
    return `https://api.frankfurter.dev/v1/${start}..?from=${from}&to=${to}`;
  }
  function parseFrankfurter(json, sym) {
    const to = sym.slice(3, 6), rates = (json && json.rates) || {};
    // closes only: each bar opens at the previous close so the chart still shows up and down candles
    const closes = Object.keys(rates).sort().map((d) => ({ time: Math.floor(Date.parse(d + 'T00:00:00Z') / 1000), close: rates[d][to] })).filter((k) => typeof k.close === 'number');
    const candles = closes.map((k, i) => { const o = i ? closes[i - 1].close : k.close; return { time: k.time, open: o, high: Math.max(o, k.close), low: Math.min(o, k.close), close: k.close, volume: 0 }; });
    if (!candles.length) throw new Error('No price data');
    const last = candles[candles.length - 1];
    return { candles, meta: { symbol: sym, name: `${sym.slice(0, 3)} / ${to}`, currency: to, exchange: 'ECB reference rates', type: 'CURRENCY', price: last.close, prevClose: candles.length > 1 ? candles[candles.length - 2].close : null }, source: 'ECB via Frankfurter (daily closes only)', closeOnly: true };
  }

  /* ---------- Day key: aligns daily bars of different markets on the same calendar day ----------
     Yahoo stamps daily bars at the session open (stocks ~14:30 UTC, crypto 00:00 UTC, futures ~04:00 UTC)
     but forex at London midnight (23:00 UTC the day before in summer): +2 h puts every market on its own day. */
  const dayKey = (time, kind) => new Date((time + (kind === 'fx' ? 7200 : 0)) * 1000).toISOString().slice(0, 10);

  /* ---------- Command bar, Bloomberg style: "TSLA GP", "AAPL DES", "ECO" ---------- */
  const FUNCTIONS = {
    GP: 'chart', G: 'chart', CHART: 'chart', HP: 'chart',
    DES: 'company', FA: 'company', CF: 'company', COMPANY: 'company',
    N: 'news', CN: 'news', NEWS: 'news',
    ALRT: 'alert', ALERT: 'alert',
  };
  const GLOBAL = {
    W: 'watch', WATCH: 'watch', WL: 'watch',
    ECO: 'macro', MACRO: 'macro', ECST: 'macro',
    EQS: 'screener', SCREEN: 'screener', SCREENER: 'screener', MOST: 'screener',
    CORR: 'corr', CORRELATION: 'corr',
    GRID: 'grid', MULTI: 'grid', COMP: 'grid',
    TOP: 'topnews', NEWS: 'topnews',
  };
  // Returns { fn, symbol?, op?, price? } or null when the text is not a command
  function parseCommand(text) {
    const parts = String(text || '').trim().replace(/<GO>$/i, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const up = parts.map((p) => p.toUpperCase());
    if (up.length === 1 && GLOBAL[up[0]]) return { fn: GLOBAL[up[0]] };
    const fnAt = up.findIndex((p, i) => i > 0 && FUNCTIONS[p]);
    if (fnAt > 0) {
      const symbol = normalizeSymbol(parts.slice(0, fnAt).join(''));
      const fn = FUNCTIONS[up[fnAt]];
      if (fn === 'alert') {
        const rest = up.slice(fnAt + 1).join(' ').match(/^([<>])?\s*([\d.,]+)$/);
        if (!rest) return { fn, symbol };
        return { fn, symbol, op: rest[1] || null, price: +rest[2].replace(/,/g, '') };
      }
      return { fn, symbol };
    }
    return null;
  }
  // Whether plain text looks like a market symbol worth offering a chart for ("tsla", "eurusd", "^GSPC", "gold")
  const looksLikeSymbol = (text) => { const s = String(text || '').trim(); return /^[\^]?[A-Za-z0-9.=\-/&]{1,12}$/.test(s) && /[A-Za-z]/.test(s); };

  /* ---------- Yahoo spark: closes for many symbols in one request (watchlist, screener) ---------- */
  const yahooSparkUrl = (symbols, range = '1y', interval = '1d') => `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`;
  function parseYahooSpark(json) {
    const out = {};
    Object.keys(json || {}).forEach((sym) => {
      const r = json[sym]; if (!r || !Array.isArray(r.timestamp) || !Array.isArray(r.close)) return;
      const candles = [];
      r.timestamp.forEach((t, i) => { const c = r.close[i]; if (typeof c === 'number' && isFinite(c) && (!candles.length || candles[candles.length - 1].time !== t)) candles.push({ time: t, open: c, high: c, low: c, close: c, volume: 0 }); });
      if (candles.length) out[r.symbol || sym] = { candles, prevClose: r.chartPreviousClose ?? null };
    });
    return out;
  }

  /* ---------- SEC EDGAR: company filings of US-listed companies (free, no key) ---------- */
  const secSearchUrl = (q) => `https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(q)}`;
  function parseSecSearch(json, ticker) {
    const hits = ((json && json.hits && json.hits.hits) || []).map((h) => ({ cik: +h._id, name: String((h._source && h._source.entity) || '').replace(/\s*\([^)]*\)\s*$/, ''), tickers: String((h._source && h._source.tickers) || '').split(/[,\s]+/).filter(Boolean) }));
    const t = String(ticker || '').toUpperCase().replace('-', '.');
    return hits.find((h) => h.tickers.some((x) => x.toUpperCase() === t || x.toUpperCase().replace('-', '.') === t)) || null;
  }
  const secFactsUrl = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
  const DAY = 86400000;
  // Turns the (very large) XBRL "company facts" into a few clean series: yearly and quarterly results, latest balance sheet
  function parseSecFacts(json) {
    const g = (json && json.facts && json.facts['us-gaap']) || {}, dei = (json && json.facts && json.facts.dei) || {};
    const unitsOf = (c) => (c && c.units ? c.units[Object.keys(c.units)[0]] || [] : []);
    // the concept with the most recent data among equivalent names (companies use different tags for revenue, etc.)
    const pick = (names) => {
      let best = null, bestEnd = '';
      names.forEach((n) => { const arr = unitsOf(g[n]); const end = arr.reduce((m, x) => (x.end > m ? x.end : m), ''); if (arr.length && end > bestEnd) { best = arr; bestEnd = end; } });
      return best || [];
    };
    const dur = (x) => (Date.parse(x.end) - Date.parse(x.start)) / DAY;
    // one value per period end, from the latest filing
    const byEnd = (arr, keep) => { const m = new Map(); arr.filter(keep).forEach((x) => { const o = m.get(x.end); if (!o || x.filed > o.filed) m.set(x.end, x); }); return [...m.values()].sort((a, b) => a.end.localeCompare(b.end)); };
    const annual = (arr) => byEnd(arr, (x) => x.start && dur(x) > 340 && dur(x) < 380);
    const quarterly = (arr) => byEnd(arr, (x) => x.start && dur(x) > 80 && dur(x) < 100);
    const instant = (arr) => byEnd(arr, (x) => !x.start);
    const C = {
      revenue: pick(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'RevenuesNetOfInterestExpense']),
      grossProfit: pick(['GrossProfit']),
      opIncome: pick(['OperatingIncomeLoss']),
      netIncome: pick(['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic']),
      eps: pick(['EarningsPerShareDiluted', 'EarningsPerShareBasic']),
      ocf: pick(['NetCashProvidedByUsedInOperatingActivities']),
      capex: pick(['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']),
      assets: pick(['Assets']), liabilities: pick(['Liabilities']), equity: pick(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']),
      cash: pick(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']),
      debt: pick(['LongTermDebt', 'LongTermDebtNoncurrent']),
    };
    const series = (kind) => {
      const keys = ['revenue', 'grossProfit', 'opIncome', 'netIncome', 'eps', 'ocf', 'capex'], rows = new Map();
      keys.forEach((k) => kind(C[k]).forEach((x) => { const r = rows.get(x.end) || { end: x.end, fy: x.fy, fp: x.fp }; r[k] = x.val; rows.set(x.end, r); }));
      return [...rows.values()].filter((r) => r.revenue != null || r.netIncome != null).sort((a, b) => a.end.localeCompare(b.end));
    };
    const last = (arr) => { const v = instant(arr); return v.length ? v[v.length - 1] : null; };
    const so = unitsOf(dei.EntityCommonStockSharesOutstanding).slice().sort((a, b) => a.end.localeCompare(b.end));
    const allYears = series(annual), allQuarters = series(quarterly);
    // annual reports do not state the 4th quarter alone: it is the year minus its first three quarters
    allYears.forEach((y) => {
      const from = new Date(Date.parse(y.end) - 360 * DAY).toISOString().slice(0, 10);
      const qs = allQuarters.filter((q) => q.end > from && q.end < y.end);
      if (qs.length !== 3 || allQuarters.some((q) => q.end === y.end)) return;
      const q4 = { end: y.end, fy: y.fy, fp: 'Q4', derived: true };
      ['revenue', 'grossProfit', 'opIncome', 'netIncome', 'eps', 'ocf', 'capex'].forEach((k) => { if (y[k] != null && qs.every((q) => q[k] != null)) q4[k] = y[k] - qs.reduce((s, q) => s + q[k], 0); });
      allQuarters.push(q4);
    });
    allQuarters.sort((a, b) => a.end.localeCompare(b.end));
    const years = allYears.slice(-6), quarters = allQuarters.slice(-8);
    // trailing twelve months from the last four quarters when they are consecutive, otherwise the last fiscal year
    const q4 = quarters.slice(-4);
    const consecutive = q4.length === 4 && (Date.parse(q4[3].end) - Date.parse(q4[0].end)) / DAY < 300;
    const ttm = {};
    ['revenue', 'netIncome', 'eps', 'opIncome', 'grossProfit'].forEach((k) => {
      ttm[k] = consecutive && q4.every((q) => q[k] != null) ? q4.reduce((s, q) => s + q[k], 0) : years.length ? years[years.length - 1][k] ?? null : null;
    });
    const bal = (k) => { const x = last(C[k]); return x ? { value: x.val, end: x.end } : null; };
    return {
      name: json && json.entityName, cik: json && json.cik,
      years, quarters, ttm, ttmFromQuarters: consecutive,
      balance: { assets: bal('assets'), liabilities: bal('liabilities'), equity: bal('equity'), cash: bal('cash'), debt: bal('debt') },
      shares: so.length ? so[so.length - 1].val : null,
    };
  }
  // Ratios from the filings and the current price
  function fundamentals(f, price) {
    const v = (x) => (x ? x.value : null), r = (a, b) => (a != null && b ? a / b : null);
    const y = f.years, ly = y[y.length - 1], py = y[y.length - 2];
    const cap = f.shares && price ? f.shares * price : null;
    return {
      marketCap: cap,
      pe: f.ttm.eps > 0 && price ? price / f.ttm.eps : null,
      ps: r(cap, f.ttm.revenue),
      grossMargin: r(f.ttm.grossProfit, f.ttm.revenue),
      opMargin: r(f.ttm.opIncome, f.ttm.revenue),
      netMargin: r(f.ttm.netIncome, f.ttm.revenue),
      roe: r(f.ttm.netIncome, v(f.balance.equity)),
      debtToEquity: r(v(f.balance.debt), v(f.balance.equity)),
      revenueGrowth: ly && py && ly.revenue != null && py.revenue ? ly.revenue / py.revenue - 1 : null,
      fcf: ly && ly.ocf != null ? ly.ocf - (ly.capex || 0) : null,
    };
  }

  /* ---------- FRED (US economy): needs the user's own free key, added by the desktop app ---------- */
  const MACRO = [
    { id: 'CPIAUCSL', name: 'Inflation (CPI)', unit: '% y/y', yoy: true },
    { id: 'CPILFESL', name: 'Core inflation', unit: '% y/y', yoy: true },
    { id: 'UNRATE', name: 'Unemployment', unit: '%' },
    { id: 'FEDFUNDS', name: 'Fed funds rate', unit: '%' },
    { id: 'A191RL1Q225SBEA', name: 'GDP growth', unit: '% q/q ann.' },
    { id: 'ICSA', name: 'Jobless claims', unit: 'k', scale: 0.001 },
    { id: 'T10Y2Y', name: '10Y − 2Y spread', unit: 'pts' },
    { id: 'BAMLH0A0HYM2', name: 'High-yield spread', unit: '%' },
    { id: 'MORTGAGE30US', name: '30Y mortgage', unit: '%' },
    { id: 'M2SL', name: 'Money supply M2', unit: '% y/y', yoy: true },
  ];
  // The key itself is never in this URL: the desktop app appends it
  const fredUrl = (id, start) => `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&file_type=json&observation_start=${start}`;
  function parseFred(json, opts = {}) {
    let pts = ((json && json.observations) || []).filter((o) => o.value !== '.' && isFinite(+o.value)).map((o) => ({ date: o.date, value: +o.value * (opts.scale || 1) }));
    if (opts.yoy) {
      const byDate = new Map(pts.map((p) => [p.date, p.value]));
      pts = pts.map((p) => { const d = new Date(p.date + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - 1); const prev = byDate.get(d.toISOString().slice(0, 10)); return prev ? { date: p.date, value: (p.value / prev - 1) * 100 } : null; }).filter(Boolean);
    }
    return pts;
  }
  // Market-based macro that needs no key (Yahoo): the yield curve and risk gauges
  const RATES = [{ sym: '^IRX', name: '3M' }, { sym: '^FVX', name: '5Y' }, { sym: '^TNX', name: '10Y' }, { sym: '^TYX', name: '30Y' }];
  const GAUGES = [
    { sym: '^VIX', name: 'VIX (fear gauge)' }, { sym: 'DX-Y.NYB', name: 'Dollar index' }, { sym: '^TNX', name: 'US 10Y yield' },
    { sym: 'GC=F', name: 'Gold' }, { sym: 'CL=F', name: 'Oil (WTI)' }, { sym: 'HG=F', name: 'Copper' },
    { sym: '^GSPC', name: 'S&P 500' }, { sym: 'BTC-USD', name: 'Bitcoin' },
  ];

  /* ---------- News (free RSS feeds) ---------- */
  const yahooNewsUrl = (sym) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`;
  const googleNewsUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
  const strip = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  function parseRss(xml, feed) {
    const items = [];
    String(xml || '').replace(/<item\b[^>]*>([\s\S]*?)<\/item>/g, (_, body) => {
      const tag = (t) => { const m = body.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`)); return m ? m[1] : ''; };
      let title = strip(tag('title')), source = strip(tag('source'));
      // Google News puts the outlet at the end of the title: "Headline - Outlet"
      if (!source) { const m = title.match(/^(.*) - ([^-]{2,40})$/); if (m && feed === 'google') { title = m[1]; source = m[2]; } }
      else if (title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
      const link = decode(tag('link')).trim(), time = Date.parse(decode(tag('pubDate')));
      const desc = feed === 'google' ? '' : strip(tag('description'));
      if (title && /^https:\/\//.test(link)) items.push({ title, link, source: source || (feed === 'yahoo' ? 'Yahoo Finance' : ''), time: isFinite(time) ? time : 0, desc });
      return '';
    });
    return items;
  }
  // Merges feeds, newest first, without duplicate headlines
  function mergeNews(lists, max = 60) {
    const seen = new Set(), out = [];
    lists.flat().sort((a, b) => b.time - a.time).forEach((n) => { const k = n.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); if (!seen.has(k)) { seen.add(k); out.push(n); } });
    return out.slice(0, max);
  }

  /* ---------- Optional data with the user's own key (the desktop app appends the key) ---------- */
  const POLY_TF = { '5m': [5, 'minute'], '15m': [15, 'minute'], '60m': [1, 'hour'], '1d': [1, 'day'], '1wk': [1, 'week'], '1mo': [1, 'month'] };
  function polygonUrl(sym, tfId, now = Date.now()) {
    const t = tf(tfId), [n, unit] = POLY_TF[t.interval], from = new Date(now - (t.days || 365 * 20) * DAY).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
    return `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym.replace('-', '.'))}/range/${n}/${unit}/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
  }
  function parsePolygon(json, sym) {
    const res = (json && json.results) || [];
    if (!res.length) throw new Error((json && (json.error || json.message)) || 'No price data');
    const candles = res.map((k) => ({ time: Math.floor(k.t / 1000), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v || 0 }));
    const last = candles[candles.length - 1];
    return { candles, meta: { symbol: sym, name: sym, currency: 'USD', exchange: 'Polygon.io', type: 'EQUITY', price: last.close, prevClose: null }, source: 'Polygon.io (your key)' };
  }
  const finnhubQuoteUrl = (sym) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}`;
  const parseFinnhubQuote = (json) => (json && typeof json.c === 'number' && json.c > 0 ? { price: json.c, change: json.d, changePct: json.dp / 100, prevClose: json.pc, time: json.t } : null);

  /* ---------- Lists ---------- */
  const DEFAULT_WATCH = ['^GSPC', '^NDX', 'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GC=F', 'CL=F', '^VIX', 'AAPL', 'NVDA', 'TSLA'];
  const UNIVERSES = {
    'US mega caps': ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'AVGO', 'JPM', 'LLY', 'V', 'UNH', 'XOM', 'MA', 'COST', 'HD', 'PG', 'JNJ', 'NFLX', 'AMD', 'CRM', 'ORCL', 'BAC', 'KO', 'PEP', 'WMT', 'ADBE', 'CSCO', 'MCD', 'INTC', 'DIS', 'NKE', 'PLTR', 'UBER', 'COIN'],
    Crypto: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'BNB-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD', 'LINK-USD', 'LTC-USD', 'TRX-USD', 'ATOM-USD', 'UNI-USD', 'XLM-USD', 'NEAR-USD'],
    Forex: ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X', 'EURGBP=X', 'EURJPY=X', 'GBPJPY=X', 'EURCHF=X', 'AUDJPY=X', 'USDMXN=X', 'USDZAR=X', 'USDTRY=X'],
    'Indices & commodities': ['^GSPC', '^NDX', '^DJI', '^RUT', '^GDAXI', '^FCHI', '^FTSE', '^STOXX50E', '^N225', '^HSI', '^VIX', 'GC=F', 'SI=F', 'HG=F', 'CL=F', 'BZ=F', 'NG=F', 'ZC=F', 'ZW=F', 'DX-Y.NYB', '^TNX'],
  };

  /* ---------- Demo data (browser mode only, clearly labeled) ---------- */
  function demoSeries(sym, tfId) {
    const t = tf(tfId); let x = [...sym].reduce((a, c) => a + c.charCodeAt(0), 11);
    const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const step = { '5m': 300, '15m': 900, '60m': 3600, '1d': 86400, '1wk': 604800, '1mo': 2592000 }[t.interval];
    const n = 260, end = Math.floor(Date.now() / 1000 / step) * step, candles = [];
    let p = 100;
    for (let i = 0; i < n; i++) {
      const o = p, c = o * Math.exp(0.0004 + 0.018 * (rnd() - 0.5) * 2), h = Math.max(o, c) * (1 + rnd() * 0.01), l = Math.min(o, c) * (1 - rnd() * 0.01);
      candles.push({ time: end - (n - 1 - i) * step, open: o, high: h, low: l, close: c, volume: Math.round(1e5 * (0.5 + rnd())) }); p = c;
    }
    return { candles, meta: { symbol: sym, name: sym + ' (demo data)', currency: '', exchange: '', type: '', price: p, prevClose: candles[n - 2].close }, source: 'Demo data: live prices work in the desktop app', demo: true };
  }

  return {
    FX, CRYPTO, ALIASES, TIMEFRAMES, tf, normalizeSymbol, kindOf, tradingDays, benchmarkFor, journalName, displayName, dayKey,
    FUNCTIONS, GLOBAL, parseCommand, looksLikeSymbol, DEFAULT_WATCH, UNIVERSES,
    yahooChartUrl, yahooSearchUrl, parseYahoo, parseYahooSearch, yahooSparkUrl, parseYahooSpark,
    binanceUrl, parseBinance, frankfurterUrl, parseFrankfurter, demoSeries,
    secSearchUrl, parseSecSearch, secFactsUrl, parseSecFacts, fundamentals,
    MACRO, fredUrl, parseFred, RATES, GAUGES,
    yahooNewsUrl, googleNewsUrl, parseRss, mergeNews,
    polygonUrl, parsePolygon, finnhubQuoteUrl, parseFinnhubQuote,
  };
});
