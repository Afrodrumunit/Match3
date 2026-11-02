import assert from "node:assert/strict";
import { THEMES, N, DEFAULT_BASS_PATCH, ALL_BASS_PATCHES, themeForLevel, bassPatchForLevel } from "../themes.js";

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { console.log("FAIL", name, "-", e.message); process.exitCode = 1; } };

t("4 themes defined", () => assert.equal(THEMES.length, 4));
t("each theme: 6 emojis, 6 colors, 8 css vars, bgm", () => {
  for (const th of THEMES) {
    assert.equal(th.emojis.length, 6);
    assert.equal(th.colors.length, 6);
    assert.ok(Object.keys(th.css).length >= 6);
    assert.ok(th.bgm.chords.length >= 8);
    assert.ok(th.bgm.patterns.length >= 4);
    assert.ok(th.bgm.barSec > 0 && th.bgm.filterBase > 0);
  }
});
t("every chord note resolves to a frequency", () => {
  for (const th of THEMES) for (const chord of th.bgm.chords) for (const n of chord) {
    assert.ok(typeof N[n] === "number" && N[n] > 0, `missing note ${n} in ${th.name}`);
  }
});
t("pattern indices within chord range", () => {
  for (const th of THEMES) for (const p of th.bgm.patterns) for (const i of p) {
    assert.ok(i < 6);
  }
});
t("themeForLevel rotates every 2 levels and wraps", () => {
  assert.equal(themeForLevel(1).name, THEMES[0].name);
  assert.equal(themeForLevel(2).name, THEMES[0].name);
  assert.equal(themeForLevel(3).name, THEMES[1].name);
  assert.equal(themeForLevel(7).name, THEMES[3].name);
  assert.equal(themeForLevel(9).name, THEMES[0].name);
});
t("themes are musically distinct (different keys/tempos)", () => {
  const bars = THEMES.map((t) => t.bgm.barSec);
  assert.ok(new Set(bars).size === bars.length, "tempos should differ");
  const roots = THEMES.map((t) => t.bgm.chords[0][0]);
  assert.ok(new Set(roots).size >= 3, "keys should differ");
});
t("patch pool = theme count + 1, all distinct", () => {
  assert.equal(ALL_BASS_PATCHES.length, THEMES.length + 1);
  const sigs = new Set(ALL_BASS_PATCHES.map((p) => p.wave + "@" + p.cutoff));
  assert.equal(sigs.size, ALL_BASS_PATCHES.length);
  assert.ok(ALL_BASS_PATCHES.includes(DEFAULT_BASS_PATCH));
});
t("theme+patch pair repeats only every lcm(4,5)=20 levels (on theme change)", () => {
  const pairs = new Set();
  for (let level = 1; level <= 40; level++) {
    const theme = themeForLevel(level);
    if (level > 1 && themeForLevel(level - 1).name === theme.name) continue; // same theme, no new pair
    const key = theme.name + "|" + JSON.stringify(bassPatchForLevel(level));
    assert.ok(!pairs.has(key), "pair repeats at level " + level + ": " + key);
    pairs.add(key);
  }
  assert.equal(pairs.size, 20);
  assert.deepEqual(bassPatchForLevel(41), bassPatchForLevel(1));
});
console.log(`\n${pass} tests passed${process.exitCode ? " (with failures)" : ""}`);
