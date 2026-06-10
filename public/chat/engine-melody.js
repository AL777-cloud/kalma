/* Kálma Player — Generative Melody Engine v2
   Piano-first generative music with real musical figures.
   
   Musical principles implemented:
   - Two-hand simulation (left hand accompaniment + right hand melody)
   - Alberti bass, broken chords, arpeggios, ostinato, pedal point
   - Melodic contour (arch, ascending, descending, wave)
   - Motif development (repetition with variation)
   - Tension/resolution (approach notes, leading tones)
   - Dynamic phrasing (crescendo/decrescendo within phrases)
   - Rubato (subtle timing humanization)
   - Chord-aware harmony */

class MelodyEngine {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.running = false;
    this.melodyTimer = null;
    this.phraseTimer = null;
    this.noteTimers = [];
    this._masterGain = null;
    this._reverbGain = null;
    this._reverb = null;

    // Musical context (set from adaptive engine)
    this.scale = [0, 2, 4, 7, 9];
    this.baseFreq = 220;
    this.chords = [[0, 4, 7]];
    this.timbre = 'ambient';  // neutral — no instrument until shift mood requests one
    this.mood = 'neutral'; // neutral, sad, bright, dark, tense

    // SoundFont engine reference (removed)
    this._soundfont = null;
    this._useSoundFont = false;

    // Polyphony limiter — prevents Web Audio node explosion
    this._activeNoteCount = 0;
    this._maxPolyphony = 24; // max concurrent notes (piano needs ~15 nodes each!)

    // External BPM sync (from phrase engine)
    this._externalBpm = null;

    // Beat awareness — when beats are active, piano plays around the groove
    this._beatsActive = false;

    // VA Soft Keys synth instance (sine + sine, warm EP-like tone)
    this._keysSynth = null;

    // Piano sampler (real samples)
    this._pianoSampler = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._initAudio();

    this._scheduleNextMelody();
  }

  stop() {
    this.running = false;
    if (this.melodyTimer) clearTimeout(this.melodyTimer);
    if (this.phraseTimer) clearTimeout(this.phraseTimer);
    this.noteTimers.forEach(t => clearTimeout(t));
    this.noteTimers = [];
    this._activeNoteCount = 0;
    if (this._masterGain) {
      this._masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 1);
    }
  }

  setContext(scale, baseFreq, chords, params) {
    const prevMood = this.mood;
    const prevScale = JSON.stringify(this.scale);
    this.scale = scale || this.scale;
    this.baseFreq = baseFreq || this.baseFreq;
    this.chords = chords || this.chords;
    // Detect emotional mood from musical parameters
    if (params) {
      this.mood = this._detectMood(params);
    }
    // If piano/keys is playing continuously and context changed meaningfully,
    // trigger a new section so the mood shift is audible immediately
    if (this.running && (this.timbre === 'piano' || this.timbre === 'keys')) {
      const moodChanged = prevMood !== this.mood;
      const scaleChanged = scale && JSON.stringify(scale) !== prevScale;
      if (moodChanged || scaleChanged) {
        this._restartPianoSection();
      }
    }
  }

  /* Smooth crossfade to a new piano section with updated musical context.
     The old notes ring out naturally (reverb tail carries them).
     New section fades in underneath — no silence gap, no abrupt cut. */
  _restartPianoSection() {
    // Don't cancel already-playing notes — let them ring out through reverb.
    // Only cancel FUTURE scheduled notes (ones that haven't sounded yet).
    const now = this.ctx.currentTime;
    const cutoffMs = 3000; // allow notes within next 3s to still play
    
    // Cancel the section continuation timer
    if (this.phraseTimer) { clearTimeout(this.phraseTimer); this.phraseTimer = null; }
    
    // Cancel future note timers (but not ones about to fire)
    const keep = [];
    this.noteTimers.forEach(t => {
      // We can't inspect setTimeout delay, so cancel all and rely on
      // the reverb tail of already-triggered notes to carry the transition
      clearTimeout(t);
    });
    this.noteTimers = [];
    
    // Crossfade: briefly lower volume, then start new section which fades in
    if (this._masterGain) {
      const currentVol = this._masterGain.gain.value;
      // Gentle dip (not silence) — old reverb tails still audible
      this._masterGain.gain.setTargetAtTime(currentVol * 0.3, now, 1.5);
      // After 3-4s, new section starts and brings volume back up
    }
    
    // Start new section after a musical pause (3-5s) — enough for old notes to decay
    const transitionTime = 3000 + Math.random() * 2000;
    this.phraseTimer = setTimeout(() => {
      if (!this.running) return;
      // Volume back up for new section
      if (this._masterGain) {
        this._masterGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 1);
      }
      this._playContinuousPiano();
    }, transitionTime);
    console.log('[Kálma Piano] Mood shift → crossfading to new section (' + this.mood + ')');
    // Adjust reverb wet/dry for the new mood (spatial character)
    this._adjustReverbForMood();
  }

  /* Adjust reverb balance based on mood — creates distinct sonic spaces */
  _adjustReverbForMood() {
    if (!this._reverbGain || !this._dryGain) return;
    const now = this.ctx.currentTime;
    let wet, dry;
    switch (this.mood) {
      case 'sleepy':
      case 'dark':
        wet = 0.8; dry = 0.35; // Very wet — floating, diffuse
        break;
      case 'sad':
      case 'melancholy':
      case 'despair':
        wet = 0.75; dry = 0.4; // Spacious, notes dissolve into air
        break;
      case 'calm':
      case 'neutral':
        wet = 0.65; dry = 0.55; // Balanced — clear but atmospheric
        break;
      case 'bright':
        wet = 0.5; dry = 0.7; // Drier — more definition, more presence
        break;
      default:
        wet = 0.65; dry = 0.55;
    }
    this._reverbGain.gain.setTargetAtTime(wet, now, 2); // slow 2s transition
    this._dryGain.gain.setTargetAtTime(dry, now, 2);
  }

  _detectMood(params) {
    const f = params.filterFreq || 800;
    const r = params.reverbMix || 0.35;
    const d = params.detune || 15;
    const density = params.density || 3;
    const attack = params.attack || 5;
    const scale = params.scale || [];
    // Scale analysis
    const hasMinor3rd = scale.includes(3);
    const hasMajor3rd = scale.includes(4);
    const hasFlat6 = scale.includes(8);
    const hasFlat2 = scale.includes(1);
    const isPentatonic = scale.length <= 5;
    
    // Sadness family (minor + dark + spacious)
    if (hasMinor3rd && f < 600 && r > 0.25) {
      if (hasFlat2 || d > 8) return 'despair';
      if (hasFlat6) return 'sad';
      return 'melancholy';
    }
    // Sleepy/meditative (very slow, spacious, low filter, high reverb)
    if (f < 550 && r > 0.35 && attack > 5 && density <= 2) return 'sleepy';
    // Dark/mysterious
    if (f < 500 && r > 0.35) return 'dark';
    // Calm/peaceful (moderate filter, pentatonic or major, spacious)
    if (isPentatonic && f < 900 && r > 0.25 && density <= 3) return 'calm';
    if (f >= 500 && f <= 800 && r >= 0.3 && !hasFlat2) return 'calm';
    // Bright/excited (open filter, low reverb, major scale)
    if (f > 1000 && r < 0.25) return 'bright';
    if (hasMajor3rd && f > 900 && density >= 3) return 'bright';
    // Tense
    if (d > 7) return 'tense';
    return 'neutral';
  }

  setTimbre(timbre) {
    if (['piano', 'keys', 'bells', 'pluck', 'flute', 'harp'].includes(timbre)) {
      this.timbre = timbre;
      // Init VA Soft Keys on first use
      if (timbre === 'keys' && !this._keysSynth) {
        this._keysSynth = new VASynth(this.ctx, this.output);
        this._keysSynth.loadPreset('Soft Keys');
        this._keysSynth.setParam('masterGain', 0.5);
      }
    }
  }

  /* ── SoundFont integration ── */
  setSoundFont() { /* no-op — SoundFont removed */ }

  /* Sync BPM from phrase engine */
  setBpm(bpm) { this._externalBpm = Math.max(40, Math.min(140, Math.round(bpm))); }

  /* Tell melody whether beats are playing — changes performance style */
  setBeatsActive(on) { this._beatsActive = !!on; }

  /* Accept a composed motif from CompositionEngine.
     The motif is an array of { semitone, duration, velocity, accent } objects.
     Melody engine will use this as the basis for its next phrase
     instead of generating random notes. */
  setComposerMotif(motifData) {
    if (!motifData || !motifData.notes || motifData.notes.length === 0) return;
    this._composerMotif = motifData;
    this._useComposerMotif = true;
    console.log('[Melody] Received composer motif:', motifData.variation, motifData.notes.map(n => n.semitone));
  }

  /* Clear composer motif (falls back to generative behavior) */
  clearComposerMotif() {
    this._composerMotif = null;
    this._useComposerMotif = false;
  }








  /* ── Phrase-awareness: tension & structural cues from PhraseEngine ── */
  setPhraseState(tension, density, isDownbeat, isPhraseStart, recallTheme, themeToRecall) {
    this._phraseTension = tension;
    this._phraseDensity = density;
    this._phraseDownbeat = isDownbeat;
    this._phraseBoundary = isPhraseStart;
    // Theme recall: if conductor suggests recalling a motif, store it for next section
    if (recallTheme && themeToRecall) {
      this._recalledMotif = themeToRecall;
    }
  }

  triggerNow() {
    if (!this.running) return;
    if (this.melodyTimer) clearTimeout(this.melodyTimer);
    if (this.phraseTimer) clearTimeout(this.phraseTimer);
    this.noteTimers.forEach(t => clearTimeout(t));
    this.noteTimers = [];
    if (this.timbre === 'piano' || this.timbre === 'keys') {
      this._playContinuousPiano();
    } else {
      this._playMelodyPhrase();
    }
  }

  _initAudio() {
    if (this._masterGain) return;
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = 0;
    
    // Reverb — concert hall with pre-delay, early reflections, and warm diffuse tail
    const sr = this.ctx.sampleRate;
    const predelayMs = 55; // slightly longer pre-delay for piano (concert hall feel)
    const earlyEndMs = 130;
    const tailSec = 4.5;
    const totalLen = Math.ceil(sr * (tailSec + predelayMs / 1000));
    const buf = this.ctx.createBuffer(2, totalLen, sr);
    const predelaySmp = Math.floor(sr * predelayMs / 1000);
    const earlyEndSmp = Math.floor(sr * earlyEndMs / 1000);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);

      // Early reflections: 8-10 discrete taps (simulates stage/hall walls)
      const numTaps = 8 + Math.floor(Math.random() * 3);
      for (let r = 0; r < numTaps; r++) {
        const tapPos = predelaySmp + Math.floor(Math.random() * (earlyEndSmp - predelaySmp));
        const tapAmp = 0.35 * Math.pow(0.72, r);
        const burstLen = 3 + Math.floor(Math.random() * 2);
        for (let b = 0; b < burstLen && tapPos + b < totalLen; b++) {
          d[tapPos + b] += (Math.random() * 2 - 1) * tapAmp * (1 - b / burstLen);
        }
      }

      // Diffuse tail with warmth and modulation
      for (let i = earlyEndSmp; i < totalLen; i++) {
        const t = (i - earlyEndSmp) / (totalLen - earlyEndSmp);
        const noise = Math.random() * 2 - 1;
        // Slower decay (1.6 exponent) for lush piano reverb
        const envelope = Math.pow(1 - t, 1.6) * (1 + 0.08 * Math.sin(t * 35 + ch * 1.5));
        d[i] += noise * envelope;
      }

      // Air absorption filter (one-pole LP on tail)
      let prev = 0;
      const coeff = 0.35;
      for (let i = earlyEndSmp; i < totalLen; i++) {
        d[i] = prev + coeff * (d[i] - prev);
        prev = d[i];
      }
    }
    this._reverb = this.ctx.createConvolver();
    this._reverb.buffer = buf;

    // Pre-reverb lowpass to keep reverb warm (no harsh highs in the tail)
    this._reverbLP = this.ctx.createBiquadFilter();
    this._reverbLP.type = 'lowpass';
    this._reverbLP.frequency.value = 3500;
    this._reverbLP.Q.value = 0.3;

    this._reverbGain = this.ctx.createGain();
    this._reverbGain.gain.value = 0.50; // balanced — clear notes with gentle space
    this._reverbLP.connect(this._reverb);
    this._reverb.connect(this._reverbGain);
    this._reverbGain.connect(this.output);

    // Dry signal low — reverb dominates for floating feel
    this._dryGain = this.ctx.createGain();
    this._dryGain.gain.value = 0.65;

    this._masterGain.connect(this._dryGain);
    this._dryGain.connect(this.output);
    this._masterGain.connect(this._reverbLP);
  }

  _scheduleNextMelody() {
    if (!this.running) return;
    const isPianoContinuous = this.timbre === 'piano' || this.timbre === 'keys';
    if (isPianoContinuous) {
      // Piano: start immediately, plays continuously
      this._playContinuousPiano();
    } else {
      const wait = (180 + Math.random() * 120) * 1000;
      this.melodyTimer = setTimeout(() => {
        if (!this.running) return;
        this._playMelodyPhrase();
      }, wait);
    }
  }

  /* ── CONTINUOUS PIANO MODE ──
     Plays permanently with new variation sections every ~3-4 min.
     No fade-out between sections — seamless transitions.
     Uses AudioContext.currentTime for sample-accurate scheduling. */
  _playContinuousPiano() {
    if (!this.running) return;

    // Gentle volume — piano floats, never dominates
    this._masterGain.gain.setTargetAtTime(0.75, this.ctx.currentTime, 1.5);  // clear, present

    // Generate one section (a performance with a style + motif + tempo)
    const events = this._generatePianoPerformance();

    // Schedule all note events using AudioContext.currentTime for sample accuracy
    const startTime = this.ctx.currentTime + 0.05; // small buffer to avoid late scheduling
    events.forEach(evt => {
      const audioTime = startTime + evt.time / 1000; // convert ms to seconds
      const delayMs = Math.max(0, (audioTime - this.ctx.currentTime) * 1000 - 30); // fire 30ms early
      const t = setTimeout(() => {
        if (!this.running) return;
        this._playNoteAtTime(evt.freq, evt.duration, evt.velocity, audioTime);
      }, delayMs);
      this.noteTimers.push(t);
    });

    // How long this section lasts
    const sectionDuration = events.length > 0 ? events[events.length - 1].time + 3000 : 15000;

    // Long breathing pause between sections — let reverb tails dissolve
    const breathe = 3000 + Math.random() * 4000;
    this.phraseTimer = setTimeout(() => {
      if (!this.running) return;
      // Clean up old timers
      this.noteTimers = [];
      // Start next section seamlessly
      this._playContinuousPiano();
    }, sectionDuration + breathe);
  }

  _playMelodyPhrase() {
    if (!this.running) return;

    // Fade in melody gain
    this._masterGain.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.5);

    // Use composer's motif if available, otherwise generate pattern
    const events = (this._useComposerMotif && this._composerMotif)
      ? this._composerMotifToEvents(this._composerMotif)
      : this._generateSimplePattern();

    // Schedule each note event using AudioContext.currentTime for sample accuracy
    const startTime = this.ctx.currentTime + 0.05;
    events.forEach(evt => {
      const audioTime = startTime + evt.time / 1000;
      const delayMs = Math.max(0, (audioTime - this.ctx.currentTime) * 1000 - 30);
      const t = setTimeout(() => {
        if (!this.running) return;
        this._playNoteAtTime(evt.freq, evt.duration, evt.velocity, audioTime);
      }, delayMs);
      this.noteTimers.push(t);
    });

    // Total phrase duration
    const phraseDuration = events.length > 0 ? events[events.length - 1].time + 4000 : 10000;

    // Fade out at end of phrase
    const fadeOutTimer = setTimeout(() => {
      if (this._masterGain) {
        this._masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 3);
      }
    }, phraseDuration - 3000);
    this.noteTimers.push(fadeOutTimer);

    // Schedule next melody
    this.phraseTimer = setTimeout(() => {
      this._scheduleNextMelody();
    }, phraseDuration + 2000);
  }

  /* ════════════════════════════════════════════════════════════
     PIANO PERFORMANCE GENERATOR
     Inspired by: Chopin (singing melody, rubato, dynamics),
     Debussy (color, suspension, harmonic ambiguity),
     Paterlini/Einaudi (repetition with subtle variation, space)
     ════════════════════════════════════════════════════════════ */

  _generatePianoPerformance() {
    const events = [];
    const chords = this.chords.length > 0 ? this.chords : [[0, 4, 7]];
    const isSad = this.mood === 'sad' || this.mood === 'melancholy' || this.mood === 'despair';
    const isCalm = this.mood === 'calm' || this.mood === 'neutral';
    const isSleepy = this.mood === 'sleepy' || this.mood === 'dark';
    const isBright = this.mood === 'bright';
    
    // Pick a performance style (mood-aware)
    const style = isSad ? this._pickSadPianoStyle()
                : isSleepy ? this._pickSleepyPianoStyle()
                : this._pickPianoStyle();
    
    // Use recalled motif if the conductor suggested it
    const useRecalledMotif = this._recalledMotif && Math.random() < 0.6;
    if (useRecalledMotif) {
      console.log('[Kálma Melody] Recalling previous theme...');
    }
    
    // Section length and tempo — varies dramatically by mood
    const phraseTension = this._phraseTension || 0.5;
    let numCycles, bpm;
    if (isSleepy) {
      numCycles = 12 + Math.floor(Math.random() * 6);
      bpm = this._externalBpm || (40 + Math.floor(Math.random() * 12));  // slow but audible
    } else if (isSad) {
      numCycles = 12 + Math.floor(Math.random() * 6);
      bpm = this._externalBpm || (42 + Math.floor(Math.random() * 13));
    } else if (isBright) {
      numCycles = 14 + Math.floor(Math.random() * 6);
      bpm = this._externalBpm || (55 + Math.floor(Math.random() * 17));
    } else { // calm/neutral
      numCycles = 12 + Math.floor(Math.random() * 6);
      bpm = this._externalBpm || (45 + Math.floor(Math.random() * 15));  // calm but present
    }
    const beatsPerChord = 4;
    const beatMs = 60000 / bpm;
    console.log('[Kálma Piano] Mood:', this.mood, '| BPM:', bpm, '| Cycles:', numCycles);
    
    let timeMs = 0;
    
    // Generate a motif (or recall from memory)
    const motif = useRecalledMotif && this._recalledMotif
      ? this._recalledMotif
      : this._generateMotif();
    
    this._lastMotif = motif;
    if (useRecalledMotif) this._recalledMotif = null;
    this.currentMotif = motif;
    
    // ═══ STRUCTURAL ARC (classical form: Intro → Development → Climax → Resolution) ═══
    
    for (let cycle = 0; cycle < numCycles; cycle++) {
      const chord = chords[cycle % chords.length];
      const pos = cycle / numCycles;
      
      // ═══ DYNAMIC CURVE — mood-aware ═══
      let dynCurve;
      if (isSleepy) {
        // Ultra-quiet, barely there, hypnotic flat line with gentle undulation
        dynCurve = 0.15 + Math.sin(pos * Math.PI * 2) * 0.08;
      } else if (isSad) {
        // Whisper throughout, one vulnerable swell in the middle
        if (pos < 0.2) {
          dynCurve = pos / 0.2 * 0.2;
        } else if (pos < 0.5) {
          dynCurve = 0.2 + ((pos - 0.2) / 0.3) * 0.35;
        } else if (pos < 0.65) {
          dynCurve = 0.55 + Math.sin((pos - 0.5) / 0.15 * Math.PI) * 0.15;
        } else {
          dynCurve = 0.45 * Math.pow((1 - pos) / 0.35, 0.8);
        }
      } else if (isBright) {
        // More lively arc, reaches mf, playful energy
        if (pos < 0.1) {
          dynCurve = pos / 0.1 * 0.5;
        } else if (pos < 0.5) {
          dynCurve = 0.5 + ((pos - 0.1) / 0.4) * 0.45;
        } else if (pos < 0.8) {
          dynCurve = 0.85 + Math.sin((pos - 0.5) / 0.3 * Math.PI) * 0.1;
        } else {
          dynCurve = 0.7 * Math.pow((1 - pos) / 0.2, 0.6);
        }
      } else {
        // Calm/neutral: gentle arc with clear emotional peak
        if (pos < 0.12) {
          dynCurve = pos / 0.12 * 0.4;
        } else if (pos < 0.4) {
          dynCurve = 0.4 + ((pos - 0.12) / 0.28) * 0.45;
        } else if (pos < 0.7) {
          dynCurve = 0.85 + Math.sin((pos - 0.4) / 0.3 * Math.PI) * 0.15;
        } else {
          dynCurve = 0.65 * Math.pow((1 - pos) / 0.3, 0.6);
        }
      }
      
      let baseVel;
      if (isSleepy) baseVel = 0.08 + dynCurve * 0.10;  // barely there
      else if (isSad) baseVel = 0.10 + dynCurve * 0.14;
      else if (isBright) baseVel = 0.14 + dynCurve * 0.18;
      else baseVel = 0.10 + dynCurve * 0.14;  // soft, floating
      
      // ═══ BREATHING (silence as composition) — mood-aware ═══
      let breatheChance;
      if (isSleepy) breatheChance = 0.30;  // some silence
      else if (isSad) breatheChance = 0.25;
      else if (isBright) breatheChance = 0.15;
      else breatheChance = 0.20;  // calm but flowing
      if (this._beatsActive) breatheChance += 0.1;
      if (pos > 0.10 && pos < 0.90 && Math.random() < breatheChance) {
        // Long pauses — let notes ring and decay into reverb
        const breatheBeats = 3 + Math.random() * 4;
        timeMs += breatheBeats * beatMs;
        continue;
      }
      
      // ═══ TEXTURE PHASES ═══
      if (this._beatsActive) {
        const grooveEvents = this._generateGroovePiano(chord, beatsPerChord, beatMs, timeMs, baseVel, pos, cycle, motif);
        events.push(...grooveEvents);
      } else if (pos < 0.15) {
        // INTRO: Single notes from silence (Chopin Nocturne opening)
        const rhEvents = this._generateRightHand('sparse', motif, chord, beatsPerChord, beatMs, timeMs, baseVel * 0.55, cycle);
        events.push(...rhEvents);
      } else if (pos > 0.85) {
        // RESOLUTION: Dissolving, final sustained notes hanging in reverb
        const rhEvents = this._generateRightHand('sparse', motif, chord, beatsPerChord, beatMs, timeMs, baseVel * 0.45, cycle);
        events.push(...rhEvents);
      } else {
        // DEVELOPMENT: Two-hand performance
        // Left hand: supportive but clearly audible (foundation)
        const lhVel = baseVel * 0.6;
        const lhEvents = this._generateLeftHand(style.leftHand, chord, beatsPerChord, beatMs, timeMs, lhVel, cycle);
        events.push(...lhEvents);
        
        // Right hand: vary texture through the section
        let rhStyle = style.rightHand;
        // Brief chordal moment at emotional peak (Einaudi climax style)
        if (pos > 0.45 && pos < 0.6 && cycle % 4 === 0) {
          rhStyle = 'chordal';
        }
        const rhEvents = this._generateRightHand(rhStyle, motif, chord, beatsPerChord, beatMs, timeMs, baseVel, cycle);
        events.push(...rhEvents);
      }
      
      timeMs += beatsPerChord * beatMs;
    }
    
    return events;
  }

  _pickPianoStyle() {
    // Calm, spacious styles only — slow long notes, floating
    const styles = [
      { leftHand: 'pedalPoint',    rightHand: 'sparse' },
      { leftHand: 'pedalPoint',    rightHand: 'sparse' },
      { leftHand: 'pedalPoint',    rightHand: 'sparse' },
      { leftHand: 'pedalPoint',    rightHand: 'melody' },
      { leftHand: 'debussyFlow',   rightHand: 'sparse' },
      { leftHand: 'debussyFlow',   rightHand: 'impressionist' },
    ];
    return styles[Math.floor(Math.random() * styles.length)];
  }

  // Sleepy/meditative: minimal, repetitive, hypnotic
  _pickSleepyPianoStyle() {
    const styles = [
      { leftHand: 'pedalPoint',  rightHand: 'sparse' },         // held bass, isolated notes
      { leftHand: 'pedalPoint',  rightHand: 'sparse' },         // weighted toward minimal
      { leftHand: 'ostinato',    rightHand: 'sparse' },         // gentle repetitive figure
      { leftHand: 'pedalPoint',  rightHand: 'arpeggio' },       // sustained + slow arpeggio
      { leftHand: 'debussyFlow', rightHand: 'impressionist' },  // Clair de Lune-inspired
      { leftHand: 'debussyFlow', rightHand: 'sparse' },         // flowing bass, sparse melody
    ];
    return styles[Math.floor(Math.random() * styles.length)];
  }

  // Sad piano favors sparse left hand + melodic/sparse right hand
  _pickSadPianoStyle() {
    const styles = [
      { leftHand: 'pedalPoint',  rightHand: 'melody' },        // sustained bass, sad melody on top
      { leftHand: 'pedalPoint',  rightHand: 'sparse' },        // minimal, aching
      { leftHand: 'arpeggio',    rightHand: 'melody' },        // flowing broken chords under melody
      { leftHand: 'ostinato',    rightHand: 'melody' },        // repetitive sadness
      { leftHand: 'brokenChord', rightHand: 'sparse' },        // gentle chords, sparse melody
      { leftHand: 'pedalPoint',  rightHand: 'arpeggio' },      // open bass, arpeggiated upper
      { leftHand: 'debussyFlow', rightHand: 'impressionist' }, // Debussy melancholy
      { leftHand: 'debussyFlow', rightHand: 'melody' },        // flowing under sad melody
    ];
    return styles[Math.floor(Math.random() * styles.length)];
  }

  /* ═══ GROOVE-AWARE PIANO (plays around the beat when drums are active) ═══
     Musical principles:
     - Left hand anchors root WITH the kick (beat 1, 3) — rhythmic foundation
     - Right hand plays syncopated: 8th-note offbeats, anticipations, and-of patterns
     - Avoid landing hard on beat 2 & 4 (snare territory) — leave space
     - Swing feel: slight push on offbeats
     - Fewer notes overall — groove needs breathing room
     - Ghost notes (very quiet) for rhythmic texture
     - Occasional full beat rest to let drums shine */
  _pickConsonantNote(chord, scale) {
    const chordTones = chord.map(c => c % 12);
    const r = Math.random();
    if (r < 0.65 && chordTones.length > 0) {
      return chordTones[Math.floor(Math.random() * chordTones.length)];
    } else {
      return this._pickConsonantNote(chord, scale);
    }
  }

    _generateGroovePiano(chord, beats, beatMs, startTime, vel, pos, cycle, motif) {
    const events = [];
    const root = chord[0] % 12;
    const third = chord.length > 1 ? chord[1] % 12 : (root + 4) % 12;
    const fifth = chord.length > 2 ? chord[2] % 12 : (root + 7) % 12;
    const toFreq = (semi, oct) => this.baseFreq * Math.pow(2, (semi / 12) + oct);
    const swing = beatMs * 0.08; // subtle swing push

    // ── LEFT HAND: lock with the kick ──
    for (let b = 0; b < beats; b++) {
      const beatTime = startTime + b * beatMs;
      if (b === 0) {
        // Beat 1: root WITH the kick — the anchor
        events.push({
          freq: toFreq(root, -1),
          duration: 0.9 + Math.random() * 0.4,
          velocity: vel * (0.9 + Math.random() * 0.15),
          time: beatTime + (Math.random() - 0.3) * 6 // slightly early = anticipation
        });
      } else if (b === 2 && Math.random() > 0.3) {
        // Beat 3: sometimes a fifth or root (with the kick)
        const note = Math.random() > 0.5 ? fifth : root;
        events.push({
          freq: toFreq(note, -1),
          duration: 0.6 + Math.random() * 0.3,
          velocity: vel * (0.65 + Math.random() * 0.15),
          time: beatTime + (Math.random() - 0.3) * 8
        });
      } else if ((b === 1 || b === 3) && Math.random() > 0.7) {
        // Beats 2/4: GHOST notes only (very quiet, don't compete with snare)
        events.push({
          freq: toFreq(fifth, -1),
          duration: 0.2,
          velocity: vel * 0.25, // ghost
          time: beatTime + beatMs * 0.5 + swing // on the and, not on the beat
        });
      }
    }

    // ── RIGHT HAND: syncopated, plays BETWEEN beats ──
    const scale = this.scale;
    const grooveStyle = cycle % 3; // rotate through groove approaches

    if (grooveStyle === 0) {
      // Style A: Offbeat comping — chord stabs on the "and" of beats
      for (let b = 0; b < beats; b++) {
        if (Math.random() > 0.55) continue; // skip some for space
        const beatTime = startTime + b * beatMs;
        // Play on the "and" (halfway point + swing)
        const hitTime = beatTime + beatMs * 0.5 + swing + (Math.random() - 0.5) * 12;
        // 2-note voicing (not full chord — lighter)
        const notes = Math.random() > 0.5 ? [third, fifth] : [root + 12, fifth];
        notes.forEach((s, i) => {
          events.push({
            freq: toFreq(s, 1),
            duration: 0.2 + Math.random() * 0.25,
            velocity: vel * (0.5 + Math.random() * 0.2) * (b === 0 ? 0.7 : 1),
            time: hitTime + i * 12 // slight spread
          });
        });
      }
    } else if (grooveStyle === 1) {
      // Style B: Melodic fills — scale runs between beats, rests on beats
      const varied = motif ? this._varyMotif(motif, cycle) : null;
      let noteIdx = 0;
      for (let b = 0; b < beats; b++) {
        const beatTime = startTime + b * beatMs;
        // Play in the second half of the beat (after kick/snare)
        if (Math.random() > 0.6) continue;
        const fillStart = beatTime + beatMs * 0.55 + swing;
        const numNotes = 1 + Math.floor(Math.random() * 2); // 1-2 notes
        for (let n = 0; n < numNotes; n++) {
          let degree;
          if (varied && noteIdx < varied.length && varied[noteIdx]) {
            degree = varied[noteIdx].degree;
            noteIdx++;
          } else {
            degree = this._pickConsonantNote(chord, scale);
          }
          events.push({
            freq: toFreq(degree, 1),
            duration: 0.3 + Math.random() * 0.4,
            velocity: vel * (0.45 + Math.random() * 0.25),
            time: fillStart + n * (beatMs * 0.2) + (Math.random() - 0.5) * 8
          });
        }
      }
    } else {
      // Style C: Sparse punctuation — one or two notes per bar, big space
      const hitBeat = Math.floor(Math.random() * beats);
      const beatTime = startTime + hitBeat * beatMs;
      // Anticipation: play just before the next beat
      const anticipate = beatMs * (0.85 + Math.random() * 0.1);
      const degree = this._pickConsonantNote(chord, scale);
      events.push({
        freq: toFreq(degree, 1),
        duration: 1.2 + Math.random() * 1.5,
        velocity: vel * (0.55 + Math.random() * 0.2),
        time: beatTime + anticipate + (Math.random() - 0.5) * 10
      });
      // Maybe add a second note
      if (Math.random() > 0.5) {
        const d2 = this._pickConsonantNote(chord, scale);
        events.push({
          freq: toFreq(d2, 1),
          duration: 0.8 + Math.random() * 0.6,
          velocity: vel * 0.4,
          time: beatTime + anticipate + beatMs * 0.25 + (Math.random() - 0.5) * 10
        });
      }
    }

    return events;
  }

  /* ── LEFT HAND PATTERNS ── */
  _generateLeftHand(pattern, chord, beats, beatMs, startTime, vel, cycle) {
    cycle = cycle || 0;
    const events = [];
    const root = chord[0] % 12;
    const third = chord.length > 1 ? chord[1] % 12 : (root + 4) % 12;
    const fifth = chord.length > 2 ? chord[2] % 12 : (root + 7) % 12;
    const seventh = chord.length > 3 ? chord[3] % 12 : null;
    
    // Left hand plays one octave below base (but not too low to be muddy)
    // Ensure it stays in a clearly audible range (above ~80Hz)
    const lhOctave = this.baseFreq < 150 ? 0 : -1;
    const toFreq = (semi, oct) => {
      const f = this.baseFreq * Math.pow(2, (semi / 12) + oct);
      // Clamp to audible piano range (never go below A1=55Hz or above C7=2093Hz)
      return Math.max(55, Math.min(2093, f));
    };
    
    switch (pattern) {
      case 'alberti': {
        // Alberti bass: low-high-mid-high per beat
        // Classic: C-G-E-G pattern
        const seq = [root, fifth, third, fifth];
        for (let b = 0; b < beats; b++) {
          for (let i = 0; i < 4; i++) {
            const oct = i === 0 ? lhOctave : lhOctave + (i === 1 || i === 3 ? 0.5 : 0); // middle register
            events.push({
              freq: toFreq(seq[i], lhOctave),
              duration: 0.3 + Math.random() * 0.1,
              velocity: vel * (i === 0 ? 1 : 0.7) * (0.95 + Math.random() * 0.1),
              time: startTime + b * beatMs + i * (beatMs / 4) + (Math.random() - 0.5) * 8 // rubato
            });
          }
        }
        break;
      }
      
      case 'arpeggio': {
        // Ascending arpeggio across the beat
        const notes = seventh
          ? [root, third, fifth, seventh]
          : [root, third, fifth, root + 12];
        for (let b = 0; b < beats; b++) {
          const ascending = b % 2 === 0;
          const seq = ascending ? notes : [...notes].reverse();
          for (let i = 0; i < seq.length; i++) {
            events.push({
              freq: toFreq(seq[i], lhOctave),
              duration: 0.5 + Math.random() * 0.3,
              velocity: vel * (0.7 + i * 0.08) * (0.95 + Math.random() * 0.1),
              time: startTime + b * beatMs + i * (beatMs / seq.length) + (Math.random() - 0.5) * 10
            });
          }
        }
        break;
      }
      
      case 'brokenChord': {
        // Broken chord: root on 1, full chord on 3
        for (let b = 0; b < beats; b++) {
          if (b % 2 === 0) {
            // Root note on downbeat
            events.push({
              freq: toFreq(root, lhOctave),
              duration: 0.8,
              velocity: vel * 1.1,
              time: startTime + b * beatMs + (Math.random() - 0.5) * 5
            });
          } else {
            // Chord tones on upbeat
            [third, fifth].forEach((s, i) => {
              events.push({
                freq: toFreq(s, lhOctave + 0.5),
                duration: 0.4,
                velocity: vel * 0.75,
                time: startTime + b * beatMs + i * (beatMs / 4) + (Math.random() - 0.5) * 8
              });
            });
          }
        }
        break;
      }
      
      case 'ostinato': {
        // Repeating 2-note figure
        const fig = [root, fifth];
        for (let b = 0; b < beats; b++) {
          for (let i = 0; i < 2; i++) {
            events.push({
              freq: toFreq(fig[i], lhOctave),
              duration: 0.4,
              velocity: vel * (i === 0 ? 1 : 0.8),
              time: startTime + b * beatMs + i * (beatMs / 2) + (Math.random() - 0.5) * 6
            });
          }
        }
        break;
      }
      
      case 'pedalPoint': {
        // Sustained root, with occasional fifth
        for (let b = 0; b < beats; b++) {
          if (b === 0) {
            events.push({
              freq: toFreq(root, lhOctave),
              duration: 2.5 + Math.random(),
              velocity: vel * 1.1,
              time: startTime + (Math.random() - 0.5) * 5
            });
          } else if (b === 2 && Math.random() > 0.4) {
            events.push({
              freq: toFreq(fifth, lhOctave),
              duration: 1.2,
              velocity: vel * 0.7,
              time: startTime + b * beatMs + (Math.random() - 0.5) * 8
            });
          }
        }
        break;
      }
      
      case 'waltz': {
        // 3/4 feel: bass on 1, chord on 2 and 3
        const waltzBeat = beatMs * 4 / 3; // reinterpret 4 beats as waltz
        for (let b = 0; b < 3; b++) {
          if (b === 0) {
            events.push({
              freq: toFreq(root, lhOctave),
              duration: 0.6,
              velocity: vel * 1.2,
              time: startTime + b * waltzBeat + (Math.random() - 0.5) * 5
            });
          } else {
            // Chord stab
            [third, fifth].forEach((s, i) => {
              events.push({
                freq: toFreq(s, lhOctave + 1),
                duration: 0.25,
                velocity: vel * 0.6,
                time: startTime + b * waltzBeat + i * 30 + (Math.random() - 0.5) * 8
              });
            });
          }
        }
        break;
      }

      case 'debussyFlow': {
        // Clair de Lune left-hand pattern:
        // 9/8 feel — each beat subdivided into 3 eighth notes
        // Pattern per beat: low bass anchor, then ascending through chord: 5th-root-3rd-5th-root
        // All notes sustained long (pedal down), overlapping into harmonic wash
        // Wide span: bass in low octave, arpeggios rise 1.5-2 octaves
        
        const ninth = (root + 2) % 12; // add9 color
        // Clair de Lune arpeggio sequence: root(low), 5th, root(mid), 3rd, 5th, root(high)
        const arpSeq = [
          { note: root, oct: lhOctave - 1 },   // deep bass anchor
          { note: fifth, oct: lhOctave },       // ascending
          { note: root, oct: lhOctave },        // middle root
          { note: third, oct: lhOctave },       // color
          { note: fifth, oct: lhOctave },       // back to 5th
          { note: root, oct: lhOctave + 1 },   // top of arpeggio
        ];
        // Alternate pattern for variety (with 9th)
        const arpSeq2 = [
          { note: root, oct: lhOctave - 1 },
          { note: fifth, oct: lhOctave },
          { note: ninth, oct: lhOctave },
          { note: third, oct: lhOctave },
          { note: fifth, oct: lhOctave + 1 },
          { note: root, oct: lhOctave + 1 },
        ];
        
        // 9/8: 3 groups of 3 eighths per bar. Each "beat" = 1 group of 3.
        // With 4 beats per chord, we get ~12 eighth notes = close to 9/8 x 1.33
        const eighthMs = beatMs / 3; // each eighth note
        const arp = (cycle % 2 === 0) ? arpSeq : arpSeq2;
        
        for (let b = 0; b < beats; b++) {
          const groupStart = startTime + b * beatMs;
          
          // 3 eighth notes per beat group
          for (let e = 0; e < 3; e++) {
            const arpIdx = (b * 3 + e) % arp.length;
            const { note, oct } = arp[arpIdx];
            
            // First note of first beat = bass anchor (louder, longer)
            const isAnchor = b === 0 && e === 0;
            // Slight velocity accent on first of each group (compound meter feel)
            const groupAccent = e === 0 ? 1.15 : 1.0;
            
            // Occasional skip for breathing (never skip the bass anchor)
            if (!isAnchor && Math.random() < 0.1) continue;
            
            events.push({
              freq: toFreq(note % 12, oct),
              duration: isAnchor ? (3.5 + Math.random() * 1.5) : (1.5 + Math.random() * 1.2),
              velocity: vel * groupAccent * (isAnchor ? 1.0 : (0.55 + Math.random() * 0.15)),
              time: groupStart + e * eighthMs + (Math.random() - 0.5) * (eighthMs * 0.12) // subtle rubato
            });
          }
        }
        break;
      }
    }
    
    return events;
  }

  /* ── RIGHT HAND PATTERNS ── */
  _generateRightHand(pattern, motif, chord, beats, beatMs, startTime, vel, cycle) {
    const events = [];
    const scale = this.scale;
    const chordTones = new Set(chord.map(s => s % 12));
    
    // Right hand plays in upper register (singing range)
    const rhOctave = 1;
    const toFreq = (semi, oct) => {
      const f = this.baseFreq * Math.pow(2, (semi / 12) + oct);
      return Math.max(100, Math.min(2500, f));
    };
    
    switch (pattern) {
      case 'melody': {
        // Play the motif, varied each cycle
        const varied = this._varyMotif(motif, cycle);
        const notesPerBeat = varied.length / beats;
        
        varied.forEach((note, i) => {
          if (note === null) return; // rest
          
          // Dynamic contour within phrase: arch shape
          const phrasePos = i / varied.length;
          const dynShape = Math.sin(phrasePos * Math.PI);
          const noteVel = vel * (0.7 + dynShape * 0.3) * note.accent;
          
          events.push({
            freq: toFreq(note.degree, rhOctave + note.octave),
            duration: note.duration,
            velocity: noteVel * (0.93 + Math.random() * 0.14), // humanize
            time: startTime + i * (beatMs / Math.max(notesPerBeat, 1)) + note.rubato
          });
        });
        break;
      }
      
      case 'sparse': {
        // Calm isolated piano notes with clear attack
        for (let b = 0; b < beats; b++) {
          if (Math.random() > 0.45) continue;  // some beats are silence
          const degree = scale[Math.floor(Math.random() * scale.length)];
          events.push({
            freq: toFreq(degree, rhOctave),
            duration: 1.0 + Math.random() * 2.0,   // clear, distinct notes
            velocity: vel * (0.45 + Math.random() * 0.3),  // present but soft
            time: startTime + b * beatMs + Math.random() * beatMs * 0.3
          });
        }
        break;
      }
      
      case 'arpeggio': {
        // Right hand arpeggio (higher register, flowing)
        const notes = chord.map(s => s % 12);
        for (let b = 0; b < beats; b++) {
          const dir = (b + cycle) % 3; // vary direction
          let seq;
          if (dir === 0) seq = notes;
          else if (dir === 1) seq = [...notes].reverse();
          else seq = [...notes, ...notes.slice(0, -1).reverse()]; // up and back down
          
          seq.forEach((s, i) => {
            events.push({
              freq: toFreq(s, rhOctave + (i >= notes.length ? 1 : 0)),
              duration: 0.4 + Math.random() * 0.2,
              velocity: vel * (0.6 + (i / seq.length) * 0.3),
              time: startTime + b * beatMs + i * (beatMs / seq.length) + (Math.random() - 0.5) * 12
            });
          });
        }
        break;
      }
      
      case 'chordal': {
        // Block chords with top note melody
        for (let b = 0; b < beats; b++) {
          if (b % 2 === 0 || Math.random() > 0.6) {
            // Play chord tones simultaneously (with slight spread for realism)
            chord.forEach((s, i) => {
              events.push({
                freq: toFreq(s % 12, rhOctave),
                duration: 0.6 + Math.random() * 0.3,
                velocity: vel * (i === chord.length - 1 ? 1 : 0.6), // top note louder
                time: startTime + b * beatMs + i * 15 + (Math.random() - 0.5) * 5 // slight spread
              });
            });
          }
        }
        break;
      }

      case 'impressionist': {
        // Clair de Lune right hand:
        // Opening: descending parallel thirds (melody + third below), pp
        // Middle: flowing melody with suspensions held over bar lines
        // Grace notes, hairpin dynamics on every phrase
        // Notes are LONG — they ring into each other (pedal sustain)
        // Intervals: parallel 3rds and 6ths (Debussy signature), occasional 4ths
        
        const varied = motif ? this._varyMotif(motif, cycle) : null;
        const eighthMs = beatMs / 3;
        
        for (let b = 0; b < beats; b++) {
          const phrasePos = b / beats;
          // Hairpin dynamic: pp → mp → pp across phrase
          const dynMult = 0.55 + Math.sin(phrasePos * Math.PI) * 0.4;
          
          // Debussy breathing — occasional silence
          if (Math.random() < 0.15) continue;
          
          // Get melody note from motif
          let degree;
          if (varied && varied[b % varied.length] && varied[b % varied.length].degree !== undefined) {
            degree = varied[b % varied.length].degree;
          } else {
            // Stepwise motion (Clair de Lune melody moves mostly by step)
            const scaleIdx = Math.floor(phrasePos * scale.length * 1.5) % scale.length;
            degree = scale[scaleIdx];
          }
          
          // Grace note (appoggiatura — step above, resolves down)
          if (Math.random() < 0.3) {
            const graceScaleIdx = (scale.indexOf(degree) + 1) % scale.length;
            const graceDeg = scale[graceScaleIdx] !== undefined ? scale[graceScaleIdx] : (degree + 2) % 12;
            events.push({
              freq: toFreq(graceDeg, rhOctave + 1),
              duration: 0.12 + Math.random() * 0.06,
              velocity: vel * dynMult * 0.45,
              time: startTime + b * beatMs - 50 - Math.random() * 40
            });
          }
          
          // Main melody note — very long sustain (held over into next beat = suspension)
          const susBonus = Math.random() < 0.3 ? 1.5 : 0; // suspension: extra hold
          events.push({
            freq: toFreq(degree, rhOctave + 1),
            duration: 2.0 + Math.random() * 1.5 + susBonus,
            velocity: vel * dynMult * (0.8 + Math.random() * 0.2),
            time: startTime + b * beatMs + (Math.random() - 0.5) * (eighthMs * 0.3)
          });
          
          // Parallel third below (Clair de Lune opening = descending thirds)
          if (Math.random() < 0.55) {
            const thirdBelow = scale[(scale.indexOf(degree) - 2 + scale.length) % scale.length];
            const thirdDeg = thirdBelow !== undefined ? thirdBelow : (degree - 3 + 12) % 12;
            events.push({
              freq: toFreq(thirdDeg, rhOctave + 1),
              duration: 1.8 + Math.random() * 1.2,
              velocity: vel * dynMult * 0.6, // third is softer than melody
              time: startTime + b * beatMs + 15 + (Math.random() - 0.5) * 12
            });
          }
          
          // Occasional sixth below instead (for richer color)
          if (Math.random() < 0.2) {
            const sixthBelow = (degree - 4 + 12) % 12; // major 3rd below = minor 6th above
            events.push({
              freq: toFreq(sixthBelow, rhOctave),
              duration: 1.5 + Math.random() * 1.0,
              velocity: vel * dynMult * 0.45,
              time: startTime + b * beatMs + 25 + (Math.random() - 0.5) * 10
            });
          }
          
          // Ornamental turn at phrase midpoint (Debussy embellishment)
          if (Math.random() < 0.12 && b < beats - 1) {
            const turnStart = startTime + b * beatMs + beatMs * 0.65;
            const scIdx = scale.indexOf(degree);
            const above = scale[(scIdx + 1) % scale.length] || (degree + 2) % 12;
            const below = scale[(scIdx - 1 + scale.length) % scale.length] || (degree - 1 + 12) % 12;
            const turnNotes = [above, degree, below, degree];
            turnNotes.forEach((tn, ti) => {
              events.push({
                freq: toFreq(tn % 12, rhOctave + 1),
                duration: 0.1 + Math.random() * 0.05,
                velocity: vel * dynMult * 0.4,
                time: turnStart + ti * (eighthMs * 0.4) + (Math.random() - 0.5) * 6
              });
            });
          }
        }
        break;
      }
    }
    
    return events;
  }

  /* ── MOTIF GENERATOR (mood-aware, musically intelligent) ──
     Generates singable, memorable motifs with:
     - Strong melodic contour (clear emotional shape)
     - Chord-tone targeting (notes resolve to harmony)
     - Repetition with variation (motif cells that repeat/develop)
     - Musical intervals (mostly steps + occasional expressive leaps)
     - Register awareness (melodies sit in singable range) */
  _generateMotif() {
    const scale = this.scale;
    const chordTones = new Set((this.chords[0] || [0, 4, 7]).map(s => s % 12));
    const isSad = this.mood === 'sad' || this.mood === 'melancholy' || this.mood === 'despair';
    
    // Motif length — fewer notes, more space
    const len = isSad
      ? (3 + Math.floor(Math.random() * 3))  // 3-5 notes
      : (3 + Math.floor(Math.random() * 4)); // 3-6 notes
    const notes = [];
    
    // Contour selection
    let contour;
    if (isSad) {
      const sadContours = ['descending', 'sigh', 'falling-arch', 'lament', 'yearning'];
      contour = sadContours[Math.floor(Math.random() * sadContours.length)];
    } else {
      const contours = ['arch', 'ascending', 'question', 'wave', 'call-response'];
      contour = contours[Math.floor(Math.random() * contours.length)];
    }
    
    // Start on a chord tone for harmonic grounding
    const chordToneIndices = [];
    scale.forEach((s, i) => { if (chordTones.has(s)) chordToneIndices.push(i); });
    let prevIdx = chordToneIndices.length > 0
      ? chordToneIndices[Math.floor(Math.random() * chordToneIndices.length)]
      : Math.floor(scale.length * 0.4); // middle of scale
    
    // Generate a 2-3 note "cell" that will repeat with variation
    const cellLen = 2 + Math.floor(Math.random() * 2); // 2-3 notes
    let cellIntervals = [];
    for (let c = 0; c < cellLen; c++) {
      cellIntervals.push(Math.random() < 0.7 ? 1 : 2); // mostly steps
    }
    
    for (let i = 0; i < len; i++) {
      // Strategic rests (not random — at musical boundaries)
      const restChance = isSad ? 0.2 : 0.12;
      if (i > 0 && i % (cellLen + 1) === 0 && Math.random() < restChance) {
        notes.push(null);
        continue;
      }
      
      const pos = i / Math.max(len - 1, 1);
      let targetDirection = 0;
      
      switch (contour) {
        case 'arch':
          targetDirection = pos < 0.45 ? 1 : -1;
          break;
        case 'ascending':
          targetDirection = 1;
          if (pos > 0.8) targetDirection = -1; // resolve down at end
          break;
        case 'descending':
          targetDirection = -1;
          break;
        case 'wave':
          targetDirection = Math.sin(pos * Math.PI * 2) > 0 ? 1 : -1;
          break;
        case 'question':
          targetDirection = pos < 0.6 ? -1 : 1; // fall then rise (questioning)
          break;
        case 'call-response':
          // First half ascends (call), second half descends (response)
          targetDirection = pos < 0.5 ? 1 : -1;
          break;
        case 'sigh':
          targetDirection = pos < 0.15 ? 1 : -1;
          break;
        case 'falling-arch':
          targetDirection = pos < 0.25 ? 1 : -1;
          break;
        case 'lament':
          targetDirection = -1;
          if (Math.random() < 0.15) targetDirection = 1;
          break;
        case 'yearning':
          // Reaches up then falls back (unfulfilled desire)
          targetDirection = pos < 0.35 ? 1 : (pos < 0.6 ? -1 : 1);
          break;
      }
      
      // Use cell pattern for intervallic consistency (musical memory)
      const cellPos = i % (cellLen + 1);
      let step;
      if (cellPos < cellLen) {
        // Follow the cell's interval pattern
        step = targetDirection * cellIntervals[cellPos];
      } else {
        // Between cells: allow a larger leap for contrast
        if (isSad) {
          step = targetDirection * (Math.random() < 0.6 ? 1 : 2);
        } else {
          step = targetDirection * (1 + Math.floor(Math.random() * 2));
          // Occasional expressive leap (4th or 5th)
          if (Math.random() < 0.15) step = targetDirection * 3;
        }
      }
      
      let nextIdx = prevIdx + step;
      nextIdx = Math.max(0, Math.min(scale.length - 1, nextIdx));
      
      // On last note or phrase boundaries, prefer resolving to a chord tone
      const isLastNote = i === len - 1;
      const isPhraseBoundary = (i === Math.floor(len / 2)) || isLastNote;
      if (isPhraseBoundary && chordToneIndices.length > 0) {
        // Find nearest chord tone
        let nearest = chordToneIndices[0];
        let nearestDist = Math.abs(nextIdx - nearest);
        for (const ct of chordToneIndices) {
          const d = Math.abs(nextIdx - ct);
          if (d < nearestDist) { nearest = ct; nearestDist = d; }
        }
        if (nearestDist <= 2) nextIdx = nearest; // resolve if close
      }
      
      prevIdx = nextIdx;
      const degree = scale[nextIdx];
      const octave = nextIdx >= scale.length ? 1 : 0;
      
      // Durations: distinct piano notes, calm pace but clearly separate
      let duration;
      if (isLastNote) {
        duration = 2.0 + Math.random() * 1.5;   // final note lingers a bit
      } else if (Math.random() < 0.4) {
        duration = 1.2 + Math.random() * 1.0;   // medium sustain
      } else {
        duration = 0.6 + Math.random() * 0.8;   // shorter, more defined
      }
      
      // Soft dynamics — gentle, floating
      let accent;
      accent = i === 0 ? 0.8 : (isLastNote ? 0.6 : (0.5 + Math.random() * 0.25));
      
      notes.push({
        degree,
        octave,
        duration,
        accent,
        rubato: isSad
          ? (Math.random() - 0.5) * 30 // more rubato for expressiveness
          : (Math.random() - 0.5) * 15
      });
    }
    
    return notes;
  }

  /* ── MOTIF VARIATION ── */
  _varyMotif(motif, cycle) {
    if (cycle === 0) return motif; // first time: play as-is
    
    const varied = motif.map(note => {
      if (note === null) return null;
      const n = { ...note };
      
      switch (cycle % 4) {
        case 1:
          // Transpose up or down by one scale degree
          n.degree = this.scale[
            Math.min(this.scale.length - 1,
              Math.max(0, this.scale.indexOf(n.degree) + (Math.random() > 0.5 ? 1 : -1)))
          ] || n.degree;
          break;
        case 2:
          // Rhythmic variation: stretch or compress
          n.duration *= (0.7 + Math.random() * 0.6);
          n.rubato += (Math.random() - 0.5) * 20;
          break;
        case 3:
          // Ornament: occasionally add neighbor tone approach
          if (Math.random() < 0.3) {
            const idx = this.scale.indexOf(n.degree);
            if (idx > 0) n.degree = this.scale[idx - 1]; // lower neighbor
          }
          n.accent *= (0.9 + Math.random() * 0.2);
          break;
      }
      
      // Always add fresh rubato
      n.rubato = (Math.random() - 0.5) * 18;
      
      return n;
    });
    
    // Sometimes add a passing tone
    if (Math.random() < 0.3 && varied.length > 2) {
      const insertAt = 1 + Math.floor(Math.random() * (varied.length - 2));
      const neighbor = varied[insertAt];
      if (neighbor) {
        varied.splice(insertAt, 0, {
          degree: this.scale[Math.floor(Math.random() * this.scale.length)],
          octave: neighbor.octave,
          duration: 0.2 + Math.random() * 0.2,
          accent: 0.6,
          rubato: (Math.random() - 0.5) * 10
        });
      }
    }
    
    return varied;
  }

  /* ── SIMPLE PATTERN (for non-piano timbres) ── */
  /* Convert CompositionEngine motif into playable note events */
  _composerMotifToEvents(motifData) {
    const events = [];
    const notes = motifData.notes;
    if (!notes || notes.length === 0) return this._generateSimplePattern();

    const bpm = this._externalBpm || 72;
    const beatMs = 60000 / bpm;
    let time = 0;

    // Play motif notes with proper timing
    for (const note of notes) {
      if (!note || note.semitone === undefined || note.duration === undefined) continue;
      const freq = this.baseFreq * Math.pow(2, note.semitone / 12);
      // Guard: skip inaudible or extreme frequencies
      if (!isFinite(freq) || freq < 50 || freq > 4000) continue;
      const dur = Math.max(0.1, (note.duration || 1) * (beatMs / 1000));
      events.push({
        freq,
        duration: dur,
        velocity: note.accent ? 0.45 : ((note.velocity || 0.5) * 0.4),
        time
      });
      time += (note.duration || 1) * beatMs;
    }

    // If variation is 'rest', return empty (silence as composition)
    if (motifData.variation === 'rest') return [];

    // Repeat motif with slight variation for a longer phrase
    const repeatCount = motifData.variation === 'expand' ? 1 : 2;
    for (let rep = 0; rep < repeatCount; rep++) {
      // Small gap between repetitions
      time += beatMs * (0.5 + Math.random());
      for (const note of notes) {
        // Slight humanization
        const freq = this.baseFreq * Math.pow(2, note.semitone / 12);
        const dur = note.duration * (beatMs / 1000) * (0.9 + Math.random() * 0.2);
        events.push({
          freq,
          duration: dur,
          velocity: (note.velocity * 0.35) * (0.85 + Math.random() * 0.3),
          time: time + (Math.random() - 0.5) * 30 // ±15ms humanization
        });
        time += note.duration * beatMs;
      }
    }

    return events;
  }

  _generateSimplePattern() {
    const events = [];
    const scale = this.scale;
    const count = 8 + Math.floor(Math.random() * 16);
    const phraseDuration = 30000 + Math.random() * 90000;
    const interval = phraseDuration / count;
    let prevIdx = Math.floor(Math.random() * scale.length);
    
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.25) continue; // rest
      
      // Stepwise motion
      const step = Math.floor(Math.random() * 3) - 1;
      prevIdx = Math.max(0, Math.min(scale.length - 1, prevIdx + step));
      const degree = scale[prevIdx];
      const octave = Math.random() < 0.3 ? 1 : 0;
      const freq = this.baseFreq * Math.pow(2, (degree / 12) + octave);
      
      events.push({
        freq,
        duration: 0.5 + Math.random() * 3,
        velocity: 0.15 + Math.random() * 0.25,
        time: i * interval + (Math.random() - 0.5) * interval * 0.1
      });
    }
    
    return events;
  }

  /* ═══════════════════════════════════
     NOTE SYNTHESIS
     ═══════════════════════════════════ */

  _playNote(freq, duration, velocity) {
    this._playNoteAtTime(freq, duration, velocity, this.ctx.currentTime);
  }

  /* Sample-accurate note scheduling: uses a precise AudioContext time
     rather than the imprecise moment setTimeout fires. This keeps
     melody notes locked to the same clock as beats and phrase engine. */
  _playNoteAtTime(freq, duration, velocity, audioTime) {
    const now = Math.max(audioTime, this.ctx.currentTime); // never schedule in the past

    // Polyphony limiter — skip note if too many are active (prevents audio crash)
    if (this._activeNoteCount >= this._maxPolyphony) return;
    this._activeNoteCount++;
    // Decrement after note dies (duration + tail decay)
    const noteLifetime = Math.max(2, duration + 4) * 1000;
    const countTimer = setTimeout(() => { this._activeNoteCount = Math.max(0, this._activeNoteCount - 1); }, noteLifetime);
    this.noteTimers.push(countTimer);

    // Web Audio synthesis
    switch (this.timbre) {
      case 'piano': this._pianoNote(freq, duration, velocity, now); break;
      case 'keys': this._keysNote(freq, duration, velocity, now); break;
      case 'bells': this._bellNote(freq, duration, velocity, now); break;
      case 'pluck': this._pluckNote(freq, duration, velocity, now); break;
      case 'flute': this._fluteNote(freq, duration, velocity, now); break;
      case 'harp': this._harpNote(freq, duration, velocity, now); break;
      default: this._bellNote(freq, duration, velocity, now);  // ambient default
    }
  }

  _timbreToSFInstrument(timbre) {
    const map = {
      'piano': 'piano',
      'bells': 'bells',
      'flute': 'flute',
      'harp': 'harp',
      'pluck': null  // keep synth for pluck (more character)
    };
    return map[timbre] !== undefined ? map[timbre] : null;
  }

  // ── Piano: Soft Debussy-inspired additive synthesis ──
  _pianoNote(freq, dur, vel, now) {
    const ctx = this.ctx;

    // Register detection
    const midiApprox = 69 + 12 * Math.log2(freq / 440);
    const isLow = midiApprox < 50;
    const isHigh = midiApprox > 76;

    // ── HUMANIZATION: timing offset (±10-25ms) ──
    const humanOffset = (Math.random() - 0.5) * 0.035; // ±17.5ms
    const noteStart = now + humanOffset;

    // Register-aware decay — piano notes, not pads
    const baseDecay = isLow ? (2.5 + (50 - midiApprox) * 0.04)
                   : isHigh ? (0.8 + (90 - midiApprox) * 0.01)
                   : (1.5 + (72 - midiApprox) * 0.02);
    const sustainDur = dur + baseDecay * 0.6;  // natural piano decay, not padded
    const noteEnd = noteStart + sustainDur;

    // Piano inharmonicity
    const B = isLow ? 0.0005 : (isHigh ? 0.00012 : 0.00025);

    // ── STEREO: pan by register (low=left, high=right) ──
    const pan = ctx.createStereoPanner();
    const panValue = ((midiApprox - 60) / 40) * 0.35; // -0.35 to +0.35
    pan.pan.value = Math.max(-0.35, Math.min(0.35, panValue));
    pan.connect(this._masterGain);

    // ── 1. GENTLE HAMMER (soft thud, not sharp click) ──
    const hammerAmp = vel * (isLow ? 0.025 : (isHigh ? 0.04 : 0.035));
    const hammerDur = isHigh ? 0.02 : (isLow ? 0.05 : 0.035);
    const hammerLen = Math.floor(ctx.sampleRate * hammerDur);
    const hammerBuf = ctx.createBuffer(1, hammerLen, ctx.sampleRate);
    const hd = hammerBuf.getChannelData(0);
    for (let i = 0; i < hammerLen; i++) {
      const t = i / hammerLen;
      // Gentle noise burst shaped like a soft felt hammer
      hd[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * 0.7;
    }
    const hammerSrc = ctx.createBufferSource(); hammerSrc.buffer = hammerBuf;
    const hammerG = ctx.createGain(); hammerG.gain.value = hammerAmp;
    const hammerLP = ctx.createBiquadFilter(); hammerLP.type = 'lowpass';
    hammerLP.frequency.value = Math.min(freq * 2.5, 4000); // keep hammer soft
    hammerLP.Q.value = 0.3;
    hammerSrc.connect(hammerLP); hammerLP.connect(hammerG); hammerG.connect(pan);
    hammerSrc.start(noteStart);

    // ── 2. ADDITIVE HARMONICS (warm, few harmonics, soft envelope) ──
    // Velocity controls how many harmonics sound (soft = 3-4, hard = 6-8)
    const numHarmonics = isHigh ? Math.floor(2 + vel * 3) : Math.floor(3 + vel * 5);

    // Master envelope — SOFT attack (8-18ms), natural decay
    const sumGain = ctx.createGain(); sumGain.gain.value = 0;
    const peakGain = vel * (isLow ? 0.55 : (isHigh ? 0.42 : 0.50));
    const sustainGain = peakGain * (isLow ? 0.75 : (isHigh ? 0.55 : 0.65));
    const attackTime = 0.008 + (1 - vel) * 0.012; // softer = slower attack (8-20ms)
    sumGain.gain.setValueAtTime(0, noteStart);
    sumGain.gain.linearRampToValueAtTime(peakGain, noteStart + attackTime);
    sumGain.gain.setTargetAtTime(sustainGain, noteStart + attackTime, 0.12);
    sumGain.gain.setTargetAtTime(0, noteStart + 0.3, baseDecay * 0.7);

    // ── FILTER: Velocity-sensitive brightness (KEY to Debussy softness) ──
    // Quiet notes: dark (cutoff 2-4kHz). Louder: slightly brighter (4-6kHz). Never harsh.
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass';
    const initFilter = Math.min(freq * (1.5 + vel * 2.5), 6000);
    const settleFilter = Math.min(freq * (1 + vel * 0.8), 3500);
    lpf.frequency.setValueAtTime(initFilter, noteStart);
    lpf.frequency.setTargetAtTime(settleFilter, noteStart + 0.05, baseDecay * 0.3);
    lpf.Q.value = 0.4; // very subtle resonance for color

    // Key tracking: lower notes get darker filter
    if (isLow) {
      lpf.frequency.value = Math.min(lpf.frequency.value, 2500);
    }

    for (let n = 1; n <= numHarmonics; n++) {
      const partialFreq = freq * n * Math.sqrt(1 + B * n * n);
      if (partialFreq > 10000) break;

      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.value = partialFreq;
      // Slight detuning on harmonics 2+ for width (±3-5 cents)
      if (n > 1) osc.detune.value = (Math.random() - 0.5) * 8;

      const hGain = ctx.createGain();
      // Harmonic rolloff — strong fundamental, gentle upper partials
      let amp;
      if (n === 1) amp = 1.0;
      else if (n === 2) amp = isLow ? 0.7 : 0.55;
      else if (n === 3) amp = isLow ? 0.4 : 0.3;
      else amp = (1 / Math.pow(n, 1.4)) * 0.3;

      // Per-partial decay (higher = faster death)
      const hDecay = baseDecay / (1 + (n - 1) * 0.5);

      hGain.gain.setValueAtTime(0, noteStart);
      hGain.gain.linearRampToValueAtTime(amp, noteStart + attackTime);
      hGain.gain.setTargetAtTime(amp * 0.55, noteStart + attackTime, 0.08 + n * 0.02);
      hGain.gain.setTargetAtTime(0, noteStart + 0.3, hDecay);

      osc.connect(hGain); hGain.connect(lpf);
      osc.start(noteStart); osc.stop(noteEnd);
    }

    lpf.connect(sumGain); sumGain.connect(pan);

    // ── 3. SYMPATHETIC RESONANCE — disabled (caused feedback-like sound) ──
    // Kept for reference but not active

    // ── 4. RELEASE NOISE (very subtle felt return) ──
    const releaseTime = noteStart + Math.min(dur, baseDecay * 0.6);
    const relLen = Math.floor(ctx.sampleRate * 0.01);
    const relBuf = ctx.createBuffer(1, relLen, ctx.sampleRate);
    const rd = relBuf.getChannelData(0);
    for (let i = 0; i < relLen; i++) {
      rd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / relLen, 5) * 0.4;
    }
    const relSrc = ctx.createBufferSource(); relSrc.buffer = relBuf;
    const relG = ctx.createGain(); relG.gain.value = vel * 0.008;
    const relLP = ctx.createBiquadFilter(); relLP.type = 'lowpass';
    relLP.frequency.value = 600;
    relSrc.connect(relLP); relLP.connect(relG); relG.connect(pan);
    relSrc.start(releaseTime);

    // ── CLEANUP: disconnect all nodes after note fully decays ──
    // Without this, GainNodes/Filters/Panners accumulate → audio crash
    const cleanupDelay = (noteEnd - ctx.currentTime + 2) * 1000; // 2s safety margin
    const cleanupTimer = setTimeout(() => {
      try { pan.disconnect(); } catch(e){}
      try { hammerLP.disconnect(); } catch(e){}
      try { hammerG.disconnect(); } catch(e){}
      try { sumGain.disconnect(); } catch(e){}
      try { lpf.disconnect(); } catch(e){}
      try { relLP.disconnect(); } catch(e){}
      try { relG.disconnect(); } catch(e){}
    }, Math.max(100, cleanupDelay));
    this.noteTimers.push(cleanupTimer);
  }

  // ── Soft Keys: VA synth with sine+sine (warm EP/Rhodes-like tone) ──
  _keysNote(freq, dur, vel, now) {
    if (!this._keysSynth) {
      this._keysSynth = new VASynth(this.ctx, this.output);
      this._keysSynth.loadPreset('Soft Keys');
      this._keysSynth.setParam('masterGain', 0.5);
    }
    // Convert freq to MIDI note
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    this._keysSynth.noteOn(midi, vel);
    // Auto noteOff after duration
    const t = setTimeout(() => {
      this._keysSynth.noteOff(midi);
    }, dur * 1000);
    this.noteTimers.push(t);
  }

  // ── Bells: sine partials with inharmonic ratios ──
  _bellNote(freq, dur, vel, now) {
    const ctx = this.ctx;
    const partials = [1, 2.76, 4.07, 5.18];
    const amps = [0.2, 0.1, 0.06, 0.03];
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vel * 0.25, now, 0.002);
    g.gain.setTargetAtTime(0, now + 0.3, dur * 0.5);

    partials.forEach((r, i) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.value = freq * r;
      const pg = ctx.createGain(); pg.gain.value = amps[i] * vel;
      osc.connect(pg); pg.connect(g);
      osc.start(now); osc.stop(now + dur + 3);
    });
    g.connect(this._masterGain);
    // Cleanup after note dies
    const bellEnd = (dur + 4) * 1000;
    const bt = setTimeout(() => { try { g.disconnect(); } catch(e){} }, bellEnd);
    this.noteTimers.push(bt);
  }

  // ── Pluck: triangle with fast decay ──
  _pluckNote(freq, dur, vel, now) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vel * 0.3, now, 0.005);
    g.gain.setTargetAtTime(0, now + 0.05, dur * 0.3);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
    filt.frequency.value = freq * 4;
    filt.frequency.setTargetAtTime(freq * 1.5, now + 0.05, dur * 0.2);
    osc.connect(filt); filt.connect(g); g.connect(this._masterGain);
    osc.start(now); osc.stop(now + dur + 1);
    // Cleanup
    const pt = setTimeout(() => { try { g.disconnect(); } catch(e){} try { filt.disconnect(); } catch(e){} }, (dur + 2) * 1000);
    this.noteTimers.push(pt);
  }

  // ── Flute: sine with vibrato ──
  _fluteNote(freq, dur, vel, now) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 4.5 + Math.random();
    const vibG = ctx.createGain(); vibG.gain.value = freq * 0.004;
    vib.connect(vibG); vibG.connect(osc.frequency);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vel * 0.2, now, 0.15);
    g.gain.setTargetAtTime(vel * 0.15, now + 0.3, 0.5);
    g.gain.setTargetAtTime(0, now + dur * 0.7, dur * 0.3);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq * 3;
    osc.connect(filt); filt.connect(g); g.connect(this._masterGain);
    osc.start(now); vib.start(now); osc.stop(now + dur + 1); vib.stop(now + dur + 1);
    // Cleanup
    const ft = setTimeout(() => { try { g.disconnect(); } catch(e){} try { filt.disconnect(); } catch(e){} try { vibG.disconnect(); } catch(e){} }, (dur + 2) * 1000);
    this.noteTimers.push(ft);
  }

  // ── Harp: bright pluck with harmonic shimmer ──
  _harpNote(freq, dur, vel, now) {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator(); osc1.type = 'triangle'; osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = freq * 2.01;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vel * 0.25, now, 0.003);
    g.gain.setTargetAtTime(vel * 0.08, now + 0.05, 0.5);
    g.gain.setTargetAtTime(0, now + dur * 0.5, dur * 0.4);
    const g2 = ctx.createGain(); g2.gain.value = vel * 0.05;
    osc1.connect(g); osc2.connect(g2); g2.connect(g); g.connect(this._masterGain);
    osc1.start(now); osc2.start(now); osc1.stop(now + dur + 2); osc2.stop(now + dur + 2);
    // Cleanup
    const ht = setTimeout(() => { try { g.disconnect(); } catch(e){} try { g2.disconnect(); } catch(e){} }, (dur + 3) * 1000);
    this.noteTimers.push(ht);
  }

  destroy() {
    this.stop();
    try { this._masterGain.disconnect(); } catch(e){}
    try { this._dryGain.disconnect(); } catch(e){}
    try { this._reverbLP.disconnect(); } catch(e){}
    try { this._reverb.disconnect(); } catch(e){}
    try { this._reverbGain.disconnect(); } catch(e){}
  }
}
