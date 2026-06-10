/* Kálma Player — Phrase Architecture Engine
   The musical "conductor" — gives all instruments a shared sense of time,
   phrase structure, tension arcs, and musical memory.

   Real music doesn't just pick random parameters. It:
   - Breathes in phrases (4-bar, 8-bar)
   - Builds tension and resolves it
   - Brings back earlier ideas (musical memory)
   - Creates call-and-response between instruments
   - Has silence as a compositional tool

   This engine provides a shared clock and emotional arc
   that all other engines subscribe to. */

class PhraseEngine {
  constructor() {
    this._listeners = [];
    this._timer = null;
    this._schedulerInterval = null;
    this._nextBeatTime = 0;
    this._lookahead = 0.1;        // schedule 100ms ahead
    this.running = false;

    // Musical time
    this.bpm = 72;                // base tempo
    this.beatsPerBar = 4;
    this.barsPerPhrase = 4;
    this.phrasesPerArc = 4;       // 4 phrases = one tension arc

    // Current position
    this.beat = 0;
    this.bar = 0;
    this.phrase = 0;
    this.arc = 0;
    this.totalBeats = 0;

    // Tension arc: 0 (resting) → 1 (peak)
    this.tension = 0;
    this.arcShape = 'breathe';    // breathe, build, plateau, wave

    // Musical memory — stores "ideas" that can return
    this.memory = {
      themes: [],        // melodic seeds that reappear
      favoriteChords: [],// chord voicings that worked
      peakMoments: [],   // timestamps of intensity peaks
      silences: []       // where rests felt good
    };

    // Arc shapes define how tension moves through 4 phrases
    this.arcShapes = {
      // Gentle breathing — most common for ambient
      breathe:  [0.2, 0.5, 0.7, 0.3],
      // Steady build to climax
      build:    [0.1, 0.35, 0.65, 1.0],
      // Quick rise, sustain, gentle fall
      plateau:  [0.6, 0.8, 0.8, 0.4],
      // Wave — two peaks
      wave:     [0.7, 0.3, 0.8, 0.2],
      // Sparse — lots of space, one peak
      sparse:   [0.1, 0.1, 0.6, 0.1],
      // Descending — starts high, melts away
      descend:  [0.8, 0.6, 0.3, 0.1],
      // Dramatic — silence then explosion then silence
      dramatic: [0.05, 0.9, 0.5, 0.05]
    };

    // Which arc shapes to cycle through (picked contextually)
    this._arcQueue = [];
    this._arcIdx = 0;

    // Sub-beat pulse for rhythmic effects (tremolo, sidechain, pulse)
    this.pulsePhase = 0;
    this.pulseRate = 1;    // pulses per beat (1 = quarter note pulse)

    // Orchestration density schedule
    this.density = 0.5;    // 0 = solo instrument, 1 = full ensemble
  }

  /* ── Lifecycle ── */
  start(bpm) {
    if (this.running) return;
    this.running = true;
    this.bpm = bpm || this.bpm;
    this.beat = 0; this.bar = 0; this.phrase = 0; this.arc = 0;
    this.totalBeats = 0;
    this._pickArcQueue();
    this._nextArc();
    this._nextBeatTime = 0; // will be set in _startScheduler
    this._startScheduler();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
    if (this._schedulerInterval) { clearInterval(this._schedulerInterval); this._schedulerInterval = null; }
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(140, bpm));
  }

  /* Glide BPM toward target over durationMs (smooth tempo change) */
  glideBpm(targetBpm, durationMs) {
    targetBpm = Math.max(30, Math.min(140, targetBpm));
    if (this._bpmGlide) clearInterval(this._bpmGlide);
    const startBpm = this.bpm;
    const steps = Math.max(10, Math.round(durationMs / 200)); // step every 200ms
    const stepMs = durationMs / steps;
    let step = 0;
    this._bpmGlide = setInterval(() => {
      step++;
      const t = step / steps;
      // Ease-out curve for natural deceleration feel
      const eased = 1 - Math.pow(1 - t, 2);
      this.bpm = startBpm + (targetBpm - startBpm) * eased;
      if (step >= steps) {
        clearInterval(this._bpmGlide);
        this._bpmGlide = null;
        this.bpm = targetBpm;
      }
    }, stepMs);
  }

  onChange(fn) { this._listeners.push(fn); }
  _emit(event) { this._listeners.forEach(fn => fn(event)); }

  /* ── Lookahead scheduler — drift-free beat timing ── */
  _startScheduler() {
    this._nextBeatTime = performance.now();
    this._schedulerInterval = setInterval(() => this._schedulerTick(), 25);
  }

  _schedulerTick() {
    if (!this.running) return;
    const now = performance.now();
    const lookaheadMs = this._lookahead * 1000; // 100ms
    while (this._nextBeatTime < now + lookaheadMs) {
      this._tick();
      // Advance by exact beat duration (no drift accumulation)
      const beatMs = 60000 / this.bpm;
      this._nextBeatTime += beatMs;
    }
  }

  /* ── Main tick — fires on every beat ── */
  _tick() {
    if (!this.running) return;

    // Calculate tension for current position within arc
    this._updateTension();

    // Calculate pulse phase (for rhythmic effects)
    this.pulsePhase = (this.beat * this.pulseRate) % 1;

    // Calculate orchestration density from tension + position
    this._updateDensity();

    // Build event object
    const event = {
      type: 'beat',
      beat: this.beat,
      bar: this.bar,
      phrase: this.phrase,
      arc: this.arc,
      totalBeats: this.totalBeats,
      tension: this.tension,
      density: this.density,
      pulsePhase: this.pulsePhase,
      bpm: this.bpm,

      // Structural markers
      isDownbeat: this.beat === 0,
      isBarStart: this.beat === 0,
      isPhraseStart: this.beat === 0 && this.bar === 0,
      isArcStart: this.beat === 0 && this.bar === 0 && this.phrase === 0,
      isPhraseEnd: this.beat === this.beatsPerBar - 1 && this.bar === this.barsPerPhrase - 1,
      isArcEnd: this.beat === this.beatsPerBar - 1
                && this.bar === this.barsPerPhrase - 1
                && this.phrase === this.phrasesPerArc - 1,

      // Musical suggestions
      suggestSilence: this.tension < 0.1 && Math.random() < 0.3,
      suggestMelody: this.tension > 0.3 && this.density > 0.4,
      suggestChordChange: this._shouldChangeChord(),
      suggestBuild: this.tension > this._prevTension + 0.05,
      suggestRelease: this.tension < this._prevTension - 0.1,
      suggestBreath: this.isPhraseEnd || (this.tension < 0.15 && Math.random() < 0.2),

      // Memory recall suggestion
      recallTheme: this.memory.themes.length > 0
                   && this.phrase >= 2
                   && Math.random() < 0.25,
      themeToRecall: this.memory.themes.length > 0
                     ? this.memory.themes[Math.floor(Math.random() * this.memory.themes.length)]
                     : null
    };

    this._prevTension = this.tension;
    this._emit(event);

    // Advance position
    this.beat++;
    this.totalBeats++;

    if (this.beat >= this.beatsPerBar) {
      this.beat = 0;
      this.bar++;

      if (this.bar >= this.barsPerPhrase) {
        this.bar = 0;
        this.phrase++;

        // Emit phrase boundary event
        this._emit({
          type: 'phraseEnd',
          phrase: this.phrase - 1,
          arc: this.arc,
          tension: this.tension,
          nextTension: this._getArcTension(this.phrase)
        });

        if (this.phrase >= this.phrasesPerArc) {
          this.phrase = 0;
          this.arc++;

          // Emit arc boundary event
          this._emit({
            type: 'arcEnd',
            arc: this.arc - 1,
            memory: { ...this.memory }
          });

          this._nextArc();
        }
      }
    }
  }

  /* ── Tension calculation ── */
  _updateTension() {
    const phraseTensions = this.arcShapes[this.arcShape] || this.arcShapes.breathe;

    // Interpolate tension between current phrase and next
    const currentPhraseTension = phraseTensions[this.phrase] || 0.3;
    const nextPhraseTension = phraseTensions[(this.phrase + 1) % this.phrasesPerArc] || 0.3;

    // Position within current phrase (0-1)
    const posInPhrase = (this.bar * this.beatsPerBar + this.beat)
                        / (this.barsPerPhrase * this.beatsPerBar);

    // Smooth interpolation with easing
    const ease = posInPhrase * posInPhrase * (3 - 2 * posInPhrase); // smoothstep
    this.tension = currentPhraseTension + (nextPhraseTension - currentPhraseTension) * ease;

    // Add micro-tension from bar position (slight rise toward bar end)
    const barPos = this.beat / this.beatsPerBar;
    this.tension += Math.sin(barPos * Math.PI) * 0.05;

    this.tension = Math.max(0, Math.min(1, this.tension));
  }

  _getArcTension(phraseIdx) {
    const phraseTensions = this.arcShapes[this.arcShape] || this.arcShapes.breathe;
    return phraseTensions[phraseIdx % phraseTensions.length] || 0.3;
  }

  /* ── Orchestration density ── */
  _updateDensity() {
    // Density follows tension but with lag (instruments don't appear instantly)
    const target = 0.2 + this.tension * 0.7;
    this.density += (target - this.density) * 0.1;

    // At very low tension, reduce to near-solo
    if (this.tension < 0.15) {
      this.density = Math.min(this.density, 0.25);
    }
  }

  /* ── Arc management ── */
  _nextArc() {
    if (this._arcQueue.length === 0) this._pickArcQueue();

    this.arcShape = this._arcQueue[this._arcIdx % this._arcQueue.length];
    this._arcIdx++;

    // Vary phrase length slightly for organic feel
    this.barsPerPhrase = 4 + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0);
    this.barsPerPhrase = Math.max(3, Math.min(6, this.barsPerPhrase));

    // Vary BPM slightly (±3) for rubato feel between arcs
    this.bpm += (Math.random() - 0.5) * 6;
    this.bpm = Math.max(50, Math.min(120, this.bpm));

    // Adjust pulse rate based on arc shape
    if (this.arcShape === 'sparse' || this.arcShape === 'descend') {
      this.pulseRate = 0.5; // half-note pulse, more spacious
    } else if (this.arcShape === 'dramatic' || this.arcShape === 'build') {
      this.pulseRate = 1;   // quarter-note pulse, driving
    } else {
      this.pulseRate = Math.random() < 0.5 ? 0.5 : 1;
    }
  }

  _pickArcQueue() {
    // Balanced sequence: never two builds in a row, always breathe after dramatic
    const shapes = Object.keys(this.arcShapes);
    const queue = [];
    let last = '';

    for (let i = 0; i < 6; i++) {
      let pick;
      do {
        pick = shapes[Math.floor(Math.random() * shapes.length)];
      } while (
        pick === last
        || (pick === 'build' && last === 'build')
        || (pick === 'dramatic' && last === 'dramatic')
      );

      // After dramatic, insert breathe
      if (last === 'dramatic') pick = 'breathe';

      queue.push(pick);
      last = pick;
    }

    this._arcQueue = queue;
    this._arcIdx = 0;
  }

  /* ── Musical Memory ── */
  rememberTheme(themeData) {
    this.memory.themes.push(themeData);
    if (this.memory.themes.length > 5) this.memory.themes.shift();
  }

  rememberChord(chordVoicing) {
    this.memory.favoriteChords.push(chordVoicing);
    if (this.memory.favoriteChords.length > 8) this.memory.favoriteChords.shift();
  }

  rememberPeak() {
    this.memory.peakMoments.push(this.totalBeats);
  }

  rememberSilence() {
    this.memory.silences.push(this.totalBeats);
  }

  /* ── Variable Harmonic Rhythm ──
     Instead of fixed 2-bar chord changes, harmonic rhythm varies with tension.
     High tension = faster chord changes (every 1 bar), low tension = slower (every 3-4 bars).
     Phrase boundaries always suggest a chord change for musical punctuation. */
  _shouldChangeChord() {
    // Only on downbeats
    if (this.beat !== 0) return false;

    // Always change at phrase start (strong structural boundary)
    if (this.bar === 0) return true;

    // Determine harmonic rhythm rate based on tension.
    // SLOWER harmonic rhythm = more time for each chord to establish its character.
    // This is key to making the music feel musical rather than restless.
    // SLOWER harmonic rhythm = more time for each chord to establish its character.
    // This is key to making the music feel musical rather than restless.
    // Very low tension (< 0.15): every 6 bars — drone-like, meditative
    // Low tension (< 0.3): every 4 bars — spacious harmony
    // Medium tension (0.3-0.6): every 3 bars — standard
    // Higher tension (0.6-0.8): every 2 bars
    // Peak tension (> 0.8): every bar
    let barsPerChord;
    if (this.tension < 0.15) {
      barsPerChord = 6;
    } else if (this.tension < 0.3) {
      barsPerChord = 4;
    } else if (this.tension < 0.6) {
      barsPerChord = 3;
    } else if (this.tension < 0.8) {
      barsPerChord = 2;
    } else {
      barsPerChord = 1;
    }

    // Check if current bar aligns with the harmonic rhythm
    if (this.bar % barsPerChord === 0) return true;

    // At peak tension only, occasionally allow an extra change
    if (this.tension > 0.85 && Math.random() < 0.10) return true;

    return false;
  }

  /* ── Context-aware BPM suggestion ── */
  suggestBpmForContext(ctx) {
    let bpm = 72; // default

    if (ctx.timeOfDay === 'morning') bpm = 78;
    else if (ctx.timeOfDay === 'lateMorning') bpm = 76;
    else if (ctx.timeOfDay === 'afternoon') bpm = 72;
    else if (ctx.timeOfDay === 'evening') bpm = 66;
    else if (ctx.timeOfDay === 'night') bpm = 58;
    else if (ctx.timeOfDay === 'lateNight') bpm = 50;

    // Weather modifiers
    if (ctx.weather === 'rain') bpm -= 4;
    if (ctx.weather === 'storm') bpm += 6;
    if (ctx.weather === 'snow') bpm -= 8;
    if (ctx.weather === 'fog') bpm -= 6;

    // Movement
    if (ctx.movement === 'walking') bpm += 10;
    if (ctx.movement === 'active') bpm += 20;

    return Math.max(45, Math.min(130, bpm));
  }
}
