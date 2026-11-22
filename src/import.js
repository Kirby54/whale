/* Whale — import : dossiers de notes, conversations ChatGPT / Claude, CSV de broker */
window.Importer = (() => {
  const baseName = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop();

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
  async function importChats() {
    try {
      const path = await Store.pickFile('Export de conversations (conversations.json)', ['json']); if (!path) return;
      msg('<div class="note">Lecture du fichier…</div>');
      const convs = Core.parseConversations(JSON.parse(await Store.readExternal(path)));
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
  const FIELD_LABELS = { date: 'Date', symbol: 'Actif *', side: 'Sens', entry: "Prix d'entrée", exit: 'Prix de sortie', sl: 'Stop loss', qty: 'Quantité', pnl: 'P&L' };
  async function importCsv() {
    try {
      const path = await Store.pickFile('Fichier CSV de trades', ['csv', 'tsv', 'txt']); if (!path) return;
      const rows = Core.parseCSV(await Store.readExternal(path));
      if (rows.length < 2) throw new Error('Le fichier ne contient pas de lignes de trades.');
      const headers = rows[0], data = rows.slice(1), map = Core.detectColumns(headers);
      const opts = (f) => `<option value="-1">— aucune —</option>` + headers.map((h, i) => `<option value="${i}" ${map[f] === i ? 'selected' : ''}>${esc(h)}</option>`).join('');
      Modal.show(`
        <h2>Importer des trades</h2>
        <div class="sub">${data.length} ligne(s) dans ${esc(baseName(path))}. Vérifie quelles colonnes correspondent à quoi.</div>
        ${Object.keys(FIELD_LABELS).map((f) => `<div class="row" style="margin:8px 0;display:flex;align-items:center;gap:10px"><label style="width:120px;margin:0">${FIELD_LABELS[f]}</label><select data-f="${f}" style="flex:1">${opts(f)}</select></div>`).join('')}
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
          const d = Core.toDay(get(r, 'date')), sd = Core.normSide(get(r, 'side'));
          const num = Core.parseNumber, e = num(get(r, 'entry')), x = num(get(r, 'exit')), sl = num(get(r, 'sl')), q = num(get(r, 'qty')), pnl = num(get(r, 'pnl'));
          const R = Core.computeR(e, x, sl);
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
