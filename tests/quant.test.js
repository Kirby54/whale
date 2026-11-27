// Tests for the quant toolkit. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/quant.js');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// A deterministic random walk for the statistical tests
function walk(n, drift = 0, vol = 0.01, seed = 5) {
  let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const g = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const p = [100]; for (let i = 1; i < n; i++) p.push(p[i - 1] * Math.exp(drift + vol * g()));
  return p;
}

test('sma and ema', () => {
  assert.deepEqual(Q.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = Q.ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  near(e[2], 2); near(e[3], 3); near(e[4], 4);
});

test('rsi: 100 when only up, about 50 for alternating moves', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(Q.rsi(up)[29], 100);
  const alt = Array.from({ length: 60 }, (_, i) => 100 + (i % 2));
  near(Q.rsi(alt)[59], 50, 5);
});

test('macd: positive in an uptrend', () => {
  const m = Q.macd(Array.from({ length: 60 }, (_, i) => 100 + i * 0.5));
  assert.ok(m.macd[59] > 0 && m.signal[59] > 0);
});

test('bollinger: flat series has zero width', () => {
  const b = Q.bollinger(new Array(25).fill(10), 20, 2);
  assert.equal(b.upper[24], 10); assert.equal(b.lower[24], 10);
});

test('atr on constant-range candles', () => {
  const c = Array.from({ length: 20 }, (_, i) => ({ high: 11 + i, low: 9 + i, close: 10 + i }));
  near(Q.atr(c, 14)[19], 2, 0.2);
});

test('realized volatility recovers the simulated volatility', () => {
  near(Q.realizedVol(walk(3000, 0, 0.01), 252), 0.01 * Math.sqrt(252), 0.01);
});

test('max drawdown', () => {
  const d = Q.maxDrawdown([100, 120, 90, 110, 80, 130]);
  near(d.mdd, 80 / 120 - 1); assert.equal(d.from, 1); assert.equal(d.to, 4);
});

test('VaR and expected shortfall', () => {
  const r = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // -0.05 .. 0.049
  near(Q.valueAtRisk(r, 0.95), 0.04505, 1e-4);
  assert.ok(Q.expectedShortfall(r, 0.95) > Q.valueAtRisk(r, 0.95));
});

test('hurst: random walk near 0.5, trending higher than mean-reverting', () => {
  const h = Q.hurst(walk(2000));
  assert.ok(h > 0.35 && h < 0.65, `hurst ${h}`);
  const mr = [100]; for (let i = 1; i < 600; i++) mr.push(100 + (i % 2 ? 1 : -1) * (1 + (i % 7) / 10));
  assert.ok(Q.hurst(mr) < h);
});

test('half-life: finite for a mean-reverting series', () => {
  const p = [100]; let x = 0, s = 9;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 1; i < 500; i++) { x = 0.8 * x + (rnd() - 0.5) * 0.02; p.push(100 * Math.exp(x)); }
  const hl = Q.halfLife(p); assert.ok(hl > 1 && hl < 10, `half-life ${hl}`);
  assert.equal(Q.halfLife(Array.from({ length: 50 }, (_, i) => 100 * Math.exp(i * 0.01 + (i % 3) * 0.001))) > 50, true);
});

test('beta and correlation', () => {
  const b = Q.logReturns(walk(300)), a = b.map((x) => 2 * x);
  near(Q.beta(a, b), 2, 1e-9); near(Q.correlation(a, b), 1, 1e-9);
});

test('alignedReturns keeps common timestamps only', () => {
  const A = [{ time: 1, close: 10 }, { time: 2, close: 11 }, { time: 3, close: 12 }];
  const B = [{ time: 2, close: 5 }, { time: 3, close: 6 }, { time: 4, close: 7 }];
  const r = Q.alignedReturns(A, B); assert.equal(r.n, 2); near(r.a[0], Math.log(12 / 11)); near(r.b[0], Math.log(6 / 5));
});

test('volume profile: POC where most volume traded, value area around it', () => {
  const c = [{ high: 10, low: 9, volume: 10 }, { high: 12, low: 11, volume: 100 }, { high: 14, low: 13, volume: 10 }];
  const vp = Q.volumeProfile(c, 5); assert.ok(vp.poc > 10.8 && vp.poc < 12.2, `poc ${vp.poc}`); assert.ok(vp.val <= vp.poc && vp.vah >= vp.poc);
});

test('fibonacci, pivots, expected move, position size, kelly', () => {
  assert.deepEqual(Q.fibLevels(100, 200).map((l) => +l.price.toFixed(1)), [200, 176.4, 161.8, 150, 138.2, 121.4, 100]);
  near(Q.pivots(110, 90, 100).p, 100);
  near(Q.expectedMove(100, 0.2, 252, 252), 20);
  const ps = Q.positionSize(10000, 1, 100, 98); near(ps.units, 50); near(ps.target2R, 104);
  near(Q.positionSize(10000, 1, 100, 102).target2R, 96);
  near(Q.kelly(0.5, 2, 1), 0.25);
});

test('volatility cone and Monte Carlo bands are ordered', () => {
  const p = walk(400);
  Q.volCone(p, 252).forEach((c) => assert.ok(c.min <= c.median && c.median <= c.max && c.rank > 0 && c.rank <= 1));
  const mc = Q.monteCarlo(100, Q.logReturns(p), 20, { paths: 400 });
  assert.equal(mc.length, 20);
  mc.forEach((b) => assert.ok(b.p5 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p95));
});

test('periodsPerYear from timestamps', () => {
  const day = 86400;
  assert.equal(Q.periodsPerYear([0, day, 2 * day, 3 * day]), 252);
  assert.equal(Q.periodsPerYear([0, 7 * day, 14 * day, 21 * day]), 52);
  const hourly = Array.from({ length: 48 }, (_, i) => i * 3600); // 24 bars per day
  near(Q.periodsPerYear(hourly, 365), 24 * 365);
});

test('aligned returns with day keys, correlation matrix', () => {
  const day = 86400, A = [], B = [], C = [];
  for (let i = 0; i < 60; i++) { const x = 100 * Math.exp(0.01 * Math.sin(i * 1.7) + i * 0.001); A.push({ time: i * day + 52200, close: x }); B.push({ time: i * day, close: x * 2 }); C.push({ time: i * day, close: 100 + (i % 2) }); }
  const k = (t) => Math.floor(t / day);
  assert.equal(Q.alignedReturns(A, B).n, 0, 'different stamps do not match without a key');
  const r = Q.alignedReturns(A, B, k); assert.equal(r.n, 60);
  const m = Q.correlationMatrix([{ sym: 'A', candles: A, key: k }, { sym: 'B', candles: B, key: k }, { sym: 'C', candles: C, key: k }]);
  assert.deepEqual(m.syms, ['A', 'B', 'C']); near(m.m[0][1], 1, 1e-9); assert.equal(m.m[1][0], m.m[0][1]); assert.equal(m.m[2][2], 1);
});

test('screener metrics', () => {
  const day = 86400, start = Date.parse('2025-06-02T14:30:00Z') / 1000;
  const c = Array.from({ length: 300 }, (_, i) => ({ time: start + i * day, close: 100 + i }));
  const x = Q.metrics(c);
  near(x.chg1d, 399 / 398 - 1); near(x.chg1w, 399 / 394 - 1); assert.ok(x.vsSma200 > 0); near(x.fromHigh, 0); assert.equal(x.rsi, 100);
  assert.ok(x.ytd > 0);
});
