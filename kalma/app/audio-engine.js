/* Kálma — Audio Engine
   Coordinates all engine modules into the KalmaAudioEngine class
   that the UI expects */

class KalmaAudioEngine {
  constructor() {
    this.core = null;
    this.music = null;
    this.lyria = null;
    this.useLyria = false;
    this.binaural = null;
    this.isochronic = null;
    this.meditation = null;
    this.ambience = null;
    this._started = false;
  }

  async init() {
    this.core = new EngineCore();
    await this.core.init();
    this.music = new EngineMusic(this.core);
    this.lyria = new EngineLyria(this.core);
    this.binaural = new EngineBinaural(this.core);
    this.isochronic = new EngineIsochronic(this.core);
    this.meditation = new EngineMeditation(this.core);
    this.ambience = new EngineAmbience(this.core);
    console.log('[Kálma] Audio engine ready');
  }

  get ctx() { return this.core ? this.core.ctx : null; }

  setMood(intent) {
    if (this.music) this.music.setMood(intent);
    if (this.lyria) this.lyria.setMood(intent);
  }

  // Enable Lyria with an API key
  async enableLyria(apiKey) {
    if (!this.lyria) return false;
    this.lyria.setApiKey(apiKey);
    if (this.lyria.isAvailable()) {
      this.useLyria = true;
      console.log('[K\u00e1lma] Lyria enabled');
      return true;
    }
    return false;
  }

  setFrequency(preset) {
    if (this.binaural) this.binaural.setFrequency(preset);
    if (this.isochronic) this.isochronic.setFrequency(preset);
  }

  async startMusic() {
    if (this._started) return;
    this._started = true;
    if (this.core.state === 'suspended') this.core.resume();

    // Try Lyria first if enabled
    if (this.useLyria && this.lyria) {
      const lyriaOk = await this.lyria.start();
      if (lyriaOk) {
        console.log('[K\u00e1lma] Music started (Lyria RealTime)');
        return;
      }
      console.log('[K\u00e1lma] Lyria failed, falling back to synth');
    }

    // Fallback to local synth
    if (this.music) this.music.start();
    console.log('[K\u00e1lma] Music started (synth)');
  }

  stopMusic() {
    this._started = false;
    if (this.lyria) this.lyria.stop();
    if (this.music) this.music.stop();
    if (this.binaural) this.binaural.stop();
    if (this.isochronic) this.isochronic.stop();
    if (this.meditation) this.meditation.stopAll();
    if (this.ambience) this.ambience.stopAll();
    if (this.core) this.core.close();
    console.log('[K\u00e1lma] Everything stopped');
  }

  pause() {
    if (this.core) this.core.suspend();
  }

  resume() {
    if (this.core) this.core.resume();
  }

  // Volume controls
  setMasterVolume(v) { if (this.core) this.core.setMasterVolume(v); }
  setMusicVolume(v) { if (this.core) this.core.setMusicVolume(v); }
  setAmbienceVolume(v) { if (this.core) this.core.setAmbienceVolume(v); }
  setLayersVolume(v) { if (this.core) this.core.setLayersVolume(v); }

  // Toggle layers
  toggleMeditationLayer(name) {
    if (name === 'binaural') {
      this.binaural.toggle();
    } else if (name === 'isochronic') {
      this.isochronic.toggle();
    } else {
      if (this.meditation) this.meditation.toggle(name);
    }
  }

  toggleAmbience(name) {
    if (this.ambience) this.ambience.toggle(name);
  }

  // Prompt mood shifting
  applyPromptMood(text) {
    if (this.useLyria && this.lyria && this.lyria.active) {
      this.lyria.applyPromptMood(text);
    }
    if (this.music) this.music.applyPromptMood(text);
  }
}
