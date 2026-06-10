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

    // Real instruments — each gets its own quiet bus
    this._vaBus = this.ctx.createGain();
    this._vaBus.gain.value = 0.35;
    this._vaBus.connect(this.output);

    this._fmBus = this.ctx.createGain();
    this._fmBus.gain.value = 0.25;
    this._fmBus.connect(this.output);

    this._wtBus = this.ctx.createGain();
    this._wtBus.gain.value = 0.3;
    this._wtBus.connect(this.output);

    this.vaSynth = new VASynth(this.ctx, this._vaBus);
    this.vaSynth.setParam('masterGain', 0.35);
    this.vaSynth.loadPreset('Ambient Drone');

    this.fmSynth = new FMSynth(this.ctx, this._fmBus);
    this.fmSynth.setParam('masterGain', 0.3);
    this.fmSynth.loadPreset('Evolving Texture');

    this.wavetable = new WavetableSynth(this.ctx, this._wtBus);
    this.wavetable.setParam('masterGain', 0.3);
    this.wavetable.loadPreset('Cinematic Pad');

    // Instrument voice tracking
    this._vaNote = null;
    this._fmNote = null;
    this._wtNote = null;
    this._instTimer = null;

    // Melody engine (piano) — activated by shift mood
    this._melodyBus = this.ctx.createGain();
    this._melodyBus.gain.value = 0.85;
    this._melodyBus.connect(this.output);
    this.melody = new MelodyEngine(this.ctx, this._melodyBus);
    this.melody.setTimbre('piano');
    this._pianoMode = false;

    this.params = {
      baseFreq: 220,
      scale: [0, 2, 4, 7, 9],
      chords: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]],
      density: 3,
      filterFreq: 800,
      filterQ: 1,
      reverbMix: 0.35,
      attack: 5,
      release: 6,
      detune: 15
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
    this._crossfadeTo(musical);
  }

  _crossfadeTo(newParams) {
    const now = this.ctx.currentTime;

    // Let old voices naturally decay (don't kill them)
    this.voices.forEach(v => {
      if (v.alive) {
        v.alive = false;
        v.gain.gain.setTargetAtTime(0, now, 6);
        setTimeout(() => {
          v.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
          try { v.lfo.stop(); v.lfo.disconnect(); } catch(e){}
          try { v.lfoGain.disconnect(); } catch(e){}
          try { v.filter.disconnect(); } catch(e){}
          try { v.gain.disconnect(); } catch(e){}
        }, 22000);
      }
    });
    this.voices = [];

    // Release instrument notes before transition
    this._stopInstruments();

    // Apply new params
    Object.assign(this.params, newParams);
    this.core.setReverbAmount(this.params.reverbMix);

    // Load instrument presets from brain
    if (newParams.vaPreset) this.vaSynth.loadPreset(newParams.vaPreset);
    if (newParams.fmPreset) this.fmSynth.loadPreset(newParams.fmPreset);
    if (newParams.wtPreset) this.wavetable.loadPreset(newParams.wtPreset);

    // Restart evolve + chords
    if (this.evolveTimer) clearTimeout(this.evolveTimer);
    if (this.chordTimer) clearTimeout(this.chordTimer);
    this.chordIndex = 0;
    if (this.running) {
      this._evolve();
      if (this.params.chords) this._startChordProgression();
    }
  }

  /* ═══ PLAYBACK ═══ */
  start() {
    if (this.running) return;
    this.running = true;

    // Pad gain bus
    if (!this.padGain) {
      this.padGain = this.ctx.createGain();
      this.padGain.gain.value = 0.25;
      this.padGain.connect(this.output);
    }

    this._evolve();
    if (this.params.chords) this._startChordProgression();
    // Start instruments after a short delay
    setTimeout(() => { if (this.running) this._scheduleInstruments(); }, 2000);

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
  }

  /* ═══ TEXTURE VOICES (floating drone bed) ═══ */
  _evolve() {
    if (!this.running || this._pianoMode) return;
    this.voices = this.voices.filter(v => v.alive);

    if (this.voices.length < this.params.density) {
      this._spawnVoice();
    }

    const interval = (4 + Math.random() * 8) / 0.8;
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

    // Stereo placement — each voice in a different position
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.7;
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.output);

    const attackTime = Math.max(p.attack, 5);
    gain.gain.setTargetAtTime(0.18 / p.density, now, attackTime);

    const lifetime = 15 + Math.random() * 20;
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
      this.padGain.gain.value = 0.25;
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
        filter.frequency.value = Math.min(this.params.filterFreq * 0.8, 1200);
        filter.Q.value = 0.7;

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

        const attackTime = 6 + idx * 1.5;
        const targetVol = 0.08 / chord.length;
        gain.gain.setTargetAtTime(targetVol, now + idx * 1.2, attackTime);

        this.padVoices.push({ oscs, gain, filter, alive: true });
      });

      // Trigger instrument notes with each chord change
      this._scheduleInstruments();

      const interval = 25000 + Math.random() * 15000;
      this.chordTimer = setTimeout(playChord, interval);
    };

    this.chordTimer = setTimeout(playChord, 3000);
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
    if (!this.running || this._pianoMode) return;

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

    // Check if user wants piano — activate melody engine
    const wantsPiano = /\bpiano\b/i.test(text);
    if (wantsPiano && this.melody && this.running) {
      this._activatePianoMode();
    } else if (this._pianoMode && !wantsPiano) {
      this._deactivatePianoMode();
    }
  }

  /* ═══ PIANO MODE ═══ */
  _activatePianoMode() {
    this._pianoMode = true;
    const now = this.ctx.currentTime;

    // Stop instruments and chord timer — no new pads/synth voices
    this._stopInstruments();
    this._vaBus.gain.setTargetAtTime(0, now, 1.5);
    this._fmBus.gain.setTargetAtTime(0, now, 1.5);
    this._wtBus.gain.setTargetAtTime(0, now, 1.5);
    if (this.chordTimer) { clearTimeout(this.chordTimer); this.chordTimer = null; }
    // Drone bed stays as-is — existing voices keep playing at current volume

    // Start piano
    const pianoParams = Object.assign({}, this.params, {
      density: 1, attack: 10, reverbMix: 0.6
    });
    this.melody.setContext(this.params.scale, this.params.baseFreq, this.params.chords, pianoParams);
    if (!this.melody.running) {
      this.melody.start();
    }
    console.log('[K\u00e1lma Wellness] Piano mode activated');
  }

  _deactivatePianoMode() {
    this._pianoMode = false;
    const now = this.ctx.currentTime;
    // Stop piano
    if (this.melody) this.melody.stop();
    // Restore drone/pad/synth volumes
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
    this._vaBus.gain.setTargetAtTime(0.35, now, 2);
    this._fmBus.gain.setTargetAtTime(0.25, now, 2);
    this._wtBus.gain.setTargetAtTime(0.3, now, 2);
    console.log('[K\u00e1lma Wellness] Piano mode deactivated, drones restored');
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
