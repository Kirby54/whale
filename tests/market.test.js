// Tests for symbols and data source parsing. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/market.js');

test('normalizeSymbol: forex, crypto, indices, commodities, stocks', () => {
  assert.equal(M.normalizeSymbol('eurusd'), 'EURUSD=X');
  assert.equal(M.normalizeSymbol('EUR/USD'), 'EURUSD=X');
  assert.equal(M.normalizeSymbol('btc'), 'BTC-USD');
  assert.equal(M.normalizeSymbol('BTCUSDT'), 'BTC-USD');
  assert.equal(M.normalizeSymbol('ethusd'), 'ETH-USD');
  assert.equal(M.normalizeSymbol('xauusd'), 'GC=F');
  assert.equal(M.normalizeSymbol('gold'), 'GC=F');
  assert.equal(M.normalizeSymbol('spx'), '^GSPC');
  assert.equal(M.normalizeSymbol('us30'), '^DJI');
  assert.equal(M.normalizeSymbol('tsla'), 'TSLA');
  assert.equal(M.normalizeSymbol('MC.PA'), 'MC.PA');
  assert.equal(M.normalizeSymbol('^VIX'), '^VIX');
});

test('kindOf, tradingDays, benchmark and journal name', () => {
  assert.equal(M.kindOf('EURUSD=X'), 'fx'); assert.equal(M.kindOf('BTC-USD'), 'crypto'); assert.equal(M.kindOf('GC=F'), 'future');
  assert.equal(M.kindOf('^GSPC'), 'index'); assert.equal(M.kindOf('AAPL'), 'stock');
  assert.equal(M.tradingDays('crypto'), 365); assert.equal(M.benchmarkFor('stock'), '^GSPC');
  assert.equal(M.journalName('EURUSD=X'), 'EURUSD'); assert.equal(M.journalName('BTC-USD'), 'BTC'); assert.equal(M.journalName('GC=F'), 'GOLD'); assert.equal(M.journalName('TSLA'), 'TSLA');
});

test('parseYahoo: skips empty rows and reads the meta', () => {
  const json = { chart: { result: [{ meta: { symbol: 'TSLA', longName: 'Tesla, Inc.', currency: 'USD', regularMarketPrice: 252, chartPreviousClose: 240 }, timestamp: [1, 2, 3],
    indicators: { quote: [{ open: [240, null, 250], high: [245, null, 255], low: [238, null, 248], close: [244, null, 252], volume: [100, null, 120] }] } }] } };
  const d = M.parseYahoo(json);
  assert.equal(d.candles.length, 2);
  assert.deepEqual(d.candles[1], { time: 3, open: 250, high: 255, low: 248, close: 252, volume: 120 });
  assert.equal(d.meta.name, 'Tesla, Inc.'); assert.equal(d.meta.prevClose, 240); assert.equal(d.source, 'Yahoo Finance');
  assert.throws(() => M.parseYahoo({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } }), /delisted/);
});

test('parseYahooSearch', () => {
  assert.deepEqual(M.parseYahooSearch({ quotes: [{ symbol: 'TSLA', longname: 'Tesla, Inc.', exchDisp: 'NASDAQ', typeDisp: 'Equity' }, { name: 'no symbol' }] }),
    [{ symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', type: 'Equity' }]);
});

test('Binance: url and parsing', () => {
  assert.equal(M.binanceUrl('BTC-USD', '1Y', 1000 * 86400000), `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${634 * 86400000}`);
  const d = M.parseBinance([[1000, '1', '2', '0.5', '1.5', '10'], [2000, '1.5', '3', '1', '2.5', '20']], 'BTC-USD');
  assert.deepEqual(d.candles[1], { time: 2, open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 });
  assert.equal(d.meta.prevClose, 1.5);
});

test('Frankfurter: url and parsing', () => {
  assert.equal(M.frankfurterUrl('EURUSD=X', '1M', new Date('2026-11-27T12:00:00Z')), 'https://api.frankfurter.dev/v1/2026-10-27..?from=EUR&to=USD');
  const d = M.parseFrankfurter({ rates: { '2026-10-02': { USD: 1.12 }, '2026-10-01': { USD: 1.13 } } }, 'EURUSD=X');
  assert.deepEqual(d.candles.map((k) => k.close), [1.13, 1.12]);
  assert.equal(d.closeOnly, true);
  assert.deepEqual([d.candles[1].open, d.candles[1].high, d.candles[1].low], [1.13, 1.13, 1.12], 'opens at the previous close');
});

test('demo series is deterministic and labeled', () => {
  const a = M.demoSeries('AAPL', '1Y'), b = M.demoSeries('AAPL', '1Y');
  assert.equal(a.candles.length, 260); assert.equal(a.demo, true);
  assert.deepEqual(a.candles.map((k) => k.close), b.candles.map((k) => k.close));
});

test('command bar: symbol functions, global functions, alerts', () => {
  assert.deepEqual(M.parseCommand('tsla gp'), { fn: 'chart', symbol: 'TSLA' });
  assert.deepEqual(M.parseCommand('AAPL DES <GO>'), { fn: 'company', symbol: 'AAPL' });
  assert.deepEqual(M.parseCommand('eur usd n'), { fn: 'news', symbol: 'EURUSD=X' });
  assert.deepEqual(M.parseCommand('eco'), { fn: 'macro' });
  assert.deepEqual(M.parseCommand('W'), { fn: 'watch' });
  assert.deepEqual(M.parseCommand('btc alrt > 70,000'), { fn: 'alert', symbol: 'BTC-USD', op: '>', price: 70000 });
  assert.deepEqual(M.parseCommand('gold alert 2500'), { fn: 'alert', symbol: 'GC=F', op: null, price: 2500 });
  assert.equal(M.parseCommand('why am I losing'), null);
  assert.equal(M.looksLikeSymbol('tsla'), true);
  assert.equal(M.looksLikeSymbol('why am I losing'), false);
});

test('day key puts forex, stocks and crypto daily bars on the same day', () => {
  assert.equal(M.dayKey(Date.parse('2026-11-25T23:00:00Z') / 1000, 'fx'), '2026-11-26');
  assert.equal(M.dayKey(Date.parse('2026-11-26T14:30:00Z') / 1000, 'stock'), '2026-11-26');
  assert.equal(M.dayKey(Date.parse('2026-11-26T00:00:00Z') / 1000, 'crypto'), '2026-11-26');
});

test('Yahoo spark: closes for several symbols', () => {
  const d = M.parseYahooSpark({ MSFT: { symbol: 'MSFT', timestamp: [1, 2, 3], close: [10, null, 12], chartPreviousClose: 9 }, BAD: { symbol: 'BAD' } });
  assert.deepEqual(Object.keys(d), ['MSFT']);
  assert.deepEqual(d.MSFT.candles.map((k) => k.close), [10, 12]);
  assert.equal(d.MSFT.prevClose, 9);
});

test('SEC: ticker search and company facts', () => {
  const hit = M.parseSecSearch({ hits: { hits: [{ _id: '1318605', _source: { entity: 'Tesla, Inc. (TSLA)', tickers: 'TSLA' } }] } }, 'TSLA');
  assert.deepEqual(hit, { cik: 1318605, name: 'Tesla, Inc.', tickers: ['TSLA'] });
  assert.equal(M.secFactsUrl(320193), 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
  const fy = (y, val, filed) => ({ start: `${y - 1}-10-01`, end: `${y}-09-30`, val, fy: y, fp: 'FY', form: '10-K', filed: filed || `${y}-11-01` });
  const q = (end, start, val) => ({ start, end, val, fp: 'Q', form: '10-Q', filed: end });
  const f = M.parseSecFacts({
    entityName: 'Example Inc.', cik: 1,
    facts: {
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2026-10-20', val: 1000 }] } } },
      'us-gaap': {
        Revenues: { units: { USD: [fy(2018, 1)] } }, // old tag: the newer one wins
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [fy(2025, 400), fy(2026, 500), fy(2026, 510, '2027-01-15'), q('2025-12-31', '2025-10-01', 120), q('2026-03-31', '2026-01-01', 125), q('2026-06-30', '2026-04-01', 130), q('2026-09-30', '2026-07-01', 135)] } },
        NetIncomeLoss: { units: { USD: [fy(2025, 40), fy(2026, 60)] } },
        EarningsPerShareDiluted: { units: { 'USD/shares': [fy(2026, 2)] } },
        StockholdersEquity: { units: { USD: [{ end: '2025-09-30', val: 200 }, { end: '2026-09-30', val: 300 }] } },
      },
    },
  });
  assert.deepEqual(f.years.map((y) => [y.end, y.revenue]), [['2025-09-30', 400], ['2026-09-30', 510]], 'latest filing wins for a period');
  assert.equal(f.ttm.revenue, 510, 'four consecutive quarters: 120+125+130+135');
  assert.equal(f.ttmFromQuarters, true);
  assert.equal(f.balance.equity.value, 300);
  const r = M.fundamentals(f, 50);
  assert.equal(r.marketCap, 50000); assert.equal(r.roe, 60 / 300);
  assert.ok(Math.abs(r.revenueGrowth - (510 / 400 - 1)) < 1e-12);
});

test('FRED: values and year-over-year change', () => {
  const obs = { observations: [{ date: '2025-01-01', value: '100' }, { date: '2025-02-01', value: '.' }, { date: '2026-01-01', value: '103' }] };
  assert.deepEqual(M.parseFred(obs), [{ date: '2025-01-01', value: 100 }, { date: '2026-01-01', value: 103 }]);
  const yoy = M.parseFred(obs, { yoy: true });
  assert.equal(yoy.length, 1); assert.ok(Math.abs(yoy[0].value - 3) < 1e-9);
  assert.ok(!M.fredUrl('UNRATE', '2020-01-01').includes('api_key'), 'the key is never in the URL built here');
});

test('news: RSS parsing and merging', () => {
  const yahoo = '<rss><channel><item><title>Tesla &amp; the market</title><link>https://finance.yahoo.com/a</link><pubDate>Thu, 26 Nov 2026 22:35:02 +0000</pubDate><description>Short &lt;b&gt;text&lt;/b&gt;</description></item>'
    + '<item><title>Bad link</title><link>javascript:alert(1)</link></item></channel></rss>';
  const google = '<rss><channel><item><title>Tesla &amp; the market - Reuters</title><link>https://news.google.com/x</link><pubDate>Fri, 27 Nov 2026 08:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item></channel></rss>';
  const a = M.parseRss(yahoo, 'yahoo'), b = M.parseRss(google, 'google');
  assert.equal(a.length, 1, 'only https links are kept');
  assert.equal(a[0].title, 'Tesla & the market'); assert.equal(a[0].desc, 'Short text'); assert.equal(a[0].source, 'Yahoo Finance');
  assert.equal(b[0].title, 'Tesla & the market'); assert.equal(b[0].source, 'Reuters');
  const merged = M.mergeNews([a, b]);
  assert.equal(merged.length, 1, 'same headline only once'); assert.equal(merged[0].source, 'Reuters', 'newest first');
});

test('own-key providers: URLs carry no key, parsing', () => {
  const u = M.polygonUrl('BRK-B', '1Y', Date.parse('2026-11-27T00:00:00Z'));
  assert.ok(u.startsWith('https://api.polygon.io/v2/aggs/ticker/BRK.B/range/1/day/2025-11-26/2026-11-27'), u); assert.ok(!/apiKey/.test(u));
  const d = M.parsePolygon({ results: [{ t: 1700000000000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }] }, 'AAPL');
  assert.equal(d.candles[0].time, 1700000000); assert.equal(d.candles[0].close, 1.5);
  assert.throws(() => M.parsePolygon({ status: 'ERROR', error: 'Unknown API Key' }, 'AAPL'), /Unknown API Key/);
  assert.deepEqual(M.parseFinnhubQuote({ c: 10, d: 1, dp: 10, pc: 9, t: 5 }), { price: 10, change: 1, changePct: 0.1, prevClose: 9, time: 5 });
  assert.equal(M.parseFinnhubQuote({ c: 0 }), null);
});

test('display names for lists', () => {
  assert.equal(M.displayName('^GSPC'), 'S&P 500');
  assert.equal(M.displayName('EURUSD=X'), 'EUR/USD');
  assert.equal(M.displayName('BTC-USD'), 'BTC');
  assert.equal(M.displayName('AAPL'), 'AAPL');
});
