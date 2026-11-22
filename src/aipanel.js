/* Whale — "Your AI" panel next to the brain.
   The AI answers AND drives the brain: it can highlight a folder, a period and notes. */
window.AIPanel = (() => {
  const SCHEMA = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      folder: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      notes: { type: 'array', items: { type: 'string' } },
      view_label: { type: 'string' },
    },
    required: ['answer', 'folder', 'from', 'to', 'notes', 'view_label'],
    additionalProperties: false,
  };
  const BRAIN = `
You also drive Whale's "Brain" view, where every note is a point.
If the question is about a folder, a period or specific notes, fill in:
- folder: the exact name of a folder from the list provided, else "";
- from and to: the period as YYYY-MM-DD, else "";
- notes: the exact names of the notes to light up (200 max), else [];
- view_label: 3 to 8 words describing what is shown (e.g. "your BTC trades, November 2026"), in the user's language, else "".
In "answer", reply in 1 to 4 sentences in the user's language, citing notes with [[Name]].`;

  let open = true, busy = false;
  const history = [];
  try { open = localStorage.getItem('whale-aipanel') !== '0'; } catch (e) {}

  const setOpen = (v) => {
    open = v;
    try { localStorage.setItem('whale-aipanel', v ? '1' : '0'); } catch (e) {}
    onView(view);
  };
  function onView(v) {
    const show = v === 'graph' && open;
    $('aipanel').classList.toggle('hide', !show);
    $('apOpen').classList.toggle('hide', v !== 'graph' || open);
    if (show && !$('apchat').children.length) welcome();
  }
  function welcome() {
    $('apchat').innerHTML = `<div class="apwelcome">Ask your journal anything. The AI answers and lights up the matching notes in the brain.
      <div class="apsug"><button>Show my losing trades</button><button>Everything about BTC</button><button>My mistakes in November</button></div></div>`;
    $('apchat').querySelectorAll('.apsug button').forEach((b) => (b.onclick = () => send(b.textContent)));
  }
  function add(cls, html) {
    const d = document.createElement('div'); d.className = 'apmsg ' + cls; d.innerHTML = html;
    $('apchat').appendChild(d); $('apchat').scrollTop = $('apchat').scrollHeight; return d;
  }
  async function send(q) {
    q = q.trim(); if (!q || busy) return;
    if ($('apchat').querySelector('.apwelcome')) $('apchat').innerHTML = '';
    busy = true; $('apsend').disabled = true;
    add('me', esc(q).replace(/\n/g, '<br>'));
    const wait = add('bot', '<span class="thinking">Reading your notes…</span>');
    try {
      const { ctx } = AI.buildContext(q);
      const text = await AI.call({ system: AI.ASK_SYSTEM + BRAIN, user: `${ctx}\n\n---\nQuestion: ${q}`, schema: SCHEMA, history: history.slice(-6), effort: 'medium' });
      let r;
      try { r = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { r = { answer: text, folder: '', from: '', to: '', notes: [], view_label: '' }; }
      history.push({ role: 'user', content: q }, { role: 'assistant', content: r.answer });
      const names = (r.notes || []).map((n) => resolve(n)).filter(Boolean);
      let chip = '';
      if (r.folder || (r.from && r.to) || names.length) {
        const nLit = Graph.focus({ folder: r.folder, from: r.from, to: r.to, names });
        chip = `<div class="apchip"><i></i>${esc(r.view_label || 'Highlighted in the brain')} · ${nLit} note(s) lit <button class="apclear">clear</button></div>`;
      }
      wait.innerHTML = chip + md(r.answer || '');
      const c = wait.querySelector('.apclear'); if (c) c.onclick = () => { Graph.clearFocus(); c.parentElement.classList.add('off'); };
    } catch (e) {
      wait.classList.add('err'); wait.textContent = String(e.message || e);
    }
    busy = false; $('apsend').disabled = false; $('apchat').scrollTop = $('apchat').scrollHeight;
  }
  $('apform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('apinput').value; $('apinput').value = ''; $('apinput').style.height = ''; send(v); });
  $('apinput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('apform').requestSubmit(); } });
  $('apinput').addEventListener('input', () => { const t = $('apinput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; });
  $('apClose').onclick = () => setOpen(false);
  $('apOpen').onclick = () => { setOpen(true); setTimeout(() => $('apinput').focus(), 30); };

  return { onView, send, open: () => setOpen(true) };
})();
