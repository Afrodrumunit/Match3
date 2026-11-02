export const N = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, Bb2: 116.54, B2: 123.47,
  C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.0,
  Gs3: 207.65, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
  B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  C6: 1046.5, E6: 1318.5,
};

export const THEMES = [
  {
    name: "Azure",
    emojis: ["💎", "🔥", "🌊", "🍀", "⭐", "💜"],
    colors: ["#4fc3f7", "#ff8a65", "#4dd0e1", "#aed581", "#ffd54f", "#ba68c8"],
    css: {
      "--page1": "#2b2b52",
      "--page2": "#12121f",
      "--glow1": "rgba(122,184,255,0.18)",
      "--glow2": "rgba(255,122,217,0.14)",
      "--glow3": "rgba(255,215,106,0.08)",
      "--accentA": "#ff7ad9",
      "--accentB": "#7ab8ff",
      "--boardBg": "rgba(10,10,25,0.55)",
    },
    bgm: {
      barSec: 3.6,
      bass: [[[0, 2, 0], [2, 2, 2]], [[0, 4, 4]]], // Azure: half note root->fifth walk, then octave
      drums: {
        kick: [[[0], [2]], [[0]]],
        snare: [[[1], [3]]],
        perc: { hat: [[[0], [0.5], [1], [1.5], [2], [2.5], [3], [3.5]], [[0], [1], [2], [3]]], rim: [[[1.5], [3.5]], [[3]]] },
      },
      bassPatches: [
        { wave: "sawtooth", cutoff: 420, vol: 0.05 },
        { wave: "triangle", cutoff: 900, vol: 0.055 },
      ],
      poly: { group: 3, shaker: true }, // Azure: 3-over-4 hemiola
      filterBase: 500,
      chords: [
        ["F2", "C4", "E4", "A4", "D5"],
        ["C3", "G3", "B3", "E4", "A4"],
        ["Bb2", "F3", "A3", "D4", "G4"],
        ["G2", "D3", "F4", "B3", "E4"],
        ["F2", "C4", "E4", "A4", "D5"],
        ["A2", "E3", "Gs3", "B3", "E4"],
        ["Bb2", "F3", "A3", "D4", "F4"],
        ["E3", "B3", "D4", "G4", "C5"],
      ],
      patterns: [
        [0, 2, 1, 3, 4, 2],
        [4, 3, 2, 1, 0, 2],
        [0, 3, 1, 4, 2, 3],
        [2, 4, 1, 3, 0, 1],
      ],
    },
  },
  {
    name: "Ember",
    emojis: ["🔥", "🍊", "🍁", "🌋", "🧡", "🍂"],
    colors: ["#ff5252", "#ff9800", "#ffb347", "#e53935", "#ff7043", "#bf360c"],
    css: {
      "--page1": "#3a1f2b",
      "--page2": "#1f1210",
      "--glow1": "rgba(255,112,67,0.20)",
      "--glow2": "rgba(255,82,82,0.14)",
      "--glow3": "rgba(255,179,71,0.10)",
      "--accentA": "#ffb347",
      "--accentB": "#ff5252",
      "--boardBg": "rgba(30,12,8,0.55)",
    },
    bgm: {
      barSec: 3.2,
      bass: [[[0, 0.5, 0], [0.5, 0.5, 1], [1, 0.5, 2], [1.5, 0.5, 3], [2, 0.5, 4], [2.5, 0.5, 3], [3, 0.5, 2], [3.5, 0.5, 1]], [[0, 1, 0], [1, 1, 2], [2, 1, 1], [3, 1, 3]]], // Ember: eighths arpeggiating the chord, then half-note walk
      drums: {
        kick: [[[0], [0.5], [1], [1.5], [2], [2.5], [3], [3.5]], [[0], [1], [2], [3]]],
        snare: [[[1], [3]]],
        perc: { hat: [[[0.25], [0.75], [1.25], [1.75], [2.25], [2.75], [3.25], [3.75]], [[0.5], [1.5], [2.5], [3.5]]], openhat: [[[3]], [[2], [3]]], rim: [[[0], [2]], [[1], [3]]] },
      },
      bassPatches: [
        { wave: "square", cutoff: 300, vol: 0.05 },
        { wave: "sawtooth", cutoff: 550, vol: 0.045 },
      ],
      poly: { group: 3, shaker: false }, // Ember: hemiola accents only, drums carry the drive
      filterBase: 620,
      chords: [
        ["A2", "C4", "E4", "G4"],
        ["F2", "A3", "C4", "E4"],
        ["C3", "E3", "G3", "B3"],
        ["G2", "B2", "D3", "F4"],
        ["A2", "C4", "E4", "G4"],
        ["F2", "A3", "C4", "F4"],
        ["G2", "B2", "D3", "G3"],
        ["E2", "G2", "B2", "E3"],
      ],
      patterns: [
        [0, 1, 2, 3, 2, 1],
        [3, 2, 1, 0, 1, 2],
        [0, 2, 3, 1, 2, 0],
        [2, 3, 0, 1, 3, 2],
      ],
    },
  },
  {
    name: "Grove",
    emojis: ["🍀", "🌿", "🐸", "🌵", "🍃", "🌻"],
    colors: ["#66bb6a", "#aed581", "#4db6ac", "#8d6e63", "#d4e157", "#ffd54f"],
    css: {
      "--page1": "#1f3a2b",
      "--page2": "#101f14",
      "--glow1": "rgba(102,187,106,0.18)",
      "--glow2": "rgba(212,225,87,0.12)",
      "--glow3": "rgba(255,213,79,0.08)",
      "--accentA": "#aed581",
      "--accentB": "#ffd54f",
      "--boardBg": "rgba(8,25,15,0.55)",
    },
    bgm: {
      barSec: 4.0,
      bass: [[[0, 2, 0], [2, 2, 2]], [[0, 1.5, 1], [2, 1, 3], [3, 1, 2]], [[0, 4, 4]]], // Grove: root-fifth halves / dotted walk / octave
      drums: {
        kick: [[[0], [2]], [[0], [2], [3]], [[0]]],
        snare: [[[1], [3]], [[1], [3]]],
        perc: { hat: [[[0], [1], [2], [3]], [[0.5], [1.5], [2.5], [3.5]]], clave: [[[0], [1.5], [2], [3.5]], [[0], [2.5]]], tom: [[[3]], []] },
      },
      bassPatches: [
        { wave: "sine", cutoff: 1000, vol: 0.06 },
        { wave: "triangle", cutoff: 700, vol: 0.055 },
        { wave: "sawtooth", cutoff: 380, vol: 0.045 },
      ],
      poly: { group: 5, shaker: true }, // Grove: 5-over-4 cross-rhythm
      filterBase: 450,
      chords: [
        ["C3", "G3", "B3", "E4", "A4"],
        ["G2", "D3", "F4", "B3", "E4"],
        ["A2", "E3", "G3", "C4", "E4"],
        ["F2", "C3", "A3", "D4", "G4"],
        ["C3", "G3", "B3", "E4", "A4"],
        ["E3", "B3", "D4", "G4"],
        ["D3", "A3", "C4", "F4"],
        ["G2", "D3", "B3", "E4"],
      ],
      patterns: [
        [0, 3, 1, 4, 2, 3],
        [4, 2, 0, 3, 1, 2],
        [1, 4, 2, 0, 3, 1],
        [2, 0, 4, 1, 3, 0],
      ],
    },
  },
  {
    name: "Neon",
    emojis: ["💜", "🌙", "⚡", "🪐", "🔮", "👾"],
    colors: ["#ba68c8", "#7e57c2", "#4dd0e1", "#f06292", "#9575cd", "#4fc3f7"],
    css: {
      "--page1": "#2b1f3a",
      "--page2": "#12081f",
      "--glow1": "rgba(186,104,200,0.20)",
      "--glow2": "rgba(77,208,225,0.14)",
      "--glow3": "rgba(240,98,146,0.10)",
      "--accentA": "#ba68c8",
      "--accentB": "#4dd0e1",
      "--boardBg": "rgba(20,8,35,0.55)",
    },
    bgm: {
      barSec: 2.8,
      bass: [[[0, 0.75, 0], [1, 0.5, 2], [1.75, 0.5, 3], [2.5, 1.5, 1]], [[0, 1, 0], [1.5, 0.5, 4], [2, 2, 2]], [[0, 0.5, 0], [0.75, 0.25, 1], [1, 0.5, 2], [2, 0.5, 3], [2.5, 0.5, 4], [3, 1, 2]]], // Neon: syncopated chord walks
      drums: {
        kick: [[[0], [1], [1.75], [2.5]], [[0], [1.5], [2]], [[0], [0.75], [1], [2], [2.5], [3]]],
        snare: [[[1], [3]], [[1], [3]], [[1], [2.5], [3]]],
        perc: { hat: [[[0], [0.5], [1], [1.5], [2], [2.5], [3], [3.5]], [[0.5], [1], [1.5], [2], [2.5], [3], [3.5]]], openhat: [[[2], [3]], [[1], [3]]], rim: [[[0.5], [1.5], [2.5], [3.5]], [[0.25], [1.25], [2.25], [3.25]]] },
      },
      bassPatches: [
        { wave: "sawtooth", cutoff: 800, vol: 0.045 },
        { wave: "square", cutoff: 500, vol: 0.05 },
        { wave: "sawtooth", cutoff: 1200, vol: 0.04 },
      ],
      poly: { group: 3, shaker: true, accent: true }, // Neon: 3-over-4 with accented pluck downbeats
      filterBase: 700,
      chords: [
        ["D3", "A3", "C4", "F4"],
        ["Bb2", "F3", "A3", "D4"],
        ["F2", "C3", "E4", "A4"],
        ["C3", "G3", "B3", "E4"],
        ["D3", "A3", "C4", "F4"],
        ["Bb2", "F3", "A3", "D4"],
        ["G2", "D3", "F3", "B3"],
        ["A2", "E3", "G3", "C4"],
      ],
      patterns: [
        [0, 2, 1, 3, 0, 2],
        [3, 1, 2, 0, 3, 1],
        [0, 3, 2, 1, 0, 3],
        [1, 0, 3, 2, 1, 0],
      ],
    },
  },
];

export function themeForLevel(level) {
  return THEMES[Math.floor((level - 1) / 2) % THEMES.length];
}
