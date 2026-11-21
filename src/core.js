/* Whale — logique pure, sans DOM.
   Utilisée par l'app (window.Core) et par les tests Node (require('./core.js')). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
  const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

  /* ---------- Chemins et noms ---------- */
  const stem = (p) => String(p).split('/').pop().replace(/\.md$/i, '');
  const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  // Nom de fichier valide sous Windows / macOS / Linux
  const safeName = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+$/, '').replace(/^\.+/, '') || 'Sans titre';
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- Notes ---------- */
  // Analyse une note : propriétés (frontmatter), corps, cibles de liens [[...]] (non résolues)
  function parseRaw(raw) {
    raw = String(raw || '');
    const m = raw.match(FM);
    const props = {};
    let body = raw;
    if (m) {
      body = raw.slice(m[0].length);
      m[1].split(/\r?\n/).forEach((l) => {
        const i = l.indexOf(':');
        if (i > 0) props[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
    }
    const targets = [];
    body.replace(/`[^`]*`/g, '').replace(/(!?)\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (_, bang, t) => {
      if (bang && IMG_EXT.test(t)) return;
      t = t.trim();
      if (t && !targets.includes(t)) targets.push(t);
    });
    return { props, body, targets, type: props.type || 'note' };
  }

  // Résultat d'un trade en R (accepte "1,5" et "1.5")
  function rOf(props) {
    const v = parseFloat(String((props && props.resultat) || '').replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  // Modifie des propriétés (null = supprimer, "" = ne pas créer) en gardant l'ordre existant
  function setPropsText(raw, updates) {
    raw = String(raw || '');
    const m = raw.match(FM);
    const lines = m ? m[1].split(/\r?\n/) : [];
    const body = m ? raw.slice(m[0].length) : raw;
    const done = new Set();
    const out = [];
    lines.forEach((l) => {
      const i = l.indexOf(':');
      const k = i > 0 ? l.slice(0, i).trim() : null;
      if (k && Object.prototype.hasOwnProperty.call(updates, k)) {
        done.add(k);
        if (updates[k] != null) out.push(`${k}: ${updates[k]}`);
      } else out.push(l);
    });
    Object.keys(updates).forEach((k) => {
      if (!done.has(k) && updates[k] != null && updates[k] !== '') out.push(`${k}: ${updates[k]}`);
    });
    return `---\n${out.join('\n')}\n---\n` + body.replace(/^\r?\n/, '');
  }

  // Après un renommage : met à jour [[ancien]] / [[ancien|alias]] et les propriétés actif/setup
  function renameInContent(content, oldName, newName) {
    const reLink = new RegExp('\\[\\[' + reEsc(oldName) + '(\\]\\]|\\|)', 'gi');
    const reProp = new RegExp('^((?:actif|setup): *)' + reEsc(oldName) + '[ \\t]*$', 'gmi');
    return String(content).replace(reLink, '[[' + newName + '$1').replace(reProp, '$1' + newName);
  }

  // Résolveur de liens insensible à la casse
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

  /* ---------- Statistiques ---------- */
  // trades : [{ r: number, setup, actif }]
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
      byActif: group('actif'),
    };
  }

  /* ---------- Import CSV ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
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
  // Devine quelle colonne correspond à quel champ : { date: 0, symbol: 1, ... }
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
  // Normalise une date vers AAAA-MM-JJ (2026.11.21, 21/11/2026, ISO…)
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
  // R = (sortie - entrée) / (entrée - stop) : marche pour un long comme pour un short
  function computeR(entry, exit, stop) {
    if (entry == null || exit == null || stop == null || entry === stop) return null;
    return Math.round(((exit - entry) / (entry - stop)) * 100) / 100;
  }

  /* ---------- Import de conversations ---------- */
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
      if (text) msgs.push([role === 'user' ? 'Toi' : 'ChatGPT', text]);
    });
    return { title: c.title || 'Conversation', date: c.create_time ? isoDay(c.create_time * 1000) : '', source: 'ChatGPT', msgs };
  }
  function fromClaude(c) {
    const msgs = (c.chat_messages || []).map((m) => {
      const t = m.text || (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return [m.sender === 'human' ? 'Toi' : 'Claude', String(t || '').trim()];
    }).filter((x) => x[1]);
    return { title: c.name || 'Conversation', date: c.created_at ? isoDay(c.created_at) : '', source: 'Claude', msgs };
  }
  // Reconnaît le format (ChatGPT ou Claude) de chaque conversation d'un export
  function parseConversations(data) {
    if (!Array.isArray(data)) data = (data && data.conversations) || [data];
    return data.map((c) => (c && c.mapping ? fromChatGPT(c) : c && c.chat_messages ? fromClaude(c) : null)).filter((c) => c && c.msgs.length);
  }

  return {
    IMG_EXT, stem, dirOf, safeName, reEsc,
    parseRaw, rOf, setPropsText, renameInContent, makeResolver,
    computeStats,
    parseCSV, normHeader, CSV_FIELDS, detectColumns, parseNumber, toDay, normSide, computeR,
    fromChatGPT, fromClaude, parseConversations,
  };
});
