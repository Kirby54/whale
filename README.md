<p align="center">
  <img src="assets/concepts/a-gemme-ocean-app.svg" width="120" alt="Logo Whale">
</p>

<h1 align="center">Whale</h1>

<p align="center">
  Journal de trading <b>local</b> et <b>open source</b> qui sert aussi de second cerveau.<br>
  Tes notes Markdown, tes trades et tes conversations IA, reliés entre eux et visibles en forme de baleine.
</p>

---

## Pourquoi Whale

- **Tes données restent chez toi.** Chaque note est un vrai fichier `.md` dans un dossier de ton ordinateur (le « coffre »). Pas de compte, pas de cloud imposé, et tu peux ouvrir tes notes avec n'importe quel éditeur.
- **Pensé pour le trading.** Propriétés de trade (actif, setup, sens, entrée, stop, sortie, résultat en R), tableau de bord, courbe des gains, import des trades de ton broker.
- **Un second cerveau.** Liens `[[ ]]`, rétroliens, tags, import de tes notes et de tes conversations ChatGPT ou Claude, et une IA qui répond à partir de ton journal.

## Fonctionnalités

| | |
|---|---|
| **Cerveau** | Chaque note est un point dans une baleine 3D, coloré selon son dossier. Légende cliquable, histogramme du temps avec une fenêtre glissable. |
| **Ton IA** | Panneau à droite du cerveau. Tu poses une question, l'IA répond en citant tes notes et allume dans le cerveau le dossier, la période et les notes concernés. |
| **Éditeur** | Aperçu en direct comme Obsidian (CodeMirror 6). Autocomplétion des `[[liens]]` et des `#tags`, cases à cocher, captures de charts collées avec Ctrl+V. |
| **Classement par l'IA** | Un clic remplit le type, les tags, la date, le résumé et les propriétés d'un trade, et ajoute des liens vers tes autres notes. |
| **Import** | Dossiers Obsidian ou Notion (Markdown), conversations ChatGPT et Claude (`conversations.json`), trades en CSV (MT4/MT5, TradingView, Binance, IBKR…) avec calcul des R. |
| **Vues** | Tableau de bord (taux de réussite, R moyen, profit factor), timeline, tableau des trades triable, recherche Ctrl+K. |

## L'IA, à ton choix

- **Claude**, avec ta propre clé API Anthropic (modèle par défaut : `claude-opus-5-5`). La clé est rangée dans le coffre-fort du système (Gestionnaire d'identifiants Windows), jamais dans tes notes.
- **Ollama**, 100 % local et gratuit : rien ne sort de ton ordinateur.

Pour répondre, Whale envoie au fournisseur choisi tes statistiques et les notes utiles à la question. Avec Ollama, tout reste sur ta machine.

## Format d'une note de trade

```markdown
---
type: trade
date: 2026-11-03
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

`type` peut valoir `trade`, `setup`, `actif`, `emotion`, `conversation` ou `note`. `resultat` est exprimé en R (multiple du risque).

## Raccourcis

| Raccourci | Action |
|---|---|
| Ctrl+K | Chercher une note ou demander à l'IA |
| Ctrl+N | Nouveau trade |
| Ctrl+E | Basculer entre l'éditeur et la vue lecture |
| Ctrl+G | Cerveau |
| Ctrl+B / Ctrl+I | Gras / italique |
| Ctrl+L | Case à cocher |
| Ctrl+F | Rechercher dans la note |

## Installer depuis les sources

Prérequis : [Node.js](https://nodejs.org), [Rust](https://rustup.rs) et, sous Windows, les outils de build C++ de Visual Studio.

```bash
git clone https://github.com/Kirby54/whale.git
cd whale
npm install
npm run dev      # lance l'app en mode développement
npm run build    # crée l'installeur Windows
npm test         # lance les tests
```

## Structure du code

| Dossier | Contenu |
|---|---|
| `src/` | L'interface, sans framework : `app.js` (cœur), `core.js` (logique pure, testée), `graph.js` (cerveau 3D), `ai.js` et `aipanel.js` (IA), `import.js`, `views.js`, `ui.js` |
| `editor/` | Source de l'éditeur (CodeMirror 6), compilée par esbuild vers `src/vendor/editor.bundle.js` |
| `src-tauri/` | La partie Rust : fichiers du coffre, réglages, import et appels à l'IA |
| `tests/` | Tests de la logique (`npm test`) ; tests Rust avec `cargo test` dans `src-tauri/` |
| `assets/` | Logos (3 pistes) et icônes générées |

Ouvrir `src/index.html` dans un navigateur fonctionne aussi : les notes sont alors gardées dans le navigateur, ce qui est pratique pour travailler sur l'interface.

## Contribuer

Les issues et les pull requests sont les bienvenues. Lance `npm test` avant de proposer une modification.

## Licence

[MIT](LICENSE)
