import {
  SIZE, SPECIAL_BOMB, LEVEL_STEP,
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
  const progressFill = document.getElementById("progress-fill");
  const messageEl = document.getElementById("message");
  const restartBtn = document.getElementById("restart");
  const soundBtn = document.getElementById("sound");

  const sfx = (() => {
    let ctx = null;
    let master = null;
    let muted = localStorage.getItem("gems-muted") === "1";
    let chirped = false;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.9;
          if (ctx.createDynamicsCompressor) {
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -18;
            comp.knee.value = 20;
            comp.ratio.value = 8;
            master.connect(comp);
            comp.connect(ctx.destination);
          } else {
            master.connect(ctx.destination);
          }
        } catch { return null; }
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
        gain.connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      } catch { /* audio must never break gameplay */ }
    }

    function chord(freqs, dur, type, vol, when = 0, step = 0) {
      freqs.forEach((f, i) => tone(f, dur, type, vol, when + i * step));
    }

    function arp(root, steps, dur, type, vol, when = 0, step = 0.055, ratio = 1.335) {
      let f = root;
      for (let i = 0; i < steps; i++) {
        tone(f, dur, type, vol, when + i * step);
        f *= ratio;
      }
    }

    let filter = null;
    function pad(freq, t, dur, vol) {
      if (muted) return;
      try {
        const ac = ensure();
        if (!ac) return;
        if (!filter) {
          filter = ac.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 850;
          filter.Q.value = 0.7;
          filter.connect(master);
        }
        for (const det of [-4, 4]) {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, t);
          osc.detune.setValueAtTime(det, t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
          gain.gain.setValueAtTime(vol, t + dur * 0.7);
          gain.gain.linearRampToValueAtTime(0.0001, t + dur);
          osc.connect(gain);
          gain.connect(filter);
          osc.start(t);
          osc.stop(t + dur + 0.05);
        }
      } catch { /* audio must never break gameplay */ }
    }

    function pluck(freq, t, vol) {
      if (muted) return;
      try {
        const ac = ensure();
        if (!ac) return;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + 1);
      } catch { /* audio must never break gameplay */ }
    }

    const N = {
      A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0,
      B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
      B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
      C6: 1046.5, E6: 1318.5,
    };

    const BGM_CHORDS = [
      [N.A2, N.C4, N.E4, N.A4],
      [N.F3, N.A3, N.C4, N.F4],
      [N.C3, N.E4, N.G4, N.C5],
      [N.G3, N.B3, N.D4, N.G4],
    ];
    const BGM_ARP = [0, 2, 1, 3, 2, 1];
    const BAR_SEC = 4.2;
    const bgm = {
      timer: null,
      nextBar: 0,
      barIndex: 0,
      start() {
        const ac = ensure();
        if (!ac || this.timer) return;
        this.nextBar = ac.currentTime + 0.1;
        this.barIndex = 0;
        this.timer = setInterval(() => this.schedule(), 500);
      },
      stop() {
        clearInterval(this.timer);
        this.timer = null;
      },
      schedule() {
        try {
          const ac = ensure();
          if (!ac || muted) return;
          const ahead = ac.currentTime + 1.2;
          while (this.nextBar < ahead) {
            const t = this.nextBar;
            const chordNotes = BGM_CHORDS[this.barIndex % BGM_CHORDS.length];
            chordNotes.forEach((f) => pad(f, t, BAR_SEC * 1.05, 0.028));
            for (let i = 0; i < 4; i++) {
              const note = chordNotes[BGM_ARP[(this.barIndex * 4 + i) % BGM_ARP.length]] * 2;
              pluck(note, t + i * (BAR_SEC / 4), 0.045);
            }
            this.nextBar += BAR_SEC;
            this.barIndex++;
          }
        } catch { /* ignore */ }
      },
    };

    return {
      unlock() {
        const ac = ensure();
        if (ac && !chirped) {
          chirped = true;
          chord([N.E5, N.G5, N.C6], 0.14, "square", 0.1, 0, 0.05);
          bgm.start();
        }
      },
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        localStorage.setItem("gems-muted", muted ? "1" : "0");
        try {
          const ac = ensure();
          if (ac && master) {
            const t = ac.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, t + 0.08);
          }
        } catch { /* ignore */ }
        if (muted) bgm.stop();
        else bgm.start();
        return muted;
      },
      swap() {
        tone(140, 0.07, "triangle", 0.22, 0, 220);
        tone(280, 0.09, "square", 0.14, 0, 520);
        tone(560, 0.06, "square", 0.08, 0.03, 780);
      },
      invalid() {
        tone(160, 0.14, "square", 0.16, 0, 110);
        tone(151, 0.14, "sawtooth", 0.08, 0, 104);
      },
      match(combo) {
        const root = N.A4 * Math.pow(1.25, Math.min(combo - 1, 6));
        arp(root, 3, 0.1, "square", 0.13, 0, 0.05);
        chord([root * 1.5, root * 2], 0.12, "triangle", 0.07, 0.1);
      },
      special() {
        chord([N.C4, N.E4, N.G4, N.C5], 0.28, "sawtooth", 0.11, 0, 0.04);
        tone(90, 0.4, "square", 0.18, 0.02, 720);
        arp(N.C5, 4, 0.09, "square", 0.1, 0.12, 0.06, 1.26);
      },
      fall() {
        tone(700, 0.05, "triangle", 0.08, 0, 420);
        tone(520, 0.05, "triangle", 0.06, 0.04, 320);
      },
      levelUp() {
        arp(N.C5, 6, 0.14, "square", 0.14, 0, 0.09, 1.26);
        chord([N.C5, N.E5, N.G5, N.C6], 0.5, "triangle", 0.08, 0.45);
      },
      gameOver() {
        [N.G4, N.E4, N.C4, N.C4].forEach((f, i) => tone(f, 0.24, "square", 0.14, i * 0.2));
        chord([N.C4, N.E4, N.G4], 0.7, "triangle", 0.08, 0.8);
      },
      newGame() {
        arp(N.C4, 5, 0.11, "square", 0.13, 0, 0.08, 1.335);
        chord([N.C5, N.E5, N.G5], 0.3, "triangle", 0.08, 0.4);
      },
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
    el.className = "tile" + (spec ? " special" + (spec === SPECIAL_BOMB ? " special-bomb" : "") : "");
    el.style.background = COLORS[type];
    const glyph = spec === SPECIAL_BOMB ? "" : spec && spec.kind === "line" ? (spec.dir === "row" ? "↔" : "↕") : "";
    if (glyph) el.dataset.glyph = glyph;
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
    const spec = state.special[r][c];
    el.classList.toggle("special", !!spec);
    el.classList.toggle("special-bomb", spec === SPECIAL_BOMB);
    const glyph = spec === SPECIAL_BOMB ? "" : spec && spec.kind === "line" ? (spec.dir === "row" ? "↔" : "↕") : "";
    if (glyph) el.dataset.glyph = glyph;
    else delete el.dataset.glyph;
    el.innerHTML = `<span>${spec === SPECIAL_BOMB ? "💣" : TYPES[state.grid[r][c]]}</span>`;
  }

  function renderBoard() {
    boardEl.querySelectorAll(".score-popup").forEach((el) => el.remove());
    boardEl.innerHTML = "";
    const slots = document.createElement("div");
    slots.className = "slots";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const s = document.createElement("div");
      s.className = "slot";
      slots.appendChild(s);
    }
    boardEl.appendChild(slots);
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
    progressFill.style.width = `${Math.min(100, ((state.score % LEVEL_STEP) / LEVEL_STEP) * 100)}%`;
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
