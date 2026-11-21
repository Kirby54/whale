/* Whale — import : dossiers de notes, conversations ChatGPT / Claude, CSV de broker */
window.Importer = (() => {
  const baseName = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  const normH = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const day = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return ''; } };

  function open() {
    Modal.show(`
      <h2>Importer</h2>
      <div class="sub">Rien n'est remplacé : les fichiers déjà présents dans le coffre sont ignorés.</div>
      <div class="imp">
        <button id="impFolder"><b>Dossier de notes</b><span>Obsidian, Notion (export Markdown), Logseq… copie les .md et les images</span></button>
        <button id="impChats"><b>Conversations IA</b><span>Export ChatGPT ou Claude : fichier conversations.json</span></button>
        <button id="impCsv"><b>Trades d'un broker</b><span>Fichier CSV : MT4/MT5, TradingView, Binance, IBKR…</span></button>
        <button id="impClose" style="display:flex;align-items:center;justify-content:center;color:var(--tx3)">Fermer</button>
      </div>
      <div id="impMsg" style="margin-top:14px"></div>`);
    $('impFolder').onclick = importFolder;
    $('impChats').onclick = importChats;
    $('impCsv').onclick = importCsv;
    $('impClose').onclick = Modal.close;
  }
  const msg = (html) => { if ($('impMsg')) $('impMsg').innerHTML = html; };
  function done(text, newNames) {
    renderTree();
    const btn = newNames && newNames.length ? `<button class="tbtn ai" id="impClassify">✦ Classer ces ${newNames.length} notes avec l'IA</button>` : '';
    msg(`<div class="msg-ok">${esc(text)}</div><div class="actions">${btn}<button class="tbtn" id="impOk">OK</button></div>`);
    $('impOk').onclick = () => { Modal.close(); refreshAll(); };
    if (btn) $('impClassify').onclick = () => { Modal.close(); AI.classifyAll(newNames); };
  }
  const fail = (e) => msg(`<div class="msg-err">${esc(String(e.message || e))}</div>`);

  /* ---------- Dossier de notes ---------- */
  async function importFolder() {
    try {
      const src = await Store.pickFolder('Dossier de notes à importer'); if (!src) return;
      const dest = 'Import/' + safeName(baseName(src));
      msg('<div class="note">Copie en cours…</div>');
      const before = new Set(Object.keys(notes));
      const n = await Store.importFolder(src, dest);
      await loadAll();
      const added = Object.keys(notes).filter((k) => !before.has(k));
      done(`${n} note(s) copiée(s) dans ${dest}`, added);
    } catch (e) { fail(e); }
  }

  /* ---------- Conversations ChatGPT / Claude ---------- */
  function fromChatGPT(c) {
    const map = c.mapping || {}; const out = [];
    let id = c.current_node;
    const chain = [];
    if (id && map[id]) { while (id && map[id]) { chain.push(map[id]); id = map[id].parent; } chain.reverse(); }
    else Object.values(map).sort((a, b) => ((a.message || {}).create_time || 0) - ((b.message || {}).create_time || 0)).forEach((x) => chain.push(x));
    chain.forEach((node) => {
      const m = node.message; if (!m || !m.author) return;
      const role = m.author.role; if (role !== 'user' && role !== 'assistant') return;
      const parts = ((m.content || {}).parts || []).filter((p) => typeof p === 'string').join('\n').trim();
      if (parts) out.push([role === 'user' ? 'Toi' : 'ChatGPT', parts]);
    });
    return { title: c.title || 'Conversation', date: c.create_time ? day(c.create_time * 1000) : '', source: 'ChatGPT', msgs: out };
  }
  function fromClaude(c) {
    const out = (c.chat_messages || []).map((m) => {
      let t = m.text || ((m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
      return [m.sender === 'human' ? 'Toi' : 'Claude', String(t || '').trim()];
    }).filter((x) => x[1]);
    return { title: c.name || 'Conversation', date: c.created_at ? day(c.created_at) : '', source: 'Claude', msgs: out };
  }
  async function importChats() {
    try {
      const path = await Store.pickFile('Export de conversations (conversations.json)', ['json']); if (!path) return;
      msg('<div class="note">Lecture du fichier…</div>');
      let data = JSON.parse(await Store.readExternal(path));
      if (!Array.isArray(data)) data = data.conversations || [data];
      const convs = data.map((c) => (c.mapping ? fromChatGPT(c) : c.chat_messages ? fromClaude(c) : null)).filter((c) => c && c.msgs.length);
      if (!convs.length) throw new Error("Aucune conversation reconnue. Il faut le fichier conversations.json de l'export ChatGPT ou Claude.");
      const added = [];
      for (const c of convs) {
        let name = `${c.date ? c.date + ' ' : ''}${c.title}`.replace(/[\r\n]+/g, ' ').slice(0, 90).trim();
        const dir = `Conversations IA/${c.source}`;
        if (notes[name] && notes[name].path.startsWith(dir)) continue; // déjà importée
        let base = name, i = 2; while (notes[name]) name = `${base} (${i++})`;
        const body = c.msgs.map(([who, t]) => `**${who}** :\n${t}`).join('\n\n');
        const content = `---\ntype: conversation\nsource: ${c.source}\n${c.date ? 'date: ' + c.date + '\n' : ''}---\n# ${c.title}\n\n${body}\n`;
        const p = `${dir}/${safeName(name)}.md`;
        await Store.write(p, content);
        notes[name] = { path: p, content, mtime: 0 }; added.push(name);
        if (added.length % 25 === 0) msg(`<div class="note">${added.length} / ${convs.length} conversations…</div>`);
      }
      done(`${added.length} conversation(s) importée(s) (${convs.length - added.length} déjà présentes).`, added);
    } catch (e) { fail(e); }
  }

  /* ---------- CSV de broker ---------- */
  function parseCSV(text) {
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
      else f += c;
    }
    row.push(f); if (row.some((x) => x.trim())) rows.push(row);
    return rows;
  }
  const FIELDS = {
    date: { label: 'Date', keys: ['date', 'open time', 'opentime', 'time', 'datetime', 'entry time', 'date ouverture', 'heure', 'close time', 'closing time', 'filled time', 'date time'] },
    symbol: { label: 'Actif *', keys: ['symbol', 'symbole', 'instrument', 'ticker', 'actif', 'asset', 'market', 'pair', 'paire', 'contract', 'item'] },
    side: { label: 'Sens', keys: ['side', 'sens', 'direction', 'type', 'action', 'buy sell', 'order side', 'position'] },
    entry: { label: 'Prix d\'entrée', keys: ['entry price', 'entry', 'entree', 'prix d entree', 'open price', 'prix ouverture', 'avg entry price', 'price', 'prix', 'avg price', 'fill price'] },
    exit: { label: 'Prix de sortie', keys: ['exit price', 'exit', 'sortie', 'prix de sortie', 'close price', 'prix cloture', 'avg exit price'] },
    sl: { label: 'Stop loss', keys: ['sl', 'stop loss', 'stop', 's l'] },
    qty: { label: 'Quantité', keys: ['qty', 'quantity', 'quantite', 'size', 'volume', 'lots', 'taille', 'amount', 'shares'] },
    pnl: { label: 'P&L', keys: ['pnl', 'p l', 'profit', 'net profit', 'realized pnl', 'realised pnl', 'net pnl', 'profit loss', 'gain', 'resultat'] },
  };
  function detect(headers) {
    const H = headers.map(normH), used = new Set(), map = {};
    Object.keys(FIELDS).forEach((f) => {
      let idx = -1;
      for (const k of FIELDS[f].keys) { idx = H.findIndex((h, i) => !used.has(i) && h === k); if (idx >= 0) break; }
      if (idx < 0) for (const k of FIELDS[f].keys) { idx = H.findIndex((h, i) => !used.has(i) && k.length > 2 && h.includes(k)); if (idx >= 0) break; }
      if (idx >= 0) { used.add(idx); map[f] = idx; }
    });
    return map;
  }
  function num(s) {
    s = String(s || '').replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, ''); else s = s.replace(',', '.');
    const v = parseFloat(s); return isNaN(v) ? null : v;
  }
  function toDay(s) {
    s = String(s || '').trim(); if (!s) return '';
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const t = Date.parse(s); return isNaN(t) ? '' : day(t);
  }
  function side(s) {
    s = normH(s);
    if (/^(buy|long|achat|b|acheter)/.test(s)) return 'LONG';
    if (/^(sell|short|vente|s|vendre)/.test(s)) return 'SHORT';
    return '';
  }
  async function importCsv() {
    try {
      const path = await Store.pickFile('Fichier CSV de trades', ['csv', 'tsv', 'txt']); if (!path) return;
      const rows = parseCSV(await Store.readExternal(path));
      if (rows.length < 2) throw new Error('Le fichier ne contient pas de lignes de trades.');
      const headers = rows[0], data = rows.slice(1), map = detect(headers);
      const opts = (f) => `<option value="-1">— aucune —</option>` + headers.map((h, i) => `<option value="${i}" ${map[f] === i ? 'selected' : ''}>${esc(h)}</option>`).join('');
      Modal.show(`
        <h2>Importer des trades</h2>
        <div class="sub">${data.length} ligne(s) dans ${esc(baseName(path))}. Vérifie quelles colonnes correspondent à quoi.</div>
        ${Object.keys(FIELDS).map((f) => `<div class="row" style="margin:8px 0;display:flex;align-items:center;gap:10px"><label style="width:120px;margin:0">${FIELDS[f].label}</label><select data-f="${f}" style="flex:1">${opts(f)}</select></div>`).join('')}
        <div class="note">Le résultat en R est calculé quand l'entrée, la sortie et le stop sont connus. Sinon le P&L est gardé dans la propriété « pnl ».</div>
        <div id="impMsg"></div>
        <div class="actions"><button class="tbtn" id="csvCancel">Annuler</button><button class="tbtn ai" id="csvGo">Créer les trades</button></div>`);
      $('csvCancel').onclick = Modal.close;
      $('csvGo').onclick = async () => {
        const m = {}; document.querySelectorAll('#mbox select').forEach((s) => { const v = +s.value; if (v >= 0) m[s.dataset.f] = v; });
        if (m.symbol == null) { msg('<div class="msg-err">Choisis au moins la colonne de l\'actif.</div>'); return; }
        $('csvGo').disabled = true;
        const get = (r, f) => (m[f] != null ? String(r[m[f]] || '').trim() : '');
        const added = []; const file = baseName(path);
        for (const r of data) {
          const sym = get(r, 'symbol').toUpperCase(); if (!sym) continue;
          const d = toDay(get(r, 'date')), sd = side(get(r, 'side'));
          const e = num(get(r, 'entry')), x = num(get(r, 'exit')), sl = num(get(r, 'sl')), q = num(get(r, 'qty')), pnl = num(get(r, 'pnl'));
          let R = null; if (e != null && x != null && sl != null && e !== sl) R = Math.round(((x - e) / (e - sl)) * 100) / 100;
          let name = `${d || 'sans date'} ${sym}${sd ? ' ' + sd.toLowerCase() : ''}`, base = name, i = 2;
          while (notes[name]) name = `${base} (${i++})`;
          const pr = { type: 'trade', date: d, actif: sym, setup: '', sens: sd, entree: e ?? '', stop: sl ?? '', sortie: x ?? '', quantite: q ?? '', pnl: pnl ?? '', resultat: R ?? '', source: 'import CSV' };
          const fm = Object.keys(pr).filter((k) => pr[k] !== '' || ['setup', 'resultat'].includes(k)).map((k) => `${k}: ${pr[k]}`).join('\n');
          const content = `---\n${fm}\n---\nImporté depuis ${file}. Actif : [[${sym}]]\n\n## Contexte\n\n\n## Erreurs / émotions\n\n`;
          const p = `Trades/Import/${safeName(name)}.md`;
          await Store.write(p, content);
          notes[name] = { path: p, content, mtime: 0 }; added.push(name);
        }
        done(`${added.length} trade(s) créé(s) dans Trades/Import.`);
      };
    } catch (e) { fail(e); }
  }

  return { open };
})();
