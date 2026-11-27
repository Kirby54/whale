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
