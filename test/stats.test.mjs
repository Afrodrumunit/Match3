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

t("record sorts descending and keeps top 3", () => {
  const st = createStats(memStorage());
  st.record(100);
  st.record(300);
  st.record(200);
  st.record(50);
  st.record(400);
  assert.deepEqual(st.top3(), [400, 300, 200]);
});

t("ties kept, still max 3", () => {
  const st = createStats(memStorage());
  st.record(10); st.record(10); st.record(10); st.record(10);
  assert.deepEqual(st.top3(), [10, 10, 10]);
});

t("zero/negative/NaN ignored", () => {
  const st = createStats(memStorage());
  st.record(0); st.record(-5); st.record(NaN); st.record(42);
  assert.deepEqual(st.top3(), [42]);
});

t("corrupt JSON -> treated as empty, recovers", () => {
  const storage = memStorage();
  storage.setItem("gems-top3", "{not json");
  const st = createStats(storage);
  assert.deepEqual(st.top3(), []);
  st.record(7);
  assert.deepEqual(st.top3(), [7]);
});

t("non-array JSON -> empty", () => {
  const storage = memStorage();
  storage.setItem("gems-top3", '{"a":1}');
  assert.deepEqual(createStats(storage).top3(), []);
});

t("persists across instances (same storage)", () => {
  const storage = memStorage();
  createStats(storage).record(99);
  assert.deepEqual(createStats(storage).top3(), [99]);
});

console.log(`\n${pass} tests passed${process.exitCode ? " (with failures)" : ""}`);
