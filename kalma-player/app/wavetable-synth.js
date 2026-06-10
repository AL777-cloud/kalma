/* Kálma Brain — Wavetable Synthesizer
   Morphable wavetables for atmospheric and cinematic soundscapes.
   Uses PeriodicWave with custom harmonic series that morph over time. */

class WavetableSynth {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.voices = {};
    this.params = {
      tableA: 'warm',          // starting wavetable
      tableB: 'bright',        // ending wavetable
      morphPosition: 0,        // 0 = tableA, 1 = tableB
      morphLfoRate: 0.05,      // auto-morph speed (Hz), 0 = manual
      unisonCount: 3,          // 1-5 oscillators per voice
      unisonSpread: 10,        // detune spread in cents
      filterFreq: 3000,
      filterQ: 1,
      attack: 2,
      decay: 2,
      sustain: 0.8,
      release: 5,
      masterGain: 0.25
    };
    this._masterGain = null;
    this._tables = {};
    this._init();
  }

  _init() {
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = this.params.masterGain;
    this._masterGain.connect(this.output);
    this._buildTables();
  }

  // Generate PeriodicWave objects from harmonic recipes
  _buildTables() {
    const ctx = this.ctx;
    const N = 32; // harmonics

    const recipes = {
      warm: (n) => n === 0 ? 0 : 1 / (n * n), // strong fundamental, quick rolloff
      bright: (n) => n === 0 ? 0 : 1 / n,      // sawtooth-like, rich harmonics
      hollow: (n) => n === 0 ? 0 : (n % 2 === 1 ? 1 / n : 0), // odd harmonics only (square-ish)
      glass: (n) => n === 0 ? 0 : Math.exp(-n * 0.3) * Math.sin(n * 0.5), // bell-like partials
      choir: (n) => n === 0 ? 0 : (n < 6 ? 1 / (n + 1) : 0.02 / n), // formant-ish
      ethereal: (n) => n === 0 ? 0 : Math.exp(-n * 0.15) * (1 + 0.3 * Math.sin(n * 1.5)), // shimmery
      dark: (n) => n === 0 ? 0 : 1 / (n * n * n), // very dark, subby
      metallic: (n) => n === 0 ? 0 : Math.sin(n * 0.8) / (n + 1) // inharmonic partials
    };

    for (const [name, fn] of Object.entries(recipes)) {
      const real = new Float32Array(N);
      const imag = new Float32Array(N);
      for (let i = 0; i < N; i++) real[i] = fn(i);
      this._tables[name] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'masterGain' && this._masterGain) {
      this._masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }
  }

  _getTable(name) {
    return this._tables[name] || this._tables.warm;
  }

  noteOn(note, velocity = 0.7) {
    if (this.voices[note]) this.noteOff(note);

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    const tableA = this._getTable(p.tableA);
    const tableB = this._getTable(p.tableB);

    // Unison oscillators
    const oscsA = [];
    const oscsB = [];
    const gains = [];

    const spreadStep = p.unisonCount > 1 ? p.unisonSpread / (p.unisonCount - 1) : 0;

    for (let i = 0; i < p.unisonCount; i++) {
      const detune = p.unisonCount > 1
        ? -p.unisonSpread / 2 + spreadStep * i + (Math.random() - 0.5) * 2
        : 0;

      // Two oscillators per unison voice (A + B for morphing)
      const oscA = ctx.createOscillator();
      oscA.setPeriodicWave(tableA);
      oscA.frequency.value = freq;
      oscA.detune.value = detune;

      const oscB = ctx.createOscillator();
      oscB.setPeriodicWave(tableB);
      oscB.frequency.value = freq;
      oscB.detune.value = detune;

      const gainA = ctx.createGain();
      const gainB = ctx.createGain();
      gainA.gain.value = 1 - p.morphPosition;
      gainB.gain.value = p.morphPosition;

      oscA.connect(gainA);
      oscB.connect(gainB);
      oscsA.push(oscA);
      oscsB.push(oscB);
      gains.push(gainA, gainB);

      oscA.start(now);
      oscB.start(now);
    }

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;

    // Amp envelope
    const ampEnv = ctx.createGain();
    ampEnv.gain.value = 0;
    const vol = velocity / p.unisonCount;
    ampEnv.gain.setTargetAtTime(vol, now, p.attack * 0.3);
    ampEnv.gain.setTargetAtTime(vol * p.sustain, now + p.attack, p.decay * 0.3);

    // Connect all gains → filter → ampEnv → master
    gains.forEach(g => g.connect(filter));
    filter.connect(ampEnv);
    ampEnv.connect(this._masterGain);

    // Auto-morph LFO (modulates gain crossfade between A and B)
    let morphLfo = null;
    if (p.morphLfoRate > 0) {
      morphLfo = this._startMorphLfo(gains, p);
    }

    this.voices[note] = { oscsA, oscsB, gains, filter, ampEnv, morphLfo };
  }

  _startMorphLfo(gains, p) {
    // Simple JS timer that crossfades A/B gains
    let phase = p.morphPosition;
    const interval = setInterval(() => {
      phase += p.morphLfoRate * 0.05; // slow morph
      const morph = (Math.sin(phase * Math.PI * 2) + 1) / 2;
      for (let i = 0; i < gains.length; i += 2) {
        const now = this.ctx.currentTime;
        gains[i].gain.setTargetAtTime(1 - morph, now, 0.5);     // A
        gains[i + 1].gain.setTargetAtTime(morph, now, 0.5);     // B
      }
    }, 100);
    return interval;
  }

  noteOff(note) {
    const v = this.voices[note];
    if (!v) return;
    delete this.voices[note];

    const now = this.ctx.currentTime;
    const p = this.params;

    v.ampEnv.gain.cancelScheduledValues(now);
    v.ampEnv.gain.setValueAtTime(v.ampEnv.gain.value, now);
    v.ampEnv.gain.setTargetAtTime(0, now, p.release * 0.3);

    if (v.morphLfo) clearInterval(v.morphLfo);

    setTimeout(() => {
      [...v.oscsA, ...v.oscsB].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
      [...v.gains, v.filter, v.ampEnv].forEach(n => { try { n.disconnect(); } catch(e){} });
    }, (p.release + 2) * 1000);
  }

  panic() { Object.keys(this.voices).forEach(n => this.noteOff(parseInt(n))); }

  destroy() {
    this.panic();
    try { this._masterGain.disconnect(); } catch(e){}
  }

  static PRESETS = {
    'Cinematic Pad': {
      tableA: 'warm', tableB: 'ethereal', morphPosition: 0, morphLfoRate: 0.03,
      unisonCount: 4, unisonSpread: 15, filterFreq: 2500, filterQ: 0.7,
      attack: 3, decay: 2, sustain: 0.85, release: 6
    },
    'Glass Cathedral': {
      tableA: 'glass', tableB: 'choir', morphPosition: 0.3, morphLfoRate: 0.05,
      unisonCount: 3, unisonSpread: 8, filterFreq: 5000, filterQ: 0.3,
      attack: 2, decay: 3, sustain: 0.7, release: 5
    },
    'Dark Atmosphere': {
      tableA: 'dark', tableB: 'hollow', morphPosition: 0, morphLfoRate: 0.02,
      unisonCount: 5, unisonSpread: 20, filterFreq: 1000, filterQ: 2,
      attack: 4, decay: 3, sustain: 0.9, release: 8
    },
    'Metallic Shimmer': {
      tableA: 'metallic', tableB: 'bright', morphPosition: 0.5, morphLfoRate: 0.08,
      unisonCount: 3, unisonSpread: 12, filterFreq: 4000, filterQ: 1,
      attack: 1.5, decay: 2, sustain: 0.6, release: 4
    },
    'Ethereal Choir': {
      tableA: 'choir', tableB: 'ethereal', morphPosition: 0, morphLfoRate: 0.04,
      unisonCount: 4, unisonSpread: 10, filterFreq: 3500, filterQ: 0.5,
      attack: 2.5, decay: 2, sustain: 0.8, release: 5
    }
  };

  loadPreset(name) {
    const preset = WavetableSynth.PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => this.setParam(k, v));
  }
}
