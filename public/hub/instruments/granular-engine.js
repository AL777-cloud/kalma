/* Kálma Brain — Granular Synthesis Engine
   Creates clouds of tiny grains from audio buffers or generated noise.
   Each grain is a short slice played at variable pitch, position, and density.
   For nature textures, ambient recordings, and atmospheric soundscapes. */

class GranularEngine {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.buffer = null;       // source audio buffer
    this.alive = false;
    this.grainTimer = null;
    this.params = {
      position: 0.5,          // 0-1 playback position in buffer
      positionSpread: 0.1,    // random offset around position
      grainSize: 0.08,        // grain duration in seconds
      grainSizeSpread: 0.03,
      density: 15,            // grains per second
      pitch: 1,               // playback rate
      pitchSpread: 0.05,      // random pitch variation
      pan: 0,                 // stereo position
      panSpread: 0.5,         // random pan variation
      attack: 0.3,            // grain envelope (fraction of grain size)
      release: 0.5,
      filterFreq: 6000,
      filterQ: 0.5,
      reverb: 0.2,            // send to reverb (0-1)
      masterGain: 0.3
    };
    this._masterGain = null;
    this._reverbGain = null;
    this._reverb = null;
    this._init();
  }

  _init() {
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = 0;
    this._masterGain.connect(this.output);

    // Built-in reverb for spaciousness
    const sr = this.ctx.sampleRate;
    const len = sr * 2.5;
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    this._reverb = this.ctx.createConvolver();
    this._reverb.buffer = buf;
    this._reverbGain = this.ctx.createGain();
    this._reverbGain.gain.value = this.params.reverb;
    this._reverb.connect(this._reverbGain);
    this._reverbGain.connect(this.output);
  }

  setParam(key, value) {
    this.params[key] = value;
    if (key === 'masterGain' && this._masterGain) {
      this._masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.3);
    }
    if (key === 'reverb' && this._reverbGain) {
      this._reverbGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.3);
    }
  }

  // Load audio buffer from URL
  async loadBuffer(url) {
    try {
      const res = await fetch(url);
      const arrayBuf = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arrayBuf);
    } catch (e) {
      console.warn('[Granular] Failed to load buffer:', e.message);
      this._generateNoiseBuffer();
    }
  }

  // Generate a noise buffer as fallback
  _generateNoiseBuffer(seconds = 4) {
    const sr = this.ctx.sampleRate;
    const len = sr * seconds;
    this.buffer = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Pink-ish noise (filtered white noise)
        d[i] = (Math.random() * 2 - 1) * 0.5;
        if (i > 0) d[i] = d[i] * 0.3 + d[i - 1] * 0.7;
      }
    }
  }

  start() {
    if (this.alive) return;
    if (!this.buffer) this._generateNoiseBuffer();
    this.alive = true;
    this._masterGain.gain.setTargetAtTime(this.params.masterGain, this.ctx.currentTime, 2);
    this._scheduleGrain();
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    this._masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 2);
    if (this.grainTimer) clearTimeout(this.grainTimer);
  }

  _scheduleGrain() {
    if (!this.alive) return;

    this._spawnGrain();

    // Schedule next grain (with some jitter)
    const interval = 1 / this.params.density;
    const jitter = interval * 0.3 * (Math.random() - 0.5);
    this.grainTimer = setTimeout(() => this._scheduleGrain(), (interval + jitter) * 1000);
  }

  _spawnGrain() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = this.params;
    const buf = this.buffer;
    if (!buf) return;

    // Grain parameters with randomization
    const grainDur = p.grainSize + (Math.random() - 0.5) * p.grainSizeSpread * 2;
    const pos = p.position + (Math.random() - 0.5) * p.positionSpread * 2;
    const startTime = Math.max(0, Math.min(pos, 1)) * buf.duration;
    const rate = p.pitch + (Math.random() - 0.5) * p.pitchSpread * 2;
    const panVal = p.pan + (Math.random() - 0.5) * p.panSpread * 2;

    // Source
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.1, rate);

    // Grain envelope (trapezoidal)
    const env = ctx.createGain();
    const attackTime = grainDur * p.attack;
    const releaseTime = grainDur * p.release;
    env.gain.value = 0;
    env.gain.setTargetAtTime(0.8, now, attackTime * 0.3);
    env.gain.setTargetAtTime(0, now + grainDur - releaseTime, releaseTime * 0.3);

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq + (Math.random() - 0.5) * 500;
    filter.Q.value = p.filterQ;

    // Panner
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, panVal));

    // Route: src → env → filter → panner → master + reverb
    src.connect(env);
    env.connect(filter);
    filter.connect(panner);
    panner.connect(this._masterGain);
    panner.connect(this._reverb);

    src.start(now, startTime, grainDur + 0.1);

    // Cleanup
    setTimeout(() => {
      try { src.disconnect(); } catch(e){}
      try { env.disconnect(); } catch(e){}
      try { filter.disconnect(); } catch(e){}
      try { panner.disconnect(); } catch(e){}
    }, (grainDur + 1) * 1000);
  }

  destroy() {
    this.stop();
    try { this._masterGain.disconnect(); } catch(e){}
    try { this._reverb.disconnect(); } catch(e){}
    try { this._reverbGain.disconnect(); } catch(e){}
  }

  static PRESETS = {
    'Cloud Texture': {
      position: 0.5, positionSpread: 0.3, grainSize: 0.1, grainSizeSpread: 0.05,
      density: 20, pitch: 1, pitchSpread: 0.1, panSpread: 0.8,
      attack: 0.4, release: 0.5, filterFreq: 4000, reverb: 0.3
    },
    'Frozen Ambience': {
      position: 0.3, positionSpread: 0.02, grainSize: 0.2, grainSizeSpread: 0.05,
      density: 8, pitch: 0.5, pitchSpread: 0.02, panSpread: 0.6,
      attack: 0.5, release: 0.5, filterFreq: 2000, reverb: 0.5
    },
    'Rain Particles': {
      position: 0.5, positionSpread: 0.5, grainSize: 0.02, grainSizeSpread: 0.01,
      density: 40, pitch: 1.5, pitchSpread: 0.5, panSpread: 1,
      attack: 0.1, release: 0.3, filterFreq: 8000, reverb: 0.2
    },
    'Stretching Time': {
      position: 0.5, positionSpread: 0.01, grainSize: 0.15, grainSizeSpread: 0.02,
      density: 12, pitch: 0.25, pitchSpread: 0.01, panSpread: 0.3,
      attack: 0.5, release: 0.5, filterFreq: 3000, reverb: 0.4
    },
    'Shimmering Dust': {
      position: 0.5, positionSpread: 0.4, grainSize: 0.03, grainSizeSpread: 0.02,
      density: 30, pitch: 2, pitchSpread: 0.3, panSpread: 0.9,
      attack: 0.2, release: 0.4, filterFreq: 6000, reverb: 0.35
    }
  };

  loadPreset(name) {
    const preset = GranularEngine.PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => this.setParam(k, v));
  }
}
