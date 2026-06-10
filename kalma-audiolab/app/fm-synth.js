/* Kálma Brain — FM Synthesizer
   2-operator FM with ratio controls. Evolving textures, bells, metallic tones.
   Carrier + Modulator architecture with envelope on modulation index. */

class FMSynth {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.voices = {};
    this.params = {
      carrierType: 'sine',
      modRatio: 2,             // modulator freq = carrier freq * ratio
      modIndex: 200,           // modulation depth in Hz
      modEnvAttack: 0.5,       // envelope on mod index
      modEnvDecay: 2,
      modEnvSustain: 0.3,      // 0-1 of modIndex
      ampAttack: 0.3,
      ampDecay: 1,
      ampSustain: 0.7,
      ampRelease: 3,
      filterFreq: 6000,
      filterQ: 0.5,
      lfoRate: 0.2,
      lfoToMod: 0,             // LFO modulates mod index (0-1)
      masterGain: 0.25
    };
    this._masterGain = null;
    this._lfo = null;
    this._lfoGain = null;
    this._init();
  }

  _init() {
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = this.params.masterGain;
    this._masterGain.connect(this.output);

    this._lfo = this.ctx.createOscillator();
    this._lfo.type = 'sine';
    this._lfo.frequency.value = this.params.lfoRate;
    this._lfoGain = this.ctx.createGain();
    this._lfoGain.gain.value = 0;
    this._lfo.connect(this._lfoGain);
    this._lfo.start();
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'lfoRate' && this._lfo) this._lfo.frequency.value = value;
    if (key === 'lfoToMod') this._lfoGain.gain.value = value * this.params.modIndex;
    if (key === 'masterGain' && this._masterGain) {
      this._masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }
  }

  noteOn(note, velocity = 0.7) {
    if (this.voices[note]) this.noteOff(note);

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    // Modulator
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * p.modRatio;

    // Modulation index envelope
    const modGain = ctx.createGain();
    modGain.gain.value = 0;
    modGain.gain.setTargetAtTime(p.modIndex * velocity, now, p.modEnvAttack * 0.3);
    modGain.gain.setTargetAtTime(
      p.modIndex * p.modEnvSustain * velocity,
      now + p.modEnvAttack, p.modEnvDecay * 0.3
    );

    // LFO to mod index
    this._lfoGain.connect(modGain.gain);

    // Carrier
    const carrier = ctx.createOscillator();
    carrier.type = p.carrierType;
    carrier.frequency.value = freq;

    // FM connection: modulator → modGain → carrier.frequency
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;

    // Amp envelope
    const ampEnv = ctx.createGain();
    ampEnv.gain.value = 0;
    ampEnv.gain.setTargetAtTime(velocity, now, p.ampAttack * 0.3);
    ampEnv.gain.setTargetAtTime(p.ampSustain * velocity, now + p.ampAttack, p.ampDecay * 0.3);

    // Route: carrier → filter → ampEnv → master
    carrier.connect(filter);
    filter.connect(ampEnv);
    ampEnv.connect(this._masterGain);

    mod.start(now); carrier.start(now);

    this.voices[note] = { mod, modGain, carrier, filter, ampEnv };
  }

  noteOff(note) {
    const v = this.voices[note];
    if (!v) return;
    delete this.voices[note];

    const now = this.ctx.currentTime;
    const p = this.params;

    v.ampEnv.gain.cancelScheduledValues(now);
    v.ampEnv.gain.setValueAtTime(v.ampEnv.gain.value, now);
    v.ampEnv.gain.setTargetAtTime(0, now, p.ampRelease * 0.3);

    v.modGain.gain.cancelScheduledValues(now);
    v.modGain.gain.setTargetAtTime(0, now, p.ampRelease * 0.3);

    setTimeout(() => {
      [v.mod, v.carrier].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
      [v.modGain, v.filter, v.ampEnv].forEach(n => { try { n.disconnect(); } catch(e){} });
    }, (p.ampRelease + 2) * 1000);
  }

  panic() { Object.keys(this.voices).forEach(n => this.noteOff(parseInt(n))); }

  destroy() {
    this.panic();
    try { this._lfo.stop(); } catch(e){}
    try { this._masterGain.disconnect(); } catch(e){}
  }

  static PRESETS = {
    'Glass Bell': {
      carrierType: 'sine', modRatio: 3.5, modIndex: 400,
      modEnvAttack: 0.01, modEnvDecay: 3, modEnvSustain: 0.05,
      ampAttack: 0.01, ampDecay: 0.5, ampSustain: 0.3, ampRelease: 4,
      filterFreq: 8000, filterQ: 0.5, lfoRate: 0, lfoToMod: 0
    },
    'Evolving Texture': {
      carrierType: 'sine', modRatio: 2, modIndex: 300,
      modEnvAttack: 3, modEnvDecay: 4, modEnvSustain: 0.6,
      ampAttack: 2, ampDecay: 3, ampSustain: 0.8, ampRelease: 5,
      filterFreq: 3000, filterQ: 1, lfoRate: 0.1, lfoToMod: 0.4
    },
    'Metallic Drone': {
      carrierType: 'sine', modRatio: 1.414, modIndex: 500,
      modEnvAttack: 4, modEnvDecay: 2, modEnvSustain: 0.9,
      ampAttack: 3, ampDecay: 2, ampSustain: 0.85, ampRelease: 6,
      filterFreq: 2000, filterQ: 2, lfoRate: 0.05, lfoToMod: 0.3
    },
    'Electric Piano': {
      carrierType: 'sine', modRatio: 7, modIndex: 200,
      modEnvAttack: 0.005, modEnvDecay: 1.5, modEnvSustain: 0.1,
      ampAttack: 0.005, ampDecay: 1, ampSustain: 0.3, ampRelease: 2,
      filterFreq: 5000, filterQ: 0.7, lfoRate: 0, lfoToMod: 0
    },
    'Harmonic Shimmer': {
      carrierType: 'sine', modRatio: 5, modIndex: 150,
      modEnvAttack: 1, modEnvDecay: 5, modEnvSustain: 0.4,
      ampAttack: 1.5, ampDecay: 3, ampSustain: 0.7, ampRelease: 4,
      filterFreq: 6000, filterQ: 0.3, lfoRate: 0.15, lfoToMod: 0.2
    }
  };

  loadPreset(name) {
    const preset = FMSynth.PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => this.setParam(k, v));
  }
}
