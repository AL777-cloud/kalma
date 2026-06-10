/* Kálma Chat — Atmosphere Engine
   Three visual systems that make the chat feel alive:
   1. Mood gradient background — shifts color with musical mood
   2. Music-reactive bubble glow — Kálma's messages pulse with audio
   3. Time-aware color theme — palette shifts with time of day

   Connects to: AdaptiveEngine analyser, mood state, system clock.
   All transitions are very slow (2-8s) — felt, not seen. */

(function() {
  'use strict';

  // ── Mood → Color mapping ──
  // Each mood gets a pair of muted, dark gradient colors
  // These tint the background very subtly — never bright, never saturated
  const MOOD_COLORS = {
    // Calm / peaceful
    calm:       { from: [12, 18, 35],  to: [8, 14, 28]   },  // deep navy
    peaceful:   { from: [12, 18, 35],  to: [8, 14, 28]   },
    serene:     { from: [12, 18, 35],  to: [8, 14, 28]   },

    // Sad / melancholy
    sad:        { from: [15, 12, 28],  to: [10, 8, 22]   },  // muted indigo
    melancholy: { from: [18, 14, 30],  to: [12, 10, 24]  },
    lonely:     { from: [16, 12, 28],  to: [10, 8, 22]   },
    nostalgic:  { from: [22, 16, 28],  to: [15, 11, 22]  },  // warm purple

    // Dark / tense
    dark:       { from: [10, 8, 16],   to: [6, 5, 12]    },  // near black with purple
    tense:      { from: [18, 10, 14],  to: [12, 7, 10]   },  // dark wine
    anxious:    { from: [16, 10, 18],  to: [11, 7, 13]   },
    despair:    { from: [10, 8, 14],   to: [6, 5, 10]    },

    // Happy / energetic
    happy:      { from: [20, 18, 12],  to: [14, 13, 8]   },  // warm gold
    energetic:  { from: [22, 14, 12],  to: [16, 10, 8]   },  // warm amber
    bright:     { from: [18, 18, 14],  to: [13, 13, 10]  },
    grateful:   { from: [16, 20, 16],  to: [11, 14, 11]  },  // soft sage

    // Mysterious / dreamy
    mysterious: { from: [14, 10, 24],  to: [9, 7, 18]    },  // deep violet
    sleepy:     { from: [10, 12, 22],  to: [7, 8, 16]    },  // midnight blue
    dreamy:     { from: [14, 12, 26],  to: [9, 8, 20]    },

    // Neutral / default
    neutral:    { from: [10, 10, 18],  to: [7, 7, 14]    },  // base dark
    confused:   { from: [12, 12, 18],  to: [8, 8, 14]    },
    hopeful:    { from: [14, 16, 22],  to: [10, 12, 16]  },  // soft steel blue
    angry:      { from: [20, 10, 10],  to: [14, 7, 7]    },  // dark crimson
  };

  // ── Time of day → tint overlay ──
  // Shifts the entire palette warmer/cooler based on hour
  const TIME_TINTS = {
    lateNight:   { r: -2, g: -2, b: 4,  warmth: 0   },  // cooler, bluer
    earlyMorning:{ r: 2,  g: 1,  b: -1, warmth: 0.3 },  // hint of gold
    morning:     { r: 4,  g: 3,  b: -2, warmth: 0.5 },  // warm golden
    afternoon:   { r: 2,  g: 2,  b: 0,  warmth: 0.2 },  // neutral warm
    evening:     { r: 3,  g: 0,  b: -1, warmth: 0.4 },  // amber
    night:       { r: -1, g: -1, b: 3,  warmth: 0   },  // cool blue
  };

  // ── State ──
  let currentMood = 'neutral';
  let currentColors = { from: [10, 10, 18], to: [7, 7, 14] };
  let targetColors = { from: [10, 10, 18], to: [7, 7, 14] };
  let analyser = null;
  let analyserData = null;
  let animId = null;
  let glowIntensity = 0;
  let timeTint = TIME_TINTS.night;

  // ── DOM — apply gradient directly to body (overrides --bg-deep) ──
  const bgTarget = document.body;

  // ── Public: set mood ──
  window.KalmaAtmosphere = {
    setMood(mood) {
      if (mood === currentMood) return;
      currentMood = mood;
      const colors = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
      targetColors = {
        from: [...colors.from],
        to: [...colors.to]
      };
      console.log('[Atmosphere] Mood →', mood);
    },

    connectAnalyser(node) {
      analyser = node;
      analyserData = new Uint8Array(node.frequencyBinCount);
    },

    start() {
      updateTimeTint();
      // Update time tint every 5 minutes
      setInterval(updateTimeTint, 5 * 60 * 1000);
      animate();
    },

    stop() {
      if (animId) cancelAnimationFrame(animId);
      animId = null;
    }
  };

  // ── Time tint ──
  function updateTimeTint() {
    const hour = new Date().getHours();
    let period;
    if (hour >= 1 && hour < 5)        period = 'lateNight';
    else if (hour >= 5 && hour < 7)   period = 'earlyMorning';
    else if (hour >= 7 && hour < 12)  period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 21) period = 'evening';
    else                               period = 'night';

    timeTint = TIME_TINTS[period];
    console.log('[Atmosphere] Time period →', period);
  }

  // ── Color interpolation ──
  function lerpColor(current, target, speed) {
    return current.map((c, i) => c + (target[i] - c) * speed);
  }

  function applyTimeTint(rgb) {
    return [
      Math.max(0, Math.min(40, rgb[0] + timeTint.r)),
      Math.max(0, Math.min(40, rgb[1] + timeTint.g)),
      Math.max(0, Math.min(40, rgb[2] + timeTint.b)),
    ];
  }

  // ── Audio energy (for bubble glow) ──
  function getAudioEnergy() {
    if (!analyser || !analyserData) return 0;
    analyser.getByteFrequencyData(analyserData);
    // Average of low-mid frequencies (warmer, more musical range)
    let sum = 0;
    const count = Math.min(32, analyserData.length);
    for (let i = 0; i < count; i++) {
      sum += analyserData[i];
    }
    return sum / (count * 255); // 0-1
  }

  // ── Animation loop ──
  function animate() {
    // 1. Interpolate background colors toward target (very slow — 0.008 per frame)
    currentColors.from = lerpColor(currentColors.from, targetColors.from, 0.008);
    currentColors.to = lerpColor(currentColors.to, targetColors.to, 0.008);

    // Apply time tint
    const fromTinted = applyTimeTint(currentColors.from);
    const toTinted = applyTimeTint(currentColors.to);

    // Render gradient
    const fromStr = `rgb(${Math.round(fromTinted[0])}, ${Math.round(fromTinted[1])}, ${Math.round(fromTinted[2])})`;
    const toStr = `rgb(${Math.round(toTinted[0])}, ${Math.round(toTinted[1])}, ${Math.round(toTinted[2])})`;
    bgTarget.style.background = `radial-gradient(ellipse at 50% 40%, ${fromStr} 0%, ${toStr} 100%)`;

    // 2. Audio energy for bubble glow
    const energy = getAudioEnergy();
    // Smooth the glow (fast rise, slow fall)
    if (energy > glowIntensity) {
      glowIntensity += (energy - glowIntensity) * 0.15;
    } else {
      glowIntensity += (energy - glowIntensity) * 0.03;
    }

    // Apply glow to Kálma bubbles via CSS custom property
    const glowAlpha = (0.03 + glowIntensity * 0.12).toFixed(3);
    const glowSpread = (2 + glowIntensity * 12).toFixed(1);
    document.documentElement.style.setProperty('--kalma-glow-alpha', glowAlpha);
    document.documentElement.style.setProperty('--kalma-glow-spread', glowSpread + 'px');

    // Also set a mood-colored glow
    const glowColor = currentColors.from.map(c => Math.min(255, c * 8 + 80));
    document.documentElement.style.setProperty('--kalma-glow-color',
      `${Math.round(glowColor[0])}, ${Math.round(glowColor[1])}, ${Math.round(glowColor[2])}`
    );

    animId = requestAnimationFrame(animate);
  }

})();
