/* Whale — watchlist and price alerts (right panel of the Analysis tab).
   Prices refresh every minute; alerts are checked every minute while Whale is open, even in another view. */
window.Watch = (() => {
  const U = () => Analysis.util;
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let list = read('whale-watch', Market.DEFAULT_WATCH.slice());
  let alerts = read('whale-alerts', []);
  let quotes = {}; // symbol -> { last, chg, closes, demo, at }
  let el = null, busy = false, lastRefresh = 0;
  const active = () => alerts.filter((a) => !a.hit);
  const timeAgo = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

  /* ---------- Toasts, sound and system notification ---------- */
  function toast(html, kind, ms = 5000) {
    let box = $('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : ''); t.innerHTML = html;
    t.onclick = () => t.remove();
    box.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.65);
    } catch (e) {}
  }
  function notify(title, body) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch (e) {} }
  function askPermission() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }

  /* ---------- Prices ---------- */
  function setQuotes(got) {
    Object.keys(got).forEach((s) => {
      const c = got[s].candles.map((k) => k.close), n = c.length;
      if (n) quotes[s] = { last: c[n - 1], chg: n > 1 ? c[n - 1] / c[n - 2] - 1 : null, closes: c.slice(-30), demo: got[s].demo, at: Date.now() };
    });
  }
  async function refresh() {
    if (busy) return;
    busy = true; render();
    try {
      setQuotes(await U().fetchMany([...new Set(list.concat(active().map((a) => a.symbol)))], '1mo'));
      lastRefresh = Date.now();
      check();
    } catch (e) { console.warn('watchlist refresh failed', e); }
    busy = false; render();
  }
  async function refreshOne(sym) { try { setQuotes(await U().fetchMany([sym], '1mo')); } catch (e) {} render(); }

  /* ---------- Alerts ---------- */
  function check() {
    let changed = false;
    alerts.forEach((a) => {
      const q = quotes[a.symbol];
      if (a.hit || !q || q.demo || q.last == null) return; // demo prices never trigger an alert
      if ((a.op === '>' && q.last >= a.price) || (a.op === '<' && q.last <= a.price)) {
        a.hit = Date.now(); a.hitPrice = q.last; changed = true;
        const name = Market.displayName(a.symbol), txt = `${name} ${a.op === '>' ? 'rose above' : 'fell below'} ${U().fmt(a.price)} · now ${U().fmt(q.last)}`;
        toast(`<b>Alert · ${esc(name)}</b><br>${esc(txt)}${a.note ? `<br><small>${esc(a.note)}</small>` : ''}`, 'alert', 15000);
        beep(); notify('Whale price alert', txt);
      }
    });
    if (changed) write('whale-alerts', alerts);
  }
  // op: '>' or '<'; when missing, it is chosen from the current price (a target above the price waits for a rise)
  async function addAlert(sym, op, price, note) {
    if (!sym || !(price > 0)) return;
    if (!op) {
      const cur = U().current();
      let last = cur && cur.meta.symbol === sym ? cur.candles[cur.candles.length - 1].close : null;
      if (last == null) { if (!quotes[sym]) await refreshOne(sym); last = quotes[sym] && quotes[sym].last; }
      op = last != null && price < last ? '<' : '>';
    }
    alerts.push({ id: Math.random().toString(36).slice(2, 10), symbol: sym, op, price, note: note || '', created: Date.now() });
    write('whale-alerts', alerts);
    toast(`Alert set: <b>${esc(Market.displayName(sym))}</b> ${op === '>' ? 'above' : 'below'} ${U().fmt(price)}`);
    askPermission(); render();
    if (!quotes[sym]) refreshOne(sym);
  }

  /* ---------- Panel ---------- */
  function render() {
    if (!el) return;
    const cur = U().current(), curSym = cur ? cur.meta.symbol : '';
    const row = (s) => {
      const q = quotes[s] || {};
      return `<div class="wl-row${s === curSym ? ' on' : ''}" data-sym="${esc(s)}">
        <span class="wl-sym"><b>${esc(Market.displayName(s))}</b><small>${esc(s)}</small></span>
        ${U().sparkSvg(q.closes, 60, 22)}
        <span class="wl-px"><b>${q.last != null ? U().fmt(q.last) : '…'}${q.demo ? '<span class="wl-demo">demo</span>' : ''}</b><small class="${q.chg >= 0 ? 'up' : 'dn'}">${q.chg != null ? U().sgn(q.chg) : ''}</small></span>
        <button class="wl-x" data-rm="${esc(s)}" title="Remove from the watchlist">×</button></div>`;
    };
    const alertRow = (a) => {
      const q = quotes[a.symbol];
      return `<div class="al-row${a.hit ? ' done' : ''}"><span><b>${esc(Market.displayName(a.symbol))}</b> ${a.op === '>' ? '≥' : '≤'} ${U().fmt(a.price)}${a.note ? ' · ' + esc(a.note) : ''}</span>
        <small>${a.hit ? 'hit ' + timeAgo(a.hit) : q && q.last != null ? 'now ' + U().fmt(q.last) : 'waiting'}</small><button data-al="${a.id}" title="Delete this alert">×</button></div>`;
    };
    const keep = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    const typed = keep ? document.activeElement.value : null;
    el.innerHTML = `
      <div class="wl-add"><input id="wlAdd" spellcheck="false" placeholder="+ Add a symbol: MSFT, SOL, GBPUSD…"></div>
      <div class="wl-h"><span>Watchlist · 1 day</span><button id="wlRefresh" title="Refresh the prices">${busy ? 'Updating…' : 'Refresh'}</button></div>
      ${list.map(row).join('') || '<p class="wl-note">Your watchlist is empty.</p>'}
      <div class="wl-h"><span>Price alerts</span>${alerts.some((a) => a.hit) ? '<button id="alClear">Clear hit alerts</button>' : ''}</div>
      <div class="al-form"><input id="alSym" spellcheck="false" value="${esc(curSym)}" title="Symbol"><input id="alPx" type="number" step="any" placeholder="Price"><button class="an-ghost an-mini" id="alAdd">Add</button></div>
      ${alerts.length ? alerts.slice().reverse().map(alertRow).join('') : '<p class="wl-note">No alert yet. Type a price above, select a Level drawing and click Alert, or type BTC ALRT 70000 in the command bar.</p>'}
      <p class="wl-note">Alerts are checked every minute while Whale is open.</p>`;
    if (keep && $(keep)) { $(keep).focus(); $(keep).value = typed; }
    const add = $('wlAdd');
    add.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const s = Market.normalizeSymbol(add.value); if (!s) return;
      add.value = '';
      if (!list.includes(s)) { list.push(s); write('whale-watch', list); render(); refreshOne(s); }
    };
    $('wlRefresh').onclick = refresh;
    if ($('alClear')) $('alClear').onclick = () => { alerts = alerts.filter((a) => !a.hit); write('whale-alerts', alerts); render(); };
    $('alAdd').onclick = () => addAlert(Market.normalizeSymbol($('alSym').value), null, +$('alPx').value);
    $('alPx').onkeydown = (e) => { if (e.key === 'Enter') $('alAdd').click(); };
    el.querySelectorAll('.wl-row').forEach((r) => (r.onclick = (e) => {
      if (e.target.dataset.rm) { list = list.filter((x) => x !== e.target.dataset.rm); write('whale-watch', list); render(); return; }
      Analysis.go({ fn: 'chart', symbol: r.dataset.sym });
    }));
    el.querySelectorAll('[data-al]').forEach((b) => (b.onclick = () => { alerts = alerts.filter((a) => a.id !== b.dataset.al); write('whale-alerts', alerts); render(); }));
  }
  function mount(container) {
    el = container; render();
    if (Date.now() - lastRefresh > 50000) refresh();
  }

  // every minute: prices for the open panel, and alerts even when another view is open
  setInterval(() => {
    const panelOpen = view === 'analysis' && el && !el.classList.contains('hide') && !document.hidden;
    if (active().length || panelOpen) refresh();
  }, 60000);
  if (active().length) setTimeout(refresh, 8000);

  return { mount, render, refresh, addAlert, toast, list: () => list.slice() };
})();
