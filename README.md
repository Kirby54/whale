<p align="center">
  <img src="assets/concepts/a-ocean-gem-app.svg" width="120" alt="Whale logo">
</p>

<h1 align="center">Whale</h1>

<p align="center">
  A <b>local-first</b>, <b>open-source</b> trading journal that is also a second brain.<br>
  Your Markdown notes, trades and AI conversations, linked together and shown as a whale.
</p>

---

## Why Whale

- **Your data stays with you.** Every note is a real `.md` file in a folder on your computer (the "vault"). No account, no forced cloud, and you can open your notes in any editor.
- **Built for trading.** Trade properties (asset, setup, side, entry, stop, exit, result in R), dashboard, equity curve, broker trade import.
- **A second brain.** `[[Links]]`, backlinks, tags, import of your notes and of your ChatGPT or Claude conversations, and an AI that answers from your journal.

## Features

| | |
|---|---|
| **Brain** | Every note is a point in a 3D whale, colored by folder. Clickable legend and a time histogram with a draggable window. |
| **Your AI** | Panel next to the brain. Ask a question: the AI answers with your notes as sources and lights up the matching folder, period and notes in the brain. |
| **Editor** | Live preview like Obsidian (CodeMirror 6). Autocomplete for `[[links]]` and `#tags`, checkboxes, chart screenshots pasted with Ctrl+V. |
| **AI classification** | One click fills in a note's type, tags, date, summary and trade properties, and adds links to your other notes. |
| **Import** | Obsidian or Notion folders (Markdown), ChatGPT and Claude conversations (`conversations.json`), trades as CSV (MT4/MT5, TradingView, Binance, IBKR…) with R computed for you. |
| **Views** | Dashboard (win rate, average R, profit factor), timeline, sortable trades table, Ctrl+K search. |

## AI, your choice

- **Claude**, with your own Anthropic API key (default model: `claude-opus-5-5`). The key is stored in the system vault (Windows Credential Manager), never in your notes.
- **Ollama**, 100% local and free: nothing leaves your computer.

To answer, Whale sends the chosen provider your statistics and the notes relevant to the question. With Ollama, everything stays on your machine.

## Trade note format

```markdown
---
type: trade
date: 2026-11-03
asset: TSLA
setup: Breakout
side: LONG
entry: 242.5
stop: 238
exit: 251
result: 1.9
---
## Context
Clean break on [[TSLA]], [[Breakout]] setup.
```

`type` can be `trade`, `setup`, `asset`, `emotion`, `conversation` or `note`. `result` is in R (multiple of the risk).

## Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+K | Search a note or ask the AI |
| Ctrl+N | New trade |
| Ctrl+E | Switch between the editor and the reading view |
| Ctrl+G | Brain |
| Ctrl+B / Ctrl+I | Bold / italic |
| Ctrl+L | Checkbox |
| Ctrl+F | Find in the note |

## Build from source

Requirements: [Node.js](https://nodejs.org), [Rust](https://rustup.rs) and, on Windows, the Visual Studio C++ build tools.

```bash
git clone https://github.com/Kirby54/whale.git
cd whale
npm install
npm run dev      # run the app in development mode
npm run build    # build the Windows installer
npm test         # run the tests
```

## Code layout

| Folder | Contents |
|---|---|
| `src/` | The interface, no framework: `app.js` (core), `core.js` (pure, tested logic), `graph.js` (3D brain), `ai.js` and `aipanel.js` (AI), `import.js`, `views.js`, `ui.js` |
| `editor/` | Editor source (CodeMirror 6), bundled by esbuild into `src/vendor/editor.bundle.js` |
| `src-tauri/` | The Rust side: vault files, settings, import and AI calls |
| `tests/` | Logic tests (`npm test`); Rust tests with `cargo test` in `src-tauri/` |
| `assets/` | Logo options and generated icons |

Opening `src/index.html` in a browser also works: notes are then kept in the browser, which is handy for working on the interface.

## Contributing

Issues and pull requests are welcome. Run `npm test` before submitting a change.

## License

[MIT](LICENSE)
