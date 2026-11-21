# 🐋 Whale

Journal de trading **local** et **open source**, inspiré d'Obsidian.

- Chaque trade est une note Markdown, stockée comme un vrai fichier `.md` dans ton coffre (par défaut `Documents\Whale`).
- Tu relies tes notes avec `[[liens]]` : setups, actifs, émotions, erreurs.
- La vue graphique 3D montre ton journal en forme de baleine.
- Le tableau de bord calcule le taux de réussite, le R moyen, le profit factor et la courbe des gains.
- Tu peux coller une capture de chart avec Ctrl+V : elle est rangée dans `attachments/`.

### Second cerveau (v0.2)

- **Classement par l'IA** : le bouton « ✦ Classer avec l'IA » remplit le type, les tags, la date, le résumé, les propriétés du trade et ajoute des `[[liens]]`. Tu peux aussi classer d'un coup toutes les notes qui n'ont pas encore de tags.
- **Demander** : pose une question à ton journal (« Pourquoi je perds sur TSLA ? »). L'IA lit les notes pertinentes et tes statistiques, puis répond en citant ses sources.
- **Import** :
  - dossiers de notes (Obsidian, export Markdown de Notion…) ;
  - conversations ChatGPT ou Claude (`conversations.json`) ;
  - trades d'un broker en CSV, avec le choix des colonnes et le calcul des R.
- **Timeline** de toutes les notes et **tableau des trades** filtrable et triable.

L'IA est au choix :

- **Claude**, avec ta clé API Anthropic. Le modèle par défaut est `claude-opus-5-5` et le repli automatique est activé.
- **Ollama**, 100 % local.

La clé est enregistrée uniquement dans le dossier de configuration de l'app (`%APPDATA%\app.whale.journal\settings.json`), jamais dans le coffre. Les appels réseau passent par la partie Rust (`ai_request`).

## Format d'une note de trade

```markdown
---
type: trade
actif: TSLA
setup: Breakout
sens: LONG
entree: 242.5
stop: 238
sortie: 251
resultat: 1.9
---
## Contexte
Cassure propre sur [[TSLA]], setup [[Breakout]].
```

`type` peut valoir `trade`, `setup`, `actif`, `emotion` ou `note`. `resultat` est exprimé en R.

## Raccourcis

| Raccourci | Action |
|---|---|
| Ctrl+N | Nouveau trade |
| Ctrl+E | Lecture / édition |
| Ctrl+G | Vue graphique |
| Ctrl+S | Enregistrer tout de suite (l'app enregistre aussi automatiquement) |

## Développement

Prérequis : Node.js, Rust et les outils de build C++ de Visual Studio (sous Windows).

```bash
npm install
npm run dev      # lance l'app en mode développement
npm run build    # crée l'installeur Windows (NSIS)
```

Structure :

- `src/` : l'interface (HTML, CSS, JS, three.js), sans framework. `app.js` est le cœur de l'app, `ai.js` gère l'IA, `import.js` les imports, `views.js` la timeline et le tableau, `graph.js` la baleine 3D.
- `src-tauri/src/lib.rs` : les fichiers du coffre, les réglages, les imports et les appels à l'IA (Rust)

Ouvrir `src/index.html` dans un navigateur fonctionne aussi : les notes sont alors gardées dans le localStorage, ce qui est pratique pour travailler sur l'interface.

## Licence

MIT
