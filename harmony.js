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
  const bassPatterns = theme.bgm.bass || [[[0, 4]]];
  const pattern = bassPatterns[barIndex % bassPatterns.length];
  const root = bassAt(theme, barIndex);
  const fifth = chordAt(theme, barIndex)[2] / 2;
  return pattern.map(([beat, dur], i) => ({
    freq: i % 4 === 2 ? fifth : root,
    at: beat * (barSec / 4),
    dur: dur * (barSec / 4),
  }));
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
