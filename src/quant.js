/* Whale — quant toolkit: the analytics used on trading desks, on plain arrays.
   Candles: [{ time, open, high, low, close, volume }]. Returns are log returns unless stated.
   Used by the Analysis tab (window.Quant) and by the Node tests (require('./quant.js')). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Quant = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  const std = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
  const quantile = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

  /* ---------- Moving averages and indicators (arrays aligned with the input, null while warming up) ---------- */
  function sma(v, n) { const out = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; out.push(i >= n - 1 ? s / n : null); }); return out; }
  function ema(v, n) { const k = 2 / (n + 1), out = []; let e = null; v.forEach((x, i) => { if (i < n - 1) { out.push(null); return; } e = e == null ? mean(v.slice(0, n)) : x * k + e * (1 - k); out.push(e); }); return out; }
  // Relative Strength Index (Wilder smoothing)
  function rsi(closes, n = 14) {
    const out = new Array(closes.length).fill(null); if (closes.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const f = ema(closes, fast), s = ema(closes, slow);
    const line = closes.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
    const start = line.findIndex((x) => x != null), sig = new Array(closes.length).fill(null);
    if (start >= 0) ema(line.slice(start), signal).forEach((x, i) => (sig[start + i] = x));
    return { macd: line, signal: sig, hist: line.map((x, i) => (x != null && sig[i] != null ? x - sig[i] : null)) };
  }
  function bollinger(closes, n = 20, k = 2) {
    const mid = sma(closes, n);
    const sd = closes.map((_, i) => (i >= n - 1 ? Math.sqrt(sum(closes.slice(i - n + 1, i + 1).map((x) => (x - mid[i]) ** 2)) / n) : null));
    return { mid, upper: mid.map((m, i) => (m == null ? null : m + k * sd[i])), lower: mid.map((m, i) => (m == null ? null : m - k * sd[i])) };
  }
  // Average True Range (Wilder)
  function atr(c, n = 14) {
    const tr = c.map((k, i) => (i ? Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close)) : k.high - k.low));
    const out = new Array(c.length).fill(null); if (c.length < n) return out;
    let a = mean(tr.slice(0, n)); out[n - 1] = a;
    for (let i = n; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  }
  // Volume-weighted average price, anchored at the first candle
  function vwap(c) { let pv = 0, vol = 0; return c.map((k) => { const tp = (k.high + k.low + k.close) / 3; pv += tp * (k.volume || 0); vol += k.volume || 0; return vol ? pv / vol : null; }); }

  /* ---------- Returns, volatility, risk ---------- */
  const logReturns = (closes) => closes.slice(1).map((x, i) => Math.log(x / closes[i])).filter((x) => isFinite(x));
  const realizedVol = (closes, ppy) => std(logReturns(closes)) * Math.sqrt(ppy);
  // Parkinson estimator: uses the high-low range, more efficient than close-to-close
  function parkinsonVol(c, ppy) { const x = c.filter((k) => k.high > 0 && k.low > 0).map((k) => Math.log(k.high / k.low) ** 2); return x.length ? Math.sqrt(mean(x) / (4 * Math.log(2))) * Math.sqrt(ppy) : NaN; }
  function skewness(r) { const m = mean(r), s = std(r); return r.length > 2 && s ? mean(r.map((x) => ((x - m) / s) ** 3)) : NaN; }
  function kurtosis(r) { const m = mean(r), s = std(r); return r.length > 3 && s ? mean(r.map((x) => ((x - m) / s) ** 4)) - 3 : NaN; } // excess
  function maxDrawdown(closes) {
    let peak = closes[0], pi = 0, mdd = 0, from = 0, to = 0;
    closes.forEach((x, i) => { if (x > peak) { peak = x; pi = i; } const dd = x / peak - 1; if (dd < mdd) { mdd = dd; from = pi; to = i; } });
    return { mdd, from, to };
  }
  const sharpe = (r, ppy, rf = 0) => ((mean(r) - rf / ppy) / std(r)) * Math.sqrt(ppy);
  function sortino(r, ppy) { const down = r.filter((x) => x < 0); const dd = Math.sqrt(sum(down.map((x) => x * x)) / Math.max(1, r.length)); return dd ? (mean(r) / dd) * Math.sqrt(ppy) : NaN; }
  // Historical Value at Risk and Expected Shortfall (as positive losses, in return units)
  const valueAtRisk = (r, level = 0.95) => -quantile(r, 1 - level);
  function expectedShortfall(r, level = 0.95) { const v = quantile(r, 1 - level), tail = r.filter((x) => x <= v); return tail.length ? -mean(tail) : NaN; }

  /* ---------- Mean reversion vs trend ---------- */
  function zscore(closes, n = 20) { if (closes.length < n) return NaN; const w = closes.slice(-n), s = std(w); return s ? (closes[closes.length - 1] - mean(w)) / s : NaN; }
  function autocorr(r, lag = 1) { if (r.length <= lag + 2) return NaN; const m = mean(r); let num = 0, den = 0; r.forEach((x, i) => { den += (x - m) ** 2; if (i >= lag) num += (x - m) * (r[i - lag] - m); }); return den ? num / den : NaN; }
  // Hurst exponent with rescaled range: ~0.5 random walk, > 0.5 trending, < 0.5 mean-reverting
  function hurst(closes) {
    const r = logReturns(closes); if (r.length < 32) return NaN;
    const pts = [];
    for (let size = 8; size <= r.length / 2; size = Math.floor(size * 1.6)) {
      const rs = [];
      for (let s = 0; s + size <= r.length; s += size) {
        const w = r.slice(s, s + size), m = mean(w); let c = 0, mx = -Infinity, mn = Infinity;
        w.forEach((x) => { c += x - m; mx = Math.max(mx, c); mn = Math.min(mn, c); });
        const sd = Math.sqrt(sum(w.map((x) => (x - m) ** 2)) / size); if (sd > 0) rs.push((mx - mn) / sd);
      }
      if (rs.length) pts.push([Math.log(size), Math.log(mean(rs))]);
    }
    return pts.length >= 2 ? linreg(pts.map((p) => p[0]), pts.map((p) => p[1])).slope : NaN;
  }
  // Half-life of mean reversion (Ornstein-Uhlenbeck fit on log prices), in bars; Infinity when not mean-reverting
  function halfLife(closes) {
    const y = closes.map(Math.log), x = y.slice(0, -1), dy = y.slice(1).map((v, i) => v - y[i]);
    const b = linreg(x, dy).slope; return b < 0 ? -Math.log(2) / b : Infinity;
  }
  function linreg(x, y) { const mx = mean(x), my = mean(y); let num = 0, den = 0; x.forEach((v, i) => { num += (v - mx) * (y[i] - my); den += (v - mx) ** 2; }); const slope = den ? num / den : NaN; return { slope, intercept: my - slope * mx }; }

  /* ---------- Relative ---------- */
  function correlation(a, b) { const n = Math.min(a.length, b.length); a = a.slice(-n); b = b.slice(-n); const ma = mean(a), mb = mean(b); let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? c / Math.sqrt(va * vb) : NaN; }
  function beta(asset, bench) { const n = Math.min(asset.length, bench.length); return linreg(bench.slice(-n), asset.slice(-n)).slope; }
  // Aligns two candle series on common timestamps and returns their log returns
  function alignedReturns(a, b) {
    const mb = new Map(b.map((k) => [k.time, k.close])), xa = [], xb = [];
    a.forEach((k) => { if (mb.has(k.time)) { xa.push(k.close); xb.push(mb.get(k.time)); } });
    return { a: logReturns(xa), b: logReturns(xb), n: xa.length };
  }

  /* ---------- Market structure ---------- */
  // Volume profile: volume traded per price level; POC = most traded price; value area = 70% of volume
  function volumeProfile(c, bins = 24) {
    if (!c.length) return { bins: [], poc: NaN, vah: NaN, val: NaN };
    const lo = Math.min(...c.map((k) => k.low)), hi = Math.max(...c.map((k) => k.high)), step = (hi - lo) / bins || 1;
    const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, volume: 0 }));
    c.forEach((k) => {
      const a = Math.max(0, Math.floor((k.low - lo) / step)), z = Math.min(bins - 1, Math.floor((k.high - lo) / step)), share = (k.volume || 0) / (z - a + 1);
      for (let i = a; i <= z; i++) out[i].volume += share;
    });
    const total = sum(out.map((b) => b.volume)); let pi = 0; out.forEach((b, i) => { if (b.volume > out[pi].volume) pi = i; });
    let lo_i = pi, hi_i = pi, acc = out[pi].volume;
    while (acc < total * 0.7 && (lo_i > 0 || hi_i < bins - 1)) {
      const down = lo_i > 0 ? out[lo_i - 1].volume : -1, up = hi_i < bins - 1 ? out[hi_i + 1].volume : -1;
      if (up >= down) { hi_i++; acc += out[hi_i].volume; } else { lo_i--; acc += out[lo_i].volume; }
    }
    return { bins: out, poc: (out[pi].from + out[pi].to) / 2, vah: out[hi_i].to, val: out[lo_i].from };
  }
  const fibLevels = (from, to) => [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: to + (from - to) * r }));
  function pivots(h, l, c) { const p = (h + l + c) / 3; return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l) }; }

  /* ---------- Projections and sizing ---------- */
  // ±1 standard deviation move over `bars` bars from an annualized volatility
  const expectedMove = (price, annVol, bars, ppy) => price * annVol * Math.sqrt(bars / ppy);
  // Volatility cone: distribution of rolling realized vol for several windows, and where today stands
  function volCone(closes, ppy, windows = [10, 20, 60, 120]) {
    const r = logReturns(closes);
    return windows.filter((w) => r.length > w + 5).map((w) => {
      const vols = []; for (let i = w; i <= r.length; i++) vols.push(std(r.slice(i - w, i)) * Math.sqrt(ppy));
      const cur = vols[vols.length - 1];
      return { window: w, min: Math.min(...vols), p25: quantile(vols, 0.25), median: quantile(vols, 0.5), p75: quantile(vols, 0.75), max: Math.max(...vols), current: cur, rank: vols.filter((v) => v <= cur).length / vols.length };
    });
  }
  // Monte Carlo (geometric Brownian motion): percentile bands of the price for each future bar
  function monteCarlo(price, r, bars, { paths = 1000, seed = 7 } = {}) {
    let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    const mu = mean(r), sd = std(r), sims = Array.from({ length: bars }, () => []);
    for (let p = 0; p < paths; p++) { let v = price; for (let t = 0; t < bars; t++) { v *= Math.exp(mu - sd * sd / 2 + sd * gauss()); sims[t].push(v); } }
    return sims.map((s) => ({ p5: quantile(s, 0.05), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p95: quantile(s, 0.95) }));
  }
  function positionSize(account, riskPct, entry, stop) {
    const risk = account * riskPct / 100, perUnit = Math.abs(entry - stop);
    return perUnit ? { units: risk / perUnit, risk, notional: (risk / perUnit) * entry, target2R: entry + 2 * (entry - stop) } : null; // works for longs and shorts
  }
  // Kelly fraction from a win rate and the average win / loss (as positive numbers)
  const kelly = (winrate, avgWin, avgLoss) => (avgLoss > 0 && avgWin > 0 ? winrate - (1 - winrate) / (avgWin / avgLoss) : NaN);
  // Periods per year from the spacing of timestamps (seconds) and the market's trading days per year
  function periodsPerYear(times, tradingDays = 252) {
    if (times.length < 3) return tradingDays;
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b), g = gaps[Math.floor(gaps.length / 2)];
    if (g >= 20 * 86400) return 12; if (g >= 5 * 86400) return 52; if (g >= 86400) return tradingDays;
    const days = new Set(times.map((t) => Math.floor(t / 86400))).size;
    return (times.length / Math.max(1, days)) * tradingDays;
  }
  // Average return by weekday (0 = Sunday) from daily candles
  function weekdayReturns(c) {
    const g = Array.from({ length: 7 }, () => []);
    c.slice(1).forEach((k, i) => g[new Date(k.time * 1000).getUTCDay()].push(Math.log(k.close / c[i].close)));
    return g.map((r, d) => ({ day: d, mean: r.length ? mean(r) : null, count: r.length }));
  }

  return {
    mean, std, quantile, sma, ema, rsi, macd, bollinger, atr, vwap,
    logReturns, realizedVol, parkinsonVol, skewness, kurtosis, maxDrawdown, sharpe, sortino, valueAtRisk, expectedShortfall,
    zscore, autocorr, hurst, halfLife, linreg, correlation, beta, alignedReturns,
    volumeProfile, fibLevels, pivots, expectedMove, volCone, monteCarlo, positionSize, kelly, periodsPerYear, weekdayReturns,
  };
});
