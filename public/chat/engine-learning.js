/* Kálma Player — Learning Engine
   Tracks user feedback (like/dislike) with full musical state snapshots.
   Builds a preference profile that biases future Music Brain output.
   Stores everything in localStorage — no server needed for learning. */

class KalmaLearning {
  constructor() {
    this._storageKey = 'kalma-learning';
    this.profile = this._load();
  }

  _load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this._storageKey));
      if (saved && saved.version === 3) return saved;
      // Migrate from v2
      if (saved && saved.version === 2) {
        saved.version = 3;
        saved.timbreHistory = saved.timbreHistory || [];
        saved.tempoHistory = saved.tempoHistory || [];
        saved.beatsHistory = saved.beatsHistory || [];
        return saved;
      }
    } catch {}
    return {
      version: 3,
      likes: [],       // musical states the user liked
      dislikes: [],    // musical states the user disliked
      paramBias: {},   // computed bias per parameter
      totalFeedback: 0,
      lastUpdated: null,
      // v3 additions: richer preference tracking
      timbreHistory: [],   // { ts, timbre, feedback } — which instruments the user likes
      tempoHistory: [],    // { ts, bpm, feedback } — preferred tempo ranges
      beatsHistory: []     // { ts, beatsActive, feedback } — beats on/off preference
    };
  }

  _save() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this.profile));
    } catch {}
  }

  /* Record feedback with full musical state snapshot + extended context */
  recordFeedback(type, musicalState, contextState, extendedContext) {
    if (!musicalState) return;

    const entry = {
      ts: Date.now(),
      state: {
        scale: musicalState.scale,
        filterFreq: musicalState.filterFreq,
        reverbMix: musicalState.reverbMix,
        density: musicalState.density,
        detune: musicalState.detune,
        baseFreq: musicalState.baseFreq,
        attack: musicalState.attack,
        bpm: musicalState.bpm || null,
        mood: musicalState.mood || null
      },
      context: contextState ? {
        timeOfDay: contextState.timeOfDay,
        weather: contextState.weather,
        movement: contextState.movement
      } : null
    };

    if (type === 'like') {
      this.profile.likes.push(entry);
      if (this.profile.likes.length > 100) this.profile.likes.shift();
    } else {
      this.profile.dislikes.push(entry);
      if (this.profile.dislikes.length > 100) this.profile.dislikes.shift();
    }

    // Track timbre preference (which instrument was playing)
    if (extendedContext && extendedContext.timbre) {
      this.profile.timbreHistory.push({
        ts: Date.now(), timbre: extendedContext.timbre, feedback: type
      });
      if (this.profile.timbreHistory.length > 150) this.profile.timbreHistory.shift();
    }

    // Track tempo preference
    if (extendedContext && extendedContext.bpm) {
      this.profile.tempoHistory.push({
        ts: Date.now(), bpm: extendedContext.bpm, feedback: type
      });
      if (this.profile.tempoHistory.length > 150) this.profile.tempoHistory.shift();
    }

    // Track beats on/off preference
    if (extendedContext && extendedContext.beatsActive !== undefined) {
      this.profile.beatsHistory.push({
        ts: Date.now(), beatsActive: extendedContext.beatsActive, feedback: type
      });
      if (this.profile.beatsHistory.length > 100) this.profile.beatsHistory.shift();
    }

    this.profile.totalFeedback++;
    this.profile.lastUpdated = Date.now();
    this._recomputeBias();
    this._save();
  }

  /* Compute parameter bias from feedback history.
     Positive bias = user tends to like higher values.
     Negative bias = user tends to like lower values.
     Range: -1 to +1 per parameter. */
  _recomputeBias() {
    const numericKeys = ['filterFreq', 'reverbMix', 'density', 'detune', 'baseFreq', 'attack'];
    const bias = {};

    for (const key of numericKeys) {
      const likeVals = this.profile.likes
        .map(e => e.state[key]).filter(v => v != null);
      const dislikeVals = this.profile.dislikes
        .map(e => e.state[key]).filter(v => v != null);

      if (likeVals.length === 0 && dislikeVals.length === 0) continue;

      const likeAvg = likeVals.length > 0
        ? likeVals.reduce((a, b) => a + b, 0) / likeVals.length : null;
      const dislikeAvg = dislikeVals.length > 0
        ? dislikeVals.reduce((a, b) => a + b, 0) / dislikeVals.length : null;

      if (likeAvg !== null && dislikeAvg !== null) {
        // Normalized difference: positive means user prefers higher
        const range = this._getRange(key);
        bias[key] = Math.max(-1, Math.min(1, (likeAvg - dislikeAvg) / range));
      } else if (likeAvg !== null) {
        // Only likes: bias toward the average
        const def = this._getDefault(key);
        const range = this._getRange(key);
        bias[key] = Math.max(-1, Math.min(1, (likeAvg - def) / range * 0.5));
      }
    }

    // Scale/mood preferences (categorical)
    bias.preferredMoods = this._topMoods(this.profile.likes);
    bias.avoidedMoods = this._topMoods(this.profile.dislikes);

    // Timbre preferences (which instruments get likes vs dislikes)
    bias.preferredTimbres = this._computeTimbrePreference();

    // Tempo range preference
    bias.preferredTempoRange = this._computeTempoPreference();

    // Beats preference (does user tend to like/dislike when beats are on?)
    bias.beatsPreference = this._computeBeatsPreference();

    this.profile.paramBias = bias;
  }

  _computeTimbrePreference() {
    const history = this.profile.timbreHistory || [];
    if (history.length < 3) return null;
    const scores = {};
    history.forEach(h => {
      if (!scores[h.timbre]) scores[h.timbre] = { likes: 0, dislikes: 0 };
      if (h.feedback === 'like') scores[h.timbre].likes++;
      else scores[h.timbre].dislikes++;
    });
    // Return sorted by net preference (likes - dislikes)
    return Object.entries(scores)
      .map(([timbre, s]) => ({ timbre, net: s.likes - s.dislikes, total: s.likes + s.dislikes }))
      .filter(t => t.total >= 2) // need minimum data
      .sort((a, b) => b.net - a.net);
  }

  _computeTempoPreference() {
    const history = this.profile.tempoHistory || [];
    const liked = history.filter(h => h.feedback === 'like').map(h => h.bpm);
    if (liked.length < 3) return null;
    // Find preferred BPM range from liked tempos
    liked.sort((a, b) => a - b);
    // Use interquartile range for robustness
    const q1 = liked[Math.floor(liked.length * 0.25)];
    const q3 = liked[Math.floor(liked.length * 0.75)];
    const median = liked[Math.floor(liked.length * 0.5)];
    return { low: q1, median, high: q3 };
  }

  _computeBeatsPreference() {
    const history = this.profile.beatsHistory || [];
    if (history.length < 5) return null;
    // Count likes when beats active vs inactive
    let beatsOnLikes = 0, beatsOnDislikes = 0;
    let beatsOffLikes = 0, beatsOffDislikes = 0;
    history.forEach(h => {
      if (h.beatsActive) {
        if (h.feedback === 'like') beatsOnLikes++; else beatsOnDislikes++;
      } else {
        if (h.feedback === 'like') beatsOffLikes++; else beatsOffDislikes++;
      }
    });
    const onScore = beatsOnLikes - beatsOnDislikes;
    const offScore = beatsOffLikes - beatsOffDislikes;
    // Positive = prefers beats on, negative = prefers beats off
    return { onScore, offScore, preference: onScore > offScore ? 'on' : (offScore > onScore ? 'off' : 'neutral') };
  }

  _topMoods(entries) {
    const counts = {};
    entries.forEach(e => {
      if (e.state.mood) counts[e.state.mood] = (counts[e.state.mood] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);
  }

  _getRange(key) {
    const ranges = {
      filterFreq: 1800, reverbMix: 0.6, density: 3, detune: 30,
      baseFreq: 300, attack: 9
    };
    return ranges[key] || 1;
  }

  _getDefault(key) {
    const defaults = {
      filterFreq: 800, reverbMix: 0.35, density: 3, detune: 15,
      baseFreq: 220, attack: 5
    };
    return defaults[key] || 0;
  }

  /* Apply learned bias to a musical state from Music Brain.
     Called after interpret() to nudge parameters toward user preference.
     Strength increases with more feedback (0-30% adjustment max). */
  applyBias(musicalState) {
    if (this.profile.totalFeedback < 3) return musicalState; // need minimum data

    const bias = this.profile.paramBias;
    // Strength: ramps from 0% at 3 feedbacks to 30% at 30+
    const strength = Math.min(0.3, (this.profile.totalFeedback - 3) / 90);
    const result = { ...musicalState };

    const numericKeys = ['filterFreq', 'reverbMix', 'density', 'detune', 'baseFreq', 'attack'];
    for (const key of numericKeys) {
      if (bias[key] !== undefined && result[key] !== undefined) {
        const range = this._getRange(key);
        result[key] += bias[key] * range * strength;
      }
    }

    // Clamp
    result.filterFreq = Math.max(200, Math.min(2000, result.filterFreq));
    result.reverbMix = Math.max(0.1, Math.min(0.7, result.reverbMix));
    result.density = Math.max(1, Math.min(4, Math.round(result.density)));
    result.detune = Math.max(5, Math.min(35, result.detune));
    result.baseFreq = Math.max(100, Math.min(400, result.baseFreq));
    result.attack = Math.max(1, Math.min(10, result.attack));

    console.log('[Kálma Learning] Bias applied (strength: ' +
      (strength * 100).toFixed(0) + '%):', bias);

    return result;
  }

  /* Get preference summary for LLM context */
  getPreferenceSummary() {
    const bias = this.profile.paramBias;
    const summary = [];

    if (bias.preferredMoods && bias.preferredMoods.length > 0) {
      summary.push({ type: 'preferred_moods', moods: bias.preferredMoods });
    }
    if (bias.avoidedMoods && bias.avoidedMoods.length > 0) {
      summary.push({ type: 'avoided_moods', moods: bias.avoidedMoods });
    }

    // Timbre preferences
    if (bias.preferredTimbres && bias.preferredTimbres.length > 0) {
      summary.push({
        type: 'timbre_preference',
        preferred: bias.preferredTimbres.filter(t => t.net > 0).map(t => t.timbre),
        avoided: bias.preferredTimbres.filter(t => t.net < 0).map(t => t.timbre)
      });
    }

    // Tempo range preference
    if (bias.preferredTempoRange) {
      summary.push({
        type: 'tempo_preference',
        range: bias.preferredTempoRange
      });
    }

    // Beats preference
    if (bias.beatsPreference) {
      summary.push({
        type: 'beats_preference',
        preference: bias.beatsPreference.preference
      });
    }

    // Recent likes for LLM context
    const recentLikes = this.profile.likes.slice(-5).map(e => ({
      mood: e.state.mood,
      filterFreq: e.state.filterFreq,
      reverbMix: e.state.reverbMix,
      density: e.state.density
    }));
    if (recentLikes.length > 0) {
      summary.push({ type: 'recent_likes', states: recentLikes });
    }

    return summary;
  }

  /* Stats for UI */
  getStats() {
    const bias = this.profile.paramBias;
    return {
      totalFeedback: this.profile.totalFeedback,
      likes: this.profile.likes.length,
      dislikes: this.profile.dislikes.length,
      biasStrength: Math.min(30, Math.max(0,
        ((this.profile.totalFeedback - 3) / 90) * 30)).toFixed(0) + '%',
      preferredMoods: bias.preferredMoods || [],
      avoidedMoods: bias.avoidedMoods || [],
      preferredTimbres: bias.preferredTimbres
        ? bias.preferredTimbres.filter(t => t.net > 0).map(t => t.timbre) : [],
      avoidedTimbres: bias.preferredTimbres
        ? bias.preferredTimbres.filter(t => t.net < 0).map(t => t.timbre) : [],
      preferredTempoRange: bias.preferredTempoRange || null,
      beatsPreference: bias.beatsPreference ? bias.beatsPreference.preference : 'neutral'
    };
  }
}
