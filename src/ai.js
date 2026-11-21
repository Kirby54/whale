/* Whale — IA : réglages, appels Claude / Ollama, classement automatique, questions au journal */

/* ---------- Fenêtre modale réutilisable ---------- */
window.Modal = {
  show(html) { $('mbox').innerHTML = html; $('modal').classList.remove('hide'); },
  close() { $('modal').classList.add('hide'); $('mbox').innerHTML = ''; },
};
$('modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') Modal.close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').classList.contains('hide')) Modal.close(); });

window.AI = (() => {
  let settings = null;
  // Modèles qui acceptent le repli automatique côté serveur en cas de refus
  const FALLBACK_MODELS = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

  async function loadSettings() { settings = await Store.getSettings(); return settings; }
  function providerLabel() {
    if (!settings) return '';
    return settings.provider === 'ollama' ? `Ollama · ${settings.ollama_model}` : `Claude · ${settings.claude_model}`;
  }

  /**
   * Un appel à l'IA. Renvoie le texte de la réponse.
   * schema : schéma JSON pour forcer une réponse structurée (facultatif)
   * history : [{role:'user'|'assistant', content:'...'}] (facultatif)
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
      if (!text) throw new Error("Réponse vide d'Ollama");
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
      throw new Error("L'IA a refusé de répondre à cette demande." + (why ? ' (' + why + ')' : ''));
    }
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new Error("Réponse vide de l'API Claude");
    if (res.stop_reason === 'max_tokens') console.warn('Réponse coupée (max_tokens)');
    return text;
  }

  /* ---------- Réglages ---------- */
  async function openSettings() {
    await loadSettings();
    const s = settings;
    Modal.show(`
      <h2>Réglages de l'IA</h2>
      <div class="sub">Utilisée pour classer tes notes et répondre à tes questions.</div>
      <div class="row"><label>Fournisseur</label>
        <div class="seg" id="segProv">
          <button data-p="claude" class="${s.provider !== 'ollama' ? 'on' : ''}">Claude (API Anthropic)</button>
          <button data-p="ollama" class="${s.provider === 'ollama' ? 'on' : ''}">Ollama (local)</button>
        </div>
      </div>
      <div id="provClaude" style="display:${s.provider !== 'ollama' ? 'block' : 'none'}">
        <div class="row"><label>Clé API Anthropic</label>
          <input type="password" id="setKey" autocomplete="off" placeholder="${s.has_key ? 'Clé enregistrée ' + esc(s.key_hint) + ' · laisse vide pour la garder' : 'sk-ant-…'}">
          <div class="note">Crée une clé sur console.anthropic.com. Elle est enregistrée seulement sur cet ordinateur, dans le dossier de configuration de Whale (jamais dans ton coffre). L'usage est facturé par Anthropic.</div>
        </div>
        <div class="row"><label>Modèle</label>
          <input type="text" id="setModel" list="models" value="${esc(s.claude_model)}">
          <datalist id="models"><option value="claude-opus-5-5"><option value="claude-sonnet-5-5"><option value="claude-haiku-5-5"><option value="claude-fable-5-2"></datalist>
          <div class="note">Par défaut : claude-opus-5-5. claude-haiku-5-5 est bien moins cher pour classer beaucoup de notes.</div>
        </div>
      </div>
      <div id="provOllama" style="display:${s.provider === 'ollama' ? 'block' : 'none'}">
        <div class="row"><label>Adresse d'Ollama</label><input type="text" id="setOUrl" value="${esc(s.ollama_url)}"></div>
        <div class="row"><label>Modèle Ollama</label><input type="text" id="setOModel" value="${esc(s.ollama_model)}">
          <div class="note">100 % local et gratuit. Installe Ollama (ollama.com), puis par exemple : <code>ollama pull llama3.1</code></div>
        </div>
      </div>
      <div id="setMsg"></div>
      <div class="actions">
        ${s.has_key ? '<button class="tbtn" id="setForget" style="margin-right:auto">Oublier la clé</button>' : ''}
        <button class="tbtn" id="setTest">Tester</button>
        <button class="tbtn" id="setCancel">Annuler</button>
        <button class="tbtn ai" id="setSave">Enregistrer</button>
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
    $('setSave').onclick = async () => { try { await save(); Modal.close(); status('Réglages enregistrés · ' + providerLabel()); } catch (e) { msg('msg-err', String(e)); } };
    $('setTest').onclick = async () => {
      $('setTest').disabled = true; msg('note', 'Test en cours…');
      try {
        await save();
        const t = await call({ system: 'Tu es un test de connexion.', user: 'Réponds uniquement : OK', effort: 'low' });
        msg('msg-ok', `Connexion réussie (${providerLabel()}) : ${t.trim().slice(0, 60)}`);
      } catch (e) { msg('msg-err', String(e)); }
      $('setTest').disabled = false;
    };
    if ($('setForget')) $('setForget').onclick = async () => { try { settings = await Store.forgetKey(); Modal.close(); status('Clé API supprimée de cet ordinateur'); } catch (e) { msg('msg-err', String(e)); } };
  }

  /* ---------- Classement automatique ---------- */
  const CLASSIFY_SCHEMA = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['trade', 'setup', 'actif', 'emotion', 'conversation', 'note'] },
      tags: { type: 'array', items: { type: 'string' } },
      actif: { type: 'string' },
      setup: { type: 'string' },
      sens: { type: 'string', enum: ['LONG', 'SHORT', ''] },
      resultat: { type: 'string' },
      date: { type: 'string' },
      liens: { type: 'array', items: { type: 'string' } },
      resume: { type: 'string' },
    },
    required: ['type', 'tags', 'actif', 'setup', 'sens', 'resultat', 'date', 'liens', 'resume'],
    additionalProperties: false,
  };
  const CLASSIFY_SYSTEM = `Tu classes les notes de Whale, un journal de trading personnel qui sert aussi de « second cerveau ».
Pour la note fournie, renvoie :
- type : "trade" (un trade réel pris ou analysé), "setup" (une stratégie / un modèle d'entrée), "actif" (un instrument : action, crypto, paire forex…), "emotion" (une émotion ou une erreur récurrente), "conversation" (une conversation avec une IA importée), "note" (tout le reste).
- tags : 2 à 6 mots-clés courts en minuscules, sans #, utiles pour retrouver la note (ex. "fomo", "earnings", "gestion du risque").
- actif, setup : pour un trade, le nom exact d'une note existante si elle correspond (liste fournie), sinon le nom de l'actif ou du setup tel qu'écrit dans la note, sinon "".
- sens : "LONG", "SHORT" ou "".
- resultat : le résultat du trade en R (multiple du risque) sous forme de nombre, ex. "1.5" ou "-1", seulement s'il est écrit ou calculable depuis l'entrée, le stop et la sortie ; sinon "".
- date : la date de l'événement au format AAAA-MM-JJ si elle est indiquée, sinon "".
- liens : 0 à 6 noms de notes à relier. Utilise de préférence les noms exacts de la liste des notes existantes ; tu peux proposer un nouveau nom seulement pour une émotion, une erreur, un setup ou un actif clairement présent dans la note.
- resume : une phrase de résumé en français (25 mots maximum).
N'invente aucune information absente de la note.`;

  async function classifyNote(name) {
    const p = parse(name);
    const others = Object.keys(notes).filter((n) => n !== name).slice(0, 400);
    const user = `Notes existantes : ${others.join(' | ')}\n\nNote à classer — titre : ${name}\n\n${notes[name].content.slice(0, 12000)}`;
    const text = await call({ system: CLASSIFY_SYSTEM, user, schema: CLASSIFY_SCHEMA, effort: 'low' });
    let r;
    try { r = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch (e) { throw new Error("Réponse de l'IA illisible (JSON invalide)"); }

    const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
    const up = {};
    if (!p.props.type || p.props.type === 'note') up.type = r.type || 'note';
    const oldTags = (p.props.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const tags = [...new Set([...oldTags, ...(r.tags || []).map((t) => clean(t).toLowerCase().replace(/^#/, '')).filter(Boolean)])];
    if (tags.length) up.tags = tags.join(', ');
    const finalType = up.type || p.props.type;
    if (finalType === 'trade') {
      ['actif', 'setup', 'sens', 'resultat'].forEach((k) => { if (!p.props[k] && clean(r[k])) up[k] = clean(r[k]); });
    }
    if (!p.props.date && /^\d{4}-\d{2}-\d{2}$/.test(clean(r.date))) up.date = clean(r.date);
    if (!p.props.resume && clean(r.resume)) up.resume = clean(r.resume);
    setProps(name, up);

    const already = new Set(parse(name).links.map((l) => l.toLowerCase()));
    const add = (r.liens || []).map(clean).filter((l) => l && l.toLowerCase() !== name.toLowerCase() && !already.has(l.toLowerCase()));
    if (add.length) notes[name].content = notes[name].content.replace(/\s*$/, '') + `\n\nLiens : ${add.map((l) => `[[${resolve(l) || l}]]`).join(' · ')}\n`;
    await Store.write(notes[name].path, notes[name].content);
    return { up, add };
  }

  async function classifyCurrent() {
    if (!cur) return;
    await flushAll();
    const btn = $('btnClassify'); btn.disabled = true; btn.textContent = '✦ Classement…';
    try {
      const { up, add } = await classifyNote(cur);
      const n = Object.keys(up).length + add.length;
      status(n ? `IA : ${Object.keys(up).join(', ')}${add.length ? ' + ' + add.length + ' lien(s)' : ''}` : 'IA : rien à ajouter');
      renderTree(); renderNote();
    } catch (e) { alert(String(e.message || e)); }
    btn.disabled = false; btn.textContent = "✦ Classer avec l'IA";
  }

  // Classe toutes les notes qui n'ont pas encore de tags
  async function classifyAll(list) {
    await flushAll();
    if (!settings) await loadSettings();
    const todo = list || Object.keys(notes).filter((n) => !parse(n).props.tags);
    if (!todo.length) { alert('Toutes les notes sont déjà classées (elles ont des tags).'); return; }
    if (!confirm(`Classer ${todo.length} note(s) avec ${providerLabel()} ?\nChaque note = un appel à l'IA${settings.provider === 'claude' ? ' (facturé par Anthropic)' : ''}.`)) return;
    let ok = 0, fail = 0;
    for (let i = 0; i < todo.length; i++) {
      status(`IA : classement ${i + 1}/${todo.length} · ${todo[i]}`);
      try { await classifyNote(todo[i]); ok++; } catch (e) { fail++; console.error(todo[i], e); if (fail === 1 && ok === 0) { alert(String(e.message || e)); break; } }
    }
    status(`IA : ${ok} note(s) classée(s)${fail ? ', ' + fail + ' échec(s)' : ''}`);
    refreshAll();
  }

  /* ---------- Demander à ton journal ---------- */
  const ASK_SYSTEM = `Tu es l'assistant de Whale, le journal de trading personnel de l'utilisateur, qui contient aussi ses notes et ses conversations avec des IA.
Réponds en français, de façon claire, concrète et concise, en t'appuyant uniquement sur les notes et les statistiques fournies.
Cite chaque note que tu utilises avec la syntaxe [[Nom exact de la note]].
Si les notes ne contiennent pas l'information, dis-le simplement.
Tu aides à comprendre ses erreurs, ses setups, ses émotions et ses habitudes de trading. Tu ne donnes pas de conseil d'investissement personnalisé (pas de recommandation d'acheter ou de vendre un actif).`;
  const STOP = new Set('les des une un le la de du et en est pour pas que qui quoi sur dans avec mes mon ma tes ton ta ses son sa je tu il elle on nous vous ils elles ce cet cette ces quel quelle quels quelles pourquoi comment quand est-ce fait faire plus moins tout tous toutes très bien aussi ou par au aux a ai as avez sont été être the and what why how'.split(' '));
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
    if (!st.count) return 'Aucun trade avec un résultat en R.';
    const by = (g) => Object.keys(g).map((v) => `${v} : ${g[v].count} trades, ${g[v].winrate} % gagnants, total ${g[v].total} R`).join(' ; ');
    return `${st.count} trades, ${st.winrate} % gagnants, total ${st.total} R, moyenne ${st.avg} R, profit factor ${st.profitFactor ?? '—'}.
Par setup : ${by(st.bySetup)}
Par actif : ${by(st.byActif)}`;
  }

  function bubble(cls, html) {
    const d = document.createElement('div'); d.className = 'bubble ' + cls; d.innerHTML = html;
    $('chat').appendChild(d); $('chat').scrollTop = $('chat').scrollHeight; return d;
  }
  function welcome() {
    $('chat').innerHTML = `<div style="text-align:center;margin-top:40px">
      <div style="font-size:22px;font-weight:600">Demande à ton journal</div>
      <div class="sub" style="margin-top:4px">L'IA lit les notes utiles et te répond en citant ses sources.</div></div>
      <div class="suggest">
        <button>Pourquoi je perds de l'argent ?</button>
        <button>Quel setup marche le mieux pour moi ?</button>
        <button>Quelles erreurs je répète le plus ?</button>
        <button>Résume mes trades de ce mois-ci</button>
      </div>
      <div class="suggest"><button id="classifyAllBtn">✦ Classer toutes les notes sans tags</button></div>`;
    $('chat').querySelectorAll('.suggest button:not(#classifyAllBtn)').forEach((b) => (b.onclick = () => ask(b.textContent)));
    $('classifyAllBtn').onclick = () => classifyAll();
  }
  async function showAsk() {
    if (!settings) { try { await loadSettings(); } catch (e) {} }
    if (!history.length) welcome();
    $('askhint').textContent = settings ? `${providerLabel()} · ${settings.provider === 'claude' && !settings.has_key ? 'aucune clé API : ouvre les réglages (engrenage)' : 'tes notes pertinentes sont envoyées à l\'IA pour répondre'}` : '';
    setTimeout(() => $('askinput').focus(), 50);
  }
  async function ask(q) {
    q = q.trim(); if (!q || busy) return;
    if (!history.length) $('chat').innerHTML = '';
    busy = true; $('asksend').disabled = true;
    bubble('me', esc(q).replace(/\n/g, '<br>'));
    const wait = bubble('bot', '<span class="thinking">Lecture de tes notes…</span>');
    const used = retrieve(q);
    const ctx = `## Statistiques du journal\n${statsText()}\n\n## Toutes les notes (noms)\n${Object.keys(notes).slice(0, 400).join(' | ')}\n\n## Notes pertinentes\n` +
      used.map((n) => `### [[${n}]] (${TYPE_LABEL[parse(n).type] || 'Note'}${noteDate(n) ? ', ' + noteDate(n) : ''})\n${notes[n].content.slice(0, 3500)}`).join('\n\n');
    try {
      const answer = await call({ system: ASK_SYSTEM, user: `${ctx}\n\n---\nQuestion : ${q}`, history: history.slice(-6), effort: 'medium' });
      history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
      const cited = [...new Set([...answer.matchAll(/\[\[([^\]|]+)/g)].map((m) => resolve(m[1])).filter(Boolean))];
      const src = [...new Set([...cited, ...used])].slice(0, 12);
      wait.innerHTML = md(answer) + `<div class="src"><span class="note" style="margin:0 4px 0 0">Notes lues :</span>${src.map((n) => `<a data-n="${esc(n)}">${esc(n)}</a>`).join('')}</div>`;
    } catch (e) {
      wait.classList.add('err'); wait.textContent = String(e.message || e);
    }
    $('chat').scrollTop = $('chat').scrollHeight;
    busy = false; $('asksend').disabled = false;
  }
  $('askform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('askinput').value; $('askinput').value = ''; $('askinput').style.height = ''; ask(v); });
  $('askinput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('askform').requestSubmit(); } });
  $('askinput').addEventListener('input', () => { const t = $('askinput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; });

  return { call, openSettings, classifyCurrent, classifyAll, classifyNote, showAsk, loadSettings };
})();
