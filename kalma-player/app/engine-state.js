/* Kálma Player — Music State Model
   The single source of truth for the current musical state.
   
   5 core parameters drive ALL composition decisions:
   - mood: emotional character (calm, focused, dreamy, sad, tense, excited, sleepy)
   - energy: 0-100 (rhythmic activity, note density, dynamic range)
   - tension: 0-100 (harmonic dissonance, unresolved movement)
   - density: 0-100 (how many layers/voices are active)
   - brightness: 0-100 (filter cutoff, timbre warmth vs sparkle)
   
   Every engine reads from this. Nobody writes random parameters anymore.
   Mood changes update the state model, and the state model drives the music. */

class MusicState {
  constructor() {
    // Core parameters
    this.mood = 'calm';
    this.energy = 25;
    this.tension = 10;
    this.density = 25;
    this.brightness = 45;

    // Derived musical decisions (computed from core params)
    this.scale = [0, 2, 4, 7, 9];
    this.chords = [];
    this.baseFreq = 196;
    this.bpm = 66;
    this.harmonicRhythm = 4; // bars per chord change

    // Musical memory — what was played before
    this._history = [];       // last N state snapshots
    this._motifs = [];        // remembered melodic seeds
    this._prevChords = [];    // previous chord progression (for smooth transitions)

    // Section tracking
    this.section = 'A';
    this.sectionBar = 0;
    this.sectionLength = 16;
    this._sectionPlan = [];
    this._sectionIndex = 0;

    // Listeners
    this._listeners = [];

    // Initialize derived values and section plan immediately
    this._recomputeDerived();
    this._planSections();
  }

  /* ═══ MOOD PRESETS ═══
     Each mood maps to the 5 core parameters.
     These are starting points — context (time, weather, text) adjusts them. */

  static MOOD_PROFILES = {
    calm:    { energy: 25, tension: 10, density: 25, brightness: 45 },
    focused: { energy: 40, tension: 20, density: 35, brightness: 55 },
    dreamy:  { energy: 15, tension: 15, density: 20, brightness: 35 },
    sad:     { energy: 20, tension: 30, density: 20, brightness: 30 },
    tense:   { energy: 55, tension: 70, density: 50, brightness: 40 },
    excited: { energy: 80, tension: 35, density: 70, brightness: 75 },
    sleepy:  { energy: 10, tension: 5,  density: 10, brightness: 25 },
    dark:    { energy: 30, tension: 45, density: 30, brightness: 20 },
    hopeful: { energy: 45, tension: 15, density: 40, brightness: 65 },
    lonely:  { energy: 15, tension: 25, density: 15, brightness: 25 },
    epic:    { energy: 75, tension: 50, density: 65, brightness: 70 },
    mysterious: { energy: 20, tension: 40, density: 25, brightness: 30 }
  };

  /* ═══ SCALE LIBRARY ═══
     Scales chosen by mood + tension, not randomly. */

  static SCALES = {
    major:         [0, 2, 4, 5, 7, 9, 11],
    minor:         [0, 2, 3, 5, 7, 8, 10],
    dorian:        [0, 2, 3, 5, 7, 9, 10],
    lydian:        [0, 2, 4, 6, 7, 9, 11],
    mixolydian:    [0, 2, 4, 5, 7, 9, 10],
    phrygian:      [0, 1, 3, 5, 7, 8, 10],
    aeolian:       [0, 2, 3, 5, 7, 8, 10],
    pentatonic:    [0, 2, 4, 7, 9],
    minPentatonic: [0, 3, 5, 7, 10],
    wholeTone:     [0, 2, 4, 6, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11]
  };

  /* ═══ CHORD LANGUAGE ═══
     Chord progressions organized by emotional function.
     Each entry: array of chords, each chord = array of semitones from root. */

  static CHORD_POOLS = {
    calm: [
      // I, IV, vi, V — classic resolution
      [[0,4,7], [5,9,0], [9,0,4], [7,11,2]],
      // Imaj7, IVmaj7, vi7 — extended warmth
      [[0,4,7,11], [5,9,0,4], [9,0,4,7], [7,11,2,5]],
      // Isus2, IV, vi, Vsus4 — open, airy
      [[0,2,7], [5,9,0], [9,0,4], [7,0,2]]
    ],
    dreamy: [
      // Lydian color: Imaj9, IIadd9, Vmaj7, iii7
      [[0,4,7,11,2], [2,4,7,9], [7,11,2,5], [4,7,11,2]],
      // Floating maj7s
      [[0,4,7,11], [5,9,0,4], [9,0,4,7], [2,5,9,0]],
      // Quartal voicings — open, spacious
      [[0,5,7,12], [2,7,9,14], [5,7,0,5], [7,0,2,7]]
    ],
    sad: [
      // i, bVI, bVII, iv — melancholic minor
      [[0,3,7], [8,0,3], [10,2,5], [5,8,0]],
      // i7, iv7, III7, VI7
      [[0,3,7,10], [5,8,0,3], [3,7,10,2], [8,0,3,7]],
      // Aeolian descent
      [[0,3,7], [10,2,5], [8,0,3], [7,10,2]]
    ],
    tense: [
      // Phrygian color: i, bII, bVII, iv
      [[0,3,7], [1,5,8], [10,2,5], [5,8,0]],
      // Dom7 cycle
      [[0,4,7,10], [5,9,0,4], [2,5,9,0], [7,11,2,5]],
      // Diminished passing motion
      [[0,3,7], [3,6,9], [5,8,0], [0,3,7,10]]
    ],
    excited: [
      // Energetic major: I, V, vi, IV
      [[0,4,7], [7,11,2], [9,0,4], [5,9,0]],
      // Ascending: I, ii, iii, IV
      [[0,4,7,11], [2,5,9,0], [4,7,11,2], [5,9,0,4]],
      // Power with color
      [[0,4,7], [5,9,0], [7,11,2], [0,4,7,11]]
    ],
    sleepy: [
      // Minimal movement: I, IV back and forth
      [[0,4,7,11], [5,9,0,4], [0,4,7,11], [5,9,0,4]],
      // Drone-like: I pedal with upper voice movement
      [[0,7,11], [0,5,9], [0,7,11], [0,5,9]],
      // Very open spacing
      [[0,7,14], [5,12,17], [0,7,14], [5,12,17]]
    ],
    dark: [
      // Phrygian: i, bII, v, bVI
      [[0,3,7], [1,5,8], [7,10,2], [8,0,3]],
      // Quartal minor
      [[0,5,10], [3,8,1], [7,0,5], [0,5,10]],
      // Open fifths — ambiguous, vast
      [[0,7,12], [5,0,7], [8,3,10], [0,7,12]]
    ],
    hopeful: [
      // Rising major: I, iii, vi, IV
      [[0,4,7,11], [4,7,11,2], [9,0,4,7], [5,9,0,4]],
      // Lydian bright
      [[0,4,7,11], [2,6,9,11], [7,11,2,6], [0,4,7,11]],
      // I, IV, V, vi — standard uplifting
      [[0,4,7], [5,9,0], [7,11,2], [9,0,4]]
    ],
    epic: [
      // Cinematic power
      [[0,4,7,14], [5,9,12,16], [7,11,14,19], [0,4,7,11]],
      // i, bVI, bIII, bVII — epic minor
      [[0,3,7], [8,0,3], [3,7,10], [10,2,5]],
      // Wide voicing majesty
      [[0,7,12,16], [5,12,17,21], [8,15,19,24], [3,10,15,19]]
    ],
    mysterious: [
      // Quartal harmony — no clear root
      [[0,5,7], [2,7,9], [5,7,0], [7,0,2]],
      // Open fifths, vast space
      [[0,7,14], [5,12,19], [7,14,21], [0,7,14]],
      // Sus/add voicings — unresolved
      [[0,4,11], [5,9,4], [7,11,4], [0,4,11]]
    ]
  };

  /* ═══ MOOD → SCALE MAPPING ═══ */
  static MOOD_SCALES = {
    calm:       'pentatonic',
    focused:    'major',
    dreamy:     'lydian',
    sad:        'aeolian',
    tense:      'phrygian',
    excited:    'major',
    sleepy:     'pentatonic',
    dark:       'phrygian',
    hopeful:    'lydian',
    lonely:     'aeolian',
    epic:       'minor',
    mysterious: 'wholeTone'
  };

  /* ═══ MOOD → BASE FREQ ═══ */
  static MOOD_FREQ = {
    calm:       196,  // G3
    focused:    220,  // A3
    dreamy:     174,  // F3
    sad:        185,  // F#3
    tense:      208,  // G#3
    excited:    261,  // C4
    sleepy:     146,  // D3
    dark:       164,  // E3
    hopeful:    246,  // B3
    lonely:     174,  // F3
    epic:       220,  // A3
    mysterious: 185   // F#3
  };

  /* ═══ MOOD → BPM ═══ */
  static MOOD_BPM = {
    calm:       66,
    focused:    80,
    dreamy:     56,
    sad:        58,
    tense:      72,
    excited:    110,
    sleepy:     50,
    dark:       62,
    hopeful:    78,
    lonely:     54,
    epic:       90,
    mysterious: 60
  };

  /* ═══ SET MOOD ═══
     The main entry point. Sets core params and recomputes all derived values.
     Transition is handled separately — this just sets the target state. */
  setMood(mood) {
    const profile = MusicState.MOOD_PROFILES[mood];
    if (!profile) {
      console.warn('[MusicState] Unknown mood:', mood, '— keeping current');
      return;
    }

    // Snapshot current state for transition
    this._saveHistory();

    this.mood = mood;
    this.energy = profile.energy;
    this.tension = profile.tension;
    this.density = profile.density;
    this.brightness = profile.brightness;

    this._recomputeDerived();
    this._planSections();
    this._notify('moodChange');
  }

  /* ═══ ADJUST PARAMETERS (context modifiers) ═══
     Time of day, weather, etc. nudge the core params without changing mood. */
  adjust(deltas) {
    if (deltas.energy !== undefined) this.energy = this._clamp(this.energy + deltas.energy);
    if (deltas.tension !== undefined) this.tension = this._clamp(this.tension + deltas.tension);
    if (deltas.density !== undefined) this.density = this._clamp(this.density + deltas.density);
    if (deltas.brightness !== undefined) this.brightness = this._clamp(this.brightness + deltas.brightness);
    this._recomputeDerived();
    this._notify('adjust');
  }

  /* ═══ RECOMPUTE DERIVED VALUES ═══
     Core params → musical decisions. This is the composition logic. */
  _recomputeDerived() {
    // Scale
    const scaleName = MusicState.MOOD_SCALES[this.mood] || 'pentatonic';
    this.scale = MusicState.SCALES[scaleName] || MusicState.SCALES.pentatonic;

    // High tension can darken the scale
    if (this.tension > 60 && scaleName === 'major') {
      this.scale = MusicState.SCALES.mixolydian;
    }
    if (this.tension > 75) {
      this.scale = MusicState.SCALES.phrygian;
    }

    // Base frequency
    this.baseFreq = MusicState.MOOD_FREQ[this.mood] || 196;

    // BPM
    this.bpm = MusicState.MOOD_BPM[this.mood] || 66;
    // Energy modifies BPM: ±15% range
    this.bpm = Math.round(this.bpm * (0.85 + (this.energy / 100) * 0.30));
    this.bpm = Math.max(40, Math.min(140, this.bpm));

    // Chord progression
    this._prevChords = this.chords.length ? [...this.chords] : [];
    const pool = MusicState.CHORD_POOLS[this.mood] || MusicState.CHORD_POOLS.calm;
    this.chords = pool[Math.floor(Math.random() * pool.length)];

    // Harmonic rhythm (bars per chord) — driven by energy + tension
    if (this.energy < 20) {
      this.harmonicRhythm = 6; // very slow — meditative
    } else if (this.energy < 40) {
      this.harmonicRhythm = 4; // spacious
    } else if (this.energy < 60) {
      this.harmonicRhythm = 3; // moderate
    } else if (this.energy < 80) {
      this.harmonicRhythm = 2; // moving
    } else {
      this.harmonicRhythm = 1; // driving
    }
  }

  /* ═══ SECTION STRUCTURE ═══
     Even infinite music needs form. Plan sections ahead. */
  _planSections() {
    // Standard form: Intro → A → A' → B → A return → transition
    this._sectionPlan = [
      { name: 'intro', bars: 8,  densityMod: -20, energyMod: -10 },
      { name: 'A',     bars: 16, densityMod: 0,   energyMod: 0 },
      { name: 'A\'',   bars: 16, densityMod: 5,   energyMod: 5 },
      { name: 'B',     bars: 12, densityMod: 10,  energyMod: 10 },
      { name: 'A_ret', bars: 16, densityMod: 0,   energyMod: -5 },
      { name: 'trans', bars: 4,  densityMod: -15, energyMod: -15 }
    ];
    this._sectionIndex = 0;
    this.section = this._sectionPlan[0].name;
    this.sectionBar = 0;
    this.sectionLength = this._sectionPlan[0].bars;
  }

  /* Called by phrase engine on each bar boundary */
  advanceBar() {
    this.sectionBar++;
    if (this.sectionBar >= this.sectionLength) {
      this._advanceSection();
    }
    return this.getCurrentSection();
  }

  _advanceSection() {
    this._sectionIndex++;
    if (this._sectionIndex >= this._sectionPlan.length) {
      // Loop back, but vary: swap A' and B sometimes, change B length
      this._sectionPlan[2].bars = Math.random() < 0.5 ? 12 : 16;
      this._sectionPlan[3].bars = 8 + Math.floor(Math.random() * 3) * 4;
      this._sectionIndex = 1; // skip intro on repeat
    }

    const sec = this._sectionPlan[this._sectionIndex];
    this.section = sec.name;
    this.sectionBar = 0;
    this.sectionLength = sec.bars;

    this._notify('sectionChange');
    return sec;
  }

  getCurrentSection() {
    const sec = this._sectionPlan[this._sectionIndex] || this._sectionPlan[0];
    return {
      name: sec.name,
      bar: this.sectionBar,
      length: sec.bars,
      progress: this.sectionBar / sec.bars,
      densityMod: sec.densityMod,
      energyMod: sec.energyMod,
      isIntro: sec.name === 'intro',
      isTransition: sec.name === 'trans',
      isReturn: sec.name === 'A_ret'
    };
  }

  /* ═══ EFFECTIVE VALUES ═══
     Core params + section modifiers = what engines actually use. */
  getEffective() {
    const sec = this.getCurrentSection();
    return {
      mood: this.mood,
      energy: this._clamp(this.energy + (sec.energyMod || 0)),
      tension: this.tension,
      density: this._clamp(this.density + (sec.densityMod || 0)),
      brightness: this.brightness,
      scale: this.scale,
      chords: this.chords,
      baseFreq: this.baseFreq,
      bpm: this.bpm,
      harmonicRhythm: this.harmonicRhythm,
      section: sec
    };
  }

  /* ═══ MOTIF MEMORY ═══ */
  rememberMotif(motifData) {
    this._motifs.push({ data: motifData, mood: this.mood, time: Date.now() });
    if (this._motifs.length > 8) this._motifs.shift();
  }

  getMotifs() { return this._motifs; }

  /* Suggest recalling a motif (for continuity between moods) */
  suggestRecall() {
    if (this._motifs.length === 0) return null;
    // Prefer motifs from the previous mood for smooth transitions
    const prev = this._history.length > 0 ? this._history[this._history.length - 1].mood : null;
    const fromPrev = this._motifs.filter(m => m.mood === prev);
    if (fromPrev.length > 0) {
      return fromPrev[Math.floor(Math.random() * fromPrev.length)].data;
    }
    return this._motifs[Math.floor(Math.random() * this._motifs.length)].data;
  }

  /* ═══ HISTORY ═══ */
  _saveHistory() {
    this._history.push({
      mood: this.mood,
      energy: this.energy,
      tension: this.tension,
      density: this.density,
      brightness: this.brightness,
      chords: [...this.chords],
      scale: [...this.scale],
      time: Date.now()
    });
    if (this._history.length > 20) this._history.shift();
  }

  getPreviousState() {
    return this._history.length > 0 ? this._history[this._history.length - 1] : null;
  }

  /* ═══ EVENTS ═══ */
  onChange(fn) { this._listeners.push(fn); }
  _notify(type) {
    const state = this.getEffective();
    this._listeners.forEach(fn => fn({ type, state }));
  }

  /* ═══ UTIL ═══ */
  _clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }
}
