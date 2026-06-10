/* Kálma Player — Adaptive Music Engine v3
   Simple, safe approach: continuous drones that morph parameters.
   NO rapid note on/off cycling. Each instrument holds one sustained sound.
   Parameters change gradually — the sound transforms, never restarts. */

class AdaptiveEngine {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.musicBus;
    this.running = false;
    this._analyser = null;

    // Music Brain — semantic-to-music intelligence
    this.brain = new MusicBrain();

    // Simple voice pool (texture drones)
    this.voices = [];
    this.padGain = null;
    this.evolveTimer = null;
    this.chordTimer = null;

    // VA/FM/WT instruments disabled — piano is the lead voice now.
    // Keeping synth instances for potential future use but not routing audio.
    this._vaBus = this.ctx.createGain();
    this._vaBus.gain.value = 0;
    this._vaBus.connect(this.output);

    this._fmBus = this.ctx.createGain();
    this._fmBus.gain.value = 0;
    this._fmBus.connect(this.output);

    this._wtBus = this.ctx.createGain();
    this._wtBus.gain.value = 0;
    this._wtBus.connect(this.output);

    this.vaSynth = new VASynth(this.ctx, this._vaBus);
    this.vaSynth.setParam('masterGain', 0);

    this.fmSynth = new FMSynth(this.ctx, this._fmBus);
    this.fmSynth.setParam('masterGain', 0);

    this.wavetable = new WavetableSynth(this.ctx, this._wtBus);
    this.wavetable.setParam('masterGain', 0);

    // Instrument voice tracking
    this._vaNote = null;
    this._fmNote = null;
    this._wtNote = null;
    this._instTimer = null;

    // Melody engine (piano) — v4 piano, the lead voice
    this._melodyBus = this.ctx.createGain();
    this._melodyBus.gain.value = 0.55;
    this._melodyBus.connect(this.output);
    this.melody = new MelodyEngine(this.ctx, this._melodyBus);
    this.melody.setTimbre('piano');
    this._pianoMode = false;
    this._lastMovement = 'still';
    this._movementVoice = null;  // current movement-reactive pad

    // Movement textures engine (chimes, flute wisps, scattered piano)
    this._texturesBus = this.ctx.createGain();
    this._texturesBus.gain.value = 0.85;
    this._texturesBus.connect(this.output);
    this.textures = new MovementTextures(this.ctx, this._texturesBus);

    // Beats engine
    this._beatsBus = this.ctx.createGain();
    this._beatsBus.gain.value = 0.7;
    this._beatsBus.connect(this.output);
    this.beats = new KalmaBeats(this.ctx, this._beatsBus);
    this._beatsActive = false;
    this._beatsEnabled = false;  // user toggle — OFF by default, matches UI

    this.params = {
      baseFreq: 220,
      scale: [0, 2, 4, 7, 9],
      chords: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]],
      density: 1,           // minimal drone bed — piano is the focus
      filterFreq: 500,      // darker, more filtered drones
      filterQ: 0.5,
      reverbMix: 0.55,      // wetter — floating sensation
      attack: 8,            // very slow fade-in
      release: 8,           // long tails
      detune: 10            // less chorus, cleaner
    };
    this.chordIndex = 0;
  }

  // All musical intelligence lives in MusicBrain — no static presets here

  /* ═══ APPLY CONTEXT (via Music Brain) ═══ */
  applyContext(ctx) {
    const musical = this.brain.interpret({
      timeOfDay: ctx.timeOfDay,
      weather: ctx.weather,
      season: ctx.season,
      movement: ctx.movement,
      holiday: ctx.holiday,
      temp: ctx.temp
    });
    console.log('[K\u00e1lma Brain] Context \u2192 Music:', musical);
    // Gentle morph — don't restart voices, just nudge parameters
    this._morphTo(musical);

    // Movement changed? Trigger an obvious new sound layer
    if (ctx.movement && ctx.movement !== this._lastMovement) {
      this._onMovementChange(this._lastMovement, ctx.movement);
      this._lastMovement = ctx.movement;
    }
  }

  /* Gentle parameter morph — adjusts existing sounds without killing them */
  _morphTo(newParams) {
    const now = this.ctx.currentTime;

    // Smoothly blend numeric params (don't replace wholesale)
    const blend = (key, speed) => {
      if (newParams[key] !== undefined && this.params[key] !== undefined) {
        // Ease toward new value (30% blend per update — slow drift)
        this.params[key] = this.params[key] * (1 - speed) + newParams[key] * speed;
      }
    };

    blend('filterFreq', 0.20);
    blend('reverbMix', 0.18);
    blend('detune', 0.12);
    blend('density', 0.12);
    blend('baseFreq', 0.08);
    blend('attack', 0.12);
    blend('release', 0.10);

    // Update scale/chords only if they actually changed
    if (newParams.scale) this.params.scale = newParams.scale;
    if (newParams.chords) this.params.chords = newParams.chords;

    // Keep movement textures in sync with musical context
    if (this.textures) {
      this.textures.setMusicalContext(this.params.scale, this.params.baseFreq, this.params.filterFreq);
    }

    // Apply reverb smoothly
    this.core.setReverbAmount(this.params.reverbMix);

    // Morph existing voices' filters toward new filterFreq
    this.voices.forEach(v => {
      if (v.alive && v.filter) {
        v.filter.frequency.setTargetAtTime(this.params.filterFreq, now, 1.5);
      }
    });

    // Morph pad voices' filters too
    if (this.padVoices) {
      this.padVoices.forEach(pv => {
        if (pv.alive && pv.filter) {
          pv.filter.frequency.setTargetAtTime(
            Math.min(this.params.filterFreq * 0.8, 1200), now, 1.5
          );
        }
      });
    }

    // Update instrument presets only if explicitly different
    if (newParams.vaPreset && newParams.vaPreset !== this._lastVaPreset) {
      this.vaSynth.loadPreset(newParams.vaPreset);
      this._lastVaPreset = newParams.vaPreset;
    }
    if (newParams.fmPreset && newParams.fmPreset !== this._lastFmPreset) {
      this.fmSynth.loadPreset(newParams.fmPreset);
      this._lastFmPreset = newParams.fmPreset;
    }
    if (newParams.wtPreset && newParams.wtPreset !== this._lastWtPreset) {
      this.wavetable.loadPreset(newParams.wtPreset);
      this._lastWtPreset = newParams.wtPreset;
    }

  }

  _crossfadeTo(newParams) {
    // If music is already playing, morph gently instead of restarting
    if (this.running && this.voices.length > 0) {
      // Use a slightly stronger blend than context morphs
      const now = this.ctx.currentTime;
      Object.assign(this.params, newParams);
      this.core.setReverbAmount(this.params.reverbMix);

      // Morph all existing voice filters
      this.voices.forEach(v => {
        if (v.alive && v.filter) {
          v.filter.frequency.setTargetAtTime(this.params.filterFreq, now, 1.5);
        }
      });
      if (this.padVoices) {
        this.padVoices.forEach(pv => {
          if (pv.alive && pv.filter) {
            pv.filter.frequency.setTargetAtTime(
              Math.min(this.params.filterFreq * 0.8, 1200), now, 1.5
            );
          }
        });
      }

      // Update presets
      if (newParams.vaPreset) this.vaSynth.loadPreset(newParams.vaPreset);
      if (newParams.fmPreset) this.fmSynth.loadPreset(newParams.fmPreset);
      if (newParams.wtPreset) this.wavetable.loadPreset(newParams.wtPreset);

      // Update piano with new musical context
      if (this.melody && this.melody.running) {
        this.melody.setContext(this.params.scale, this.params.baseFreq, this.params.chords, this.params);
      }
      return;
    }

    // Initial setup (not yet running) — just set params
    Object.assign(this.params, newParams);
    this.core.setReverbAmount(this.params.reverbMix);
    if (newParams.vaPreset) this.vaSynth.loadPreset(newParams.vaPreset);
    if (newParams.fmPreset) this.fmSynth.loadPreset(newParams.fmPreset);
    if (newParams.wtPreset) this.wavetable.loadPreset(newParams.wtPreset);
  }

  /* ═══ PLAYBACK ═══ */
  start() {
    if (this.running) return;
    this.running = true;

    // Pad gain bus
    if (!this.padGain) {
      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = this._pianoMode ? 0.03 : 0.10;
      this.padGain.connect(this.output);
    }

    this._evolve();
    if (this.params.chords) this._startChordProgression();
    // Start instruments after a short delay
    setTimeout(() => { if (this.running) this._scheduleInstruments(); }, 2000);

    // Start movement textures engine (chimes, flute, scattered piano)
    this.textures.setMusicalContext(this.params.scale, this.params.baseFreq, this.params.filterFreq);
    this.textures.start();

    // Piano does NOT auto-start — only activates on explicit mood shift
  }

  stop() {
    this.running = false;
    if (this.evolveTimer) clearTimeout(this.evolveTimer);
    if (this.chordTimer) clearTimeout(this.chordTimer);
    const now = this.ctx.currentTime;
    this.voices.forEach(v => {
      if (v.alive) {
        v.alive = false;
        v.gain.gain.setTargetAtTime(0, now, 3);
        setTimeout(() => {
          v.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
          try { v.lfo.stop(); v.lfo.disconnect(); } catch(e){}
          try { v.lfoGain.disconnect(); } catch(e){}
          try { v.filter.disconnect(); } catch(e){}
          try { v.gain.disconnect(); } catch(e){}
        }, 12000);
      }
    });
    this.voices = [];
    this._stopPads();
    this._stopInstruments();
    if (this.melody) this.melody.stop();
    this._stopBeats();
    // Stop movement textures
    if (this.textures) this.textures.stop();
    // Clean up movement voice
    if (this._movementVoice && this._movementVoice.alive) {
      this._movementVoice.alive = false;
      this._movementVoice.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
      try { this._movementVoice.filter.disconnect(); } catch(e){}
      try { this._movementVoice.gain.disconnect(); } catch(e){}
      this._movementVoice = null;
    }
  }

  /* ═══ TEXTURE VOICES (floating drone bed) ═══ */
  _evolve() {
    if (!this.running) return;
    this.voices = this.voices.filter(v => v.alive);

    if (this.voices.length < this.params.density) {
      this._spawnVoice();
    }

    const interval = 12 + Math.random() * 15;  // sparse — one drone at a time
    this.evolveTimer = setTimeout(() => this._evolve(), interval * 1000);
  }

  _getRandomNote() {
    const scale = this.params.scale;
    const degree = scale[Math.floor(Math.random() * scale.length)];
    const octave = Math.floor(Math.random() * 2);
    return this.params.baseFreq * Math.pow(2, (degree / 12) + octave);
  }

  _spawnVoice() {
    const now = this.ctx.currentTime;
    const freq = this._getRandomNote();
    const p = this.params;

    const oscs = [];
    const detuneAmounts = [-p.detune, 0, p.detune];
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.02 + Math.random() * 0.04;
    lfoGain.gain.value = p.filterFreq * 0.1;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 1 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detuneAmounts[i] + (Math.random() - 0.5) * 4;
      osc.connect(filter);
      osc.start(now);
      oscs.push(osc);
    }

    // Stereo placement — each voice floats in a different position
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.7;  // spread across ±0.35
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.output);

    const attackTime = Math.max(p.attack, 8);
    const spawnVol = this._pianoMode ? 0.012 : 0.06;
    gain.gain.setTargetAtTime(spawnVol, now, attackTime);

    const lifetime = 25 + Math.random() * 30;  // long, slow-breathing drones
    const voice = { oscs, gain, filter, lfo, lfoGain, pan, freq, alive: true };

    setTimeout(() => {
      if (voice.alive) this._fadeOutVoice(voice, this.ctx.currentTime);
    }, lifetime * 1000);

    this.voices.push(voice);
  }

  _fadeOutVoice(voice, now) {
    voice.alive = false;
    const releaseTime = Math.max(this.params.release, 5);
    voice.gain.gain.setTargetAtTime(0, now, releaseTime);
    setTimeout(() => {
      voice.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
      try { voice.lfo.stop(); voice.lfo.disconnect(); } catch(e){}
      try { voice.lfoGain.disconnect(); } catch(e){}
      try { voice.filter.disconnect(); } catch(e){}
      try { voice.gain.disconnect(); } catch(e){}
      try { if (voice.pan) voice.pan.disconnect(); } catch(e){}
    }, (releaseTime + 4) * 1000);
  }

  /* ═══ CHORD PADS (slow, overlapping) ═══ */
  padVoices = [];

  _startChordProgression() {
    if (!this.params.chords) return;
    const chords = this.params.chords;
    this.chordIndex = 0;

    if (!this.padGain) {
      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = this._pianoMode ? 0.03 : 0.10;
      this.padGain.connect(this.output);
    }

    const playChord = () => {
      if (!this.running || !chords) return;
      const chord = chords[this.chordIndex % chords.length];
      this.chordIndex++;
      const now = this.ctx.currentTime;

      // Fade old pads very slowly
      const oldPads = this.padVoices;
      this.padVoices = [];
      oldPads.forEach(pv => {
        if (pv.alive) {
          pv.alive = false;
          pv.gain.gain.setTargetAtTime(0, now, 8);
          setTimeout(() => {
            pv.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
            try { pv.filter.disconnect(); } catch(e){}
            try { pv.gain.disconnect(); } catch(e){}
          }, 28000);
        }
      });

      // Spawn pad for each note (max 3)
      chord.slice(0, 3).forEach((semitone, idx) => {
        const freq = this.params.baseFreq * Math.pow(2, semitone / 12);
        const octave = idx === 0 ? 0.5 : 1;
        const finalFreq = freq * octave;

        const gain = this.ctx.createGain();
        gain.gain.value = 0;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(this.params.filterFreq * 0.6, 600);  // dark, under piano
        filter.Q.value = 0.4;

        const oscs = [];
        const det = [-this.params.detune * 1.2, -this.params.detune * 0.4,
                     this.params.detune * 0.4, this.params.detune * 1.2];

        for (let i = 0; i < 4; i++) {
          const osc = this.ctx.createOscillator();
          osc.type = i % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.value = finalFreq;
          osc.detune.value = det[i] + (Math.random() - 0.5) * 6;
          osc.connect(filter);
          osc.start(now);
          oscs.push(osc);
        }

        filter.connect(gain);
        gain.connect(this.padGain);

        const attackTime = 10 + idx * 2;  // very slow bloom
        const targetVol = (this._pianoMode ? 0.006 : 0.03) / chord.length;
        gain.gain.setTargetAtTime(targetVol, now + idx * 1.5, attackTime);

        this.padVoices.push({ oscs, gain, filter, alive: true });
      });

      // Trigger instrument notes with each chord change
      this._scheduleInstruments();

      const interval = 35000 + Math.random() * 25000;  // slower chord changes
      this.chordTimer = setTimeout(playChord, interval);
    };

    this.chordTimer = setTimeout(playChord, 5000);  // first chord delayed
  }

  _stopPads() {
    const now = this.ctx.currentTime;
    this.padVoices.forEach(pv => {
      if (pv.alive) {
        pv.alive = false;
        pv.gain.gain.setTargetAtTime(0, now, 4);
        setTimeout(() => {
          pv.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
          try { pv.filter.disconnect(); } catch(e){}
          try { pv.gain.disconnect(); } catch(e){}
        }, 15000);
      }
    });
    this.padVoices = [];
  }

  /* ═══ INSTRUMENT LAYER (VA + FM + Wavetable — one note each, very sparse) ═══ */
  _scheduleInstruments() {
    if (!this.running) return;

    const baseNote = Math.round(69 + 12 * Math.log2(this.params.baseFreq / 440));
    const scale = this.params.scale;
    const pickNote = (octaveOffset) => {
      const degree = scale[Math.floor(Math.random() * scale.length)];
      return baseNote + degree + octaveOffset * 12;
    };

    // VA Synth: one sustained root drone (changes with chord)
    if (this._vaNote !== null) this.vaSynth.noteOff(this._vaNote);
    this._vaNote = pickNote(-1); // low octave
    this.vaSynth.noteOn(this._vaNote, 0.6);

    // Wavetable: one pad note
    if (this._wtNote !== null) this.wavetable.noteOff(this._wtNote);
    this._wtNote = pickNote(0);
    this.wavetable.noteOn(this._wtNote, 0.55);

    // FM Synth: one texture note, slightly delayed
    setTimeout(() => {
      if (!this.running) return;
      if (this._fmNote !== null) this.fmSynth.noteOff(this._fmNote);
      this._fmNote = pickNote(0);
      this.fmSynth.noteOn(this._fmNote, 0.45);
    }, 3000);

    // Next instrument change with the next chord
    this._instTimer = null; // chord progression triggers this
  }

  _stopInstruments() {
    if (this._vaNote !== null) { this.vaSynth.noteOff(this._vaNote); this._vaNote = null; }
    if (this._fmNote !== null) { this.fmSynth.noteOff(this._fmNote); this._fmNote = null; }
    if (this._wtNote !== null) { this.wavetable.noteOff(this._wtNote); this._wtNote = null; }
    if (this._instTimer) { clearTimeout(this._instTimer); this._instTimer = null; }
  }

  /* ═══ PROMPT MOOD (via Music Brain) ═══ */
  applyPromptMood(text) {
    const musical = this.brain.interpret({ text });
    console.log('[K\u00e1lma Brain] Text "' + text + '" \u2192 Music:', musical);
    this._crossfadeTo(musical);

    // Piano activates only when user explicitly asks for piano
    const wantsPiano = /\bpiano\b/i.test(text);
    if (wantsPiano && this.melody && this.running) {
      // Kill the drone bed — piano IS the music now
      if (!this._pianoMode) {
        this._pianoMode = true;
        this._silenceDroneBed();
      }
      const pianoParams = Object.assign({}, this.params, {
        density: 1, attack: 10, reverbMix: 0.6
      });
      this.melody.setContext(this.params.scale, this.params.baseFreq, this.params.chords, pianoParams);
      if (!this.melody.running) {
        this.melody.start();
        console.log('[K\u00e1lma Piano] Activated by mood shift: "' + text + '"');
      }
    } else if (!wantsPiano && this._pianoMode) {
      // Non-piano mood shift — restore normal generative mode
      this._pianoMode = false;
      if (this.melody) this.melody.stop();
      this._restoreDroneBed();
    }
  }

  /* ═══ DUCK DRONE BED (when piano takes focus) ═══ */
  _silenceDroneBed() {
    const now = this.ctx.currentTime;
    // Duck drones to ~20% — still present, just background warmth
    this.voices.forEach(v => {
      if (v.alive && v.gain) {
        v.gain.gain.setTargetAtTime(0.012, now, 2);
      }
    });
    if (this.padVoices) {
      this.padVoices.forEach(pv => {
        if (pv.alive && pv.gain) {
          pv.gain.gain.setTargetAtTime(0.006, now, 2);
        }
      });
    }
    // Duck pad bus
    if (this.padGain) this.padGain.gain.setTargetAtTime(0.03, now, 2);
    console.log('[K\u00e1lma] Drone bed ducked — piano takes focus');
  }

  /* ═══ RESTORE DRONE BED (when leaving piano mode) ═══ */
  _restoreDroneBed() {
    const now = this.ctx.currentTime;
    // Bring drones back to normal levels
    this.voices.forEach(v => {
      if (v.alive && v.gain) {
        v.gain.gain.setTargetAtTime(0.06, now, 2);
      }
    });
    if (this.padVoices) {
      this.padVoices.forEach(pv => {
        if (pv.alive && pv.gain) {
          const targetVol = 0.03 / Math.max(1, (this.params.chords ? this.params.chords[0].length : 3));
          pv.gain.gain.setTargetAtTime(targetVol, now, 2);
        }
      });
    }
    if (this.padGain) this.padGain.gain.setTargetAtTime(0.10, now, 2);
    console.log('[K\u00e1lma] Drone bed restored to full');
  }

    /* ═══ BEATS ENGINE ═══ */
  setBeatsEnabled(on) {
    this._beatsEnabled = on;
    if (on && this._beatsActive) {
      this.beats.start();
    } else if (!on) {
      this._stopBeats();
    }
  }

  _startBeats(type) {
    if (!this._beatsEnabled || !this.running) return;
    if (type) this.beats.setBeatType(type);
    if (!this.beats.alive) {
      this.beats.start();
      this._beatsActive = true;
      // Tell melody engine beats are active
      if (this.melody) this.melody.setBeatsActive(true);
      console.log('[K\u00e1lma] Beats started: ' + (type || this.beats._beatType));
    }
  }

  _stopBeats() {
    if (this.beats && this.beats.alive) {
      this.beats.stop();
    }
    this._beatsActive = false;
    if (this.melody) this.melody.setBeatsActive(false);
  }

  /* ═══ MOVEMENT-REACTIVE SOUNDS ═══ */
  _onMovementChange(from, to) {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    console.log('[K\u00e1lma] Movement: ' + from + ' \u2192 ' + to);

    // Fade out previous movement voice
    if (this._movementVoice && this._movementVoice.alive) {
      this._movementVoice.alive = false;
      // Close filter first, then fade gain — natural disappearance
      if (this._movementVoice.filter) {
        this._movementVoice.filter.frequency.setTargetAtTime(80, now, 2);
      }
      this._movementVoice.gain.gain.setTargetAtTime(0, now, 3);
      const old = this._movementVoice;
      setTimeout(() => {
        old.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
        try { old.filter.disconnect(); } catch(e){}
        try { old.gain.disconnect(); } catch(e){}
      }, 12000);
      this._movementVoice = null;
    }

    // Update movement textures engine
    if (this.textures) {
      this.textures.setMovement(to);
    }

    // Still = no extra voice, fade out beats
    if (to === 'still') {
      this._stopBeats();
      return;
    }

    // Spawn a new voice tuned to movement state
    const scale = this.params.scale;
    const base = this.params.baseFreq;

    let voiceConfig;
    if (to === 'neutral') {
      // Barely-there warmth — one octave up, very soft, long fade
      const degree = scale[Math.floor(Math.random() * scale.length)];
      voiceConfig = {
        freq: base * Math.pow(2, (degree / 12) + 1),  // one octave up (not two)
        types: ['sine', 'sine'],
        detune: [0, 4],
        filterFreq: 900,           // warmer, darker
        volume: 0.02,              // very quiet
        attack: 6.0                // slow 6s fade in
      };
    } else if (to === 'walking') {
      // Warm, gentle pad — slow bloom
      this._startBeats('dreamy');
      const degree = scale[1 + Math.floor(Math.random() * (scale.length - 1))];
      voiceConfig = {
        freq: base * Math.pow(2, (degree / 12) + 1),
        types: ['sine', 'sine', 'triangle'],    // mostly sine, warm
        detune: [-4, 0, 4],                     // tighter
        filterFreq: 800,                        // dark, under everything
        volume: 0.04,                           // soft
        attack: 6.0,                            // long 6s fade in
        lfoRate: 0.1,                           // very slow breathing
        lfoDepth: 0.12                          // subtle
      };
    } else if (to === 'active') {
      // Slightly fuller but still gentle and warm
      this._startBeats('energetic');
      const degree = scale[Math.floor(Math.random() * scale.length)];
      voiceConfig = {
        freq: base * Math.pow(2, (degree / 12) + 1),
        types: ['sine', 'sine', 'triangle'],    // smooth
        detune: [-5, 0, 5],                     // tight
        filterFreq: 900,                        // warm, not bright
        volume: 0.04,                           // same as walking
        attack: 5.0,                            // long fade in
        lfoRate: 0.12,                          // slow
        lfoDepth: 0.10                          // very subtle
      };
    } else return;

    // Build the voice
    const oscs = [];
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Start with filter closed, sweep open during fade in
    filter.frequency.value = 80;
    filter.Q.value = 0.7;

    voiceConfig.types.forEach((type, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = voiceConfig.freq;
      osc.detune.value = (voiceConfig.detune[i] || 0) + (Math.random() - 0.5) * 3;
      osc.connect(filter);
      osc.start(now);
      oscs.push(osc);
    });

    filter.connect(gain);
    gain.connect(this.output);

    // Smooth fade in — gain rises very slowly, filter sweeps open even slower
    gain.gain.setTargetAtTime(voiceConfig.volume, now, voiceConfig.attack);
    filter.frequency.setTargetAtTime(voiceConfig.filterFreq, now, voiceConfig.attack * 1.2);

    // Optional amplitude LFO for rhythmic pulse
    if (voiceConfig.lfoRate) {
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = voiceConfig.lfoRate;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = voiceConfig.volume * voiceConfig.lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start(now);
      // Store for cleanup
      oscs.push(lfo);  // will be stopped with other oscs
    }

    this._movementVoice = { oscs, gain, filter, alive: true };
    console.log('[K\u00e1lma] Movement voice spawned: ' + to + ' @ ' + Math.round(voiceConfig.freq) + 'Hz');
  }

    /* ═══ ANALYSER ═══ */
  getAnalyser() {
    if (!this._analyser) {
      this._analyser = this.ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this.output.connect(this._analyser);
    }
    return this._analyser;
  }
}
