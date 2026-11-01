export const SIZE = 8;
export const TYPE_COUNT = 6;
export const START_MOVES = 25;
export const LEVEL_STEP = 600;
export const LEVEL_BONUS_MOVES = 4;
export const SCORE_PER_GEM = 10;

export const SPECIAL_BOMB = "bomb";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (r, c) => r * SIZE + c;
const rowOf = (i) => Math.floor(i / SIZE);
const colOf = (i) => i % SIZE;

function typeAt(grid, r, c) {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
  return grid[r][c];
}

export function findRuns(grid) {
  const runs = [];
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c <= SIZE; c++) {
      if (c < SIZE && typeAt(grid, r, c) !== -1 && typeAt(grid, r, c) === typeAt(grid, r, c - 1)) run++;
      else {
        if (run >= 3) runs.push({ cells: range(c - run, c).map((cc) => [r, cc]), horizontal: true });
        run = 1;
      }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r <= SIZE; r++) {
      if (r < SIZE && typeAt(grid, r, c) !== -1 && typeAt(grid, r, c) === typeAt(grid, r - 1, c)) run++;
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

export function findMatches(grid) {
  const matched = new Set();
  for (const run of findRuns(grid)) {
    for (const [r, c] of run.cells) matched.add(idx(r, c));
  }
  return matched;
}

export function createsMatch(grid, r1, c1, r2, c2) {
  [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
  const ok = findMatches(grid).size > 0;
  [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
  return ok;
}

export function hasPossibleMove(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE && createsMatch(grid, r, c, r, c + 1)) return true;
      if (r + 1 < SIZE && createsMatch(grid, r, c, r + 1, c)) return true;
    }
  }
  return false;
}

export function findHint(grid, rng = Math.random) {
  const options = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE && createsMatch(grid, r, c, r, c + 1)) options.push([[r, c], [r, c + 1]]);
      if (r + 1 < SIZE && createsMatch(grid, r, c, r + 1, c)) options.push([[r, c], [r + 1, c]]);
    }
  }
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)];
}

function collectRunSets(runs) {
  const matched = new Set();
  const createdSpecials = [];
  for (const run of runs) {
    for (const [r, c] of run.cells) matched.add(idx(r, c));
    if (run.cells.length >= 5) {
      createdSpecials.push({ at: run.cells[2], kind: SPECIAL_BOMB });
    } else if (run.cells.length === 4) {
      createdSpecials.push({
        at: run.horizontal ? run.cells[0] : run.cells[1],
        kind: "line",
        dir: run.horizontal ? "row" : "col",
      });
    }
  }
  return { matched, createdSpecials };
}

export function detonate(grid, special, seeds) {
  const doomed = new Set();
  const queue = [];
  for (const i of seeds) {
    if (special[rowOf(i)][colOf(i)]) queue.push(i);
  }
  const seen = new Set();
  while (queue.length > 0) {
    const i = queue.pop();
    if (seen.has(i)) continue;
    seen.add(i);
    const r = rowOf(i);
    const c = colOf(i);
    const s = special[r][c];
    if (s === SPECIAL_BOMB) {
      const type = grid[r][c];
      for (let rr = 0; rr < SIZE; rr++) {
        for (let cc = 0; cc < SIZE; cc++) {
          if (grid[rr][cc] === type) {
            doomed.add(idx(rr, cc));
            if (special[rr][cc]) queue.push(idx(rr, cc));
          }
        }
      }
    } else if (s && s.kind === "line") {
      if (s.dir === "row") {
        for (let cc = 0; cc < SIZE; cc++) {
          doomed.add(idx(r, cc));
          if (special[r][cc]) queue.push(idx(r, cc));
        }
      } else {
        for (let rr = 0; rr < SIZE; rr++) {
          doomed.add(idx(rr, c));
          if (special[rr][c]) queue.push(idx(rr, c));
        }
      }
    }
  }
  return doomed;
}

export function createState(rng = Math.random) {
  const state = {
    grid: [],
    special: [],
    score: 0,
    moves: START_MOVES,
    level: 1,
    over: false,
    rng,
    _combo: 0,
    _seeds: null,
  };
  deal(state);
  return state;
}

function deal(state) {
  const { rng } = state;
  let attempts = 0;
  do {
    state.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    state.special = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        let t;
        do {
          t = Math.floor(rng() * TYPE_COUNT);
        } while (
          (c >= 2 && typeAt(state.grid, r, c - 1) === t && typeAt(state.grid, r, c - 2) === t) ||
          (r >= 2 && typeAt(state.grid, r - 1, c) === t && typeAt(state.grid, r - 2, c) === t)
        );
        state.grid[r][c] = t;
      }
    }
    attempts++;
  } while (!hasPossibleMove(state.grid) && attempts < 50);
}

export function isAdjacent(r1, c1, r2, c2) {
  return (
    r1 >= 0 && r1 < SIZE && c1 >= 0 && c1 < SIZE &&
    r2 >= 0 && r2 < SIZE && c2 >= 0 && c2 < SIZE &&
    Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1
  );
}

export function isValidSwap(state, r1, c1, r2, c2) {
  if (state.over || !isAdjacent(r1, c1, r2, c2)) return false;
  return createsMatch(state.grid, r1, c1, r2, c2);
}

export function trySwap(state, r1, c1, r2, c2) {
  if (!isValidSwap(state, r1, c1, r2, c2)) return { accepted: false };
  [state.grid[r1][c1], state.grid[r2][c2]] = [state.grid[r2][c2], state.grid[r1][c1]];
  [state.special[r1][c1], state.special[r2][c2]] = [state.special[r2][c2], state.special[r1][c1]];
  state.moves--;
  state._combo = 0;
  state._seeds = [[r1, c1], [r2, c2]];
  return { accepted: true };
}

export function resolveStep(state) {
  const runs = findRuns(state.grid);
  if (runs.length === 0) {
    state._seeds = null;
    return null;
  }
  state._combo++;
  const { matched, createdSpecials } = collectRunSets(runs);

  const seeds = new Set(matched);
  for (const [r, c] of state._seeds || []) seeds.add(idx(r, c));
  state._seeds = null;

  const blasted = detonate(state.grid, state.special, seeds);
  for (const i of blasted) matched.add(i);

  const created = [];
  for (const cs of createdSpecials) {
    const [r, c] = cs.at;
    const i = idx(r, c);
    if (!blasted.has(i) && state.grid[r][c] !== -1) {
      matched.delete(i);
      state.special[r][c] = cs.kind === SPECIAL_BOMB ? SPECIAL_BOMB : { kind: "line", dir: cs.dir };
      created.push({ at: [r, c], kind: cs.kind, dir: cs.dir || null });
    }
  }

  const gained = matched.size * SCORE_PER_GEM * state._combo;
  state.score += gained;

  const popped = [...matched];
  for (const i of popped) {
    state.grid[rowOf(i)][colOf(i)] = -1;
    state.special[rowOf(i)][colOf(i)] = null;
  }

  const { moved, spawned } = collapseAndRefill(state);

  return { popped, blasted, created, gained, combo: state._combo, moved, spawned };
}

function collapseAndRefill(state) {
  const moved = [];
  const spawned = [];
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (state.grid[r][c] !== -1) {
        if (write !== r) {
          state.grid[write][c] = state.grid[r][c];
          state.special[write][c] = state.special[r][c];
          state.special[r][c] = null;
          state.grid[r][c] = -1;
          moved.push({ from: [r, c], to: [write, c] });
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const t = Math.floor(state.rng() * TYPE_COUNT);
      state.grid[r][c] = t;
      state.special[r][c] = null;
      spawned.push({ r, c, type: t, fromRow: -1 - (write - r) });
    }
  }
  return { moved, spawned };
}

export function resolveAll(state) {
  const events = [];
  let step;
  while ((step = resolveStep(state)) !== null) events.push(step);
  return events;
}

export function endTurn(state) {
  const newLevel = Math.floor(state.score / LEVEL_STEP) + 1;
  const levelUp = newLevel > state.level;
  if (levelUp) {
    state.level = newLevel;
    state.moves += LEVEL_BONUS_MOVES;
  }
  const gameOver = state.moves <= 0;
  if (gameOver) state.over = true;
  const needsReshuffle = !gameOver && !hasPossibleMove(state.grid);
  return { levelUp, gameOver, needsReshuffle };
}

export function reshuffle(state) {
  const flat = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) flat.push({ t: state.grid[r][c], s: state.special[r][c] });
  }
  let attempts = 0;
  do {
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(state.rng() * (i + 1));
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    let k = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        state.grid[r][c] = flat[k].t;
        state.special[r][c] = flat[k].s;
        k++;
      }
    }
    attempts++;
  } while ((findMatches(state.grid).size > 0 || !hasPossibleMove(state.grid)) && attempts < 200);
  return state;
}
