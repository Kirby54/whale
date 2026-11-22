// Example notes written into a brand-new vault on first launch.
window.SEED = [
['Welcome.md',`---
type: note
---
# Welcome to Whale 🐋

Whale is a **local** and **open-source** trading journal that is also a second brain.
Every note is a real \`.md\` file in your vault folder: you can open it with any editor.

- Link notes with double brackets: for example [[Breakout]], [[TSLA]] or [[FOMO]].
- Open the **Brain** to see your journal as a whale. Ask **Your AI** on the right to light up notes.
- The **Dashboard** computes your win rate and average R from the properties.
- Paste a chart screenshot with **Ctrl+V** while editing: it is saved in \`attachments/\`.

> Shortcuts: Ctrl+K ask or search · Ctrl+N new trade · Ctrl+E edit / read · Ctrl+G brain`],
['Setups/Breakout.md',`---
type: setup
---
# Breakout

Break of a resistance with above-average volume.

## Rules
- Wait for the candle to close above the level
- Volume > 1.5× the 20-period average
- Stop below the last swing low

See also [[Pullback]].`],
['Setups/Pullback.md',`---
type: setup
---
# Pullback

Pullback to a support zone in an uptrend.

## Rules
- Trend confirmed on the higher timeframe
- Enter on a rejection candle
- Target: previous high`],
['Assets/TSLA.md',`---
type: asset
market: US stocks
---
# TSLA

Very volatile around earnings and announcements. Size down before earnings.`],
['Assets/BTC.md',`---
type: asset
market: Crypto
---
# BTC

Respects round numbers well. Watch out for weekend wicks.`],
['Assets/EURUSD.md',`---
type: asset
market: Forex
---
# EURUSD

Best volatility at the London and New York opens.`],
['Emotions/FOMO.md',`---
type: emotion
---
# FOMO

Entering late out of fear of missing the move. Result: badly placed stop and a worse R:R.

**Rule**: if price is more than 1 ATR away from the level, I stay out.`],
['Emotions/Stop too tight.md',`---
type: emotion
---
# Stop too tight

Stop placed inside market noise, taken out before the real move.`],
['Trades/2026-11-03 TSLA long.md',`---
type: trade
asset: TSLA
setup: Breakout
side: LONG
entry: 242.5
stop: 238
exit: 251
result: 1.9
---
## Context
Clean break of the 241 resistance on [[TSLA]], high volume. Classic [[Breakout]] setup.

## What worked
- Waited for the close
- Partial exit at TP1`],
['Trades/2026-11-05 BTC short.md',`---
type: trade
asset: BTC
setup: Pullback
side: SHORT
entry: 71200
stop: 72100
exit: 72100
result: -1
---
## Context
Short on [[BTC]] on a bearish [[Pullback]], but against the H4 trend.

## Mistake
Entered too late: [[FOMO]].`],
['Trades/2026-11-07 EURUSD long.md',`---
type: trade
asset: EURUSD
setup: Pullback
side: LONG
entry: 1.0815
stop: 1.0795
exit: 1.0865
result: 2.5
---
[[Pullback]] into the 1.0810 zone on [[EURUSD]] at the London open. Clean execution.`],
['Trades/2026-11-10 TSLA long.md',`---
type: trade
asset: TSLA
setup: Breakout
side: LONG
entry: 255
stop: 253.8
exit: 253.8
result: -1
---
False [[Breakout]] on [[TSLA]]. The stop was in the noise: [[Stop too tight]].`],
['Trades/2026-11-12 BTC long.md',`---
type: trade
asset: BTC
setup: Breakout
side: LONG
entry: 73400
stop: 72600
exit: 75800
result: 3
---
[[Breakout]] of the weekly high on [[BTC]]. Big volume, held to TP2.`],
['Trades/2026-11-14 EURUSD short.md',`---
type: trade
asset: EURUSD
setup: Breakout
side: SHORT
entry: 1.0840
stop: 1.0860
exit: 1.0860
result: -1
---
Support break on [[EURUSD]] that failed. [[FOMO]] after the news.`],
['Trades/2026-11-18 TSLA short.md',`---
type: trade
asset: TSLA
setup: Pullback
side: SHORT
entry: 262
stop: 265
exit: 257.5
result: 1.5
---
[[Pullback]] into [[TSLA]] resistance, sharp rejection. Good trade.`],
['Trades/2026-11-20 BTC long.md',`---
type: trade
asset: BTC
setup: Pullback
side: LONG
entry: 74100
stop: 73500
exit: 75300
result: 2
---
Retest of the old resistance turned support on [[BTC]]. Perfect [[Pullback]].`]
];
