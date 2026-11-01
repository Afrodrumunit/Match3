import {
  SIZE, SPECIAL_BOMB, START_MOVES,
  findHint, createState, trySwap, resolveStep, endTurn, reshuffle,
} from "./engine.js";

(() => {
  "use strict";

  const TYPES = ["💎", "🔥", "🌊", "🍀", "⭐", "💜"];
  const COLORS = ["#4fc3f7", "#ff8a65", "#4dd0e1", "#aed581", "#ffd54f", "#ba68c8"];
  const SWAP_MS = 170;
  const FALL_MS = 220;
  const POP_MS = 200;
  const BLAST_MS = 260;
  const IDLE_HINT_MS = 6000;

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");
  const soundBtn = document.getElementById("sound");

  const sfx = (() => {
    let ctx = null;
    let muted = localStorage.getItem("gems-muted") === "1";
    let chirped = false;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch { return null; }
      }
      if (ctx.state === "suspended") {
        try { ctx.resume(); } catch { /* retried on next gesture */ }
      }
      return ctx;
    }

    function tone(freq, dur, type, vol, when = 0, slideTo = null) {
      if (muted) return;
      try {
        const ac = ensure();
        if (!ac) return;
        const t = ac.currentTime + when;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch { /* audio must never break gameplay */ }
    }

    return {
      unlock() {
        const ac = ensure();
        if (ac && !chirped) {
          chirped = true;
          tone(660, 0.08, "square", 0.15, 0, 990);
        }
      },
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        localStorage.setItem("gems-muted", muted ? "1" : "0");
        return muted;
      },
      swap() { tone(280, 0.09, "square", 0.18, 0, 520); },
      invalid() { tone(160, 0.16, "square", 0.18, 0, 90); },
      match(combo) {
        const base = 440 * Math.pow(1.25, Math.min(combo - 1, 6));
        tone(base, 0.12, "square", 0.2, 0);
        tone(base * 1.5, 0.14, "square", 0.15, 0.05);
      },
      special() {
        tone(180, 0.3, "sawtooth", 0.2, 0, 1200);
        tone(90, 0.35, "square", 0.16, 0.05, 600);
      },
      fall() { tone(700, 0.06, "triangle", 0.1, 0, 350); },
      levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", 0.18, i * 0.1)); },
      gameOver() {
        [523, 415, 330, 262].forEach((f, i) => tone(f, 0.22, "square", 0.16, i * 0.18));
      },
      newGame() { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.12, "square", 0.16, i * 0.08)); },
    };
  })();

  ["pointerdown", "touchstart", "click"].forEach((evt) =>
    window.addEventListener(evt, () => sfx.unlock(), { passive: true })
  );

  let state = createState();
  let tiles = [];
  let best = Number(localStorage.getItem("gems-best") || 0);
  let busy = false;
  let selected = null;
  let hintTimer = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function place(el, r, c, instant) {
    if (instant) el.style.transition = "none";
    el.style.transform = `translate(calc(${c} * 100% + ${c} * var(--gap)), calc(${r} * 100% + ${r} * var(--gap)))`;
    if (instant) {
      void el.offsetWidth;
      el.style.transition = "";
    }
    el.dataset.r = r;
    el.dataset.c = c;
  }

  function createTileEl(type, spec) {
    const el = document.createElement("div");
    el.className = "tile" + (spec ? " special" : "");
    el.style.background = COLORS[type];
    el.innerHTML = `<span>${spec === SPECIAL_BOMB ? "💣" : TYPES[type]}</span>`;
    boardEl.appendChild(el);
    return el;
  }

  function makeTile(r, c) {
    const el = createTileEl(state.grid[r][c], state.special[r][c]);
    tiles[r][c] = el;
    place(el, r, c, true);
    return el;
  }

  function spawnTile(sp) {
    const { r, c, type, fromRow } = sp;
    const el = createTileEl(type, null);
    tiles[r][c] = el;
    el.style.transition = "none";
    el.style.transform = `translate(calc(${c} * 100% + ${c} * var(--gap)), calc(${fromRow} * 100% + ${fromRow} * var(--gap)))`;
    void el.offsetWidth;
    el.style.transition = "";
    place(el, r, c);
    return el;
  }

  function refreshTileFace(r, c) {
    const el = tiles[r][c];
    if (!el) return;
    el.classList.toggle("special", !!state.special[r][c]);
    el.innerHTML = `<span>${state.special[r][c] === SPECIAL_BOMB ? "💣" : TYPES[state.grid[r][c]]}</span>`;
  }

  function renderBoard() {
    boardEl.querySelectorAll(".score-popup").forEach((el) => el.remove());
    boardEl.innerHTML = "";
    tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) makeTile(r, c);
    }
  }

  function updateHud() {
    scoreEl.textContent = state.score;
    movesEl.textContent = state.moves;
    levelEl.textContent = state.level;
    bestEl.textContent = best;
  }

  function setMessage(text) {
    messageEl.textContent = text;
  }

  function popup(r, c, text) {
    const el = document.createElement("div");
    el.className = "score-popup";
    el.textContent = text;
    const rect = boardEl.getBoundingClientRect();
    const inner = rect.width - 12;
    const tile = (inner - 7 * 4) / 8;
    el.style.left = `${6 + c * (tile + 4) + tile / 2}px`;
    el.style.top = `${6 + r * (tile + 4) + tile / 2}px`;
    boardEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (busy || state.over) return;
      const hint = findHint(state.grid);
      if (hint) {
        clearHints();
        hint.forEach(([r, c]) => tiles[r][c] && tiles[r][c].classList.add("hint"));
      }
    }, IDLE_HINT_MS);
  }

  function clearHints() {
    document.querySelectorAll(".tile.hint").forEach((el) => el.classList.remove("hint"));
  }

  function clearSelection() {
    if (selected) {
      selected.el.classList.remove("selected");
      selected = null;
    }
  }

  async function animateSwap(r1, c1, r2, c2) {
    [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
    place(tiles[r1][c1], r1, c1);
    place(tiles[r2][c2], r2, c2);
    await sleep(SWAP_MS);
  }

  async function animateSwapBack(r1, c1, r2, c2) {
    await animateSwap(r1, c1, r2, c2);
  }

  async function animateResolve() {
    let lastCount = 0;
    let combo = 0;
    let step;
    while ((step = resolveStep(state)) !== null) {
      combo = step.combo;
      lastCount = step.popped.length;
      for (const i of step.popped) {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        if (tiles[r][c]) tiles[r][c].classList.add("matched");
      }
      for (const cr of step.created) {
        const [r, c] = cr.at;
        refreshTileFace(r, c);
        popup(r, c, cr.kind === SPECIAL_BOMB ? "💣 Bomb!" : "⚡ Line!");
      }
      popup(Math.floor(SIZE / 2), Math.floor(SIZE / 2), `+${step.gained}`);
      updateHud();
      if (step.blasted.size > 0) sfx.special();
      else sfx.match(combo);
      await sleep(step.blasted.size > 0 ? BLAST_MS : POP_MS);
      for (const i of step.popped) {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        if (tiles[r][c]) {
          tiles[r][c].remove();
          tiles[r][c] = null;
        }
      }
      for (const mv of step.moved) {
        const [fr, fc] = mv.from;
        const [tr, tc] = mv.to;
        tiles[tr][tc] = tiles[fr][fc];
        tiles[fr][fc] = null;
        refreshTileFace(tr, tc);
        place(tiles[tr][tc], tr, tc);
      }
      for (const sp of step.spawned) spawnTile(sp);
      sfx.fall();
      await sleep(FALL_MS);
    }
    if (combo > 1) setMessage(`Combo x${combo}! Last match: ${lastCount} gems`);
    else setMessage("");
  }

  async function doSwap(r1, c1, r2, c2) {
    if (busy || state.over) return;
    busy = true;
    clearSelection();
    clearHints();

    await animateSwap(r1, c1, r2, c2);
    const res = trySwap(state, r1, c1, r2, c2);
    if (!res.accepted) {
      sfx.invalid();
      await animateSwapBack(r1, c1, r2, c2);
      busy = false;
      scheduleHint();
      return;
    }
    sfx.swap();
    await animateResolve();

    const end = endTurn(state);
    if (end.levelUp) {
      setMessage(`Level ${state.level}! +10 moves`);
      sfx.levelUp();
    }
    if (end.gameOver) {
      if (state.score > best) {
        best = state.score;
        localStorage.setItem("gems-best", String(best));
      }
      setMessage(`Game over! Final score: ${state.score}. Tap New Game to play again.`);
      sfx.gameOver();
    } else if (end.needsReshuffle) {
      setMessage("No moves left on board — reshuffling!");
      reshuffle(state);
      renderBoard();
      await sleep(FALL_MS);
    }
    updateHud();
    busy = false;
    scheduleHint();
  }

  function cellFromEvent(e) {
    const el = e.target.closest(".tile");
    if (!el) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c), el };
  }

  let pointerStart = null;

  boardEl.addEventListener("pointerdown", (e) => {
    sfx.unlock();
    if (busy || state.over) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    clearTimeout(hintTimer);
    clearHints();
    pointerStart = { r: cell.r, c: cell.c, x: e.clientX, y: e.clientY, moved: false };
    boardEl.setPointerCapture(e.pointerId);
  });

  boardEl.addEventListener("pointermove", (e) => {
    if (!pointerStart || pointerStart.moved) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    const threshold = 22;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    pointerStart.moved = true;
    let r2 = pointerStart.r;
    let c2 = pointerStart.c;
    if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1;
    else r2 += dy > 0 ? 1 : -1;
    doSwap(pointerStart.r, pointerStart.c, r2, c2);
    pointerStart = null;
  });

  boardEl.addEventListener("pointerup", (e) => {
    if (!pointerStart) return;
    const start = pointerStart;
    pointerStart = null;
    if (start.moved) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (selected && selected.r === cell.r && selected.c === cell.c) {
      clearSelection();
      return;
    }
    if (selected && Math.abs(selected.r - cell.r) + Math.abs(selected.c - cell.c) === 1) {
      const sr = selected.r;
      const sc = selected.c;
      clearSelection();
      doSwap(sr, sc, cell.r, cell.c);
      return;
    }
    clearSelection();
    selected = { r: cell.r, c: cell.c, el: cell.el };
    cell.el.classList.add("selected");
  });

  boardEl.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  soundBtn.addEventListener("click", () => {
    sfx.unlock();
    const nowMuted = sfx.toggle();
    soundBtn.textContent = nowMuted ? "🔇" : "🔊";
    if (!nowMuted) sfx.match(1);
  });
  soundBtn.textContent = sfx.muted ? "🔇" : "🔊";

  restartBtn.addEventListener("click", () => {
    sfx.unlock();
    sfx.newGame();
    state = createState();
    selected = null;
    setMessage("");
    updateHud();
    renderBoard();
    scheduleHint();
  });

  bestEl.textContent = best;
  updateHud();
  renderBoard();
  scheduleHint();
})();
