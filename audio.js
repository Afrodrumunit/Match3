import { N } from "./themes.js";

export function createSfx(getTheme) {
  let ctx = null;
  let master = null;
  let filter = null;
  let delaySend = null;
  let noiseBuf = null;
  let muted = localStorage.getItem("gems-muted") === "1";
  let chirped = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        if (ctx.createDynamicsCompressor) {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -18;
          comp.knee.value = 20;
          comp.ratio.value = 8;
          master.connect(comp);
          comp.connect(ctx.destination);
        } else {
          master.connect(ctx.destination);
        }
        filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 700;
        filter.Q.value = 1.1;
        filter.connect(master);
        delaySend = ctx.createGain();
        delaySend.gain.value = 0.35;
        const delay = ctx.createDelay(2);
        delay.delayTime.value = 0.42;
        const fb = ctx.createGain();
        fb.gain.value = 0.38;
        const damp = ctx.createBiquadFilter();
        damp.type = "lowpass";
        damp.frequency.value = 2400;
        delaySend.connect(delay);
        delay.connect(damp);
        damp.connect(fb);
        fb.connect(delay);
        damp.connect(master);
      } catch { return null; }
    }
    if (ctx.state === "suspended") {
      try { ctx.resume(); } catch { /* retried on next gesture */ }
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac) return;
      const t = ac.currentTime + when;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch { /* audio must never break gameplay */ }
  }

  function chord(freqs, dur, type, vol, when = 0, step = 0) {
    freqs.forEach((f, i) => tone(f, dur, type, vol, when + i * step));
  }

  function arp(root, steps, dur, type, vol, when = 0, step = 0.055, ratio = 1.335) {
    let f = root;
    for (let i = 0; i < steps; i++) {
      tone(f, dur, type, vol, when + i * step);
      f *= ratio;
    }
  }

  function pad(freq, t, dur, vol) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac) return;
      for (const det of [-7, -2, 3, 8]) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, t);
        osc.detune.setValueAtTime(det, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
        gain.gain.setValueAtTime(vol, t + dur * 0.65);
        gain.gain.linearRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    } catch { /* audio must never break gameplay */ }
  }

  function pluck(freq, t, vol) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain);
      gain.connect(master);
      gain.connect(delaySend);
      osc.start(t);
      osc.stop(t + 1.5);
    } catch { /* audio must never break gameplay */ }
  }

  function kick(t, vol) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.25);
    } catch { /* ignore */ }
  }

  function noiseHit(t, vol, filterType, freq, dur) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac || !noiseBuf) return;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ac.createBiquadFilter();
      bp.type = filterType;
      bp.frequency.value = freq;
      bp.Q.value = 0.9;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch { /* ignore */ }
  }

  const snare = (t, vol) => noiseHit(t, vol, "bandpass", 1900, 0.16);

  function hiss() {
    try {
      const ac = ensure();
      if (!ac || noiseBuf) return;
      const len = ac.sampleRate * 2;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2 + white * 0.12;
      }
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6500;
      const gain = ac.createGain();
      gain.gain.value = 0.012;
      src.connect(lp);
      lp.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* ignore */ }
  }

  function crackle(t) {
    if (muted) return;
    try {
      const ac = ensure();
      if (!ac || !noiseBuf) return;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3500;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(master);
      src.start(t, Math.random() * 1.5);
      src.stop(t + 0.1);
    } catch { /* ignore */ }
  }

  function makeBgm() {
    let cfg = getTheme().bgm;
    return {
      setTheme(t) { cfg = t.bgm; },
      timer: null,
      nextBar: 0,
      barIndex: 0,
      start() {
        const ac = ensure();
        if (!ac || this.timer) return;
        hiss();
        this.nextBar = ac.currentTime + 0.1;
        this.barIndex = 0;
        this.timer = setInterval(() => this.schedule(), 400);
      },
      stop() {
        clearInterval(this.timer);
        this.timer = null;
      },
      schedule() {
        try {
          const ac = ensure();
          if (!ac || muted) return;
          const ahead = ac.currentTime + 1.0;
          while (this.nextBar < ahead) {
            const t = this.nextBar;
            const chords = cfg.chords.map((names) => names.map((n) => N[n]));
            const bar = this.barIndex % chords.length;
            const chordNotes = chords[bar];
            const pattern = cfg.patterns[bar % cfg.patterns.length];
            const barSec = cfg.barSec;
            chordNotes.forEach((f) => pad(f, t, barSec * 1.15, 0.02));
            if (filter) {
              const sweep = cfg.filterBase + 420 * (0.5 + 0.5 * Math.sin((bar / chords.length) * Math.PI * 6));
              filter.frequency.setValueAtTime(sweep, t);
            }
            const sixteenths = barSec / 4;
            for (let i = 0; i < 6; i++) {
              const idx = pattern[i] % chordNotes.length;
              pluck(chordNotes[idx] * 2, t + i * sixteenths * 0.5, i % 2 === 0 ? 0.04 : 0.025);
            }
            if (bar % 2 === 0) kick(t, 0.16);
            snare(t + sixteenths * 2, 0.07);
            if (bar % 4 === 3) kick(t + sixteenths * 3, 0.1);
            if (Math.random() < 0.6) crackle(t + Math.random() * barSec);
            this.nextBar += barSec;
            this.barIndex++;
          }
        } catch { /* ignore */ }
      },
    };
  }

  const bgm = makeBgm();

  return {
    setTheme(t) { bgm.setTheme(t); },
    unlock() {
      const ac = ensure();
      if (ac && !chirped) {
        chirped = true;
        chord([N.E5, N.G5, N.C6], 0.14, "square", 0.1, 0, 0.05);
        bgm.start();
      }
    },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      localStorage.setItem("gems-muted", muted ? "1" : "0");
      try {
        const ac = ensure();
        if (ac && master) {
          const t = ac.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, t + 0.08);
        }
      } catch { /* ignore */ }
      if (muted) bgm.stop();
      else bgm.start();
      return muted;
    },
    swap() {
      tone(140, 0.07, "triangle", 0.22, 0, 220);
      tone(280, 0.09, "square", 0.14, 0, 520);
      tone(560, 0.06, "square", 0.08, 0.03, 780);
    },
    invalid() {
      tone(160, 0.14, "square", 0.16, 0, 110);
      tone(151, 0.14, "sawtooth", 0.08, 0, 104);
    },
    match(combo) {
      const root = N.A4 * Math.pow(1.25, Math.min(combo - 1, 6));
      arp(root, 3, 0.1, "square", 0.13, 0, 0.05);
      chord([root * 1.5, root * 2], 0.12, "triangle", 0.07, 0.1);
    },
    special() {
      chord([N.C4, N.E4, N.G4, N.C5], 0.28, "sawtooth", 0.11, 0, 0.04);
      tone(90, 0.4, "square", 0.18, 0.02, 720);
      arp(N.C5, 4, 0.09, "square", 0.1, 0.12, 0.06, 1.26);
    },
    fall() {
      tone(700, 0.05, "triangle", 0.08, 0, 420);
      tone(520, 0.05, "triangle", 0.06, 0.04, 320);
    },
    levelUp() {
      arp(N.C5, 6, 0.14, "square", 0.14, 0, 0.09, 1.26);
      chord([N.C5, N.E5, N.G5, N.C6], 0.5, "triangle", 0.08, 0.45);
    },
    gameOver() {
      [N.G4, N.E4, N.C4, N.C4].forEach((f, i) => tone(f, 0.24, "square", 0.14, i * 0.2));
      chord([N.C4, N.E4, N.G4], 0.7, "triangle", 0.08, 0.8);
    },
    newGame() {
      arp(N.C4, 5, 0.11, "square", 0.13, 0, 0.08, 1.335);
      chord([N.C5, N.E5, N.G5], 0.3, "triangle", 0.08, 0.4);
    },
  };
}
