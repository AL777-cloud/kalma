/* Kálma Player — App Controller */

const state = {
  core: null,
  music: null,
  layers: null,
  context: null,
  learning: null,
  mic: null,
  camera: null,
  playing: false,
  volume: 1.0,
  hummingActive: false,
  lightActive: false,
  preferences: loadPreferences()
};

const journal = new KalmaJournal();
const visualizer = new KalmaVisualizer();

/* ── Preferences (localStorage) ── */
function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem('kalma-player-prefs')) || { feedback: [], history: [] };
  } catch { return { feedback: [], history: [] }; }
}
function savePreferences() {
  try { localStorage.setItem('kalma-player-prefs', JSON.stringify(state.preferences)); } catch {}
}

/* ── Screen Navigation ── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

/* ── Splash (tap to enter, or auto-advance after 4s) ── */
let splashTimer = null;

function startFlow() {
  showScreen('screen-splash');
  splashTimer = setTimeout(() => {
    showScreen('screen-begin');
    startBeginTimer();
  }, 4000);
}

let beginTimer = null;

// Tap splash to skip
document.getElementById('splash-tap').addEventListener('click', () => {
  if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
  showScreen('screen-begin');
  startBeginTimer();
});

// Tap begin screen to start player (tap required — unlocks AudioContext)
document.getElementById('screen-begin').addEventListener('click', () => {
  if (beginTimer) { clearTimeout(beginTimer); beginTimer = null; }
  showScreen('screen-player');
  initPlayer();
});

function startBeginTimer() {
  // No auto-advance — user must tap to unlock audio.
  // Just pulse the message to invite interaction.
  const msg = document.querySelector('.begin-message');
  if (msg) {
    setTimeout(() => { msg.classList.add('pulse-invite'); }, 2000);
  }
}

/* ── Initialize Player ── */
function initPlayer() {
  if (state.core) return;

  // Audio core
  state.core = new KalmaCore();
  state.core.init();

  // Learning engine (preference tracking)
  state.learning = new KalmaLearning();

  // Adaptive music engine (v3 — introspection-style base)
  state.music = new AdaptiveEngine(state.core);
  state.music.brain.setLearning(state.learning);
  // Set introspection as the base musical character
  state.music.applyPromptMood('nostalgic reflective melancholy introspection soul mirror thought');
  state.layers = new KalmaLayers(state.core);

  // Context engine (time, weather, motion, season, holidays)
  state.context = new KalmaContext();
  state.context.onChange(onContextChange);
  state.context.start();

  // Apply initial context
  onContextChange(state.context.state);

  // Auto-play after short transition settle
  setTimeout(() => {
    startPlayback();
  }, 800);

  // Setup visualizer canvas size
  const canvas = document.getElementById('visualizer-canvas');
  if (canvas) {
    canvas.width = 300;
    canvas.height = 300;
  }
}

/* ── Context Change ── */
const TIME_LABELS = {
  morning: 'Morning', lateMorning: 'Late Morning', afternoon: 'Afternoon',
  evening: 'Evening', night: 'Night', lateNight: 'Late Night'
};
const WEATHER_LABELS = {
  clear: 'Clear', cloudy: 'Cloudy', fog: 'Fog',
  rain: 'Rain', snow: 'Snow', storm: 'Storm'
};
const MOTION_LABELS = { still: 'Still', neutral: 'Sensing', walking: 'Walking', active: 'Active' };

function onContextChange(ctx) {
  console.log('[Kálma Player] Context:', ctx);
  // Store globally for phrase engine access on start
  window._kalmaContextState = ctx;

  // Update context bar
  const timeEl = document.getElementById('ctx-time');
  const weatherEl = document.getElementById('ctx-weather');
  const motionEl = document.getElementById('ctx-motion');
  if (timeEl) timeEl.textContent = TIME_LABELS[ctx.timeOfDay] || ctx.timeOfDay;
  if (weatherEl) weatherEl.textContent = WEATHER_LABELS[ctx.weather] || ctx.weather;
  if (motionEl) motionEl.textContent = MOTION_LABELS[ctx.movement] || ctx.movement;

  // Update player status
  const statusEl = document.getElementById('player-status');
  if (statusEl && state.playing) {
    statusEl.textContent = buildStatusText(ctx);
  }

  // Show context notification
  showContextNotification(ctx);

  // Adapt music
  if (state.music && state.playing) {
    state.music.applyContext(ctx);

    // Update visualizer mood from context (time-of-day drives default palette)
    const timeToMood = {
      morning: 'bright', lateMorning: 'neutral', afternoon: 'neutral',
      evening: 'calm', night: 'sleepy', lateNight: 'dark'
    };
    visualizer.setMood(timeToMood[ctx.timeOfDay] || 'neutral');
  }

  // Update layer recommendations
  updateRecommendations(ctx);

  // Log to preferences
  state.preferences.history.push({ ts: Date.now(), ctx: { ...ctx } });
  if (state.preferences.history.length > 100) state.preferences.history.shift();
  savePreferences();
}

function buildStatusText(ctx) {
  const parts = [];
  parts.push(TIME_LABELS[ctx.timeOfDay] || 'Adaptive');
  if (ctx.weather !== 'clear') parts.push(WEATHER_LABELS[ctx.weather]);
  if (ctx.movement !== 'still') parts.push(MOTION_LABELS[ctx.movement]);
  if (ctx.holiday) parts.push(ctx.holiday.charAt(0).toUpperCase() + ctx.holiday.slice(1));
  return parts.join(' · ');
}

/* ── Context Notifications ── */
let notifyTimer = null;
let _lastNotifiedMovement = null;
function showContextNotification(ctx) {
  const el = document.getElementById('context-notification');
  const textEl = document.getElementById('ctx-notify-text');
  if (!el || !textEl) return;

  let msg = '';
  if (ctx.weather === 'rain') msg = 'Rain detected — reshaping the sound';
  else if (ctx.weather === 'storm') msg = 'Storm approaching — music intensifying';
  else if (ctx.weather === 'snow') msg = 'Snowfall — crystalline textures';
  else if (ctx.weather === 'fog') msg = 'Misty conditions — deepening space';
  else if (ctx.movement === 'still' && _lastNotifiedMovement && _lastNotifiedMovement !== 'still') msg = 'Settling into stillness';
  else if (ctx.movement === 'neutral' && _lastNotifiedMovement !== 'neutral') msg = 'Motion sensed — shimmering';
  else if (ctx.movement === 'walking') msg = 'Walking — music evolving with you';
  else if (ctx.movement === 'active') msg = 'Active — full energy engaged';
  else if (ctx.timeOfDay === 'morning') msg = 'Morning light — brightening tones';
  else if (ctx.timeOfDay === 'evening') msg = 'Evening — mellowing the sound';
  else if (ctx.timeOfDay === 'night') msg = 'Night — deepening atmosphere';
  else if (ctx.timeOfDay === 'lateNight') msg = 'Late night — entering deep calm';
  else if (ctx.holiday === 'christmas') msg = 'Holiday warmth — seasonal harmonics';
  else return;

  _lastNotifiedMovement = ctx.movement;
  textEl.textContent = msg;
  el.classList.remove('hidden');
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => el.classList.add('hidden'), 6000);
}

/* ── Playback ── */
function startPlayback() {
  if (state.playing) return;
  state.playing = true;

  // Resume AudioContext (may be suspended without gesture - that is OK,
  // engines queue operations and they play once context resumes)
  state.core.resume();

  // Start journal session
  journal.startSession(state.context ? state.context.state : {});

  // Start music (begins gentle emergence)
  state.music.start();

  // Apply context AFTER start — emergence flag absorbs params without spawning voices
  state.music.applyContext(state.context.state);

  // Fade in (faster onset so user hears something within 3-4 seconds)
  state.core.setMasterVolume(state.volume);
  state.core.fadeIn(5);

  // UI
  updatePlayButton(true);
  eyeTarget = 1; blinkTimer = blinkInterval;
  document.getElementById('player-status').textContent = buildStatusText(state.context.state);

  // iOS motion permission (needs gesture)
  if (state.context._needsMotionPermission) {
    state.context.requestMotionPermission();
  }

  // Start the first impression sensing sequence (the "magic" moment)
  startSensingSequence();

  // Start immediate gyroscope/tilt response (even during emergence)
  startImmediateMotionFeedback();

  // Start visualizer
  startVisualizer();

  // If context is still suspended, auto-resume on first user interaction
  if (state.core.ctx.state === 'suspended') {
    const resumeOnGesture = () => {
      state.core.ctx.resume();
      document.removeEventListener('click', resumeOnGesture);
      document.removeEventListener('touchstart', resumeOnGesture);
      document.removeEventListener('keydown', resumeOnGesture);
    };
    document.addEventListener('click', resumeOnGesture);
    document.addEventListener('touchstart', resumeOnGesture);
    document.addEventListener('keydown', resumeOnGesture);
  }
}

/* ═══ FIRST IMPRESSION ENGINE ═══
   During the first 30-45 seconds, the app narrates what it's sensing.
   Each detection triggers a visible text line + corresponding musical response.
   This is the "Wait, the music is actually reacting to me" moment. */

function startSensingSequence() {
  const el = document.getElementById('sensing-sequence');
  const line = document.getElementById('sensing-line');
  if (!el || !line) return;

  el.classList.remove('hidden');
  const ctx = state.context ? state.context.state : {};

  // Build a sequence of what we're detecting — shown one at a time
  const sequence = [];

  // Always start with "listening"
  sequence.push({ text: 'Listening...', delay: 0 });

  // Time of day — always available
  const timeMsg = {
    morning: 'Sensing morning light',
    lateMorning: 'Late morning detected',
    afternoon: 'Afternoon warmth',
    evening: 'Evening settling in',
    night: 'Sensing the night',
    lateNight: 'Deep night detected'
  };
  sequence.push({ text: timeMsg[ctx.timeOfDay] || 'Reading your environment', delay: 3000 });

  // Season
  const seasonMsg = {
    spring: 'Spring — tuning to renewal',
    summer: 'Summer — warm open tones',
    autumn: 'Autumn — bittersweet harmonics',
    winter: 'Winter — crystalline stillness'
  };
  sequence.push({ text: seasonMsg[ctx.season] || 'Sensing season', delay: 6000 });

  // Weather (if not default)
  if (ctx.weather && ctx.weather !== 'clear') {
    const weatherMsg = {
      cloudy: 'Clouds overhead — softening texture',
      rain: 'Rain falling — deepening reverb',
      storm: 'Storm energy — intensifying',
      fog: 'Fog — dissolving edges',
      snow: 'Snow — crystallizing sound'
    };
    sequence.push({ text: weatherMsg[ctx.weather] || 'Weather detected', delay: 9500 });
  } else if (ctx.weather === 'clear') {
    sequence.push({ text: 'Clear sky — open frequencies', delay: 9500 });
  }

  // Temperature (if known)
  if (ctx.temp !== undefined && ctx.temp !== 25) {
    const tempC = Math.round(ctx.temp);
    let tempMsg;
    if (tempC < 10) tempMsg = `${tempC}\u00b0 — cold air, darker tones`;
    else if (tempC < 20) tempMsg = `${tempC}\u00b0 — cool, balanced sound`;
    else if (tempC > 30) tempMsg = `${tempC}\u00b0 — heat, brighter harmonics`;
    else tempMsg = `${tempC}\u00b0 — comfortable warmth`;
    sequence.push({ text: tempMsg, delay: 13000 });
  }

  // Movement
  sequence.push({ text: 'Sensing your body...', delay: 16000 });

  // Location awareness
  if (ctx.lat && ctx.lon) {
    sequence.push({ text: 'Location received — local conditions applied', delay: 19500 });
  }

  // Final
  sequence.push({ text: 'Adapting to you', delay: 22000 });
  sequence.push({ text: '', delay: 26000 }); // clear

  // Play the sequence
  sequence.forEach(item => {
    setTimeout(() => {
      if (!state.playing) return;
      if (item.text) {
        line.textContent = item.text;
        line.style.animation = 'none';
        // Trigger reflow to restart animation
        line.offsetHeight;
        line.style.animation = 'sensing-fade 0.8s ease-out';
      } else {
        el.classList.add('hidden');
      }
    }, item.delay);
  });

  // After the sequence, mark first impression complete
  setTimeout(() => {
    state._firstImpressionDone = true;
  }, 28000);
}

/* ═══ IMMEDIATE MOTION FEEDBACK (gyroscope shimmer during emergence) ═══
   Even during the first seconds, tilting the phone should create
   an audible shimmer/modulation response — proving the app is alive. */
function startImmediateMotionFeedback() {
  if (!window.DeviceOrientationEvent) return;

  let lastBeta = null;
  let lastGamma = null;
  const handler = (e) => {
    if (!state.playing || !state.music || !state.music.ctx) return;
    const beta = e.beta || 0;   // front-back tilt
    const gamma = e.gamma || 0; // left-right tilt

    if (lastBeta === null) { lastBeta = beta; lastGamma = gamma; return; }

    const deltaBeta = Math.abs(beta - lastBeta);
    const deltaGamma = Math.abs(gamma - lastGamma);
    const totalDelta = deltaBeta + deltaGamma;

    // Even small tilts (>2 degrees) trigger a musical shimmer
    if (totalDelta > 2 && state.music.voices) {
      const intensity = Math.min(1, totalDelta / 20); // 0-1 based on tilt strength
      const now = state.music.ctx.currentTime;

      // Modulate active drone filter frequencies (shimmer effect)
      state.music.voices.forEach(v => {
        if (v.alive && v.filter) {
          const boost = 50 + intensity * 200; // 50-250Hz boost
          const currentFreq = v.filter.frequency.value;
          v.filter.frequency.setTargetAtTime(
            Math.min(1500, currentFreq + boost * (Math.random() > 0.5 ? 1 : -0.5)),
            now, 0.3
          );
        }
      });

      // Subtle stereo shift based on left-right tilt
      if (state.music._vaPan && Math.abs(deltaGamma) > 3) {
        const panShift = Math.max(-0.4, Math.min(0.4, gamma / 45));
        state.music._vaPan.pan.setTargetAtTime(panShift, now, 0.5);
      }
    }

    lastBeta = beta;
    lastGamma = gamma;
  };

  // iOS permission
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(result => {
      if (result === 'granted') window.addEventListener('deviceorientation', handler);
    }).catch(() => {});
  } else {
    window.addEventListener('deviceorientation', handler);
  }

  // Store cleanup
  state._orientationHandler = handler;
}

function stopPlayback() {
  if (!state.playing) return;
  state.playing = false;

  // End journal session
  journal.endSession();
  updateJournalUI();

  eyeTarget = 0; blinkPhase = 0;
  state.core.fadeOut(3);
  setTimeout(() => {
    if (state.music) state.music.stop();
  }, 3500);

  updatePlayButton(false);
  document.getElementById('player-status').textContent = 'Paused';
}

function updatePlayButton(playing) {
  const icon = document.getElementById('play-icon');
  if (playing) {
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>';
  } else {
    icon.innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
  }
}

/* ── Visualizer (glow orbs orbiting + third eye) ── */
let vizRAF = null;
let smoothBands = new Float32Array(128);
let bassPrev = 0;
let kickFlash = 0;
let bassHit = 0;

// Third Eye state
let eyeOpen = 0;
let eyeTarget = 0;
let blinkTimer = 10;
let blinkPhase = 0;
const blinkInterval = 10;
let vizPrevTime = 0;

// Glow orbs — particles orbiting the center, reacting to frequencies
const glowOrbs = [];
for (let i = 0; i < 14; i++) {
  glowOrbs.push({
    angle: (i / 14) * Math.PI * 2,
    baseRadius: 0.9 + Math.random() * 0.5,   // orbit radius multiplier
    speed: 0.15 + Math.random() * 0.35,       // orbit speed
    size: 2 + Math.random() * 3,              // base size
    freqBand: Math.floor(Math.random() * 12), // which frequency band to react to (low bias)
    phase: Math.random() * Math.PI * 2,       // phase offset for wobble
    wobbleSpeed: 0.5 + Math.random() * 1.5    // wobble speed
  });
}

function startVisualizer() {
  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas || !state.music) return;
  const c = canvas.getContext('2d');
  const analyser = state.music.getAnalyser();
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const dpr = window.devicePixelRatio || 1;

  // Size canvas LARGER than the orb so geometry extends freely without box edges
  const parent = canvas.parentElement;
  let orbSize = Math.min(parent.offsetWidth || 160, parent.offsetHeight || 160, 300);
  if (orbSize < 50) orbSize = 130; // mobile fallback
  const size = Math.round(orbSize * 1.6); // canvas is 1.6x the orb — room to breathe without being huge
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const baseR = Math.min(cx, cy) * 0.7;
  const orbEl = document.getElementById('viz-orb');

  function draw() {
    vizRAF = requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);
    c.clearRect(0, 0, w, h);

    // Smooth bands — bass reacts faster (matching original)
    const numBands = Math.min(dataArray.length, smoothBands.length);
    for (let i = 0; i < numBands; i++) {
      const target = dataArray[i] / 255;
      const smoothing = i < 8 ? 0.3 : i < 16 ? 0.18 : 0.12;
      smoothBands[i] += (target - smoothBands[i]) * smoothing;
    }

    // Bass / kick detection
    let bassSum = 0;
    const bassCount = Math.min(6, numBands);
    for (let i = 0; i < bassCount; i++) bassSum += smoothBands[i];
    const bass = bassSum / bassCount;
    const bassTransient = Math.max(0, bass - bassPrev);
    bassPrev = bass;

    if (bassTransient > 0.03) {
      kickFlash = Math.min(1, bassTransient * 8);
      bassHit = Math.min(1, bassHit + bassTransient * 6);
    }
    kickFlash *= 0.85;
    bassHit *= 0.9;
    bassHit = Math.max(bassHit, bass * 0.9);

    // Pulse the CSS orb on bass (matching original)
    if (orbEl) {
      const pulse = 1 + kickFlash * 0.08 + bassHit * 0.05;
      orbEl.style.transform = `scale(${pulse})`;
    }

    // Kick flash ring (mood-colored)
    if (kickFlash > 0.05) {
      const flashR = baseR * 0.85 + kickFlash * baseR * 0.15;
      c.beginPath();
      c.arc(cx, cy, flashR, 0, Math.PI * 2);
      c.strokeStyle = visualizer.getGlow(kickFlash * 0.3);
      c.lineWidth = (1 + kickFlash * 2) * dpr;
      c.stroke();
    }

    // ── Glow orbs orbiting the center, reacting to low frequencies ──
    const time = performance.now() * 0.001;

    for (const orb of glowOrbs) {
      // Get energy from this orb's frequency band (biased toward low)
      const bandStart = orb.freqBand;
      let energy = 0;
      const bandEnd = Math.min(bandStart + 3, numBands);
      for (let b = bandStart; b < bandEnd; b++) energy += smoothBands[b];
      energy /= (bandEnd - bandStart) || 1;

      // Bass multiplier — low bands get extra push
      const bassBoost = orb.freqBand < 6 ? 1.4 : orb.freqBand < 12 ? 1.0 : 0.6;
      energy *= bassBoost;

      // Orbit: angle moves over time, radius pulses with energy
      const angle = orb.angle + time * orb.speed;
      const wobble = Math.sin(time * orb.wobbleSpeed + orb.phase) * baseR * 0.06;
      const dist = baseR * orb.baseRadius + energy * baseR * 0.4 + wobble;

      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;

      // Size pulses with energy + kick
      const size = (orb.size + energy * 4 + kickFlash * 2) * dpr;
      const alpha = 0.1 + energy * 0.5 + kickFlash * 0.15;

      // Color: mood-driven palette (interpolates between primary, secondary, glow)
      const t = ((orb.angle / (Math.PI * 2)) + 0.5) % 1;
      const prim = visualizer.getRawPrimary();
      const sec = visualizer.getRawSecondary();
      const glo = visualizer.getRawGlow();
      let r, g, b;
      if (t < 0.33) {
        const p = t / 0.33;
        r = Math.round(prim[0] + (sec[0] - prim[0]) * p);
        g = Math.round(prim[1] + (sec[1] - prim[1]) * p);
        b = Math.round(prim[2] + (sec[2] - prim[2]) * p);
      } else if (t < 0.66) {
        const p = (t - 0.33) / 0.33;
        r = Math.round(sec[0] + (glo[0] - sec[0]) * p);
        g = Math.round(sec[1] + (glo[1] - sec[1]) * p);
        b = Math.round(sec[2] + (glo[2] - sec[2]) * p);
      } else {
        const p = (t - 0.66) / 0.34;
        r = Math.round(glo[0] + (prim[0] - glo[0]) * p);
        g = Math.round(glo[1] + (prim[1] - glo[1]) * p);
        b = Math.round(glo[2] + (prim[2] - glo[2]) * p);
      }

      // Glow: radial gradient for soft look
      if (size > 0.5 && alpha > 0.02) {
        const grad = c.createRadialGradient(px, py, 0, px, py, size * 2);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(alpha, 0.7)})`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        c.beginPath();
        c.arc(px, py, size * 2, 0, Math.PI * 2);
        c.fillStyle = grad;
        c.fill();

        // Solid core
        c.beginPath();
        c.arc(px, py, size * 0.5, 0, Math.PI * 2);
        c.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(alpha * 1.2, 0.8)})`;
        c.fill();
      }
    }

    // ═══ VISUALIZER ENGINE UPDATE ═══
    const dt = 1 / 60; // approximate frame delta
    visualizer.update(dt);

    // Feed tension from phrase engine
    if (state.music && state.music.phrase) {
      visualizer.setTension(state.music.phrase.tension || 0);
    } else {
      visualizer.setTension(0);
    }

    // Outer ring — breathes with bass, mood-colored
    const ringR = baseR * 1.5 + bassHit * baseR * 0.2;
    c.beginPath();
    c.arc(cx, cy, ringR, 0, Math.PI * 2);
    c.strokeStyle = visualizer.getPrimary(0.08 + bassHit * 0.15);
    c.lineWidth = (1 + bassHit * 0.8) * dpr;
    c.stroke();

    // ═══ SACRED GEOMETRY (behind orbs, mood-colored, tension-morphing) ═══
    const geoEnergy = bass * 0.8 + kickFlash * 0.3;
    c.globalAlpha = 1;
    visualizer.drawGeometry(c, cx, cy, baseR * 1.1, geoEnergy);
    c.globalAlpha = 1;

    // ═══ SOFT EDGE FADE — dissolve to transparent at canvas edges (no hard box) ═══
    c.globalCompositeOperation = 'destination-in';
    const edgeGrad = c.createRadialGradient(cx, cy, 0, cx, cy, Math.min(cx, cy));
    edgeGrad.addColorStop(0, 'rgba(255,255,255,1)');   // fully visible at center
    edgeGrad.addColorStop(0.6, 'rgba(255,255,255,1)'); // stay solid until 60% out
    edgeGrad.addColorStop(1, 'rgba(255,255,255,0)');   // fade to transparent at edge
    c.fillStyle = edgeGrad;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';

  }

  if (vizRAF) cancelAnimationFrame(vizRAF);
  draw();
}

/* ── Event Listeners ── */

// Play/Pause
document.getElementById('btn-play-pause').addEventListener('click', () => {
  if (!state.core) {
    initPlayer();
    return;
  }
  // If state says playing but AudioContext is actually suspended, fix the mismatch
  if (state.playing && state.core.ctx && state.core.ctx.state === 'suspended') {
    state.playing = false;
  }
  if (state.playing) stopPlayback();
  else startPlayback();
});

// Volume
document.getElementById('master-volume').addEventListener('input', (e) => {
  state.volume = e.target.value / 100;
  if (state.core) state.core.setMasterVolume(state.volume);
  // Un-mute if user drags slider
  if (muted && state.volume > 0) {
    muted = false;
    document.getElementById('btn-mute').classList.remove('active');
    document.getElementById('mute-label').textContent = 'Mute';
    document.getElementById('mute-icon').innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>';
  }
});

// Mood prompt toggle
document.getElementById('btn-prompt-toggle').addEventListener('click', () => {
  const area = document.getElementById('player-prompt-area');
  const btn = document.getElementById('btn-prompt-toggle');
  const isHidden = area.classList.toggle('hidden');
  btn.classList.toggle('active', !isHidden);
  document.getElementById('prompt-toggle-text').textContent = isHidden ? 'Shift mood' : 'Hide';
  if (!isHidden) document.getElementById('mood-prompt').focus();
});

// Send mood prompt
async function sendPrompt() {
  const input = document.getElementById('mood-prompt');
  const text = input.value.trim();
  if (!text || !state.music) return;

  // Show thinking state
  const statusEl = document.getElementById('player-status');
  statusEl.textContent = 'Interpreting: "' + text + '"...';
  input.value = '';

  // Hide prompt after sending
  document.getElementById('player-prompt-area').classList.add('hidden');
  document.getElementById('btn-prompt-toggle').classList.remove('active');
  document.getElementById('prompt-toggle-text').textContent = 'Shift mood';

  // Async AI interpretation with rule-based fallback
  const result = await state.music.applyPromptMood(text);
  const sourceLabel = result && result.source === 'ai' ? 'AI' : 'adaptive';
  statusEl.textContent = '"' + text + '" (' + sourceLabel + ')';

  // Update visualizer mood palette
  if (state.music && state.music.melody) {
    visualizer.setMood(state.music.melody.mood || 'neutral');
  } else {
    visualizer.setMood('neutral');
  }

  // Restore status after a while
  setTimeout(() => {
    if (state.playing && state.context) {
      statusEl.textContent = buildStatusText(state.context.state);
    }
  }, 8000);
}

document.getElementById('btn-send-prompt').addEventListener('click', sendPrompt);
document.getElementById('mood-prompt').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendPrompt();
});

// Feedback: thumbs up / down
document.querySelectorAll('.feedback-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const feedback = btn.dataset.feedback;
    const label = document.getElementById('feedback-label');

    // Toggle: deselect if already selected, otherwise select this one
    const wasSelected = btn.classList.contains('selected');
    document.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));

    if (!wasSelected) {
      btn.classList.add('selected');
      label.textContent = feedback === 'like' ? 'More like this' : 'Less of this';

      // Save feedback with current context
      state.preferences.feedback.push({
        ts: Date.now(),
        feedback,
        ctx: state.context ? { ...state.context.state } : null
      });
      if (state.preferences.feedback.length > 200) state.preferences.feedback.shift();
      savePreferences();

      // Feed into learning engine with full musical state + extended context
      if (state.learning && state.music && state.music.brain) {
        state.learning.recordFeedback(
          feedback,
          state.music.brain.currentState,
          state.context ? state.context.state : null,
          {
            timbre: (state.music.melody ? state.music.melody.timbre : 'ambient'),
            bpm: (state.music.phrase ? state.music.phrase.bpm : null),
            beatsActive: (state.music._beatsActive || false)
          }
        );
      }

      // Log to journal
      journal.recordFeedback(feedback, state.context ? state.context.state : {});
      updateJournalUI();

      // Reset after 3s
      setTimeout(() => {
        document.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
        label.textContent = 'How does this feel?';
      }, 3000);
    } else {
      label.textContent = 'How does this feel?';
    }
  });
});

/* ── Beats Toggle (OFF by default) ── */
let beatsUserOn = false;
let activeBeatType = null; // null = adaptive mode, string = manual beat type

document.getElementById('btn-beats-toggle').addEventListener('click', () => {
  const btn = document.getElementById('btn-beats-toggle');
  const label = document.getElementById('beats-toggle-label');
  beatsUserOn = !beatsUserOn;
  btn.classList.toggle('active', beatsUserOn);
  label.textContent = beatsUserOn ? 'Beats: Adaptive' : 'Beats: Off';

  if (state.music && state.music.setBeatsEnabled) {
    state.music.setBeatsEnabled(beatsUserOn);
  }

  // If turning adaptive back on, clear any manual beat type selection
  if (beatsUserOn && activeBeatType) {
    document.querySelectorAll('.drawer-chip[data-beat]').forEach(c => c.classList.remove('active'));
    activeBeatType = null;
  }

  // Show/hide beats volume in mix panel
  const mixBeats = document.getElementById('mix-beats');
  if (mixBeats) mixBeats.classList.toggle('hidden', !beatsUserOn && !(state.music && state.music._beatsActive));
});

// Periodically sync beats UI state (for auto-triggered beats from movement)
setInterval(() => {
  if (!state.music) return;
  const mixBeats = document.getElementById('mix-beats');
  if (mixBeats) {
    const shouldShow = beatsUserOn || activeBeatType || state.music._beatsActive;
    if (shouldShow && mixBeats.classList.contains('hidden')) mixBeats.classList.remove('hidden');
    else if (!shouldShow && !mixBeats.classList.contains('hidden')) mixBeats.classList.add('hidden');
  }
}, 2000);

/* ── Beat Type Selection (in Layers drawer) ── */
document.querySelectorAll('.drawer-chip[data-beat]').forEach(chip => {
  chip.addEventListener('click', () => {
    const type = chip.dataset.beat;
    if (chip.classList.contains('active')) {
      // Deselect — turn beat type off, revert to adaptive if toggle is on
      chip.classList.remove('active');
      activeBeatType = null;
      if (state.music && state.music.setBeatsEnabled) {
        if (beatsUserOn) {
          state.music.setBeatsEnabled(true);
        } else {
          state.music.setBeatsEnabled(false);
        }
      }
    } else {
      // Select a beat type — auto-disable adaptive mode
      document.querySelectorAll('.drawer-chip[data-beat]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeBeatType = type;

      // Turn off adaptive toggle (avoid conflicts)
      if (beatsUserOn) {
        beatsUserOn = false;
        const btn = document.getElementById('btn-beats-toggle');
        const label = document.getElementById('beats-toggle-label');
        btn.classList.remove('active');
        label.textContent = 'Beats: Off';
      }

      // Activate the selected beat type — start immediately
      if (state.music && state.music.beats) {
        state.music.beats.setBeatType(type);
        state.music.startBeatsNow(0.6);
      }

      // Show beats volume in mix panel
      const mixBeats = document.getElementById('mix-beats');
      if (mixBeats) mixBeats.classList.remove('hidden');
    }
  });
});

/* ── Layers Drawer ── */
const activeLayers = new Set();
const MAX_LAYERS = 3;

document.getElementById('btn-layers-toggle').addEventListener('click', () => {
  const drawer = document.getElementById('layer-drawer');
  const btn = document.getElementById('btn-layers-toggle');
  const isHidden = drawer.classList.toggle('hidden');
  btn.classList.toggle('active', !isHidden);
  // Close mix if open
  if (!isHidden) {
    document.getElementById('mix-panel').classList.add('hidden');
    document.getElementById('btn-mix-toggle').classList.remove('active');
  }
});

document.getElementById('btn-drawer-close').addEventListener('click', () => {
  document.getElementById('layer-drawer').classList.add('hidden');
  document.getElementById('btn-layers-toggle').classList.remove('active');
});

// Ambience chips
document.querySelectorAll('.drawer-chip[data-ambience]').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.ambience;
    if (chip.classList.contains('active')) {
      chip.classList.remove('active');
      activeLayers.delete('amb-' + key);
      if (state.layers) state.layers.toggle(key);
    } else {
      if (activeLayers.size >= MAX_LAYERS) return;
      chip.classList.add('active');
      activeLayers.add('amb-' + key);
      if (state.layers) state.layers.toggle(key);
    }
    updateLayerCount();
    updateMixVisibility();
  });
});

// Meditation chips
document.querySelectorAll('.drawer-chip[data-layer]').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.layer;
    if (chip.classList.contains('active')) {
      chip.classList.remove('active');
      activeLayers.delete('med-' + key);
      if (state.layers) state.layers.toggle(key);
      if (key === 'binaural') document.getElementById('freq-binaural').classList.add('hidden');
      if (key === 'isochronic') document.getElementById('freq-isochronic').classList.add('hidden');
    } else {
      if (activeLayers.size >= MAX_LAYERS) return;
      chip.classList.add('active');
      activeLayers.add('med-' + key);
      if (state.layers) state.layers.toggle(key);
      if (key === 'binaural') document.getElementById('freq-binaural').classList.remove('hidden');
      if (key === 'isochronic') document.getElementById('freq-isochronic').classList.remove('hidden');
    }
    updateLayerCount();
    updateMixVisibility();
  });
});

// Frequency selectors (binaural/isochronic wave types)
document.querySelectorAll('.freq-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const freq = btn.dataset.freq;
    document.querySelectorAll(`.freq-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (state.layers) {
      if (target === 'binaural') state.layers.setBinauralFreq(freq);
      if (target === 'isochronic') state.layers.setIsochronicFreq(freq);
    }
  });
});

function updateLayerCount() {
  const hint = document.querySelector('.drawer-hint');
  if (hint) {
    if (activeLayers.size >= MAX_LAYERS) {
      hint.textContent = 'Maximum layers reached';
      hint.style.color = 'var(--warm)';
    } else {
      hint.textContent = 'Up to 3 layers for the best experience';
      hint.style.color = '';
    }
  }
}

function updateMixVisibility() {
  const hasAmbience = [...activeLayers].some(l => l.startsWith('amb-'));
  const hasMeditation = [...activeLayers].some(l => l.startsWith('med-'));
  const mixAmb = document.getElementById('mix-ambience');
  const mixLay = document.getElementById('mix-layers');
  if (mixAmb) mixAmb.classList.toggle('hidden', !hasAmbience);
  if (mixLay) mixLay.classList.toggle('hidden', !hasMeditation);
}

/* ── Mix Panel ── */
document.getElementById('btn-mix-toggle').addEventListener('click', () => {
  const panel = document.getElementById('mix-panel');
  const btn = document.getElementById('btn-mix-toggle');
  const isHidden = panel.classList.toggle('hidden');
  btn.classList.toggle('active', !isHidden);
  // Close layers if open
  if (!isHidden) {
    document.getElementById('layer-drawer').classList.add('hidden');
    document.getElementById('btn-layers-toggle').classList.remove('active');
  }
});

// Music volume
document.getElementById('music-volume').addEventListener('input', (e) => {
  const vol = e.target.value / 100;
  if (state.core && state.core.musicBus) {
    state.core.musicBus.gain.setTargetAtTime(vol, state.core.ctx.currentTime, 0.3);
  }
});

// Ambience volume
document.getElementById('ambience-volume').addEventListener('input', (e) => {
  const vol = e.target.value / 100;
  if (state.core && state.core.ambienceBus) {
    state.core.ambienceBus.gain.setTargetAtTime(vol, state.core.ctx.currentTime, 0.3);
  }
});

// Layers volume
document.getElementById('layers-volume').addEventListener('input', (e) => {
  const vol = e.target.value / 100;
  if (state.core && state.core.layersBus) {
    state.core.layersBus.gain.setTargetAtTime(vol, state.core.ctx.currentTime, 0.3);
  }
});

// Beats volume
document.getElementById('beats-volume').addEventListener('input', (e) => {
  const vol = e.target.value / 100;
  if (state.music && state.music._beatsBus) {
    state.music._beatsBus.gain.setTargetAtTime(vol, state.music.ctx.currentTime, 0.3);
  }
});

/* ── Context-Based Recommendations ── */
const LAYER_RECS = {
  // timeOfDay
  morning: ['forest', 'alpha'],
  lateMorning: ['ocean', 'alpha'],
  afternoon: ['forest', 'alpha'],
  evening: ['fireplace', 'theta', 'singing-bowls'],
  night: ['fireplace', 'delta', 'heartbeat'],
  lateNight: ['delta', 'heartbeat'],
  // weather
  rain: ['heavy-rain'],
  storm: ['heavy-rain', 'theta'],
  snow: ['fireplace', 'theta'],
  fog: ['singing-bowls', 'theta'],
  // movement
  walking: ['forest', 'alpha'],
  active: ['beta', 'mountain'],
  // season
  spring: ['ocean', 'forest'],
  summer: ['ocean', 'forest'],
  autumn: ['fireplace', 'wind-chimes'],
  winter: ['fireplace', 'singing-bowls']
};

const REC_LABELS = {
  ocean: 'Ocean Waves', 'heavy-rain': 'Light Rain', forest: 'Calm Forest',
  stream: 'Gentle Stream', fireplace: 'Fireplace', crickets: 'Night Crickets',
  meadow: 'Windy Meadow', mountain: 'Mountain Breeze',
  delta: 'Binaural — Delta', theta: 'Binaural — Theta',
  alpha: 'Binaural — Alpha', beta: 'Binaural — Beta',
  'singing-bowls': 'Tibetan Bowls', heartbeat: 'Heartbeat',
  'wind-chimes': 'Wind Chimes', gong: 'Deep Gong'
};

function updateRecommendations(ctx) {
  const recSet = new Set();
  // Gather recommendations from context
  const keys = [ctx.timeOfDay, ctx.weather, ctx.movement, ctx.season];
  keys.forEach(k => {
    const recs = LAYER_RECS[k];
    if (recs) recs.forEach(r => recSet.add(r));
  });
  // Don't remove active layers from suggestions — show them as toggleable
  const container = document.getElementById('rec-chips');
  const wrapper = document.getElementById('recommendations');
  if (!container || !wrapper) return;

  if (recSet.size === 0) {
    wrapper.classList.add('hidden');
    return;
  }

  // Show top 3 recommendations (include active ones so they can be toggled off)
  const recs = [...recSet].slice(0, 3);
  container.innerHTML = recs.map(r => {
    // Check if this layer is currently active
    const isActive = activeLayers.has('amb-' + r) || activeLayers.has('med-' + r);
    return `<button class="rec-chip${isActive ? ' active' : ''}" data-rec="${r}">${REC_LABELS[r] || r}</button>`;
  }).join('');
  wrapper.classList.remove('hidden');

  // Click to TOGGLE (activate or deactivate)
  container.querySelectorAll('.rec-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const rec = chip.dataset.rec;
      // Find matching drawer chip and click it (drawer chips already handle toggle)
      const ambChip = document.querySelector(`.drawer-chip[data-ambience="${rec}"]`);
      const layChip = document.querySelector(`.drawer-chip[data-layer="${rec}"]`);
      if (ambChip) {
        ambChip.click(); // drawer chip handles toggle (on→off or off→on)
      } else if (layChip) {
        layChip.click();
      } else if (['delta','theta','alpha','beta'].includes(rec)) {
        // For frequency recs: toggle binaural
        const binChip = document.querySelector('.drawer-chip[data-layer="binaural"]');
        if (binChip) binChip.click();
        const freqBtn = document.querySelector(`.freq-btn[data-target="binaural"][data-freq="${rec}"]`);
        if (freqBtn) freqBtn.click();
      }
      // Refresh recommendations (updates active state of chips)
      if (state.context) updateRecommendations(state.context.state);
    });
  });
}

/* ── Mute Button ── */
let muted = false;
let preMuteVolume = 0.7;

document.getElementById('btn-mute').addEventListener('click', () => {
  const btn = document.getElementById('btn-mute');
  const label = document.getElementById('mute-label');
  const icon = document.getElementById('mute-icon');

  muted = !muted;
  btn.classList.toggle('active', muted);
  label.textContent = muted ? 'Unmute' : 'Mute';

  if (muted) {
    preMuteVolume = state.volume;
    if (state.core) state.core.setMasterVolume(0);
    // Muted icon (speaker with X)
    icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else {
    state.volume = preMuteVolume;
    if (state.core) state.core.setMasterVolume(state.volume);
    // Unmuted icon (speaker with waves)
    icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/>';
  }
  // Sync volume slider
  document.getElementById('master-volume').value = muted ? 0 : Math.round(state.volume * 100);
});

/* ── Mood Journal UI ── */
const _jBtn = document.getElementById('btn-journal');
const _jPanel = document.getElementById('journal-panel');
if (_jBtn && _jPanel) {
  _jBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _jPanel.classList.toggle('hidden');
    if (!_jPanel.classList.contains('hidden')) updateJournalUI();
  });
} else {
  console.warn('[Journal] Button or panel not found', !!_jBtn, !!_jPanel);
}

document.getElementById('btn-journal-close').addEventListener('click', () => {
  document.getElementById('journal-panel').classList.add('hidden');
});

function updateJournalUI() {
  // Stats
  document.getElementById('j-streak').textContent = journal.getStreak();
  document.getElementById('j-sessions').textContent = journal.getTotalSessions();
  document.getElementById('j-minutes').textContent = journal.getTotalMinutes();

  // Weekly chart
  const days = journal.getRecentDays(7);
  const maxMin = Math.max(1, ...days.map(d => d.minutes));
  const chart = document.getElementById('j-chart');
  chart.innerHTML = days.map(d => {
    const h = Math.max(2, (d.minutes / maxMin) * 50);
    let barClass = 'chart-bar';
    if (d.minutes > 0 && d.moodScore > 0.2) barClass += ' positive';
    else if (d.minutes > 0 && d.moodScore < -0.2) barClass += ' negative';
    else if (d.minutes > 0) barClass += ' active';
    const today = new Date().toISOString().split('T')[0];
    const isToday = d.date === today;
    return `<div class="chart-day">
      <div class="${barClass}" style="height:${h}px"></div>
      <span class="chart-day-label">${isToday ? 'Today' : d.dayLabel}</span>
    </div>`;
  }).join('');

  // Top contexts
  const ctxEl = document.getElementById('j-contexts');
  const topTimes = journal.getTopContexts('timeOfDay', 3);
  const topWeather = journal.getTopContexts('weather', 2);
  const tags = [...topTimes, ...topWeather]
    .filter(t => t.name && t.name !== 'clear')
    .map(t => `<span class="ctx-tag">${t.name} (${t.count})</span>`);
  ctxEl.innerHTML = tags.length ? tags.join('') : '<span class="ctx-tag">Start listening to build your journey</span>';
}

/* ── Background Canvas (subtle ambient glow) ── */
function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Very subtle animated gradient glow
  let hue = 240;
  function draw() {
    requestAnimationFrame(draw);
    hue += 0.02;
    if (hue > 360) hue -= 360;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.6
    );
    grad.addColorStop(0, `hsla(${hue}, 40%, 12%, 0.15)`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

/* ═══ MICROPHONE ENGINE: Voice Mood + Humming Harmonize ═══ */

// Voice mood button — speak your mood instead of typing
document.getElementById('btn-voice-mood').addEventListener('click', async () => {
  if (!state.core) return;

  // Init mic on first use
  if (!state.mic) {
    state.mic = new KalmaMic(state.core.ctx);

    // When speech recognition returns a mood string, feed it into sendPrompt
    state.mic.on('mood', (data) => {
      const input = document.getElementById('mood-prompt');
      input.value = data.text;
      sendPrompt();
    });

    // Status updates for UI feedback
    state.mic.on('status', (s) => {
      const btn = document.getElementById('btn-voice-mood');
      const statusEl = document.getElementById('player-status');
      switch (s.type) {
        case 'listening':
          btn.classList.add('active');
          if (statusEl) statusEl.textContent = 'Listening...';
          break;
        case 'interim':
          if (statusEl) statusEl.textContent = '"' + s.text + '"...';
          break;
        case 'result':
        case 'idle':
        case 'no-speech':
          btn.classList.remove('active');
          break;
        case 'unsupported':
          if (statusEl) statusEl.textContent = 'Voice not supported in this browser';
          setTimeout(() => {
            if (state.playing && state.context) statusEl.textContent = buildStatusText(state.context.state);
          }, 4000);
          break;
      }
    });

    await state.mic.init();
  }

  // Toggle listening
  if (state.mic.isListening) {
    state.mic.stopVoiceInput();
  } else {
    if (!state.mic.active) await state.mic.init();
    state.mic.startVoiceInput();
  }
});


// Harmonize + Light features removed — code preserved in engine-adaptive.js.bak


/* ── Init ── */
initBgCanvas();
startFlow();
