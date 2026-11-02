import assert from "node:assert/strict";
import { THEMES, themeForLevel, N } from "../themes.js";
import { chordAt, bassAt, patternAt, chordTones, nearestChordTone, quantizeToChord, arpNotes } from "../harmony.js";

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { console.log("FAIL", name, "-", e.message); process.exitCode = 1; } };

const theme = THEMES[0];

t("chordAt resolves names to frequencies and wraps bar index", () => {
  const c0 = chordAt(theme, 0);
  assert.equal(c0[0], N.F2);
  assert.equal(chordAt(theme, theme.bgm.chords.length).length, c0.length);
  assert.deepEqual(chordAt(theme, theme.bgm.chords.length), c0);
  assert.deepEqual(chordAt(theme, -1), chordAt(theme, theme.bgm.chords.length - 1));
});

t("bassAt is root an octave down", () => {
  assert.equal(bassAt(theme, 0), N.F2 / 2);
});

t("patternAt wraps", () => {
  assert.deepEqual(patternAt(theme, theme.bgm.patterns.length), patternAt(theme, 0));
});

t("nearestChordTone picks closest in log space", () => {
  const tones = chordTones(theme, 0); // F2 C4 E4 A4 D5
  assert.equal(nearestChordTone(N.C4 * 1.03, tones), N.C4);
  assert.equal(nearestChordTone(N.A4 * 0.98, tones), N.A4);
  assert.equal(nearestChordTone(N.D5 * 1.01, tones), N.D5);
});

t("quantizeToChord snaps to chord tone, octave-clamped", () => {
  const tones = chordTones(theme, 0);
  const q = quantizeToChord(445, tones); // just above A4=440
  assert.equal(q, N.A4);
  const q2 = quantizeToChord(445, tones, 0); // no octave lift
  assert.ok(q2 <= 445 * 1.06);
});

t("arpNotes follows pattern over chord tones", () => {
  const notes = arpNotes(theme, 0, 6, 2);
  assert.equal(notes.length, 6);
  const tones = chordTones(theme, 0);
  const pat = patternAt(theme, 0);
  notes.forEach((f, i) => assert.equal(f, tones[pat[i % pat.length] % tones.length] * 2));
});

t("all themes: every bar has chord + pattern", () => {
  for (const th of THEMES) {
    for (let b = 0; b < th.bgm.chords.length; b++) {
      assert.ok(chordAt(th, b).every((f) => f > 0));
      assert.ok(patternAt(th, b).every((i) => i < 6));
    }
  }
});

console.log(`\n${pass} tests passed${process.exitCode ? " (with failures)" : ""}`);
