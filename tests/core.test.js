// Tests de la logique pure de Whale. Lancer : npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');

test('parseRaw : propriétés, corps et liens', () => {
  const p = Core.parseRaw('---\ntype: trade\nactif: TSLA\nresultat: 1.5\n---\nCassure sur [[TSLA]] et [[Breakout|mon setup]].');
  assert.equal(p.type, 'trade');
  assert.equal(p.props.actif, 'TSLA');
  assert.equal(p.props.resultat, '1.5');
  assert.deepEqual(p.targets, ['TSLA', 'Breakout']);
  assert.ok(p.body.startsWith('Cassure'));
});

test('parseRaw : sans frontmatter, type par défaut "note"', () => {
  const p = Core.parseRaw('# Titre\n\nTexte');
  assert.equal(p.type, 'note');
  assert.deepEqual(p.props, {});
  assert.equal(p.body, '# Titre\n\nTexte');
});

test('parseRaw : ignore les images embarquées et les liens dans le code', () => {
  const p = Core.parseRaw('![[chart.png]] `[[PasUnLien]]` ![[Autre note]] [[FOMO]] [[FOMO]]');
  assert.deepEqual(p.targets, ['Autre note', 'FOMO']);
});

test('parseRaw : fins de ligne Windows (CRLF)', () => {
  const p = Core.parseRaw('---\r\ntype: setup\r\n---\r\nTexte');
  assert.equal(p.type, 'setup');
  assert.equal(p.body, 'Texte');
});

test('rOf : virgule ou point, valeurs vides', () => {
  assert.equal(Core.rOf({ resultat: '1,5' }), 1.5);
  assert.equal(Core.rOf({ resultat: '-1' }), -1);
  assert.equal(Core.rOf({ resultat: '' }), null);
  assert.equal(Core.rOf({}), null);
  assert.equal(Core.rOf(null), null);
});

test('setPropsText : modifie, ajoute, supprime en gardant l\'ordre', () => {
  const raw = '---\ntype: trade\nactif: \nsens: LONG\n---\nCorps';
  const out = Core.setPropsText(raw, { actif: 'BTC', sens: null, tags: 'fomo, btc', vide: '' });
  assert.equal(out, '---\ntype: trade\nactif: BTC\ntags: fomo, btc\n---\nCorps');
});

test('setPropsText : crée le frontmatter s\'il n\'existe pas', () => {
  assert.equal(Core.setPropsText('# Note\n', { type: 'note' }), '---\ntype: note\n---\n# Note\n');
});

test('renameInContent : liens, alias, casse et propriétés', () => {
  const c = '---\nsetup: Breakout\nactif: TSLA\n---\nVoir [[Breakout]], [[breakout|alias]] et [[Breakout pro]].';
  const out = Core.renameInContent(c, 'Breakout', 'Cassure');
  assert.ok(out.includes('setup: Cassure'));
  assert.ok(out.includes('[[Cassure]]'));
  assert.ok(out.includes('[[Cassure|alias]]'));
  assert.ok(out.includes('[[Breakout pro]]'), 'ne doit pas toucher une autre note qui commence pareil');
  assert.ok(out.includes('actif: TSLA'));
});

test('renameInContent : ne mange pas la ligne suivante', () => {
  const out = Core.renameInContent('---\nactif: TSLA\n\nsens: LONG\n---\n', 'TSLA', 'Tesla');
  assert.equal(out, '---\nactif: Tesla\n\nsens: LONG\n---\n');
});

test('makeResolver : exact puis insensible à la casse', () => {
  const r = Core.makeResolver(['TSLA', 'Stop trop serré']);
  assert.equal(r('TSLA'), 'TSLA');
  assert.equal(r('tsla'), 'TSLA');
  assert.equal(r('  stop trop serré '), 'Stop trop serré');
  assert.equal(r('Inconnu'), null);
});

test('safeName : caractères interdits sous Windows', () => {
  assert.equal(Core.safeName('Trade: TSLA/long?'), 'Trade- TSLA-long-');
  assert.equal(Core.safeName('...caché'), 'caché');
  assert.equal(Core.safeName('   '), 'Sans titre');
});

test('stem et dirOf', () => {
  assert.equal(Core.stem('Trades/Import/2026-11-21 AAPL long.md'), '2026-11-21 AAPL long');
  assert.equal(Core.dirOf('Trades/Import/x.md'), 'Trades/Import');
  assert.equal(Core.dirOf('x.md'), '');
});

test('computeStats : taux de réussite, total, profit factor, regroupements', () => {
  const s = Core.computeStats([
    { r: 2, setup: 'Breakout', actif: 'BTC' },
    { r: -1, setup: 'Breakout', actif: 'TSLA' },
    { r: 1.5, setup: 'Pullback', actif: 'BTC' },
    { r: null, setup: 'Pullback' },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.winrate, 67);
  assert.equal(s.total, 2.5);
  assert.equal(s.avg, 0.83);
  assert.equal(s.profitFactor, 3.5);
  assert.deepEqual(s.equity, [0, 2, 1, 2.5]);
  assert.deepEqual(s.bySetup.Breakout, { count: 2, winrate: 50, total: 1 });
  assert.deepEqual(s.byActif.BTC, { count: 2, winrate: 100, total: 3.5 });
});

test('computeStats : aucun trade, aucune perte', () => {
  assert.equal(Core.computeStats([]).avg, null);
  assert.equal(Core.computeStats([{ r: 1 }]).profitFactor, null);
});

test('computeR : long et short', () => {
  assert.equal(Core.computeR(100, 104, 98), 2);          // long gagnant
  assert.equal(Core.computeR(100, 98, 98), -1);          // long au stop
  assert.equal(Core.computeR(1.085, 1.081, 1.087), 2);   // short gagnant
  assert.equal(Core.computeR(262, 265, 265), -1);        // short au stop
  assert.equal(Core.computeR(100, 104, 100), null);      // stop = entrée
  assert.equal(Core.computeR(100, null, 98), null);
});

test('parseNumber : formats européens et américains', () => {
  assert.equal(Core.parseNumber('1,0850'), 1.085);
  assert.equal(Core.parseNumber('1,234.56'), 1234.56);
  assert.equal(Core.parseNumber('$-40'), -40);
  assert.equal(Core.parseNumber('1 234,5'), 1234.5);
  assert.equal(Core.parseNumber(''), null);
  assert.equal(Core.parseNumber('abc'), null);
});

test('toDay : formats de date des brokers', () => {
  assert.equal(Core.toDay('2026.11.21 09:30'), '2026-11-21');
  assert.equal(Core.toDay('21/11/2026'), '2026-11-21');
  assert.equal(Core.toDay('2026-1-5'), '2026-01-05');
  assert.equal(Core.toDay('2026-11-21T10:00:00Z'), '2026-11-21');
  assert.equal(Core.toDay(''), '');
  assert.equal(Core.toDay('pas une date'), '');
});

test('normSide', () => {
  assert.equal(Core.normSide('Buy'), 'LONG');
  assert.equal(Core.normSide('ACHAT'), 'LONG');
  assert.equal(Core.normSide('sell limit'), 'SHORT');
  assert.equal(Core.normSide('Short'), 'SHORT');
  assert.equal(Core.normSide('bear'), '');
  assert.equal(Core.normSide(''), '');
});

test('parseCSV : point-virgule, guillemets, BOM, lignes vides', () => {
  const rows = Core.parseCSV('﻿Symbol;Note\r\n"AAPL";"dit ""ok"";"\r\n\r\nBTC;x;y\n');
  assert.deepEqual(rows, [['Symbol', 'Note'], ['AAPL', 'dit "ok";'], ['BTC', 'x', 'y']]);
});

test('parseCSV : virgule et tabulation', () => {
  assert.deepEqual(Core.parseCSV('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(Core.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('detectColumns : export MT5 et export français', () => {
  const mt5 = Core.detectColumns(['Open Time', 'Symbol', 'Type', 'Open Price', 'S/L', 'Close Price', 'Volume', 'Profit']);
  assert.deepEqual(mt5, { date: 0, symbol: 1, side: 2, entry: 3, exit: 5, sl: 4, qty: 6, pnl: 7 });
  const fr = Core.detectColumns(['Date', 'Actif', 'Sens', 'Prix d\'entrée', 'Prix de sortie', 'Quantité']);
  assert.equal(fr.symbol, 1);
  assert.equal(fr.entry, 3);
  assert.equal(fr.exit, 4);
  assert.equal(fr.qty, 5);
});

test('parseConversations : export ChatGPT (branche active) et Claude', () => {
  const convs = Core.parseConversations([
    {
      title: 'Plan BTC', create_time: 1763700000, current_node: 'c',
      mapping: {
        a: { message: null, parent: null },
        b: { parent: 'a', message: { author: { role: 'user' }, content: { parts: ['Mon plan ?'] } } },
        x: { parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['Branche abandonnée'] } } },
        c: { parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['Attends la cassure.', { image: 1 }] } } },
      },
    },
    { name: 'Risque', created_at: '2026-11-02T10:00:00Z', chat_messages: [{ sender: 'human', text: 'Combien ?' }, { sender: 'assistant', content: [{ type: 'text', text: '1 %' }] }] },
    { title: 'Vide', mapping: {} },
    { autre: true },
  ]);
  assert.equal(convs.length, 2);
  assert.deepEqual(convs[0].msgs, [['Toi', 'Mon plan ?'], ['ChatGPT', 'Attends la cassure.']]);
  assert.equal(convs[0].date, '2025-11-21');
  assert.deepEqual(convs[1].msgs, [['Toi', 'Combien ?'], ['Claude', '1 %']]);
  assert.equal(convs[1].source, 'Claude');
});

test('parseConversations : boucle dans un export corrompu', () => {
  const convs = Core.parseConversations([{ title: 'Boucle', current_node: 'a', mapping: { a: { parent: 'b', message: { author: { role: 'user' }, content: { parts: ['A'] } } }, b: { parent: 'a', message: { author: { role: 'assistant' }, content: { parts: ['B'] } } } } }]);
  assert.equal(convs[0].msgs.length, 2);
});
