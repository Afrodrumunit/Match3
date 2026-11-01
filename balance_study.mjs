import {
  SIZE, START_MOVES, LEVEL_STEP, LEVEL_BONUS_MOVES,
  mulberry32, findHint, findRuns, createState, trySwap, resolveAll, endTurn, reshuffle,
} from "../engine.js";

// ---- policies ----
function allMoves(grid) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE) moves.push([[r, c], [r, c + 1]]);
      if (r + 1 < SIZE) moves.push([[r, c], [r + 1, c]]);
    }
  }
  return moves;
}
function validMoves(state) {
  return allMoves(state.grid).filter(([[r1, c1], [r2, c2]]) => {
    [state.grid[r1][c1], state.grid[r2][c2]] = [state.grid[r2][c2], state.grid[r1][c1]];
    const ok = findRuns(state.grid).length > 0;
    [state.grid[r1][c1], state.grid[r2][c2]] = [state.grid[r2][c2], state.grid[r1][c1]];
    return ok;
  });
}
function runOf(state, [[r1, c1], [r2, c2]]) {
  [state.grid[r1][c1], state.grid[r2][c2]] = [state.grid[r2][c2], state.grid[r1][c1]];
  let max = 0;
  for (const run of findRuns(state.grid)) max = Math.max(max, run.cells.length);
  [state.grid[r1][c1], state.grid[r2][c2]] = [state.grid[r2][c2], state.grid[r1][c1]];
  return max;
}

const policies = {
  random: (state, rng) => {
    const vm = validMoves(state);
    return vm[Math.floor(rng() * vm.length)];
  },
  greedy: (state) => {
    const vm = validMoves(state);
    let best = vm[0], bestRun = 0;
    for (const m of vm) {
      const r = runOf(state, m);
      if (r > bestRun) { bestRun = r; best = m; }
    }
    return best;
  },
};

function playGame(seed, policy) {
  const rng = mulberry32(seed);
  const s = createState(rng);
  let turns = 0;
  let totalPopped = 0;
  let maxCombo = 0;
  let specialsCreated = 0;
  let specialsUsed = 0;
  const scorePerTurn = [];
  while (!s.over && turns < 2000) {
    let move = policy(s, rng);
    if (!move) { reshuffle(s); continue; }
    const res = trySwap(s, move[0][0], move[0][1], move[1][0], move[1][1]);
    if (!res.accepted) continue;
    const before = s.score;
    const events = resolveAll(s);
    turns++;
    const gained = s.score - before;
    scorePerTurn.push(gained);
    totalPopped += events.reduce((a, e) => a + e.popped.length, 0);
    maxCombo = Math.max(maxCombo, ...events.map((e) => e.combo));
    specialsCreated += events.reduce((a, e) => a + e.created.length, 0);
    specialsUsed += events.reduce((a, e) => a + e.blasted.size, 0);
    const end = endTurn(s);
    if (end.needsReshuffle) reshuffle(s);
  }
  return {
    turns, score: s.score, level: s.level, over: s.over,
    evPerMove: s.score / Math.max(turns, 1),
    avgPoppedPerTurn: totalPopped / Math.max(turns, 1),
    maxCombo, specialsCreated, specialsUsed,
    movesRemaining: s.moves,
  };
}

const N = 300;
for (const [name, policy] of Object.entries(policies)) {
  const results = [];
  for (let i = 0; i < N; i++) results.push(playGame(100000 + i * 7 + name.length, policy));
  const avg = (k) => results.reduce((a, r) => a + r[k], 0) / N;
  const sorted = [...results].map((r) => r.score).sort((a, b) => a - b);
  console.log(`\n=== policy: ${name} (${N} games) ===`);
  console.log(`score      mean=${avg("score").toFixed(0)}  median=${sorted[N >> 1]}  p90=${sorted[Math.floor(N * 0.9)]}  max=${sorted[N - 1]}`);
  console.log(`turns      mean=${avg("turns").toFixed(1)}  max=${Math.max(...results.map(r => r.turns))}  games hitting 2000-turn cap=${results.filter(r => r.turns >= 2000).length}`);
  console.log(`EV/move    mean=${avg("evPerMove").toFixed(2)}`);
  console.log(`gems popped/turn=${avg("avgPoppedPerTurn").toFixed(2)}  maxCombo=${Math.max(...results.map(r => r.maxCombo))}  specials created/game=${avg("specialsCreated").toFixed(2)}  blasted cells/game=${avg("specialsUsed").toFixed(1)}`);
  console.log(`final level mean=${avg("level").toFixed(1)}`);
  const selfSustain = avg("evPerMove") * LEVEL_BONUS_MOVES / LEVEL_STEP;
  console.log(`self-sustain ratio: EV/move * bonus moves / level step = ${selfSustain.toFixed(3)}  (>1 means levels award more moves than they cost => potentially endless)`);
}

// theoretical: random board, probability a random swap creates a match
const rng = mulberry32(1);
let hits = 0, tries = 0;
for (let i = 0; i < 2000; i++) {
  const s = createState(mulberry32(500000 + i));
  const vm = validMoves(s);
  tries += vm.length;
}
console.log(`\nvalid moves per fresh board (avg over 2000 boards): ${(tries / 2000).toFixed(1)} of 112 possible swaps`);
