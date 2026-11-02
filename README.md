# Gems — mobile match-3

A match-3 game that runs entirely in the browser, built for phones. No build
step, no dependencies — plain HTML/CSS/ES modules, playable from GitHub Pages
or any static file server.

**Play:** [afrodrumunit.github.io/Match3](https://afrodrumunit.github.io/Match3/)
(private repo — sign in to GitHub to view it)

## How to play

- **Swipe** a gem in any direction, or **tap two adjacent gems**, to swap them
- Match **3+** of a kind to score. Cascades build **combos** that multiply points
- Match **4** → ⚡ line gem: swap it into a match to clear its whole row/column
- Match **5** → 💣 bomb gem: clears every gem of that color on the board
- **25 moves** per game. Every **600 points** = level up: **+4 moves** and a
  new **theme** (visuals + music) every 2 levels
- Idle 6s → a hint pulses on a valid move. New Game resets everything
- Best score, **top-3 scores** (shown on the game-over screen) and mute preference persist in `localStorage`

## Run locally

```sh
git clone <repo-url>
cd Match3
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works; ES modules require http(s), not `file://`.)

## Project layout

| File | Role |
|---|---|
| `engine.js` | Pure game logic, zero DOM: board state machine (`createState`, `trySwap`, `resolveStep`, `endTurn`, `reshuffle`), match/special detection. Seeded RNG for deterministic tests |
| `game.js` | Orchestrator: pointer input, turn flow, HUD, theme switching (~200 lines) |
| `boardView.js` | All board DOM: tile placement/animation, popups, hints |
| `audio.js` | Web Audio synth: polyphonic SFX + generative ambient BGM (Boards of Canada-style tape pads, dusty kit, vinyl crackle), per-theme progressions |
| `themes.js` | Pure data: 4 themes (emojis, colors, CSS vars, BGM note loops) rotating every 2 levels |
| `harmony.js` | Pure music theory helpers: chord/bass/pattern lookup per bar, chord-tone quantization so SFX harmonize with the BGM |
| `index.html` / `style.css` | Shell + styling; colors driven by CSS custom properties so themes cross-fade |
| `stats.js` | Top-3 score persistence in localStorage (storage injected for tests) |
| `test/` | Node test suites + balance simulation (no framework needed) |

## Tests

```sh
node test/engine.test.mjs    # 19 tests: matches, specials, refill integrity, levels
node test/theme.test.mjs     # 6 tests: theme data integrity and rotation
node test/harmony.test.mjs   # 7 tests: chord lookup, quantization, arp patterns
node test/stats.test.mjs     # 7 tests: top-3 persistence, sorting, corrupt-data recovery
node test/balance_study.mjs  # Monte Carlo: 300 games/policy, EV and game-length stats
```

## Tech notes

- Board rendering: all tiles stack in one grid cell, positioned by
  `transform: translate(calc(...))` — CSS state classes never touch the
  positioning transform (that was an early bug)
- Audio: `AudioContext` unlocked on first user gesture (mobile autoplay rules);
  master gain → compressor; mute ramps the master gain so already-scheduled
  BGM silences instantly
- Balance was tuned with `test/balance_study.mjs` (level bonus self-sustain
  ratio kept below 1 so games end)
