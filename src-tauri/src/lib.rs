//! Whale — couche fichiers.
//! Le coffre (vault) est un dossier normal rempli de fichiers .md, comme dans Obsidian.
//! Toutes les commandes reçoivent des chemins RELATIFS au coffre et refusent d'en sortir.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

struct Vault(Mutex<PathBuf>);

#[derive(Serialize)]
struct NoteFile {
    path: String, // relatif au coffre, avec des "/"
    content: String,
    mtime: u64, // dernière modification (secondes Unix)
}

/// Réglages de l'IA, enregistrés dans le dossier de config de l'app (jamais dans le coffre).
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
struct SettingsState(Mutex<Settings>);

/// Ce que l'interface voit des réglages : la clé n'est jamais renvoyée en entier.
#[derive(Serialize)]
struct PublicSettings {
    provider: String,
    has_key: bool,
    key_hint: String,
    claude_model: String,
    ollama_url: String,
    ollama_model: String,
}

#[derive(Serialize)]
struct VaultInfo {
    path: String,
    name: String,
    created: bool, // true si le dossier vient d'être créé (vide)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Joint un chemin relatif au coffre en refusant "..", les chemins absolus, etc.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel.is_empty() {
        return Err("Chemin vide".into());
    }
    for c in rel_path.components() {
        match c {
            Component::Normal(_) => {}
            _ => return Err(format!("Chemin refusé : {rel}")),
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
            .unwrap_or_else(|| "Coffre".into()),
        created,
    }
}

/// Ouvre le dernier coffre utilisé, ou Documents/Whale au premier lancement.
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

/// Change de coffre (dossier choisi par l'utilisateur) et le mémorise.
#[tauri::command]
fn set_vault(app: tauri::AppHandle, state: State<Vault>, path: String) -> Result<VaultInfo, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("Ce dossier n'existe pas".into());
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
                let mtime = e
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push(NoteFile {
                    path: rel.to_string_lossy().replace('\\', "/"),
                    content,
                    mtime,
                });
            }
        }
    }
}

/// Liste toutes les notes .md du coffre (sous-dossiers compris).
#[tauri::command]
fn list_notes(state: State<Vault>) -> Vec<NoteFile> {
    let root = state.0.lock().unwrap().clone();
    let mut out = Vec::new();
    walk(&root, &root, &mut out);
    out
}

#[tauri::command]
fn write_note(state: State<Vault>, path: String, content: String) -> Result<(), String> {
    let root = state.0.lock().unwrap().clone();
    let full = safe_join(&root, &path)?;
    if let Some(dir) = full.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    fs::write(full, content).map_err(err)
}

#[tauri::command]
fn rename_note(state: State<Vault>, from: String, to: String) -> Result<(), String> {
    let root = state.0.lock().unwrap().clone();
    let (a, b) = (safe_join(&root, &from)?, safe_join(&root, &to)?);
    if b.exists() {
        return Err("Une note porte déjà ce nom".into());
    }
    if let Some(dir) = b.parent() {
        fs::create_dir_all(dir).map_err(err)?;
    }
    fs::rename(a, b).map_err(err)
}

/// "Supprimer" = déplacer dans .trash du coffre (récupérable), comme Obsidian.
#[tauri::command]
fn trash_note(state: State<Vault>, path: String) -> Result<(), String> {
    let root = state.0.lock().unwrap().clone();
    let src = safe_join(&root, &path)?;
    let trash = root.join(".trash");
    fs::create_dir_all(&trash).map_err(err)?;
    let fname = src.file_name().ok_or("Nom invalide")?.to_string_lossy().into_owned();
    let mut dest = trash.join(&fname);
    let mut i = 1;
    while dest.exists() {
        dest = trash.join(format!("{i} {fname}"));
        i += 1;
    }
    fs::rename(src, dest).map_err(err)
}

/// Enregistre une image collée (capture de chart) dans attachments/.
#[tauri::command]
fn save_attachment(state: State<Vault>, name: String, data: Vec<u8>) -> Result<String, String> {
    let root = state.0.lock().unwrap().clone();
    let rel = format!("attachments/{name}");
    let full = safe_join(&root, &rel)?;
    fs::create_dir_all(root.join("attachments")).map_err(err)?;
    fs::write(full, data).map_err(err)?;
    Ok(rel)
}

#[tauri::command]
fn read_bytes(state: State<Vault>, path: String) -> Result<tauri::ipc::Response, String> {
    let root = state.0.lock().unwrap().clone();
    let full = safe_join(&root, &path)?;
    fs::read(full).map(tauri::ipc::Response::new).map_err(err)
}

/* ---------- Import ---------- */

/// Lit un fichier choisi par l'utilisateur hors du coffre (export ChatGPT/Claude, CSV de broker).
#[tauri::command]
fn read_external_text(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !["json", "csv", "txt", "md", "tsv"].contains(&ext.as_str()) {
        return Err("Type de fichier non pris en charge".into());
    }
    let bytes = fs::read(p).map_err(err)?;
    // Certains brokers exportent en Windows-1252 : on tente l'UTF-8, sinon conversion simple.
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

/// Copie un dossier de notes (export Obsidian, Notion en Markdown…) dans le coffre.
/// Ne remplace jamais un fichier existant. Renvoie le nombre de notes copiées.
#[tauri::command]
fn import_folder(state: State<Vault>, src: String, dest: String) -> Result<u32, String> {
    let root = state.0.lock().unwrap().clone();
    let target = safe_join(&root, &dest)?;
    let src = PathBuf::from(src);
    if src.starts_with(&root) {
        return Err("Ce dossier est déjà dans le coffre".into());
    }
    let mut count = 0;
    copy_tree(&src, &target, &mut count).map_err(err)?;
    Ok(count)
}

/* ---------- Réglages et IA ---------- */

fn settings_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn public(s: &Settings) -> PublicSettings {
    let k = s.claude_key.trim();
    PublicSettings {
        provider: s.provider.clone(),
        has_key: !k.is_empty(),
        key_hint: if k.len() > 8 { format!("…{}", &k[k.len() - 4..]) } else { String::new() },
        claude_model: s.claude_model.clone(),
        ollama_url: s.ollama_url.clone(),
        ollama_model: s.ollama_model.clone(),
    }
}

#[tauri::command]
fn get_settings(state: State<SettingsState>) -> PublicSettings {
    public(&state.0.lock().unwrap())
}

/// Enregistre les réglages. Une clé vide garde la clé déjà enregistrée.
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
    let mut s = state.0.lock().unwrap();
    s.provider = if provider == "ollama" { "ollama".into() } else { "claude".into() };
    if !claude_key.trim().is_empty() {
        s.claude_key = claude_key.trim().to_string();
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
    if let Some(f) = settings_file(&app) {
        if let Some(dir) = f.parent() {
            fs::create_dir_all(dir).map_err(err)?;
        }
        fs::write(f, serde_json::to_string_pretty(&*s).map_err(err)?).map_err(err)?;
    }
    Ok(public(&s))
}

#[tauri::command]
fn forget_key(app: tauri::AppHandle, state: State<SettingsState>) -> Result<PublicSettings, String> {
    let mut s = state.0.lock().unwrap();
    s.claude_key.clear();
    if let Some(f) = settings_file(&app) {
        let _ = fs::write(f, serde_json::to_string_pretty(&*s).map_err(err)?);
    }
    Ok(public(&s))
}

/// Envoie une requête au fournisseur d'IA choisi et renvoie la réponse JSON brute.
/// - claude : POST https://api.anthropic.com/v1/messages (le corps est construit par l'interface)
/// - ollama : POST {ollama_url}/api/chat
#[tauri::command]
async fn ai_request(state: State<'_, SettingsState>, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let s = state.0.lock().unwrap().clone();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(err)?;
    let req = if s.provider == "ollama" {
        client.post(format!("{}/api/chat", s.ollama_url))
    } else {
        if s.claude_key.trim().is_empty() {
            return Err("Aucune clé API Claude : ajoute-la dans les réglages (icône engrenage).".into());
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
            format!("Impossible de joindre Ollama à {} : est-il lancé ? ({e})", s.ollama_url)
        } else {
            format!("Connexion à l'API Claude impossible : {e}")
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
        return Err(format!("Erreur {} : {}", status.as_u16(), msg));
    }
    serde_json::from_str(&text).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Vault(Mutex::new(PathBuf::new())))
        .setup(|app| {
            let s = settings_file(app.handle())
                .and_then(|f| fs::read_to_string(f).ok())
                .and_then(|t| serde_json::from_str::<Settings>(&t).ok())
                .unwrap_or_default();
            app.manage(SettingsState(Mutex::new(s)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_vault,
            set_vault,
            list_notes,
            write_note,
            rename_note,
            trash_note,
            save_attachment,
            read_bytes,
            read_external_text,
            import_folder,
            get_settings,
            save_settings,
            forget_key,
            ai_request
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Whale");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepte_les_chemins_du_coffre() {
        let root = Path::new("C:/coffre");
        assert_eq!(safe_join(root, "Trades/x.md").unwrap(), root.join("Trades/x.md"));
        assert_eq!(safe_join(root, "Émotions/Stop trop serré.md").unwrap(), root.join("Émotions/Stop trop serré.md"));
    }

    #[test]
    fn safe_join_refuse_de_sortir_du_coffre() {
        let root = Path::new("C:/coffre");
        for bad in ["", "../secret.txt", "Trades/../../x.md", "/etc/passwd", "C:/Windows/x.md", "\\serveur\partage\x.md", "."] {
            assert!(safe_join(root, bad).is_err(), "devrait refuser {bad:?}");
        }
    }

    #[test]
    fn ecriture_lecture_renommage_corbeille() {
        let root = std::env::temp_dir().join(format!("whale-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let mut out = Vec::new();
        fs::create_dir_all(root.join("Trades")).unwrap();
        fs::write(root.join("Trades/a.md"), "# A").unwrap();
        fs::create_dir_all(root.join(".trash")).unwrap();
        fs::write(root.join(".trash/cache.md"), "ignoré").unwrap();
        fs::write(root.join("image.png"), [0u8; 4]).unwrap();
        walk(&root, &root, &mut out);
        assert_eq!(out.len(), 1, "seuls les .md hors dossiers cachés sont listés");
        assert_eq!(out[0].path, "Trades/a.md");
        assert_eq!(out[0].content, "# A");
        let _ = fs::remove_dir_all(&root);
    }
}
