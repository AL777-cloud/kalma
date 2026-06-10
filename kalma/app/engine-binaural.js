/* Kálma — Binaural Beats Engine
   Two oscillators with frequency offset, panned L/R */

class EngineBinaural {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.layersBus;
    this.active = false;
    this.oscL = null;
    this.oscR = null;
    this.gainL = null;
    this.gainR = null;
    this.panL = null;
    this.panR = null;
    this.baseFreq = 200; // carrier frequency
    this.beatFreq = 2;   // difference = perceived beat
  }

  // Frequency presets (beat frequency in Hz)
  static PRESETS = {
    delta: { beat: 2, base: 150 },    // 0.5–4 Hz: deep sleep
    theta: { beat: 6, base: 200 },    // 4–8 Hz: meditation
    alpha: { beat: 10, base: 220 },   // 8–13 Hz: calm focus
    beta:  { beat: 20, base: 250 }    // 13–30 Hz: alertness
  };

  setFrequency(preset) {
    const p = EngineBinaural.PRESETS[preset];
    if (!p) return;

    this.baseFreq = p.base;
    this.beatFreq = p.beat;

    if (this.active && this.oscL && this.oscR) {
      const now = this.ctx.currentTime;
      this.oscL.frequency.setTargetAtTime(this.baseFreq, now, 0.5);
      this.oscR.frequency.setTargetAtTime(this.baseFreq + this.beatFreq, now, 0.5);
    }
  }

  start() {
    if (this.active) return;
    this.active = true;

    const now = this.ctx.currentTime;

    // Left ear
    this.oscL = this.ctx.createOscillator();
    this.oscL.type = 'sine';
    this.oscL.frequency.value = this.baseFreq;
    this.gainL = this.ctx.createGain();
    this.gainL.gain.value = 0;
    this.panL = this.ctx.createStereoPanner();
    this.panL.pan.value = -1; // full left
    this.oscL.connect(this.gainL);
    this.gainL.connect(this.panL);
    this.panL.connect(this.output);
    this.oscL.start(now);

    // Right ear
    this.oscR = this.ctx.createOscillator();
    this.oscR.type = 'sine';
    this.oscR.frequency.value = this.baseFreq + this.beatFreq;
    this.gainR = this.ctx.createGain();
    this.gainR.gain.value = 0;
    this.panR = this.ctx.createStereoPanner();
    this.panR.pan.value = 1; // full right
    this.oscR.connect(this.gainR);
    this.gainR.connect(this.panR);
    this.panR.connect(this.output);
    this.oscR.start(now);

    // Fade in
    this.gainL.gain.setTargetAtTime(0.12, now, 1.5);
    this.gainR.gain.setTargetAtTime(0.12, now, 1.5);

    console.log('[Kálma Binaural] Started:', this.baseFreq, 'Hz + beat', this.beatFreq, 'Hz');
  }

  stop() {
    if (!this.active) return;
    this.active = false;

    const now = this.ctx.currentTime;

    // Fade out
    if (this.gainL) this.gainL.gain.setTargetAtTime(0, now, 1);
    if (this.gainR) this.gainR.gain.setTargetAtTime(0, now, 1);

    // Cleanup after fade
    setTimeout(() => {
      try { this.oscL.stop(); this.oscL.disconnect(); } catch(e){}
      try { this.oscR.stop(); this.oscR.disconnect(); } catch(e){}
      try { this.gainL.disconnect(); } catch(e){}
      try { this.gainR.disconnect(); } catch(e){}
      try { this.panL.disconnect(); } catch(e){}
      try { this.panR.disconnect(); } catch(e){}
      this.oscL = this.oscR = this.gainL = this.gainR = this.panL = this.panR = null;
    }, 3000);

    console.log('[Kálma Binaural] Stopped');
  }

  toggle() {
    if (this.active) this.stop();
    else this.start();
  }
}
