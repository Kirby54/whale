// Notes d'exemple écrites dans un coffre neuf au premier lancement.
window.SEED = [
['Bienvenue.md',`---
type: note
---
# Bienvenue dans Whale 🐋

Whale est un journal de trading **local** et **open source**, inspiré d'Obsidian.
Chaque note est un vrai fichier \`.md\` dans le dossier de ton coffre : tu peux l'ouvrir avec n'importe quel éditeur.

- Relie tes notes avec des doubles crochets : par exemple [[Breakout]], [[TSLA]] ou [[FOMO]].
- Ouvre la **vue graphique** (Ctrl+G) pour voir ton journal en forme de baleine.
- Le **tableau de bord** calcule ton taux de réussite et ton R moyen à partir des propriétés.
- Colle une capture de chart avec **Ctrl+V** en mode édition : elle est rangée dans \`attachments/\`.

> Raccourcis : Ctrl+E lecture / édition · Ctrl+N nouveau trade · Ctrl+G vue graphique`],
['Setups/Breakout.md',`---
type: setup
---
# Breakout

Cassure d'une résistance avec volume au-dessus de la moyenne.

## Règles
- Attendre la clôture de bougie au-dessus du niveau
- Volume > 1,5× la moyenne 20 périodes
- Stop sous le dernier creux

Voir aussi [[Pullback]].`],
['Setups/Pullback.md',`---
type: setup
---
# Pullback

Retour sur une zone de support dans une tendance haussière.

## Règles
- Tendance confirmée sur l'UT supérieure
- Entrée sur bougie de rejet
- Cible : précédent plus haut`],
['Actifs/TSLA.md',`---
type: actif
marche: Actions US
---
# TSLA

Très volatile autour des résultats et des annonces. Réduire la taille avant les earnings.`],
['Actifs/BTC.md',`---
type: actif
marche: Crypto
---
# BTC

Respecte bien les niveaux ronds. Attention aux mèches le week-end.`],
['Actifs/EURUSD.md',`---
type: actif
marche: Forex
---
# EURUSD

Meilleure volatilité à l'ouverture de Londres et de New York.`],
['Émotions/FOMO.md',`---
type: emotion
---
# FOMO

Entrer en retard par peur de rater le mouvement. Résultat : stop mal placé et R:R dégradé.

**Règle** : si le prix est à plus de 1 ATR du niveau, je ne rentre pas.`],
['Émotions/Stop trop serré.md',`---
type: emotion
---
# Stop trop serré

Stop placé dans le bruit du marché, sorti avant le vrai mouvement.`],
['Trades/2026-11-03 TSLA long.md',`---
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
Cassure propre de la résistance à 241 sur [[TSLA]], volume élevé. Setup [[Breakout]] classique.

## Ce qui a marché
- Patience jusqu'à la clôture
- Sortie partielle à TP1`],
['Trades/2026-11-05 BTC short.md',`---
type: trade
actif: BTC
setup: Pullback
sens: SHORT
entree: 71200
stop: 72100
sortie: 72100
resultat: -1
---
## Contexte
Short sur [[BTC]] en [[Pullback]] baissier, mais contre la tendance H4.

## Erreur
Entrée trop tard : [[FOMO]].`],
['Trades/2026-11-07 EURUSD long.md',`---
type: trade
actif: EURUSD
setup: Pullback
sens: LONG
entree: 1.0815
stop: 1.0795
sortie: 1.0865
resultat: 2.5
---
[[Pullback]] sur la zone 1.0810 de [[EURUSD]], ouverture de Londres. Exécution propre.`],
['Trades/2026-11-10 TSLA long.md',`---
type: trade
actif: TSLA
setup: Breakout
sens: LONG
entree: 255
stop: 253.8
sortie: 253.8
resultat: -1
---
Faux [[Breakout]] sur [[TSLA]]. Le stop était dans le bruit : [[Stop trop serré]].`],
['Trades/2026-11-12 BTC long.md',`---
type: trade
actif: BTC
setup: Breakout
sens: LONG
entree: 73400
stop: 72600
sortie: 75800
resultat: 3
---
[[Breakout]] du plus haut hebdo sur [[BTC]]. Gros volume, tenu jusqu'à TP2.`],
['Trades/2026-11-14 EURUSD short.md',`---
type: trade
actif: EURUSD
setup: Breakout
sens: SHORT
entree: 1.0840
stop: 1.0860
sortie: 1.0860
resultat: -1
---
Cassure de support sur [[EURUSD]] qui a échoué. [[FOMO]] après la news.`],
['Trades/2026-11-18 TSLA short.md',`---
type: trade
actif: TSLA
setup: Pullback
sens: SHORT
entree: 262
stop: 265
sortie: 257.5
resultat: 1.5
---
[[Pullback]] sur résistance de [[TSLA]], rejet net. Bon trade.`],
['Trades/2026-11-20 BTC long.md',`---
type: trade
actif: BTC
setup: Pullback
sens: LONG
entree: 74100
stop: 73500
sortie: 75300
resultat: 2
---
Retour sur l'ancienne résistance devenue support sur [[BTC]]. [[Pullback]] parfait.`]
];
