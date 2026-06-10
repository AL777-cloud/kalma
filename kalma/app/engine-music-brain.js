/* Kálma Player — Music Brain (LLM-Style Semantic Music System)
   Maps words, emotions, objects, environments, weather, movement
   to precise musical parameters: scales, chords, tempo, filter, reverb, density.

   This is the "intelligence" layer — it doesn't generate sound,
   it generates MUSICAL DECISIONS that the adaptive engine executes.

   Every input concept has a musical signature. Combinations blend. */

class MusicBrain {
  constructor() {
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
    return this._blend(layers);
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
        scale: [0, 2, 3, 5, 7, 8, 10], // Natural minor — warm, reflective
        baseFreq: 196, filterFreq: 600, reverbMix: 0.4, density: 3, detune: 18,
        attack: 6, release: 7,
        chords: [[0,3,7,10],[5,8,0,3],[3,7,10,2],[8,0,3,7],[0,3,7],[5,8,0]],
        weight: 1
      },
      night: {
        scale: [0, 2, 3, 7, 8], // Sparse — mysterious, deep
        baseFreq: 174, filterFreq: 400, reverbMix: 0.5, density: 2, detune: 22,
        attack: 7, release: 8,
        chords: [[0,3,7,10],[7,10,2],[3,7,10],[0,7,3],[5,8,0,3],[0,3,7]],
        weight: 1
      },
      lateNight: {
        scale: [0, 5, 7], // Open fifths — minimal, drifting
        baseFreq: 146, filterFreq: 300, reverbMix: 0.55, density: 2, detune: 25,
        attack: 8, release: 9,
        chords: [[0,7,12],[5,0,7],[0,7,14],[7,12,0],[0,5,12],[0,7]],
        weight: 1
      }
    };
    return sigs[tod] || sigs.afternoon;
  }

  /* ═══ WEATHER ═══ */
  _weatherSignature(weather) {
    const sigs = {
      clear: { filterFreq: 100, reverbMix: -0.05, density: 0, weight: 0.3 },
      cloudy: { filterFreq: -100, reverbMix: 0.05, detune: 3, weight: 0.3 },
      fog: {
        filterFreq: -200, reverbMix: 0.12, detune: 5, density: -1, attack: 2,
        weight: 0.4
      },
      rain: {
        filterFreq: -150, reverbMix: 0.1, detune: 3, density: -1,
        // Rain wants minor scales
        scale: [0, 2, 3, 5, 7, 8, 10],
        chords: [[0,3,7],[5,8,0],[3,7,10],[0,3,7]],
        weight: 0.5
      },
      snow: {
        filterFreq: -250, reverbMix: 0.15, detune: 8, density: -1, attack: 3,
        scale: [0, 2, 4, 7, 9], // Pentatonic feels like snowfall
        weight: 0.5
      },
      storm: {
        filterFreq: -50, density: 1, detune: -5, reverbMix: 0.08,
        scale: [0, 1, 3, 4, 6, 7, 9, 10], // Diminished — tension
        chords: [[0,3,6],[3,6,9],[6,9,0],[9,0,3]],
        weight: 0.6
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

  /* ═══ MOVEMENT ═══ */
  _movementSignature(movement) {
    const sigs = {
      still: { weight: 0.1 },
      walking: { filterFreq: 150, density: 1, detune: -3, weight: 0.3 },
      active: { filterFreq: 300, density: 1, detune: -5, weight: 0.35 }
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
        scale: [0, 1, 3, 4, 6, 7, 9, 10], // Diminished — eerie
        filterFreq: -200, detune: 10, reverbMix: 0.1,
        chords: [[0,3,6],[6,9,0],[3,6,9],[0,3,6]],
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
      happy:    { match: /happy|joy|excit|elat|thrill|delight|bliss|ecsta|euphori|giddy|cheerful/, filterFreq: 1200, scale: [0,2,4,5,7,9,11], density: 1, detune: -5, reverbMix: -0.1, chords: [[0,4,7,11],[5,9,0,4],[7,11,2,5],[0,4,7,11]] },
      grateful: { match: /grateful|thankful|appreciat|blessed|bless|gratitude/, filterFreq: 900, scale: [0,2,4,7,9], reverbMix: 0.05, chords: [[0,4,7],[5,9,0],[0,4,7,11],[7,11,2]] },
      love:     { match: /love|loving|adore|cherish|devot|intimat|romance|romantic|tender|affection/, filterFreq: 800, reverbMix: 0.05, scale: [0,4,7,11], chords: [[0,4,7,11],[3,7,10,2],[5,9,0,4],[0,4,7,11]] },
      hopeful:  { match: /hope|hopeful|optimis|aspir|dream|inspir|promis|faith|believ/, filterFreq: 1100, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[4,7,11],[7,11,2],[11,2,5]] },

      // Calm family
      calm:     { match: /calm|peace|serene|tranquil|gentle|quiet|still|ease|comfort|sooth|mellow/, filterFreq: 600, reverbMix: 0.1, scale: [0,2,4,7,9], density: -1, chords: [[0,7],[5,0],[7,2],[0,7]] },
      relaxed:  { match: /relax|chill|laid.?back|cozy|warm|safe|secure|content|satisf/, filterFreq: 700, reverbMix: 0.08, scale: [0,2,4,7,9] },
      mindful:  { match: /mindful|present|aware|meditat|breath|center|ground|zen|flow/, filterFreq: 500, reverbMix: 0.12, density: -1, scale: [0,5,7], chords: [[0,7],[0,5],[7,0],[5,0]] },

      // Sadness family
      sad:      { match: /sad|sorrow|griev|grief|mourn|depress|melanchol|gloomy|gloom|blue/, filterFreq: -200, reverbMix: 0.15, scale: [0,2,3,5,7,8,10], density: -1, chords: [[0,3,7],[5,8,0],[3,7,10],[8,0,3]] },
      lonely:   { match: /lonely|alone|isolat|abandon|empty|hollow|miss|missing|lost/, filterFreq: -150, reverbMix: 0.12, density: -1, scale: [0,3,7], chords: [[0,3,7],[0,7],[3,7],[0,3,7]] },
      nostalgic:{ match: /nostalgic|nostalgia|remember|memory|past|yesterday|bittersweet|longing|yearning/, filterFreq: -100, reverbMix: 0.1, scale: [0,2,3,5,7,9,10], chords: [[0,3,7],[2,5,9],[5,8,0],[0,3,7]] },

      // Anxiety family
      anxious:  { match: /anxi|stress|worry|panic|overwhelm|nervous|tense|tension|restless|dread/, filterFreq: -150, reverbMix: 0.12, density: -1, detune: 5, scale: [0,2,3,5,7,8,10], chords: [[0,5,7],[2,5,9],[0,5,7],[7,0,5]] },
      afraid:   { match: /afraid|fear|scare|frighten|terror|horror|creep|eerie|dark(?!ness)/, filterFreq: -200, detune: 8, scale: [0,1,3,4,6,7,9,10], chords: [[0,3,6],[6,9,0],[3,6,9],[0,3,6]] },

      // Energy family
      energetic:{ match: /energy|power|strong|motiv|pump|vigor|dynamic|driven|fire|burn|intens|passion|bold|brave/, filterFreq: 400, density: 1, detune: -5, scale: [0,2,4,5,7,9,11], chords: [[0,4,7],[7,11,2],[5,9,0],[2,5,9]] },
      focused:  { match: /focus|concentr|study|think|clarity|sharp|attention|productiv|work|flow/, filterFreq: 200, reverbMix: -0.1, density: -1, scale: [0,2,4,7,9], chords: [[0,4,7],[0,4,7],[5,9,0],[5,9,0]] },

      // Sleep family
      sleepy:   { match: /sleep|tired|exhaust|rest|drowsy|fatigue|weary|drained|insomni|dream|nap/, filterFreq: -300, reverbMix: 0.15, density: -1, detune: 8, scale: [0,5,7], chords: [[0,7],[0,5],[0,7],[0,5]] },

      // Anger family
      angry:    { match: /angry|anger|frustrat|rage|furious|mad|irritat|annoy|resent|bitter/, filterFreq: -100, detune: -3, scale: [0,2,3,5,6,8,9,11], chords: [[0,3,6],[5,8,11],[7,10,1],[0,3,6]] }
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
  _blend(layers) {
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

    this.currentState = result;
    return result;
  }

  _pickVAPreset(state) {
    if (state.reverbMix > 0.45) return 'Ambient Drone';
    if (state.filterFreq > 900) return 'Warm Pad';
    if (state.density <= 2) return 'Ambient Drone';
    return 'Ethereal Strings';
  }

  _pickFMPreset(state) {
    if (state.reverbMix > 0.45) return 'Metallic Drone';
    if (state.filterFreq > 1000) return 'Harmonic Shimmer';
    return 'Evolving Texture';
  }

  _pickWTPreset(state) {
    if (state.reverbMix > 0.45) return 'Dark Atmosphere';
    if (state.filterFreq > 900) return 'Glass Cathedral';
    if (state.density <= 2) return 'Dark Atmosphere';
    return 'Cinematic Pad';
  }
}
