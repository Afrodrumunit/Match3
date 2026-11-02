import assert from "node:assert/strict";
import { THEMES, DEFAULT_BASS_PATCH, themeForLevel, N } from "../themes.js";
import { chordAt, bassAt, bassLine, drumHits, polyHits, polyCycle, gcd, lcm, percHits, bassPatch, patternAt, chordTones, nearestChordTone, quantizeToChord, arpNotes } from "../harmony.js";

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

t("bassLine: offsets/durations within bar, notes are chord tones (root octave-down)", () => {
  for (const th of THEMES) {
    for (let b = 0; b < th.bgm.chords.length; b++) {
      const notes = bassLine(th, b, th.bgm.barSec);
      assert.ok(notes.length >= 1);
      const barDur = th.bgm.barSec;
      const chord = chordAt(th, b);
      for (const n of notes) {
        assert.ok(n.at >= 0 && n.at < barDur, `offset ${n.at} within bar`);
        assert.ok(n.dur > 0 && n.at + n.dur <= barDur + 1e-9, `dur fits: ${n.at}+${n.dur} <= ${barDur}`);
        const inChord = chord.some((t) => Math.abs(Math.log2(n.freq / (t / 2))) < 0.02 || Math.abs(Math.log2(n.freq / t)) < 0.02);
        assert.ok(inChord, `freq ${n.freq} is a chord tone of bar ${b}`);
      }
    }
  }
});

t("bassLine actually walks: patterns contain >1 distinct degree", () => {
  for (const th of THEMES) {
    const degrees = new Set(th.bgm.bass.flat().map((n) => n[2] ?? 0));
    assert.ok(degrees.size > 1, `${th.name} bass should use multiple chord degrees, got ${[...degrees]}`);
  }
});

t("bassLine falls back to whole note when no bass patterns defined", () => {
  const th = { bgm: { chords: [["C3", "E3", "G3"]], barSec: 4 } };
  const notes = bassLine(th, 0, 4);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].at, 0);
  assert.equal(notes[0].dur, 4);
  assert.equal(notes[0].freq, N.C3 / 2);
});

t("bass patterns differ per theme", () => {
  const counts = THEMES.map((t) => t.bgm.bass.length);
  assert.ok(new Set(counts).size > 1);
});

t("drumHits: beats within bar; kicks COMPLEMENT bass (no unison, shared grid)", () => {
  for (const th of THEMES) {
    const barSec = th.bgm.barSec;
    for (let b = 0; b < th.bgm.chords.length; b++) {
      const hits = drumHits(th, b, barSec);
      for (const h of [...hits.kick, ...hits.snare]) {
        assert.ok(h.at >= 0 && h.at < barSec, `drum beat ${h.at} within bar (${barSec})`);
      }
      const bassOnsets = new Set(bassLine(th, b, barSec).map((n) => n.at.toFixed(3)));
      const grid = barSec / 16; // 16th-note grid
      for (const k of hits.kick) {
        assert.ok(!bassOnsets.has(k.at.toFixed(3)), `kick at ${k.at} must NOT coincide with bass onset in ${th.name} bar ${b}`);
        assert.ok(Math.abs(k.at / grid - Math.round(k.at / grid)) < 1e-3, `kick at ${k.at} is on the 16th grid`);
      }
      // at least one kick per bar so the groove never goes empty
      assert.ok(hits.kick.length >= 1, `${th.name} bar ${b} has a kick`);
    }
  }
});

t("drumHits falls back to standard boom-bap when no drums defined", () => {
  const th = { bgm: { chords: [["C3", "E3", "G3"]], barSec: 4 } };
  const hits = drumHits(th, 0, 4);
  assert.deepEqual(hits.kick.map((h) => h.at), [0, 2]);
  assert.deepEqual(hits.snare.map((h) => h.at), [1, 3]);
});

t("gcd/lcm: 3-over-4 cycle is 12 beats, 5-over-4 is 20", () => {
  assert.equal(gcd(4, 3), 1);
  assert.equal(lcm(4, 3), 12);
  assert.equal(lcm(4, 5), 20);
  assert.equal(polyCycle(3), 12);
  assert.equal(polyCycle(5), 20);
});

t("polyHits: shaker divides bar into group parts, fits within bar", () => {
  for (const th of THEMES) {
    const group = th.bgm.poly.group;
    for (let b = 0; b < 24; b++) {
      const hits = polyHits(th, b, th.bgm.barSec);
      assert.equal(hits.shaker.length, th.bgm.poly.shaker === false ? 0 : group);
      if (th.bgm.poly.shaker !== false) {
        for (let i = 0; i < group; i++) {
          assert.ok(Math.abs(hits.shaker[i].at - (i * th.bgm.barSec) / group) < 1e-9);
          assert.ok(hits.shaker[i].at < th.bgm.barSec);
        }
      }
      const shouldAccent = !!th.bgm.poly.accent && b % hits.cycle === 0;
      assert.equal(hits.accents.length, shouldAccent ? 1 : 0);
    }
  }
});

t("polyrhythm phase realigns every lcm bars (hemiola feel)", () => {
  const th = THEMES[0]; // group 3 -> cycle 12
  const hits0 = polyHits(th, 0, th.bgm.barSec);
  const hits12 = polyHits(th, 12, th.bgm.barSec);
  assert.deepEqual(hits0.shaker, hits12.shaker, "bar 0 and bar 12 have identical phase");
  const hits1 = polyHits(th, 1, th.bgm.barSec);
  assert.deepEqual(hits1.shaker, hits0.shaker, "within a bar the 3-group is static");
});

t("percHits: every perc voice fits in bar and rotates", () => {
  for (const th of THEMES) {
    const names = Object.keys(th.bgm.drums.perc);
    assert.ok(names.length >= 2, `${th.name} should have >=2 perc voices`);
    for (let b = 0; b < 16; b++) {
      const hits = percHits(th, b, th.bgm.barSec);
      for (const [name, list] of Object.entries(hits)) {
        for (const h of list) assert.ok(h.at >= 0 && h.at < th.bgm.barSec, `${name}@${h.at} in bar ${b}`);
      }
    }
  }
});

t("exactly one bass patch per theme + 1 shared default", () => {
  const waves = new Set(["sine", "triangle", "square", "sawtooth"]);
  const all = [DEFAULT_BASS_PATCH, ...THEMES.map((t) => bassPatch(t))];
  assert.equal(all.length, THEMES.length + 1);
  const sigs = new Set(all.map((p) => `${p.wave}@${p.cutoff}`));
  assert.equal(sigs.size, all.length, "all patches should be distinct");
  for (const p of all) {
    assert.ok(waves.has(p.wave));
    assert.ok(p.cutoff > 0 && p.vol > 0);
  }
});

t("bassPatch falls back to DEFAULT_BASS_PATCH", () => {
  const th = { bgm: { chords: [["C3"]], barSec: 4 } };
  assert.deepEqual(bassPatch(th), DEFAULT_BASS_PATCH);
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
