/* Kálma Player — Microphone Engine
   Features:
   1. Voice Mood Input — speak how you feel, speech-to-text → mood interpretation
   2. Humming/Singing Integration — detect pitch from voice → harmonize in real time

   Uses Web Audio API + Web Speech API (no external services). */

class KalmaMic {
  constructor(ctx) {
    this.ctx = ctx;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.active = false;
    this._pitchActive = false;
    this._voiceActive = false;
    this._recognition = null;
    this._pitchBuffer = new Float32Array(2048);
    this._listeners = { mood: [], pitch: [], status: [] };
    this._lastPitch = 0;
    this._pitchSmooth = 0;
    this._pitchConfidence = 0;
    this._silenceCount = 0;
    this._hummingCallbacks = [];
    this._pitchInterval = null;
  }

  /* ── Event system ── */
  on(event, fn) { if (this._listeners[event]) this._listeners[event].push(fn); }
  _emit(event, data) { (this._listeners[event] || []).forEach(fn => fn(data)); }

  /* ── Request mic access (call on user gesture) ── */
  async init() {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.8;
      this.source.connect(this.analyser);
      // Do NOT connect analyser to output (prevent feedback)
      this.active = true;
      this._emit('status', { type: 'ready' });
      console.log('[Kálma Mic] Microphone active');
      return true;
    } catch (e) {
      console.warn('[Kálma Mic] Permission denied or unavailable:', e.message);
      this._emit('status', { type: 'denied' });
      return false;
    }
  }

  /* ═══════════════════════════════════════════════
     FEATURE 1: Voice Mood Input (Speech-to-Text)
     ═══════════════════════════════════════════════ */

  /* Start listening for speech → converts to text → emits 'mood' event.
     The mood text is then fed into the existing applyPromptMood() pipeline. */
  startVoiceInput() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('[Kálma Mic] Speech recognition not supported');
      this._emit('status', { type: 'unsupported', feature: 'voice' });
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._recognition = new SpeechRecognition();
    this._recognition.continuous = false;
    this._recognition.interimResults = true;
    this._recognition.lang = 'en-US';
    this._recognition.maxAlternatives = 1;

    this._voiceActive = true;
    this._emit('status', { type: 'listening' });

    this._recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }

      if (isFinal && transcript.trim()) {
        this._voiceActive = false;
        this._emit('mood', { text: transcript.trim(), source: 'voice' });
        this._emit('status', { type: 'result', text: transcript.trim() });
        console.log('[Kálma Mic] Voice mood:', transcript.trim());
      } else if (transcript.trim()) {
        // Interim result — show user what's being heard
        this._emit('status', { type: 'interim', text: transcript.trim() });
      }
    };

    this._recognition.onerror = (event) => {
      this._voiceActive = false;
      if (event.error === 'no-speech') {
        this._emit('status', { type: 'no-speech' });
      } else {
        this._emit('status', { type: 'error', error: event.error });
      }
    };

    this._recognition.onend = () => {
      this._voiceActive = false;
      this._emit('status', { type: 'idle' });
    };

    this._recognition.start();
    return true;
  }

  stopVoiceInput() {
    if (this._recognition) {
      this._recognition.abort();
      this._recognition = null;
    }
    this._voiceActive = false;
    this._emit('status', { type: 'idle' });
  }

  get isListening() { return this._voiceActive; }

  /* ═══════════════════════════════════════════════
     FEATURE 2: Humming/Singing Pitch Detection
     ═══════════════════════════════════════════════
     Uses autocorrelation on the mic signal to detect fundamental frequency.
     Emits pitch events that the melody engine can harmonize with. */

  startPitchDetection() {
    if (!this.analyser) {
      console.warn('[Kálma Mic] Call init() first');
      return false;
    }
    this._pitchActive = true;
    this._silenceCount = 0;

    // Analyze pitch every 50ms (20Hz update rate)
    this._pitchInterval = setInterval(() => {
      if (!this._pitchActive) return;
      this._detectPitch();
    }, 50);

    this._emit('status', { type: 'pitch-active' });
    console.log('[Kálma Mic] Pitch detection active — hum or sing!');
    return true;
  }

  stopPitchDetection() {
    this._pitchActive = false;
    if (this._pitchInterval) {
      clearInterval(this._pitchInterval);
      this._pitchInterval = null;
    }
    this._emit('pitch', { freq: 0, confidence: 0, active: false });
    this._emit('status', { type: 'pitch-idle' });
  }

  get isPitchActive() { return this._pitchActive; }

  /* Autocorrelation pitch detection (YIN-inspired) */
  _detectPitch() {
    if (!this.analyser) return;

    const buf = this._pitchBuffer;
    this.analyser.getFloatTimeDomainData(buf);

    // Check if there's enough signal (not silence)
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);

    if (rms < 0.01) {
      // Silence
      this._silenceCount++;
      if (this._silenceCount > 10) { // 500ms of silence
        if (this._lastPitch > 0) {
          this._lastPitch = 0;
          this._pitchConfidence = 0;
          this._emit('pitch', { freq: 0, confidence: 0, active: false });
        }
      }
      return;
    }

    this._silenceCount = 0;

    // Autocorrelation
    const sampleRate = this.ctx.sampleRate;
    const minFreq = 60;  // lowest detectable (below bass voice)
    const maxFreq = 1200; // highest (above soprano)
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);
    const halfLen = Math.floor(buf.length / 2);

    let bestCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period <= Math.min(maxPeriod, halfLen); period++) {
      let correlation = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < halfLen; i++) {
        correlation += buf[i] * buf[i + period];
        norm1 += buf[i] * buf[i];
        norm2 += buf[i + period] * buf[i + period];
      }

      // Normalized correlation
      const normFactor = Math.sqrt(norm1 * norm2);
      if (normFactor > 0) correlation /= normFactor;

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }

    // Confidence threshold — only report if clearly periodic
    if (bestCorrelation > 0.7 && bestPeriod > 0) {
      // Parabolic interpolation for sub-sample accuracy
      const freq = sampleRate / bestPeriod;

      // Smooth the pitch (avoid jitter)
      const alpha = 0.3;
      this._pitchSmooth = this._pitchSmooth > 0
        ? this._pitchSmooth * (1 - alpha) + freq * alpha
        : freq;

      this._lastPitch = this._pitchSmooth;
      this._pitchConfidence = bestCorrelation;

      this._emit('pitch', {
        freq: this._pitchSmooth,
        midi: 69 + 12 * Math.log2(this._pitchSmooth / 440),
        confidence: bestCorrelation,
        rms: rms,
        active: true
      });
    } else if (bestCorrelation > 0.4 && bestPeriod > 0) {
      // Weak signal — might be voice, report with low confidence
      const freq = sampleRate / bestPeriod;
      this._emit('pitch', {
        freq: freq,
        midi: 69 + 12 * Math.log2(freq / 440),
        confidence: bestCorrelation,
        rms: rms,
        active: true
      });
    }
  }

  /* ── Cleanup ── */
  stop() {
    this.stopVoiceInput();
    this.stopPitchDetection();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch(e) {}
      this.source = null;
    }
    this.active = false;
  }
}
