/* Kálma Player — Core Audio Engine */

class KalmaCore {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this._started = false;

    // ═══ NODE GARBAGE COLLECTOR ═══
    // Prevents Web Audio node accumulation that crashes the browser.
    // Any engine can call core.scheduleDispose(nodes, delaySec) to register
    // nodes for cleanup. The GC sweeps every 2s and disconnects expired nodes.
    this._disposeQueue = [];  // { nodes: [...], expireAt: audioTime }
    this._gcInterval = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master gain
    this.master = this.ctx.createGain();
    this.master.gain.value = 0; // Start silent
    this.master.connect(this.ctx.destination);

    // Compressor/limiter — sits between dry/wet sum and master
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;    // only catch peaks
    this.compressor.knee.value = 20;          // soft knee — gentle transition
    this.compressor.ratio.value = 2.5;        // lighter ratio — preserve dynamics
    this.compressor.attack.value = 0.010;     // slower attack — let transients through
    this.compressor.release.value = 0.15;     // fast release — breathing
    // Stereo widener — subtle mid-side enhancement
    this._stereoWidener = this.ctx.createStereoPanner();
    this._stereoWidener.pan.value = 0;  // center — the widening happens in the reverb/voices

    // High-shelf EQ — add air and sparkle to the top end
    this._airEQ = this.ctx.createBiquadFilter();
    this._airEQ.type = 'highshelf';
    this._airEQ.frequency.value = 6000;
    this._airEQ.gain.value = 2.5;  // gentle lift — clarity without harshness

    // Low-shelf warmth
    this._warmthEQ = this.ctx.createBiquadFilter();
    this._warmthEQ.type = 'lowshelf';
    this._warmthEQ.frequency.value = 200;
    this._warmthEQ.gain.value = 1.5;  // subtle warmth

    this.compressor.connect(this._warmthEQ);
    this._warmthEQ.connect(this._airEQ);
    this._airEQ.connect(this.master);

    // Reverb send
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.3;
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.7;
    // Route: dryGain + reverbGain → compressor → master → destination
    this.dryGain.connect(this.compressor);
    this.reverbGain.connect(this.compressor);
    this._createReverb();

    // Music bus
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(this.dryGain);
    this.musicBus.connect(this.reverbGain);

    // Ambience bus (less reverb)
    this.ambienceBus = this.ctx.createGain();
    this.ambienceBus.gain.value = 0.55;
    this.ambienceBus.connect(this.dryGain);

    // Layers bus (binaural, isochronic, meditation)
    this.layersBus = this.ctx.createGain();
    this.layersBus.gain.value = 0.55;
    this.layersBus.connect(this.dryGain);
  }

  _createReverb() {
    // High-quality reverb impulse response with:
    // 1. Pre-delay (40ms of silence) — creates separation between dry and wet
    // 2. Early reflections (40-120ms) — gives sense of physical space
    // 3. Diffuse tail (120ms-3.5s) — the actual reverb wash
    const sampleRate = this.ctx.sampleRate;
    const predelayMs = 45;
    const earlyEnd = 140; // ms
    const tailLength = 4.5; // seconds — lush tail
    const totalLength = Math.ceil(sampleRate * (tailLength + predelayMs / 1000));
    const buffer = this.ctx.createBuffer(2, totalLength, sampleRate);

    const predelaySamples = Math.floor(sampleRate * predelayMs / 1000);
    const earlyEndSample = Math.floor(sampleRate * earlyEnd / 1000);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);

      // Phase 1: Pre-delay (silence)
      // Already zero-initialized

      // Phase 2: Early reflections (discrete echoes, like walls of a room)
      // 6-8 sparse reflections with decreasing amplitude
      const numReflections = 6 + Math.floor(Math.random() * 3);
      for (let r = 0; r < numReflections; r++) {
        const reflTime = predelaySamples + Math.floor(Math.random() * (earlyEndSample - predelaySamples));
        const reflAmp = 0.4 * Math.pow(0.7, r); // decreasing amplitude
        // Each reflection is a short burst (2-4 samples) for a tap-like quality
        const burstLen = 2 + Math.floor(Math.random() * 3);
        for (let b = 0; b < burstLen && reflTime + b < totalLength; b++) {
          data[reflTime + b] += (Math.random() * 2 - 1) * reflAmp * (1 - b / burstLen);
        }
      }

      // Phase 3: Diffuse tail (smooth exponential decay with high-frequency rolloff)
      for (let i = earlyEndSample; i < totalLength; i++) {
        const t = (i - earlyEndSample) / (totalLength - earlyEndSample); // 0-1
        const noise = Math.random() * 2 - 1;
        // Exponential decay with warmth (high frequencies decay faster)
        const envelope = Math.pow(1 - t, 2.2);
        // Modulate for richness (subtle chorus in the tail)
        const modulation = 1 + 0.08 * Math.sin(t * 45 + ch * 2.7);  // wider L/R difference
        data[i] += noise * envelope * modulation;
      }

      // Apply gentle lowpass shape to the tail (simulate air absorption)
      // Simple one-pole filter over the tail portion
      let prev = 0;
      const coeff = 0.4; // balanced — warm but not muddy
      for (let i = earlyEndSample; i < totalLength; i++) {
        data[i] = prev + coeff * (data[i] - prev);
        prev = data[i];
      }
    }

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = buffer;
    // Route: musicBus → reverb → reverbGain → compressor
    this.reverb.connect(this.reverbGain);
  }

  setReverbAmount(wet) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.reverbGain.gain.setTargetAtTime(wet, now, 2);
    this.dryGain.gain.setTargetAtTime(1 - wet * 0.5, now, 2);
  }

  setMasterVolume(vol) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
  }

  fadeIn(duration = 3) {
    if (!this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(1.0, now, duration / 3);
  }

  fadeOut(duration = 3) {
    if (!this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, now, duration / 3);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }
}
