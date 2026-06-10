/* Kálma Brain — Physical Modeling Instruments
   Karplus-Strong strings, resonant bodies, plucked and bowed sounds.
   Organic, meditative tones. All Web Audio API synthesis. */

class PhysicalModel {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.voices = {};
    this.params = {
      model: 'pluck',          // pluck, bow, bell, marimba
      damping: 0.5,            // 0=bright, 1=dark (string decay)
      brightness: 0.5,         // exciter brightness
      bodyResonance: 0.3,      // resonant body amount
      attack: 0.01,
      release: 3,
      filterFreq: 4000,
      filterQ: 1,
      masterGain: 0.3
    };
    this._masterGain = null;
    this._bodyFilter = null;
    this._init();
  }

  _init() {
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = this.params.masterGain;

    // Body resonance filter (simulates resonant body)
    this._bodyFilter = this.ctx.createBiquadFilter();
    this._bodyFilter.type = 'peaking';
    this._bodyFilter.frequency.value = 200;
    this._bodyFilter.Q.value = 1.5;
    this._bodyFilter.gain.value = this.params.bodyResonance * 6;  // max 6dB, was 12

    this._masterGain.connect(this._bodyFilter);
    this._bodyFilter.connect(this.output);
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'masterGain') this._masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    if (key === 'bodyResonance') this._bodyFilter.gain.value = value * 6;
  }

  noteOn(note, velocity = 0.7) {
    if (this.voices[note]) this.noteOff(note);

    const model = this.params.model;
    if (model === 'pluck') this._pluck(note, velocity);
    else if (model === 'bow') this._bow(note, velocity);
    else if (model === 'bell') this._bell(note, velocity);
    else if (model === 'marimba') this._marimba(note, velocity);
  }

  // ── Karplus-Strong Plucked String ──
  _pluck(note, velocity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    // Exciter: burst of filtered noise
    const burstLen = Math.max(0.002, 1 / freq);
    const bufLen = Math.ceil(ctx.sampleRate * burstLen);
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - p.damping * (i / bufLen));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    // Delay line (Karplus-Strong)
    const delayTime = 1 / freq;
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = delayTime;

    // Feedback filter (damping) — capped below 1.0 to prevent runaway
    const fbValue = Math.min(0.95, 0.92 - p.damping * 0.15);
    const feedback = ctx.createGain();
    feedback.gain.value = fbValue;

    const dampFilter = ctx.createBiquadFilter();
    dampFilter.type = 'lowpass';
    dampFilter.frequency.value = Math.min(freq * (2 + (1 - p.damping) * 6), 12000);

    // Output filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    filter.Q.value = Math.min(p.filterQ, 3);

    const env = ctx.createGain();
    env.gain.value = velocity * 0.4;

    // Routing: noise → delay loop → filter → env → master
    // Noise excites the loop once, then the loop sustains on its own
    noise.connect(delay);
    delay.connect(dampFilter);
    dampFilter.connect(feedback);
    feedback.connect(delay);
    delay.connect(filter);
    filter.connect(env);
    env.connect(this._masterGain);

    noise.start(now);

    // Ramp feedback down over time to guarantee decay
    const decayTime = 1.5 + (1 - p.damping) * 5;
    feedback.gain.setTargetAtTime(fbValue * 0.5, now + decayTime * 0.4, decayTime * 0.3);
    env.gain.setTargetAtTime(0, now + decayTime * 0.5, decayTime * 0.25);

    this.voices[note] = { nodes: [noise, delay, dampFilter, feedback, filter, env], timer:
      setTimeout(() => {
        this._cleanup(note);
      }, (decayTime + 2) * 1000)
    };
  }

  // ── Bowed String (sustained) ──
  _bow(note, velocity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    // Sawtooth as bowed excitation + harmonics
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    // Bow pressure noise
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.02;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = p.brightness * 0.1;
    noise.connect(noiseGain);

    // Filter for body
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(p.filterFreq, 5000);
    filter.Q.value = Math.min(p.filterQ, 2);

    // Vibrato LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5 + Math.random();
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = freq * 0.005;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Envelope
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(velocity * 0.3, now, p.attack + 0.5);

    osc.connect(filter);
    noiseGain.connect(filter);
    filter.connect(env);
    env.connect(this._masterGain);

    osc.start(now); noise.start(now); lfo.start(now);

    this.voices[note] = { nodes: [osc, noise, noiseGain, filter, lfo, lfoGain, env], env };
  }

  // ── Bell (tuned partials with inharmonicity) ──
  _bell(note, velocity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    const partials = [1, 2.76, 4.07, 5.18, 6.98, 8.57];
    const amps = [0.5, 0.3, 0.2, 0.15, 0.08, 0.05];
    const decays = [4, 3, 2.5, 2, 1.5, 1];
    const nodes = [];

    partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;

      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(amps[i] * velocity * 0.3, now, 0.001);
      g.gain.setTargetAtTime(0, now + 0.5, decays[i] * (1 - p.damping * 0.5));

      osc.connect(g);
      g.connect(this._masterGain);
      osc.start(now);
      nodes.push(osc, g);
    });

    const totalDecay = 6 * (1 - p.damping * 0.5);
    this.voices[note] = { nodes, timer:
      setTimeout(() => this._cleanup(note), (totalDecay + 2) * 1000)
    };
  }

  // ── Marimba (sine with noise attack) ──
  _marimba(note, velocity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const p = this.params;

    // Fundamental
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Mallet noise
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseG = ctx.createGain();
    noiseG.gain.value = p.brightness * velocity * 0.4;

    // Amp envelope
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(velocity * 0.35, now, 0.005);
    const decayTime = 1.5 + (1 - p.damping) * 3;
    env.gain.setTargetAtTime(0, now + 0.1, decayTime * 0.3);

    // Slight pitch drop (wood resonance)
    osc.frequency.setTargetAtTime(freq * 0.997, now, 0.5);

    osc.connect(env);
    noise.connect(noiseG);
    noiseG.connect(env);
    env.connect(this._masterGain);
    osc.start(now); noise.start(now);

    this.voices[note] = { nodes: [osc, noise, noiseG, env], timer:
      setTimeout(() => this._cleanup(note), (decayTime + 3) * 1000)
    };
  }

  _cleanup(note) {
    const v = this.voices[note];
    if (!v) return;
    delete this.voices[note];
    if (v.timer) clearTimeout(v.timer);
    v.nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} });
  }

  noteOff(note) {
    const v = this.voices[note];
    if (!v) return;

    // For sustained models (bow), fade out
    if (v.env) {
      const now = this.ctx.currentTime;
      v.env.gain.cancelScheduledValues(now);
      v.env.gain.setTargetAtTime(0, now, this.params.release * 0.3);
      setTimeout(() => this._cleanup(note), (this.params.release + 2) * 1000);
    } else {
      // For percussive models, let natural decay finish
    }
  }

  panic() { Object.keys(this.voices).forEach(n => { this._cleanup(parseInt(n)); }); }

  destroy() {
    this.panic();
    try { this._masterGain.disconnect(); } catch(e){}
    try { this._bodyFilter.disconnect(); } catch(e){}
  }

  static PRESETS = {
    'Meditation Pluck': {
      model: 'pluck', damping: 0.3, brightness: 0.4, bodyResonance: 0.4,
      attack: 0.01, release: 3, filterFreq: 3000, filterQ: 1
    },
    'Bowed Cello': {
      model: 'bow', damping: 0.5, brightness: 0.3, bodyResonance: 0.5,
      attack: 0.8, release: 3, filterFreq: 2500, filterQ: 1.5
    },
    'Temple Bell': {
      model: 'bell', damping: 0.2, brightness: 0.5, bodyResonance: 0.3,
      attack: 0.001, release: 4, filterFreq: 5000, filterQ: 0.5
    },
    'Wooden Marimba': {
      model: 'marimba', damping: 0.4, brightness: 0.6, bodyResonance: 0.5,
      attack: 0.005, release: 2, filterFreq: 4000, filterQ: 0.7
    },
    'Crystal Harp': {
      model: 'pluck', damping: 0.1, brightness: 0.8, bodyResonance: 0.2,
      attack: 0.01, release: 5, filterFreq: 6000, filterQ: 0.3
    }
  };

  loadPreset(name) {
    const preset = PhysicalModel.PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => this.setParam(k, v));
  }
}
