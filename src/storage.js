// Storage layer.
// In the desktop app (Tauri): real .md files in the vault folder.
// In a plain browser (to work on the interface): localStorage.
(function () {
  const T = window.__TAURI__;
  if (T && T.core) {
    const invoke = T.core.invoke;
    window.Store = {
      desktop: true,
      getVault: () => invoke('get_vault'),
      setVault: (path) => invoke('set_vault', { path }),
      list: () => invoke('list_notes'),
      write: (path, content) => invoke('write_note', { path, content }),
      rename: (from, to) => invoke('rename_note', { from, to }),
      trash: (path) => invoke('trash_note', { path }),
      saveAttachment: (name, bytes) => invoke('save_attachment', { name, data: Array.from(bytes) }),
      readBytes: (path) => invoke('read_bytes', { path }),
      pickFolder: (title) => invoke('plugin:dialog|open', { options: { directory: true, multiple: false, title: title || 'Choose the vault folder' } }),
      pickFile: (title, extensions) => invoke('plugin:dialog|open', { options: { directory: false, multiple: false, title, filters: [{ name: 'Fichiers', extensions }] } }),
      readExternal: (path) => invoke('read_external_text', { path }),
      importFolder: (src, dest) => invoke('import_folder', { src, dest }),
      getSettings: () => invoke('get_settings'),
      saveSettings: (s) => invoke('save_settings', { provider: s.provider, claudeKey: s.claude_key || '', claudeModel: s.claude_model || '', ollamaUrl: s.ollama_url || '', ollamaModel: s.ollama_model || '' }),
      forgetKey: () => invoke('forget_key'),
      ai: (body) => invoke('ai_request', { body }),
    };
    return;
  }

  const KEY = 'whale-files-v1';
  let files = {};
  let fresh = false;
  try { const s = localStorage.getItem(KEY); if (s) files = JSON.parse(s); else fresh = true; } catch (e) { fresh = true; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(files)); } catch (e) {} };
  const blobs = {};
  window.Store = {
    desktop: false,
    getVault: async () => ({ path: 'browser (localStorage)', name: 'My journal', created: fresh }),
    setVault: async () => { throw new Error('Only available in the desktop app'); },
    list: async () => Object.keys(files).map((path) => ({ path, content: files[path], mtime: 0 })),
    write: async (path, content) => { files[path] = content; persist(); },
    rename: async (from, to) => { if (files[to] != null) throw new Error('A note with this name already exists'); files[to] = files[from]; delete files[from]; persist(); },
    trash: async (path) => { delete files[path]; persist(); },
    saveAttachment: async (name, bytes) => { const rel = 'attachments/' + name; blobs[rel] = bytes; return rel; },
    readBytes: async (path) => { if (!blobs[path]) throw new Error('not found'); return blobs[path].buffer; },
    pickFolder: async () => { alert('Choosing a folder works in the desktop app.'); return null; },
    pickFile: async () => { alert('Importing files works in the desktop app.'); return null; },
    readExternal: async () => { throw new Error('Only available in the desktop app'); },
    importFolder: async () => { throw new Error('Only available in the desktop app'); },
    getSettings: async () => ({ provider: 'claude', has_key: false, key_hint: '', key_store: '', claude_model: 'claude-opus-5-5', ollama_url: 'http://localhost:11434', ollama_model: 'llama3.1' }),
    saveSettings: async () => { throw new Error('Settings work in the desktop app'); },
    forgetKey: async () => { throw new Error('Only available in the desktop app'); },
    ai: async () => { throw new Error('The AI works in the desktop app (not in the browser).'); },
  };
})();
