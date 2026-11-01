(() => {
  "use strict";

  const SIZE = 8;
  const TYPES = ["💎", "🔥", "🌊", "🍀", "⭐", "💜"];
  const COLORS = ["#4fc3f7", "#ff8a65", "#4dd0e1", "#aed581", "#ffd54f", "#ba68c8"];
  const START_MOVES = 30;
  const SWAP_MS = 170;
  const FALL_MS = 220;
  const POP_MS = 200;
  const IDLE_HINT_MS = 6000;

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
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
      fall() { tone(700, 0.06, "triangle", 0.1, 0, 350); },
      gameOver() {
        [523, 415, 330, 262].forEach((f, i) => tone(f, 0.22, "square", 0.16, i * 0.18));
      },
      newGame() { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.12, "square", 0.16, i * 0.08)); },
    };
  })();

  ["pointerdown", "touchstart", "click"].forEach((evt) =>
    window.addEventListener(evt, () => sfx.unlock(), { passive: true })
  );

  let grid = [];
  let tiles = [];
  let score = 0;
  let moves = START_MOVES;
  let best = Number(localStorage.getItem("gems-best") || 0);
  let busy = false;
  let selected = null;
  let gameOver = false;
  let hintTimer = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function randType() {
    return Math.floor(Math.random() * TYPES.length);
  }

  function typeAt(r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return grid[r][c];
  }

  function findMatches() {
    const matched = new Set();
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        if (c < SIZE && typeAt(r, c) !== -1 && typeAt(r, c) === typeAt(r, c - 1)) {
          run++;
        } else {
          if (run >= 3) for (let k = 0; k < run; k++) matched.add(r * SIZE + (c - run + k));
          run = 1;
        }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        if (r < SIZE && typeAt(r, c) !== -1 && typeAt(r, c) === typeAt(r - 1, c)) {
          run++;
        } else {
          if (run >= 3) for (let k = 0; k < run; k++) matched.add((r - run + k) * SIZE + c);
          run = 1;
        }
      }
    }
    return matched;
  }

  function createsMatch(r1, c1, r2, c2) {
    [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
    const ok = findMatches().size > 0;
    [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
    return ok;
  }

  function hasPossibleMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && createsMatch(r, c, r, c + 1)) return true;
        if (r + 1 < SIZE && createsMatch(r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  function findHint() {
    const options = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && createsMatch(r, c, r, c + 1)) options.push([[r, c], [r, c + 1]]);
        if (r + 1 < SIZE && createsMatch(r, c, r + 1, c)) options.push([[r, c], [r + 1, c]]);
      }
    }
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  function makeTile(r, c, type) {
    const el = document.createElement("div");
    el.className = "tile";
    el.style.background = COLORS[type];
    el.innerHTML = `<span>${TYPES[type]}</span>`;
    el.dataset.r = r;
    el.dataset.c = c;
    boardEl.appendChild(el);
    tiles[r][c] = el;
    place(el, r, c, true);
    return el;
  }

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

  function newBoard() {
    boardEl.innerHTML = "";
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    do {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          let t;
          do {
            t = randType();
          } while (
            (c >= 2 && typeAt(r, c - 1) === t && typeAt(r, c - 2) === t) ||
            (r >= 2 && typeAt(r - 1, c) === t && typeAt(r - 2, c) === t)
          );
          grid[r][c] = t;
        }
      }
    } while (!hasPossibleMove());
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        makeTile(r, c, grid[r][c]);
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = score;
    movesEl.textContent = moves;
    bestEl.textContent = best;
  }

  function setMessage(text) {
    messageEl.textContent = text;
  }

  function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (busy || gameOver) return;
      const hint = findHint();
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

  async function trySwap(r1, c1, r2, c2) {
    if (busy || gameOver) return;
    if (r1 < 0 || r1 >= SIZE || c1 < 0 || c1 >= SIZE || r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) return;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
    busy = true;
    clearSelection();
    clearHints();

    [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
    [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
    place(tiles[r1][c1], r1, c1);
    place(tiles[r2][c2], r2, c2);
    sfx.swap();
    await sleep(SWAP_MS);

    if (findMatches().size === 0) {
      sfx.invalid();
      [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
      [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
      place(tiles[r1][c1], r1, c1);
      place(tiles[r2][c2], r2, c2);
      await sleep(SWAP_MS);
      busy = false;
      scheduleHint();
      return;
    }

    moves--;
    updateHud();
    await resolveBoard();
    busy = false;

    if (moves <= 0) {
      gameOver = true;
      if (score > best) {
        best = score;
        localStorage.setItem("gems-best", String(best));
        updateHud();
      }
      setMessage(`Game over! Final score: ${score}. Tap New Game to play again.`);
      sfx.gameOver();
    } else if (!hasPossibleMove()) {
      setMessage("No moves left on board — reshuffling!");
      await reshuffle();
    }
    scheduleHint();
  }

  async function resolveBoard() {
    let combo = 0;
    let lastCount = 0;
    while (true) {
      const matched = findMatches();
      if (matched.size === 0) break;
      combo++;
      lastCount = matched.size;
      score += matched.size * 10 * combo;
      updateHud();
      sfx.match(combo);
      matched.forEach((idx) => {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        if (tiles[r][c]) tiles[r][c].classList.add("matched");
      });
      await sleep(POP_MS);
      matched.forEach((idx) => {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        if (tiles[r][c]) {
          tiles[r][c].remove();
          tiles[r][c] = null;
          grid[r][c] = -1;
        }
      });
      collapseAndRefill();
      sfx.fall();
      await sleep(FALL_MS);
    }
    if (combo > 1) setMessage(`Combo x${combo}! Last match: ${lastCount} gems`);
  }

  function collapseAndRefill() {
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        if (grid[r][c] !== -1) {
          if (write !== r) {
            grid[write][c] = grid[r][c];
            grid[r][c] = -1;
            tiles[write][c] = tiles[r][c];
            tiles[r][c] = null;
            place(tiles[write][c], write, c);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const t = randType();
        grid[r][c] = t;
        const el = makeTile(r, c, t);
        el.style.transition = "none";
        el.style.transform = `translate(calc(${c} * 100% + ${c} * var(--gap)), calc(${-1 - (write - r)} * 100% + ${-1 - (write - r)} * var(--gap)))`;
        void el.offsetWidth;
        el.style.transition = "";
        place(el, r, c);
      }
    }
  }

  async function reshuffle() {
    busy = true;
    const flat = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) flat.push(grid[r][c]);
    let attempts = 0;
    do {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let k = 0;
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) grid[r][c] = flat[k++];
      attempts++;
    } while ((findMatches().size > 0 || !hasPossibleMove()) && attempts < 200);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (tiles[r][c]) tiles[r][c].remove();
        makeTile(r, c, grid[r][c]);
      }
    }
    await sleep(FALL_MS);
    busy = false;
  }

  function cellFromEvent(e) {
    const el = e.target.closest(".tile");
    if (!el) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c), el };
  }

  let pointerStart = null;

  boardEl.addEventListener("pointerdown", (e) => {
    sfx.unlock();
    if (busy || gameOver) return;
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
    trySwap(pointerStart.r, pointerStart.c, r2, c2);
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
      trySwap(sr, sc, cell.r, cell.c);
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
    score = 0;
    moves = START_MOVES;
    gameOver = false;
    busy = false;
    selected = null;
    setMessage("");
    updateHud();
    newBoard();
    scheduleHint();
  });

  bestEl.textContent = best;
  updateHud();
  newBoard();
  scheduleHint();
})();
