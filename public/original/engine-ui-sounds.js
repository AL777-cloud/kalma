/* Kálma — UI Sounds
   Synthesized interface sounds */

class UISound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
  }

  init() {
    if (this.ready) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    this.ready = true;
  }

  _ensureCtx() {
    if (!this.ready) this.init();
  }

  // ── Hover Sound ──
  // Warm, muted — like a soft breath touching a wind chime in the distance
  hover() {
    this._ensureCtx();
    const now = this.ctx.currentTime;

    // Muted tone — warm, low-mid range
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 420 + Math.random() * 40; // slight randomness each hover

    // Soft harmonic — a fifth above, barely there
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = osc.frequency.value * 1.498; // almost-fifth, slight detuning

    // Heavy low-pass — removes all brightness
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.7;

    const g1 = this.ctx.createGain();
    g1.gain.value = 0;
    g1.gain.setTargetAtTime(0.05, now, 0.008); // soft attack
    g1.gain.setTargetAtTime(0, now + 0.06, 0.08); // gentle fade

    const g2 = this.ctx.createGain();
    g2.gain.value = 0;
    g2.gain.setTargetAtTime(0.02, now + 0.01, 0.01);
    g2.gain.setTargetAtTime(0, now + 0.08, 0.1);

    osc.connect(g1); g1.connect(filt);
    osc2.connect(g2); g2.connect(filt);
    filt.connect(this.master);

    osc.start(now); osc.stop(now + 0.3);
    osc2.start(now + 0.01); osc2.stop(now + 0.35);
  }

  // ── Fade / Dissolve Sound ──
  // Descending shimmer with long reverb tail — plays as screen fades out
  fadeOut() {
    this._ensureCtx();
    const now = this.ctx.currentTime;

    // Reverb
    const convolver = this.ctx.createConvolver();
    const irLen = this.ctx.sampleRate * 2;
    const irBuf = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
    }
    convolver.buffer = irBuf;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.6;
    convolver.connect(wet);
    wet.connect(this.master);

    // Descending tones — dissolving
    const freqs = [784, 659, 523]; // G5, E5, C5 — falling
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.frequency.setTargetAtTime(freq * 0.97, now + i * 0.07, 0.2); // slight droop

      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.05, now + i * 0.07, 0.015);
      g.gain.setTargetAtTime(0, now + i * 0.07 + 0.12, 0.25);

      osc.connect(g);
      g.connect(convolver);
      g.connect(this.master);
      osc.start(now + i * 0.07);
      osc.stop(now + 2.5);
    });

    // Soft noise wash — like a breath out
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 2000;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.03;
    noise.connect(filt); filt.connect(ng); ng.connect(convolver); ng.connect(this.master);
    noise.start(now);
  }

  // ── Begin Journey ──
  // Plays custom audio file — preloaded for instant playback on click
  preloadBeginJourney() {
    if (this._beginBuffer || this._beginLoading) return;
    this._beginLoading = true;
    fetch('./audio/ui/begin-journey.wav').then(r => r.arrayBuffer()).then(buf => {
      const ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(buf);
    }).then(audioBuffer => {
      this._beginBuffer = audioBuffer;
      this._beginLoading = false;
    }).catch(e => {
      this._beginLoading = false;
      console.warn('[K\u00e1lma] Begin journey preload failed:', e.message);
    });
  }

  beginJourney() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const playBuffer = (audioBuffer) => {
      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start();
    };

    if (this._beginBuffer) {
      playBuffer(this._beginBuffer);
    } else {
      // Fallback fetch if preload didn't finish
      fetch('./audio/ui/begin-journey.wav').then(r => r.arrayBuffer()).then(buf => {
        return this.ctx.decodeAudioData(buf);
      }).then(audioBuffer => {
        this._beginBuffer = audioBuffer;
        playBuffer(audioBuffer);
      }).catch(e => console.warn('[K\u00e1lma] Begin journey sound failed:', e.message));
    }
  }

  // ── Selection Click ──
  // Soft, smooth click — short sine ping with fast decay
  click() {
    this._ensureCtx();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.frequency.setTargetAtTime(660, now, 0.02);

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.15, now, 0.003);
    gain.gain.setTargetAtTime(0, now + 0.04, 0.04);

    // Soft filter
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 3000;

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // ── Screen Transition ──
  // Dreamy shimmer — rising harmonics with reverb tail
  transition() {
    this._ensureCtx();
    const now = this.ctx.currentTime;

    // Reverb for this sound
    const convolver = this.ctx.createConvolver();
    const irLen = this.ctx.sampleRate * 1.5;
    const irBuf = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.5);
    }
    convolver.buffer = irBuf;

    const dry = this.ctx.createGain();
    dry.gain.value = 0.3;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.7;
    convolver.connect(wet);
    dry.connect(this.master);
    wet.connect(this.master);

    // Rising shimmer — 3 staggered tones
    const freqs = [523, 659, 784]; // C5, E5, G5
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.frequency.setTargetAtTime(freq * 1.02, now + i * 0.06, 0.3);

      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.07, now + i * 0.06, 0.02);
      g.gain.setTargetAtTime(0, now + i * 0.06 + 0.15, 0.3);

      osc.connect(g);
      g.connect(dry);
      g.connect(convolver);
      osc.start(now + i * 0.06);
      osc.stop(now + 2);
    });

    // Subtle high sparkle
    const sparkle = this.ctx.createOscillator();
    sparkle.type = 'sine';
    sparkle.frequency.value = 2093; // C7
    const sg = this.ctx.createGain();
    sg.gain.value = 0;
    sg.gain.setTargetAtTime(0.03, now + 0.1, 0.01);
    sg.gain.setTargetAtTime(0, now + 0.25, 0.2);
    sparkle.connect(sg);
    sg.connect(dry);
    sg.connect(convolver);
    sparkle.start(now + 0.1);
    sparkle.stop(now + 2);
  }

  // ── Warning / Limit Sound ──
  // Small thick thud — low muted hit
  warning() {
    this._ensureCtx();
    const now = this.ctx.currentTime;

    // Low thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 180;
    osc.frequency.setTargetAtTime(90, now, 0.03);

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.2, now, 0.005);
    gain.gain.setTargetAtTime(0, now + 0.06, 0.06);

    // Second knock
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 150;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0;
    g2.gain.setTargetAtTime(0.12, now + 0.08, 0.005);
    g2.gain.setTargetAtTime(0, now + 0.13, 0.05);

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 500;

    osc.connect(filt); osc2.connect(filt);
    filt.connect(gain); filt.connect(g2);
    gain.connect(this.master);
    g2.connect(this.master);
    osc.start(now); osc.stop(now + 0.3);
    osc2.start(now + 0.08); osc2.stop(now + 0.4);
  }

  // ── Welcome Ambient Drone — plays custom audio file ──

  // Preload the drone buffer so startWelcomeDrone is instant
  preloadWelcomeDrone() {
    if (this._welcomeBuffer || this._welcomeLoading) return;
    this._welcomeLoading = true;
    const src = './audio/ui/welcome-drone.mp3';
    fetch(src).then(r => r.arrayBuffer()).then(buf => {
      const ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(buf);
    }).then(audioBuffer => {
      this._welcomeBuffer = audioBuffer;
      this._welcomeLoading = false;
    }).catch(e => {
      this._welcomeLoading = false;
      console.warn('[Kalma] Welcome drone preload failed:', e.message);
    });
  }

  startWelcomeDrone() {
    this._ensureCtx();
    if (this._welcomeSource) return;

    this._welcomeGain = this.ctx.createGain();
    this._welcomeGain.gain.value = 0;
    this._welcomeGain.connect(this.ctx.destination);
    // Fast fade in (was 1.5s time constant)
    this._welcomeGain.gain.setTargetAtTime(0.25, this.ctx.currentTime + 0.05, 0.4);

    const playBuffer = (audioBuffer) => {
      if (!this._welcomeGain) return;
      this._welcomeSource = this.ctx.createBufferSource();
      this._welcomeSource.buffer = audioBuffer;
      this._welcomeSource.loop = true;
      this._welcomeSource.connect(this._welcomeGain);
      this._welcomeSource.start();
    };

    if (this._welcomeBuffer) {
      playBuffer(this._welcomeBuffer);
    } else {
      // Fallback fetch if preload didn't finish
      const src = './audio/ui/welcome-drone.mp3';
      fetch(src).then(r => r.arrayBuffer()).then(buf => {
        return this.ctx.decodeAudioData(buf);
      }).then(audioBuffer => {
        this._welcomeBuffer = audioBuffer;
        playBuffer(audioBuffer);
      }).catch(e => {
        console.warn('[Kalma] Welcome drone failed:', e.message);
      });
    }
  }

  stopWelcomeDrone() {
    if (!this._welcomeSource && !this._welcomeGain) return;

    // Fade out via gain node
    if (this._welcomeGain) {
      try {
        this._welcomeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      } catch(e) {}
    }

    const source = this._welcomeSource;
    const gain = this._welcomeGain;
    this._welcomeSource = null;
    this._welcomeGain = null;

    // Stop source after fade
    setTimeout(() => {
      try { if (source) source.stop(); } catch(e) {}
      try { if (gain) gain.disconnect(); } catch(e) {}
    }, 1000);
  }
}

// Global instance
const uiSound = new UISound();
