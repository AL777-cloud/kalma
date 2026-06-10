/* Kálma Player — Composition Engine
   Reads MusicState and makes musical decisions for each layer.
   
   Composition hierarchy:
   1. Key / Scale (from state)
   2. Chord progression (from state)
   3. Bass / root movement
   4. Main motif
   5. Counter motif
   6. Rhythm / pulse
   7. Texture / pad
   8. FX / transitions
   
   Every layer follows the same musical state.
   The composer doesn't make sound — it makes DECISIONS. */

class CompositionEngine {
  constructor(state) {
    this.state = state; // MusicState reference

    // Active motif (the musical identity of this session)
    this.motif = null;
    this._motifAge = 0;         // how many bars since motif was created
    this._motifVariation = 0;   // which variation stage we're in

    // Counter motif (response/complement to main motif)
    this.counterMotif = null;

    // Bass pattern
    this.bassPattern = null;

    // Transition state
    this._transitioning = false;
    this._transitionStep = 0;
    this._transitionFrom = null;
    this._transitionTo = null;
    this._transitionBarsLeft = 0;
  }

  /* ═══ MOTIF GENERATION ═══
     Create a small musical identity: 2-6 notes from the current scale.
     This is THE recognizable phrase that slowly transforms. */

  generateMotif() {
    const s = this.state.getEffective();
    const scale = s.scale;
    const energy = s.energy;

    // §12: Try to transform a previous motif first (musical memory)
    const recalled = this.state.suggestRecall();
    if (recalled && Math.random() < 0.6) {
      const transformed = this.transformMotifForMood(recalled, s.mood);
      if (transformed) {
        this.motif = transformed;
        this._motifAge = 0;
        this._motifVariation = 0;
        this.state.rememberMotif(this.motif);
        console.log('[Composer] Transformed recalled motif from', transformed.derivedFrom, '→', s.mood);
        return this.motif;
      }
    }

    // Motif length: low energy = shorter (2-3), high energy = longer (4-6)
    const len = Math.max(2, Math.min(6, Math.round(2 + (energy / 100) * 4)));

    // Build motif from scale degrees with musical contour
    const contour = this._pickContour(len);
    const notes = [];
    let currentDegree = Math.floor(Math.random() * scale.length);

    for (let i = 0; i < len; i++) {
      // Follow contour direction
      const dir = contour[i];
      if (dir > 0) currentDegree = Math.min(scale.length - 1, currentDegree + 1 + Math.floor(Math.random() * 2));
      else if (dir < 0) currentDegree = Math.max(0, currentDegree - 1 - Math.floor(Math.random() * 2));
      // else stay (repeated note or neighbor)

      const semitone = scale[currentDegree % scale.length];
      const octaveShift = Math.floor(currentDegree / scale.length);

      // Rhythm: duration in beats (quarter=1, half=2, whole=4)
      let dur;
      if (energy < 25) dur = 2 + Math.random() * 2;      // slow, spacious
      else if (energy < 50) dur = 1 + Math.random() * 1;  // moderate
      else if (energy < 75) dur = 0.5 + Math.random() * 1; // rhythmic
      else dur = 0.25 + Math.random() * 0.75;              // fast, driving

      notes.push({
        degree: currentDegree,
        semitone: semitone + octaveShift * 12,
        duration: dur,
        velocity: 0.5 + Math.random() * 0.3, // 0.5-0.8
        accent: i === 0 // first note accented
      });
    }

    this.motif = {
      notes,
      mood: s.mood,
      scale: [...scale],
      createdAt: Date.now()
    };
    this._motifAge = 0;
    this._motifVariation = 0;

    // Remember in state model
    this.state.rememberMotif(this.motif);

    console.log('[Composer] New motif:', notes.map(n => n.semitone).join(', '));
    return this.motif;
  }

  /* Motif contour shapes (melodic direction per note) */
  _pickContour(len) {
    const contours = {
      arch:      (i, l) => i < l / 2 ? 1 : -1,        // up then down
      ascending: (i) => 1,                              // always up
      descending:(i) => -1,                              // always down
      wave:      (i) => Math.sin(i * Math.PI / 2) > 0 ? 1 : -1, // oscillating
      step:      (i) => i % 2 === 0 ? 1 : 0,           // step up, hold
    };
    const shapes = Object.values(contours);
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    return Array.from({ length: len }, (_, i) => shape(i, len));
  }

  /* ═══ MOTIF VARIATION ═══
     Motif behavior: repeat → vary → expand → rest → return
     Called each phrase boundary to decide how to transform. */

  getMotifForBar(bar) {
    if (!this.motif) this.generateMotif();
    this._motifAge++;

    // Variation cycle (repeats every ~24 bars)
    const cycle = this._motifAge % 24;

    if (cycle < 4) {
      // REPEAT: play motif as-is (establish the identity)
      return { notes: this.motif.notes, variation: 'repeat' };
    } else if (cycle < 10) {
      // VARY: change rhythm, transpose, add passing notes
      return { notes: this._varyMotif(), variation: 'vary' };
    } else if (cycle < 14) {
      // EXPAND: stretch and elaborate
      return { notes: this._expandMotif(), variation: 'expand' };
    } else if (cycle < 18) {
      // REST: silence (the motif breathes)
      return { notes: [], variation: 'rest' };
    } else {
      // RETURN: bring it back (possibly from state memory)
      const recalled = this.state.suggestRecall();
      if (recalled && recalled.notes) {
        return { notes: recalled.notes, variation: 'recall' };
      }
      return { notes: this.motif.notes, variation: 'return' };
    }
  }

  /* Variation: change rhythm of existing notes */
  _varyMotif() {
    if (!this.motif) return [];
    const s = this.state.getEffective();
    return this.motif.notes.map(n => {
      const varied = { ...n };
      // Randomly alter duration
      if (Math.random() < 0.4) {
        varied.duration *= (0.5 + Math.random());
      }
      // Occasionally transpose by a step
      if (Math.random() < 0.2) {
        const step = Math.random() < 0.5 ? 1 : -1;
        const newDeg = Math.max(0, Math.min(s.scale.length - 1, n.degree + step));
        varied.semitone = s.scale[newDeg % s.scale.length] + Math.floor(newDeg / s.scale.length) * 12;
        varied.degree = newDeg;
      }
      return varied;
    });
  }

  /* Expansion: add passing notes between existing ones */
  _expandMotif() {
    if (!this.motif) return [];
    const s = this.state.getEffective();
    const expanded = [];
    for (let i = 0; i < this.motif.notes.length; i++) {
      expanded.push({ ...this.motif.notes[i] });
      // Add a passing note between this and next
      if (i < this.motif.notes.length - 1 && Math.random() < 0.5) {
        const curr = this.motif.notes[i];
        const next = this.motif.notes[i + 1];
        const midDegree = Math.round((curr.degree + next.degree) / 2);
        const midSemi = s.scale[midDegree % s.scale.length] || curr.semitone;
        expanded.push({
          degree: midDegree,
          semitone: midSemi,
          duration: curr.duration * 0.5,
          velocity: curr.velocity * 0.7,
          accent: false
        });
      }
    }
    return expanded;
  }

  /* ═══ COUNTER MOTIF ═══
     Complement to the main motif — plays in the gaps. */

  generateCounterMotif() {
    if (!this.motif) return null;
    const s = this.state.getEffective();
    // Invert the main motif's contour
    this.counterMotif = this.motif.notes.map(n => {
      const inverted = { ...n };
      // Mirror around the middle of the scale
      const mid = Math.floor(s.scale.length / 2);
      inverted.degree = s.scale.length - 1 - n.degree;
      inverted.semitone = s.scale[inverted.degree % s.scale.length] || n.semitone;
      inverted.duration = n.duration * 1.5; // longer, more relaxed
      inverted.velocity = n.velocity * 0.7; // quieter
      return inverted;
    });
    return this.counterMotif;
  }

  /* ═══ BASS LINE ═══
     Bass follows chord roots, rhythm based on energy. */

  getBassForChord(chordIndex) {
    const s = this.state.getEffective();
    const chord = s.chords[chordIndex % s.chords.length];
    if (!chord || chord.length === 0) return null;

    const root = chord[0];
    const fifth = chord.length >= 3 ? chord[2] : root + 7;
    const energy = s.energy;

    if (energy < 25) {
      // Minimal: just the root, long sustained
      return [{ semitone: root, duration: 8, velocity: 0.4 }];
    } else if (energy < 50) {
      // Root + fifth, alternating
      return [
        { semitone: root, duration: 4, velocity: 0.5 },
        { semitone: fifth, duration: 4, velocity: 0.35 }
      ];
    } else if (energy < 75) {
      // Walking bass: root, passing, fifth, root
      const passing = s.scale[Math.floor(s.scale.length / 2)] || 5;
      return [
        { semitone: root, duration: 2, velocity: 0.55 },
        { semitone: passing, duration: 2, velocity: 0.35 },
        { semitone: fifth, duration: 2, velocity: 0.45 },
        { semitone: root, duration: 2, velocity: 0.4 }
      ];
    } else {
      // Rhythmic: syncopated root notes
      return [
        { semitone: root, duration: 1, velocity: 0.65 },
        { semitone: root, duration: 0.5, velocity: 0.3 },
        { semitone: fifth, duration: 1.5, velocity: 0.5 },
        { semitone: root, duration: 1, velocity: 0.55 }
      ];
    }
  }

  /* ═══ PAD BEHAVIOR ═══
     Pad follows chords. Density and brightness control character. */

  getPadVoicing(chordIndex) {
    const s = this.state.getEffective();
    if (!s.chords || s.chords.length === 0) return null;
    const chord = s.chords[chordIndex % s.chords.length];
    if (!chord) return null;

    // Number of voices: 2-4 based on density
    const voiceCount = Math.max(2, Math.min(4, Math.round(2 + (s.density / 100) * 2)));
    const voices = chord.slice(0, voiceCount);

    // Attack time: inversely proportional to energy
    const attack = Math.max(2, 10 - (s.energy / 100) * 8);

    // Filter: brightness controls cutoff
    const filterFreq = 300 + (s.brightness / 100) * 700;

    return {
      voices,
      attack,
      filterFreq,
      gain: 0.1 / voiceCount // per-voice gain
    };
  }

  /* ═══ BEAT DECISIONS ═══
     Whether beats should play, and at what complexity. */

  shouldBeatsPlay() {
    const s = this.state.getEffective();
    // Beats only above energy threshold
    if (s.energy < 40) return { play: false };
    return {
      play: true,
      complexity: (s.energy - 40) / 60, // 0-1
      swing: s.mood === 'dreamy' || s.mood === 'sleepy' ? 0.15 : 0
    };
  }

  /* ═══ TEXTURE / FX DECISIONS ═══ */

  getTextureParams() {
    const s = this.state.getEffective();
    return {
      reverbMix: 0.2 + ((100 - s.energy) / 100) * 0.35,   // more reverb when calm
      filterFreq: 300 + (s.brightness / 100) * 1200,
      filterQ: 0.3 + (s.tension / 100) * 0.7,               // resonance = tension
      detune: 5 + ((100 - s.brightness) / 100) * 15,        // darker = more detune
      droneCount: Math.max(1, Math.round((s.density / 100) * 4)),
      droneGain: 0.15 / Math.max(1, Math.round((s.density / 100) * 4))
    };
  }

  /* ═══ TRANSITION SYSTEM ═══
     Multi-step mood transition (not instant crossfade).
     Step 1: reduce current density
     Step 2: keep shared tones
     Step 3: introduce new chord color
     Step 4: morph rhythm
     Step 5: introduce new motif variation
     Step 6: change synth texture */

  startTransition(fromMood, toMood, totalBars) {
    this._transitioning = true;
    this._transitionStep = 0;
    this._transitionFrom = fromMood;
    this._transitionTo = toMood;
    this._transitionBarsLeft = totalBars || 16;
    this._transitionTotalBars = this._transitionBarsLeft;
    console.log('[Composer] Transition:', fromMood, '→', toMood, 'over', totalBars, 'bars');
    return this.getTransitionState();
  }

  /* §12: Transform a previous motif to fit the new mood.
     Every new mood relates to the previous material, but transformed
     enough to feel new. Without memory it feels random; with memory, music. */
  transformMotifForMood(oldMotif, newMood) {
    if (!oldMotif || !oldMotif.notes || oldMotif.notes.length === 0) return null;
    const s = this.state.getEffective();
    const newScale = s.scale;

    // Re-map old motif notes to nearest scale tones in new key
    const transformed = oldMotif.notes.map(n => {
      let bestDist = Infinity;
      let bestSemi = n.semitone;
      for (const scaleTone of newScale) {
        for (const offset of [-12, 0, 12]) {
          const candidate = scaleTone + offset;
          const dist = Math.abs(candidate - n.semitone);
          if (dist < bestDist) {
            bestDist = dist;
            bestSemi = candidate;
          }
        }
      }
      return {
        ...n,
        semitone: bestSemi,
        duration: n.duration * (s.energy < 30 ? 1.5 : s.energy > 70 ? 0.7 : 1.0),
        velocity: n.velocity * (s.energy < 30 ? 0.7 : 1.0)
      };
    });

    return {
      notes: transformed,
      mood: newMood,
      scale: [...newScale],
      createdAt: Date.now(),
      derivedFrom: oldMotif.mood || 'unknown'
    };
  }

  /* Called every bar during a transition. Returns what to do this bar. */
  advanceTransition() {
    if (!this._transitioning) return null;
    this._transitionBarsLeft--;
    const progress = 1 - (this._transitionBarsLeft / this._transitionTotalBars);
    this._transitionStep = Math.floor(progress * 6); // 6 steps

    if (this._transitionBarsLeft <= 0) {
      this._transitioning = false;
      console.log('[Composer] Transition complete');
      return { step: 6, progress: 1, phase: 'complete' };
    }

    return this.getTransitionState();
  }

  getTransitionState() {
    if (!this._transitioning) return null;
    const progress = 1 - (this._transitionBarsLeft / this._transitionTotalBars);
    const step = this._transitionStep;

    const phases = [
      'reduce_density',     // 0: thin out current texture
      'keep_shared_tones',  // 1: find common notes between keys
      'new_chord_color',    // 2: introduce target chord voicings
      'morph_rhythm',       // 3: shift rhythmic feel
      'new_motif',          // 4: introduce motif variation for target mood
      'change_texture'      // 5: morph synth timbres
    ];

    return {
      step,
      progress,
      phase: phases[Math.min(step, 5)],
      from: this._transitionFrom,
      to: this._transitionTo,
      // How much of the "new" state to blend in (0 = old, 1 = new)
      blend: Math.min(1, progress * 1.2), // slightly ahead to feel responsive
      // Per-step instructions
      densityMult: step < 1 ? (1 - progress * 0.4) : 1,  // reduce initially
      chordBlend: step >= 2 ? Math.min(1, (progress - 0.3) * 2) : 0,
      rhythmBlend: step >= 3 ? Math.min(1, (progress - 0.5) * 3) : 0,
      motifReady: step >= 4,
      textureBlend: step >= 5 ? Math.min(1, (progress - 0.8) * 5) : 0
    };
  }

  isTransitioning() { return this._transitioning; }
}
