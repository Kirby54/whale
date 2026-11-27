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

  return { FX, CRYPTO, ALIASES, TIMEFRAMES, tf, normalizeSymbol, kindOf, tradingDays, benchmarkFor, journalName, yahooChartUrl, yahooSearchUrl, parseYahoo, parseYahooSearch, binanceUrl, parseBinance, frankfurterUrl, parseFrankfurter, demoSeries };
});
