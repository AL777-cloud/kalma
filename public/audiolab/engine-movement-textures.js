/* Kálma Player — Movement Textures Engine
   Spawns organic, sporadic textural elements in response to movement:
   - Chimes/bells (smooth FM synthesis)
   - Flute wisps (sine + breath noise, gentle vibrato)
   - Scattered piano notes (pluck-like, reverb-heavy, single notes)
   - Water drops (round pluck with pitch bend, like droplets)
   - Reverse swells (crescendo from silence then cut — anticipation)
   
   Each element fires at random intervals (Poisson-like) with random pitch,
   velocity, and stereo position — all scale-aware. The density increases
   with movement intensity: still=silent, neutral=sparse, walking=moderate, active=rich.
   
   Pure Web Audio API — no samples needed. */

class MovementTextures {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;     // connect to core.musicBus (gets reverb)
    this.running = false;
    this._movement = 'still';
    this._timers = [];        // active setTimeout ids
    this._activeNodes = [];   // nodes to clean up

    // Musical context (set from adaptive engine)
    this._scale = [0, 2, 4, 7, 9];
    this._baseFreq = 220;
    this._filterFreq = 800;

    // Master gain for all textures
    this._master = ctx.createGain();
    this._master.gain.value = 0;
    this._master.connect(output);

    // Density config per movement state
    // intervalRange = [min, max] ms between spawns per voice type
    this._config = {
      still: null,  // no textures
      neutral: {
        chimes:  { intervalRange: [4000, 9000],  volume: [0.02, 0.06], enabled: true },
        flute:   { intervalRange: [8000, 16000], volume: [0.01, 0.04], enabled: false },
        piano:   { intervalRange: [6000, 14000], volume: [0.02, 0.05], enabled: true },
        reverse: { intervalRange: [25000, 50000],volume: [0.02, 0.04], enabled: true },
      },
      walking: {
        chimes:  { intervalRange: [2000, 5000],  volume: [0.03, 0.08], enabled: true },
        flute:   { intervalRange: [5000, 12000], volume: [0.02, 0.06], enabled: true },
        piano:   { intervalRange: [3000, 7000],  volume: [0.03, 0.06], enabled: true },
        reverse: { intervalRange: [18000, 40000],volume: [0.02, 0.05], enabled: true },
      },
      active: {
        chimes:  { intervalRange: [1200, 3000],  volume: [0.04, 0.10], enabled: true },
        flute:   { intervalRange: [3000, 8000],  volume: [0.03, 0.07], enabled: true },
        piano:   { intervalRange: [2000, 5000],  volume: [0.03, 0.07], enabled: true },
        reverse: { intervalRange: [12000, 30000],volume: [0.03, 0.06], enabled: true },
      }
    };
  }

  /* ── Public API ── */

  start() {
    if (this.running) return;
    this.running = true;
    // Fade in master
    this._master.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.5);
    this._scheduleAll();
  }

  stop() {
    this.running = false;
    // Clear all timers
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    // Fade out master
    if (this._master) {
      this._master.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
    }
    // Clean up active nodes after fade
    setTimeout(() => this._cleanupNodes(), 4000);
  }

  setMovement(state) {
    if (state === this._movement) return;
    const prev = this._movement;
    this._movement = state;
    console.log('[Kálma Textures] Movement: ' + prev + ' → ' + state);

    // Clear existing schedule, re-schedule for new movement
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];

    if (this.running && state !== 'still') {
      this._scheduleAll();
    }
  }

  setMusicalContext(scale, baseFreq, filterFreq) {
    this._scale = scale || this._scale;
    this._baseFreq = baseFreq || this._baseFreq;
    this._filterFreq = filterFreq || this._filterFreq;
  }

  /* ── Scheduling ── */

  _scheduleAll() {
    const cfg = this._config[this._movement];
    if (!cfg) return;

    if (cfg.chimes && cfg.chimes.enabled)   this._scheduleVoice('chimes', cfg.chimes);
    if (cfg.flute && cfg.flute.enabled)     this._scheduleVoice('flute', cfg.flute);
    if (cfg.piano && cfg.piano.enabled)     this._scheduleVoice('piano', cfg.piano);
    if (cfg.reverse && cfg.reverse.enabled) this._scheduleVoice('reverse', cfg.reverse);
  }

  _scheduleVoice(type, cfg) {
    if (!this.running || this._movement === 'still') return;

    const [minMs, maxMs] = cfg.intervalRange;
    const delay = minMs + Math.random() * (maxMs - minMs);

    const timerId = setTimeout(() => {
      if (!this.running || this._movement === 'still') return;

      // Remove this timer from tracking
      this._timers = this._timers.filter(t => t !== timerId);

      // Pick random volume in range
      const vol = cfg.volume[0] + Math.random() * (cfg.volume[1] - cfg.volume[0]);

      // Spawn the voice
      switch (type) {
        case 'chimes':  this._spawnChime(vol); break;
        case 'flute':   this._spawnFlute(vol); break;
        case 'piano':   this._spawnPiano(vol); break;
        case 'reverse': this._spawnReverseSwell(vol); break;
      }

      // Re-schedule next one
      this._scheduleVoice(type, cfg);
    }, delay);

    this._timers.push(timerId);
  }

  /* ── Random helpers ── */

  _randomScaleFreq(octaveMin, octaveMax) {
    // Pick a random note from current scale in a given octave range
    const degree = this._scale[Math.floor(Math.random() * this._scale.length)];
    const octave = octaveMin + Math.floor(Math.random() * (octaveMax - octaveMin + 1));
    return this._baseFreq * Math.pow(2, octave + degree / 12);
  }

  _randomPan() {
    // Random stereo position: -0.8 to +0.8
    return (Math.random() - 0.5) * 1.6;
  }

  /* ── Voice: Chimes/Bells ──
     FM synthesis with fast attack, medium decay, metallic shimmer.
     Carrier + modulator with high ratio = bell-like harmonics. */

  _spawnChime(vol) {
    const now = this.ctx.currentTime;
    const freq = this._randomScaleFreq(1, 2); // lower octaves — warm, not shrill

    // Carrier oscillator
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    // Modulator — gentler ratios for smooth, rounded bell tone
    const modulator = this.ctx.createOscillator();
    const modRatio = [1.0, 1.5, 2.0, 2.5][Math.floor(Math.random() * 4)]; // more harmonic = smoother
    modulator.frequency.value = freq * modRatio;
    modulator.type = 'sine';

    const modGain = this.ctx.createGain();
    // Lower modulation depth — smooth shimmer, not metallic clang
    modGain.gain.value = freq * 0.25;
    modGain.gain.setTargetAtTime(freq * 0.02, now, 0.6); // slow decay to pure tone

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    // Envelope: soft attack, long gentle decay
    const env = this.ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.06);        // softer attack (~60ms)
    env.gain.setTargetAtTime(vol * 0.5, now + 0.06, 0.3);    // gentle drop
    env.gain.setTargetAtTime(0, now + 0.8, 1.2);              // long, smooth ring-out

    // Lowpass instead of highpass — roll off the harshness
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(freq * 2.5, 2000); // cap brightness
    lp.Q.value = 0.3;

    // Stereo pan
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this._randomPan();

    // Route: carrier → lp → env → pan → master
    carrier.connect(lp);
    lp.connect(env);
    env.connect(pan);
    pan.connect(this._master);

    carrier.start(now);
    modulator.start(now);

    // Self-cleanup after decay
    const duration = 5;
    carrier.stop(now + duration);
    modulator.stop(now + duration);

    const nodes = [carrier, modulator, modGain, env, lp, pan];
    this._trackNodes(nodes, duration);
  }

  /* ── Voice: Flute Wisps ──
     Sine wave + breath noise, slow attack, gentle vibrato, medium sustain. */

  _spawnFlute(vol) {
    const now = this.ctx.currentTime;
    const freq = this._randomScaleFreq(1, 2); // mid-high octaves

    // Main tone (sine — pure, flute-like)
    const tone = this.ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = freq;

    // Gentle vibrato
    const vibrato = this.ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 4 + Math.random() * 2; // 4-6 Hz
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 0; // starts with no vibrato
    vibGain.gain.setTargetAtTime(freq * 0.008, now + 0.5, 0.5); // vibrato fades in
    vibrato.connect(vibGain);
    vibGain.connect(tone.frequency);

    // Breath noise layer
    const noiseLen = 2 * this.ctx.sampleRate;
    const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuf;

    // Bandpass the noise around the fundamental (breathy quality)
    const noiseBP = this.ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = freq;
    noiseBP.Q.value = 2;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = vol * 0.15; // very subtle breath

    noise.connect(noiseBP);
    noiseBP.connect(noiseGain);

    // Tone envelope: slow attack, gentle sustain, medium release
    const noteLength = 1.5 + Math.random() * 2; // 1.5-3.5s
    const env = this.ctx.createGain();
    env.gain.value = 0;
    env.gain.setTargetAtTime(vol, now, 0.4);                          // slow rise (~1.2s to peak)
    env.gain.setTargetAtTime(vol * 0.6, now + noteLength * 0.5, 0.3); // gentle swell down
    env.gain.setTargetAtTime(0, now + noteLength, 0.6);                // fade out

    // Noise envelope follows tone but softer
    noiseGain.gain.setTargetAtTime(0, now + noteLength * 0.8, 0.4);

    // Lowpass — warm, not harsh
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(freq * 3, 3000);
    lp.Q.value = 0.3;

    // Stereo
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this._randomPan();

    // Route: tone → lp → env → pan → master
    //        noise → noiseBP → noiseGain → pan → master
    tone.connect(lp);
    lp.connect(env);
    env.connect(pan);
    noiseGain.connect(pan);
    pan.connect(this._master);

    tone.start(now);
    vibrato.start(now);
    noise.start(now);

    const duration = noteLength + 3;
    tone.stop(now + duration);
    vibrato.stop(now + duration);
    noise.stop(now + noteLength + 1.5);

    const nodes = [tone, vibrato, vibGain, noise, noiseBP, noiseGain, env, lp, pan];
    this._trackNodes(nodes, duration);
  }

  /* ── Voice: Scattered Piano Notes ──
     Soft, warm piano-like tones. Gentle attack, muted brightness.
     Pure sine + quiet triangle for body. Feels like distant keys
     played through felt — intimate and non-intrusive. */

  _spawnPiano(vol) {
    const now = this.ctx.currentTime;
    const freq = this._randomScaleFreq(0, 1); // lower range — warmer

    // Two soft oscillators: sine fundamental + quiet sine an octave up
    const oscs = [];

    const mix = this.ctx.createGain();
    mix.gain.value = 1;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';   // pure, warm
    osc1.frequency.value = freq;
    osc1.detune.value = -2;
    osc1.connect(mix);
    osc1.start(now);
    oscs.push(osc1);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq;
    osc2.detune.value = 2;
    osc2.connect(mix);
    osc2.start(now);
    oscs.push(osc2);

    // Very quiet octave harmonic for subtle warmth
    const harm = this.ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.value = freq * 2;
    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.1; // barely there
    harm.connect(harmGain);
    harmGain.connect(mix);
    harm.start(now);
    oscs.push(harm);

    // Soft envelope: gentle attack, slow decay, long warm tail
    const env = this.ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.04);         // 40ms — soft, not percussive
    env.gain.setTargetAtTime(vol * 0.6, now + 0.04, 0.2);     // gentle settle
    env.gain.setTargetAtTime(vol * 0.2, now + 0.5, 0.6);      // long sustain
    env.gain.setTargetAtTime(0, now + 1.5, 1.5);              // very long fade out

    // Dark lowpass — like piano played through felt
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(freq * 2, 1200);  // much darker ceiling
    lp.Q.value = 0.3;
    lp.frequency.setTargetAtTime(Math.min(freq * 1.2, 800), now + 0.1, 1.0); // closes slowly

    // Stereo
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this._randomPan();

    // Route: oscs → mix → lp → env → pan → master
    mix.connect(lp);
    lp.connect(env);
    env.connect(pan);
    pan.connect(this._master);

    const duration = 6;
    oscs.forEach(o => o.stop(now + duration));

    const nodes = [...oscs, harmGain, mix, lp, env, pan];
    this._trackNodes(nodes, duration);
  }

  /* ── Voice: Reverse Swells ──
     A warm tone that crescendos from silence to a gentle peak,
     then dissolves softly. Creates subtle anticipation without
     being dramatic or cold. All sine — pure warmth. */

  _spawnReverseSwell(vol) {
    const now = this.ctx.currentTime;
    const freq = this._randomScaleFreq(0, 1); // low register for warmth

    // Two detuned sines — both sine for maximum warmth
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;
    osc1.detune.value = -3;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq;
    osc2.detune.value = 3;

    const mix = this.ctx.createGain();
    mix.gain.value = 1;
    osc1.connect(mix);
    osc2.connect(mix);

    // Reverse envelope: silence → very slow build → soft peak → gentle dissolve
    const buildTime = 3.5 + Math.random() * 2.5; // 3.5-6s — slower, more patient
    const env = this.ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(vol * 0.7, now + buildTime);  // doesn't hit full vol
    env.gain.setTargetAtTime(vol * 0.15, now + buildTime, 0.3);        // soft dissolve, not abrupt
    env.gain.setTargetAtTime(0, now + buildTime + 0.5, 0.8);           // long gentle fade

    // Filter stays dark throughout — warm blanket, never bright
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150; // starts very dark
    lp.Q.value = 0.2;        // no resonance — smooth
    // Opens gently but stays warm (caps at 800Hz)
    lp.frequency.setTargetAtTime(
      Math.min(freq * 1.5, 800), now, buildTime * 0.5  // slow open
    );
    // Closes back down as sound dissolves
    lp.frequency.setTargetAtTime(200, now + buildTime, 0.6);

    // Stereo
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this._randomPan() * 0.4; // centered, intimate

    // Route
    mix.connect(lp);
    lp.connect(env);
    env.connect(pan);
    pan.connect(this._master);

    osc1.start(now);
    osc2.start(now);

    const duration = buildTime + 4;
    osc1.stop(now + duration);
    osc2.stop(now + duration);

    const nodes = [osc1, osc2, mix, env, lp, pan];
    this._trackNodes(nodes, duration);
  }

  /* ── Node tracking & cleanup ── */

  _trackNodes(nodes, lifetime) {
    const entry = { nodes, expireAt: Date.now() + lifetime * 1000 };
    this._activeNodes.push(entry);

    // Schedule cleanup
    setTimeout(() => {
      nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
      this._activeNodes = this._activeNodes.filter(e => e !== entry);
    }, (lifetime + 0.5) * 1000);
  }

  _cleanupNodes() {
    this._activeNodes.forEach(entry => {
      entry.nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
    });
    this._activeNodes = [];
  }
}
