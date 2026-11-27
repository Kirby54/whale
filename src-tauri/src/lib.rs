//! Whale — file layer.
//! The vault is a normal folder full of .md files, like in Obsidian.
//! Every command takes paths RELATIVE to the vault and refuses to leave it.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

struct Vault(Mutex<PathBuf>);

#[derive(Serialize)]
struct NoteFile {
    path: String, // relative to the vault, with "/"
    content: String,
    mtime: u64, // last modified (Unix milliseconds), used to detect changes made elsewhere
}

/// AI settings, saved in the app's config folder (never in the vault).
#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Settings {
    provider: String, // "claude" ou "ollama"
    claude_key: String,
    claude_model: String,
    ollama_url: String,
    ollama_model: String,
}
impl Default for Settings {
    fn default() -> Self {
        Settings {
            provider: "claude".into(),
            claude_key: String::new(),
            claude_model: "claude-opus-5-5".into(),
            ollama_url: "http://localhost:11434".into(),
            ollama_model: "llama3.1".into(),
        }
    }
}
struct SettingsState(Mutex<(Settings, bool)>); // (settings, key kept in the file?)

/// What the interface sees of the settings: the key is never sent back in full.
#[derive(Serialize)]
struct PublicSettings {
    provider: String,
    has_key: bool,
    key_hint: String,
    key_store: String,
    claude_model: String,
    ollama_url: String,
    ollama_model: String,
}

#[derive(Serialize)]
struct VaultInfo {
    path: String,
    name: String,
    created: bool, // true if the folder was just created (empty)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Joins a vault-relative path, refusing "..", absolute paths, etc.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel.is_empty() {
        return Err("Empty path".into());
    }
    for c in rel_path.components() {
        match c {
            Component::Normal(_) => {}
            _ => return Err(format!("Path refused: {rel}")),
        }
    }
    Ok(root.join(rel_path))
}

fn config_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("vault.txt"))
}

fn vault_info(p: &Path, created: bool) -> VaultInfo {
    VaultInfo {
        path: p.to_string_lossy().into_owned(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Vault".into()),
        created,
    }
}

/// Opens the last vault used, or Documents/Whale on first launch.
#[tauri::command]
fn get_vault(app: tauri::AppHandle, state: State<Vault>) -> Result<VaultInfo, String> {
    let saved = config_file(&app)
        .and_then(|f| fs::read_to_string(f).ok())
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| p.is_dir());
    let (path, created) = match saved {
        Some(p) => (p, false),
        None => {
            let docs = app.path().document_dir().map_err(err)?;
            let p = docs.join("Whale");
            let created = !p.exists();
            fs::create_dir_all(&p).map_err(err)?;
            (p, created)
        }
    };
    *state.0.lock().unwrap() = path.clone();
    Ok(vault_info(&path, created))
}

/// Switches vault (folder picked by the user) and remembers it.
#[tauri::command]
fn set_vault(app: tauri::AppHandle, state: State<Vault>, path: String) -> Result<VaultInfo, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("This folder does not exist".into());
    }
    if let Some(f) = config_file(&app) {
        if let Some(dir) = f.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(f, &path);
    }
    *state.0.lock().unwrap() = p.clone();
    let empty = fs::read_dir(&p).map(|mut d| d.next().is_none()).unwrap_or(false);
    Ok(vault_info(&p, empty))
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<NoteFile>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue; // .trash, .obsidian, .git…
        }
        if p.is_dir() {
            walk(root, &p, out);
        } else if p.extension().map(|x| x.eq_ignore_ascii_case("md")).unwrap_or(false) {
            if let (Ok(content), Ok(rel)) = (fs::read_to_string(&p), p.strip_prefix(root)) {
                let mtime = mtime_ms(&p);
                out.push(NoteFile {
                    path: rel.to_string_lossy().replace('\\', "/"),
                    content,
                    mtime,
                });
            }
        }
    }
}

/// Lists every .md note in the vault (subfolders included).
#[tauri::command]
fn list_notes(state: State<Vault>) -> Vec<NoteFile> {
    let root = state.0.lock().unwrap().clone();
    let mut out = Vec::new();
    walk(&root, &root, &mut out);
    out
}

/// Last modification time in milliseconds (0 if the file does not exist).
fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Safe write: the content goes to a hidden temporary file next to the note, which then
/// replaces the note in one step. A crash in the middle can never leave a half-written note.
fn atomic_write(full: &Path, content: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = full.parent() {
        fs::create_dir_all(dir)?;
    }
    let name = full.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = full.with_file_name(format!(".{name}.whale-tmp"));
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content)?;
        f.sync_all()?; // make sure the bytes are on disk before replacing the note
    }
    fs::rename(&tmp, full).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// Writes a note and returns its new modification time.
/// `expected` is the modification time the interface last saw: if the file changed on disk
/// since then (edited in another app), nothing is written and the error "CONFLICT" is returned.
#[tauri::command]
fn write_note(state: State<Vault>, path: String, content: String, expected: Option<u64>) -> Result<u64, String> {
    let root = state.0.lock().unwrap().clone();
    let full = safe_join(&root, &path)?;
    if let Some(exp) = expected.filter(|&e| e > 0) {
        let now = mtime_ms(&full);
        if now != 0 && now != exp {
            return Err("CONFLICT".into());
        }
    }
    atomic_write(&full, content.as_bytes()).map_err(err)?;
    Ok(mtime_ms(&full))
}

/// Reads one note from disk (used to show the other version after a conflict).
#[tauri::command]
fn read_note(state: State<Vault>, path: String) -> Result<NoteFile, String> {
    let root = state.0.lock().unwrap().clone();
    let full = safe_join(&root, &path)?;
    let content = fs::read_to_string(&full).map_err(err)?;
    Ok(NoteFile { path, content, mtime: mtime_ms(&full) })
}

#[tauri::command]
fn rename_note(state: State<Vault>, from: String, to: String) -> Result<(), String> {
    let root = state.0.lock().unwrap().clone();
    let (a, b) = (safe_join(&root, &from)?, safe_join(&root, &to)?);
    if b.exists() {
        return Err("A note with this name already exists".into());
    }
    if let Some(dir) = b.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    fs::rename(a, b).map_err(err)
}

/// "Delete" = move to the vault's .trash folder (recoverable), like Obsidian.
#[tauri::command]
fn trash_note(state: State<Vault>, path: String) -> Result<(), String> {
    let root = state.0.lock().unwrap().clone();
    let src = safe_join(&root, &path)?;
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(err)?;
    let fname = src.file_name().ok_or("Invalid name")?.to_string_lossy().into_owned();
    let mut dest = trash.join(&fname);
    let mut i = 1;
    while dest.exists() {
        dest = trash.join(format!("{i} {fname}"));
        i += 1;
    }
    fs::rename(src, dest).map_err(err)
}

/// Saves a pasted image (chart screenshot) into attachments/.
#[tauri::command]
fn save_attachment(state: State<Vault>, name: String, data: Vec<u8>) -> Result<String, String> {
    let root = state.0.lock().unwrap().clone();
    let rel = format!("attachments/{name}");
    let full = safe_join(&root, &rel)?;
    fs::create_dir_all(root.join("attachments")).map_err(err)?;
    atomic_write(&full, &data).map_err(err)?;
    Ok(rel)
}

#[tauri::command]
fn read_bytes(state: State<Vault>, path: String) -> Result<tauri::ipc::Response, String> {
    let root = state.0.lock().unwrap().clone();
    let full = safe_join(&root, &path)?;
    fs::read(full).map(tauri::ipc::Response::new).map_err(err)
}

/* ---------- Import ---------- */

/// Reads a file picked by the user outside the vault (ChatGPT/Claude export, broker CSV).
#[tauri::command]
fn read_external_text(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !["json", "csv", "txt", "md", "tsv"].contains(&ext.as_str()) {
        return Err("Unsupported file type".into());
    }
    let bytes = fs::read(p).map_err(err)?;
    // Some brokers export in Windows-1252: try UTF-8, otherwise a simple byte conversion.
    Ok(match String::from_utf8(bytes) {
        Ok(s) => s.trim_start_matches('\u{feff}').to_string(),
        Err(e) => e.into_bytes().iter().map(|&b| b as char).collect(),
    })
}

const IMPORT_EXT: [&str; 7] = ["md", "png", "jpg", "jpeg", "gif", "webp", "svg"];

fn copy_tree(src: &Path, dest: &Path, count: &mut u32) -> std::io::Result<()> {
    for e in fs::read_dir(src)?.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            copy_tree(&p, &dest.join(&name), count)?;
        } else {
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if IMPORT_EXT.contains(&ext.as_str()) {
                fs::create_dir_all(dest)?;
                let target = dest.join(&name);
                if !target.exists() {
                    fs::copy(&p, &target)?;
                    if ext == "md" {
                        *count += 1;
                    }
                }
            }
        }
    }
    Ok(())
}

/// Copies a note folder (Obsidian export, Notion as Markdown…) into the vault.
/// Never overwrites an existing file. Returns the number of notes copied.
#[tauri::command]
fn import_folder(state: State<Vault>, src: String, dest: String) -> Result<u32, String> {
    let root = state.0.lock().unwrap().clone();
    let target = safe_join(&root, &dest)?;
    let src = PathBuf::from(src);
    if src.starts_with(&root) {
        return Err("This folder is already inside the vault".into());
    }
    let mut count = 0;
    copy_tree(&src, &target, &mut count).map_err(err)?;
    Ok(count)
}

/* ---------- Settings and AI ---------- */

fn settings_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

/* API key: stored in the system vault (Windows Credential Manager, macOS Keychain).
   If the system has none, falls back to settings.json. */
const KEY_SERVICE: &str = "app.whale.journal";
const KEY_USER: &str = "anthropic-api-key";

fn keyring_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER).ok()
}
fn keyring_get() -> Option<String> {
    keyring_entry()?.get_password().ok().filter(|k| !k.trim().is_empty())
}
fn keyring_set(key: &str) -> bool {
    match keyring_entry() {
        // read it back to check that the key was really saved
        Some(e) => e.set_password(key).is_ok() && keyring_get().as_deref() == Some(key),
        None => false,
    }
}
fn keyring_delete() {
    if let Some(e) = keyring_entry() {
        let _ = e.delete_credential();
    }
}

/// Writes settings.json; the key is only in it when the system vault is unavailable.
fn persist(app: &tauri::AppHandle, s: &Settings, key_in_file: bool) -> Result<(), String> {
    let Some(f) = settings_file(app) else { return Ok(()) };
    if let Some(dir) = f.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    let mut copy = s.clone();
    if !key_in_file {
        copy.claude_key.clear();
    }
    atomic_write(&f, serde_json::to_string_pretty(&copy).map_err(err)?.as_bytes()).map_err(err)
}

fn public(s: &Settings, key_in_file: bool) -> PublicSettings {
    let k = s.claude_key.trim();
    let tail: String = k.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    PublicSettings {
        provider: s.provider.clone(),
        has_key: !k.is_empty(),
        key_hint: if k.chars().count() > 8 { format!("…{tail}") } else { String::new() },
        key_store: if k.is_empty() {
            String::new()
        } else if key_in_file {
            "settings file (system vault unavailable)".into()
        } else {
            "system vault".into()
        },
        claude_model: s.claude_model.clone(),
        ollama_url: s.ollama_url.clone(),
        ollama_model: s.ollama_model.clone(),
    }
}

#[tauri::command]
fn get_settings(state: State<SettingsState>) -> PublicSettings {
    let st = state.0.lock().unwrap();
    public(&st.0, st.1)
}

/// Saves the settings. An empty key keeps the key already saved.
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    state: State<SettingsState>,
    provider: String,
    claude_key: String,
    claude_model: String,
    ollama_url: String,
    ollama_model: String,
) -> Result<PublicSettings, String> {
    let mut st = state.0.lock().unwrap();
    let (s, key_in_file) = &mut *st;
    s.provider = if provider == "ollama" { "ollama".into() } else { "claude".into() };
    let new_key = claude_key.trim();
    if !new_key.is_empty() {
        s.claude_key = new_key.to_string();
        *key_in_file = !keyring_set(new_key);
    }
    if !claude_model.trim().is_empty() {
        s.claude_model = claude_model.trim().to_string();
    }
    if !ollama_url.trim().is_empty() {
        s.ollama_url = ollama_url.trim().trim_end_matches('/').to_string();
    }
    if !ollama_model.trim().is_empty() {
        s.ollama_model = ollama_model.trim().to_string();
    }
    persist(&app, s, *key_in_file)?;
    Ok(public(s, *key_in_file))
}

#[tauri::command]
fn forget_key(app: tauri::AppHandle, state: State<SettingsState>) -> Result<PublicSettings, String> {
    let mut st = state.0.lock().unwrap();
    let (s, key_in_file) = &mut *st;
    s.claude_key.clear();
    keyring_delete();
    *key_in_file = false;
    persist(&app, s, false)?;
    Ok(public(s, false))
}

/// On startup: reads the settings, gets the key from the system vault,
/// and moves into it an old key still stored in plain text in settings.json.
fn load_settings(app: &tauri::AppHandle) -> (Settings, bool) {
    let mut s = settings_file(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str::<Settings>(&t).ok())
        .unwrap_or_default();
    let file_key = s.claude_key.trim().to_string();
    let mut key_in_file = false;
    if !file_key.is_empty() {
        if keyring_set(&file_key) {
            let _ = persist(app, &s, false); // migration: remove the key from the file
        } else {
            key_in_file = true;
        }
    } else if let Some(k) = keyring_get() {
        s.claude_key = k;
    }
    (s, key_in_file)
}

/* ---------- Market data (Analysis tab) ---------- */

/// Free market data sources the Analysis tab may read (no API key, public endpoints only).
const MARKET_HOSTS: [&str; 5] = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
    "api.binance.com",
    "data-api.binance.vision",
    "api.frankfurter.dev",
];

/// Whether a URL points to one of the allowed market data sources over HTTPS.
fn market_url_allowed(url: &str) -> bool {
    reqwest::Url::parse(url)
        .map(|u| u.scheme() == "https" && u.host_str().map(|h| MARKET_HOSTS.contains(&h)).unwrap_or(false))
        .unwrap_or(false)
}

/// Downloads market data (prices, symbol search) from an allowed public source and returns the body.
/// Done on the Rust side because these sites do not allow requests from inside the app's web view.
#[tauri::command]
async fn market_get(url: String) -> Result<String, String> {
    if !market_url_allowed(&url) {
        return Err("This data source is not allowed".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36 Whale")
        .build()
        .map_err(err)?;
    let res = client.get(&url).send().await.map_err(|e| format!("Could not reach the data source: {e}"))?;
    let status = res.status();
    let body = res.text().await.map_err(err)?;
    if !status.is_success() {
        return Err(format!("Data source error {}", status.as_u16()));
    }
    Ok(body)
}

/// Sends a request to the chosen AI provider and returns the raw JSON answer.
/// - claude: POST https://api.anthropic.com/v1/messages (the body is built by the interface)
/// - ollama: POST {ollama_url}/api/chat
#[tauri::command]
async fn ai_request(state: State<'_, SettingsState>, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let s = state.0.lock().unwrap().0.clone();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(err)?;
    let req = if s.provider == "ollama" {
        client.post(format!("{}/api/chat", s.ollama_url))
    } else {
        if s.claude_key.trim().is_empty() {
            return Err("No Claude API key: add it in More → AI settings.".into());
        }
        let mut r = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", s.claude_key.trim())
            .header("anthropic-version", "2026-10-21");
        if body.get("fallbacks").is_some() {
            r = r.header("anthropic-beta", "server-side-fallback-2026-07-01");
        }
        r
    };
    let res = req.json(&body).send().await.map_err(|e| {
        if s.provider == "ollama" {
            format!("Could not reach Ollama at {}: is it running? ({e})", s.ollama_url)
        } else {
            format!("Could not connect to the Claude API: {e}")
        }
    })?;
    let status = res.status();
    let text = res.text().await.map_err(err)?;
    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .or_else(|| v.get("error"))
                    .and_then(|m| m.as_str().map(String::from))
            })
            .unwrap_or(text);
        return Err(format!("Error {}: {}", status.as_u16(), msg));
    }
    serde_json::from_str(&text).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Vault(Mutex::new(PathBuf::new())))
        .setup(|app| {
            let loaded = load_settings(app.handle());
            app.manage(SettingsState(Mutex::new(loaded)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_vault,
            set_vault,
            list_notes,
            write_note,
            read_note,
            rename_note,
            trash_note,
            save_attachment,
            read_bytes,
            read_external_text,
            import_folder,
            get_settings,
            save_settings,
            forget_key,
            ai_request,
            market_get
        ])
        .run(tauri::generate_context!())
        .expect("error while starting Whale");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_vault_paths() {
        let root = Path::new("C:/vault");
        assert_eq!(safe_join(root, "Trades/x.md").unwrap(), root.join("Trades/x.md"));
        assert_eq!(safe_join(root, "Émotions/Stop trop serré.md").unwrap(), root.join("Émotions/Stop trop serré.md")); // non-ASCII names
    }

    #[test]
    fn safe_join_refuses_to_leave_the_vault() {
        let root = Path::new("C:/vault");
        for bad in ["", "../secret.txt", "Trades/../../x.md", "/etc/passwd", "C:/Windows/x.md", r"\\serveur\partage\x.md", "."] {
            assert!(safe_join(root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    #[test]
    fn market_urls_are_limited_to_known_sources() {
        assert!(market_url_allowed("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d"));
        assert!(market_url_allowed("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d"));
        assert!(!market_url_allowed("http://query1.finance.yahoo.com/v8/finance/chart/AAPL"), "https only");
        assert!(!market_url_allowed("https://example.com/steal"));
        assert!(!market_url_allowed("https://query1.finance.yahoo.com.evil.com/x"));
        assert!(!market_url_allowed("not a url"));
    }

    #[test]
    fn atomic_write_replaces_and_leaves_no_temp_file() {
        let root = std::env::temp_dir().join(format!("whale-aw-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let f = root.join("Trades/a.md");
        atomic_write(&f, b"one").unwrap();
        atomic_write(&f, b"two").unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "two");
        let names: Vec<_> = fs::read_dir(root.join("Trades")).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names.len(), 1, "no temporary file left behind");
        assert!(mtime_ms(&f) > 0);
        assert_eq!(mtime_ms(&root.join("missing.md")), 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn listing_skips_hidden_folders_and_non_markdown() {
        let root = std::env::temp_dir().join(format!("whale-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let mut out = Vec::new();
        fs::create_dir_all(root.join("Trades")).unwrap();
        fs::write(root.join("Trades/a.md"), "# A").unwrap();
        fs::create_dir_all(root.join(".trash")).unwrap();
        fs::write(root.join(".trash/cache.md"), "ignored").unwrap();
        fs::write(root.join("image.png"), [0u8; 4]).unwrap();
        walk(&root, &root, &mut out);
        assert_eq!(out.len(), 1, "only .md files outside hidden folders are listed");
        assert_eq!(out[0].path, "Trades/a.md");
        assert_eq!(out[0].content, "# A");
        let _ = fs::remove_dir_all(&root);
    }
}
