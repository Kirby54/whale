/* Whale — AI: settings, Claude / Ollama calls, auto-classification, questions to the journal */

/* ---------- Reusable modal ---------- */
window.Modal = {
  show(html) { $('mbox').innerHTML = html; $('modal').classList.remove('hide'); },
  close() { $('modal').classList.add('hide'); $('mbox').innerHTML = ''; },
};
$('modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') Modal.close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').classList.contains('hide')) Modal.close(); });

window.AI = (() => {
  let settings = null;
  // Models that accept the server-side fallback when a request is refused
  const FALLBACK_MODELS = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

  async function loadSettings() { settings = await Store.getSettings(); return settings; }
  function providerLabel() {
    if (!settings) return '';
    return settings.provider === 'ollama' ? `Ollama · ${settings.ollama_model}` : `Claude · ${settings.claude_model}`;
  }

  /**
   * One AI call. Returns the text of the answer.
   * schema: JSON schema to force a structured answer (optional)
   * history: [{role:'user'|'assistant', content:'...'}] (optional)
   */
  async function call({ system, user, schema, effort = 'medium', history = [] }) {
    if (!settings) await loadSettings();
    if (settings.provider === 'ollama') {
      const body = {
        model: settings.ollama_model,
        stream: false,
        messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: user }],
      };
      if (schema) body.format = schema;
      const res = await Store.ai(body);
      const text = res && res.message && res.message.content;
      if (!text) throw new Error('Empty answer from Ollama');
      return text;
    }
    const model = settings.claude_model || 'claude-opus-5-5';
    const body = {
      model,
      max_tokens: 16000,
      system,
      messages: [...history, { role: 'user', content: user }],
      output_config: { effort },
    };
    if (schema) body.output_config.format = { type: 'json_schema', schema };
    if (FALLBACK_MODELS.includes(model)) body.fallbacks = 'default';
    const res = await Store.ai(body);
    if (res.stop_reason === 'refusal') {
      const why = res.stop_details && res.stop_details.explanation;
      throw new Error('The AI declined this request.' + (why ? ' (' + why + ')' : ''));
    }
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new Error('Empty answer from the Claude API');
    if (res.stop_reason === 'max_tokens') console.warn('Answer cut off (max_tokens)');
    return text;
  }

  /* ---------- Settings ---------- */
  async function openSettings() {
    await loadSettings();
    const s = settings;
    Modal.show(`
      <h2>AI settings</h2>
      <div class="sub">Used to classify your notes and answer your questions.</div>
      <div class="row"><label>Provider</label>
        <div class="seg" id="segProv">
          <button data-p="claude" class="${s.provider !== 'ollama' ? 'on' : ''}">Claude (Anthropic API)</button>
          <button data-p="ollama" class="${s.provider === 'ollama' ? 'on' : ''}">Ollama (local)</button>
        </div>
      </div>
      <div id="provClaude" style="display:${s.provider !== 'ollama' ? 'block' : 'none'}">
        <div class="row"><label>Anthropic API key</label>
          <input type="password" id="setKey" autocomplete="off" placeholder="${s.has_key ? 'Key saved ' + esc(s.key_hint) + ' · leave empty to keep it' : 'sk-ant-…'}">
          <div class="note">Create a key at console.anthropic.com. ${s.key_store ? 'Key stored in the ' + esc(s.key_store) + ' of this computer.' : 'It will be stored in the system vault (Windows Credential Manager), never in your notes.'} Usage is billed by Anthropic.</div>
        </div>
        <div class="row"><label>Model</label>
          <input type="text" id="setModel" list="models" value="${esc(s.claude_model)}">
          <datalist id="models"><option value="claude-opus-5-5"><option value="claude-sonnet-5-5"><option value="claude-haiku-5-5"><option value="claude-fable-5-2"></datalist>
          <div class="note">Default: claude-opus-5-5. claude-haiku-5-5 is much cheaper for classifying many notes.</div>
        </div>
      </div>
      <div id="provOllama" style="display:${s.provider === 'ollama' ? 'block' : 'none'}">
        <div class="row"><label>Ollama address</label><input type="text" id="setOUrl" value="${esc(s.ollama_url)}"></div>
        <div class="row"><label>Ollama model</label><input type="text" id="setOModel" value="${esc(s.ollama_model)}">
          <div class="note">100% local and free. Install Ollama (ollama.com), then for example: <code>ollama pull llama3.1</code></div>
        </div>
      </div>
      <div id="setMsg"></div>
      <div class="actions">
        ${s.has_key ? '<button class="tbtn" id="setForget" style="margin-right:auto">Forget key</button>' : ''}
        <button class="tbtn" id="setTest">Test</button>
        <button class="tbtn" id="setCancel">Cancel</button>
        <button class="tbtn ai" id="setSave">Save</button>
      </div>`);
    let prov = s.provider === 'ollama' ? 'ollama' : 'claude';
    $('segProv').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      prov = b.dataset.p;
      [...$('segProv').children].forEach((x) => x.classList.toggle('on', x === b));
      $('provClaude').style.display = prov === 'claude' ? 'block' : 'none';
      $('provOllama').style.display = prov === 'ollama' ? 'block' : 'none';
    };
    const save = async () => {
      settings = await Store.saveSettings({ provider: prov, claude_key: $('setKey').value, claude_model: $('setModel').value, ollama_url: $('setOUrl').value, ollama_model: $('setOModel').value });
      $('setKey').value = '';
    };
    const msg = (cls, t) => { $('setMsg').innerHTML = `<div class="${cls}">${esc(t)}</div>`; };
    $('setCancel').onclick = Modal.close;
    $('setSave').onclick = async () => { try { await save(); Modal.close(); status('Settings saved · ' + providerLabel()); } catch (e) { msg('msg-err', String(e)); } };
    $('setTest').onclick = async () => {
      $('setTest').disabled = true; msg('note', 'Testing…');
      try {
        await save();
        const t = await call({ system: 'You are a connection test.', user: 'Reply with exactly: OK', effort: 'low' });
        msg('msg-ok', `Connected (${providerLabel()}): ${t.trim().slice(0, 60)}`);
      } catch (e) { msg('msg-err', String(e)); }
      $('setTest').disabled = false;
    };
    if ($('setForget')) $('setForget').onclick = async () => { try { settings = await Store.forgetKey(); Modal.close(); status('API key removed from this computer'); } catch (e) { msg('msg-err', String(e)); } };
  }

  /* ---------- Auto-classification ---------- */
  const CLASSIFY_SCHEMA = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['trade', 'setup', 'asset', 'emotion', 'conversation', 'note'] },
      tags: { type: 'array', items: { type: 'string' } },
      asset: { type: 'string' },
      setup: { type: 'string' },
      side: { type: 'string', enum: ['LONG', 'SHORT', ''] },
      result: { type: 'string' },
      date: { type: 'string' },
      links: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
    },
    required: ['type', 'tags', 'asset', 'setup', 'side', 'result', 'date', 'links', 'summary'],
    additionalProperties: false,
  };
  const CLASSIFY_SYSTEM = `You classify notes in Whale, a personal trading journal that is also a "second brain".
For the given note, return:
- type: "trade" (a real trade taken or analysed), "setup" (a strategy / entry pattern), "asset" (an instrument: stock, crypto, forex pair…), "emotion" (a recurring emotion or mistake), "conversation" (an imported AI conversation), "note" (anything else).
- tags: 2 to 6 short lowercase keywords, without #, useful to find the note again (e.g. "fomo", "earnings", "risk management").
- asset, setup: for a trade, the exact name of an existing note if one matches (list provided), else the asset or setup name as written in the note, else "".
- side: "LONG", "SHORT" or "".
- result: the trade result in R (multiple of risk) as a number, e.g. "1.5" or "-1", only if it is written or can be computed from entry, stop and exit; else "".
- date: the date of the event as YYYY-MM-DD if stated, else "".
- links: 0 to 6 note names to link. Prefer exact names from the list of existing notes; only suggest a new name for an emotion, mistake, setup or asset clearly present in the note.
- summary: a one-sentence summary (25 words max), in the language of the note.
Do not invent anything that is not in the note.`;

  async function classifyNote(name) {
    const p = parse(name);
    const others = Object.keys(notes).filter((n) => n !== name).slice(0, 400);
    const user = `Existing notes: ${others.join(' | ')}\n\nNote to classify — title: ${name}\n\n${notes[name].content.slice(0, 12000)}`;
    const text = await call({ system: CLASSIFY_SYSTEM, user, schema: CLASSIFY_SCHEMA, effort: 'low' });
    let r;
    try { r = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch (e) { throw new Error('Unreadable AI answer (invalid JSON)'); }

    const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
    const up = {};
    if (!p.props.type || p.props.type === 'note') up.type = r.type || 'note';
    const oldTags = (p.props.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const tags = [...new Set([...oldTags, ...(r.tags || []).map((t) => clean(t).toLowerCase().replace(/^#/, '')).filter(Boolean)])];
    if (tags.length) up.tags = tags.join(', ');
    const finalType = up.type || p.props.type;
    if (finalType === 'trade') {
      ['asset', 'setup', 'side', 'result'].forEach((k) => { if (!p.props[k] && clean(r[k])) up[k] = clean(r[k]); });
    }
    if (!p.props.date && /^\d{4}-\d{2}-\d{2}$/.test(clean(r.date))) up.date = clean(r.date);
    if (!p.props.summary && clean(r.summary)) up.summary = clean(r.summary);
    setProps(name, up);

    const already = new Set(parse(name).links.map((l) => l.toLowerCase()));
    const add = (r.links || []).map(clean).filter((l) => l && l.toLowerCase() !== name.toLowerCase() && !already.has(l.toLowerCase()));
    if (add.length) notes[name].content = notes[name].content.replace(/\s*$/, '') + `\n\nLinks: ${add.map((l) => `[[${resolve(l) || l}]]`).join(' · ')}\n`;
    await saveNote(name);
    return { up, add };
  }

  async function classifyCurrent() {
    if (!cur) return;
    await flushAll();
    const btn = $('btnClassify'); btn.disabled = true; btn.textContent = '✦ Classifying…';
    try {
      const { up, add } = await classifyNote(cur);
      const n = Object.keys(up).length + add.length;
      status(n ? `AI: ${Object.keys(up).join(', ')}${add.length ? ' + ' + add.length + ' link(s)' : ''}` : 'AI: nothing to add');
      renderTree(); renderNote();
    } catch (e) { alert(String(e.message || e)); }
    btn.disabled = false; btn.textContent = '✦ Classify with AI';
  }

  // Classifies every note that has no tags yet
  async function classifyAll(list) {
    await flushAll();
    if (!settings) await loadSettings();
    const todo = list || Object.keys(notes).filter((n) => !parse(n).props.tags);
    if (!todo.length) { alert('All notes are already classified (they have tags).'); return; }
    if (!confirm(`Classify ${todo.length} note(s) with ${providerLabel()}?\nEach note = one AI call${settings.provider === 'claude' ? ' (billed by Anthropic)' : ''}.`)) return;
    let ok = 0, fail = 0;
    for (let i = 0; i < todo.length; i++) {
      status(`AI: classifying ${i + 1}/${todo.length} · ${todo[i]}`);
      try { await classifyNote(todo[i]); ok++; } catch (e) { fail++; console.error(todo[i], e); if (fail === 1 && ok === 0) { alert(String(e.message || e)); break; } }
    }
    status(`AI: ${ok} note(s) classified${fail ? ', ' + fail + ' failed' : ''}`);
    refreshAll();
  }

  /* ---------- Ask your journal ---------- */
  const ASK_SYSTEM = `You are the assistant in Whale, the user's personal trading journal, which also holds their notes and their conversations with AIs.
Reply in the same language as the user's question, clearly, concretely and concisely, using only the notes and statistics provided.
Cite every note you use with the syntax [[Exact note name]].
If the notes do not contain the information, say so plainly.
You help the user understand their mistakes, setups, emotions and trading habits. You do not give personalized investment advice (no recommendation to buy or sell an asset).`;
  // Words ignored when searching notes (English and French, since notes can be in either)
  const STOP = new Set(('the and for are but not you your yours what why how when which who with from this that these those was were has have had does did can could should would about into over than then them they their there here all any more most less very also just been being our out its it\'s '
    + 'les des une est pour pas que qui quoi sur dans avec mes mon tes ton ses son elle nous vous ils elles cet cette ces quel quelle quels quelles pourquoi comment quand fait faire plus moins tout tous toutes tres bien aussi par aux sont ete etre').split(' '));
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let history = [];
  let busy = false;

  function retrieve(q) {
    const terms = [...new Set(norm(q).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)))];
    const scored = Object.keys(notes).map((n) => {
      const name = norm(n), body = norm(notes[n].content);
      let s = 0;
      terms.forEach((t) => {
        if (name.includes(t)) s += 8;
        let i = 0, c = 0; while ((i = body.indexOf(t, i)) !== -1 && c < 10) { c++; i += t.length; }
        s += c;
      });
      return [s, n];
    }).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 14).map((x) => x[1]);
    if (scored.length < 4) {
      const recent = Object.keys(notes).filter((n) => parse(n).type === 'trade').sort((a, b) => noteDate(b).localeCompare(noteDate(a))).slice(0, 10);
      recent.forEach((n) => { if (!scored.includes(n)) scored.push(n); });
    }
    return scored;
  }
  function statsText() {
    const st = tradeStats();
    if (!st.count) return 'No trades with a result in R.';
    const by = (g) => Object.keys(g).map((v) => `${v}: ${g[v].count} trades, ${g[v].winrate}% winners, total ${g[v].total} R`).join('; ');
    return `${st.count} trades, ${st.winrate}% winners, total ${st.total} R, average ${st.avg} R, profit factor ${st.profitFactor ?? '—'}.\nBy setup: ${by(st.bySetup)}\nBy asset: ${by(st.byAsset)}`;
  }

  // Context sent to the AI: stats, list of notes and folders, relevant notes
  function buildContext(q) {
    const used = retrieve(q);
    const folders = [...new Set(Object.keys(notes).map((n) => (notes[n].path.includes('/') ? notes[n].path.split('/')[0] : 'Notes')))];
    const ctx = `## Journal statistics\n${statsText()}\n\n## Folders\n${folders.join(' | ')}\n\n## All notes (names)\n${Object.keys(notes).slice(0, 400).join(' | ')}\n\n## Relevant notes\n` +
      used.map((n) => `### [[${n}]] (${TYPE_LABEL[parse(n).type] || 'Note'}${noteDate(n) ? ', ' + noteDate(n) : ''}, folder ${notes[n].path.split('/')[0]})\n${notes[n].content.slice(0, 3500)}`).join('\n\n');
    return { ctx, used, folders };
  }

  function bubble(cls, html) {
    const d = document.createElement('div'); d.className = 'bubble ' + cls; d.innerHTML = html;
    $('chat').appendChild(d); $('chat').scrollTop = $('chat').scrollHeight; return d;
  }
  function welcome() {
    $('chat').innerHTML = `<div style="text-align:center;margin-top:40px">
      <div style="font-size:22px;font-weight:600">Ask your journal</div>
      <div class="sub" style="margin-top:4px">The AI reads the relevant notes and answers with its sources.</div></div>
      <div class="suggest">
        <button>Why am I losing money?</button>
        <button>Which setup works best for me?</button>
        <button>Which mistakes do I repeat most?</button>
        <button>Summarize my trades this month</button>
      </div>
      <div class="suggest"><button id="classifyAllBtn">✦ Classify all notes without tags</button></div>`;
    $('chat').querySelectorAll('.suggest button:not(#classifyAllBtn)').forEach((b) => (b.onclick = () => ask(b.textContent)));
    $('classifyAllBtn').onclick = () => classifyAll();
  }
  async function showAsk() {
    if (!settings) { try { await loadSettings(); } catch (e) {} }
    if (!history.length) welcome();
    $('askhint').textContent = settings ? `${providerLabel()} · ${settings.provider === 'claude' && !settings.has_key ? 'no API key: open More → AI settings' : 'your relevant notes are sent to the AI to answer'}` : '';
    setTimeout(() => $('askinput').focus(), 50);
  }
  async function ask(q) {
    q = q.trim(); if (!q || busy) return;
    if (!history.length) $('chat').innerHTML = '';
    busy = true; $('asksend').disabled = true;
    bubble('me', esc(q).replace(/\n/g, '<br>'));
    const wait = bubble('bot', '<span class="thinking">Reading your notes…</span>');
    const { ctx, used } = buildContext(q);
    try {
      const answer = await call({ system: ASK_SYSTEM, user: `${ctx}\n\n---\nQuestion: ${q}`, history: history.slice(-6), effort: 'medium' });
      history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
      const cited = [...new Set([...answer.matchAll(/\[\[([^\]|]+)/g)].map((m) => resolve(m[1])).filter(Boolean))];
      const src = [...new Set([...cited, ...used])].slice(0, 12);
      wait.innerHTML = md(answer) + `<div class="src"><span class="note" style="margin:0 4px 0 0">Notes read:</span>${src.map((n) => `<a data-n="${esc(n)}">${esc(n)}</a>`).join('')}</div>`;
    } catch (e) {
      wait.classList.add('err'); wait.textContent = String(e.message || e);
    }
    $('chat').scrollTop = $('chat').scrollHeight;
    busy = false; $('asksend').disabled = false;
  }
  $('askform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('askinput').value; $('askinput').value = ''; $('askinput').style.height = ''; ask(v); });
  $('askinput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('askform').requestSubmit(); } });
  $('askinput').addEventListener('input', () => { const t = $('askinput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; });

  return { call, openSettings, classifyCurrent, classifyAll, classifyNote, showAsk, loadSettings, buildContext, ASK_SYSTEM, providerLabel: () => providerLabel(), getSettings: () => settings };
})();
