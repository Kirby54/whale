/* Whale — import: note folders, ChatGPT / Claude conversations, broker CSV */
window.Importer = (() => {
  const baseName = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop();

  function open() {
    Modal.show(`
      <h2>Import</h2>
      <div class="sub">Nothing is overwritten: files already in the vault are skipped.</div>
      <div class="imp">
        <button id="impFolder"><b>Note folder</b><span>Obsidian, Notion (Markdown export), Logseq… copies .md files and images</span></button>
        <button id="impChats"><b>AI conversations</b><span>ChatGPT or Claude export: conversations.json file</span></button>
        <button id="impCsv"><b>Broker trades</b><span>CSV file: MT4/MT5, TradingView, Binance, IBKR…</span></button>
        <button id="impClose" style="display:flex;align-items:center;justify-content:center;color:var(--tx3)">Close</button>
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
    const btn = newNames && newNames.length ? `<button class="tbtn ai" id="impClassify">✦ Classify these ${newNames.length} notes with AI</button>` : '';
    msg(`<div class="msg-ok">${esc(text)}</div><div class="actions">${btn}<button class="tbtn" id="impOk">OK</button></div>`);
    $('impOk').onclick = () => { Modal.close(); refreshAll(); };
    if (btn) $('impClassify').onclick = () => { Modal.close(); AI.classifyAll(newNames); };
  }
  const fail = (e) => msg(`<div class="msg-err">${esc(String(e.message || e))}</div>`);

  /* ---------- Note folder ---------- */
  async function importFolder() {
    try {
      const src = await Store.pickFolder('Note folder to import'); if (!src) return;
      const dest = 'Import/' + safeName(baseName(src));
      msg('<div class="note">Copying…</div>');
      const before = new Set(Object.keys(notes));
      const n = await Store.importFolder(src, dest);
      await loadAll();
      const added = Object.keys(notes).filter((k) => !before.has(k));
      done(`${n} note(s) copied to ${dest}`, added);
    } catch (e) { fail(e); }
  }

  /* ---------- ChatGPT / Claude conversations ---------- */
  async function importChats() {
    try {
      const path = await Store.pickFile('Conversation export (conversations.json)', ['json']); if (!path) return;
      msg('<div class="note">Reading the file…</div>');
      const convs = Core.parseConversations(JSON.parse(await Store.readExternal(path)));
      if (!convs.length) throw new Error('No conversation recognized. Use the conversations.json file from a ChatGPT or Claude export.');
      const added = [];
      for (const c of convs) {
        let name = `${c.date ? c.date + ' ' : ''}${c.title}`.replace(/[\r\n]+/g, ' ').slice(0, 90).trim();
        const dir = `AI conversations/${c.source}`;
        if (notes[name] && notes[name].path.startsWith(dir)) continue; // already imported
        const base = name; let i = 2; while (notes[name]) name = `${base} (${i++})`;
        const body = c.msgs.map(([who, t]) => `**${who}**:\n${t}`).join('\n\n');
        const content = `---\ntype: conversation\nsource: ${c.source}\n${c.date ? 'date: ' + c.date + '\n' : ''}---\n# ${c.title}\n\n${body}\n`;
        const p = `${dir}/${safeName(name)}.md`;
        await Store.write(p, content);
        notes[name] = { path: p, content, mtime: 0 }; added.push(name);
        if (added.length % 25 === 0) msg(`<div class="note">${added.length} / ${convs.length} conversations…</div>`);
      }
      done(`${added.length} conversation(s) imported (${convs.length - added.length} already there).`, added);
    } catch (e) { fail(e); }
  }

  /* ---------- Broker CSV ---------- */
  const FIELD_LABELS = { date: 'Date', symbol: 'Asset *', side: 'Side', entry: 'Entry price', exit: 'Exit price', sl: 'Stop loss', qty: 'Quantity', pnl: 'P&L' };
  async function importCsv() {
    try {
      const path = await Store.pickFile('Trades CSV file', ['csv', 'tsv', 'txt']); if (!path) return;
      const rows = Core.parseCSV(await Store.readExternal(path));
      if (rows.length < 2) throw new Error('The file has no trade rows.');
      const headers = rows[0], data = rows.slice(1), map = Core.detectColumns(headers);
      const opts = (f) => `<option value="-1">— none —</option>` + headers.map((h, i) => `<option value="${i}" ${map[f] === i ? 'selected' : ''}>${esc(h)}</option>`).join('');
      Modal.show(`
        <h2>Import trades</h2>
        <div class="sub">${data.length} row(s) in ${esc(baseName(path))}. Check which column is which.</div>
        ${Object.keys(FIELD_LABELS).map((f) => `<div class="row" style="margin:8px 0;display:flex;align-items:center;gap:10px"><label style="width:120px;margin:0">${FIELD_LABELS[f]}</label><select data-f="${f}" style="flex:1">${opts(f)}</select></div>`).join('')}
        <div class="note">The result in R is computed when entry, exit and stop are known. Otherwise the P&L is kept in the "pnl" property.</div>
        <div id="impMsg"></div>
        <div class="actions"><button class="tbtn" id="csvCancel">Cancel</button><button class="tbtn ai" id="csvGo">Create trades</button></div>`);
      $('csvCancel').onclick = Modal.close;
      $('csvGo').onclick = async () => {
        const m = {}; document.querySelectorAll('#mbox select').forEach((s) => { const v = +s.value; if (v >= 0) m[s.dataset.f] = v; });
        if (m.symbol == null) { msg('<div class="msg-err">Pick at least the asset column.</div>'); return; }
        $('csvGo').disabled = true;
        const get = (r, f) => (m[f] != null ? String(r[m[f]] || '').trim() : '');
        const added = []; const file = baseName(path);
        for (const r of data) {
          const sym = get(r, 'symbol').toUpperCase(); if (!sym) continue;
          const d = Core.toDay(get(r, 'date')), sd = Core.normSide(get(r, 'side'));
          const num = Core.parseNumber, e = num(get(r, 'entry')), x = num(get(r, 'exit')), sl = num(get(r, 'sl')), q = num(get(r, 'qty')), pnl = num(get(r, 'pnl'));
          const R = Core.computeR(e, x, sl);
          let name = `${d || 'undated'} ${sym}${sd ? ' ' + sd.toLowerCase() : ''}`;
          const base = name; let i = 2;
          while (notes[name]) name = `${base} (${i++})`;
          const pr = { type: 'trade', date: d, asset: sym, setup: '', side: sd, entry: e ?? '', stop: sl ?? '', exit: x ?? '', quantity: q ?? '', pnl: pnl ?? '', result: R ?? '', source: 'CSV import' };
          const fm = Object.keys(pr).filter((k) => pr[k] !== '' || ['setup', 'result'].includes(k)).map((k) => `${k}: ${pr[k]}`).join('\n');
          const content = `---\n${fm}\n---\nImported from ${file}. Asset: [[${sym}]]\n\n## Context\n\n\n## Mistakes / emotions\n\n`;
          const p = `Trades/Import/${safeName(name)}.md`;
          await Store.write(p, content);
          notes[name] = { path: p, content, mtime: 0 }; added.push(name);
        }
        done(`${added.length} trade(s) created in Trades/Import.`);
      };
    } catch (e) { fail(e); }
  }

  return { open };
})();
