/* Whale — Markdown editor with live preview (like Obsidian), built on CodeMirror 6.
   Bundled by esbuild into src/vendor/editor.bundle.js (npm run build:editor).
   Syntax (#, **, [[ ]]…) is hidden and rendered everywhere except on the line holding the cursor. */
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, drawSelection, placeholder, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const refresh = StateEffect.define();
const MONO = 'ui-monospace,"Cascadia Code",Consolas,monospace';

/* ---------- Widgets (elements rendered in place of the syntax) ---------- */
class WikiLink extends WidgetType {
  constructor(label, target, exists, open) { super(); this.label = label; this.target = target; this.exists = exists; this.open = open; }
  eq(o) { return o.label === this.label && o.target === this.target && o.exists === this.exists; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-wikilink' + (this.exists ? '' : ' cm-unresolved');
    s.textContent = this.label;
    s.title = this.exists ? this.target : `${this.target} (note not created yet)`;
    s.onmousedown = (e) => { if (e.button === 0) { e.preventDefault(); this.open(this.target); } };
    return s;
  }
  ignoreEvent() { return false; }
}
class ImageEmbed extends WidgetType {
  constructor(src, resolve) { super(); this.src = src; this.resolve = resolve; }
  eq(o) { return o.src === this.src; }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-embed';
    const img = document.createElement('img');
    img.alt = this.src;
    wrap.appendChild(img);
    Promise.resolve(this.resolve(this.src)).then((url) => { if (url) img.src = url; else wrap.textContent = 'Image not found: ' + this.src; })
      .catch(() => { wrap.textContent = 'Image not found: ' + this.src; });
    return wrap;
  }
}
class Checkbox extends WidgetType {
  constructor(checked, pos) { super(); this.checked = checked; this.pos = pos; }
  eq(o) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view) {
    const box = document.createElement('input');
    box.type = 'checkbox'; box.className = 'cm-task'; box.checked = this.checked;
    box.onmousedown = (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    };
    return box;
  }
  ignoreEvent() { return false; }
}
class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bullet'; s.textContent = '•'; return s; }
}
class Rule extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-hr'; return s; }
}
const hide = Decoration.replace({});
const line = (cls) => Decoration.line({ class: cls });
const mark = (cls) => Decoration.mark({ class: cls });

/* ---------- Live preview ---------- */
function frontmatterEnd(doc) {
  if (doc.lines < 2 || doc.line(1).text !== '---') return 0;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) if (doc.line(i).text === '---') return i;
  return 0;
}
function build(view, opts) {
  const { state } = view, doc = state.doc;
  const active = new Set();
  for (const r of state.selection.ranges) {
    const a = doc.lineAt(r.from).number, b = doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) active.add(i);
  }
  const fmEnd = frontmatterEnd(doc);
  const out = [];
  const add = (from, to, deco) => out.push(deco.range(from, to));
  const isActive = (pos) => active.has(doc.lineAt(pos).number);

  // Properties (frontmatter): a discreet monospace block
  for (let i = 1; i <= fmEnd; i++) {
    const l = doc.line(i);
    add(l.from, l.from, line('cm-fm' + (i === 1 ? ' cm-fm-first' : '') + (i === fmEnd ? ' cm-fm-last' : '')));
    const k = /^([^:\s][^:]*):/.exec(l.text);
    if (k && i > 1 && i < fmEnd) add(l.from, l.from + k[0].length, mark('cm-fm-key'));
  }
  const fmLimit = fmEnd ? doc.line(fmEnd).to : -1;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (n) => {
        if (n.from <= fmLimit) return n.to > fmLimit ? undefined : false;
        const name = n.name;
        const h = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (h) { add(doc.lineAt(n.from).from, doc.lineAt(n.from).from, line('cm-h' + h[1])); return; }
        if (name === 'Blockquote') {
          for (let p = n.from; p <= n.to;) { const l = doc.lineAt(p); add(l.from, l.from, line('cm-quote')); p = l.to + 1; }
          return;
        }
        if (name === 'FencedCode') {
          for (let p = n.from; p <= n.to;) { const l = doc.lineAt(p); add(l.from, l.from, line('cm-codeblock')); p = l.to + 1; }
          return false;
        }
        if (name === 'InlineCode') add(n.from, n.to, mark('cm-icode'));
        if (isActive(n.from)) return;
        if (name === 'HeaderMark') {
          const end = doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to;
          add(n.from, end, hide);
        } else if (name === 'EmphasisMark' || name === 'StrikethroughMark' || name === 'QuoteMark') {
          const end = name === 'QuoteMark' && doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to;
          add(n.from, end, hide);
        } else if (name === 'CodeMark' && n.node.parent && n.node.parent.name === 'InlineCode') {
          add(n.from, n.to, hide);
        } else if (name === 'ListMark') {
          const txt = doc.sliceString(n.from, n.to);
          const next = doc.sliceString(n.to, n.to + 4);
          if (/^[-*+]$/.test(txt) && !/^ \[[ xX]\]/.test(next)) add(n.from, n.to, Decoration.replace({ widget: new Bullet() }));
          else if (/^[-*+]$/.test(txt)) add(n.from, n.to + 1, hide); // task: the checkbox replaces the dash
        } else if (name === 'TaskMarker') {
          const checked = /x/i.test(doc.sliceString(n.from, n.to));
          add(n.from, n.to, Decoration.replace({ widget: new Checkbox(checked, n.from) }));
          if (checked) { const l = doc.lineAt(n.from); if (n.to + 1 < l.to) add(n.to + 1, l.to, mark('cm-done')); }
        } else if (name === 'HorizontalRule') {
          add(n.from, n.to, Decoration.replace({ widget: new Rule() }));
        }
      },
    });

    // [[links]], ![[images]] and #tags (not handled by the Markdown parser)
    const text = doc.sliceString(from, to);
    const reLink = /(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
    let m;
    while ((m = reLink.exec(text))) {
      const a = from + m.index, b = a + m[0].length;
      if (a <= fmLimit) continue;
      const target = m[2].trim();
      if (m[1] && IMG.test(target)) {
        if (!isActive(a)) add(a, b, Decoration.replace({ widget: new ImageEmbed(target, opts.resolveImage) }));
        else add(a, b, mark('cm-wikilink-src'));
        continue;
      }
      if (isActive(a)) { add(a, b, mark('cm-wikilink-src')); continue; }
      add(a, b, Decoration.replace({ widget: new WikiLink((m[3] || m[2]).trim(), target, !!opts.resolveNote(target), opts.onOpenLink) }));
    }
    const reTag = /(^|[\s(])#([\p{L}\d_][\p{L}\d_\-/]*)/gu;
    while ((m = reTag.exec(text))) {
      const a = from + m.index + m[1].length, b = a + 1 + m[2].length;
      if (a > fmLimit) add(a, b, mark('cm-tag'));
    }
  }
  return Decoration.set(out, true);
}
function livePreview(opts) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view, opts); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(refresh))))
        this.decorations = build(u.view, opts);
    }
  }, { decorations: (v) => v.decorations });
}

/* ---------- Autocompletion: [[note]] and #tag ---------- */
function completions(opts) {
  const wiki = (ctx) => {
    const m = ctx.matchBefore(/!?\[\[[^\]\n]*$/);
    if (!m) return null;
    const start = m.from + m.text.indexOf('[[') + 2;
    return {
      from: start,
      validFor: /^[^\]\n]*$/,
      options: opts.getNoteNames().map((n) => ({
        label: n,
        detail: opts.describeNote ? opts.describeNote(n) : undefined,
        apply: (view, c, from, to) => {
          const closed = view.state.sliceDoc(to, to + 2) === ']]';
          view.dispatch({ changes: { from, to, insert: n + (closed ? '' : ']]') }, selection: { anchor: from + n.length + 2 } });
        },
      })),
    };
  };
  const tag = (ctx) => {
    const m = ctx.matchBefore(/(?:^|[\s(])#[\p{L}\d_\-/]*$/u);
    if (!m) return null;
    const start = m.from + m.text.indexOf('#') + 1;
    if (ctx.state.doc.lineAt(ctx.pos).text.startsWith('#') && start === ctx.state.doc.lineAt(ctx.pos).from + 1) return null; // heading
    return { from: start, validFor: /^[\p{L}\d_\-/]*$/u, options: opts.getTags().map((x) => ({ label: x, type: 'keyword' })) };
  };
  return autocompletion({ override: [wiki, tag], icons: false, maxRenderedOptions: 40 });
}

/* ---------- Formatting shortcuts ---------- */
function wrap(markStr) {
  return (view) => {
    view.dispatch(view.state.changeByRange((r) => {
      const before = view.state.sliceDoc(r.from - markStr.length, r.from), after = view.state.sliceDoc(r.to, r.to + markStr.length);
      if (before === markStr && after === markStr) {
        return { changes: [{ from: r.from - markStr.length, to: r.from }, { from: r.to, to: r.to + markStr.length }], range: EditorSelection.range(r.from - markStr.length, r.to - markStr.length) };
      }
      return { changes: [{ from: r.from, insert: markStr }, { from: r.to, insert: markStr }], range: EditorSelection.range(r.from + markStr.length, r.to + markStr.length) };
    }));
    return true;
  };
}
function toggleTask(view) {
  const l = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /^(\s*)([-*+] )?(\[[ xX]\] )?/.exec(l.text);
  let change;
  if (m[3]) change = { from: l.from + m[1].length + (m[2] || '').length, to: l.from + m[0].length, insert: '' };
  else if (m[2]) change = { from: l.from + m[0].length, insert: '[ ] ' };
  else change = { from: l.from + m[1].length, insert: '- [ ] ' };
  view.dispatch({ changes: change });
  return true;
}

/* ---------- Dark theme ---------- */
const theme = EditorView.theme({
  '&': { color: '#dcddde', backgroundColor: 'transparent', fontSize: '16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'system-ui,-apple-system,"Segoe UI",Inter,sans-serif', lineHeight: '1.75', overflow: 'visible' },
  '.cm-content': { caretColor: '#a68bff', padding: '0 0 45vh' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#a68bff', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: '#3b2f6b !important' },
  '.cm-h1': { fontSize: '1.8em', fontWeight: '700', lineHeight: '1.35', paddingTop: '.5em !important' },
  '.cm-h2': { fontSize: '1.4em', fontWeight: '650', lineHeight: '1.4', paddingTop: '.45em !important' },
  '.cm-h3': { fontSize: '1.18em', fontWeight: '650', paddingTop: '.35em !important' },
  '.cm-h4, .cm-h5, .cm-h6': { fontWeight: '650' },
  '.cm-fm': { fontFamily: MONO, fontSize: '12.5px', color: '#8a8a8a', backgroundColor: '#0b0b0b', padding: '0 12px !important', borderLeft: '1px solid #222', borderRight: '1px solid #222' },
  '.cm-fm *': { fontWeight: '400 !important', color: '#cfcfcf !important', fontSize: '12.5px !important' },
  '.cm-fm .cm-fm-key, .cm-fm .cm-fm-key *': { color: '#6f6f6f !important' },
  '.cm-fm-first': { borderTop: '1px solid #222', borderRadius: '8px 8px 0 0', paddingTop: '4px !important' },
  '.cm-fm-last': { borderBottom: '1px solid #222', borderRadius: '0 0 8px 8px', paddingBottom: '4px !important', marginBottom: '10px' },
  '.cm-quote': { borderLeft: '3px solid #8b6cef', paddingLeft: '14px !important', color: '#a9a9a9' },
  '.cm-codeblock': { fontFamily: MONO, fontSize: '13.5px', backgroundColor: '#111', padding: '0 12px !important' },
  '.cm-icode': { fontFamily: MONO, fontSize: '0.88em', backgroundColor: '#1b1b1b', borderRadius: '4px', padding: '1px 4px' },
  '.cm-wikilink': { color: '#a68bff', cursor: 'pointer', borderBottom: '1px solid transparent' },
  '.cm-wikilink:hover': { borderBottomColor: '#a68bff' },
  '.cm-unresolved': { color: '#7a7a7a', borderBottom: '1px dashed #555' },
  '.cm-wikilink-src': { color: '#a68bff' },
  '.cm-tag': { color: '#c4b5ff', backgroundColor: '#1d1a2b', borderRadius: '10px', padding: '1px 7px', fontSize: '0.9em' },
  '.cm-bullet': { color: '#8b6cef', fontWeight: '700', padding: '0 4px 0 2px' },
  '.cm-task': { accentColor: '#8b6cef', width: '15px', height: '15px', margin: '0 6px 0 0', verticalAlign: '-2px', cursor: 'pointer' },
  '.cm-done': { color: '#6f6f6f', textDecoration: 'line-through' },
  '.cm-hr': { display: 'inline-block', width: '100%', borderTop: '1px solid #2a2a2a', verticalAlign: 'middle' },
  '.cm-embed': { display: 'block', margin: '8px 0', color: '#777', fontSize: '13px' },
  '.cm-embed img': { maxWidth: '100%', borderRadius: '8px', border: '1px solid #2a2a2a', display: 'block' },
  '.cm-placeholder': { color: '#555' },
  '.cm-searchMatch': { backgroundColor: '#5a4b1a' },
  '.cm-selectionMatch': { backgroundColor: '#2a2440' },
  '.cm-panels': { backgroundColor: '#0b0b0b', color: '#ddd', borderTop: '1px solid #222' },
  '.cm-panels input, .cm-panels button': { background: '#151515', color: '#ddd', border: '1px solid #333', borderRadius: '4px' },
  '.cm-tooltip': { backgroundColor: '#0f0f0f', border: '1px solid #2c2c2c', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'system-ui,sans-serif', maxHeight: '16em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important', color: '#cfcfcf' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#2d2550', color: '#fff' },
  '.cm-completionDetail': { color: '#777', fontStyle: 'normal', marginLeft: '10px', fontSize: '12px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: '#c4b5ff' },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: t.heading, color: '#ffffff', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700', color: '#ffffff' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#8a8a8a' },
  { tag: t.link, color: '#a68bff' },
  { tag: t.url, color: '#7a7a7a' },
  { tag: t.monospace, fontFamily: MONO },
  { tag: t.processingInstruction, color: '#5f5f5f' },
  { tag: t.quote, color: '#a9a9a9' },
  { tag: t.contentSeparator, color: '#5f5f5f' },
  { tag: t.list, color: '#dcddde' },
]);

/* ---------- Public API ---------- */
function create(parent, opts) {
  const extensions = [
    history(),
    drawSelection(),
    dropCursor(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(highlight),
    closeBrackets(),
    completions(opts),
    search({ top: true }),
    highlightSelectionMatches(),
    placeholder(opts.placeholder || 'Start writing…'),
    livePreview(opts),
    theme,
    keymap.of([
      { key: 'Mod-b', run: wrap('**') },
      { key: 'Mod-i', run: wrap('*') },
      { key: 'Mod-Shift-x', run: wrap('~~') },
      { key: 'Mod-l', run: toggleTask },
      ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => { if (u.docChanged && opts.onChange) opts.onChange(u.state.doc.toString()); }),
    EditorView.domEventHandlers({
      paste(e, view) {
        const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith('image/'));
        if (!item || !opts.onPasteImage) return false;
        e.preventDefault();
        Promise.resolve(opts.onPasteImage(item.getAsFile())).then((md) => { if (md) view.dispatch(view.state.replaceSelection(md)); });
        return true;
      },
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions }) });
  return {
    view,
    setDoc(text, cursorEnd) {
      view.setState(EditorState.create({ doc: text, extensions, selection: cursorEnd ? { anchor: text.length } : undefined }));
    },
    getDoc: () => view.state.doc.toString(),
    focus: () => view.focus(),
    insert(text) { view.dispatch(view.state.replaceSelection(text)); view.focus(); },
    refresh: () => view.dispatch({ effects: refresh.of(null) }),
    destroy: () => view.destroy(),
  };
}

window.WhaleEditor = { create };
