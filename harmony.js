import { N } from "./themes.js";

export function chordAt(theme, barIndex) {
  const chords = theme.bgm.chords;
  const bar = ((barIndex % chords.length) + chords.length) % chords.length;
  return chords[bar].map((n) => N[n]);
}

export function bassAt(theme, barIndex) {
  return chordAt(theme, barIndex)[0] / 2;
}

export function bassLine(theme, barIndex, barSec) {
  const bassPatterns = theme.bgm.bass || [[[0, 4, 0]]];
  const pattern = bassPatterns[barIndex % bassPatterns.length];
  const chord = chordAt(theme, barIndex);
  const root = bassAt(theme, barIndex);
  const beatLen = barSec / 4;
  return pattern.map(([beat, dur, degree = 0]) => {
    const chordTone = chord[degree % chord.length];
    const octave = degree >= chord.length ? 2 : 1;
    return {
      freq: (degree === 0 ? root : chordTone / 2) * octave,
      at: beat * beatLen,
      dur: dur * beatLen,
    };
  });
}

export function patternAt(theme, barIndex) {
  const patterns = theme.bgm.patterns;
  const bar = ((barIndex % patterns.length) + patterns.length) % patterns.length;
  return patterns[bar];
}

export function chordTones(theme, barIndex) {
  return chordAt(theme, barIndex);
}

export function nearestChordTone(freq, tones) {
  let best = tones[0];
  let bestDist = Math.abs(Math.log2(freq / best));
  for (const t of tones) {
    const d = Math.abs(Math.log2(freq / t));
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

export function quantizeToChord(freq, tones, maxOctaves = 2) {
  const base = nearestChordTone(freq, tones);
  let f = base;
  if (f > freq) {
    let down = f;
    while (down / 2 >= freq && maxOctaves-- > 0) down /= 2;
    f = down;
  } else {
    while (f * 2 <= freq && maxOctaves-- > 0) f *= 2;
  }
  return f;
}

export function drumHits(theme, barIndex, barSec) {
  const drums = theme.bgm.drums || { kick: [[[0], [2]]], snare: [[[1], [3]]] };
  const beatLen = barSec / 4;
  const pick = (list) => list[barIndex % list.length];
  return {
    kick: pick(drums.kick).map(([beat]) => ({ at: beat * beatLen })),
    snare: pick(drums.snare).map(([beat]) => ({ at: beat * beatLen })),
  };
}

export function gcd(a, b) {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export function lcm(a, b) {
  return (a * b) / gcd(a, b);
}

export function polyCycle(group, beats = 4) {
  return lcm(group, beats);
}

export function polyHits(theme, barIndex, barSec) {
  const poly = theme.bgm.poly || { group: 3, shaker: false };
  const group = poly.group;
  const cycle = polyCycle(group, 4);
  const shaker = [];
  if (poly.shaker !== false) {
    for (let i = 0; i < group; i++) {
      shaker.push({ at: (i * barSec) / group });
    }
  }
  const accents = [];
  if (poly.accent && barIndex % cycle === 0) {
    accents.push({ at: 0 });
  }
  return { shaker, accents, cycle, group };
}

export function percHits(theme, barIndex, barSec) {
  const perc = theme.bgm.drums?.perc || {};
  const beatLen = barSec / 4;
  const out = {};
  for (const [name, patterns] of Object.entries(perc)) {
    const pattern = patterns[barIndex % patterns.length];
    out[name] = pattern.map(([beat]) => ({ at: beat * beatLen }));
  }
  return out;
}

export function bassPatch(theme, pick = 0) {
  const patches = theme.bgm.bassPatches || [{ wave: "sawtooth", cutoff: 500, vol: 0.045 }];
  return patches[((pick % patches.length) + patches.length) % patches.length];
}

export function arpNotes(theme, barIndex, steps, octave = 2) {
  const tones = chordTones(theme, barIndex);
  const pattern = patternAt(theme, barIndex);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const idx = pattern[i % pattern.length] % tones.length;
    out.push(tones[idx] * octave);
  }
  return out;
}
