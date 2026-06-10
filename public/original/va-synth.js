/* Kálma Brain — Virtual Analog Synthesizer
   Warm pads, basses, leads. Two oscillators + sub, filter, amp envelope, LFO.
   All Web Audio API, no samples needed. */

class VASynth {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.voices = {};
    this.params = {
      osc1Type: 'sawtooth',  // saw, square, triangle, sine
      osc2Type: 'triangle',
      osc2Detune: 7,         // cents
      osc2Octave: 0,         // -1, 0, +1
      oscMix: 0.5,           // 0 = osc1 only, 1 = osc2 only
      subGain: 0.2,          // sub oscillator (sine, -1 oct)
      filterType: 'lowpass',
      filterFreq: 2000,
      filterQ: 2,
      filterEnvAmount: 3000, // Hz added by envelope
      attack: 0.8,           // seconds
      decay: 1.5,
      sustain: 0.6,          // 0-1
      release: 3.0,
      lfoRate: 0.3,          // Hz
      lfoDepth: 0,           // 0-1 (modulates filter)
      masterGain: 0.3
    };
    this._lfo = null;
    this._lfoGain = null;
    this._masterGain = null;
    this._init();
  }

  _init() {
    // Master gain
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = this.params.masterGain;
    this._masterGain.connect(this.output);

    // LFO (shared across voices, modulates filter)
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
    // Live-update running voices where applicable
    if (key === 'lfoRate' && this._lfo) this._lfo.frequency.value = value;
    if (key === 'lfoDepth') this._lfoGain.gain.value = value * this.params.filterEnvAmount;
    if (key === 'masterGain' && this._masterGain) {
      this._masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }
  }

  noteOn(note, velocity = 0.7) {
    if (this.voices[note]) this.noteOff(note); // retrigger

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    // Oscillator 1
    const osc1 = ctx.createOscillator();
    osc1.type = p.osc1Type;
    osc1.frequency.value = freq;

    // Oscillator 2
    const osc2 = ctx.createOscillator();
    osc2.type = p.osc2Type;
    osc2.frequency.value = freq * Math.pow(2, p.osc2Octave);
    osc2.detune.value = p.osc2Detune;

    // Sub oscillator (sine, -1 octave)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;

    // Mix gains
    const gain1 = ctx.createGain();
    gain1.gain.value = (1 - p.oscMix) * velocity;
    const gain2 = ctx.createGain();
    gain2.gain.value = p.oscMix * velocity;
    const gainSub = ctx.createGain();
    gainSub.gain.value = p.subGain * velocity;

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = p.filterType;
    filter.Q.value = p.filterQ;
    // Filter envelope: start low, sweep up during attack, settle at sustained freq
    const filterBase = Math.min(p.filterFreq, 200);
    const filterPeak = p.filterFreq + p.filterEnvAmount;
    filter.frequency.value = filterBase;
    filter.frequency.setTargetAtTime(filterPeak, now, p.attack * 0.3);
    filter.frequency.setTargetAtTime(
      filterBase + (filterPeak - filterBase) * p.sustain,
      now + p.attack, p.decay * 0.5
    );

    // Connect LFO to this voice's filter
    this._lfoGain.connect(filter.frequency);

    // Amp envelope
    const ampEnv = ctx.createGain();
    ampEnv.gain.value = 0;
    ampEnv.gain.setTargetAtTime(1, now, p.attack * 0.3);
    ampEnv.gain.setTargetAtTime(p.sustain, now + p.attack, p.decay * 0.3);

    // Routing: oscs → gains → filter → ampEnv → master
    osc1.connect(gain1); gain1.connect(filter);
    osc2.connect(gain2); gain2.connect(filter);
    sub.connect(gainSub); gainSub.connect(filter);
    filter.connect(ampEnv);
    ampEnv.connect(this._masterGain);

    osc1.start(now); osc2.start(now); sub.start(now);

    this.voices[note] = { osc1, osc2, sub, gain1, gain2, gainSub, filter, ampEnv };
  }

  noteOff(note) {
    const v = this.voices[note];
    if (!v) return;
    delete this.voices[note];

    const now = this.ctx.currentTime;
    const p = this.params;

    // Release envelope
    v.ampEnv.gain.cancelScheduledValues(now);
    v.ampEnv.gain.setValueAtTime(v.ampEnv.gain.value, now);
    v.ampEnv.gain.setTargetAtTime(0, now, p.release * 0.3);

    // Filter closes during release
    v.filter.frequency.cancelScheduledValues(now);
    v.filter.frequency.setTargetAtTime(100, now, p.release * 0.3);

    // Cleanup after release
    setTimeout(() => {
      [v.osc1, v.osc2, v.sub].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
      [v.gain1, v.gain2, v.gainSub, v.filter, v.ampEnv].forEach(n => {
        try { this._lfoGain.disconnect(n.frequency || n); } catch(e){}
        try { n.disconnect(); } catch(e){}
      });
    }, (p.release + 2) * 1000);
  }

  panic() {
    Object.keys(this.voices).forEach(n => this.noteOff(parseInt(n)));
  }

  destroy() {
    this.panic();
    try { this._lfo.stop(); this._lfo.disconnect(); } catch(e){}
    try { this._lfoGain.disconnect(); } catch(e){}
    try { this._masterGain.disconnect(); } catch(e){}
  }

  // Presets
  static PRESETS = {
    'Warm Pad': {
      osc1Type: 'sawtooth', osc2Type: 'triangle', osc2Detune: 7, osc2Octave: 0,
      oscMix: 0.4, subGain: 0.15, filterFreq: 1200, filterQ: 1, filterEnvAmount: 1500,
      attack: 1.5, decay: 2, sustain: 0.7, release: 4, lfoRate: 0.2, lfoDepth: 0.15
    },
    'Deep Bass': {
      osc1Type: 'sawtooth', osc2Type: 'square', osc2Detune: 0, osc2Octave: -1,
      oscMix: 0.3, subGain: 0.4, filterFreq: 600, filterQ: 4, filterEnvAmount: 2000,
      attack: 0.05, decay: 0.8, sustain: 0.4, release: 0.5, lfoRate: 0, lfoDepth: 0
    },
    'Ethereal Strings': {
      osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc2Detune: 12, osc2Octave: 0,
      oscMix: 0.5, subGain: 0, filterFreq: 3000, filterQ: 0.5, filterEnvAmount: 2000,
      attack: 2, decay: 3, sustain: 0.8, release: 5, lfoRate: 0.15, lfoDepth: 0.1
    },
    'Soft Lead': {
      osc1Type: 'square', osc2Type: 'sine', osc2Detune: 3, osc2Octave: 1,
      oscMix: 0.3, subGain: 0.1, filterFreq: 2500, filterQ: 3, filterEnvAmount: 4000,
      attack: 0.1, decay: 0.5, sustain: 0.6, release: 1.5, lfoRate: 5, lfoDepth: 0.05
    },
    'Ambient Drone': {
      osc1Type: 'sine', osc2Type: 'triangle', osc2Detune: 5, osc2Octave: 0,
      oscMix: 0.5, subGain: 0.25, filterFreq: 800, filterQ: 1, filterEnvAmount: 500,
      attack: 4, decay: 3, sustain: 0.9, release: 6, lfoRate: 0.08, lfoDepth: 0.3
    }
  };

  loadPreset(name) {
    const preset = VASynth.PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => this.setParam(k, v));
  }
}
