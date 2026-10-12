/* Every sound is synthesised with the Web Audio API: no audio files. */
(function (CK) {
  'use strict';

  let ctx = null, master = null, noiseBuf = null, muted = false;
  const lastPlayed = {};

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function env(g, t0, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone({ freq, to, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.006 }) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env(g, t0, vol, attack, dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.3, vol = 0.2, freq = 1000, to, q = 0.8, type = 'lowpass', delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env(g, t0, vol, 0.01, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  const arp = (notes, opts) => notes.forEach((f, i) => tone(Object.assign({ freq: f, delay: i * (opts.gap || 0.08) }, opts)));

  const SFX = {
    click: () => tone({ freq: 660, to: 990, type: 'triangle', dur: 0.07, vol: 0.12 }),
    blip: () => tone({ freq: 520 + Math.random() * 260, type: 'sine', dur: 0.05, vol: 0.05 }),
    coin: () => { tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.05 }); tone({ freq: 1319, type: 'square', dur: 0.22, vol: 0.05, delay: 0.06 }); },
    pop: () => tone({ freq: 420, to: 900, type: 'sine', dur: 0.09, vol: 0.1 }),
    land: () => { tone({ freq: 240, to: 90, type: 'sine', dur: 0.16, vol: 0.25 }); noise({ dur: 0.18, vol: 0.08, freq: 600 }); },
    puff: () => noise({ dur: 0.45, vol: 0.18, freq: 2200, to: 300 }),
    bump: () => { tone({ freq: 170, to: 55, type: 'triangle', dur: 0.22, vol: 0.35 }); noise({ dur: 0.14, vol: 0.14, freq: 500 }); },
    clatter: () => {
      [0, 0.07, 0.15, 0.21].forEach((d, i) => tone({ freq: 1500 - i * 230, to: 1300 - i * 230, type: 'square', dur: 0.08, vol: 0.045, delay: d }));
      noise({ dur: 0.3, vol: 0.1, freq: 3500, type: 'highpass', delay: 0.02 });
    },
    hire: () => arp([523.25, 659.25, 783.99], { type: 'triangle', dur: 0.2, vol: 0.13, gap: 0.07 }),
    fire: () => arp([659.25, 523.25, 392], { type: 'triangle', dur: 0.2, vol: 0.12, gap: 0.08 }),
    spin: () => { tone({ freq: 380, to: 1250, type: 'sine', dur: 0.4, vol: 0.09 }); tone({ freq: 760, to: 2500, type: 'sine', dur: 0.4, vol: 0.03 }); },
    sad: () => [392, 370, 349, 311].forEach((f, i) => tone({ freq: f, to: f * (i === 3 ? 0.92 : 0.98), type: 'sawtooth', dur: i === 3 ? 0.7 : 0.22, vol: 0.045, delay: i * 0.22 })),
    whoosh: () => noise({ dur: 0.7, vol: 0.22, freq: 300, to: 2600, type: 'bandpass', q: 1.4 }),
    thunk: () => { tone({ freq: 110, to: 40, type: 'sine', dur: 0.4, vol: 0.45 }); noise({ dur: 0.35, vol: 0.2, freq: 400 }); },
    correct: () => arp([659.25, 987.77], { type: 'triangle', dur: 0.22, vol: 0.13, gap: 0.09 }),
    wrong: () => arp([311, 233], { type: 'square', dur: 0.2, vol: 0.05, gap: 0.12 }),
    fanfare: () => {
      arp([523.25, 659.25, 783.99, 1046.5], { type: 'triangle', dur: 0.22, vol: 0.14, gap: 0.11 });
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone({ freq: f, type: 'triangle', dur: 1.1, vol: 0.06, delay: 0.48 }));
      arp([2093, 2637, 3136, 2637, 3136], { type: 'sine', dur: 0.12, vol: 0.03, gap: 0.06, delay: 0.55 });
    },
  };

  function play(name, minGapMs = 0) {
    if (!ctx || muted || !SFX[name]) return;
    const now = performance.now();
    if (minGapMs && lastPlayed[name] && now - lastPlayed[name] < minGapMs) return;
    lastPlayed[name] = now;
    try { SFX[name](); } catch (e) { /* audio is optional */ }
  }

  CK.Audio = {
    init, play,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: () => muted,
  };
})(window.CK = window.CK || {});
