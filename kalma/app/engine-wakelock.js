/* Kálma — Wake Lock + Media Session
   Keeps screen awake during playback and shows lock screen controls */

class EngineWakeLock {
  constructor() {
    this.wakeLock = null;
    this.supported = 'wakeLock' in navigator;
    this.mediaSessionSupported = 'mediaSession' in navigator;

    // Silent audio element — tricks iOS into thinking media is playing
    // This is the key to background audio on mobile
    this.silentAudio = null;
  }

  async requestWakeLock() {
    if (!this.supported) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        console.log('[Kálma WakeLock] Released');
      });
      console.log('[Kálma WakeLock] Acquired');
    } catch (e) {
      console.warn('[Kálma WakeLock] Failed:', e.message);
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  // Re-acquire wake lock when page becomes visible again
  // (wake lock is automatically released when page is hidden)
  enableAutoReacquire() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.wakeLock !== null) {
        await this.requestWakeLock();
      }
    });
  }

  // Set up Media Session — shows controls on lock screen
  setupMediaSession(title, onPlay, onPause) {
    if (!this.mediaSessionSupported) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Kálma',
      artist: 'Therapeutic Sound',
      album: 'Kálma Session'
    });

    navigator.mediaSession.setActionHandler('play', onPlay);
    navigator.mediaSession.setActionHandler('pause', onPause);
    navigator.mediaSession.setActionHandler('stop', onPause);
  }

  updateMediaSessionState(playing) {
    if (!this.mediaSessionSupported) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  // iOS background audio fix
  // Routes Web Audio output through an <audio> element via MediaStream
  // iOS keeps <audio> elements alive during screen lock
  startBackgroundAudio(audioContext) {
    if (this.bgAudio) return;

    try {
      // Create a MediaStream from the AudioContext destination
      const dest = audioContext.createMediaStreamDestination();

      // Connect the master output to the stream destination
      // We need to also connect to the regular destination so sound still plays
      this.streamDest = dest;

      // Create an audio element that plays the stream
      this.bgAudio = document.createElement('audio');
      this.bgAudio.setAttribute('playsinline', 'true');
      this.bgAudio.srcObject = dest.stream;
      this.bgAudio.volume = 1.0;

      const playPromise = this.bgAudio.play();
      if (playPromise) {
        playPromise.catch(e => {
          console.warn('[K\u00e1lma WakeLock] Background audio failed:', e.message);
          // Fallback: try silent audio trick
          this._startSilentFallback();
        });
      }

      console.log('[K\u00e1lma WakeLock] Background audio stream started');
      return dest; // caller should connect their master to this
    } catch (e) {
      console.warn('[K\u00e1lma WakeLock] MediaStream not supported:', e.message);
      this._startSilentFallback();
      return null;
    }
  }

  _startSilentFallback() {
    if (this.bgAudio) return;
    this.bgAudio = document.createElement('audio');
    this.bgAudio.setAttribute('loop', 'true');
    this.bgAudio.setAttribute('playsinline', 'true');
    this.bgAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    this.bgAudio.volume = 0.01;
    this.bgAudio.play().catch(() => {});
    console.log('[K\u00e1lma WakeLock] Silent fallback started');
  }

  stopBackgroundAudio() {
    if (this.bgAudio) {
      this.bgAudio.pause();
      this.bgAudio.srcObject = null;
      this.bgAudio.src = '';
      this.bgAudio = null;
    }
    this.streamDest = null;
  }

  // Call when playback starts
  async onPlay(title, audioContext) {
    await this.requestWakeLock();
    if (audioContext) this.startBackgroundAudio(audioContext);
    this.updateMediaSessionState(true);
    if (title) {
      this.setupMediaSession(title, null, null);
    }
  }

  // Call when playback stops
  onPause() {
    this.updateMediaSessionState(false);
  }

  // Call when leaving player entirely
  onStop() {
    this.releaseWakeLock();
    this.stopBackgroundAudio();
    this.updateMediaSessionState(false);
  }
}

const wakeLockManager = new EngineWakeLock();
wakeLockManager.enableAutoReacquire();
