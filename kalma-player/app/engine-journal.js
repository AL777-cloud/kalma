/* Kálma Player — Mood Journal
   Tracks sessions, moods, contexts, and feedback over time.
   All localStorage — no server needed. */

class KalmaJournal {
  constructor() {
    this.data = this._load();
    this._sessionStart = null;
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem('kalma-journal')) || { sessions: [], streak: 0, lastDate: null };
    } catch { return { sessions: [], streak: 0, lastDate: null }; }
  }

  _save() {
    try {
      // Keep last 90 days of sessions
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      this.data.sessions = this.data.sessions.filter(s => s.start > cutoff);
      localStorage.setItem('kalma-journal', JSON.stringify(this.data));
    } catch {}
  }

  // Call when playback starts
  startSession(context) {
    this._sessionStart = Date.now();
    this._sessionCtx = context ? { ...context } : {};
  }

  // Call when playback stops or user leaves
  endSession(feedback) {
    if (!this._sessionStart) return;

    const session = {
      start: this._sessionStart,
      duration: Math.round((Date.now() - this._sessionStart) / 1000), // seconds
      context: this._sessionCtx || {},
      feedback: feedback || null, // 'like' or 'dislike' or null
      date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    };

    this.data.sessions.push(session);
    this._updateStreak(session.date);
    this._save();
    this._sessionStart = null;
    return session;
  }

  // Record feedback mid-session
  recordFeedback(feedback, context) {
    if (!this._sessionStart) return;
    // Update the current running session's context
    this._sessionCtx = context ? { ...context } : this._sessionCtx;
    // Also store as a standalone feedback point
    const entry = {
      start: Date.now(),
      duration: 0,
      context: this._sessionCtx,
      feedback,
      date: new Date().toISOString().split('T')[0]
    };
    this.data.sessions.push(entry);
    this._save();
  }

  _updateStreak(today) {
    if (this.data.lastDate === today) return; // same day
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (this.data.lastDate === yesterday) {
      this.data.streak++;
    } else if (this.data.lastDate !== today) {
      this.data.streak = 1;
    }
    this.data.lastDate = today;
  }

  // ── Stats ──

  getStreak() { return this.data.streak; }

  getTotalSessions() { return this.data.sessions.filter(s => s.duration > 10).length; }

  getTotalMinutes() {
    return Math.round(this.data.sessions.reduce((sum, s) => sum + s.duration, 0) / 60);
  }

  // Get sessions for last N days
  getRecentDays(days = 7) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const daySessions = this.data.sessions.filter(s => s.date === dateStr);
      const totalMin = Math.round(daySessions.reduce((sum, s) => sum + s.duration, 0) / 60);
      const likes = daySessions.filter(s => s.feedback === 'like').length;
      const dislikes = daySessions.filter(s => s.feedback === 'dislike').length;

      // Mood score: -1 to 1 based on feedback
      let moodScore = 0;
      if (likes + dislikes > 0) moodScore = (likes - dislikes) / (likes + dislikes);

      // Most common time of day
      const times = daySessions.map(s => s.context?.timeOfDay).filter(Boolean);
      const topTime = this._mode(times);

      result.push({
        date: dateStr,
        dayLabel: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],
        sessions: daySessions.length,
        minutes: totalMin,
        moodScore,
        topTime: topTime || null
      });
    }
    return result;
  }

  // Most common contexts
  getTopContexts(field = 'timeOfDay', limit = 3) {
    const values = this.data.sessions
      .map(s => s.context?.[field])
      .filter(Boolean);
    const counts = {};
    values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  _mode(arr) {
    if (!arr.length) return null;
    const counts = {};
    arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
}
