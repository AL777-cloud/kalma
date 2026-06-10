/* Kálma Player — Camera Engine (Ambient Light Adaptation)
   Reads average luminance from the camera feed to adapt music brightness.
   
   How it works:
   - Captures a tiny video feed (no image processing, no storage)
   - Samples average brightness from a small canvas every 5 seconds
   - Maps brightness → musical parameters (filter, reverb, density)
   - Dark room = warmer, deeper, more reverb
   - Bright room = lighter, airier, slightly drier
   
   Privacy: No frames are stored or transmitted. Only a single number
   (average luminance 0-255) is extracted. Camera feed is never shown. */

class KalmaCamera {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.canvasCtx = null;
    this.active = false;
    this._interval = null;
    this._listeners = [];
    this._luminance = 128; // default: medium brightness
    this._smoothLuminance = 128;
    this._prevBucket = 'medium';
  }

  /* ── Event system ── */
  onChange(fn) { this._listeners.push(fn); }
  _emit(data) { this._listeners.forEach(fn => fn(data)); }

  /* ── Request camera + start sampling ── */
  async start() {
    if (this.active) return true;

    try {
      // Request lowest possible resolution (we only need brightness)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // prefer rear camera (ambient light)
          width: { ideal: 64 },
          height: { ideal: 48 },
          frameRate: { ideal: 2, max: 5 } // very low fps — saving battery
        },
        audio: false
      });

      // Hidden video element
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.setAttribute('playsinline', '');
      this.video.muted = true;
      this.video.style.display = 'none';
      document.body.appendChild(this.video);
      await this.video.play();

      // Tiny canvas for sampling
      this.canvas = document.createElement('canvas');
      this.canvas.width = 16;
      this.canvas.height = 12;
      this.canvasCtx = this.canvas.getContext('2d', { willReadFrequently: true });

      this.active = true;

      // Sample every 5 seconds (very low battery impact)
      this._interval = setInterval(() => this._sample(), 5000);
      // First sample immediately
      setTimeout(() => this._sample(), 500);

      console.log('[Kálma Camera] Ambient light sensing active');
      return true;
    } catch (e) {
      console.warn('[Kálma Camera] Permission denied or unavailable:', e.message);
      return false;
    }
  }

  /* ── Sample luminance from video frame ── */
  _sample() {
    if (!this.active || !this.video || this.video.readyState < 2) return;

    // Draw tiny frame to canvas
    this.canvasCtx.drawImage(this.video, 0, 0, 16, 12);
    const pixels = this.canvasCtx.getImageData(0, 0, 16, 12).data;

    // Calculate average luminance (perceptual: 0.299R + 0.587G + 0.114B)
    let totalLum = 0;
    const numPixels = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      totalLum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
    this._luminance = totalLum / numPixels;

    // Smooth (slow transitions — light doesn't jump)
    const alpha = 0.2;
    this._smoothLuminance = this._smoothLuminance * (1 - alpha) + this._luminance * alpha;

    // Classify into buckets
    const lum = this._smoothLuminance;
    let bucket, params;

    if (lum < 40) {
      // Very dark (nighttime, lights off)
      bucket = 'veryDark';
      params = {
        filterBias: -200,    // lower filter freq
        reverbBias: 0.12,    // more reverb
        densityBias: -1,     // fewer layers
        warmthBias: 0.3,     // warmer tone
        description: 'Dark room — deep, warm, spacious'
      };
    } else if (lum < 90) {
      // Dim (evening, candlelight, dimmed room)
      bucket = 'dim';
      params = {
        filterBias: -100,
        reverbBias: 0.06,
        densityBias: 0,
        warmthBias: 0.15,
        description: 'Dim light — intimate, warm'
      };
    } else if (lum < 160) {
      // Medium (indoor normal lighting)
      bucket = 'medium';
      params = {
        filterBias: 0,
        reverbBias: 0,
        densityBias: 0,
        warmthBias: 0,
        description: 'Normal light — balanced'
      };
    } else if (lum < 210) {
      // Bright (well-lit room, near window)
      bucket = 'bright';
      params = {
        filterBias: 80,
        reverbBias: -0.04,
        densityBias: 0.5,
        warmthBias: -0.1,
        description: 'Bright — airy, present'
      };
    } else {
      // Very bright (outdoors, direct sunlight)
      bucket = 'veryBright';
      params = {
        filterBias: 150,
        reverbBias: -0.08,
        densityBias: 1,
        warmthBias: -0.2,
        description: 'Sunlight — open, bright, alive'
      };
    }

    // Only emit on bucket change (not every 5s)
    if (bucket !== this._prevBucket) {
      this._prevBucket = bucket;
      console.log('[Kálma Camera] Light:', bucket, '(lum=' + Math.round(lum) + ')');
      this._emit({
        luminance: Math.round(this._smoothLuminance),
        bucket: bucket,
        params: params
      });
    }
  }

  /* Current state (for UI display) */
  get luminance() { return Math.round(this._smoothLuminance); }
  get bucket() { return this._prevBucket; }

  /* ── Cleanup ── */
  stop() {
    this.active = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.remove();
      this.video = null;
    }
  }
}
