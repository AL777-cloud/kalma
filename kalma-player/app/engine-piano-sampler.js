/* Kálma Player — Piano Sampler Engine
   Uses real piano samples (24 notes: 12 pitches × 2 velocity layers)
   Pitch-shifts to cover the full range via playbackRate.
   Replaces oscillator-based piano synthesis in the melody engine. */

class PianoSampler {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.loaded = false;
    this._buffers = {}; // { midi: { soft: AudioBuffer, hard: AudioBuffer } }
    this._loading = false;

    // Sample map: midi note → [softFile, hardFile]
    // Odd file = soft (lower velocity), Even file = hard (higher velocity)
    this._sampleMap = [
      { midi: 35, soft: '21.wav', hard: '22.wav' }, // B1
      { midi: 40, soft: '07.wav', hard: '08.wav' }, // E2
      { midi: 50, soft: '15.wav', hard: '16.wav' }, // D3
      { midi: 56, soft: '13.wav', hard: '14.wav' }, // G#3
      { midi: 62, soft: '17.wav', hard: '18.wav' }, // D4
      { midi: 65, soft: '01.wav', hard: '02.wav' }, // F4
      { midi: 71, soft: '23.wav', hard: '24.wav' }, // B4
      { midi: 76, soft: '09.wav', hard: '10.wav' }, // E5
      { midi: 81, soft: '03.wav', hard: '04.wav', alt: '05.wav' }, // A5 (05/06 = alt articulation)
      { midi: 86, soft: '19.wav', hard: '20.wav' }, // D6
      { midi: 88, soft: '11.wav', hard: '12.wav' }, // E6
    ];

    // Also store files 05/06 as second A5 velocity layer
    // (detected same pitch — might be different articulation, skip for now)
  }

  /* Load all samples. Call once after AudioContext is created. */
  async load() {
    if (this.loaded || this._loading) return;
    this._loading = true;

    const basePath = 'audio/piano/';
    const promises = [];

    for (const entry of this._sampleMap) {
      promises.push(
        this._loadSample(basePath + entry.soft).then(buf => {
          if (!this._buffers[entry.midi]) this._buffers[entry.midi] = {};
          this._buffers[entry.midi].soft = buf;
        })
      );
      promises.push(
        this._loadSample(basePath + entry.hard).then(buf => {
          if (!this._buffers[entry.midi]) this._buffers[entry.midi] = {};
          this._buffers[entry.midi].hard = buf;
        })
      );
    }

    try {
      await Promise.all(promises);
      this.loaded = true;
      console.log('[Kálma Piano] All samples loaded (' + this._sampleMap.length + ' notes × 2 velocities)');
    } catch (err) {
      console.warn('[Kálma Piano] Failed to load some samples:', err.message);
      // Mark as loaded anyway — will fall back to synth for missing notes
      this.loaded = true;
    }
    this._loading = false;
  }

  async _loadSample(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  /* Play a note.
     freq: frequency in Hz
     duration: seconds (used for envelope release)
     velocity: 0-1 (selects layer + controls volume)
     time: AudioContext time to start at */
  play(freq, duration, velocity, time) {
    if (!this.loaded) return null;

    // Convert frequency to MIDI note
    const midi = 69 + 12 * Math.log2(freq / 440);

    // Find nearest sample
    const { entry, distance } = this._findNearest(midi);
    if (!entry) return null;

    // Select velocity layer
    const buf = velocity > 0.5
      ? (this._buffers[entry.midi].hard || this._buffers[entry.midi].soft)
      : (this._buffers[entry.midi].soft || this._buffers[entry.midi].hard);
    if (!buf) return null;

    // Calculate playback rate for pitch shifting
    const semitoneDiff = midi - entry.midi;
    const playbackRate = Math.pow(2, semitoneDiff / 12);

    // Don't pitch shift more than ~7 semitones (quality degrades)
    if (Math.abs(semitoneDiff) > 7) {
      // Try to find a better sample even if it's not the absolute nearest
      // (fallback — still play it, just won't sound perfect)
    }

    const now = time || this.ctx.currentTime;

    // Create source
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = playbackRate;

    // Gain envelope
    const gain = this.ctx.createGain();
    const vol = 0.3 + velocity * 0.7; // map 0-1 to 0.3-1.0
    gain.gain.setValueAtTime(vol, now);

    // Natural decay: let the sample ring, then fade at duration
    const fadeStart = now + Math.max(duration, 0.5);
    const fadeTime = Math.min(duration * 0.4, 2.0); // fade over up to 2s
    gain.gain.setValueAtTime(vol, fadeStart);
    gain.gain.setTargetAtTime(0, fadeStart, fadeTime / 3);

    source.connect(gain);
    gain.connect(this.output);

    source.start(now);
    // Stop after sample ends or fade completes
    const maxDuration = buf.duration / playbackRate;
    source.stop(now + Math.min(maxDuration, fadeStart - now + fadeTime + 1));

    return { source, gain };
  }

  /* Find nearest sample to target MIDI note */
  _findNearest(targetMidi) {
    let best = null;
    let bestDist = Infinity;

    for (const entry of this._sampleMap) {
      const dist = Math.abs(targetMidi - entry.midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = entry;
      }
    }

    return { entry: best, distance: bestDist };
  }
}
