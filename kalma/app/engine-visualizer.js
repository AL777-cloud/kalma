/* Kálma — Audio Visualizer
   Radial reactive visualization with bass/kick emphasis.
   Dual mode: real AnalyserNode data (synth) or simulated reactive (radio). */

class KalmaVisualizer {
  constructor() {
    this.canvas = null;
    this.ctx2d = null;
    this.analyser = null;
    this.dataArray = null;
    this.active = false;
    this.animFrame = null;
    this.mode = 'simulated';
    this.simEnergy = 0;
    this.simBands = new Float32Array(64);
    this.smoothBands = new Float32Array(64);
    this.prevTime = 0;
    this.hueShift = 0;
    this.breathPhase = 0;

    // Bass tracking
    this.bassPrev = 0;
    this.kickFlash = 0;
    this.bassHit = 0;

    // Bass motion — displacement of the whole center
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeVelX = 0;
    this.shakeVelY = 0;

    // Opacity for smooth fade in/out
    this.opacity = 0;
    this.targetOpacity = 0;

    // Eye state
    this.eyeOpen = 0;         // 0 = closed, 1 = fully open
    this.eyeTarget = 0;       // target open state
    this.blinkTimer = 0;      // seconds until next blink
    this.blinkPhase = 0;      // 0 = not blinking, >0 = in blink
    this.blinkInterval = 10;  // seconds between blinks

    // Particles
    this.particles = [];
    for (let i = 0; i < 48; i++) {
      this.particles.push({
        angle: (i / 48) * Math.PI * 2,
        offset: Math.random() * 0.3,
        speed: 0.3 + Math.random() * 0.4,
        size: 1 + Math.random() * 1.5
      });
    }
  }

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx2d = canvasEl.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    const size = Math.min(parent.offsetWidth, parent.offsetHeight, 300);
    this.canvas.width = size * (window.devicePixelRatio || 1);
    this.canvas.height = size * (window.devicePixelRatio || 1);
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
  }

  connectAnalyser(audioCtx, sourceNode) {
    try {
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      sourceNode.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.mode = 'real';
    } catch (e) {
      console.warn('[Kálma Viz] Could not connect analyser:', e.message);
      this.mode = 'simulated';
    }
  }

  // Connect radio Audio element through Web Audio for real frequency data
  connectRadio(audioElement) {
    try {
      if (!this._radioCtx) {
        this._radioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this._radioCtx.state === 'suspended') this._radioCtx.resume();
      // Only create source once per element
      if (this._radioSource && this._radioSource.mediaElement === audioElement) {
        this.mode = 'real';
        return;
      }
      if (this._radioSource) {
        try { this._radioSource.disconnect(); } catch(e) {}
      }
      this._radioSource = this._radioCtx.createMediaElementSource(audioElement);
      this.analyser = this._radioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      this._radioSource.connect(this.analyser);
      this.analyser.connect(this._radioCtx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.mode = 'real';
      this._corsOk = true;
      console.log('[Kálma Viz] Connected radio to real analyser');
    } catch (e) {
      console.warn('[Kálma Viz] Radio analyser failed (CORS?):', e.message);
      this._corsOk = false;
      this.mode = 'simulated';
    }
  }

  feedEnergy(energy) {
    this.simEnergy = Math.max(0, Math.min(1, energy));
  }

  // Start the always-on loop (shows closed eye by default)
  startLoop() {
    if (this.active) return;
    this.active = true;
    this.opacity = 1;
    this.targetOpacity = 1;
    this.prevTime = performance.now();
    this._draw();
  }

  // Play — open eye, visualizer reacts to music
  start() {
    this.openEye();
  }

  // Stop — close eye, visualizer goes still
  stop() {
    this.closeEye();
  }

  openEye() {
    this.eyeTarget = 1;
    this.blinkTimer = this.blinkInterval;
  }

  closeEye() {
    this.eyeTarget = 0;
    this.blinkPhase = 0;
  }

  // Alias for compatibility — just close eye, loop keeps running
  fadeIn() { this.openEye(); }
  fadeOut() { this.closeEye(); }
  forceStop() { this.closeEye(); }

  _draw() {
    if (!this.active) return;
    this.animFrame = requestAnimationFrame(() => this._draw());

    const now = performance.now();
    const dt = Math.min((now - this.prevTime) / 1000, 0.1);
    this.prevTime = now;

    const globalA = 1; // always visible

    const c = this.ctx2d;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(cx, cy) * 0.7;
    const maxR = Math.min(cx, cy) * 0.95;
    const dpr = window.devicePixelRatio || 1;
    // Clear — transparent so CSS orb shows through
    c.clearRect(0, 0, w, h);

    // Get frequency data
    let bands;
    let useReal = false;
    if (this.mode === 'real' && this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      for (let i = 0; i < this.dataArray.length; i++) {
        if (this.dataArray[i] > 0) { useReal = true; break; }
      }
    }
    if (useReal) {
      bands = this.dataArray;
    } else {
      // Auto-feed energy if eye is open (playing) but no external feed
      if (this.eyeTarget === 1 && this.simEnergy < 0.1) {
        this.simEnergy = 0.8;
      }
      this._simulateBands(dt);
      bands = this.simBands;
    }

    // Smooth bands — bass reacts faster
    const numBands = Math.min(bands.length, this.smoothBands.length);
    for (let i = 0; i < numBands; i++) {
      const target = (bands[i] || 0) / (this.mode === 'real' ? 255 : 1);
      const smoothing = i < 8 ? 0.3 : i < 16 ? 0.18 : 0.12;
      this.smoothBands[i] += (target - this.smoothBands[i]) * smoothing;
    }

    // Bass / kick detection
    const bass = this._avgBands(0, 6);
    const bassTransient = Math.max(0, bass - this.bassPrev);
    this.bassPrev = bass;

    if (bassTransient > 0.03) {
      this.kickFlash = Math.min(1, bassTransient * 8);
      this.bassHit = Math.min(1, this.bassHit + bassTransient * 6);
    }
    this.kickFlash *= 0.85;
    this.bassHit *= 0.9;
    this.bassHit = Math.max(this.bassHit, bass * 0.9);

    this.hueShift += dt * 8;
    this.breathPhase += dt * 0.5;

    // ── Bass motion — shake the whole center on kicks ──
    const dcx = cx;
    const dcy = cy;

    // Pulse the CSS orb on bass
    if (this._orbEl) {
      const pulse = 1 + this.kickFlash * 0.08 + this.bassHit * 0.05;
      this._orbEl.style.transform = `scale(${pulse})`;
    }

    // ── Kick flash ring (subtle, on canvas) ──
    if (this.kickFlash > 0.05) {
      const flashR = baseR * 0.85 + this.kickFlash * baseR * 0.15;
      c.beginPath();
      c.arc(dcx, dcy, flashR, 0, Math.PI * 2);
      c.strokeStyle = `rgba(139, 131, 255, ${this.kickFlash * 0.3})`;
      c.lineWidth = (1 + this.kickFlash * 2) * dpr;
      c.stroke();
    }

    // ── Short radial bars — uniform height, tight around orb ──
    const barCount = 48;
    const step = (Math.PI * 2) / barCount;
    const maxBarLen = baseR * 0.25;
    const barStart = baseR + 4 * dpr;

    // Average all bands for uniform size
    const avgVal = this._avgBands(0, numBands);
    const barLen = maxBarLen * avgVal;

    for (let i = 0; i < barCount; i++) {
      const angle = i * step - Math.PI / 2;

      if (barLen < 0.5) continue;

      const x1 = dcx + Math.cos(angle) * barStart;
      const y1 = dcy + Math.sin(angle) * barStart;
      const x2 = dcx + Math.cos(angle) * (barStart + barLen);
      const y2 = dcy + Math.sin(angle) * (barStart + barLen);

      // Gradient matching Kalma orb: blue -> purple -> pink -> green
      const t = i / barCount;
      let r, g, b;
      if (t < 0.33) {
        const p = t / 0.33;
        r = Math.round(140 + p * 60);
        g = Math.round(180 - p * 10);
        b = Math.round(255 - p * 25);
      } else if (t < 0.66) {
        const p = (t - 0.33) / 0.33;
        r = Math.round(200 + p * 55);
        g = Math.round(170 + p * 30);
        b = Math.round(230 - p * 10);
      } else {
        const p = (t - 0.66) / 0.34;
        r = Math.round(255 - p * 75);
        g = Math.round(200 + p * 55);
        b = Math.round(220 - p * 40);
      }
      const alpha = 0.3 + avgVal * 0.5;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      c.lineWidth = 2 * dpr;
      c.lineCap = 'round';
      c.stroke();
    }

    // ── Outer ring — subtle, breathes with bass ──
    const ringR = baseR * 1.5 + this.bassHit * baseR * 0.2;
    c.beginPath();
    c.arc(dcx, dcy, ringR, 0, Math.PI * 2);
    c.strokeStyle = `rgba(108, 99, 255, ${0.08 + this.bassHit * 0.15})`;
    c.lineWidth = (1 + this.bassHit * 0.8) * dpr;
    c.stroke();

    // ── Floating particles ──
    for (const p of this.particles) {
      const energy = this._avgBands(Math.floor(p.offset * numBands), Math.floor(p.offset * numBands) + 3);
      const dist = baseR * (1.2 + p.offset * 0.8 + energy * 0.3);
      const a = p.angle + now * 0.0001 * p.speed;
      const px = dcx + Math.cos(a) * dist;
      const py = dcy + Math.sin(a) * dist;
      const alpha = 0.12 + energy * 0.35;
      const size = p.size * dpr * (1 + energy * 0.4);

      c.beginPath();
      c.arc(px, py, size, 0, Math.PI * 2);
      // Particles use orb layer colors
      const pr = Math.round(140 + p.offset * 115);  // blue->pink
      const pg = Math.round(180 - p.offset * 10);
      const pb = Math.round(255 - p.offset * 35);
      c.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
      c.fill();
    }

    // ── Third Eye (stays centered — no shake) ──
    this._updateEye(dt);
    this._drawEye(c, cx, cy, baseR, globalA);

  }

  _updateEye(dt) {
    // Smooth open/close
    const eyeSpeed = 1.5; // ~0.7s to open/close
    if (this.eyeOpen < this.eyeTarget) {
      this.eyeOpen = Math.min(this.eyeTarget, this.eyeOpen + eyeSpeed * dt);
    } else if (this.eyeOpen > this.eyeTarget) {
      this.eyeOpen = Math.max(this.eyeTarget, this.eyeOpen - eyeSpeed * dt);
    }

    // Blink logic — only when eye is open
    if (this.eyeTarget === 1 && this.eyeOpen > 0.9) {
      if (this.blinkPhase > 0) {
        // In a blink
        this.blinkPhase += dt * 4; // smooth blink
        if (this.blinkPhase >= 1) {
          this.blinkPhase = 0;
          this.blinkTimer = this.blinkInterval;
        }
      } else {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkPhase = 0.01; // start blink
        }
      }
    }
  }

  _drawEye(c, cx, cy, baseR, globalA) {
    // Eye dimensions
    const eyeW = baseR * 0.55;
    const eyeH = baseR * 0.3;

    // Compute effective openness (eye open minus blink dip)
    let openness = this.eyeOpen;
    if (this.blinkPhase > 0) {
      // Blink curve: close then reopen (sine pulse)
      const blinkDip = Math.sin(this.blinkPhase * Math.PI);
      openness = this.eyeOpen * (1 - blinkDip);
    }

    // Clamp
    openness = Math.max(0, Math.min(1, openness));

    // Eye shape: almond using bezier curves
    // The vertical opening scales with openness
    const halfOpen = eyeH * openness;

    c.save();
    c.globalAlpha = globalA;

    // Outer glow behind eye
    if (openness > 0.1) {
      const eyeGlow = c.createRadialGradient(cx, cy, 0, cx, cy, eyeW * 1.2);
      eyeGlow.addColorStop(0, `rgba(139, 131, 255, ${0.15 * openness})`);
      eyeGlow.addColorStop(1, 'rgba(139, 131, 255, 0)');
      c.beginPath();
      c.arc(cx, cy, eyeW * 1.2, 0, Math.PI * 2);
      c.fillStyle = eyeGlow;
      c.fill();
    }

    // Draw almond eye outline
    c.beginPath();
    // Top lid
    c.moveTo(cx - eyeW, cy);
    c.quadraticCurveTo(cx, cy - halfOpen, cx + eyeW, cy);
    // Bottom lid
    c.quadraticCurveTo(cx, cy + halfOpen, cx - eyeW, cy);
    c.closePath();

    // Fill with dark interior
    if (openness > 0.05) {
      c.fillStyle = `hsla(260, 30%, 8%, ${0.9 * openness})`;
      c.fill();
    }

    // Eye outline
    c.strokeStyle = `rgba(139, 131, 255, ${0.5 * openness})`;
    c.lineWidth = 1.5 * (window.devicePixelRatio || 1);
    c.stroke();

    // Iris + pupil (only when open enough)
    if (openness > 0.2) {
      const irisR = eyeH * 0.55 * openness;
      const pupilR = irisR * 0.45;

      // Iris
      const irisGrad = c.createRadialGradient(cx, cy, pupilR, cx, cy, irisR);
      irisGrad.addColorStop(0, `rgba(108, 99, 255, ${0.9 * openness})`);
      irisGrad.addColorStop(0.7, `rgba(139, 131, 255, ${0.8 * openness})`);
      irisGrad.addColorStop(1, `rgba(80, 70, 180, ${0.6 * openness})`);

      // Clip to eye shape
      c.save();
      c.beginPath();
      c.moveTo(cx - eyeW, cy);
      c.quadraticCurveTo(cx, cy - halfOpen, cx + eyeW, cy);
      c.quadraticCurveTo(cx, cy + halfOpen, cx - eyeW, cy);
      c.closePath();
      c.clip();

      // Draw iris
      c.beginPath();
      c.arc(cx, cy, irisR, 0, Math.PI * 2);
      c.fillStyle = irisGrad;
      c.fill();

      // Pupil
      c.beginPath();
      c.arc(cx, cy, pupilR, 0, Math.PI * 2);
      c.fillStyle = `hsla(260, 20%, 5%, ${0.95 * openness})`;
      c.fill();

      // Light reflection
      const reflR = pupilR * 0.3;
      c.beginPath();
      c.arc(cx - pupilR * 0.3, cy - pupilR * 0.3, reflR, 0, Math.PI * 2);
      c.fillStyle = `hsla(0, 0%, 100%, ${0.6 * openness})`;
      c.fill();

      c.restore(); // unclip
    }

    // Closed eye line (visible when nearly/fully closed)
    if (openness < 0.15) {
      const closedAlpha = (1 - openness / 0.15) * 0.6;
      c.beginPath();
      c.moveTo(cx - eyeW, cy);
      c.quadraticCurveTo(cx, cy - eyeH * 0.08, cx + eyeW, cy);
      c.strokeStyle = `rgba(139, 131, 255, ${closedAlpha})`;
      c.lineWidth = 1.5 * (window.devicePixelRatio || 1);
      c.stroke();
    }

    c.restore();
  }

  _simulateBands(dt) {
    const e = this.simEnergy;

    // No energy = decay to zero
    if (e < 0.01) {
      for (let i = 0; i < this.simBands.length; i++) {
        this.simBands[i] *= 0.9;
      }
      return;
    }

    const t = performance.now() * 0.001;
    for (let i = 0; i < this.simBands.length; i++) {
      let freqWeight;
      if (i < 4) freqWeight = 1.0;
      else if (i < 10) freqWeight = 0.85;
      else if (i < 20) freqWeight = 0.5;
      else freqWeight = 0.3;

      // Continuous organic motion — multiple layered waves at different speeds
      const wave1 = Math.sin(t * (1.1 + i * 0.08)) * 0.5 + 0.5;
      const wave2 = Math.sin(t * (1.7 + i * 0.05) + i * 0.9) * 0.3 + 0.5;
      const wave3 = Math.sin(t * (0.6 + i * 0.13) + i * 2.1) * 0.2 + 0.5;

      // Bass kicks layered on top
      const kick1 = Math.sin(t * 2.1) > 0.75 ? 1 : 0;
      const kick2 = Math.sin(t * 3.3 + 1.5) > 0.8 ? 0.7 : 0;
      const kickBoost = (i < 10) ? Math.max(kick1, kick2) * 0.35 : 0;

      // Combine: continuous base + kick transients
      const base = freqWeight * (wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25);
      const target = e * (base * 0.6 + 0.15) + kickBoost * e;

      // Smooth interpolation — fast enough to feel reactive
      const speed = target > this.simBands[i] ? 6 : 3;
      this.simBands[i] += (target - this.simBands[i]) * (speed * dt);
    }
  }

  _avgBands(from, to) {
    let sum = 0;
    const n = Math.min(to, this.smoothBands.length);
    if (n <= from) return 0;
    for (let i = from; i < n; i++) sum += this.smoothBands[i];
    return sum / (n - from);
  }
}

const kalmaViz = new KalmaVisualizer();
