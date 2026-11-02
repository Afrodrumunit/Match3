import assert from "node:assert/strict";
import { createStats } from "../stats.js";

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { console.log("FAIL", name, "-", e.message); process.exitCode = 1; } };

function memStorage() {
  const s = {};
  return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, _s: s };
}

t("empty storage -> empty top3", () => {
  assert.deepEqual(createStats(memStorage()).top3(), []);
});

t("record sorts by score desc, keeps top 3", () => {
  const st = createStats(memStorage());
  st.record(100, 20);
  st.record(300, 24);
  st.record(200, 22);
  st.record(50, 10);
  st.record(400, 25);
  assert.deepEqual(st.top3(), [
    { score: 400, moves: 25 },
    { score: 300, moves: 24 },
    { score: 200, moves: 22 },
  ]);
});

t("score ties broken by fewer moves", () => {
  const st = createStats(memStorage());
  st.record(300, 24);
  st.record(300, 20);
  st.record(300, 22);
  assert.deepEqual(st.top3().map((x) => x.moves), [20, 22, 24]);
});

t("zero/negative/NaN score ignored", () => {
  const st = createStats(memStorage());
  st.record(0, 5); st.record(-5, 5); st.record(NaN, 5); st.record(42, 9);
  assert.deepEqual(st.top3(), [{ score: 42, moves: 9 }]);
});

t("moves floored to int, clamped >= 0", () => {
  const st = createStats(memStorage());
  st.record(10, 7.9);
  st.record(20, -3);
  assert.deepEqual(st.top3(), [{ score: 20, moves: 0 }, { score: 10, moves: 7 }]);
});

t("corrupt JSON -> treated as empty, recovers", () => {
  const storage = memStorage();
  storage.setItem("gems-top3", "{not json");
  const st = createStats(storage);
  assert.deepEqual(st.top3(), []);
  st.record(7, 3);
  assert.deepEqual(st.top3(), [{ score: 7, moves: 3 }]);
});

t("legacy number-only entries filtered out, mixed entries valid kept", () => {
  const storage = memStorage();
  storage.setItem("gems-top3", JSON.stringify([100, { score: 250, moves: 20 }, { score: "x" }, null]));
  const st = createStats(storage);
  assert.deepEqual(st.top3(), [{ score: 250, moves: 20 }]);
});

t("persists across instances", () => {
  const storage = memStorage();
  createStats(storage).record(99, 11);
  assert.deepEqual(createStats(storage).top3(), [{ score: 99, moves: 11 }]);
});

console.log(`\n${pass} tests passed${process.exitCode ? " (with failures)" : ""}`);
