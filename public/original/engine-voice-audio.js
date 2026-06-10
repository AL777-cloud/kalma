/* Kálma — Audio Voice Engine
   Plays pre-generated MP3 voice files through Web Audio
   with reverb, ducking, and segment assembly */

class EngineVoiceAudio {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.voiceBus;
    this.playing = false;
    this.paused = false;
    this.queue = [];       // audio file URLs to play
    this.currentSource = null;
    this.gainNode = null;
    this.reverbNode = null;
    this.reverbGain = null;

    this._stopped = false;
    this._pauseTime = 0;
    this._startOffset = 0;
    this._currentBuffer = null;
    this._timer = null;
  }

  _init() {
    if (this.gainNode) return;

    // Voice input gain — voice should be prominently above music
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0.85;



    // Voice reverb (separate, lighter than music reverb)
    this.reverbNode = this.ctx.createConvolver();
    const irLen = this.ctx.sampleRate * 1; // 1 second tail (shorter, tighter)
    const irBuf = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 4); // steeper decay
      }
    }
    this.reverbNode.buffer = irBuf;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.06; // very subtle reverb on voice

    // Route: gainNode → output + reverb (no limiter — source audio is already mastered)
    this.gainNode.connect(this.output);
    this.gainNode.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.output);
  }

  // Load a single full-session audio file (e.g. chakra tuning)
  async loadFullSession(audioUrl) {
    const exists = await this._fileExists(audioUrl);
    if (!exists) return false;
    this.queue = [{ url: audioUrl, type: 'audio' }];
    console.log('[K\u00e1lma VoiceAudio] Loaded full session:', audioUrl);
    return true;
  }

  // Build queue from pre-generated audio files
  async loadScript(scriptName, timerMinutes) {
    const base = `./audio/voice/${scriptName}`;

    // Check if audio files exist
    const introExists = await this._fileExists(`${base}/intro.mp3`);
    if (!introExists) return false;

    this.queue = [];

    // Intro
    this.queue.push({ url: `${base}/intro.mp3`, type: 'audio' });
    this.queue.push({ type: 'pause', duration: 6000 });

    // Body segments based on timer
    let segmentsNeeded;
    if (timerMinutes === 0 || timerMinutes >= 45) segmentsNeeded = 5;
    else if (timerMinutes >= 30) segmentsNeeded = 4;
    else if (timerMinutes >= 20) segmentsNeeded = 3;
    else segmentsNeeded = 2;

    for (let i = 0; i < segmentsNeeded; i++) {
      const bodyUrl = `${base}/body-${i}.mp3`;
      if (await this._fileExists(bodyUrl)) {
        this.queue.push({ url: bodyUrl, type: 'audio' });
        this.queue.push({ type: 'pause', duration: 7000 });
      }
    }

    // Closing
    const closingUrl = `${base}/closing.mp3`;
    if (await this._fileExists(closingUrl)) {
      this.queue.push({ url: closingUrl, type: 'audio' });
    }

    console.log('[Kálma VoiceAudio] Loaded', this.queue.length, 'items for', scriptName);
    return true;
  }

  async _fileExists(url) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      return resp.ok;
    } catch (e) {
      return false;
    }
  }

  async _loadAudio(url) {
    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuf);
  }

  async start() {
    if (this.queue.length === 0) return;
    this._init();
    this._stopped = false;
    this.playing = true;
    this._playNext();
  }

  async _playNext() {
    if (this._stopped || this.queue.length === 0) {
      this.playing = false;
      if (this.onDuckEnd) this.onDuckEnd();
      return;
    }

    const item = this.queue.shift();

    if (item.type === 'pause') {
      this._timer = setTimeout(() => this._playNext(), item.duration);
      return;
    }

    // Audio item
    try {

      const buffer = await this._loadAudio(item.url);
      this._currentBuffer = buffer;
      this._startOffset = 0;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      this.currentSource = source;

      source.onended = () => {
        this.currentSource = null;
        this._currentBuffer = null;
        // Long pause between segments for meditative pacing
        this._timer = setTimeout(() => this._playNext(), 6000);
      };

      source.start(0);
    } catch (e) {
      console.warn('[Kálma VoiceAudio] Error playing:', item.url, e);
      this._timer = setTimeout(() => this._playNext(), 1000);
    }
  }

  pause() {
    this.paused = true;
    if (this._timer) clearTimeout(this._timer);
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch(e) {}
      this.currentSource = null;
    }
    if (this.onDuckEnd) this.onDuckEnd();
  }

  resume() {
    this.paused = false;
    // Re-trigger next item (simplest approach — skip to next segment)
    this._playNext();
  }

  stop() {
    this._stopped = true;
    this.playing = false;
    this.paused = false;
    this.queue = [];
    if (this._timer) clearTimeout(this._timer);
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch(e) {}
      this.currentSource = null;
    }
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
  }

  setVolume(v) {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  }

  setReverbAmount(v) {
    if (this.reverbGain) {
      this.reverbGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  }
}
