/* Kálma Player — Music Brain (LLM-Style Semantic Music System)
   Maps words, emotions, objects, environments, weather, movement
   to precise musical parameters: scales, chords, tempo, filter, reverb, density.

   This is the "intelligence" layer — it doesn't generate sound,
   it generates MUSICAL DECISIONS that the adaptive engine executes.

   Every input concept has a musical signature. Combinations blend. */

class MusicBrain {
  constructor() {
    // AI mode: tries LLM first, falls back to rules
    this._aiEnabled = true;
    this._aiPending = false;
    this._learning = null; // set from outside via setLearning()

    // Musical building blocks
    this.currentState = {
      scale: [0, 2, 4, 7, 9],
      chords: [[0, 4, 7]],
      baseFreq: 220,
      filterFreq: 800,
      filterQ: 1,
      reverbMix: 0.35,
      density: 3,
      detune: 15,
      attack: 5,
      release: 6
    };
  }

  setLearning(learningEngine) {
    this._learning = learningEngine;
  }

  /* ═══ AI INTERPRET: Async LLM-powered mood interpretation ═══ */
  async interpretWithAI(text) {
    if (!this._aiEnabled || this._aiPending) return null;
    this._aiPending = true;
    try {
      const prefs = this._learning ? this._learning.getPreferenceSummary() : [];
      const res = await fetch('api/interpret-mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, preferences: prefs })
      });
      const data = await res.json();
      if (data.source === 'llm' && data.params) {
        console.log('[Kálma Brain AI] LLM interpretation:', data.params);
        let result = data.params;
        // Apply learned bias on top of LLM output
        if (this._learning) {
          result = this._learning.applyBias(result);
        }
        this.currentState = result;
        return result;
      }
      return null; // fallback to rules
    } catch (err) {
      console.warn('[Kálma Brain AI] LLM failed, using rules:', err.message);
      return null;
    } finally {
      this._aiPending = false;
    }
  }

  /* ═══ CORE: Interpret any input and return musical parameters ═══ */
  interpret(inputs) {
    // inputs = { text, timeOfDay, weather, season, movement, holiday, temp, ... }
    // Returns a musical state object

    const layers = [];

    // Time of day (foundation)
    if (inputs.timeOfDay) layers.push(this._timeSignature(inputs.timeOfDay));

    // Weather
    if (inputs.weather) layers.push(this._weatherSignature(inputs.weather));

    // Season
    if (inputs.season) layers.push(this._seasonSignature(inputs.season));

    // Movement
    if (inputs.movement) layers.push(this._movementSignature(inputs.movement));

    // Temperature
    if (inputs.temp !== undefined) layers.push(this._temperatureSignature(inputs.temp));

    // Holiday
    if (inputs.holiday) layers.push(this._holidaySignature(inputs.holiday));

    // Free text (richest source — emotions, objects, scenes)
    if (inputs.text) layers.push(this._textSignature(inputs.text));

    // Blend all layers
    return this._blend(layers, inputs);
  }

  /* ═══ TIME OF DAY ═══ */
  _timeSignature(tod) {
    const sigs = {
      morning: {
        scale: [0, 2, 4, 5, 7, 9, 11], // Major — bright, open
        baseFreq: 261, filterFreq: 1100, reverbMix: 0.25, density: 3, detune: 10,
        attack: 4, release: 5,
        chords: [[0,4,7,11],[5,9,0,4],[9,0,4,7],[7,11,2,5],[0,4,7,11],[2,5,9,0]],
        weight: 1
      },
      lateMorning: {
        scale: [0, 2, 4, 5, 7, 9, 11],
        baseFreq: 246, filterFreq: 1000, reverbMix: 0.3, density: 3, detune: 12,
        attack: 5, release: 5,
        chords: [[0,4,7],[2,5,9,0],[4,7,11],[5,9,0],[7,11,2],[0,4,7,11]],
        weight: 1
      },
      afternoon: {
        scale: [0, 2, 4, 7, 9], // Pentatonic — neutral, warm
        baseFreq: 220, filterFreq: 800, reverbMix: 0.35, density: 3, detune: 15,
        attack: 5, release: 6,
        chords: [[0,4,7,11],[5,9,0,4],[9,0,4],[7,11,2,5]],
        weight: 1
      },
      evening: {
        scale: [0, 2, 3, 5, 7, 9, 10], // Dorian — warmer than natural minor (raised 6th)
        baseFreq: 196, filterFreq: 650, reverbMix: 0.38, density: 3, detune: 14,
        attack: 6, release: 7,
        chords: [[0,3,7],[5,9,0],[7,0,3],[2,5,9],[0,3,7],[5,0,9]],
        weight: 1
      },
      night: {
        scale: [0, 2, 3, 5, 7, 9, 10], // Dorian — warm minor, musical, not harsh
        baseFreq: 196, filterFreq: 650, reverbMix: 0.38, density: 3, detune: 12,
        attack: 6, release: 7,
        chords: [[0,3,7],[5,9,0],[7,0,3],[2,5,9],[0,7,3],[5,0,9]],
        weight: 1
      },
      lateNight: {
        scale: [0, 2, 3, 5, 7, 8, 10], // Natural minor (Aeolian) — Debussy-friendly
        baseFreq: 174, filterFreq: 500, reverbMix: 0.45, density: 2, detune: 14,
        attack: 7, release: 8,
        // Impressionistic progressions: maj7, sus4, parallel motion, color chords
        chords: [[0,4,7,11],[5,7,0,2],[3,7,10,2],[8,0,3,7],[0,5,7,11],[3,7,0,5]],
        weight: 1
      }
    };
    return sigs[tod] || sigs.afternoon;
  }

  /* ═══ WEATHER ═══
     Weather should noticeably change the character of the music.
     Higher weight = more influence. Users should hear the difference. */
  _weatherSignature(weather) {
    const sigs = {
      clear: { filterFreq: 200, reverbMix: -0.08, density: 0, detune: -4, weight: 0.55 },
      cloudy: { filterFreq: -200, reverbMix: 0.1, detune: 6, density: -1, weight: 0.55 },
      fog: {
        filterFreq: -300, reverbMix: 0.18, detune: 8, density: -2, attack: 3,
        weight: 0.55
      },
      rain: {
        filterFreq: -200, reverbMix: 0.15, detune: 5, density: -1,
        scale: [0, 2, 3, 5, 7, 8, 10],
        chords: [[0,3,7],[5,8,0],[3,7,10],[0,3,7]],
        weight: 0.6
      },
      snow: {
        filterFreq: -300, reverbMix: 0.2, detune: 10, density: -2, attack: 4,
        scale: [0, 2, 4, 7, 9],
        weight: 0.6
      },
      storm: {
        filterFreq: -80, density: 1, detune: -6, reverbMix: 0.1,
        scale: [0, 2, 3, 5, 7, 8, 10],
        chords: [[0,3,7],[5,8,0,3],[3,7,10],[0,3,7,10]],
        weight: 0.65
      }
    };
    return sigs[weather] || sigs.clear;
  }

  /* ═══ SEASON ═══ */
  _seasonSignature(season) {
    const sigs = {
      spring: {
        filterFreq: 100, detune: -3, reverbMix: -0.03,
        scale: [0, 2, 4, 5, 7, 9, 11], // Major — growth, renewal
        weight: 0.3
      },
      summer: {
        filterFreq: 200, detune: -2, reverbMix: -0.05,
        scale: [0, 2, 4, 7, 9], // Pentatonic — open, warm
        weight: 0.3
      },
      autumn: {
        filterFreq: -80, reverbMix: 0.05, detune: 4,
        scale: [0, 2, 3, 5, 7, 9, 10], // Dorian — bittersweet
        chords: [[0,3,7],[2,5,9],[5,8,0],[0,3,7]],
        weight: 0.35
      },
      winter: {
        filterFreq: -150, reverbMix: 0.08, detune: 6, attack: 2,
        scale: [0, 2, 3, 5, 7, 8, 10], // Natural minor — cold, still
        weight: 0.35
      }
    };
    return sigs[season] || {};
  }

  /* ═══ MOVEMENT ═══
     Movement has the STRONGEST influence on musical parameters.
     The difference between still and active should be immediately obvious. */
  _movementSignature(movement) {
    const sigs = {
      still: {
        filterFreq: -350, reverbMix: 0.2, density: -2, detune: 6,
        attack: 4, release: 3, weight: 0.75  // HIGH weight — movement dominates
      },
      neutral: {
        filterFreq: -150, reverbMix: 0.1, density: -1, detune: 3,
        attack: 1, weight: 0.6
      },
      walking: {
        filterFreq: 200, density: 1, detune: -4, attack: -2, weight: 0.7
      },
      active: {
        filterFreq: 450, density: 2, detune: -6, attack: -3, release: -2, weight: 0.75
      }
    };
    return sigs[movement] || {};
  }

  /* ═══ TEMPERATURE ═══ */
  _temperatureSignature(temp) {
    // Cold (< 10°C) → darker, more reverb. Hot (> 30°C) → brighter, less reverb.
    if (temp < 5) return { filterFreq: -200, reverbMix: 0.1, detune: 5, weight: 0.3 };
    if (temp < 15) return { filterFreq: -100, reverbMix: 0.05, weight: 0.2 };
    if (temp > 30) return { filterFreq: 200, reverbMix: -0.05, weight: 0.2 };
    if (temp > 35) return { filterFreq: 300, reverbMix: -0.08, weight: 0.25 };
    return { weight: 0.1 };
  }

  /* ═══ HOLIDAY ═══ */
  _holidaySignature(holiday) {
    const sigs = {
      christmas: {
        scale: [0, 2, 4, 5, 7, 9, 11], baseFreq: 261, reverbMix: 0.1,
        chords: [[0,4,7],[5,9,0],[0,4,7],[7,11,2]], // Classic Christmas harmony
        weight: 0.5
      },
      halloween: {
        scale: [0, 1, 3, 5, 7, 8, 10], // Harmonic minor — eerie but musical
        filterFreq: -200, detune: 10, reverbMix: 0.1,
        chords: [[0,3,7],[5,8,0,3],[3,7,10],[0,3,7,10]],
        weight: 0.5
      },
      valentines: {
        scale: [0, 4, 7, 11], // Major 7th — romantic
        reverbMix: 0.05, filterFreq: 100,
        chords: [[0,4,7,11],[5,9,0,4],[9,0,4,7],[0,4,7,11]],
        weight: 0.4
      },
      newYear: {
        scale: [0, 2, 4, 5, 7, 9, 11], filterFreq: 200, density: 1,
        chords: [[0,4,7],[5,9,0],[7,11,2],[0,4,7,11]],
        weight: 0.4
      }
    };
    return sigs[holiday] || {};
  }

  /* ═══ FREE TEXT — the richest mapping ═══ */
  _textSignature(text) {
    const t = text.toLowerCase();
    const result = { weight: 0.7 }; // Text has high influence

    // ── EMOTIONS ──
    const emotions = {
      // Joy family
      happy:    { match: /happy|joy|excit|elat|thrill|delight|bliss|ecsta|euphori|giddy|cheerful/, filterFreq: 1400, scale: [0,2,4,5,7,9,11], density: 1, detune: -8, attack: -2, reverbMix: -0.15, baseFreq: 261, chords: [[0,4,7,11],[5,9,0,4],[7,11,2,5],[2,5,9,0],[0,4,7,11],[4,7,11,2]] },
      grateful: { match: /grateful|thankful|appreciat|blessed|bless|gratitude/, filterFreq: 900, scale: [0,2,4,7,9], reverbMix: 0.05, chords: [[0,4,7],[5,9,0],[0,4,7,11],[7,11,2]] },
      love:     { match: /love|loving|adore|cherish|devot|intimat|romance|romantic|tender|affection/, filterFreq: 800, reverbMix: 0.05, scale: [0,4,7,11], chords: [[0,4,7,11],[3,7,10,2],[5,9,0,4],[0,4,7,11]] },
      hopeful:  { match: /hope|hopeful|optimis|aspir|dream|inspir|promis|faith|believ/, filterFreq: 1100, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[4,7,11],[7,11,2],[11,2,5]] },

      // Calm family
      calm:     { match: /calm|peace|serene|tranquil|gentle|quiet|still|ease|comfort|sooth|mellow/, filterFreq: 500, reverbMix: 0.18, scale: [0,2,4,7,9], density: -2, detune: -5, attack: 3, baseFreq: 196, chords: [[0,7],[0,5,7],[5,0],[7,0,5],[0,7],[5,9,0]] },
      relaxed:  { match: /relax|chill|laid.?back|cozy|warm|safe|secure|content|satisf/, filterFreq: 700, reverbMix: 0.08, scale: [0,2,4,7,9] },
      dreamy:   { match: /dream|dreamy|float|ethereal|moonlight|moonlit|impressionist|debussy|clair|lune|twilight|shimmer|luminous|iridescent|gossamer/, filterFreq: 450, reverbMix: 0.38, density: -2, detune: -3, attack: 5, release: 7, baseFreq: 139, scale: [0,2,4,5,7,9,11], chords: [[0,4,7,11],[5,9,0,2],[7,11,2,5],[3,7,10,0],[0,4,7,11],[5,0,4,9]] },
      mindful:  { match: /mindful|present|aware|meditat|breath|center|ground|zen|flow/, filterFreq: 400, reverbMix: 0.25, density: -2, detune: -4, attack: 4, baseFreq: 174, scale: [0,5,7,12], chords: [[0,7],[0,5],[7,12],[5,7],[0,7],[0,5,12]] },

      // Sadness family — rich minor harmony, dark, spacious, slow
      sad:      { match: /sad|sorrow|griev|grief|mourn|depress|melanchol|gloomy|gloom|blue|cry|crying|tears|weep|sob|hurt|pain(?!t)|ache|heartbr|broken.?heart|devastat|despair|hopeless|miserable|wretched|suffer|agony|torment|anguish|regret|remorse|guilt|shame|disappoint|let.?down|betray|unfair|tragic|loss|funeral|goodbye|farewell/, filterFreq: -250, reverbMix: 0.18, scale: [0,2,3,5,7,8,10], density: -1, detune: 6, attack: 2, release: 2, baseFreq: -30, chords: [[0,3,7,10],[5,8,0,3],[3,7,10,2],[8,0,3,7],[0,3,7],[5,8,0,3]] },
      lonely:   { match: /lonely|alone|isolat|abandon|empty|hollow|miss|missing|lost|forgotten|invisible|unwant|reject|exclud|outcast|nobody|no.?one|solitude|deserted|forsaken/, filterFreq: -200, reverbMix: 0.15, density: -1, detune: 7, attack: 2, release: 3, baseFreq: -20, scale: [0,2,3,7,8], chords: [[0,3,7],[0,3,7,10],[5,8,0],[0,7,3],[3,8,0],[0,3,7]] },
      nostalgic:{ match: /nostalgic|nostalgia|remember|memory|memories|past|yesterday|bittersweet|longing|yearning|wistful|sentimental|old.?times|used.?to|once|ago|childhood|youth|those.?days|back.?then|looking.?back/, filterFreq: -120, reverbMix: 0.12, detune: 4, attack: 1, baseFreq: -10, scale: [0,2,3,5,7,9,10], chords: [[0,3,7,10],[2,5,9,0],[5,9,0,3],[0,3,7],[7,10,2],[0,3,7,10]] },
      heartbreak:{ match: /heartbreak|breakup|break.?up|divorce|separat|apart|over|ended|left.?me|gone|moved.?on|ex|former|unrequit|one.?sided|couldn.?t|never.?again/, filterFreq: -230, reverbMix: 0.17, density: -1, detune: 8, attack: 3, release: 3, baseFreq: -25, scale: [0,1,3,5,7,8,10], chords: [[0,3,7,10],[5,8,0,3],[3,7,10,2],[8,0,3,7],[5,8,0,3],[0,3,7,10]] },
      despair:  { match: /despair|hopeless|helpless|worthless|pointless|meaningless|nothing.?matters|give.?up|can.?t.?go.?on|end.?it|dark.?place|rock.?bottom|void|numb|dead.?inside|broken/, filterFreq: -300, reverbMix: 0.2, density: -2, detune: 10, attack: 3, release: 4, baseFreq: -40, scale: [0,1,3,5,6,8,10], chords: [[0,3,7,10],[5,8,0,3],[3,7,10,2],[8,0,3,7],[0,3,7,10],[5,8,0,3]] },

      // Anxiety family
      anxious:  { match: /anxi|stress|worry|panic|overwhelm|nervous|tense|tension|restless|dread/, filterFreq: -150, reverbMix: 0.12, density: -1, detune: 5, scale: [0,2,3,5,7,8,10], chords: [[0,5,7],[2,5,9],[0,5,7],[7,0,5]] },
      afraid:   { match: /afraid|fear|scare|frighten|terror|horror|creep|eerie|dark(?!ness)/, filterFreq: -200, detune: 8, scale: [0,1,3,5,7,8,10], chords: [[0,3,7],[5,8,0,3],[3,7,10],[0,3,7,10]] },

      // Energy family
      energetic:{ match: /energy|power|strong|motiv|pump|vigor|dynamic|driven|fire|burn|intens|passion|bold|brave/, filterFreq: 400, density: 1, detune: -5, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[7,11,2],[5,9,0],[2,5,9]] },
      focused:  { match: /focus|concentr|study|think|clarity|sharp|attention|productiv|work|flow/, filterFreq: 200, reverbMix: -0.1, density: -1, scale: [0,2,4,7,9], chords: [[0,4,7],[0,4,7],[5,9,0],[5,9,0]] },

      // Sleep family
      sleepy:   { match: /sleep|tired|exhaust|rest|drowsy|fatigue|weary|drained|insomni|dream|nap/, filterFreq: 350, reverbMix: 0.3, density: -2, detune: -6, attack: 5, baseFreq: 146, scale: [0,5,7], chords: [[0,7],[0,5],[0,7],[5,0],[0,7],[0,5]] },

      // Anger family
      angry:    { match: /angry|anger|frustrat|rage|furious|mad|irritat|annoy|resent|bitter/, filterFreq: -100, detune: -3, scale: [0,2,3,5,7,8,10], chords: [[0,3,7],[5,8,0,3],[7,10,2,5],[0,3,7,10]] }
    };

    // ── OBJECTS & SCENES ──
    const scenes = {
      ocean:    { match: /ocean|sea|wave|shore|coast|beach|tide|surf/, filterFreq: -100, reverbMix: 0.1, scale: [0,2,4,7,9], detune: 5, chords: [[0,7],[5,0],[7,2],[0,7]] },
      forest:   { match: /forest|tree|wood|leaf|leaves|green|moss|fern|grove/, filterFreq: -50, reverbMix: 0.08, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[5,9,0],[9,0,4],[0,4,7]] },
      mountain: { match: /mountain|peak|summit|cliff|rock|stone|hill|valley|canyon/, filterFreq: -150, reverbMix: 0.12, scale: [0,5,7], baseFreq: -20, chords: [[0,7],[0,5],[7,0],[0,7]] },
      rain:     { match: /rain|drizzle|shower|droplet|puddle|umbrella|storm|thunder/, filterFreq: -200, reverbMix: 0.15, detune: 4, scale: [0,2,3,5,7,8,10], chords: [[0,3,7],[5,8,0],[3,7,10],[0,3,7]] },
      snow:     { match: /snow|ice|frost|winter|cold|freeze|crystal|glacier/, filterFreq: -250, reverbMix: 0.15, detune: 8, density: -1, scale: [0,2,4,7,9] },
      fire:     { match: /fire|flame|ember|candle|hearth|fireplace|blaze|glow|warmth/, filterFreq: 100, reverbMix: 0.05, scale: [0,2,4,7,9], chords: [[0,4,7],[5,9,0],[0,4,7],[7,11,2]] },
      night:    { match: /night|moon|star|dark|midnight|twilight|dusk|shadow/, filterFreq: -200, reverbMix: 0.12, density: -1, scale: [0,2,3,7,8], chords: [[0,3,7,10],[7,10,2],[3,7,10],[0,7,3]] },
      sky:      { match: /sky|cloud|sunrise|sunset|dawn|horizon|heaven|cosmic|space|universe/, filterFreq: 200, reverbMix: 0.1, scale: [0,2,4,7,9,11], chords: [[0,4,7,11],[5,9,0,4],[0,4,7,11],[9,0,4,7]] },
      garden:   { match: /garden|flower|bloom|blossom|petal|rose|lily|jasmine|lavender/, filterFreq: 100, reverbMix: 0.05, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[5,9,0],[9,0,4],[0,4,7]] },
      water:    { match: /water|river|stream|lake|pond|waterfall|fountain|creek|brook/, filterFreq: -50, reverbMix: 0.1, detune: 3, scale: [0,2,4,7,9], chords: [[0,7],[5,0],[7,2],[0,7]] },
      city:     { match: /city|urban|street|traffic|building|downtown|neon|crowd/, filterFreq: 300, density: 1, detune: -3, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[2,5,9],[4,7,11],[0,4,7]] },
      home:     { match: /home|room|bed|pillow|blanket|couch|window|door/, filterFreq: -50, reverbMix: 0.05, scale: [0,2,4,7,9], chords: [[0,4,7],[5,9,0],[0,4,7],[7,11,2]] },
      temple:   { match: /temple|church|sacred|spirit|soul|divine|holy|pray|ritual/, filterFreq: -100, reverbMix: 0.15, density: -1, scale: [0,5,7], chords: [[0,7],[0,5],[7,0],[5,0]] }
    };

    // ── COLORS (synesthesia) ──
    const colors = {
      red:    { match: /\bred\b|scarlet|crimson|ruby/, filterFreq: 200, detune: -3, scale: [0,2,4,5,7,9,11] },
      blue:   { match: /\bblue\b|azure|cobalt|indigo|navy/, filterFreq: -100, reverbMix: 0.08, scale: [0,2,3,5,7,8,10] },
      green:  { match: /\bgreen\b|emerald|jade|olive|sage/, filterFreq: 0, scale: [0,2,4,5,7,9,11] },
      purple: { match: /purple|violet|lavender|mauve|plum/, filterFreq: -50, reverbMix: 0.1, scale: [0,2,3,5,7,9,10] },
      gold:   { match: /gold|golden|amber|honey|brass/, filterFreq: 150, scale: [0,2,4,7,9] },
      white:  { match: /\bwhite\b|silver|pearl|ivory|pale/, filterFreq: 200, reverbMix: 0.05, scale: [0,2,4,7,9] },
      black:  { match: /\bblack\b|obsidian|onyx|void|abyss/, filterFreq: -250, reverbMix: 0.15, density: -1, scale: [0,3,7] }
    };

    // ── ACTIVITIES ──
    const activities = {
      walking:  { match: /walk|stroll|wander|roam|hike|trek/, filterFreq: 100, density: 1 },
      running:  { match: /run|jog|sprint|race|dash/, filterFreq: 300, density: 1, detune: -5 },
      reading:  { match: /read|book|story|page|chapter|novel/, filterFreq: -50, reverbMix: 0.05, density: -1 },
      cooking:  { match: /cook|kitchen|bake|meal|food|recipe/, filterFreq: 100, scale: [0,2,4,5,7,9,11] },
      working:  { match: /work|office|desk|meeting|project|task|deadline/, filterFreq: 200, reverbMix: -0.1, density: -1 },
      yoga:     { match: /yoga|stretch|pose|asana|namaste/, filterFreq: -100, reverbMix: 0.1, density: -1, scale: [0,5,7] },
      painting: { match: /paint|draw|sketch|art|canvas|create|sculpt/, filterFreq: 0, reverbMix: 0.08, scale: [0,2,4,7,9,11] },
      dancing:  { match: /danc|move|groove|rhythm|sway/, filterFreq: 300, density: 1 }
    };

    // Score and apply all matching categories
    const allMaps = [emotions, scenes, colors, activities];
    let matchCount = 0;

    for (const map of allMaps) {
      for (const [name, sig] of Object.entries(map)) {
        if (sig.match && sig.match.test(t)) {
          matchCount++;
          for (const [k, v] of Object.entries(sig)) {
            if (k === 'match' || k === 'weight') continue;
            if (k === 'scale' || k === 'chords') {
              result[k] = v; // Last matching scale/chord wins
            } else if (typeof v === 'number') {
              result[k] = (result[k] || 0) + v;
            }
          }
        }
      }
    }

    // Normalize additive values if many matches
    if (matchCount > 2) {
      const norm = 2 / matchCount;
      for (const k of ['filterFreq', 'detune', 'density', 'reverbMix']) {
        if (result[k] !== undefined && k !== 'scale' && k !== 'chords') {
          result[k] *= norm;
        }
      }
    }

    return result;
  }

  /* ═══ BLEND LAYERS ═══ */
  _blend(layers, inputs) {
    if (layers.length === 0) return this.currentState;

    // Start from the highest-weight layer as base
    layers.sort((a, b) => (b.weight || 0) - (a.weight || 0));

    const result = {};
    const totalWeight = layers.reduce((sum, l) => sum + (l.weight || 0.5), 0);
    let scaleSet = false;
    let chordsSet = false;

    for (const layer of layers) {
      const w = (layer.weight || 0.5) / totalWeight;

      for (const [k, v] of Object.entries(layer)) {
        if (k === 'weight' || k === 'match') continue;

        if (k === 'scale' && !scaleSet) {
          result.scale = v; scaleSet = true;
        } else if (k === 'chords' && !chordsSet) {
          result.chords = v; chordsSet = true;
        } else if (k === 'baseFreq' && typeof v === 'number') {
          result.baseFreq = (result.baseFreq || 0) + v * w;
        } else if (typeof v === 'number') {
          result[k] = (result[k] || 0) + v * w;
        }
      }
    }

    // Ensure base freq is absolute (not additive from time signature)
    if (result.baseFreq && result.baseFreq > 50) {
      // It's an absolute freq, keep it
    } else if (result.baseFreq) {
      // It's a relative adjustment, apply to default
      result.baseFreq = 220 + (result.baseFreq || 0);
    }

    // Apply defaults for missing values
    const defaults = { baseFreq: 220, scale: [0,2,4,7,9], chords: [[0,4,7]], filterFreq: 800, filterQ: 1, reverbMix: 0.35, density: 3, detune: 15, attack: 5, release: 6 };
    for (const [k, v] of Object.entries(defaults)) {
      if (result[k] === undefined) result[k] = v;
    }

    // Clamp
    result.filterFreq = Math.max(200, Math.min(2000, result.filterFreq));
    result.reverbMix = Math.max(0.1, Math.min(0.7, result.reverbMix));
    result.density = Math.max(1, Math.min(4, Math.round(result.density)));
    result.detune = Math.max(5, Math.min(35, result.detune));
    if (result.baseFreq < 100) result.baseFreq = 100;
    if (result.baseFreq > 400) result.baseFreq = 400;

    // Add instrument preset suggestions based on mood
    result.vaPreset = this._pickVAPreset(result);
    result.fmPreset = this._pickFMPreset(result);
    result.wtPreset = this._pickWTPreset(result);

    // Detect melody timbre from text
    if (inputs && inputs.text) result.melodyTimbre = this._pickTimbre(inputs.text);

    // Apply learned preference bias
    if (this._learning) {
      const biased = this._learning.applyBias(result);
      Object.assign(result, biased);
    }

    this.currentState = result;
    return result;
  }

  _pickTimbre(text) {
    const t = text.toLowerCase();
    if (/piano|ivory|grand/.test(t)) return 'piano';
    if (/keys|keyboard|rhodes|electric.?piano|ep|soft.?keys|wurlitz/.test(t)) return 'keys';
    if (/bell|chime|glocken|vibes|celest/.test(t)) return 'bells';
    if (/pluck|guitar|pizz|koto|banjo|ukulele/.test(t)) return 'pluck';
    if (/flute|wind|whistle|pan|reed|clarinet|oboe/.test(t)) return 'flute';
    if (/harp|lyre|zither|strings/.test(t)) return 'harp';
    // Sad emotions → suggest piano (iconic sad instrument)
    if (/sad|sorrow|grief|cry|tears|heartbr|lonely|depress|melanchol|despair|hopeless/.test(t)) return 'piano';
    return null; // keep current
  }

  _pickVAPreset(state) {
    // Wider threshold so night (filterFreq ~600) gets Ethereal Strings, not just drones
    if (state.filterFreq < 400 && state.reverbMix > 0.4) return 'Ambient Drone';
    if (state.reverbMix > 0.5) return 'Ambient Drone';
    if (state.filterFreq > 900) return 'Warm Pad';
    if (state.density <= 2 && state.filterFreq < 400) return 'Ambient Drone';
    return 'Ethereal Strings';
  }

  _pickFMPreset(state) {
    if (state.filterFreq < 400 && state.reverbMix > 0.4) return 'Metallic Drone';
    if (state.reverbMix > 0.5) return 'Metallic Drone';
    if (state.filterFreq > 1000) return 'Harmonic Shimmer';
    return 'Evolving Texture';
  }

  _pickWTPreset(state) {
    if (state.filterFreq < 400) return 'Dark Atmosphere';
    if (state.reverbMix > 0.5) return 'Dark Atmosphere';
    if (state.filterFreq > 900) return 'Glass Cathedral';
    if (state.density <= 2 && state.filterFreq < 400) return 'Dark Atmosphere';
    return 'Cinematic Pad';
  }

  /* ═══ VOICE LEADING ═══
     Real musicians don't jump between random chord voicings.
     Each note in a chord moves to the nearest note in the next chord.
     This creates smooth, connected harmony instead of choppy changes. */

  voiceLead(currentVoicing, nextChordTones, scale, baseFreq) {
    if (!currentVoicing || currentVoicing.length === 0) {
      // First chord: spread evenly
      return nextChordTones.slice(0, 4).map((s, i) => {
        const octave = i === 0 ? -1 : (i < 2 ? 0 : 1);
        return { semitone: s % 12, octave, freq: baseFreq * Math.pow(2, (s % 12) / 12 + octave) };
      });
    }

    // For each voice, find nearest target note
    return currentVoicing.map((voice, i) => {
      const currentSemi = voice.semitone + voice.octave * 12;
      let bestTarget = nextChordTones[i % nextChordTones.length] % 12;
      let bestDist = Infinity;

      // Check the target note in different octaves (-1, 0, +1)
      for (const targetSemi of nextChordTones) {
        for (let oct = -1; oct <= 2; oct++) {
          const target = (targetSemi % 12) + oct * 12;
          const dist = Math.abs(target - currentSemi);
          if (dist < bestDist) {
            bestDist = dist;
            bestTarget = targetSemi % 12;
            voice._nextOct = oct;
          }
        }
      }

      return {
        semitone: bestTarget,
        octave: voice._nextOct !== undefined ? voice._nextOct : voice.octave,
        freq: baseFreq * Math.pow(2, bestTarget / 12 + (voice._nextOct || voice.octave))
      };
    });
  }

  /* ═══ EXTENDED CHORD PROGRESSIONS ═══
     Go beyond basic triads. These are the progressions that
     make music sound cinematic, emotional, and sophisticated.
     Organized by emotional function. */

  static PROGRESSIONS = {
    // Dreamy / floating (common in ambient)
    dreamy: [
      [[0,4,7,11],[5,9,0,4],[9,0,4,7],[2,5,9,0]],     // Imaj7 - IVmaj7 - vi7 - ii7
      [[0,4,7,11],[7,11,2,5],[3,7,10,2],[0,4,7,11]],   // Imaj7 - Vmaj7 - iii7 - Imaj7
      [[0,4,7,11],[9,0,4,7],[5,9,0,4],[7,11,2,5]],     // Imaj7 - vi7 - IVmaj7 - V7
      [[0,7,11,4],[5,0,4,9],[7,2,5,11],[0,7,11,4]],    // Wide voicing Imaj7 - IV - V - I
    ],

    // Melancholic / bittersweet
    melancholic: [
      [[0,3,7,10],[5,8,0,3],[3,7,10,2],[8,0,3,7]],     // i7 - iv7 - III7 - VI7
      [[0,3,7,10],[10,2,5,8],[8,0,3,7],[5,8,0,3]],     // i7 - bVII7 - VI7 - iv7
      [[0,3,7],[7,10,2],[5,8,0],[0,3,7,10]],            // i - v - iv - i7
      [[0,3,7,10],[2,5,8,0],[5,8,0,3],[0,3,7]],        // i7 - ii°7 - iv7 - i
    ],

    // Tension / unresolved (but still musical)
    tense: [
      [[0,4,7,10],[5,9,0,4],[2,5,9,0],[7,11,2,5]],     // Dom7 cycle
      [[0,3,7,10],[5,8,0,3],[3,7,10,2],[0,3,7,10]],     // Minor 7th chains
      [[0,4,7,11],[5,9,0,4],[0,4,7,11],[7,11,2,5]],     // Maj7 - IV - I - V
    ],

    // Uplifting / triumphant
    uplifting: [
      [[0,4,7],[5,9,0],[7,11,2],[0,4,7,11]],           // I - IV - V - Imaj7
      [[0,4,7,11],[2,5,9,0],[4,7,11,2],[5,9,0,4]],     // I - ii - iii - IV (ascending)
      [[0,4,7],[9,0,4],[5,9,0],[7,11,2]],               // I - vi - IV - V
    ],

    // Cinematic / epic
    cinematic: [
      [[0,7,12,16],[5,12,17,21],[8,15,19,24],[3,10,15,19]], // Power voicings
      [[0,4,7,14],[5,9,12,16],[7,11,14,19],[0,4,7,11]],     // Maj9 feel
      [[0,3,7,14],[5,8,12,17],[10,14,17,22],[0,3,7,14]],    // min9 feel
    ],

    // Mysterious / ethereal
    mysterious: [
      [[0,5,7],[2,7,9],[5,7,0],[7,0,2]],               // Quartal harmony
      [[0,7,14],[5,12,19],[7,14,21],[0,7,14]],          // Open fifths, very wide
      [[0,4,11],[5,9,4],[7,11,4],[0,4,11]],             // Sus/add voicings
    ],

    // Gentle resolution (cadential)
    resolving: [
      [[7,11,2,5],[0,4,7,11]],                         // V7 → Imaj7
      [[5,9,0,4],[0,4,7,11]],                          // IV → Imaj7
      [[10,2,5,8],[0,3,7,10],[0,4,7,11]],              // bVII → i → I (Picardy)
    ]
  };

  /* Pick a progression that matches the current mood */
  suggestProgression(mood) {
    let category;
    if (mood === 'sad' || mood === 'melancholy' || mood === 'despair' || mood === 'lonely') {
      category = 'melancholic';
    } else if (mood === 'tense' || mood === 'anxious' || mood === 'afraid') {
      category = 'tense';
    } else if (mood === 'happy' || mood === 'energetic' || mood === 'hopeful') {
      category = 'uplifting';
    } else if (mood === 'calm' || mood === 'sleepy' || mood === 'mindful') {
      category = 'dreamy';
    } else if (mood === 'dark' || mood === 'night') {
      category = 'mysterious';
    } else {
      // Pick randomly weighted toward dreamy/cinematic
      const pool = ['dreamy', 'dreamy', 'cinematic', 'mysterious', 'melancholic'];
      category = pool[Math.floor(Math.random() * pool.length)];
    }

    const progs = MusicBrain.PROGRESSIONS[category] || MusicBrain.PROGRESSIONS.dreamy;
    return progs[Math.floor(Math.random() * progs.length)];
  }
}
