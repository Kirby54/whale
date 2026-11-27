// Tests for Whale's pure logic. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');

test('parseRaw: properties, body and links', () => {
  const p = Core.parseRaw('---\ntype: trade\nasset: TSLA\nresult: 1.5\n---\nBreakout on [[TSLA]] and [[Breakout|my setup]].');
  assert.equal(p.type, 'trade');
  assert.equal(p.props.asset, 'TSLA');
  assert.equal(p.props.result, '1.5');
  assert.deepEqual(p.targets, ['TSLA', 'Breakout']);
  assert.ok(p.body.startsWith('Breakout on'));
});

test('parseRaw: legacy French keys and types are read as English', () => {
  const p = Core.parseRaw('---\ntype: actif\nactif: TSLA\nsens: LONG\nentree: 10\nsortie: 12\nresultat: 2\nresume: ok\n---\n');
  assert.equal(p.type, 'asset');
  assert.deepEqual(p.props, { type: 'asset', asset: 'TSLA', side: 'LONG', entry: '10', exit: '12', result: '2', summary: 'ok' });
});

test('parseRaw: no frontmatter, default type "note"', () => {
  const p = Core.parseRaw('# Title\n\nText');
  assert.equal(p.type, 'note');
  assert.deepEqual(p.props, {});
  assert.equal(p.body, '# Title\n\nText');
});

test('parseRaw: ignores embedded images and links inside code', () => {
  const p = Core.parseRaw('![[chart.png]] `[[NotALink]]` ![[Other note]] [[FOMO]] [[FOMO]]');
  assert.deepEqual(p.targets, ['Other note', 'FOMO']);
});

test('parseRaw: Windows line endings (CRLF)', () => {
  const p = Core.parseRaw('---\r\ntype: setup\r\n---\r\nText');
  assert.equal(p.type, 'setup');
  assert.equal(p.body, 'Text');
});

test('rOf: comma or dot, empty values', () => {
  assert.equal(Core.rOf({ result: '1,5' }), 1.5);
  assert.equal(Core.rOf({ result: '-1' }), -1);
  assert.equal(Core.rOf({ result: '' }), null);
  assert.equal(Core.rOf({}), null);
  assert.equal(Core.rOf(null), null);
});

test('setPropsText: updates, adds and removes while keeping the order', () => {
  const raw = '---\ntype: trade\nasset: \nside: LONG\n---\nBody';
  const out = Core.setPropsText(raw, { asset: 'BTC', side: null, tags: 'fomo, btc', empty: '' });
  assert.equal(out, '---\ntype: trade\nasset: BTC\ntags: fomo, btc\n---\nBody');
});

test('setPropsText: rewrites a legacy French key in English', () => {
  const out = Core.setPropsText('---\ntype: trade\nresultat: \nactif: TSLA\n---\n', { result: '2' });
  assert.equal(out, '---\ntype: trade\nresult: 2\nactif: TSLA\n---\n');
});

test('setPropsText: creates the frontmatter when missing', () => {
  assert.equal(Core.setPropsText('# Note\n', { type: 'note' }), '---\ntype: note\n---\n# Note\n');
});

test('renameInContent: links, aliases, case and properties', () => {
  const c = '---\nsetup: Breakout\nasset: TSLA\n---\nSee [[Breakout]], [[breakout|alias]] and [[Breakout pro]].';
  const out = Core.renameInContent(c, 'Breakout', 'Range break');
  assert.ok(out.includes('setup: Range break'));
  assert.ok(out.includes('[[Range break]]'));
  assert.ok(out.includes('[[Range break|alias]]'));
  assert.ok(out.includes('[[Breakout pro]]'), 'must not touch another note that starts the same way');
  assert.ok(out.includes('asset: TSLA'));
});

test('renameInContent: does not eat the next line (asset and legacy actif)', () => {
  assert.equal(Core.renameInContent('---\nasset: TSLA\n\nside: LONG\n---\n', 'TSLA', 'Tesla'), '---\nasset: Tesla\n\nside: LONG\n---\n');
  assert.equal(Core.renameInContent('---\nactif: TSLA\n---\n', 'TSLA', 'Tesla'), '---\nactif: Tesla\n---\n');
});

test('makeResolver: exact first, then case-insensitive', () => {
  const r = Core.makeResolver(['TSLA', 'Stop too tight']);
  assert.equal(r('TSLA'), 'TSLA');
  assert.equal(r('tsla'), 'TSLA');
  assert.equal(r('  stop TOO tight '), 'Stop too tight');
  assert.equal(r('Unknown'), null);
});

test('safeName: characters forbidden on Windows', () => {
  assert.equal(Core.safeName('Trade: TSLA/long?'), 'Trade- TSLA-long-');
  assert.equal(Core.safeName('...hidden'), 'hidden');
  assert.equal(Core.safeName('   '), 'Untitled');
});

test('stem and dirOf', () => {
  assert.equal(Core.stem('Trades/Import/2026-11-21 AAPL long.md'), '2026-11-21 AAPL long');
  assert.equal(Core.dirOf('Trades/Import/x.md'), 'Trades/Import');
  assert.equal(Core.dirOf('x.md'), '');
});

test('computeStats: win rate, total, profit factor, groups', () => {
  const s = Core.computeStats([
    { r: 2, setup: 'Breakout', asset: 'BTC' },
    { r: -1, setup: 'Breakout', asset: 'TSLA' },
    { r: 1.5, setup: 'Pullback', asset: 'BTC' },
    { r: null, setup: 'Pullback' },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.winrate, 67);
  assert.equal(s.total, 2.5);
  assert.equal(s.avg, 0.83);
  assert.equal(s.profitFactor, 3.5);
  assert.deepEqual(s.equity, [0, 2, 1, 2.5]);
  assert.deepEqual(s.bySetup.Breakout, { count: 2, winrate: 50, total: 1 });
  assert.deepEqual(s.byAsset.BTC, { count: 2, winrate: 100, total: 3.5 });
});

test('computeStats: no trades, no losses', () => {
  assert.equal(Core.computeStats([]).avg, null);
  assert.equal(Core.computeStats([{ r: 1 }]).profitFactor, null);
});

test('computeR: long and short', () => {
  assert.equal(Core.computeR(100, 104, 98), 2);          // winning long
  assert.equal(Core.computeR(100, 98, 98), -1);          // long stopped out
  assert.equal(Core.computeR(1.085, 1.081, 1.087), 2);   // winning short
  assert.equal(Core.computeR(262, 265, 265), -1);        // short stopped out
  assert.equal(Core.computeR(100, 104, 100), null);      // stop = entry
  assert.equal(Core.computeR(100, null, 98), null);
});

test('parseNumber: European and US formats', () => {
  assert.equal(Core.parseNumber('1,0850'), 1.085);
  assert.equal(Core.parseNumber('1,234.56'), 1234.56);
  assert.equal(Core.parseNumber('$-40'), -40);
  assert.equal(Core.parseNumber('1 234,5'), 1234.5);
  assert.equal(Core.parseNumber(''), null);
  assert.equal(Core.parseNumber('abc'), null);
});

test('toDay: broker date formats', () => {
  assert.equal(Core.toDay('2026.11.21 09:30'), '2026-11-21');
  assert.equal(Core.toDay('21/11/2026'), '2026-11-21');
  assert.equal(Core.toDay('2026-1-5'), '2026-01-05');
  assert.equal(Core.toDay('2026-11-21T10:00:00Z'), '2026-11-21');
  assert.equal(Core.toDay(''), '');
  assert.equal(Core.toDay('not a date'), '');
});

test('normSide', () => {
  assert.equal(Core.normSide('Buy'), 'LONG');
  assert.equal(Core.normSide('ACHAT'), 'LONG');
  assert.equal(Core.normSide('sell limit'), 'SHORT');
  assert.equal(Core.normSide('Short'), 'SHORT');
  assert.equal(Core.normSide('bear'), '');
  assert.equal(Core.normSide(''), '');
});

test('parseCSV: semicolons, quotes, BOM, empty lines', () => {
  const rows = Core.parseCSV('\uFEFFSymbol;Note\r\n"AAPL";"said ""ok"";"\r\n\r\nBTC;x;y\n');
  assert.deepEqual(rows, [['Symbol', 'Note'], ['AAPL', 'said "ok";'], ['BTC', 'x', 'y']]);
});

test('parseCSV: commas and tabs', () => {
  assert.deepEqual(Core.parseCSV('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(Core.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('detectColumns: MT5 export and French export', () => {
  const mt5 = Core.detectColumns(['Open Time', 'Symbol', 'Type', 'Open Price', 'S/L', 'Close Price', 'Volume', 'Profit']);
  assert.deepEqual(mt5, { date: 0, symbol: 1, side: 2, entry: 3, exit: 5, sl: 4, qty: 6, pnl: 7 });
  const fr = Core.detectColumns(['Date', 'Actif', 'Sens', 'Prix d\'entrée', 'Prix de sortie', 'Quantité']);
  assert.equal(fr.symbol, 1);
  assert.equal(fr.entry, 3);
  assert.equal(fr.exit, 4);
  assert.equal(fr.qty, 5);
});

test('parseConversations: ChatGPT export (active branch) and Claude', () => {
  const convs = Core.parseConversations([
    {
      title: 'BTC plan', create_time: 1763700000, current_node: 'c',
      mapping: {
        a: { message: null, parent: null },
        b: { parent: 'a', message: { author: { role: 'user' }, content: { parts: ['My plan?'] } } },
        x: { parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['Abandoned branch'] } } },
        c: { parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['Wait for the break.', { image: 1 }] } } },
      },
    },
    { name: 'Risk', created_at: '2026-11-02T10:00:00Z', chat_messages: [{ sender: 'human', text: 'How much?' }, { sender: 'assistant', content: [{ type: 'text', text: '1%' }] }] },
    { title: 'Empty', mapping: {} },
    { other: true },
  ]);
  assert.equal(convs.length, 2);
  assert.deepEqual(convs[0].msgs, [['You', 'My plan?'], ['ChatGPT', 'Wait for the break.']]);
  assert.equal(convs[0].date, '2025-11-21');
  assert.deepEqual(convs[1].msgs, [['You', 'How much?'], ['Claude', '1%']]);
  assert.equal(convs[1].source, 'Claude');
});

test('parseConversations: loop in a corrupted export', () => {
  const convs = Core.parseConversations([{ title: 'Loop', current_node: 'a', mapping: { a: { parent: 'b', message: { author: { role: 'user' }, content: { parts: ['A'] } } }, b: { parent: 'a', message: { author: { role: 'assistant' }, content: { parts: ['B'] } } } } }]);
  assert.equal(convs[0].msgs.length, 2);
});

test('tokenize: lowercase, accents and common words removed', () => {
  assert.deepEqual(Core.tokenize('The BTC Breakout était très propre, 2026'), ['btc', 'breakout', 'etait', 'propre']);
});

test('similarityEdges: notes about the same thing are linked', () => {
  const docs = ['bitcoin breakout weekly volume crypto', 'bitcoin pullback support crypto weekend', 'tesla earnings breakout stock', 'tesla pullback rejection stock', 'fomo late entry emotion', 'fomo news entry emotion'].map((text) => ({ text }));
  const pairs = Core.similarityEdges(docs, 2).map((e) => `${e.a}-${e.b}`);
  assert.ok(pairs.includes('0-1'), 'bitcoin notes');
  assert.ok(pairs.includes('2-3'), 'tesla notes');
  assert.ok(pairs.includes('4-5'), 'fomo notes');
  assert.ok(!pairs.includes('0-5'), 'bitcoin and fomo are not linked');
});

test('layout3d: linked items end up closer, deterministic, within [-1, 1]', () => {
  const edges = [{ a: 0, b: 1, w: 1 }, { a: 2, b: 3, w: 1 }, { a: 4, b: 5, w: 1 }];
  const P = Core.layout3d(6, edges, { seed: 3 });
  const d = (i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
  assert.ok(d(0, 1) < d(0, 4) && d(2, 3) < d(2, 5));
  assert.deepEqual(Core.layout3d(6, edges, { seed: 3 }), P);
  assert.ok(P.every((p) => p.every((x) => x >= -1 && x <= 1)));
});

test('setupTemplate: recognizes the pattern from the name or text', () => {
  assert.equal(Core.setupTemplate('Breakout'), 'breakout');
  assert.equal(Core.setupTemplate('Cassure du range'), 'breakout');
  assert.equal(Core.setupTemplate('Pullback'), 'pullback');
  assert.equal(Core.setupTemplate('EMA bounce'), 'pullback');
  assert.equal(Core.setupTemplate('Double bottom'), 'reversal');
  assert.equal(Core.setupTemplate('Mean reversion'), 'range');
  assert.equal(Core.setupTemplate('My secret sauce'), 'generic');
});

test('setupSections: description and rules of a setup note', () => {
  const { description, rules } = Core.setupSections('# Breakout\n\nBreak of a resistance with volume.\n\n## Rules\n- Wait for the close\n- [x] Volume > 1.5x\n1. Stop below the swing low\n\nSee also [[Pullback]].');
  assert.equal(description, 'Break of a resistance with volume.');
  assert.deepEqual(rules, ['Wait for the close', 'Volume > 1.5x', 'Stop below the swing low']);
});

test('tradeGeometry: long, short, side inferred, incomplete', () => {
  assert.deepEqual(Core.tradeGeometry({ entry: '100', stop: '98', exit: '104', side: 'LONG' }), { entry: 100, stop: 98, exit: 104, side: 'LONG', risk: 2, r: 2 });
  assert.equal(Core.tradeGeometry({ entry: '1,0850', stop: '1,0870', exit: '1,0810', side: 'SHORT' }).r, 2);
  assert.equal(Core.tradeGeometry({ entry: 262, stop: 265, exit: 257.5 }).side, 'SHORT');
  assert.equal(Core.tradeGeometry({ entry: 100, stop: 98 }).r, null);
  assert.equal(Core.tradeGeometry({ entry: 100, stop: '' }), null);
});

test('rBuckets: histogram of results in R', () => {
  assert.deepEqual(Core.rBuckets([-1, -1, 0.5, 1.9, 3]), [
    { from: -1, to: 0, count: 2 }, { from: 0, to: 1, count: 1 }, { from: 1, to: 2, count: 1 }, { from: 2, to: 3, count: 0 }, { from: 3, to: 4, count: 1 },
  ]);
  assert.deepEqual(Core.rBuckets([]), []);
});

// The release build (tauri-action) reads these files with JSON.parse, which fails on a byte order mark
test('app manifests are plain JSON without a byte order mark', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const f of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
    const raw = fs.readFileSync(path.join(__dirname, '..', f));
    assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], f + ' starts with a byte order mark');
    assert.doesNotThrow(() => JSON.parse(raw.toString('utf8')), f);
  }
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src-tauri/tauri.conf.json'), 'utf8')).version, v, 'same version in package.json and tauri.conf.json');
});
