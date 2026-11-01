import assert from "node:assert/strict";
import {
  SIZE, START_MOVES, LEVEL_STEP, LEVEL_BONUS_MOVES, SPECIAL_BOMB,
  mulberry32, findRuns, findMatches, createsMatch, hasPossibleMove, findHint,
  detonate, createState, trySwap, resolveStep, resolveAll, endTurn, reshuffle,
} from "../engine.js";

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("PASS", name); }
  catch (e) { console.log("FAIL", name, "-", e.message); process.exitCode = 1; }
}

const idx = (r, c) => r * SIZE + c;
const blank = () => Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => (c + 2 * r) % 6));
const spBlank = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

test("findRuns: horizontal 3", () => {
  const g = blank();
  g[0][0] = g[0][1] = g[0][2] = 1;
  const runs = findRuns(g);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].cells, [[0, 0], [0, 1], [0, 2]]);
  assert.equal(runs[0].horizontal, true);
});

test("findRuns: vertical 4", () => {
  const g = blank();
  g[1][4] = g[2][4] = g[3][4] = g[4][4] = 2;
  g[0][4] = 0; g[5][4] = 0; // break extension both ways
  const runs = findRuns(g).filter((r) => !r.horizontal);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].cells.length, 4);
});

test("findRuns: L-shape gives 2 runs, 5 unique matched cells", () => {
  const g = blank();
  g[0][0] = g[0][1] = g[0][2] = 1;
  g[1][0] = g[2][0] = 1;
  assert.equal(findRuns(g).length, 2);
  assert.equal(findMatches(g).size, 5);
});

test("findMatches: checkerboard has none", () => {
  const g = Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => (r + c) % 2));
  assert.equal(findMatches(g).size, 0);
});

test("createsMatch true/false", () => {
  const g = blank();
  g[1][0] = 1; g[2][0] = 1; g[0][0] = 3; g[0][1] = 1;
  assert.equal(createsMatch(g, 0, 0, 0, 1), true);
  const g2 = blank();
  assert.equal(createsMatch(g2, 3, 3, 3, 4), false);
});

test("hasPossibleMove true on deal, findHint non-null", () => {
  const s = createState(mulberry32(42));
  assert.equal(hasPossibleMove(s.grid), true);
  assert.ok(findHint(s.grid, mulberry32(1)));
});

test("createState: 64 tiles, no initial matches, moves=30", () => {
  const s = createState(mulberry32(7));
  assert.equal(s.grid.flat().length, 64);
  assert.equal(findMatches(s.grid).size, 0);
  assert.equal(s.moves, START_MOVES);
  assert.equal(s.over, false);
});

test("detonate: line wipes row, seeded only by specials", () => {
  const g = blank();
  const sp = spBlank();
  sp[2][2] = { kind: "line", dir: "row" };
  const d = detonate(g, sp, new Set([idx(2, 2)]));
  assert.equal(d.size, SIZE);
  assert.ok([...d].every((i) => Math.floor(i / SIZE) === 2));
  const d2 = detonate(g, sp, new Set([idx(0, 0)]));
  assert.equal(d2.size, 0);
});

test("detonate: bomb wipes its type only, chains via line", () => {
  const g = blank();
  const sp = spBlank();
  sp[0][0] = { kind: "line", dir: "row" };
  sp[0][4] = SPECIAL_BOMB;
  g[0][4] = 2;
  g[4][4] = 2; g[6][6] = 2;
  const d = detonate(g, sp, new Set([idx(0, 0)]));
  assert.ok(d.has(idx(4, 4)) && d.has(idx(6, 6)));
  assert.equal(d.size, SIZE + 2 + 10); // row 0 (8) + type-2 cells (12 total, 2 already in row 0)
});

test("trySwap rejects non-adjacent and no-match swaps, accepts valid", () => {
  const s = createState(mulberry32(99));
  assert.equal(trySwap(s, 0, 0, 2, 2).accepted, false);
  const hint = findHint(s.grid, mulberry32(5));
  const [[r1, c1], [r2, c2]] = hint;
  const res = trySwap(s, r1, c1, r2, c2);
  assert.equal(res.accepted, true);
  assert.equal(s.moves, START_MOVES - 1);
});

test("full turn: swap -> resolveAll -> board full, no holes, score>0, events sane", () => {
  const s = createState(mulberry32(123));
  const hint = findHint(s.grid, mulberry32(9));
  const [[r1, c1], [r2, c2]] = hint;
  trySwap(s, r1, c1, r2, c2);
  const events = resolveAll(s);
  assert.ok(events.length >= 1);
  assert.ok(events[0].popped.length >= 3);
  assert.ok(events[0].gained >= 30);
  assert.equal(s.score, events.reduce((a, e) => a + e.gained, 0));
  let holes = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (s.grid[r][c] === -1) holes++;
  assert.equal(holes, 0);
  assert.equal(findMatches(s.grid).size, 0);
  const end = endTurn(s);
  assert.equal(end.gameOver, false);
});

test("match-4 creates a line special that survives the pop", () => {
  const s = createState(mulberry32(2024));
  // force a horizontal 4: set row 0 cols 0-3 same type, breaking nothing else
  const t = s.grid[5][5];
  for (const c of [0, 1, 2, 3]) s.grid[0][c] = t;
  // remove accidental matches elsewhere by construction check
  s.grid[0][4] = (t + 1) % 6; s.grid[0][5] = (t + 2) % 6;
  s.grid[1][0] = (t + 3) % 6; s.grid[1][1] = (t + 4) % 6;
  const runs = findRuns(s.grid);
  const run4 = runs.find((r) => r.cells.length === 4);
  assert.ok(run4, "expected a 4-run");
  s._seeds = [[0, 0]];
  s._combo = 0;
  const step = resolveStep(s);
  assert.ok(step.created.some((c) => c.kind === "line"));
  const sp = s.special.flat().filter(Boolean);
  assert.equal(sp.length, 1);
  assert.equal(sp[0].kind, "line");
});

test("match-5 creates a bomb that survives", () => {
  const s = createState(mulberry32(77));
  const t = s.grid[5][5];
  for (const c of [0, 1, 2, 3, 4]) s.grid[3][c] = t;
  s.grid[3][5] = (t + 1) % 6; s.grid[3][6] = (t + 2) % 6; s.grid[3][7] = (t + 3) % 6;
  s.grid[2][0] = (t + 4) % 6; s.grid[4][0] = (t + 5) % 6;
  s._seeds = [[3, 2]];
  s._combo = 0;
  const step = resolveStep(s);
  assert.ok(step.created.some((c) => c.kind === SPECIAL_BOMB));
  assert.ok(s.special.flat().includes(SPECIAL_BOMB));
});

test("line special detonates when swapped into a match", () => {
  const s = createState(mulberry32(555));
  // place a line special at (0,1)
  s.special[0][1] = { kind: "line", dir: "row" };
  // build a vertical match through (0,1): (0,1),(1,1),(2,1) same type
  const t = s.grid[4][4];
  s.grid[0][1] = t; s.grid[1][1] = t; s.grid[2][1] = t;
  // ensure no other runs
  s.grid[0][0] = (t + 1) % 6; s.grid[0][2] = (t + 2) % 6; s.grid[0][3] = (t + 3) % 6;
  s.grid[1][0] = (t + 4) % 6; s.grid[1][2] = (t + 5) % 6;
  s.grid[2][0] = (t + 1) % 6; s.grid[2][2] = (t + 2) % 6;
  s._seeds = [[0, 1]];
  s._combo = 0;
  const step = resolveStep(s);
  assert.ok(step.blasted.size >= SIZE, `expected line blast >= ${SIZE}, got ${step.blasted.size}`);
});

test("level up grants bonus moves", () => {
  const s = createState(mulberry32(3));
  s.score = LEVEL_STEP - 10;
  s.moves = 5;
  const hint = findHint(s.grid, mulberry32(11));
  const [[r1, c1], [r2, c2]] = hint;
  trySwap(s, r1, c1, r2, c2);
  resolveAll(s);
  const end = endTurn(s);
  assert.equal(end.levelUp, true);
  assert.equal(s.level, 2);
  assert.equal(s.moves, 5 - 1 + LEVEL_BONUS_MOVES);
});

test("game over when moves hit 0", () => {
  const s = createState(mulberry32(8));
  s.moves = 1;
  const hint = findHint(s.grid, mulberry32(13));
  const [[r1, c1], [r2, c2]] = hint;
  trySwap(s, r1, c1, r2, c2);
  resolveAll(s);
  const end = endTurn(s);
  assert.equal(end.gameOver, true);
  assert.equal(s.over, true);
  assert.equal(trySwap(s, r1, c1, r2, c2).accepted, false);
});

test("reshuffle removes matches and keeps a possible move", () => {
  const s = createState(mulberry32(21));
  reshuffle(s);
  assert.equal(findMatches(s.grid).size, 0);
  assert.equal(hasPossibleMove(s.grid), true);
});

test("deterministic with seeded rng: same seed same board", () => {
  const a = createState(mulberry32(1));
  const b = createState(mulberry32(1));
  assert.deepEqual(a.grid, b.grid);
});

test("50 random games: every accepted turn refills to full board", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed * 1000);
    const s = createState(rng);
    for (let turn = 0; turn < 10 && !s.over; turn++) {
      const hint = findHint(s.grid, rng);
      if (!hint) break;
      const [[r1, c1], [r2, c2]] = hint;
      const res = trySwap(s, r1, c1, r2, c2);
      assert.equal(res.accepted, true, `seed ${seed} turn ${turn}: hint swap should be accepted`);
      resolveAll(s);
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        assert.notEqual(s.grid[r][c], -1, `seed ${seed} turn ${turn}: hole at ${r},${c}`);
      }
      const end = endTurn(s);
      if (end.needsReshuffle) reshuffle(s);
    }
  }
});

console.log(`\n${pass} tests passed${process.exitCode ? " (with failures)" : ""}`);
