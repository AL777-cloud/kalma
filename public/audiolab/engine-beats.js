/* Kálma Player — Generative Beats Engine v2
   Beat types: Upbeat, Grounded, Dreamy, Energetic
   Each type has unique pattern DNA, BPM range, and evolution style.
   Patterns evolve structurally over time — sections, fills, variation, progression.
   No static loops — real musical rhythm with breathing. */

class KalmaBeats {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.alive = false;
    this.bpm = 80;
    this._externalBpm = null;
    this._schedulerInterval = null;
    this._nextStepTime = 0;
    this._lookahead = 0.1;
    this._scheduleWindow = 0.05;
    this.step = 0;
    this.pattern = [];
    this.swing = 0;
    this.velocity = 0.7;

    // Beat type (default: upbeat)
    this._beatType = 'upbeat';

    // Master gain for fade in/out
    this.masterGain = null;

    // Effect sends
    this.reverbGain = null;
    this.delayNode = null;
    this.delayGain = null;
    this.delayFeedback = null;
    this.reverbNode = null;

    // Song structure
    this.sectionIndex = 0;
    this.stepsInSection = 0;
    this.sectionLength = 64;
    this.transitioning = false;
    this.songSteps = 0;
    this.songLength = 0;
    this.songSections = [];
    this.currentSongSection = 0;

    // Evolution: tracks how many songs played for progressive complexity
    this._songsPlayed = 0;

    // Noise buffer for hats/snare
    this._noiseBuffer = null;
  }

  /* ═══ BEAT TYPE PROFILES ═══
     Each type defines: BPM range, pattern generators, velocity curves,
     swing feel, effect levels, and evolution style. */

  static BEAT_TYPES = {
    upbeat: {
      bpmRange: [125, 125],
      swing: [0.0, 0.0],
      velocityRange: [0.85, 1.0],
      delayMix: 0.08,
      reverbMix: 0.06,
      songMinutes: [4, 6],
      // Techno 4/4: kick EVERY quarter note, hi-hats on 8ths, clap on 2&4
      generatePattern(complexity) {
        return Array.from({length: 16}, (_, i) => {
          const kick = i % 4 === 0; // 4 on the floor — ALWAYS
          const clap = i === 4 || i === 12; // beats 2 and 4
          const hat = i % 2 === 0; // 8th note hats
          const openHat = i === 2 || i === 10; // offbeat open hats
          const perc = (i === 6 || i === 14) && complexity > 0.4;
          const ghost = i % 2 === 1 && Math.random() < complexity * 0.4; // 16th ghost hats
          return { kick, snare: clap, hat, openHat, perc, ghost };
        });
      },
      // "Sparse" for upbeat still keeps the 4/4 kick — just removes extras
      generateSparse(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: i % 4 === 0,
          snare: i === 4 || i === 12,
          hat: i % 2 === 0,
          openHat: false,
          perc: false,
          ghost: false
        }));
      }
    },

    grounded: {
      bpmRange: [65, 82],
      swing: [0.08, 0.14],
      velocityRange: [0.4, 0.75],
      delayMix: 0.12,
      reverbMix: 0.18,
      songMinutes: [4, 6],
      // Slower, steady pulse: deep kick, wide spacing, warm swing
      generatePattern(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: i === 0 || i === 10 || (complexity > 0.6 && i === 6),
          snare: i === 8 || (complexity > 0.7 && i === 14),
          hat: i % 4 === 2 || (i % 2 === 0 && complexity > 0.4),
          openHat: i === 6 && Math.random() < 0.2,
          perc: (i === 5 || i === 13) && Math.random() < complexity * 0.6,
          ghost: (i === 2 || i === 12) && Math.random() < 0.3
        }));
      },
      generateSparse(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: i === 0,
          snare: false,
          hat: i % 8 === 4,
          openHat: false,
          perc: false,
          ghost: i === 8 && Math.random() < 0.3
        }));
      }
    },

    dreamy: {
      bpmRange: [72, 92],
      swing: [0.04, 0.10],
      velocityRange: [0.25, 0.55],
      delayMix: 0.30,
      reverbMix: 0.35,
      songMinutes: [4, 7],
      // Soft, minimal rhythmic texture: ghostly hats, sparse kick, lots of reverb
      generatePattern(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: (i === 0 || i === 12) && Math.random() < 0.7,
          snare: i === 8 && Math.random() < 0.5 * complexity,
          hat: Math.random() < 0.35 + complexity * 0.15,
          openHat: i % 6 === 0 && Math.random() < 0.25,
          perc: Math.random() < 0.08 * complexity,
          ghost: Math.random() < 0.25
        }));
      },
      generateSparse(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: i === 0 && Math.random() < 0.6,
          snare: false,
          hat: Math.random() < 0.2,
          openHat: false,
          perc: i === 7 && Math.random() < 0.15,
          ghost: Math.random() < 0.15
        }));
      }
    },

    energetic: {
      bpmRange: [125, 145],
      swing: [0.0, 0.03],
      velocityRange: [0.65, 0.95],
      delayMix: 0.15,
      reverbMix: 0.08,
      songMinutes: [2.5, 4],
      // Faster, more active: syncopated kick, busy hats, fills
      generatePattern(complexity) {
        return Array.from({length: 16}, (_, i) => {
          const synco = [0, 3, 6, 10, 13];
          return {
            kick: synco.includes(i) || (complexity > 0.6 && i === 8),
            snare: i === 4 || i === 12 || (complexity > 0.7 && i === 14),
            hat: true,
            openHat: (i === 2 || i === 10) && Math.random() < 0.4,
            perc: (i % 3 === 0) && Math.random() < complexity * 0.5,
            ghost: i % 2 === 1 && Math.random() < 0.35
          };
        });
      },
      generateSparse(complexity) {
        return Array.from({length: 16}, (_, i) => ({
          kick: i === 0 || i === 8,
          snare: i === 12,
          hat: i % 2 === 0,
          openHat: false,
          perc: false,
          ghost: i === 4 && Math.random() < 0.4
        }));
      }
    }
  };

  /* ═══ PUBLIC API ═══ */

  /* Set the beat type — triggers re-plan on next song */
  setBeatType(type) {
    if (!KalmaBeats.BEAT_TYPES[type]) return;
    const changed = this._beatType !== type;
    this._beatType = type;
    this._externalBpm = null; // clear external BPM so profile's own BPM is used
    this._songsPlayed = 0;
    if (changed && this.alive) this._endSongAndStartNew();
  }

  getBeatType() { return this._beatType; }

  start() {
    if (this.alive) return;
    this.alive = true;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.output);

    // Build effects chain
    this._buildEffects();

    // Plan first song based on beat type
    this._planSong();

    // Smooth fade in
    this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 4);

    // Start sequencer
    this._nextStepTime = this.ctx.currentTime;
    this._startScheduler();
  }

  setBpm(bpm) {
    this._externalBpm = Math.max(45, Math.min(160, Math.round(bpm)));
    if (this.alive) {
      this.bpm = this._externalBpm;
      if (this.delayNode) this.delayNode.delayTime.value = (60 / this.bpm) * 0.75;
    }
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;

    if (this._schedulerInterval) { clearInterval(this._schedulerInterval); this._schedulerInterval = null; }

    const now = this.ctx.currentTime;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(0, now, 2.5);

    setTimeout(() => {
      try { this.delayNode.disconnect(); } catch(e){}
      try { this.delayGain.disconnect(); } catch(e){}
      try { this.delayFeedback.disconnect(); } catch(e){}
      try { this.reverbNode.disconnect(); } catch(e){}
      try { this.reverbGain.disconnect(); } catch(e){}
      try { this.masterGain.disconnect(); } catch(e){}
      this.masterGain = null;
    }, 8000);
  }

  /* ═══ EFFECTS ═══ */
  _buildEffects() {
    const ctx = this.ctx;
    const profile = KalmaBeats.BEAT_TYPES[this._beatType];

    // Delay
    this.delayNode = ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.375;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = profile.delayMix;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.masterGain);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    // Reverb
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = buf;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = profile.reverbMix;
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
  }

  _sendToDelay(node) { node.connect(this.delayNode); }
  _sendToReverb(node) { node.connect(this.reverbNode); }

  /* ═══ SONG PLANNING (type-aware) ═══ */

  _planSong() {
    const profile = KalmaBeats.BEAT_TYPES[this._beatType];

    // BPM: use external if provided, otherwise pick from type's range
    if (this._externalBpm) {
      this.bpm = this._externalBpm;
    } else {
      const [lo, hi] = profile.bpmRange;
      this.bpm = lo + Math.floor(Math.random() * (hi - lo));
    }
    const beatSec = 60 / this.bpm;
    if (this.delayNode) this.delayNode.delayTime.value = beatSec * 0.75;

    // Swing from type profile
    const [swLo, swHi] = profile.swing;
    const baseSwing = swLo + Math.random() * (swHi - swLo);

    // Complexity increases with songs played (caps at 1.0)
    const complexity = Math.min(1.0, 0.3 + this._songsPlayed * 0.15);

    // Generate patterns using the beat type's generators
    const patA = profile.generatePattern(complexity);
    const patB = profile.generatePattern(Math.min(1, complexity + 0.1));
    const patC = profile.generatePattern(Math.min(1, complexity + 0.2));
    const patSparse = profile.generateSparse(complexity);

    // Humanize: random micro-variations
    [patA, patB, patC].forEach(pat => {
      pat.forEach((step, i) => {
        if (Math.random() < 0.08) step.hat = !step.hat;
        if (Math.random() < 0.04) step.ghost = !step.ghost;
      });
    });

    // Song duration from profile
    const [minMin, maxMin] = profile.songMinutes;
    const songMinutes = minMin + Math.random() * (maxMin - minMin);
    const stepsPerMin = this.bpm * 4;
    this.songLength = Math.round(stepsPerMin * songMinutes);

    // Velocity range from profile
    const [vLo, vHi] = profile.velocityRange;

    // Section plan — varies by beat type
    const isFirst = this._songsPlayed === 0;
    const typeKey = this._beatType;

    let pcts, names, velCurve, swingCurve, patterns;

    if (typeKey === 'upbeat' || typeKey === 'energetic') {
      // Evolves like a track: kick intro → add hats → full groove → peak → breakdown → peak
      // patKickOnly: just the kick, nothing else
      const patKickOnly = Array.from({length: 16}, (_, i) => ({
        kick: i % 4 === 0, snare: false, hat: false, openHat: false, perc: false, ghost: false
      }));
      // patKickHat: kick + hats building in
      const patKickHat = Array.from({length: 16}, (_, i) => ({
        kick: i % 4 === 0, snare: false, hat: i % 2 === 0, openHat: false, perc: false, ghost: false
      }));
      pcts = [0.10, 0.12, 0.22, 0.25, 0.08, 0.23];
      names = ['intro', 'build', 'groove', 'peak', 'breakdown', 'peak2'];
      velCurve = [0.8, 0.85, 0.9, 1.0, 0.7, 1.0];
      swingCurve = [1, 1, 1, 1, 1, 1];
      patterns = [patKickOnly, patKickHat, patA, patC, patKickOnly, patC];
    } else if (isFirst) {
      pcts = [0.25, 0.15, 0.25, 0.15, 0.05, 0.15];
      names = ['verse', 'build', 'chorus', 'verse2', 'breakdown', 'chorus2'];
      velCurve = [0.7, 0.85, 1.0, 0.75, 0.5, 1.0];
      swingCurve = [1, 0.8, 1, 1, 0.5, 1];
      patterns = [patA, patB, patC, patA, patSparse, patC];
    } else {
      pcts = [0.08, 0.18, 0.12, 0.22, 0.14, 0.06, 0.15, 0.05];
      names = ['intro', 'verse', 'build', 'chorus', 'verse2', 'breakdown', 'chorus2', 'outro'];
      velCurve = [0.5, 0.7, 0.85, 1.0, 0.75, 0.5, 1.0, 0.5];
      swingCurve = [0.5, 1, 0.8, 1, 1, 0.5, 1, 0.3];
      patterns = [patSparse, patA, patB, patC, patA, patSparse, patC, patSparse];
    }

    this.songSections = pcts.map((pct, i) => ({
      name: names[i],
      length: Math.round(this.songLength * pct),
      pattern: patterns[i],
      velocity: vLo + (vHi - vLo) * velCurve[i],
      swing: baseSwing * swingCurve[i]
    }));

    this.currentSongSection = 0;
    this.songSteps = 0;
    this._applySongSection(0);
    this._songsPlayed++;
  }

  _applySongSection(idx) {
    if (idx >= this.songSections.length) return;
    const sec = this.songSections[idx];
    this.pattern = sec.pattern;
    this.velocity = sec.velocity;
    this.swing = sec.swing;
    this.sectionLength = sec.length;
    this.stepsInSection = 0;
    this.step = 0;
  }

  _advanceSection() {
    this.currentSongSection++;

    if (this.currentSongSection >= this.songSections.length) {
      this._endSongAndStartNew();
      return;
    }

    // Section transition — subtle wash
    this.transitioning = true;
    const now = this.ctx.currentTime;
    const profile = KalmaBeats.BEAT_TYPES[this._beatType];

    this.delayGain.gain.setTargetAtTime(profile.delayMix * 1.6, now, 0.8);
    this.delayFeedback.gain.setTargetAtTime(0.4, now, 0.5);
    this.reverbGain.gain.setTargetAtTime(profile.reverbMix * 1.8, now, 0.8);

    setTimeout(() => {
      if (!this.alive) return;
      this._applySongSection(this.currentSongSection);

      const t = this.ctx.currentTime;
      this.delayGain.gain.setTargetAtTime(profile.delayMix, t, 1.5);
      this.delayFeedback.gain.setTargetAtTime(0.3, t, 1.5);
      this.reverbGain.gain.setTargetAtTime(profile.reverbMix, t, 1.5);
      this.transitioning = false;
    }, 2000);
  }

  _endSongAndStartNew() {
    if (!this.alive) return;
    this.transitioning = true;
    const now = this.ctx.currentTime;
    const profile = KalmaBeats.BEAT_TYPES[this._beatType];

    // Brief transition wash (keep volume up — no silence gap)
    this.delayGain.gain.setTargetAtTime(profile.delayMix * 1.8, now, 0.8);
    this.delayFeedback.gain.setTargetAtTime(0.45, now, 0.6);
    this.reverbGain.gain.setTargetAtTime(profile.reverbMix * 2, now, 0.8);
    // Slight dip, not silence
    this.masterGain.gain.setTargetAtTime(0.6, now, 1.5);

    setTimeout(() => {
      if (!this.alive) return;

      const t = this.ctx.currentTime;
      this.delayGain.gain.setTargetAtTime(profile.delayMix, t, 1);
      this.delayFeedback.gain.setTargetAtTime(0.3, t, 1);
      this.reverbGain.gain.setTargetAtTime(profile.reverbMix, t, 1);

      this._planSong();
      this.masterGain.gain.setTargetAtTime(1, t, 2);
      this.transitioning = false;
    }, 3500);
  }

  /* ═══ SEQUENCER (lookahead — drift-free) ═══ */
  _startScheduler() {
    this._schedulerInterval = setInterval(() => this._schedulerTick(), 25);
  }

  _schedulerTick() {
    if (!this.alive) return;
    while (this._nextStepTime < this.ctx.currentTime + this._lookahead) {
      this._scheduleStep(this._nextStepTime);
      const stepSec = (60 / this.bpm) / 4;
      const swingOffset = (this.step % 2 === 0) ? stepSec * this.swing : 0;
      this._nextStepTime += stepSec + swingOffset;
    }
  }

  _scheduleStep(time) {
    if (!this.alive) return;

    const s = this.pattern[this.step % this.pattern.length];
    const vol = this.transitioning ? this.velocity * 0.4 : this.velocity;

    if (s.kick) this._kick(time, vol);
    if (s.snare) this._snare(time, vol * 0.85);
    if (s.hat) this._hat(time, vol * 0.55);
    if (s.openHat) this._openHat(time, vol * 0.4);
    if (s.perc) this._perc(time, vol * 0.65);
    if (s.ghost) this._hat(time, vol * 0.2);

    this.step++;
    this.stepsInSection++;
    this.songSteps++;

    if (this.stepsInSection >= this.sectionLength && !this.transitioning) {
      this._advanceSection();
    }
  }

  /* ═══ DRUM SYNTHESIS (909-style, punchy and warm) ═══ */

  _kick(time, vol) {
    const ctx = this.ctx;
    const t = time;

    // Main body: sine pitch sweep 150→30Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.setTargetAtTime(30, t + 0.001, 0.025);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t + 0.05, 0.12);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.5);

    // Click: short noise burst for attack
    const click = this._makeNoiseBurst(0.01);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.4, t);
    cg.gain.setTargetAtTime(0, t + 0.005, 0.005);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4000;
    click.connect(lp); lp.connect(cg); cg.connect(this.masterGain);
    click.start(t);
    // Cleanup
    setTimeout(() => { try { g.disconnect(); } catch(e){} try { cg.disconnect(); } catch(e){} try { lp.disconnect(); } catch(e){} }, 800);
  }

  _snare(time, vol) {
    const ctx = this.ctx;
    const t = time;

    // Body: triangle wave
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.5, t);
    og.gain.setTargetAtTime(0, t + 0.02, 0.04);
    osc.connect(og); og.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.2);

    // Noise: filtered white noise
    const noise = this._makeNoiseBurst(0.18);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.setTargetAtTime(0, t + 0.04, 0.07);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2000;
    noise.connect(hp); hp.connect(ng); ng.connect(this.masterGain);
    this._sendToReverb(ng);
    noise.start(t);
    // Cleanup
    setTimeout(() => { try { og.disconnect(); } catch(e){} try { ng.disconnect(); } catch(e){} try { hp.disconnect(); } catch(e){} }, 500);
  }

  _hat(time, vol) {
    const ctx = this.ctx;
    const t = time;

    // Noise burst, highpassed
    const noise = this._makeNoiseBurst(0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.3, t);
    g.gain.setTargetAtTime(0, t + 0.01, 0.015 + Math.random() * 0.01);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000 + Math.random() * 2000;
    noise.connect(hp); hp.connect(g); g.connect(this.masterGain);
    this._sendToDelay(g);
    noise.start(t);
    // Cleanup
    setTimeout(() => { try { g.disconnect(); } catch(e){} try { hp.disconnect(); } catch(e){} }, 300);
  }

  _openHat(time, vol) {
    const ctx = this.ctx;
    const t = time;

    const noise = this._makeNoiseBurst(0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.25, t);
    g.gain.setTargetAtTime(0, t + 0.05, 0.08);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6000;
    noise.connect(hp); hp.connect(g); g.connect(this.masterGain);
    this._sendToReverb(g);
    this._sendToDelay(g);
    noise.start(t);
    // Cleanup
    setTimeout(() => { try { g.disconnect(); } catch(e){} try { hp.disconnect(); } catch(e){} }, 500);
  }

  _perc(time, vol) {
    const ctx = this.ctx;
    const t = time;

    // Clap: 3 noise micro-bursts (flam)
    for (let n = 0; n < 3; n++) {
      const off = n * 0.007;
      const noise = this._makeNoiseBurst(0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * (0.25 - n * 0.05), t + off);
      g.gain.setTargetAtTime(0, t + off + 0.02, 0.04);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.5;
      noise.connect(bp); bp.connect(g); g.connect(this.masterGain);
      this._sendToReverb(g);
      noise.start(t + off);
      // Cleanup
      setTimeout(() => { try { g.disconnect(); } catch(e){} try { bp.disconnect(); } catch(e){} }, 400);
    }
  }

  _makeNoiseBurst(seconds) {
    if (!this._noiseBuffer || this._noiseBuffer.duration < seconds) {
      const len = this.ctx.sampleRate * Math.max(seconds, 0.3);
      this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    return src;
  }
}
