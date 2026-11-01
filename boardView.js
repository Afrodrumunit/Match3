import { SIZE, SPECIAL_BOMB } from "./engine.js";

export function createBoardView(boardEl, getTheme, getState) {
  let tiles = [];

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

  function glyphFor(spec) {
    if (spec === SPECIAL_BOMB) return "";
    if (spec && spec.kind === "line") return spec.dir === "row" ? "↔" : "↕";
    return "";
  }

  function createTileEl(type, spec) {
    const theme = getTheme();
    const el = document.createElement("div");
    el.className = "tile" + (spec ? " special" + (spec === SPECIAL_BOMB ? " special-bomb" : "") : "");
    el.style.background = theme.colors[type];
    const glyph = glyphFor(spec);
    if (glyph) el.dataset.glyph = glyph;
    el.innerHTML = `<span>${spec === SPECIAL_BOMB ? "💣" : theme.emojis[type]}</span>`;
    boardEl.appendChild(el);
    return el;
  }

  function refreshTileFace(r, c) {
    const el = tiles[r][c];
    if (!el) return;
    const state = getState();
    const spec = state.special[r][c];
    el.classList.toggle("special", !!spec);
    el.classList.toggle("special-bomb", spec === SPECIAL_BOMB);
    const glyph = glyphFor(spec);
    if (glyph) el.dataset.glyph = glyph;
    else delete el.dataset.glyph;
    el.innerHTML = `<span>${spec === SPECIAL_BOMB ? "💣" : getTheme().emojis[state.grid[r][c]]}</span>`;
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
    const state = getState();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = createTileEl(state.grid[r][c], state.special[r][c]);
        tiles[r][c] = el;
        place(el, r, c, true);
      }
    }
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

  function swapTiles(r1, c1, r2, c2) {
    [tiles[r1][c1], tiles[r2][c2]] = [tiles[r2][c2], tiles[r1][c1]];
    place(tiles[r1][c1], r1, c1);
    place(tiles[r2][c2], r2, c2);
  }

  function popTiles(idxs) {
    for (const i of idxs) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      if (tiles[r][c]) tiles[r][c].classList.add("matched");
    }
  }

  function removeTiles(idxs) {
    for (const i of idxs) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      if (tiles[r][c]) {
        tiles[r][c].remove();
        tiles[r][c] = null;
      }
    }
  }

  function applyMoves(moved) {
    for (const mv of moved) {
      const [fr, fc] = mv.from;
      const [tr, tc] = mv.to;
      tiles[tr][tc] = tiles[fr][fc];
      tiles[fr][fc] = null;
      refreshTileFace(tr, tc);
      place(tiles[tr][tc], tr, tc);
    }
  }

  function cellFromEvent(e) {
    const el = e.target.closest(".tile");
    if (!el) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c), el };
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

  function clearHints() {
    boardEl.querySelectorAll(".tile.hint").forEach((el) => el.classList.remove("hint"));
  }

  function showHint(hint) {
    clearHints();
    hint.forEach(([r, c]) => tiles[r][c] && tiles[r][c].classList.add("hint"));
  }

  return {
    renderBoard,
    spawnTile,
    swapTiles,
    popTiles,
    removeTiles,
    applyMoves,
    refreshTileFace,
    cellFromEvent,
    popup,
    clearHints,
    showHint,
  };
}
