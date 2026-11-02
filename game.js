import {
  SIZE, SPECIAL_BOMB, LEVEL_STEP, LEVEL_BONUS_MOVES,
  findHint, createState, trySwap, isValidSwap, resolveStep, endTurn, reshuffle,
} from "./engine.js";
import { themeForLevel } from "./themes.js";
import { createSfx } from "./audio.js";
import { createBoardView } from "./boardView.js";
import { createStats } from "./stats.js";

(() => {
  "use strict";

  const SWAP_MS = 170;
  const FALL_MS = 220;
  const POP_MS = 200;
  const BLAST_MS = 260;
  const IDLE_HINT_MS = 6000;
  const SWIPE_THRESHOLD_PX = 22;

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const scoreEl = $("score");
  const movesEl = $("moves");
  const levelEl = $("level");
  const bestEl = $("best");
  const progressFill = $("progress-fill");
  const messageEl = $("message");
  const restartBtn = $("restart");
  const soundBtn = $("sound");
  const gameOverEl = $("gameover");
  const finalScoreEl = $("final-score");
  const newBestEl = $("new-best");
  const top3El = $("top3");
  const playAgainBtn = $("play-again");

  const stats = createStats(localStorage);

  let state = createState();
  let theme = themeForLevel(1);
  let best = Number(localStorage.getItem("gems-best") || 0);
  let busy = false;
  let selected = null;
  let hintTimer = null;
  let pointerStart = null;

  const sfx = createSfx(() => theme);
  const view = createBoardView(boardEl, () => theme, () => state);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  function applyTheme(t) {
    theme = t;
    for (const [k, v] of Object.entries(t.css)) document.documentElement.style.setProperty(k, v);
    sfx.setTheme(t);
    view.renderBoard();
  }

  function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (busy || state.over) return;
      const hint = findHint(state.grid);
      if (hint) view.showHint(hint);
    }, IDLE_HINT_MS);
  }

  function clearSelection() {
    if (selected) {
      selected.el.classList.remove("selected");
      selected = null;
    }
  }

  async function animateResolve() {
    let lastCount = 0;
    let combo = 0;
    let step;
    while ((step = resolveStep(state)) !== null) {
      combo = step.combo;
      lastCount = step.popped.length;
      view.popTiles(step.popped);
      for (const cr of step.created) {
        view.refreshTileFace(cr.at[0], cr.at[1]);
        view.popup(cr.at[0], cr.at[1], cr.kind === SPECIAL_BOMB ? "💣 Bomb!" : "⚡ Line!");
      }
      view.popup(Math.floor(SIZE / 2), Math.floor(SIZE / 2), `+${step.gained}`);
      updateHud();
      if (step.blasted.size > 0) sfx.special();
      else sfx.match(combo);
      await sleep(step.blasted.size > 0 ? BLAST_MS : POP_MS);
      view.removeTiles(step.popped);
      view.applyMoves(step.moved);
      for (const sp of step.spawned) view.spawnTile(sp);
      sfx.fall();
      await sleep(FALL_MS);
    }
    setMessage(combo > 1 ? `Combo x${combo}! Last match: ${lastCount} gems` : "");
  }

  async function doSwap(r1, c1, r2, c2) {
    if (busy || state.over || !isValidSwap(state, r1, c1, r2, c2)) {
      if (!busy && !state.over && isAdjacentSwap(r1, c1, r2, c2)) {
        busy = true;
        view.swapTiles(r1, c1, r2, c2);
        sfx.invalid();
        await sleep(SWAP_MS);
        view.swapTiles(r1, c1, r2, c2);
        await sleep(SWAP_MS);
        busy = false;
        scheduleHint();
      }
      return;
    }
    busy = true;
    clearSelection();
    view.clearHints();

    view.swapTiles(r1, c1, r2, c2);
    await sleep(SWAP_MS);
    const res = trySwap(state, r1, c1, r2, c2);
    if (!res.accepted) {
      view.swapTiles(r1, c1, r2, c2);
      sfx.invalid();
      await sleep(SWAP_MS);
      busy = false;
      scheduleHint();
      return;
    }
    sfx.swap();
    await animateResolve();

    const end = endTurn(state);
    if (end.levelUp) {
      setMessage(`Level ${state.level} — ${themeForLevel(state.level).name} theme! +${LEVEL_BONUS_MOVES} moves`);
      sfx.levelUp();
      applyTheme(themeForLevel(state.level));
    }
    if (end.gameOver) {
      const isNewBest = state.score > best;
      if (isNewBest) {
        best = state.score;
        localStorage.setItem("gems-best", String(best));
      }
      const top3 = stats.record(state.score);
      showGameOver(state.score, top3, isNewBest);
      sfx.gameOver();
    } else if (end.needsReshuffle) {
      setMessage("No moves left on board — reshuffling!");
      reshuffle(state);
      view.renderBoard();
      await sleep(FALL_MS);
    }
    updateHud();
    busy = false;
    scheduleHint();
  }

  function isAdjacentSwap(r1, c1, r2, c2) {
    return (
      r1 >= 0 && r1 < SIZE && c1 >= 0 && c1 < SIZE &&
      r2 >= 0 && r2 < SIZE && c2 >= 0 && c2 < SIZE &&
      Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1
    );
  }

  boardEl.addEventListener("pointerdown", (e) => {
    sfx.unlock();
    if (busy || state.over) return;
    const cell = view.cellFromEvent(e);
    if (!cell) return;
    clearTimeout(hintTimer);
    view.clearHints();
    pointerStart = { r: cell.r, c: cell.c, x: e.clientX, y: e.clientY, moved: false };
    boardEl.setPointerCapture(e.pointerId);
  });

  boardEl.addEventListener("pointermove", (e) => {
    if (!pointerStart || pointerStart.moved) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) return;
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
    const cell = view.cellFromEvent(e);
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

  function showGameOver(score, top3, isNewBest) {
    finalScoreEl.textContent = score;
    newBestEl.classList.toggle("hidden", !isNewBest);
    top3El.innerHTML = "";
    const medals = ["🥇", "🥈", "🥉"];
    top3.forEach((s, i) => {
      const li = document.createElement("li");
      if (s === score && i === top3.indexOf(score)) li.classList.add("current");
      li.innerHTML = `<span><span class="medal">${medals[i]}</span>#${i + 1}</span><span>${s}</span>`;
      top3El.appendChild(li);
    });
    gameOverEl.classList.remove("hidden");
  }

  function hideGameOver() {
    gameOverEl.classList.add("hidden");
  }

  function newGame() {
    sfx.unlock();
    sfx.newGame();
    state = createState();
    selected = null;
    setMessage("");
    hideGameOver();
    applyTheme(themeForLevel(1));
    updateHud();
    scheduleHint();
  }

  restartBtn.addEventListener("click", newGame);
  playAgainBtn.addEventListener("click", newGame);

  ["pointerdown", "touchstart", "click"].forEach((evt) =>
    window.addEventListener(evt, () => sfx.unlock(), { passive: true })
  );

  bestEl.textContent = best;
  applyTheme(theme);
  updateHud();
  scheduleHint();
})();
