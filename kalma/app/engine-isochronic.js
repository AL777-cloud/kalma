/* Kálma — Isochronic Tones Engine
   Amplitude-modulated tone that pulses on/off at target frequency */

class EngineIsochronic {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.layersBus;
    this.active = false;
    this.carrier = null;     // main tone oscillator
    this.modulator = null;   // LFO that pulses the amplitude
    this.modGain = null;     // modulation depth
    this.outputGain = null;  // master gain for this layer
    this.carrierFreq = 300;  // carrier tone Hz
    this.pulseFreq = 6;      // pulses per second
  }

  static PRESETS = {
    delta: { pulse: 2, carrier: 200 },
    theta: { pulse: 6, carrier: 300 },
    alpha: { pulse: 10, carrier: 350 },
    beta:  { pulse: 20, carrier: 400 }
  };

  setFrequency(preset) {
    const p = EngineIsochronic.PRESETS[preset];
    if (!p) return;

    this.carrierFreq = p.carrier;
    this.pulseFreq = p.pulse;

    if (this.active) {
      const now = this.ctx.currentTime;
      if (this.carrier) this.carrier.frequency.setTargetAtTime(this.carrierFreq, now, 0.3);
      if (this.modulator) this.modulator.frequency.setTargetAtTime(this.pulseFreq, now, 0.3);
    }
  }

  start() {
    if (this.active) return;
    this.active = true;

    const now = this.ctx.currentTime;

    // Carrier tone — soft sine
    this.carrier = this.ctx.createOscillator();
    this.carrier.type = 'sine';
    this.carrier.frequency.value = this.carrierFreq;

    // Output gain — controlled by modulator for pulsing effect
    // We use a gain node whose gain is modulated between 0 and 1
    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.value = 0; // will be driven by modulator

    // Modulator — square-ish LFO for sharp on/off pulses
    // We use a sine LFO into a waveshaper to make it more pulse-like
    this.modulator = this.ctx.createOscillator();
    this.modulator.type = 'sine';
    this.modulator.frequency.value = this.pulseFreq;

    // Waveshaper to make the sine more pulse-like (sharper edges)
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      // Soft clipping — makes sine more square-ish but not harsh
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;

    // Modulation gain — scales the LFO output
    this.modGain = this.ctx.createGain();
    this.modGain.gain.value = 0.1; // will fade in

    // Route: modulator → shaper → modGain → outputGain.gain
    this.modulator.connect(shaper);
    shaper.connect(this.modGain);
    this.modGain.connect(this.outputGain.gain);

    // Also set a DC offset so gain oscillates between ~0 and ~0.2
    // We do this by setting the base gain and letting mod swing it
    this.outputGain.gain.value = 0.1;

    // Route: carrier → outputGain → bus
    this.carrier.connect(this.outputGain);
    this.outputGain.connect(this.output);

    this.carrier.start(now);
    this.modulator.start(now);

    // Fade in
    this.modGain.gain.setTargetAtTime(0.1, now, 1.5);

    // Store shaper ref for cleanup
    this._shaper = shaper;

    console.log('[Kálma Isochronic] Started:', this.pulseFreq, 'Hz pulse @', this.carrierFreq, 'Hz');
  }

  stop() {
    if (!this.active) return;
    this.active = false;

    const now = this.ctx.currentTime;

    // Fade out
    if (this.modGain) this.modGain.gain.setTargetAtTime(0, now, 0.8);
    if (this.outputGain) this.outputGain.gain.setTargetAtTime(0, now, 0.8);

    setTimeout(() => {
      try { this.carrier.stop(); this.carrier.disconnect(); } catch(e){}
      try { this.modulator.stop(); this.modulator.disconnect(); } catch(e){}
      try { this._shaper.disconnect(); } catch(e){}
      try { this.modGain.disconnect(); } catch(e){}
      try { this.outputGain.disconnect(); } catch(e){}
      this.carrier = this.modulator = this.modGain = this.outputGain = this._shaper = null;
    }, 2500);

    console.log('[Kálma Isochronic] Stopped');
  }

  toggle() {
    if (this.active) this.stop();
    else this.start();
  }
}
