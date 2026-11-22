/* Whale — panneau « Ton IA » à droite du cerveau.
   L'IA répond ET pilote le cerveau : elle peut mettre en avant un dossier, une période et des notes. */
window.AIPanel = (() => {
  const SCHEMA = {
    type: 'object',
    properties: {
      reponse: { type: 'string' },
      dossier: { type: 'string' },
      debut: { type: 'string' },
      fin: { type: 'string' },
      notes: { type: 'array', items: { type: 'string' } },
      resume_vue: { type: 'string' },
    },
    required: ['reponse', 'dossier', 'debut', 'fin', 'notes', 'resume_vue'],
    additionalProperties: false,
  };
  const BRAIN = `
Tu pilotes aussi la vue « Cerveau » de Whale, où chaque note est un point.
Si la question vise un dossier, une période ou des notes précises, renseigne :
- dossier : le nom exact d'un dossier de la liste fournie, sinon "" ;
- debut et fin : la période au format AAAA-MM-JJ, sinon "" ;
- notes : les noms exacts des notes à allumer (au plus 200), sinon [] ;
- resume_vue : 3 à 8 mots qui décrivent ce qui est affiché (ex. « tes trades BTC, novembre 2026 »), sinon "".
Dans « reponse », réponds en français en 1 à 4 phrases, en citant les notes avec [[Nom]].`;

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
    $('apchat').innerHTML = `<div class="apwelcome">Demande quelque chose à ton journal. L'IA te répond et allume les notes concernées dans le cerveau.
      <div class="apsug"><button>Montre mes trades perdants</button><button>Tout sur BTC</button><button>Mes erreurs de novembre</button></div></div>`;
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
    const wait = add('bot', '<span class="thinking">Lecture de tes notes…</span>');
    try {
      const { ctx } = AI.buildContext(q);
      const text = await AI.call({ system: AI.ASK_SYSTEM + BRAIN, user: `${ctx}\n\n---\nQuestion : ${q}`, schema: SCHEMA, history: history.slice(-6), effort: 'medium' });
      let r;
      try { r = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { r = { reponse: text, dossier: '', debut: '', fin: '', notes: [], resume_vue: '' }; }
      history.push({ role: 'user', content: q }, { role: 'assistant', content: r.reponse });
      const names = (r.notes || []).map((n) => resolve(n)).filter(Boolean);
      let chip = '';
      if (r.dossier || (r.debut && r.fin) || names.length) {
        const nLit = Graph.focus({ folder: r.dossier, from: r.debut, to: r.fin, names });
        chip = `<div class="apchip"><i></i>${esc(r.resume_vue || 'Mise en avant dans le cerveau')} · ${nLit} note(s) allumée(s) <button class="apclear">effacer</button></div>`;
      }
      wait.innerHTML = chip + md(r.reponse || '');
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
