/* Kalma Chat Engine -- Conversational presence layer
   Manages conversation history and LLM communication.
   Returns message + music + detectedMood + moodHint from server. */

class KalmaChat {
  constructor() {
    this.history = [];
    this.onMessage = null;
    this.onTyping = null;
    this._maxHistory = 20;
    this.memory = this._loadMemory();
  }

  _loadMemory() {
    try {
      return JSON.parse(localStorage.getItem('kalma-chat-memory')) || { sessions: 0, themes: [], name: null, keyMoments: [] };
    } catch { return { sessions: 0, themes: [], name: null, keyMoments: [] }; }
  }

  _saveMemory() {
    try {
      // Keep memory compact — max 20 key moments, 10 themes
      if (this.memory.keyMoments.length > 20) this.memory.keyMoments = this.memory.keyMoments.slice(-20);
      if (this.memory.themes.length > 10) this.memory.themes = this.memory.themes.slice(-10);
      localStorage.setItem('kalma-chat-memory', JSON.stringify(this.memory));
    } catch {}
  }

  addKeyMoment(mood, snippet) {
    this.memory.keyMoments.push({ mood, snippet, ts: Date.now() });
    if (!this.memory.themes.includes(mood)) this.memory.themes.push(mood);
    this._saveMemory();
  }

  getMemoryContext() {
    if (this.memory.sessions === 0 && this.memory.keyMoments.length === 0) return null;
    let ctx = `Returning visitor (session #${this.memory.sessions + 1}).`;
    if (this.memory.name) ctx += ` Their name is ${this.memory.name}.`;
    if (this.memory.themes.length > 0) ctx += ` Recurring themes: ${this.memory.themes.join(', ')}.`;
    if (this.memory.keyMoments.length > 0) {
      const recent = this.memory.keyMoments.slice(-3);
      ctx += ' Recent moments: ' + recent.map(m => `"${m.snippet}" (${m.mood})`).join('; ') + '.';
    }
    return ctx;
  }

  startSession() {
    this.memory.sessions++;
    this._saveMemory();
  }

  async send(text, context) {
    if (!text || !text.trim()) return null;

    const userMsg = text.trim();
    this.history.push({ role: 'user', content: userMsg });
    if (this.history.length > this._maxHistory) {
      this.history = this.history.slice(-this._maxHistory);
    }

    if (this.onTyping) this.onTyping(true);

    try {
      const basePath = window.location.pathname.replace(/\/$/, '');
      const response = await fetch(basePath + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: this.history.slice(0, -1),
          context: context || {}
        })
      });

      if (!response.ok) throw new Error('Chat API error');

      const data = await response.json();
      const reply = data.message || '';
      const musicParams = data.music || null;
      const detectedMood = data.detectedMood || 'neutral';
      const moodHint = data.moodHint || null;

      this.history.push({ role: 'assistant', content: reply });
      if (this.history.length > this._maxHistory) {
        this.history = this.history.slice(-this._maxHistory);
      }

      if (this.onTyping) this.onTyping(false);

      const result = { message: reply, music: musicParams, detectedMood, moodHint };
      if (this.onMessage) this.onMessage(reply, musicParams);

      return result;
    } catch (err) {
      console.error('[Kalma Chat] Error:', err);
      if (this.onTyping) this.onTyping(false);

      const fallback = { message: 'Even silence is a kind of answer.', music: null, detectedMood: 'calm', moodHint: null };
      this.history.push({ role: 'assistant', content: fallback.message });
      if (this.onMessage) this.onMessage(fallback.message, null);
      return fallback;
    }
  }

  clear() {
    this.history = [];
  }
}
