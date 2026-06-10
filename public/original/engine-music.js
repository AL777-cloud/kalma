/* Kálma — Generative Music Engine
   Wraps the same AdaptiveEngine used by Kálma Player.
   Exposes setMood(intent) and applyPromptMood(text) for the original app.js interface.
   The actual sound generation is identical to port 12002. */

// Intent → semantic text for the Music Brain
const INTENT_SEMANTICS = {
  unwind: 'nostalgic reflective melancholy introspection soul mirror thought calm relaxed peaceful gentle evening unwind letting go',
  uplift: 'nostalgic reflective introspection soul thought hopeful bright energy uplift joyful warm light rising',
  sleep: 'nostalgic reflective melancholy introspection soul mirror thought sleepy tired rest dream night darkness quiet lullaby drifting',
  reading: 'nostalgic reflective introspection soul thought focused calm reading quiet gentle concentration steady',
  'reading-lofi': 'nostalgic reflective introspection reading lofi beats calm focused',
  meditate: 'nostalgic reflective melancholy introspection soul mirror thought meditation mindful breath temple sacred still zen',
  introspection: 'nostalgic reflective melancholy introspection soul mirror thought',
  reset: 'nostalgic reflective introspection soul mirror thought calm clarity fresh start new beginning renewal',
  clarity: 'nostalgic reflective introspection soul thought focused sharp clear bright energy attention',
  gratitude: 'nostalgic reflective introspection soul mirror thought grateful thankful warm love peaceful gentle golden',
  creative: 'nostalgic reflective introspection soul mirror thought creative inspired colorful painting dream wonder imagination',
  pain: 'nostalgic reflective introspection soul mirror thought calm gentle soothing warm safe comfort healing ease',
  work: 'nostalgic reflective introspection soul thought focused productive concentration steady clear'
};

// Default layers per intent — scientifically matched
// Meditation layers auto-enabled when entering the player
const INTENT_DEFAULT_LAYERS = {
  sleep: {
    meditation: ['binaural'],       // Delta binaural beats — proven to promote deep sleep (Jirakittayakorn & Wongsawat, 2017)
    ambience: [],
    frequency: 'delta'              // 0.5-4 Hz — deep sleep brainwave range
  },
  meditate: {
    meditation: ['singing-bowls'],   // Tibetan bowls — reduce anxiety, promote theta state (Goldsby et al., 2017)
    ambience: [],
    frequency: 'theta'
  },
  unwind: {
    meditation: [],
    ambience: ['ocean'],             // Ocean waves — proven stress reduction via alpha wave induction
    frequency: 'alpha'
  },
  uplift: {
    meditation: ['wind-chimes'],     // Bright, uplifting tonal texture
    ambience: [],
    frequency: 'alpha'
  },
  reading: {
    meditation: ['isochronic'],      // Isochronic alpha — sustained focus without headphones
    ambience: [],
    frequency: 'alpha'
  },
  work: {
    meditation: ['isochronic'],      // Isochronic beta — concentration and productivity
    ambience: [],
    frequency: 'beta'
  },
  creative: {
    meditation: ['binaural'],        // Theta binaural — associated with creative insight (Reedijk et al., 2013)
    ambience: [],
    frequency: 'theta'
  },
  pain: {
    meditation: ['binaural'],        // 40Hz gamma shown to reduce pain perception (Ecsy et al., 2018)
    ambience: [],
    frequency: 'delta'               // Low frequency for body relaxation
  },
  gratitude: {
    meditation: [],
    ambience: ['stream'],            // Gentle flowing water — warmth and presence
    frequency: 'theta'
  },
  introspection: {
    meditation: [],                  // Pure generative — no layers
    ambience: [],
    frequency: 'theta'
  },
  reset: {
    meditation: [],
    ambience: ['forest'],            // Forest bathing (shinrin-yoku) — cortisol reduction
    frequency: 'alpha'
  },
  clarity: {
    meditation: ['isochronic'],      // Beta isochronic — sharp focus
    ambience: [],
    frequency: 'beta'
  }
};

class EngineMusic {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.musicBus;

    // Use the same AdaptiveEngine from Kálma Player
    this._adaptive = new AdaptiveEngine(core);
    this._brain = new MusicBrain();
    this.running = false;
    this.mood = null;
  }

  setMood(intent) {
    this.mood = intent;
    const text = INTENT_SEMANTICS[intent] || intent;
    const musical = this._brain.interpret({ text });
    console.log('[Kálma Brain] Intent "' + intent + '" →', musical);
    this._adaptive._crossfadeTo(musical);
  }

  applyPromptMood(text) {
    // Delegate to AdaptiveEngine which handles piano mode + crossfade
    this._adaptive.applyPromptMood(text);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._adaptive.start();
  }

  stop() {
    this.running = false;
    this._adaptive.stop();
  }

  // Compatibility — original app.js checks these
  get _started() { return this._adaptive.running; }
  set _started(v) { /* no-op */ }

  startMusic() {
    this.start();
  }
}
