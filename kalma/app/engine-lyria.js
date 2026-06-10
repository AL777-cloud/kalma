/* Kálma — Lyria RealTime Integration (Optional)
   Connects to Google's Lyria RealTime via WebSocket for AI-generated music
   Falls back to local synth engine if unavailable or no API key */

class EngineLyria {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.musicBus;
    this.ws = null;
    this.active = false;
    this.apiKey = null;
    this.currentPrompts = [];
    this.config = { bpm: 70, temperature: 0.8 };

    // Audio playback
    this.nextPlayTime = 0;
    this.sampleRate = 48000;
    this.gainNode = null;
  }

  // Mood → Lyria prompt mapping
  static MOOD_PROMPTS = {
    unwind: [
      { text: 'ambient relaxation', weight: 1.5 },
      { text: 'warm pads', weight: 1.0 },
      { text: 'gentle flowing', weight: 0.8 }
    ],
    uplift: [
      { text: 'uplifting ambient', weight: 1.5 },
      { text: 'hopeful piano', weight: 1.0 },
      { text: 'bright ethereal', weight: 0.7 }
    ],
    sleep: [
      { text: 'deep sleep ambient', weight: 1.5 },
      { text: 'drone meditation', weight: 1.0 },
      { text: 'very slow minimal', weight: 0.8 }
    ],
    reading: [
      { text: 'focus ambient', weight: 1.5 },
      { text: 'lo-fi background', weight: 0.8 },
      { text: 'soft instrumental', weight: 0.7 }
    ],
    meditate: [
      { text: 'meditation music', weight: 1.5 },
      { text: 'tibetan ambient', weight: 1.0 },
      { text: 'spacious ethereal', weight: 0.8 }
    ],
    introspection: [
      { text: 'contemplative ambient', weight: 1.5 },
      { text: 'melancholy piano', weight: 0.8 },
      { text: 'introspective', weight: 1.0 }
    ],
    reset: [
      { text: 'cleansing ambient', weight: 1.5 },
      { text: 'fresh morning', weight: 0.8 },
      { text: 'renewal', weight: 1.0 }
    ],
    clarity: [
      { text: 'clear focused ambient', weight: 1.5 },
      { text: 'minimal electronic', weight: 0.8 },
      { text: 'crystalline', weight: 0.7 }
    ],
    gratitude: [
      { text: 'warm grateful ambient', weight: 1.5 },
      { text: 'gentle acoustic', weight: 1.0 },
      { text: 'heart opening', weight: 0.8 }
    ],
    creative: [
      { text: 'creative flow ambient', weight: 1.5 },
      { text: 'experimental electronic', weight: 0.8 },
      { text: 'playful ethereal', weight: 0.7 }
    ]
  };

  // BPM per mood
  static MOOD_BPM = {
    unwind: 65, uplift: 85, sleep: 50, reading: 75,
    meditate: 55, introspection: 60, reset: 80,
    clarity: 72, gratitude: 68, creative: 90
  };

  setApiKey(key) {
    this.apiKey = key;
  }

  isAvailable() {
    return !!this.apiKey && 'WebSocket' in window;
  }

  setMood(intent) {
    this.currentPrompts = EngineLyria.MOOD_PROMPTS[intent] || EngineLyria.MOOD_PROMPTS.unwind;
    this.config.bpm = EngineLyria.MOOD_BPM[intent] || 70;

    // If already connected, send the new prompts
    if (this.active && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendPrompts();
      this._sendConfig();
    }
  }

  async start() {
    if (!this.isAvailable()) {
      console.warn('[K\u00e1lma Lyria] Not available');
      return false;
    }

    this.active = true;
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0;
    this.gainNode.connect(this.output);
    this.nextPlayTime = this.ctx.currentTime + 0.5;

    try {
      // Connect through our backend proxy
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/lyria`;
      this.ws = new WebSocket(url);

      return new Promise((resolve) => {
        this.ws.onopen = () => {
          console.log('[K\u00e1lma Lyria] Connected to proxy');
          // Tell proxy to connect to Lyria
          this.ws.send(JSON.stringify({ action: 'connect' }));
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event);
        };

        this.ws.onerror = (err) => {
          console.warn('[K\u00e1lma Lyria] Proxy error:', err);
          this.active = false;
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log('[K\u00e1lma Lyria] Proxy disconnected');
          this.active = false;
        };

        // Wait for 'ready' message from proxy
        this._onReady = () => {
          this._sendPrompts();
          this._sendConfig();
          this._sendPlay();
          this.gainNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 1.5);
          resolve(true);
        };

        // Timeout
        setTimeout(() => {
          if (!this.active || (this.ws.readyState !== WebSocket.OPEN)) {
            console.warn('[K\u00e1lma Lyria] Connection timeout');
            this.active = false;
            resolve(false);
          }
        }, 12000);
      });
    } catch (e) {
      console.warn('[K\u00e1lma Lyria] Failed:', e);
      this.active = false;
      return false;
    }
  }

  _sendPrompts() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'set_prompts', prompts: this.currentPrompts }));
  }

  _sendConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'set_config', config: this.config }));
  }

  _sendPlay() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: 'play' }));
  }

  _handleMessage(event) {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'ready') {
        console.log('[K\u00e1lma Lyria] Lyria ready');
        if (this._onReady) this._onReady();
        return;
      }

      if (msg.type === 'audio' && msg.data) {
        this._playAudioChunk(msg.data);
        return;
      }

      if (msg.type === 'error') {
        console.warn('[K\u00e1lma Lyria] Error:', msg.message);
        return;
      }

      if (msg.type === 'disconnected') {
        console.log('[K\u00e1lma Lyria] Lyria disconnected:', msg.code);
        this.active = false;
        return;
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }

  _playAudioChunk(base64Data) {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    this._playRawAudio(bytes.buffer);
  }

  _playRawAudio(arrayBuffer) {
    // Convert 16-bit PCM to Float32 AudioBuffer
    const int16 = new Int16Array(arrayBuffer);
    const samples = int16.length;
    const audioBuffer = this.ctx.createBuffer(1, samples, this.sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < samples; i++) {
      channelData[i] = int16[i] / 32768;
    }

    // Schedule playback
    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    const now = this.ctx.currentTime;
    const startTime = Math.max(this.nextPlayTime, now);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;
  }

  // Shift mood from text prompt
  applyPromptMood(text) {
    const t = text.toLowerCase();
    const prompts = [];

    if (/sad|lonely|melanchol/.test(t)) {
      prompts.push({ text: 'melancholy ambient', weight: 1.5 }, { text: 'gentle sadness', weight: 1.0 });
    } else if (/anxi|stress|nervous/.test(t)) {
      prompts.push({ text: 'calming ambient', weight: 1.5 }, { text: 'soothing drone', weight: 1.0 });
    } else if (/happy|joy|excited/.test(t)) {
      prompts.push({ text: 'joyful ambient', weight: 1.5 }, { text: 'uplifting', weight: 1.0 });
    } else if (/peace|calm|relax/.test(t)) {
      prompts.push({ text: 'peaceful meditation', weight: 1.5 }, { text: 'serene', weight: 1.0 });
    } else if (/sleep|tired/.test(t)) {
      prompts.push({ text: 'deep sleep', weight: 1.5 }, { text: 'minimal drone', weight: 1.0 });
      this.config.bpm = 50;
    } else if (/energy|power|motiv/.test(t)) {
      prompts.push({ text: 'energetic ambient', weight: 1.5 }, { text: 'driving', weight: 0.8 });
      this.config.bpm = 95;
    } else {
      prompts.push({ text: text, weight: 1.0 }, { text: 'ambient therapeutic', weight: 0.8 });
    }

    this.currentPrompts = prompts;
    this._sendPrompts();
    this._sendConfig();
  }

  stop() {
    this.active = false;
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }
    setTimeout(() => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    }, 2000);
  }
}
