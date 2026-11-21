/* Whale — pure logic, no DOM.
   Used by the app (window.Core) and by the Node tests (require('./core.js')). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
  const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

  /* ---------- Property names ----------
     Notes use English keys. Notes written by earlier versions used French keys:
     they are still read (and rewritten in English the next time a property is set). */
  const LEGACY_KEYS = {
    actif: 'asset', sens: 'side', entree: 'entry', sortie: 'exit', resultat: 'result',
    marche: 'market', quantite: 'quantity', resume: 'summary',
  };
  const LEGACY_TYPES = { actif: 'asset' };
  const canonicalKey = (k) => LEGACY_KEYS[k] || k;

  /* ---------- Paths and names ---------- */
  const stem = (p) => String(p).split('/').pop().replace(/\.md$/i, '');
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  // File name that is valid on Windows / macOS / Linux
  const safeName = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+$/, '').replace(/^\.+/, '') || 'Untitled';
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- Notes ---------- */
  // Parses a note: properties (frontmatter), body, and [[link]] targets (unresolved)
  function parseRaw(raw) {
    raw = String(raw || '');
    const m = raw.match(FM);
    const props = {};
    let body = raw;
    if (m) {
      body = raw.slice(m[0].length);
      m[1].split(/\r?\n/).forEach((l) => {
        const i = l.indexOf(':');
        if (i > 0) props[canonicalKey(l.slice(0, i).trim())] = l.slice(i + 1).trim();
      });
    }
    if (props.type) props.type = LEGACY_TYPES[props.type] || props.type;
    const targets = [];
    body.replace(/`[^`]*`/g, '').replace(/(!?)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_, bang, t) => {
      if (bang && IMG_EXT.test(t)) return;
      t = t.trim();
      if (t && !targets.includes(t)) targets.push(t);
    });
    return { props, body, targets, type: props.type || 'note' };
  }

  // Trade result in R (accepts "1,5" and "1.5")
  function rOf(props) {
    const v = parseFloat(String((props && props.result) || '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  // Sets properties (null = remove, "" = do not create) while keeping the existing order.
  // A legacy French key is replaced by its English name when it is updated.
  function setPropsText(raw, updates) {
    raw = String(raw || '');
    const m = raw.match(FM);
    const lines = m ? m[1].split(/\r?\n/) : [];
    const body = m ? raw.slice(m[0].length) : raw;
    const done = new Set();
    const out = [];
    lines.forEach((l) => {
      const i = l.indexOf(':');
      const k = i > 0 ? canonicalKey(l.slice(0, i).trim()) : null;
      if (k && Object.prototype.hasOwnProperty.call(updates, k)) {
        if (done.has(k)) return; // duplicate (legacy + English): keep one
        done.add(k);
        if (updates[k] != null) out.push(`${k}: ${updates[k]}`);
      } else out.push(l);
    });
    Object.keys(updates).forEach((k) => {
      if (!done.has(k) && updates[k] != null && updates[k] !== '') out.push(`${k}: ${updates[k]}`);
    });
    return `---\n${out.join('\n')}\n---\n` + body.replace(/^\r?\n/, '');
  }

  // After a rename: updates [[old]] / [[old|alias]] and the asset/setup properties
  function renameInContent(content, oldName, newName) {
    const reLink = new RegExp('\\[\\[' + reEsc(oldName) + '(\\]\\]|\\|)', 'gi');
    const reProp = new RegExp('^((?:asset|actif|setup): *)' + reEsc(oldName) + '[ \\t]*$', 'gmi');
    return String(content).replace(reLink, '[[' + newName + '$1').replace(reProp, '$1' + newName);
  }

  // Case-insensitive link resolver
  function makeResolver(names) {
    const exact = new Set(names);
    const lower = new Map();
    names.forEach((n) => { const l = n.toLowerCase(); if (!lower.has(l)) lower.set(l, n); });
    return (t) => {
      t = String(t).trim();
      if (exact.has(t)) return t;
      return lower.get(t.toLowerCase()) || null;
    };
  }

  /* ---------- Statistics ---------- */
  // trades: [{ r: number, setup, asset }]
  function computeStats(trades) {
    const rs = trades.map((t) => t.r).filter((r) => typeof r === 'number' && !isNaN(r));
    const round = (x) => Math.round(x * 100) / 100;
    const wins = rs.filter((r) => r > 0);
    const gains = wins.reduce((a, b) => a + b, 0);
    const losses = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
    const total = rs.reduce((a, b) => a + b, 0);
    const group = (key) => {
      const g = {};
      trades.forEach((t) => {
        if (typeof t.r !== 'number' || isNaN(t.r)) return;
        const k = t[key] || '—';
        (g[k] = g[k] || []).push(t.r);
      });
      const out = {};
      Object.keys(g).forEach((k) => {
        const a = g[k];
        out[k] = { count: a.length, winrate: Math.round((a.filter((r) => r > 0).length / a.length) * 100), total: round(a.reduce((x, y) => x + y, 0)) };
      });
      return out;
    };
    let eq = 0;
    return {
      count: rs.length,
      winrate: rs.length ? Math.round((wins.length / rs.length) * 100) : 0,
      total: round(total),
      avg: rs.length ? round(total / rs.length) : null,
      profitFactor: losses ? round(gains / losses) : null,
      equity: [0].concat(rs.map((r) => round((eq += r)))),
      bySetup: group('setup'),
      byAsset: group('asset'),
    };
  }

  /* ---------- CSV import ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
      } else f += c;
    }
    row.push(f);
    if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  }
  const normHeader = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Column names seen in broker exports (English first, French kept for French brokers)
  const CSV_FIELDS = {
    date: ['date', 'open time', 'opentime', 'time', 'datetime', 'entry time', 'date ouverture', 'heure', 'close time', 'closing time', 'filled time', 'date time'],
    symbol: ['symbol', 'symbole', 'instrument', 'ticker', 'actif', 'asset', 'market', 'pair', 'paire', 'contract', 'item'],
    side: ['side', 'sens', 'direction', 'type', 'action', 'buy sell', 'order side', 'position'],
    entry: ['entry price', 'entry', 'entree', 'prix d entree', 'open price', 'prix ouverture', 'avg entry price', 'price', 'prix', 'avg price', 'fill price'],
    exit: ['exit price', 'exit', 'sortie', 'prix de sortie', 'close price', 'prix cloture', 'avg exit price'],
    sl: ['sl', 'stop loss', 'stop', 's l'],
    qty: ['qty', 'quantity', 'quantite', 'size', 'volume', 'lots', 'taille', 'amount', 'shares'],
    pnl: ['pnl', 'p l', 'profit', 'net profit', 'realized pnl', 'realised pnl', 'net pnl', 'profit loss', 'gain', 'resultat'],
  };
  // Guesses which column holds which field: { date: 0, symbol: 1, ... }
  function detectColumns(headers) {
    const H = headers.map(normHeader), used = new Set(), map = {};
    Object.keys(CSV_FIELDS).forEach((f) => {
      let idx = -1;
      for (const k of CSV_FIELDS[f]) { idx = H.findIndex((h, i) => !used.has(i) && h === k); if (idx >= 0) break; }
      if (idx < 0) for (const k of CSV_FIELDS[f]) { idx = H.findIndex((h, i) => !used.has(i) && k.length > 2 && h.includes(k)); if (idx >= 0) break; }
      if (idx >= 0) { used.add(idx); map[f] = idx; }
    });
    return map;
  }
  // "1 234,56" -> 1234.56 ; "1,234.56" -> 1234.56 ; "$-40" -> -40
  function parseNumber(s) {
    s = String(s == null ? '' : s).replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }
  const isoDay = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  // Normalizes a date to YYYY-MM-DD (2026.11.21, 21/11/2026, ISO…)
  function toDay(s) {
    s = String(s || '').trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const t = Date.parse(s);
    return isNaN(t) ? '' : isoDay(t);
  }
  function normSide(s) {
    s = normHeader(s);
    if (/^(buy|long|achat|b|acheter)\b/.test(s)) return 'LONG';
    if (/^(sell|short|vente|s|vendre)\b/.test(s)) return 'SHORT';
    return '';
  }
  // R = (exit - entry) / (entry - stop): works for longs and shorts
  function computeR(entry, exit, stop) {
    if (entry == null || exit == null || stop == null || entry === stop) return null;
    return Math.round(((exit - entry) / (entry - stop)) * 100) / 100;
  }

  /* ---------- Conversation import ---------- */
  function fromChatGPT(c) {
    const map = c.mapping || {};
    const chain = [];
    let id = c.current_node;
    if (id && map[id]) {
      const seen = new Set();
      while (id && map[id] && !seen.has(id)) { seen.add(id); chain.push(map[id]); id = map[id].parent; }
      chain.reverse();
    } else {
      Object.values(map).sort((a, b) => ((a.message || {}).create_time || 0) - ((b.message || {}).create_time || 0)).forEach((x) => chain.push(x));
    }
    const msgs = [];
    chain.forEach((node) => {
      const m = node.message;
      if (!m || !m.author) return;
      const role = m.author.role;
      if (role !== 'user' && role !== 'assistant') return;
      const text = ((m.content || {}).parts || []).filter((p) => typeof p === 'string').join('\n').trim();
      if (text) msgs.push([role === 'user' ? 'You' : 'ChatGPT', text]);
    });
    return { title: c.title || 'Conversation', date: c.create_time ? isoDay(c.create_time * 1000) : '', source: 'ChatGPT', msgs };
  }
  function fromClaude(c) {
    const msgs = (c.chat_messages || []).map((m) => {
      const t = m.text || (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return [m.sender === 'human' ? 'You' : 'Claude', String(t || '').trim()];
    }).filter((x) => x[1]);
    return { title: c.name || 'Conversation', date: c.created_at ? isoDay(c.created_at) : '', source: 'Claude', msgs };
  }
  // Detects the format (ChatGPT or Claude) of each conversation in an export
  function parseConversations(data) {
    if (!Array.isArray(data)) data = (data && data.conversations) || [data];
    return data.map((c) => (c && c.mapping ? fromChatGPT(c) : c && c.chat_messages ? fromClaude(c) : null)).filter((c) => c && c.msgs.length);
  }


  /* ---------- Meaning: local similarity + 3D layout (no AI, nothing leaves the computer) ---------- */
  const STOP_WORDS = new Set(('the and for are but not you your with from this that these those was were has have had does did can could should would about into over than then them they their there here all any more most less very also just been being our out its what why how when which who '
    + 'les des une est pour pas que qui sur dans avec mes mon tes ton ses son elle nous vous ils elles cet cette ces quel quelle pourquoi comment quand fait faire plus moins tout tous tres bien aussi par aux sont ete etre '
    + 'type trade note setup asset side entry stop exit result date tags summary source long short').split(' '));
  // Words of a text, lowercased, accents removed, without very common words
  function tokenize(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  }
  // Seeded random numbers so a layout is the same every time
  function seededRandom(seed) {
    let x = seed % 2147483647; if (x <= 0) x += 2147483646;
    return () => (x = (x * 16807) % 2147483647) / 2147483647;
  }
  /* Similarity graph between documents with TF-IDF cosine similarity.
     docs: [{ text }] -> edges [{ a, b, w }] (each document keeps its k most similar neighbors). */
  function similarityEdges(docs, k = 5, minSim = 0.08) {
    const n = docs.length, tfs = docs.map((d) => { const m = new Map(); tokenize(d.text).forEach((w) => m.set(w, (m.get(w) || 0) + 1)); return m; });
    const df = new Map(); tfs.forEach((m) => m.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
    const maxDf = Math.max(2, n * 0.5);
    // weighted vectors, keeping the 30 strongest words per document
    const vecs = tfs.map((m) => {
      let v = [];
      m.forEach((tf, w) => { const d = df.get(w); if (d > 1 && d <= maxDf) v.push([w, (1 + Math.log(tf)) * Math.log(n / d)]); });
      v.sort((a, b) => b[1] - a[1]); v = v.slice(0, 30);
      const norm = Math.sqrt(v.reduce((s, x) => s + x[1] * x[1], 0)) || 1;
      return new Map(v.map(([w, x]) => [w, x / norm]));
    });
    const postings = new Map();
    vecs.forEach((v, i) => v.forEach((x, w) => { if (!postings.has(w)) postings.set(w, []); postings.get(w).push([i, x]); }));
    const edges = [], seen = new Set();
    vecs.forEach((v, i) => {
      const score = new Map();
      v.forEach((x, w) => postings.get(w).forEach(([j, y]) => { if (j !== i) score.set(j, (score.get(j) || 0) + x * y); }));
      [...score].filter((e) => e[1] >= minSim).sort((a, b) => b[1] - a[1]).slice(0, k).forEach(([j, w]) => {
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (!seen.has(key)) { seen.add(key); edges.push({ a: Math.min(i, j), b: Math.max(i, j), w }); }
      });
    });
    return edges;
  }
  /* Force-directed 3D layout: linked / similar items attract, everything else repels.
     Returns n points, rotated so the longest spread is along x, scaled to about [-1, 1]. */
  function layout3d(n, edges, { iterations = 220, seed = 7 } = {}) {
    const rnd = seededRandom(seed);
    const P = Array.from({ length: n }, () => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    if (n < 2) return P.map(() => [0, 0, 0]);
    const ideal = 1 / Math.cbrt(n);
    for (let it = 0; it < iterations; it++) {
      const temp = 0.12 * (1 - it / iterations) + 0.005;
      const F = P.map(() => [0, 0, 0]);
      // repulsion (sampled, so it stays fast for thousands of notes)
      const samples = Math.min(n - 1, 12);
      for (let i = 0; i < n; i++) {
        for (let s = 0; s < samples; s++) {
          const j = Math.floor(rnd() * n); if (j === i) continue;
          const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
          const d2 = dx * dx + dy * dy + dz * dz + 1e-4, f = (ideal * ideal) / d2 * (n / samples) * 0.02;
          F[i][0] += dx * f; F[i][1] += dy * f; F[i][2] += dz * f;
        }
      }
      // attraction along edges
      edges.forEach(({ a, b, w }) => {
        const dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1], dz = P[b][2] - P[a][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6, f = (d / ideal) * w * 0.5;
        const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
        F[a][0] += fx; F[a][1] += fy; F[a][2] += fz; F[b][0] -= fx; F[b][1] -= fy; F[b][2] -= fz;
      });
      for (let i = 0; i < n; i++) {
        F[i][0] -= P[i][0] * 0.05; F[i][1] -= P[i][1] * 0.05; F[i][2] -= P[i][2] * 0.05; // gentle pull to the center
        const m = Math.sqrt(F[i][0] ** 2 + F[i][1] ** 2 + F[i][2] ** 2) || 1, step = Math.min(m, temp) / m;
        P[i][0] += F[i][0] * step; P[i][1] += F[i][1] * step; P[i][2] += F[i][2] * step;
      }
    }
    return orient(P);
  }
  // Rotates points so their main direction is x (then y, z) and scales each axis to about [-1, 1]
  function orient(P) {
    const n = P.length, c = [0, 1, 2].map((k) => P.reduce((s, p) => s + p[k], 0) / n);
    const Q = P.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    const cov = [0, 1, 2].map((a) => [0, 1, 2].map((b) => Q.reduce((s, q) => s + q[a] * q[b], 0) / n));
    const mul = (v) => [0, 1, 2].map((r) => cov[r][0] * v[0] + cov[r][1] * v[1] + cov[r][2] * v[2]);
    const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let e1 = unit([1, 0.3, 0.1]); for (let i = 0; i < 50; i++) e1 = unit(mul(e1));
    let e2 = unit([0.2, 1, 0.4]);
    for (let i = 0; i < 50; i++) { e2 = mul(e2); const d = dot(e2, e1); e2 = unit([e2[0] - d * e1[0], e2[1] - d * e1[1], e2[2] - d * e1[2]]); }
    const e3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const R = Q.map((q) => [dot(q, e1), dot(q, e2), dot(q, e3)]);
    [0, 1, 2].forEach((k) => {
      const sorted = R.map((r) => Math.abs(r[k])).sort((a, b) => a - b);
      const s = sorted[Math.floor((sorted.length - 1) * 0.95)] || 1;
      R.forEach((r) => (r[k] = Math.max(-1, Math.min(1, r[k] / s))));
    });
    return R;
  }

  return {
    IMG_EXT, LEGACY_KEYS, canonicalKey, stem, dirOf, safeName, reEsc,
    parseRaw, rOf, setPropsText, renameInContent, makeResolver,
    computeStats,
    parseCSV, normHeader, CSV_FIELDS, detectColumns, parseNumber, toDay, normSide, computeR,
    fromChatGPT, fromClaude, parseConversations,
    tokenize, seededRandom, similarityEdges, layout3d, orient,
  };
});
