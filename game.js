(() => {
  "use strict";

  const SIZE = 8;
  const TYPES = ["💎", "🔥", "🌊", "🍀", "⭐", "💜"];
  const COLORS = ["#4fc3f7", "#ff8a65", "#4dd0e1", "#aed581", "#ffd54f", "#ba68c8"];
  const SPECIAL_LINE = "line";
  const SPECIAL_BOMB = "bomb";
  const START_MOVES = 30;
  const LEVEL_STEP = 500;
  const LEVEL_BONUS_MOVES = 10;
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

  let grid = [];
  let special = [];
  let tiles = [];
  let score = 0;
  let moves = START_MOVES;
  let level = 1;
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

  function findRuns() {
    const runs = [];
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        if (c < SIZE && typeAt(r, c) !== -1 && typeAt(r, c) === typeAt(r, c - 1)) run++;
        else {
          if (run >= 3) runs.push({ cells: range(r, c - run, c).map((cc) => [r, cc]), horizontal: true });
          run = 1;
        }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        if (r < SIZE && typeAt(r, c) !== -1 && typeAt(r, c) === typeAt(r - 1, c)) run++;
        else {
          if (run >= 3) runs.push({ cells: range(r - run, r).map((rr) => [rr, c]), horizontal: false });
          run = 1;
        }
      }
    }
    return runs;
  }

  function range(a, b) {
    const out = [];
    for (let i = a; i < b; i++) out.push(i);
    return out;
  }

  function findMatches() {
    const matched = new Set();
    for (const run of findRuns()) {
      for (const [r, c] of run.cells) matched.add(r * SIZE + c);
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

  function makeTile(r, c, type, spec) {
    const el = document.createElement("div");
    el.className = "tile" + (spec ? " special" : "");
    el.style.background = COLORS[type];
    el.innerHTML = `<span>${spec === SPECIAL_BOMB ? "💣" : TYPES[type]}</span>`;
    el.dataset.r = r;
    el.dataset.c = c;
    boardEl.appendChild(el);
    tiles[r][c] = el;
    place(el, r, c, true);
    return el;
  }

  function spawnTile(r, c, type, spec, fromRow) {
    const el = makeTile(fromRow !== undefined ? fromRow : r, c, type, spec);
    if (fromRow !== undefined) {
      el.style.transition = "none";
      const fr = fromRow;
      el.style.transform = `translate(calc(${c} * 100% + ${c} * var(--gap)), calc(${fr} * 100% + ${fr} * var(--gap)))`;
      void el.offsetWidth;
      el.style.transition = "";
    }
    place(el, r, c);
    return el;
  }

  function newBoard() {
    boardEl.querySelectorAll(".score-popup").forEach((el) => el.remove());
    boardEl.innerHTML = "";
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    special = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
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
        makeTile(r, c, grid[r][c], null);
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = score;
    movesEl.textContent = moves;
    levelEl.textContent = level;
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
    [special[r1][c1], special[r2][c2]] = [special[r2][c2], special[r1][c1]];
    [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
    refreshTileFace(r1, c1);
    refreshTileFace(r2, c2);
    place(tiles[r1][c1], r1, c1);
    place(tiles[r2][c2], r2, c2);
    sfx.swap();
    await sleep(SWAP_MS);

    const runs = findRuns();
    if (runs.length === 0) {
      [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
      [special[r1][c1], special[r2][c2]] = [special[r2][c2], special[r1][c1]];
      [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
      refreshTileFace(r1, c1);
      refreshTileFace(r2, c2);
      place(tiles[r1][c1], r1, c1);
      place(tiles[r2][c2], r2, c2);
      sfx.invalid();
      await sleep(SWAP_MS);
      busy = false;
      scheduleHint();
      return;
    }

    moves--;
    updateHud();
    await resolveBoard(runs, [[r1, c1], [r2, c2]]);
    busy = false;

    const newLevel = Math.floor(score / LEVEL_STEP) + 1;
    if (newLevel > level) {
      level = newLevel;
      moves += LEVEL_BONUS_MOVES;
      setMessage(`Level ${level}! +${LEVEL_BONUS_MOVES} moves`);
      sfx.levelUp();
      updateHud();
    }

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

  function refreshTileFace(r, c) {
    const el = tiles[r][c];
    if (!el) return;
    el.classList.toggle("special", !!special[r][c]);
    el.innerHTML = `<span>${special[r][c] === SPECIAL_BOMB ? "💣" : TYPES[grid[r][c]]}</span>`;
  }

  function collectRunSets(runs) {
    const matched = new Set();
    const createdSpecials = [];
    for (const run of runs) {
      for (const [r, c] of run.cells) matched.add(r * SIZE + c);
      if (run.cells.length >= 5) {
        createdSpecials.push({ at: run.cells[2], kind: SPECIAL_BOMB });
      } else if (run.cells.length === 4) {
        const horizontal = run.horizontal;
        const anchor = run.cells[0];
        createdSpecials.push({ at: horizontal ? anchor : run.cells[1], kind: SPECIAL_LINE, dir: horizontal ? "row" : "col" });
      }
    }
    return { matched, createdSpecials };
  }

  function expandSpecials() {
    const doomed = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const s = special[r][c];
        if (!s) continue;
        if (s === SPECIAL_BOMB) {
          const type = grid[r][c];
          for (let rr = 0; rr < SIZE; rr++) {
            for (let cc = 0; cc < SIZE; cc++) {
              if (grid[rr][cc] === type) doomed.add(rr * SIZE + cc);
            }
          }
        } else if (s.kind === SPECIAL_LINE) {
          if (s.dir === "row") {
            for (let cc = 0; cc < SIZE; cc++) doomed.add(r * SIZE + cc);
          } else {
            for (let rr = 0; rr < SIZE; rr++) doomed.add(rr * SIZE + c);
          }
        }
      }
    }
    return doomed;
  }

  async function resolveBoard(initialRuns, swappedCells) {
    let combo = 0;
    let lastCount = 0;
    let runs = initialRuns;
    while (runs.length > 0) {
      const { matched, createdSpecials } = collectRunSets(runs);
      combo++;
      lastCount = matched.size;

      const activated = [];
      for (const [r, c] of swappedCells || []) {
        const s = special[r][c];
        if (s && !activated.includes(r * SIZE + c)) activated.push(r * SIZE + c);
      }
      const blasted = expandSpecials();
      for (const idx of blasted) matched.add(idx);

      for (const cs of createdSpecials) {
        const [r, c] = cs.at;
        if (grid[r][c] !== -1) {
          special[r][c] = cs.kind === SPECIAL_BOMB ? SPECIAL_BOMB : { kind: SPECIAL_LINE, dir: cs.dir };
          refreshTileFace(r, c);
          popup(r, c, cs.kind === SPECIAL_BOMB ? "💣 Bomb!" : "⚡ Line!");
        }
      }

      const gained = matched.size * 10 * combo;
      score += gained;
      const midR = Math.floor(SIZE / 2);
      const midC = Math.floor(SIZE / 2);
      popup(midR, midC, `+${gained}`);
      updateHud();
      if (blasted.size > 0) sfx.special();
      else sfx.match(combo);

      matched.forEach((idx) => {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        if (tiles[r][c]) tiles[r][c].classList.add("matched");
      });
      await sleep(blasted.size > 0 ? BLAST_MS : POP_MS);
      matched.forEach((idx) => {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        if (tiles[r][c]) {
          tiles[r][c].remove();
          tiles[r][c] = null;
          grid[r][c] = -1;
          special[r][c] = null;
        }
      });
      collapseAndRefill();
      sfx.fall();
      await sleep(FALL_MS);
      runs = findRuns();
      swappedCells = null;
    }
    if (combo > 1) setMessage(`Combo x${combo}! Last match: ${lastCount} gems`);
    else setMessage("");
  }

  function collapseAndRefill() {
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        if (grid[r][c] !== -1) {
          if (write !== r) {
            grid[write][c] = grid[r][c];
            special[write][c] = special[r][c];
            special[r][c] = null;
            grid[r][c] = -1;
            tiles[write][c] = tiles[r][c];
            tiles[r][c] = null;
            refreshTileFace(write, c);
            place(tiles[write][c], write, c);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const t = randType();
        grid[r][c] = t;
        special[r][c] = null;
        spawnTile(r, c, t, null, -1 - (write - r));
      }
    }
  }

  async function reshuffle() {
    busy = true;
    const flat = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        flat.push({ t: grid[r][c], s: special[r][c] });
      }
    }
    let attempts = 0;
    do {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let k = 0;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          grid[r][c] = flat[k].t;
          special[r][c] = flat[k].s;
          k++;
        }
      }
      attempts++;
    } while ((findMatches().size > 0 || !hasPossibleMove()) && attempts < 200);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (tiles[r][c]) tiles[r][c].remove();
        makeTile(r, c, grid[r][c], special[r][c]);
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
    level = 1;
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
