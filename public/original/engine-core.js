/* Kálma — Engine Core
   AudioContext, master gain, reverb, bus routing */

class EngineCore {
  constructor() {
    this.ctx = null;
    this.master = null;    // master gain
    this.musicBus = null;  // music submix
    this.ambienceBus = null; // ambience submix
    this.layersBus = null;   // meditation layers submix
    this.voiceBus = null;    // voice guidance submix
    this.reverb = null;      // convolver for reverb
    this.reverbSend = null;  // reverb send gain
    this.dry = null;         // dry signal gain
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master output
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    // Compressor/limiter — gentle, preserves dynamics
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 2.5;
    this.compressor.attack.value = 0.010;
    this.compressor.release.value = 0.15;

    // EQ chain — warmth + air
    this._warmthEQ = this.ctx.createBiquadFilter();
    this._warmthEQ.type = 'lowshelf';
    this._warmthEQ.frequency.value = 200;
    this._warmthEQ.gain.value = 1.5;

    this._airEQ = this.ctx.createBiquadFilter();
    this._airEQ.type = 'highshelf';
    this._airEQ.frequency.value = 6000;
    this._airEQ.gain.value = 2.5;

    // Route: compressor → warmth → air → master
    this.compressor.connect(this._warmthEQ);
    this._warmthEQ.connect(this._airEQ);
    this._airEQ.connect(this.master);

    // Dry path
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.7;
    this.dry.connect(this.compressor);

    // Reverb
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._generateImpulse(4.5, 2.0);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.compressor);

    // Submix buses
    this.musicBus = this._createBus(0.8);
    this.ambienceBus = this._createBus(0.65);
    this.layersBus = this._createBus(0.55);
    this.voiceBus = this._createBus(0.7);

    console.log('[Kálma Core] Initialized');
  }

  _createBus(volume) {
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.dry);
    gain.connect(this.reverbSend);
    return gain;
  }

  // Generate high-quality synthetic impulse response
  _generateImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const predelayMs = 45;
    const earlyEndMs = 140;
    const length = Math.ceil(rate * (duration + predelayMs / 1000));
    const buffer = this.ctx.createBuffer(2, length, rate);
    const predelaySmp = Math.floor(rate * predelayMs / 1000);
    const earlyEndSmp = Math.floor(rate * earlyEndMs / 1000);

    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);

      // Early reflections — discrete taps for sense of space
      const numTaps = 7 + Math.floor(Math.random() * 3);
      for (let r = 0; r < numTaps; r++) {
        const tapPos = predelaySmp + Math.floor(Math.random() * (earlyEndSmp - predelaySmp));
        const tapAmp = 0.35 * Math.pow(0.72, r);
        const burstLen = 2 + Math.floor(Math.random() * 3);
        for (let b = 0; b < burstLen && tapPos + b < length; b++) {
          d[tapPos + b] += (Math.random() * 2 - 1) * tapAmp * (1 - b / burstLen);
        }
      }

      // Diffuse tail with stereo decorrelation
      for (let i = earlyEndSmp; i < length; i++) {
        const t = (i - earlyEndSmp) / (length - earlyEndSmp);
        const noise = Math.random() * 2 - 1;
        const envelope = Math.pow(1 - t, decay);
        const modulation = 1 + 0.08 * Math.sin(t * 45 + ch * 2.7);
        d[i] += noise * envelope * modulation;
      }

      // Air absorption filter
      let prev = 0;
      const coeff = 0.4;
      for (let i = earlyEndSmp; i < length; i++) {
        d[i] = prev + coeff * (d[i] - prev);
        prev = d[i];
      }
    }
    return buffer;
  }

  setMasterVolume(v) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setMusicVolume(v) {
    this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setAmbienceVolume(v) {
    this.ambienceBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setLayersVolume(v) {
    this.layersBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setVoiceVolume(v) {
    this.voiceBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setReverbAmount(v) {
    this.reverbSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    this.dry.gain.setTargetAtTime(1 - v * 0.5, this.ctx.currentTime, 0.1);
  }

  // Fade master to 0 then suspend
  fadeOutAndSuspend(duration) {
    const d = duration || 5;
    const timeConst = d * 0.3; // smooth exponential curve
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, timeConst);
    return new Promise(resolve => {
      // Wait for gain to be essentially silent before suspending
      setTimeout(() => {
        this.ctx.suspend().then(resolve);
      }, d * 1200); // extra buffer so it's truly silent
    });
  }

  // Resume then fade master back in
  resumeAndFadeIn(targetVolume, duration) {
    const d = duration || 4;
    const vol = targetVolume !== undefined ? targetVolume : 0.7;
    this.master.gain.value = 0;
    return this.ctx.resume().then(() => {
      this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, d * 0.3);
    });
  }

  suspend() { return this.ctx.suspend(); }
  resume() { return this.ctx.resume(); }
  close() { return this.ctx.close(); }

  get currentTime() { return this.ctx.currentTime; }
  get sampleRate() { return this.ctx.sampleRate; }
  get state() { return this.ctx.state; }
}
