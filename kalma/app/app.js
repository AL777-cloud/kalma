/* Kálma — App Controller */

const state = {
  intent: null,
  meditationLayers: new Set(),
  ambienceLayers: new Set(),
  binauralFreq: 'delta',
  isochronicFreq: 'theta',
  voiceOn: false,
  guidanceStyle: null,
  introspectionTheme: null,
  playing: false,
  timer: 0,
  engine: null,
  voice: null,
  scriptLoaded: false
};

// Script file map
const guidanceScripts = {
  gentle: './scripts/gentle-meditation.json',
  motivational: './scripts/motivational.json',
  reframing: './scripts/reframing.json',
  reflective: './scripts/reflective.json',
  gratitude: './scripts/gratitude.json',
  bodyscan: './scripts/bodyscan.json',
  breathwork: './scripts/breathwork.json'
};

const introspectionScripts = {
  'calm-reflection': './scripts/theme-calm-reflection.json',
  'cognitive-reframing': './scripts/theme-cognitive-reframing.json',
  'emotional-release': './scripts/theme-emotional-release.json',
  'self-compassion': './scripts/theme-self-compassion.json',
  'future-visioning': './scripts/theme-future-visioning.json',
  'inner-dialogue': './scripts/theme-inner-dialogue.json',
  'letting-go': './scripts/theme-letting-go.json'
};

// Intents that show the guidance screen
const guidanceIntents = ['meditate'];
// Intents that also show introspection themes
const introspectionIntents = ['introspection'];

const intentLabels = {
  unwind: 'Unwind & Relax',
  uplift: 'Uplift My Mood',
  sleep: 'Help Me Sleep',
  reading: 'Reading Mood',
  meditate: 'Meditate',
  work: 'Work Focus',
  introspection: 'Introspection',
  reset: 'Reset & Start Fresh',
  clarity: 'Find Clarity',
  gratitude: 'Practice Gratitude',
  creative: 'Creative Flow',
  pain: 'Pain Relief'
};

const intentFrequency = {
  unwind: 'alpha',
  uplift: 'alpha',
  sleep: 'delta',
  reading: 'alpha',
  meditate: 'theta',
  introspection: 'theta',
  reset: 'alpha',
  clarity: 'beta',
  gratitude: 'theta',
  creative: 'theta',
  work: 'beta',
  pain: 'delta'
};

const statusMessages = [
  'Breathe', 'Let go', 'Be here now', 'You are enough',
  'Just listen', 'Softly', 'You are safe', 'Let it flow'
];

// ── Screen Navigation ──

function showScreen(id) {
  const current = document.querySelector('.screen.active');
  const next = document.getElementById(id);
  if (current === next) return;

  // Play fade out sound as current screen dissolves (skip for player — begin journey sound handles it)
  if (current && id !== 'screen-player') uiSound.fadeOut();

  // Stop all UI sounds when entering the player — player starts silent
  if (id === 'screen-player' || id === 'screen-prejourney') {
    uiSound.stopWelcomeDrone();
    // Force silence after a moment
    setTimeout(() => {
      if (uiSound.ctx && !state.playing) {
        uiSound.master.gain.setTargetAtTime(0, uiSound.ctx.currentTime, 0.3);
      }
    }, 200);
  } else {
    // Restore UI sound volume for non-player screens
    if (uiSound.master) {
      uiSound.master.gain.setTargetAtTime(0.4, uiSound.ctx.currentTime, 0.1);
    }
  }

  // Fade out current screen
  if (current) {
    current.style.filter = 'blur(3px)';
    current.style.opacity = '0';
    current.style.transform = 'scale(0.96)';
    setTimeout(() => {
      current.classList.remove('active');
      current.style.filter = '';
      current.style.opacity = '';
      current.style.transform = '';
    }, 600);
  }

  // Bring in next screen with a slight delay
  setTimeout(() => {
    // Block pointer events briefly to prevent tap bleed-through on iOS
    next.style.pointerEvents = 'none';
    next.classList.add('active');
    if (current && id !== 'screen-player') uiSound.transition();
    setTimeout(() => { next.style.pointerEvents = ''; }, 600);
  }, current ? 400 : 0);
}

// ── Welcome Screen ──

// Unlock audio on mobile — iOS and Android require user gesture for audio
// Pre-create audio contexts on first touch anywhere
document.addEventListener('touchstart', function unlockMobileAudio() {
  if (uiSound.ctx && uiSound.ctx.state === 'suspended') uiSound.ctx.resume();
  if (state._radioCtx && state._radioCtx.state === 'suspended') state._radioCtx.resume();
  if (kalmaViz._radioCtx && kalmaViz._radioCtx.state === 'suspended') kalmaViz._radioCtx.resume();
  document.removeEventListener('touchstart', unlockMobileAudio);
}, { once: true });

// Splash screen — tap to enter + unlock audio
document.getElementById('splash-tap').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Init and start audio immediately on this user gesture
  uiSound.init();
  if (uiSound.ctx.state === 'suspended') uiSound.ctx.resume();
  uiSound.preloadBeginJourney();
  uiSound.startWelcomeDrone();
  uiSound.transition();

  // First visit → onboarding, returning → welcome
  const hasOnboarded = localStorage.getItem('kalma-onboarded');
  if (!hasOnboarded) {
    showScreen('screen-onboard');
  } else {
    _goToWelcome();
  }
});

function _goToWelcome() {
  const intentGrid = document.querySelector('.intent-grid');
  intentGrid.style.pointerEvents = 'none';
  intentGrid.style.opacity = '0';
  intentGrid.style.transition = 'none';
  showScreen('screen-welcome');
  setTimeout(() => {
    intentGrid.style.transition = 'opacity 1.2s ease';
    intentGrid.style.opacity = '1';
  }, 1200);
  setTimeout(() => {
    intentGrid.style.pointerEvents = '';
  }, 2500);
}

// ── Onboarding ──
let _onboardSlide = 0;

document.getElementById('btn-onboard-next').addEventListener('click', () => {
  uiSound.click();
  const slides = document.querySelectorAll('.onboard-slide');
  const dots = document.querySelectorAll('.onboard-dot');
  const btn = document.getElementById('btn-onboard-next');

  // Exit current
  slides[_onboardSlide].classList.remove('active');
  slides[_onboardSlide].classList.add('exit');
  dots[_onboardSlide].classList.remove('active');

  _onboardSlide++;

  if (_onboardSlide >= slides.length) {
    // Done — go to welcome
    localStorage.setItem('kalma-onboarded', '1');
    _goToWelcome();
    return;
  }

  // Show next
  slides[_onboardSlide].classList.add('active');
  dots[_onboardSlide].classList.add('active');

  // Change button text on last slide
  if (_onboardSlide === slides.length - 1) {
    btn.textContent = 'Get Started';
  }
});

document.getElementById('btn-onboard-skip').addEventListener('click', () => {
  uiSound.click();
  localStorage.setItem('kalma-onboarded', '1');
  _goToWelcome();
});

document.querySelectorAll('.intent-btn').forEach(btn => {
  btn.addEventListener('mouseenter', () => {
    uiSound.hover();
  });
  btn.addEventListener('click', () => {
    uiSound.click();
    state.intent = btn.dataset.intent;
    document.getElementById('selected-intent-text').textContent = intentLabels[state.intent] || state.intent;
    const suggested = intentFrequency[state.intent];
    if (suggested) {
      state.binauralFreq = suggested;
      state.isochronicFreq = suggested;
      document.querySelectorAll('.freq-btn').forEach(f => f.classList.toggle('active', f.dataset.freq === suggested));
    }
    updateBackgroundMood(state.intent);
    // Show sleep recommendation if Help Me Sleep selected
    const showRec = state.intent === 'sleep' || state.intent === 'pain';
    document.getElementById('sleep-recommendation').classList.toggle('hidden', !showRec);
    if (state.intent === 'pain') {
      document.getElementById('recommendation-text').innerHTML = 'For pain relief, try adding <strong>Binaural Beats</strong> or <strong>Isochronic Tones</strong>. Research shows <strong>40 Hz gamma</strong> frequencies can help reduce pain perception.';
    } else if (state.intent === 'sleep') {
      document.getElementById('recommendation-text').innerHTML = 'For better sleep results, try adding <strong>Binaural Beats</strong> or <strong>Isochronic Tones</strong> with <strong>Delta</strong> frequency';
    }
    // Reset all layer selections for fresh start
    state.meditationLayers.clear();
    state.ambienceLayers.clear();
    // Skip layers screen — go straight to guidance or prejourney
    const guidanceIntentsWelcome = ['meditate'];
    setTimeout(() => {
      if (guidanceIntentsWelcome.includes(state.intent)) {
        showScreen('screen-guidance');
      } else {
        goToPromptScreen();
      }
    }, 50);
    document.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active', 'limit-reached'));
    document.querySelectorAll('.info-content').forEach(c => c.classList.add('hidden'));
    const infoPanel = document.querySelector('.info-panel');
    if (infoPanel) infoPanel.classList.remove('active');
    const placeholder = document.getElementById('info-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');
    document.getElementById('layers-right').classList.remove('show-mobile');
    // Reset skip buttons
    document.querySelectorAll('.layer-skip-btn').forEach(s => {
      s.classList.remove('skipped');
      s.textContent = 'Skip';
    });
    // Un-dim sections
    const medLayers = document.getElementById('meditation-layers');
    const ambLayers = document.getElementById('ambience-layers');
    const freqSel = document.getElementById('freq-selector');
    if (medLayers) medLayers.classList.remove('dimmed');
    if (ambLayers) ambLayers.classList.remove('dimmed');
    if (freqSel) freqSel.classList.remove('dimmed');
    // Reset limit hints
    const mHint = document.getElementById('meditation-limit-hint');
    const aHint = document.getElementById('ambience-limit-hint');
    if (mHint) { mHint.classList.add('hidden'); mHint.style.display = ''; }
    if (aHint) { aHint.classList.add('hidden'); aHint.style.display = ''; }
    meditationTouched = false;
    ambienceTouched = false;
    updateContinueButton();
    // screen-layers removed from flow — navigation handled above via setTimeout
  });
});

// ── Layers Screen ──

// ── Meditation Layer Science Info ──

const layerInfo = {
  binaural: {
    title: 'Binaural Beats',
    benefit: 'Helps with: Deep focus, relaxation, better sleep',
    text: 'Each ear hears a slightly different tone, and your brain creates a gentle "pulse" from the difference. This pulse gently guides your brainwaves toward calm, focused, or sleepy states — depending on the frequency you choose. Think of it as a tuning fork for your mind.',
    tip: 'Requires headphones to work.',
    source: 'Chaieb et al., Psychological Research, 2015'
  },
  isochronic: {
    title: 'Isochronic Tones',
    benefit: 'Helps with: Mental clarity, focus, brainwave training',
    text: 'Rhythmic pulses of sound that switch on and off at a steady beat. Your brain naturally syncs to the rhythm, helping shift your mental state. Works through speakers — no headphones needed. Many people find these easier to feel than binaural beats.',
    tip: 'Works with or without headphones.',
    source: 'Huang & Charyton, Alternative Therapies, 2008'
  },
  'singing-bowls': {
    title: 'Tibetan Singing Bowls',
    benefit: 'Helps with: Stress relief, emotional balance, deep relaxation',
    text: 'The rich, layered tones of singing bowls wash over you like a sound bath. Studies show they significantly reduce tension, anger, and fatigue after just one session. The overlapping vibrations activate both sides of your brain, creating a deep sense of wholeness.',
    tip: 'Great for beginners — just close your eyes and listen.',
    source: 'Goldsby et al., Journal of Evidence-Based Complementary Medicine, 2017'
  },
  whale: {
    title: 'Whale Sounds',
    benefit: 'Helps with: Deep calm, slowing down, connecting with nature',
    text: 'Whale songs use very low frequencies that overlap with your brain\'s natural relaxation waves. Hearing them activates your body\'s "rest and recover" mode, slowing your heart rate and easing tension. Their long, flowing calls also naturally encourage slower, deeper breathing.',
    tip: 'Best experienced at low-to-medium volume.',
    source: 'Alvarsson et al., Int. Journal of Environmental Research, 2010'
  },
  heartbeat: {
    title: 'Heartbeat Pulse',
    benefit: 'Helps with: Anxiety, grounding, falling asleep',
    text: 'A gentle 60 BPM pulse that mimics a calm resting heartbeat. Your body naturally wants to sync with it, gradually slowing your own heart rate and calming your nervous system. It\'s the same reason babies relax when held against a parent\'s chest — deeply instinctive and soothing.',
    tip: 'Pairs well with deep breathing.',
    source: 'Bernardi et al., Circulation, 2006'
  },
  'wind-chimes': {
    title: 'Wind Chimes',
    benefit: 'Helps with: Present-moment awareness, gentle alertness',
    text: 'Soft, random chime notes keep your mind gently engaged without creating a pattern to analyze. This encourages an open, aware state — present but not thinking too hard. Sound therapists use chimes to "reset" attention and bring you back to the here and now.',
    tip: 'Nice for reading or creative work too.',
    source: 'Leeds, The Power of Sound, 2010'
  },
  gong: {
    title: 'Deep Gong',
    benefit: 'Helps with: Letting go, emotional release, deep meditation',
    text: 'A gong sends out a massive wash of sound — from deep rumbles to shimmering highs — all at once. This "sound flood" overwhelms the busy, analytical part of your brain, making it easier to simply... let go. People often describe gong baths as one of the most powerful relaxation experiences.',
    tip: 'Allow yourself to surrender to the sound.',
    source: 'Goldsby et al., Journal of Evidence-Based Complementary Medicine, 2017'
  },
  flute: {
    title: 'Soft Flute',
    benefit: 'Helps with: Gentle relaxation, reducing stress hormones',
    text: 'Flute tones are pure and simple, requiring very little effort for your brain to process. This gives your mind permission to rest while staying softly engaged. Research shows that gentle wind instruments are especially good at lowering cortisol, your body\'s main stress hormone.',
    tip: 'Lovely as a subtle background layer.',
    source: 'Nilsson, European Journal of Cardiovascular Nursing, 2009'
  },
  chanting: {
    title: 'Chanting / Mantras',
    benefit: 'Helps with: Quieting the mind, reducing anxiety, spiritual practice',
    text: 'Repetitive chanting (like "Om") creates vibrations that stimulate the vagus nerve — your body\'s built-in calm-down switch. Brain scans show it actually quiets the fear center of your brain. The repetition also gives your racing thoughts something simple to hold onto, reducing mind-wandering by up to 50%.',
    tip: 'Try breathing in sync with the chant.',
    source: 'Kalyani et al., International Journal of Yoga, 2011'
  }
};

document.querySelectorAll('.info-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = btn.dataset.info;
    const info = layerInfo[key];
    if (!info) return;

    const content = document.getElementById('info-content');
    const isAlreadyVisible = !content.classList.contains('hidden');

    if (isAlreadyVisible) {
      // Quick fade out, swap content, fade back in
      content.style.opacity = '0';
      content.style.filter = 'blur(1.5px)';
      content.style.transform = 'translateY(4px)';
      setTimeout(() => {
        document.getElementById('info-panel-title').textContent = info.title;
        document.getElementById('info-panel-benefit').textContent = info.benefit;
        document.getElementById('info-panel-text').textContent = info.text;
        document.getElementById('info-panel-tip').textContent = info.tip;
        document.getElementById('info-panel-source').textContent = 'Source: ' + info.source;
        content.style.opacity = '';
        content.style.filter = '';
        content.style.transform = '';
      }, 500);
    } else {
      document.getElementById('info-panel-title').textContent = info.title;
      document.getElementById('info-panel-benefit').textContent = info.benefit;
      document.getElementById('info-panel-text').textContent = info.text;
      document.getElementById('info-panel-tip').textContent = info.tip;
      document.getElementById('info-panel-source').textContent = 'Source: ' + info.source;
      const ph = document.getElementById('info-placeholder');
      // Fade out placeholder, then fade in content
      ph.style.transition = 'opacity 0.3s ease';
      ph.style.opacity = '0';
      setTimeout(() => {
        ph.classList.add('hidden');
        ph.style.opacity = '';
        content.classList.remove('hidden');
        content.style.opacity = '0';
        requestAnimationFrame(() => {
          content.style.transition = 'opacity 0.5s ease';
          content.style.opacity = '1';
        });
      }, 300);
    }
    document.querySelector('.info-panel').classList.add('active');
    // Slide up on mobile
    document.getElementById('layers-right').classList.add('show-mobile');
  });
});

document.getElementById('info-panel-close').addEventListener('click', () => {
  const content = document.getElementById('info-content');
  const placeholder = document.getElementById('info-placeholder');
  // Fade out content
  content.style.opacity = '0';
  content.style.transform = 'translateY(8px)';
  setTimeout(() => {
    content.classList.add('hidden');
    content.style.opacity = '';
    content.style.transform = '';
    // Fade in placeholder
    placeholder.classList.remove('hidden');
    placeholder.style.opacity = '0';
    requestAnimationFrame(() => {
      placeholder.style.transition = 'opacity 0.5s ease';
      placeholder.style.opacity = '1';
    });
    document.querySelector('.info-panel').classList.remove('active');
    document.getElementById('layers-right').classList.remove('show-mobile');
  }, 400);
});

const LAYER_LIMIT = 3;

function updateLayerLimitHints() {
  // Meditation
  const mCount = state.meditationLayers.size;
  const mAtLimit = mCount >= LAYER_LIMIT;

  document.querySelectorAll('#meditation-layers .layer-chip').forEach(c => {
    if (c.classList.contains('active')) {
      c.classList.remove('limit-reached');
    } else if (mAtLimit) {
      c.classList.add('limit-reached');
    } else {
      c.classList.remove('limit-reached');
    }
  });
  const mHintEl = document.getElementById('meditation-limit-hint');
  if (mAtLimit) { mHintEl.classList.remove('hidden'); mHintEl.style.display = 'block'; }
  else { mHintEl.classList.add('hidden'); mHintEl.style.display = ''; }

  // Ambience
  const aCount = state.ambienceLayers.size;
  const aAtLimit = aCount >= LAYER_LIMIT;
  document.querySelectorAll('#ambience-layers .layer-chip').forEach(c => {
    if (c.classList.contains('active')) {
      c.classList.remove('limit-reached');
    } else if (aAtLimit) {
      c.classList.add('limit-reached');
    } else {
      c.classList.remove('limit-reached');
    }
  });
  const aHintEl = document.getElementById('ambience-limit-hint');
  if (aAtLimit) { aHintEl.classList.remove('hidden'); aHintEl.style.display = 'block'; }
  else { aHintEl.classList.add('hidden'); aHintEl.style.display = ''; }
}

// Meditation layers — delegated click handler
document.getElementById('meditation-layers').addEventListener('click', (e) => {
  const chip = e.target.closest('.layer-chip');
  if (!chip) return;
  const layer = chip.dataset.layer;
  if (!layer) return;



  if (state.meditationLayers.has(layer)) {
    uiSound.click();
    state.meditationLayers.delete(layer);
    chip.classList.remove('active');
  } else {
    if (state.meditationLayers.size >= LAYER_LIMIT) { uiSound.warning(); return; }
    uiSound.click();
    state.meditationLayers.add(layer);
    chip.classList.add('active');
  }
  meditationTouched = true;
  updateContinueButton();

  const showFreq = state.meditationLayers.has('binaural') || state.meditationLayers.has('isochronic');
  document.getElementById('freq-selector').classList.toggle('hidden', !showFreq);
  const existingNotice = document.querySelector('.headphone-notice');
  if (state.meditationLayers.has('binaural') && !existingNotice) {
    const notice = document.createElement('div');
    notice.className = 'headphone-notice';
    notice.innerHTML = 'Binaural beats work best with headphones';
    document.getElementById('freq-selector').after(notice);
  } else if (!state.meditationLayers.has('binaural') && existingNotice) {
    existingNotice.remove();
  }
  updateLayerLimitHints();
});

// Ambience layers — delegated click handler
document.getElementById('ambience-layers').addEventListener('click', (e) => {
  const chip = e.target.closest('.layer-chip');
  if (!chip) return;
  const layer = chip.dataset.ambience;
  if (!layer) return;

  if (state.ambienceLayers.has(layer)) {
    uiSound.click();
    state.ambienceLayers.delete(layer);
    chip.classList.remove('active');
  } else {
    if (state.ambienceLayers.size >= LAYER_LIMIT) { uiSound.warning(); return; }
    uiSound.click();
    state.ambienceLayers.add(layer);
    chip.classList.add('active');
  }
  ambienceTouched = true;
  updateContinueButton();
  updateLayerLimitHints();
});

document.querySelectorAll('.freq-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.binauralFreq = btn.dataset.freq;
    state.isochronicFreq = btn.dataset.freq;
    if (state.engine) state.engine.setFrequency(btn.dataset.freq);
  });
});

document.getElementById('btn-back-welcome').addEventListener('click', () => {
  // Reset all layer selections
  state.meditationLayers.clear();
  state.ambienceLayers.clear();
  state.binauralFreq = 'delta';
  state.isochronicFreq = 'theta';
  document.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.freq-btn').forEach(f => f.classList.remove('active'));
  document.getElementById('sleep-recommendation').classList.add('hidden');
  // Reset info panel
  const infoPanel = document.querySelector('.info-panel');
  if (infoPanel) infoPanel.classList.remove('active');
  document.querySelectorAll('.info-content').forEach(c => c.classList.add('hidden'));
  const placeholder = document.getElementById('info-placeholder');
  if (placeholder) placeholder.classList.remove('hidden');
  showScreen('screen-welcome');
});

// Skip buttons for layer sections
document.querySelectorAll('.layer-skip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    uiSound.click();
    const section = btn.dataset.section;
    const isSkipped = btn.classList.toggle('skipped');
    btn.textContent = isSkipped ? 'Skipped' : 'Skip';

    if (section === 'meditation') {
      const opts = document.getElementById('meditation-layers');
      opts.classList.toggle('dimmed', isSkipped);
      document.getElementById('freq-selector').classList.toggle('dimmed', isSkipped);
      if (isSkipped) {
        state.meditationLayers.clear();
        opts.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active'));
      }
      meditationTouched = true;
    } else if (section === 'ambience') {
      const opts = document.getElementById('ambience-layers');
      opts.classList.toggle('dimmed', isSkipped);
      if (isSkipped) {
        state.ambienceLayers.clear();
        opts.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active'));
      }
      ambienceTouched = true;
    }
    updateContinueButton();
  });
});

// ── Begin Journey ──

function goToPromptScreen() {
  // Show the pre-journey screen instead of prompt
  showScreen('screen-prejourney');
}

document.getElementById('btn-begin-journey').addEventListener('click', () => {
  // Stop everything — only the journey chime should play
  uiSound.stopWelcomeDrone();
  if (uiSound.ctx) {
    if (uiSound.ctx.state === 'suspended') uiSound.ctx.resume();
    // Kill master bus to silence any lingering UI sounds
    uiSound.master.gain.cancelScheduledValues(uiSound.ctx.currentTime);
    uiSound.master.gain.setValueAtTime(0, uiSound.ctx.currentTime);
  }
  // Play ONLY the begin-journey chime (bypasses master bus — goes direct to destination)
  uiSound.beginJourney();
  beginJourney();
});

async function beginJourney() {
  showScreen('screen-player');
  // Start visualizer loop (closed eye by default)
  kalmaViz.startLoop();
  // Pre-init engine so audio starts faster on auto-play
  state.playing = false;
  state.voice = null;
  state.scriptLoaded = false;
  if (!state.engine && typeof KalmaAudioEngine !== 'undefined') {
    state.engine = new KalmaAudioEngine();
    await state.engine.init();
    if (typeof KALMA_CONFIG !== 'undefined' && KALMA_CONFIG.useLyria && KALMA_CONFIG.lyriaApiKey) {
      await state.engine.enableLyria(KALMA_CONFIG.lyriaApiKey);
    }
    state.engine.core.master.gain.value = 0;
  }
  // Reading & Work default to Consciousness Stream (radio); others use generative
  if (state.intent === 'reading' || state.intent === 'work') {
    state.readingStyle = 'radio';
  } else {
    state.readingStyle = 'soft';
  }
  document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
  document.getElementById('player-status').textContent = 'Preparing...';
  
  // Reset toggles
  document.querySelectorAll('.reading-style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === state.readingStyle));
  document.getElementById('mood-reset-btn').classList.add('hidden');
  // Show work genre toggle only for work intent
  document.getElementById('work-genre-toggle').classList.toggle('hidden', state.intent !== 'work');
  if (state.intent === 'work') {
    document.querySelectorAll('#work-genre-toggle .reading-style-btn').forEach(b => b.classList.toggle('active', b.dataset.genre === 'lofi'));
    state.workGenre = 'lofi';
  }

  // Chakra tuning: auto-set 10 min timer, hide timer options
  const isChakra = state.guidanceStyle === 'chakra';
  const timerRow = document.querySelector('.timer-row');
  if (timerRow) timerRow.classList.toggle('hidden', isChakra);
  const timerDisplay = document.getElementById('timer-display');
  if (isChakra) {
    state.timer = 10;
    timerDisplay.classList.remove('hidden');
    timerDisplay.textContent = '10:00';
  }
  // Apply default layers for this intent (from INTENT_DEFAULT_LAYERS in engine-music.js)
  // Skip for radio mode — only the stream should play, no engine layers
  if (state.readingStyle !== 'radio' && typeof INTENT_DEFAULT_LAYERS !== 'undefined' && INTENT_DEFAULT_LAYERS[state.intent]) {
    const defaults = INTENT_DEFAULT_LAYERS[state.intent];
    // Only apply defaults if user hasn't manually selected layers
    if (state.meditationLayers.size === 0 && defaults.meditation) {
      defaults.meditation.forEach(layer => state.meditationLayers.add(layer));
    }
    if (state.ambienceLayers.size === 0 && defaults.ambience) {
      defaults.ambience.forEach(layer => state.ambienceLayers.add(layer));
    }
    // Override frequency to match the intent's scientifically matched range
    if (defaults.frequency) {
      state.binauralFreq = defaults.frequency;
      state.isochronicFreq = defaults.frequency;
    }
  }

  updateActiveLayers();
  updateMixSliders();

  // Auto-play — engine already pre-inited above
  setTimeout(() => {
    if (!state.playing) {
      document.getElementById('btn-play-pause').click();
    }
  }, 200);
}

// Consciousness Stream — curated radio streams per mood/genre
const CONSCIOUSNESS_STREAMS = {
  // ── Original mood streams ──
  unwind: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://stream.epic-piano.com/chillout-piano', 'https://radio.stereoscenic.com/asp-h', 'https://relax.stream.publicradio.org/relax.mp3'],
  uplift: ['https://ice5.somafm.com/groovesalad-128-mp3', 'https://streaming.hotmixradio.com/hotmix-lofi-en-mp3'],
  sleep: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://stream.epic-piano.com/chillout-piano', 'https://radio.stereoscenic.com/asp-h'],
  reading: ['https://streaming.hotmixradio.com/hotmix-lofi-en-mp3', 'https://ice5.somafm.com/groovesalad-128-mp3'],
  meditate: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://radio.stereoscenic.com/asp-h', 'https://stream.epic-piano.com/chillout-piano', 'https://relax.stream.publicradio.org/relax.mp3'],
  introspection: ['https://stream.epic-piano.com/chillout-piano', 'https://ice4.somafm.com/dronezone-128-mp3'],
  reset: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://stream.epic-piano.com/chillout-piano'],
  clarity: ['https://stream.epic-piano.com/chillout-piano', 'https://ice4.somafm.com/dronezone-128-mp3'],
  gratitude: ['https://stream.epic-piano.com/chillout-piano', 'https://radio.stereoscenic.com/mod-h'],
  creative: ['https://ice5.somafm.com/secretagent-128-mp3', 'https://streaming.hotmixradio.com/hotmix-lofi-en-mp3'],
  work: ['https://streaming.hotmixradio.com/hotmix-lofi-en-mp3', 'https://ice5.somafm.com/groovesalad-128-mp3'],
  pain: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://radio.stereoscenic.com/asp-h'],

  // ── Work sub-genres ──
  'work-jazz': ['https://jazzblues.ice.infomaniak.ch/jazzblues-high.mp3', 'https://ice5.somafm.com/sonicuniverse-128-mp3'],
  'work-classical': ['https://stream.epic-piano.com/chillout-piano', 'https://relax.stream.publicradio.org/relax.mp3'],
  'work-electronic': ['https://ice5.somafm.com/spacestation-128-mp3', 'https://ice5.somafm.com/groovesalad-128-mp3'],

  // ── Genre streams (for shift mood) ──
  techno: ['https://ice5.somafm.com/thetrip-128-mp3', 'https://ice5.somafm.com/beatblender-128-mp3'],
  house: ['https://ice5.somafm.com/beatblender-128-mp3', 'https://streaming.hotmixradio.com/hotmix-dance-en-mp3'],
  trance: ['https://ice5.somafm.com/thetrip-128-mp3', 'https://ice5.somafm.com/spacestation-128-mp3'],
  electronic: ['https://ice5.somafm.com/spacestation-128-mp3', 'https://ice5.somafm.com/beatblender-128-mp3'],
  ambient: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://radio.stereoscenic.com/asp-h'],
  jazz: ['https://jazzblues.ice.infomaniak.ch/jazzblues-high.mp3', 'https://ice5.somafm.com/sonicuniverse-128-mp3'],
  classical: ['https://stream.epic-piano.com/chillout-piano', 'https://relax.stream.publicradio.org/relax.mp3'],
  piano: ['https://stream.epic-piano.com/chillout-piano'],
  lofi: ['https://streaming.hotmixradio.com/hotmix-lofi-en-mp3', 'https://ice5.somafm.com/groovesalad-128-mp3'],
  hiphop: ['https://streaming.hotmixradio.com/hotmix-hiphop-en-mp3', 'https://ice5.somafm.com/illstreet-128-mp3'],
  reggae: ['https://ice5.somafm.com/reggae-128-mp3', 'https://streaming.hotmixradio.com/hotmix-sunny-en-mp3'],
  soul: ['https://ice5.somafm.com/seventies-128-mp3', 'https://ice5.somafm.com/illstreet-128-mp3'],
  funk: ['https://ice5.somafm.com/illstreet-128-mp3', 'https://ice5.somafm.com/seventies-128-mp3'],
  rock: ['https://streaming.hotmixradio.com/hotmix-rock-en-mp3', 'https://ice5.somafm.com/indiepop-128-mp3'],
  indie: ['https://ice5.somafm.com/indiepop-128-mp3', 'https://ice5.somafm.com/lush-128-mp3'],
  pop: ['https://streaming.hotmixradio.com/hotmix-hits-en-mp3', 'https://ice5.somafm.com/indiepop-128-mp3'],
  rnb: ['https://ice5.somafm.com/illstreet-128-mp3', 'https://streaming.hotmixradio.com/hotmix-hiphop-en-mp3'],
  chill: ['https://ice5.somafm.com/groovesalad-128-mp3', 'https://ice4.somafm.com/dronezone-128-mp3'],
  sad: ['https://stream.epic-piano.com/chillout-piano', 'https://ice4.somafm.com/dronezone-128-mp3', 'https://relax.stream.publicradio.org/relax.mp3', 'https://radio.stereoscenic.com/asp-h'],
  calm: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://stream.epic-piano.com/chillout-piano', 'https://radio.stereoscenic.com/asp-h'],
  nature: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://radio.stereoscenic.com/asp-h'],
  drone: ['https://ice4.somafm.com/dronezone-128-mp3', 'https://radio.stereoscenic.com/asp-h'],
  blues: ['https://jazzblues.ice.infomaniak.ch/jazzblues-high.mp3', 'https://ice5.somafm.com/sonicuniverse-128-mp3'],
  metal: ['https://streaming.hotmixradio.com/hotmix-metal-en-mp3', 'https://streaming.hotmixradio.com/hotmix-rock-en-mp3'],
  latin: ['https://streaming.hotmixradio.com/hotmix-sunny-en-mp3'],
  world: ['https://ice5.somafm.com/suburbsofgoa-128-mp3', 'https://radio.stereoscenic.com/mod-h'],
  retro: ['https://ice5.somafm.com/seventies-128-mp3', 'https://streaming.hotmixradio.com/hotmix-80-en-mp3'],
};

// Direct genre keyword → stream key mapping (for shift mood)
const GENRE_KEYWORDS = {
  techno: 'techno', house: 'house', trance: 'trance', edm: 'electronic', rave: 'electronic',
  electronic: 'electronic', electro: 'electronic', synth: 'electronic', synthwave: 'electronic',
  ambient: 'ambient', drone: 'drone', nature: 'nature',
  jazz: 'jazz', blues: 'blues', soul: 'soul', funk: 'funk', funky: 'funk',
  classical: 'classical', piano: 'piano', orchestra: 'classical',
  lofi: 'lofi', 'lo-fi': 'lofi', chillhop: 'lofi',
  hiphop: 'hiphop', 'hip-hop': 'hiphop', 'hip hop': 'hiphop', rap: 'hiphop',
  reggae: 'reggae', reggaeton: 'reggae', dancehall: 'reggae',
  rock: 'rock', metal: 'metal', punk: 'rock', grunge: 'rock',
  indie: 'indie', alternative: 'indie',
  pop: 'pop', hits: 'pop', top40: 'pop',
  rnb: 'rnb', 'r&b': 'rnb',
  chill: 'chill', chillout: 'chill', downtempo: 'chill',
  latin: 'latin', salsa: 'latin', bossa: 'latin', tropical: 'latin',
  world: 'world', ethnic: 'world', tribal: 'world', goa: 'world',
  retro: 'retro', '80s': 'retro', '70s': 'retro', oldies: 'retro', disco: 'retro',
  // Emotional states → always calm/ambient (no beats)
  sad: 'sad', lonely: 'sad', heartbreak: 'sad', crying: 'sad', tears: 'sad', grief: 'sad', mourning: 'sad', depressed: 'sad', melancholy: 'sad', sorrow: 'sad',
  anxious: 'calm', anxiety: 'calm', stressed: 'calm', nervous: 'calm', worried: 'calm', overwhelmed: 'calm', panic: 'calm', tense: 'calm',
  peaceful: 'calm', serene: 'calm', tranquil: 'calm', quiet: 'calm', stillness: 'calm',
  floating: 'calm', weightless: 'calm', dreamy: 'calm', ethereal: 'ambient', cosmic: 'ambient', space: 'ambient',
};
const LOFI_STREAMS = CONSCIOUSNESS_STREAMS.reading;
let radioAudio = null;
let radioSource = null;

// ── Radio Playback (simple, iOS-safe) ──
// No Web Audio routing — just an <audio> element with a volume poll loop

let radioVolTarget = 0;
let radioVolCurrent = 0;
let radioVolLoop = null;
let currentRadioIntent = null; // tracks which intent's stream is actually playing

// Helper: create a new radio audio element
function createRadioAudio() {
  const audio = new Audio();
  // crossOrigin needed for real visualizer analyser, but breaks iOS playback on non-CORS streams
  if (!_isMobile) audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', 'true');
  return audio;
}

const _isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 768);

function hookRadioViz() {
  if (!vizActive || !radioAudio) return;
  if (_isMobile) {
    kalmaViz.mode = 'simulated';
  } else {
    kalmaViz.connectRadio(radioAudio);
  }
}

function startRadio() {
  if (radioAudio) stopRadio();
  // Use genre-specific stream for work intent
  let streamKey = state.intent;
  if (state.intent === 'work' && state.workGenre && state.workGenre !== 'lofi') {
    streamKey = 'work-' + state.workGenre;
  }
  const streams = CONSCIOUSNESS_STREAMS[streamKey] || CONSCIOUSNESS_STREAMS[state.intent] || CONSCIOUSNESS_STREAMS.meditate;
  radioAudio = createRadioAudio();
  const streamUrl = streams[Math.floor(Math.random() * streams.length)];
  radioAudio.src = streamUrl;

  radioVolTarget = getMaster() * getMusic();
  radioVolCurrent = 0;
  radioAudio.volume = 0;
  currentRadioIntent = state.intent;

  const onRadioPlaying = () => {
    console.log('[K\u00e1lma Radio] Playing, fading to', radioVolTarget);
    startRadioVolLoop(); hookRadioViz();
  };

  radioAudio.play().then(onRadioPlaying).catch(e => {
    console.warn('[K\u00e1lma Radio] Play failed, trying next stream:', e.message);
    // Try each remaining stream until one works
    const idx = streams.indexOf(streamUrl);
    let tryIdx = (idx + 1) % streams.length;
    const tryNext = () => {
      if (tryIdx === idx) { console.warn('[K\u00e1lma Radio] All streams failed'); return; }
      try { radioAudio.pause(); radioAudio.removeAttribute('src'); radioAudio.load(); } catch(ex) {}
      radioAudio = createRadioAudio();
      radioAudio.volume = 0;
      radioVolCurrent = 0;
      radioAudio.src = streams[tryIdx];
      radioAudio.play().then(onRadioPlaying).catch(() => {
        tryIdx = (tryIdx + 1) % streams.length;
        tryNext();
      });
    };
    tryNext();
  });
}

function startRadioVolLoop() {
  if (radioVolLoop) clearInterval(radioVolLoop);
  radioVolLoop = setInterval(() => {
    if (!radioAudio) { clearInterval(radioVolLoop); radioVolLoop = null; return; }
    const diff = radioVolTarget - radioVolCurrent;
    if (Math.abs(diff) > 0.003) {
      // Slower fade in (0.04), faster fade out (0.1)
      const speed = diff > 0 ? 0.04 : 0.1;
      radioVolCurrent += diff * speed;
    } else {
      radioVolCurrent = radioVolTarget;
    }
    radioAudio.volume = Math.max(0, Math.min(1, radioVolCurrent));
    // Always feed visualizer energy based on target (immediate) not current (ramping)
    if (vizActive && state.playing) {
      kalmaViz.feedEnergy(radioVolTarget > 0.01 ? 0.7 + radioVolTarget * 0.3 : 0);
    }
  }, 40);
}

/**
 * Crossfade from current radio stream to a new one.
 * Old stream fades out over ~3s while new stream fades in over ~3s.
 * @param {string} streamKey - Key into CONSCIOUSNESS_STREAMS
 * @param {string[]} [streams] - Optional stream URLs (defaults to CONSCIOUSNESS_STREAMS[streamKey])
 * @returns {Promise<boolean>} - true if new stream started successfully
 */
function crossfadeRadio(streamKey, streams) {
  streams = streams || CONSCIOUSNESS_STREAMS[streamKey] || CONSCIOUSNESS_STREAMS.meditate;
  const targetVol = getMaster() * getMusic();

  // Fade out old stream
  const oldAudio = radioAudio;
  if (oldAudio) {
    let oldVol = oldAudio.volume || 0;
    const oldFade = setInterval(() => {
      oldVol -= 0.06;
      if (oldVol <= 0) {
        clearInterval(oldFade);
        try { oldAudio.pause(); oldAudio.removeAttribute('src'); oldAudio.load(); } catch(e) {}
      } else {
        try { oldAudio.volume = oldVol; } catch(e) {}
      }
    }, 60);
  }

  // Pick a different stream URL than currently playing
  let currentSrc = (oldAudio && oldAudio.src) || '';
  let available = streams.filter(s => !currentSrc.includes(s.split('//')[1]?.split('/')[0] || '__'));
  if (available.length === 0) available = streams;
  const streamIdx = Math.floor(Math.random() * available.length);

  // Start new stream, fade in
  radioAudio = createRadioAudio();
  radioAudio.volume = 0;
  radioVolCurrent = 0;
  radioAudio.src = available[streamIdx];

  const onNewStreamPlay = () => {
    radioVolTarget = targetVol;
    currentRadioIntent = streamKey;
    startRadioVolLoop(); hookRadioViz();
    if (vizActive) _feedRadioEnergy();
  };

  return radioAudio.play().then(() => { onNewStreamPlay(); return true; }).catch(() => {
    // Try each remaining stream until one works
    let tryIdx = (streamIdx + 1) % available.length;
    const tryNext = () => {
      if (tryIdx === streamIdx) return Promise.resolve(false);
      try { radioAudio.pause(); radioAudio.removeAttribute('src'); radioAudio.load(); } catch(e) {}
      radioAudio = createRadioAudio();
      radioAudio.volume = 0;
      radioVolCurrent = 0;
      radioAudio.src = available[tryIdx];
      return radioAudio.play().then(() => { onNewStreamPlay(); return true; }).catch(() => {
        tryIdx = (tryIdx + 1) % available.length;
        return tryNext();
      });
    };
    return tryNext();
  });
}

function setRadioVolume(vol) {
  radioVolTarget = Math.max(0, Math.min(1, vol));
  if (radioAudio && !radioVolLoop) startRadioVolLoop(); hookRadioViz();
}

function stopRadio() {
  radioVolTarget = 0;
  setTimeout(() => {
    if (radioVolLoop) { clearInterval(radioVolLoop); radioVolLoop = null; }
    if (radioAudio) {
      try { radioAudio.pause(); } catch(e) {}
      try { radioAudio.removeAttribute('src'); radioAudio.load(); } catch(e) {}
      radioAudio = null;
    }
    radioSource = null;
    radioVolCurrent = 0;
  }, 600);
}

// Work genre toggle
document.querySelectorAll('#work-genre-toggle .reading-style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    uiSound.click();
    document.querySelectorAll('#work-genre-toggle .reading-style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.workGenre = btn.dataset.genre;

    // Switch stream if playing
    if (state.engine && state.engine._started && state.intent === 'work') {
      // Kill generative music completely when switching genres
      if (state.engine.music) state.engine.music.stop();
      if (state.engine.core && state.engine.core.musicBus) {
        state.engine.core.musicBus.gain.setValueAtTime(0, state.engine.core.ctx.currentTime);
      }

      const streamKey = btn.dataset.genre === 'lofi' ? 'work' : 'work-' + btn.dataset.genre;
      crossfadeRadio(streamKey);
    }
  });
});

// Music source toggle — Generated vs Consciousness Stream
document.querySelectorAll('.reading-style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    uiSound.click();
    document.querySelectorAll('.reading-style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.readingStyle = btn.dataset.style;

    if (state.engine && state.engine._started) {
      if (btn.dataset.style === 'radio') {
        // Switch to Consciousness Stream
        state.engine.music.stop();
        startRadio();
      } else {
        // Switch to Generated
        stopRadio();
        state.engine.music.stop();
        const mood = (state.intent === 'reading' && state.readingStyle === 'lofi') ? 'reading-lofi' : state.intent;
        state.engine.music.setMood(mood);
        state.engine.music.start();
      }
    }
  });
});

// Track layer section status
let meditationTouched = false;
let ambienceTouched = false;

function updateContinueButton() {
  const canContinue = meditationTouched && ambienceTouched;
  const btn = document.getElementById('btn-begin');
  const hint = document.getElementById('layers-hint');
  btn.disabled = !canContinue;
  btn.classList.toggle('disabled', !canContinue);
  hint.classList.toggle('hidden', canContinue);
}

// Layers → next screen (guidance or prompt)
document.getElementById('btn-begin').addEventListener('click', () => {
  if (document.getElementById('btn-begin').disabled) return;
  if (guidanceIntents.includes(state.intent)) {
    showScreen('screen-guidance');
  } else {
    goToPromptScreen();
  }
});

const btnMusicOnly = document.getElementById('btn-music-only');
if (btnMusicOnly) {
  btnMusicOnly.addEventListener('click', () => {
    state.meditationLayers.clear();
    state.ambienceLayers.clear();
    document.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active'));
    if (guidanceIntents.includes(state.intent)) {
      showScreen('screen-guidance');
    } else {
      goToPromptScreen();
    }
  });
}

// ── Guidance Screen (Meditation Type Selection) ──

// Meditation type cards — click goes straight to pre-journey
document.querySelectorAll('.guidance-card[data-meditation]').forEach(card => {
  card.addEventListener('click', () => {
    uiSound.click();
    const type = card.dataset.meditation;

    // Highlight selected
    document.querySelectorAll('.guidance-card[data-meditation]').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    if (type === 'chakra') {
      // Chakra = voice guided
      state.voiceOn = true;
      state.guidanceStyle = 'chakra';
    } else {
      // Introspection & Gratitude = music only, no voice
      state.voiceOn = false;
      state.guidanceStyle = null;
      // Update intent so radio/mood matches
      if (type === 'introspection') {
        state.intent = 'introspection';
      } else if (type === 'gratitude') {
        state.intent = 'gratitude';
      }
    }

    // Brief pause to show selection, then proceed
    setTimeout(() => goToPromptScreen(), 400);
  });
  card.addEventListener('mouseenter', () => {
    uiSound.hover();
  });
});

// Back from guidance
document.getElementById('btn-back-to-layers').addEventListener('click', () => {
  showScreen('screen-welcome');
});

// ── Player Screen ──

document.getElementById('btn-back-layers').addEventListener('click', () => {
  wakeLockManager.onStop();
  kalmaViz.forceStop();
  stopRadio();
  if (state.voice) { state.voice.stop(); state.voice = null; state.scriptLoaded = false; }
  if (state.engine) { state.engine.stopMusic(); state.engine = null; }
  state.playing = false;
  document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
  showScreen('screen-welcome');
});

document.getElementById('btn-player-home').addEventListener('click', () => {
  wakeLockManager.onStop();
  kalmaViz.forceStop();
  stopRadio();
  if (state.voice) { state.voice.stop(); state.voice = null; state.scriptLoaded = false; }
  if (state.engine) { state.engine.stopMusic(); state.engine = null; }
  state.playing = false;
  document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
  
  clearInterval(statusInterval);
  uiSound.startWelcomeDrone();
  showScreen('screen-welcome');
});

// ── Visualizer (always on) ──
let vizActive = true;
const vizCanvas = document.getElementById('visualizer-canvas');
kalmaViz.init(vizCanvas);
kalmaViz._orbEl = document.getElementById('viz-orb');

function _startViz() {
  if (state.readingStyle === 'radio') {
    if (!_isMobile && radioAudio) {
      kalmaViz.connectRadio(radioAudio);
    } else {
      kalmaViz.mode = 'simulated';
    }
    kalmaViz.feedEnergy(0.8);
    _feedRadioEnergy();
  } else if (state.engine && state.engine.core && state.engine.core.ctx && state.engine.core.master) {
    kalmaViz.connectAnalyser(state.engine.core.ctx, state.engine.core.master);
  } else {
    kalmaViz.mode = 'simulated';
    _feedRadioEnergy();
  }
  kalmaViz.start(); // opens eye
}

function _stopViz() {
  kalmaViz.stop(); // closes eye
}

let vizEnergyLoop = null;
function _feedRadioEnergy() {
  if (vizEnergyLoop) clearInterval(vizEnergyLoop);
  vizEnergyLoop = setInterval(() => {
    if (!vizActive || !state.playing) {
      kalmaViz.feedEnergy(0);
      clearInterval(vizEnergyLoop);
      vizEnergyLoop = null;
      return;
    }
    // Feed energy based on target volume — reacts as soon as play starts
    const energy = (state.playing && radioVolTarget > 0.01) ? 0.5 + radioVolTarget * 0.5 : 0;
    kalmaViz.feedEnergy(energy);
  }, 50);
}

// Duck/unduck music for voice guidance
// ── Session Complete Screen ──

const moodMessages = {
  'much-better': 'Beautiful. You gave yourself what you needed.',
  'better': 'Even a small shift matters. You showed up for yourself today.',
  'same': 'That\'s okay. Some sessions plant seeds you\'ll feel later.',
  'worse': 'Thank you for being honest. Not every session feels good, and that\'s part of the process.'
};

document.querySelectorAll('.mood-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    uiSound.click();
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const msg = moodMessages[btn.dataset.mood];
    const msgEl = document.getElementById('complete-message');
    msgEl.textContent = msg;
    msgEl.classList.remove('hidden');
  });
});

document.getElementById('btn-main-menu').addEventListener('click', () => {
  uiSound.click();
  // Reset mood check UI
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('complete-message').classList.add('hidden');
  // Go to welcome with drone
  uiSound.startWelcomeDrone();
  showScreen('screen-welcome');
});

document.getElementById('btn-new-session').addEventListener('click', () => {
  // Reset everything
  state.engine = null;
  state.voice = null;
  state.scriptLoaded = false;
  state.playing = false;
  state.intent = null;
  state.guidanceStyle = null;
  state.introspectionTheme = null;
  state.voiceOn = false;
  state.meditationLayers.clear();
  state.ambienceLayers.clear();
  // Reset UI
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('complete-message').classList.add('hidden');
  document.querySelectorAll('.layer-chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.guidance-card').forEach(c => c.classList.remove('selected'));
  // Start fresh
  uiSound.startWelcomeDrone();
  showScreen('screen-welcome');
});

// Reset to original mood
document.getElementById('mood-reset-btn').addEventListener('click', () => {
  uiSound.click();
  // Determine the correct stream key for the original intent
  let streamKey = state.intent;
  if (state.intent === 'work' && state.workGenre && state.workGenre !== 'lofi') {
    streamKey = 'work-' + state.workGenre;
  }

  crossfadeRadio(streamKey);

  document.getElementById('player-status').textContent = 'Returning to ' + (intentLabels[state.intent] || 'original mood') + '...';
  document.getElementById('mood-reset-btn').classList.add('hidden');
  setTimeout(() => startStatusRotation(), 4000);
});

// Voice mute toggle
let voiceMuted = false;
document.getElementById('btn-voice-mute').addEventListener('click', () => {
  uiSound.click();
  voiceMuted = !voiceMuted;
  const btn = document.getElementById('btn-voice-mute');
  btn.classList.toggle('active', voiceMuted);
  document.getElementById('voice-mute-text').textContent = voiceMuted ? 'Unmute Voice' : 'Mute Voice';
  if (state.voice && state.voice.gainNode && state.voice.ctx) {
    try {
      if (voiceMuted) {
        state.voice.gainNode.gain.setTargetAtTime(0, state.voice.ctx.currentTime, 0.3);
      } else {
        const vol = getVoice() * getMaster();
        state.voice.gainNode.gain.setTargetAtTime(vol, state.voice.ctx.currentTime, 0.3);
      }
    } catch(e) { console.warn('[K\u00e1lma] Voice mute error:', e.message); }
  }
});

// No ducking — voice sits on top of music at constant level
function duckMusicForVoice() { /* intentionally empty */ }
function unduckMusic() { /* intentionally empty */ }

// Voice guidance setup
async function initVoiceGuidance() {
  if (!state.voiceOn || !state.guidanceStyle || state.scriptLoaded) return;

  // Determine script name for audio files
  let scriptName;
  if (state.introspectionTheme && introspectionScripts[state.introspectionTheme]) {
    scriptName = 'theme-' + state.introspectionTheme.replace('theme-', '');
  } else {
    scriptName = state.guidanceStyle === 'gentle' ? 'gentle-meditation' : state.guidanceStyle;
  }

  // Special case: Chakra Tuning — single full-session file
  if (state.guidanceStyle === 'chakra' && state.engine && state.engine.core) {
    const audioVoice = new EngineVoiceAudio(state.engine.core);
    const hasAudio = await audioVoice.loadFullSession('./audio/voice/chakra-tuning/full-session.mp3');
    if (hasAudio) {
      state.voice = audioVoice;
      state.scriptLoaded = true;
      state.voiceType = 'audio';
      console.log('[K\u00e1lma] Chakra tuning loaded');
      return;
    }
  }

  // Try pre-generated audio first
  if (state.engine && state.engine.core) {
    const audioVoice = new EngineVoiceAudio(state.engine.core);
    const hasAudio = await audioVoice.loadScript(scriptName, state.timer);

    if (hasAudio) {
      // Duck music when voice speaks

      state.voice = audioVoice;
      state.scriptLoaded = true;
      state.voiceType = 'audio';
      console.log('[K\u00e1lma] Voice guidance loaded (audio files):', scriptName);
      return;
    }
  }

  // Fall back to browser speech
  let scriptUrl;
  if (state.introspectionTheme && introspectionScripts[state.introspectionTheme]) {
    scriptUrl = introspectionScripts[state.introspectionTheme];
  } else {
    scriptUrl = guidanceScripts[state.guidanceStyle];
  }
  if (!scriptUrl) return;

  try {
    const resp = await fetch(scriptUrl);
    const script = await resp.json();

    state.voice = new EngineVoice(state.engine ? state.engine.core : null);

    // Duck callbacks


    // Assemble script based on timer
    state.voice.loadScript(script, state.timer);

    // Personalize with user's prompt
    if (state.initialPrompt) {
      state.voice.personalizeIntro(state.initialPrompt);
    }

    state.scriptLoaded = true;
    console.log('[Kálma] Voice guidance loaded:', state.guidanceStyle, 'lines:', state.voice.queue.length);
  } catch (e) {
    console.warn('[Kálma] Failed to load voice script:', e);
  }
}

let fadeOutTimer = null;

document.getElementById('btn-play-pause').addEventListener('click', async () => {
  uiSound.click();
  // Init engine if not already pre-inited
  if (!state.engine && typeof KalmaAudioEngine !== 'undefined') {
    state.engine = new KalmaAudioEngine();
    await state.engine.init();
    if (typeof KALMA_CONFIG !== 'undefined' && KALMA_CONFIG.useLyria && KALMA_CONFIG.lyriaApiKey) {
      await state.engine.enableLyria(KALMA_CONFIG.lyriaApiKey);
    }
    state.engine.core.master.gain.value = 0;
  }
  // Set mood/frequency/layers on first play (engine may be pre-inited)
  if (state.engine && !state.engine._moodSet) {
    if (state.readingStyle === 'radio') {
      // Radio mode — skip ALL generative engine setup (mood, layers, frequencies)
      // Only radio stream should produce sound
      state.engine.core.master.gain.value = 0;
    } else {
      const mood = (state.intent === 'reading' && state.readingStyle === 'lofi') ? 'reading-lofi' : state.intent;
      state.engine.setMood(mood);
      state.engine.setFrequency(state.binauralFreq || 'theta');
      state.engine.core.master.gain.value = 0;
      state.meditationLayers.forEach(layer => state.engine.toggleMeditationLayer(layer));
      state.ambienceLayers.forEach(layer => state.engine.toggleAmbience(layer));
    }
    state.engine._moodSet = true;
  }

  if (state.playing) {
    // Fade out then pause — 3 second fade
    state.playing = false;
    if (vizActive) _stopViz();
    document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
    
    clearInterval(statusInterval);
    document.getElementById('player-status').textContent = 'Fading out...';
    wakeLockManager.onPause();
    // Pause voice (don't stop — we want to resume)
    if (state.voice) {
      state.voice.pause();
    }
    // Pause radio - stop loop and force pause
    radioVolTarget = 0;
    if (radioVolLoop) { clearInterval(radioVolLoop); radioVolLoop = null; }
    if (radioAudio) {
      // Immediate volume drop then pause
      try { radioAudio.volume = 0; } catch(e) {}
      setTimeout(() => {
        if (!state.playing && radioAudio) {
          try { radioAudio.pause(); } catch(e) {}
        }
      }, 300);
    }
    if (state.engine && state.engine.core) {
      state.engine.core.master.gain.setTargetAtTime(0, state.engine.core.currentTime, 0.8);
      fadeOutTimer = setTimeout(() => {
        if (!state.playing && state.engine) {
          // Suspend audio context but keep engine state
          if (state.engine.core) state.engine.core.ctx.suspend();
        }
        document.getElementById('player-status').textContent = 'Paused';
        fadeOutTimer = null;
      }, 3000);
    }
  } else {
    // Cancel any pending fade out
    if (fadeOutTimer) {
      clearTimeout(fadeOutTimer);
      fadeOutTimer = null;
    }

    // Restore UI sounds
    if (uiSound.master) {
      uiSound.master.gain.setTargetAtTime(0.4, uiSound.ctx.currentTime, 0.1);
    }
    document.getElementById('play-icon').innerHTML = '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
    
    document.getElementById('player-status').textContent = '';
    const vol = document.getElementById('master-volume').value / 100;

    if (state.engine && state.engine.core) {
      if (state.engine.core.state === 'suspended') {
        await state.engine.core.ctx.resume();
      }
      if (!state.engine._started) {
        // First play — start music with fade in
        state.engine.core.master.gain.value = 0;
        if (state.readingStyle === 'radio') {
          // Kill generative engine — disconnect music bus entirely, only radio plays
          if (state.engine.core && state.engine.core.musicBus) {
            state.engine.core.musicBus.gain.setValueAtTime(0, state.engine.core.ctx.currentTime);
            state.engine.core.musicBus.disconnect();
          }
          if (state.engine.music) state.engine.music.stop();
          startRadio();
          state.engine._started = true;
        } else {
          state.engine.startMusic();
        }
        state.engine.core.master.gain.setTargetAtTime(vol, state.engine.core.currentTime, 0.5);

        // Start voice guidance after a short delay (let music establish)
        if (state.voiceOn && !state.scriptLoaded) {
          await initVoiceGuidance();
        }
        if (state.voice && state.scriptLoaded) {
          const voiceDelay = state.guidanceStyle === 'chakra' ? 2000 : 5000;
          setTimeout(() => {
            if (state.playing && state.voice) state.voice.start();
          }, voiceDelay);
        }
      } else {
        // Resume from pause — fade back in
        state.engine.core.master.gain.value = 0;
        state.engine.core.master.gain.setTargetAtTime(vol, state.engine.core.currentTime, 1.2);
        // If on radio mode, kill generative music completely
        if (state.readingStyle === 'radio') {
          if (state.engine.music) state.engine.music.stop();
          if (state.engine.core && state.engine.core.musicBus) {
            state.engine.core.musicBus.gain.setValueAtTime(0, state.engine.core.ctx.currentTime);
          }
        }
        // Resume radio with fade in
        if (radioAudio) {
          radioVolCurrent = 0;
          radioAudio.play().catch(() => {});
          setRadioVolume(getMaster() * getMusic());
          startRadioVolLoop(); hookRadioViz();
        }
        // Resume voice where it left off
        if (state.voice && state.voice.paused) {
          state.voice.resume();
        }
      }
    }
    state.playing = true;
    // Start visualizer if active
    if (vizActive) _startViz();
    startStatusRotation();

    // Auto-start chakra timer countdown
    if (state.guidanceStyle === 'chakra' && !countdownInterval) {
      countdownRemaining = 10 * 60;
      const cdDisplay = document.getElementById('timer-display');
      cdDisplay.classList.remove('hidden');
      updateTimerDisplay();
      countdownInterval = setInterval(() => {
        if (!state.playing) return;
        countdownRemaining--;
        updateTimerDisplay();
        if (countdownRemaining <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          state.playing = false;
          document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
          
          clearInterval(statusInterval);
          if (state.engine && state.engine.core) {
            state.engine.core.master.gain.setTargetAtTime(0, state.engine.core.currentTime, 2);
            setTimeout(() => {
              stopRadio();
              if (state.engine.music) state.engine.music.stop();
              if (state.engine.core) state.engine.core.ctx.suspend();
              state.engine._started = false;
              if (state.voice) { state.voice.stop(); state.voice = null; }
              state.scriptLoaded = false;
              wakeLockManager.onStop();
              showScreen('screen-complete');
            }, 5000);
          }
          cdDisplay.textContent = '0:00';
        }
      }, 1000);
    }

    // Keep screen awake + route audio for iOS background playback
    const sessionTitle = intentLabels[state.intent] || 'K\u00e1lma';
    const ctx = state.engine && state.engine.core ? state.engine.core.ctx : null;
    wakeLockManager.onPlay(sessionTitle, ctx);
    // Connect master to MediaStream so iOS keeps audio alive
    if (wakeLockManager.streamDest && state.engine && state.engine.core) {
      state.engine.core.master.connect(wakeLockManager.streamDest);
    }
    wakeLockManager.setupMediaSession(sessionTitle,
      () => { document.getElementById('btn-play-pause').click(); },  // lock screen play
      () => { document.getElementById('btn-play-pause').click(); }   // lock screen pause
    );
  }
});

// ── Volume System ──
// Master scales everything proportionally. Individual faders control relative mix.
// All changes use smooth ramps (no clicks/jumps).

function getMaster() { return document.getElementById('master-volume').value / 100; }
function getMusic() { return document.getElementById('music-volume').value / 100; }
function getAmbience() { return document.getElementById('ambience-volume').value / 100; }
function getLayers() { return document.getElementById('layers-volume').value / 100; }
function getVoice() { return document.getElementById('voice-volume').value / 100; }

function getRadioVolume() { return getMaster() * getMusic(); }

function updateAllVolumes() {
  const m = getMaster();
  const musicVol = getMusic();

  // Radio volume — apply immediately (no slow fade for slider interaction)
  if (radioAudio) {
    const rv = Math.max(0, Math.min(1, m * musicVol));
    radioAudio.volume = rv;
    radioVolCurrent = rv;
    radioVolTarget = rv;
  }

  // Engine buses — skip in radio mode (musicBus is disconnected, nothing to control)
  if (state.readingStyle !== 'radio' && state.engine && state.engine.core) {
    try {
      const t = state.engine.core.currentTime;
      state.engine.core.master.gain.setTargetAtTime(m, t, 0.15);
      state.engine.core.musicBus.gain.setTargetAtTime(musicVol, t, 0.15);
      state.engine.core.ambienceBus.gain.setTargetAtTime(getAmbience(), t, 0.15);
      state.engine.core.layersBus.gain.setTargetAtTime(getLayers(), t, 0.15);
    } catch(e) {}
  }

  // Voice (scales with master)
  if (state.voice && state.voice.gainNode) {
    state.voice.gainNode.gain.setTargetAtTime(getVoice() * m, state.voice.ctx.currentTime, 0.15);
  }
}

// All sliders use the same unified update
document.getElementById('master-volume').addEventListener('input', updateAllVolumes);
document.getElementById('music-volume').addEventListener('input', updateAllVolumes);
document.getElementById('ambience-volume').addEventListener('input', updateAllVolumes);
document.getElementById('layers-volume').addEventListener('input', updateAllVolumes);
document.getElementById('voice-volume').addEventListener('input', () => {
  state.voiceVolume = getVoice();
  updateAllVolumes();
});

// Drawer chips — meditation
document.querySelectorAll('#drawer-meditation .drawer-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const layer = chip.dataset.layer;
    if (!state.meditationLayers.has(layer) && state.meditationLayers.size >= LAYER_LIMIT) return;
    if (state.meditationLayers.has(layer)) {
      state.meditationLayers.delete(layer);
    } else {
      state.meditationLayers.add(layer);
    }
    if (state.engine) state.engine.toggleMeditationLayer(layer);
    chip.classList.toggle('active');
    updateActiveLayers();
    updateMixSliders();
    updateDrawerFreq();
    updateDrawerLimits();
  });
});

// Drawer frequency selectors — independent per layer type
function updateDrawerFreq() {
  document.getElementById('drawer-freq-binaural').classList.toggle('hidden', !state.meditationLayers.has('binaural'));
  document.getElementById('drawer-freq-isochronic').classList.toggle('hidden', !state.meditationLayers.has('isochronic'));

  // Mark correct active states
  document.querySelectorAll('.drawer-freq-btn').forEach(b => {
    if (b.dataset.target === 'binaural') {
      b.classList.toggle('active', b.dataset.freq === state.binauralFreq);
    } else if (b.dataset.target === 'isochronic') {
      b.classList.toggle('active', b.dataset.freq === state.isochronicFreq);
    }
  });
}

document.querySelectorAll('.drawer-freq-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    // Deselect siblings of same target
    document.querySelectorAll(`.drawer-freq-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (target === 'binaural') {
      state.binauralFreq = btn.dataset.freq;
    } else if (target === 'isochronic') {
      state.isochronicFreq = btn.dataset.freq;
    }

    if (state.engine) {
      state.engine.setFrequency(btn.dataset.freq); // future: pass target type too
    }
  });
});

// Drawer chips — ambience
document.querySelectorAll('#drawer-ambience .drawer-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const layer = chip.dataset.ambience;
    if (!state.ambienceLayers.has(layer) && state.ambienceLayers.size >= LAYER_LIMIT) return;
    if (state.ambienceLayers.has(layer)) {
      state.ambienceLayers.delete(layer);
    } else {
      state.ambienceLayers.add(layer);
    }
    if (state.engine) state.engine.toggleAmbience(layer);
    chip.classList.toggle('active');
    updateActiveLayers();
    updateMixSliders();
    updateDrawerLimits();
  });
});

// Drawer limit visual feedback
function updateDrawerLimits() {
  const mAtLimit = state.meditationLayers.size >= LAYER_LIMIT;
  document.querySelectorAll('#drawer-meditation .drawer-chip').forEach(c => {
    if (c.classList.contains('active')) {
      c.classList.remove('limit-reached');
    } else if (mAtLimit) {
      c.classList.add('limit-reached');
    } else {
      c.classList.remove('limit-reached');
    }
  });
  const dmHint = document.getElementById('drawer-meditation-limit');
  if (mAtLimit) { dmHint.classList.remove('hidden'); dmHint.style.display = 'block'; }
  else { dmHint.classList.add('hidden'); dmHint.style.display = ''; }

  const aAtLimit = state.ambienceLayers.size >= LAYER_LIMIT;
  document.querySelectorAll('#drawer-ambience .drawer-chip').forEach(c => {
    if (c.classList.contains('active')) {
      c.classList.remove('limit-reached');
    } else if (aAtLimit) {
      c.classList.add('limit-reached');
    } else {
      c.classList.remove('limit-reached');
    }
  });
  const daHint = document.getElementById('drawer-ambience-limit');
  if (aAtLimit) { daHint.classList.remove('hidden'); daHint.style.display = 'block'; }
  else { daHint.classList.add('hidden'); daHint.style.display = ''; }
}

// Drawer close
// Customize Your Experience button opens layer drawer
document.getElementById('btn-customize-experience').addEventListener('click', () => {
  toggleLayerDrawer();
});

document.getElementById('btn-drawer-close').addEventListener('click', () => {
  document.getElementById('layer-drawer').classList.add('hidden');
});

// Mix toggle
document.getElementById('btn-mix-toggle').addEventListener('click', () => {
  const panel = document.getElementById('mix-panel');
  const btn = document.getElementById('btn-mix-toggle');
  uiSound.click();

  if (panel.classList.contains('hidden')) {
    // Open: show then fade in
    panel.classList.remove('hidden');
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-8px)';
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });
    btn.classList.add('active');
  } else {
    // Close: fade out then hide
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      panel.classList.add('hidden');
      panel.style.opacity = '';
      panel.style.transform = '';
      panel.style.transition = '';
    }, 300);
    btn.classList.remove('active');
  }
});

// Show/hide mix sliders based on selections
function updateMixSliders() {
  document.getElementById('mix-ambience').classList.toggle('hidden', state.ambienceLayers.size === 0);
  document.getElementById('mix-layers').classList.toggle('hidden', state.meditationLayers.size === 0);
  document.getElementById('mix-voice').classList.toggle('hidden', !state.voiceOn);
  document.getElementById('voice-mute-row').classList.toggle('hidden', !state.voiceOn);
}

// Intents that should only use ambient/calm streams (no beats)
const CALM_INTENTS = ['meditate', 'sleep', 'unwind', 'introspection', 'gratitude', 'reset', 'clarity', 'pain'];

// Map mood keywords to intent names for Consciousness Stream switching
// Two sets: one for calm contexts, one for all contexts
const MOOD_TO_INTENT_CALM = {
  // Emotions
  sad: 'introspection', lonely: 'introspection', nostalgic: 'introspection', melanchol: 'introspection', grief: 'introspection',
  anxi: 'meditate', stress: 'meditate', worry: 'meditate', panic: 'meditate', overwhelm: 'meditate', nervous: 'meditate',
  happy: 'gratitude', joy: 'gratitude', excit: 'unwind', good: 'gratitude', great: 'gratitude', amaz: 'gratitude', blessed: 'gratitude',
  calm: 'unwind', peace: 'unwind', relax: 'unwind', serene: 'unwind', tranquil: 'unwind', gentle: 'unwind',
  energy: 'reset', power: 'reset', strong: 'reset', motiv: 'reset', alive: 'reset',
  sleep: 'sleep', tired: 'sleep', exhaust: 'sleep', rest: 'sleep', drowsy: 'sleep',
  focus: 'clarity', concentrat: 'clarity', study: 'clarity', think: 'clarity', clarity: 'clarity',
  love: 'gratitude', grateful: 'gratitude', warm: 'gratitude', tender: 'gratitude', heart: 'gratitude',
  angry: 'reset', frustrat: 'reset', rage: 'reset',
  hope: 'gratitude', dream: 'introspection', inspir: 'gratitude', fresh: 'reset', renew: 'reset',
  // Descriptive / musical
  piano: 'introspection', guitar: 'unwind', strings: 'introspection', acoustic: 'unwind',
  ambient: 'meditate', drone: 'meditate', space: 'meditate', cosmic: 'meditate', ethereal: 'meditate',
  nature: 'unwind', ocean: 'unwind', rain: 'sleep', water: 'unwind', forest: 'unwind',
  deep: 'sleep', dark: 'introspection', light: 'gratitude', bright: 'gratitude',
  slow: 'sleep', soft: 'unwind', quiet: 'sleep', silence: 'meditate',
  zen: 'meditate', spiritual: 'meditate', sacred: 'meditate', healing: 'meditate',
  comfort: 'unwind', safe: 'unwind', home: 'unwind', cozy: 'unwind'
};

const MOOD_TO_INTENT_ALL = {
  // Emotions
  sad: 'introspection', lonely: 'introspection', nostalgic: 'introspection', melanchol: 'introspection', grief: 'introspection',
  anxi: 'meditate', stress: 'meditate', worry: 'meditate', panic: 'meditate', overwhelm: 'meditate', nervous: 'meditate',
  happy: 'uplift', joy: 'uplift', excit: 'uplift', good: 'uplift', great: 'uplift', amaz: 'uplift', blessed: 'uplift',
  calm: 'unwind', peace: 'unwind', relax: 'unwind', serene: 'unwind', tranquil: 'unwind', gentle: 'unwind',
  energy: 'creative', power: 'creative', strong: 'creative', motiv: 'uplift', alive: 'creative',
  sleep: 'sleep', tired: 'sleep', exhaust: 'sleep', rest: 'sleep', drowsy: 'sleep',
  focus: 'reading', concentrat: 'reading', study: 'reading', think: 'clarity', clarity: 'clarity',
  love: 'gratitude', grateful: 'gratitude', warm: 'gratitude', tender: 'gratitude', heart: 'gratitude',
  angry: 'reset', frustrat: 'reset', rage: 'reset',
  hope: 'uplift', dream: 'creative', inspir: 'creative', fresh: 'reset', renew: 'reset',
  // Descriptive / musical
  piano: 'introspection', guitar: 'unwind', strings: 'introspection', acoustic: 'unwind',
  ambient: 'meditate', drone: 'meditate', space: 'meditate', cosmic: 'creative', ethereal: 'meditate',
  lofi: 'reading', 'lo-fi': 'reading', beats: 'reading', jazz: 'reading', chill: 'unwind',
  nature: 'unwind', ocean: 'unwind', rain: 'sleep', water: 'unwind', forest: 'unwind',
  deep: 'sleep', dark: 'introspection', light: 'uplift', bright: 'uplift',
  slow: 'sleep', soft: 'unwind', quiet: 'sleep', silence: 'meditate',
  fast: 'creative', upbeat: 'uplift', groove: 'creative', funky: 'creative',
  zen: 'meditate', spiritual: 'meditate', sacred: 'meditate', healing: 'meditate',
  comfort: 'unwind', safe: 'unwind', home: 'unwind', cozy: 'unwind',
  work: 'reading', productive: 'reading', create: 'creative', paint: 'creative', write: 'reading'
};

function detectMoodIntent(text) {
  const t = text.toLowerCase();
  const isCalmContext = CALM_INTENTS.includes(state.intent);

  // Score each possible intent based on how many associated words match
  const INTENT_WORDS = {
    sleep: /sleep|tired|exhaust|rest|drowsy|nap|dream|night|bed|pillow|insomnia|yawn|fatigue|weary|drained|lullaby|drift|heavy eye|knock out|pass out|deep rest|shut down|wind down|darkness|moonlight|rain|slow|quiet|still|dim|fade|dissolve/,
    meditate: /meditat|mindful|breath|zen|chakra|spiritual|sacred|mantra|om |ohm|conscious|transcend|inner peace|center|ground|present|aware|being|exist|void|nothing|everything|universe|cosmic|ethereal|astral|divine|soul|spirit|vibrat|frequen|healing|third eye|energy|aura|float|dissolve|surrender|let go|release|drone|ambient|space|vastness|infinite/,
    unwind: /unwind|relax|chill|decompress|calm|ease|comfort|cozy|warm|soft|gentle|mellow|smooth|cool down|take it easy|laid back|lazy|hammock|beach|sunset|evening|afternoon|tea|bath|blanket|fireplace|home|safe|shelter|embrace|hug|sigh|acoustic|guitar|nature|forest|breeze|garden|sad|lonely|blue|down|low|empty|hollow|cry|tears|broken|lost|vulnerable|fragile|tender|quiet|still|slow/,
    introspection: /introspec|reflect|think|thought|ponder|contempl|wonder|question|meaning|purpose|who am i|self|identity|mirror|deep thought|philosophy|melanchol|nostalgic|nostalgia|remember|memory|past|bittersweet|longing|yearning|miss|piano|strings|minor|somber|serious|dark|shadow|depth|journal|diary|mood|feeling|emotion|soul|spirit|inner|deep|aware|conscious|mindful/,
    gratitude: /gratitude|grateful|thankful|appreciat|bless|blessed|kind|loving|love|heart|warmth|tender|compassion|generous|giving|abundance|plenty|fortune|lucky|smile|happy|joy|content|satisf|fulfilled|enough|peace|harmony|light|bright|glow|sunrise|morning|hope|optimis|positiv|good|great|wonderful|beautiful|amazing|glad|cheerful|pleased|delighted/,
    reset: /reset|fresh|start over|new begin|clean|clear|purif|detox|renew|rebirth|reboot|restart|wipe|blank slate|forgive|let go|move on|change|transform|shed|release|break free|liberat|emancip|escape|open|door|window|horizon|courage|brave|bold|strong|power|warrior|rise|stand up|fight|overcome|angry|frustrat|furious|rage|fed up/,
    clarity: /clarity|clear|focus|sharp|precise|certain|understand|insight|realiz|epiphany|aha|eureka|see|vision|perspectiv|truth|honest|authenti|real|genuine|raw|simple|minimal|clean|pure|crystal|diamond|glass|transparent|obvious|answer|solution|resolve|decide|direction|path|way forward|know|wisdom|intelligent|smart/,
    uplift: /uplift|upbeat|cheerful|excit|energi|pump|hype|motiv|inspir|empower|elevat|soar|fly|rise|ascend|peak|summit|triumph|victory|win|success|achiev|celebrat|party|dance|move|groove|rhythm|beat|bounce|alive|vibrant|electric|spark|fire|ignite|passion|thrill|adventure|fun|play|enjoy|freedom|techno|house|trance|edm|rave|club|dj|bass|drop|bpm/,
    reading: /read|study|work|focus|concentrat|productive|book|write|writing|journal|learn|homework|assignment|project|code|coding|program|think|analyz|research|library|desk|office|lofi|lo-fi|jazz|coffee|cafe|background|ambient noise|steady|continuous|monoton|consistent/,
    creative: /creativ|create|art|paint|draw|design|craft|make|build|imagin|invent|innovate|experiment|explore|discover|wander|curious|playful|weird|unusual|strange|different|unique|original|fresh|new|novel|unexpected|surpris|color|vivid|wild|abstract|surreal|psychedel|trippy|electronic|synth|futur|ambient electro/,
    pain: /pain|hurt|ache|sore|throb|cramp|tender|sting|burn|discomfort|chronic|migrain|headach|backach|joint|muscle|inflam|injur|surgery|recover|heal|relief|numb|tense|stiff|fibro|arthriti|neuropath|sciatica|spasm|swollen|wound|suffer|agony|distress|body|physical/
  };

  // Score each intent
  const scores = {};
  for (const [intent, pattern] of Object.entries(INTENT_WORDS)) {
    const matches = t.match(pattern);
    scores[intent] = matches ? matches.length : 0;
  }

  // Find highest scoring intent
  let bestIntent = null;
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      // If in calm context, only block weak matches to beat intents
      // Strong matches (score >= 2) = user explicitly wants it
      if (isCalmContext && !CALM_INTENTS.includes(intent) && score < 2) continue;
      bestScore = score;
      bestIntent = intent;
    }
  }

  console.log('[K\u00e1lma] Mood scores:', scores, '-> best:', bestIntent);
  return bestIntent;
}

function sendPrompt() {
  const input = document.getElementById('mood-prompt');
  const text = input.value.trim();
  if (!text) return;

  // Always apply to synth engine (even if on radio, in case they switch back)
  if (state.engine) state.engine.applyPromptMood(text);

  // If user types "piano", switch to generative piano mode (not radio)
  if (/\bpiano\b/i.test(text) && state.engine && state.engine._pianoMode) {
    // Kill radio stream if active — generative piano takes over
    if (state.readingStyle === 'radio' && radioAudio) {
      radioAudio.pause();
      radioAudio.src = '';
    }
    document.getElementById('player-status').textContent = '\u266b Piano mode';
    document.getElementById('mood-reset-btn').classList.remove('hidden');
    input.value = '';
    return;
  }

  // If on Consciousness Stream, switch to a stream matching the mood or genre
  if (state.readingStyle === 'radio') {
    // Check for direct genre keywords first (bypasses mood detection)
    const lowerText = text.toLowerCase();
    let genreStream = null;
    for (const [keyword, streamKey] of Object.entries(GENRE_KEYWORDS)) {
      if (lowerText.includes(keyword) && CONSCIOUSNESS_STREAMS[streamKey]) {
        genreStream = streamKey;
        break;
      }
    }

    const newIntent = genreStream || detectMoodIntent(text);
    console.log('[Kálma] Mood shift:', text, '-> intent:', newIntent, genreStream ? '(genre)' : '(mood)');
    if (newIntent) {
      const streams = CONSCIOUSNESS_STREAMS[newIntent];
      if (streams && radioAudio) {
        crossfadeRadio(newIntent, streams);

        document.getElementById('player-status').textContent = '"' + text + '" \u2014 shifting stream...';
      }
    } else {
      document.getElementById('player-status').textContent = '"' + text + '"';
    }
  } else {
    document.getElementById('player-status').textContent = '"' + text + '"';
  }

  // Show reset button after any mood shift
  document.getElementById('mood-reset-btn').classList.remove('hidden');

  input.value = '';
  setTimeout(() => startStatusRotation(), 8000);
}

document.getElementById('btn-send-prompt').addEventListener('click', sendPrompt);
document.getElementById('mood-prompt').addEventListener('keydown', e => { if (e.key === 'Enter') sendPrompt(); });

// Prompt toggle in player
document.getElementById('btn-prompt-toggle').addEventListener('click', () => {
  const area = document.getElementById('player-prompt-area');
  const btn = document.getElementById('btn-prompt-toggle');
  const isHidden = area.classList.toggle('hidden');
  btn.classList.toggle('active', !isHidden);
  document.getElementById('prompt-toggle-text').textContent = isHidden ? 'Shift mood' : 'Hide';

  if (!isHidden) document.getElementById('mood-prompt').focus();
});

let countdownInterval = null;
let countdownRemaining = 0;

document.querySelectorAll('.timer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    uiSound.click();
    document.querySelectorAll('.timer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.timer = parseInt(btn.dataset.time);

    // Clear existing countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    const display = document.getElementById('timer-display');
    if (state.timer === 0) {
      display.textContent = '';
      display.classList.add('hidden');
      return;
    }

    // Start countdown
    countdownRemaining = state.timer * 60;
    display.classList.remove('hidden');
    updateTimerDisplay();

    countdownInterval = setInterval(() => {
      if (!state.playing) return; // Only count down while playing
      countdownRemaining--;
      updateTimerDisplay();

      if (countdownRemaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        // Fade out and stop
        if (state.engine && state.engine.core) {
          state.playing = false;
          document.getElementById('play-icon').innerHTML = '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><polygon points="6,3 20,12 6,21"/></svg>';
          
          clearInterval(statusInterval);
          document.getElementById('player-status').textContent = 'Session complete';
          state.engine.core.master.gain.setTargetAtTime(0, state.engine.core.currentTime, 2);
          setTimeout(() => {
            if (state.engine) {
              if (state.engine.music) state.engine.music.stop();
              if (state.engine.binaural) state.engine.binaural.stop();
              if (state.engine.isochronic) state.engine.isochronic.stop();
              if (state.engine.meditation) state.engine.meditation.stopAll();
              if (state.engine.ambience) state.engine.ambience.stopAll();
              if (state.engine.core) state.engine.core.ctx.suspend();
              state.engine._started = false;
            }
            if (state.voice) { state.voice.stop(); state.voice = null; }
            state.scriptLoaded = false;
            wakeLockManager.onStop();
            // Transition to session complete screen
            showScreen('screen-complete');
          }, 5000);
        }
        display.textContent = '0:00';
      }
    }, 1000);
  });
});

function updateTimerDisplay() {
  const mins = Math.floor(countdownRemaining / 60);
  const secs = countdownRemaining % 60;
  document.getElementById('timer-display').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
}

const layerDisplayNames = {
  'binaural': 'Binaural Beats',
  'isochronic': 'Isochronic Tones',
  'singing-bowls': 'Tibetan Bowls',
  'whale': 'Whale Sounds',
  'heartbeat': 'Heartbeat Pulse',
  'wind-chimes': 'Wind Chimes',
  'gong': 'Deep Gong',
  'flute': 'Soft Flute',
  'chanting': 'Chanting',
  'forest': 'Calm Forest',
  'stream': 'Gentle Stream',
  'heavy-rain': 'Light Rain',
  'fireplace': 'Fireplace',
  'ocean': 'Ocean Waves',
  'meadow': 'Windy Meadow',
  'crickets': 'Night Crickets',
  'mountain': 'Mountain Breeze',
  'thunder': 'Thunderstorm',
  'cafe': 'Caf\u00e9 Murmur'
};

function updateActiveLayers() {
  const container = document.getElementById('active-layers-display');
  container.innerHTML = '';

  [...state.meditationLayers].forEach(name => {
    const tag = document.createElement('button');
    tag.className = 'active-layer-tag removable';
    tag.innerHTML = (layerDisplayNames[name] || name) + ' <span class="tag-x">&times;</span>';
    tag.addEventListener('click', () => {
      state.meditationLayers.delete(name);
      if (state.engine) state.engine.toggleMeditationLayer(name);
      updateActiveLayers();
      updateMixSliders();
    });
    container.appendChild(tag);
  });

  [...state.ambienceLayers].forEach(name => {
    const tag = document.createElement('button');
    tag.className = 'active-layer-tag removable';
    tag.innerHTML = (layerDisplayNames[name] || name) + ' <span class="tag-x">&times;</span>';
    tag.addEventListener('click', () => {
      state.ambienceLayers.delete(name);
      if (state.engine) state.engine.toggleAmbience(name);
      updateActiveLayers();
      updateMixSliders();
    });
    container.appendChild(tag);
  });

}

// Layer drawer in player
function toggleLayerDrawer() {
  const drawer = document.getElementById('layer-drawer');
  drawer.classList.toggle('hidden');
  if (!drawer.classList.contains('hidden')) {
    refreshDrawerChips();
  }
}

function refreshDrawerChips() {
  // Meditation chips
  document.querySelectorAll('#drawer-meditation .drawer-chip').forEach(chip => {
    chip.classList.toggle('active', state.meditationLayers.has(chip.dataset.layer));
  });
  // Ambience chips
  document.querySelectorAll('#drawer-ambience .drawer-chip').forEach(chip => {
    chip.classList.toggle('active', state.ambienceLayers.has(chip.dataset.ambience));
  });
  // Frequency selector
  updateDrawerFreq();
  updateDrawerLimits();
}

let statusInterval;
function startStatusRotation() {
  clearInterval(statusInterval);
  let i = 0;
  const el = document.getElementById('player-status');
  statusInterval = setInterval(() => {
    el.style.opacity = 0;
    setTimeout(() => {
      el.textContent = statusMessages[i % statusMessages.length];
      el.style.opacity = 1;
      i++;
    }, 400);
  }, 6000);
}

// ── Background Canvas — Ethereal Aura ──

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const moodPalettes = {
  unwind:        { c1: [140, 255, 160], c2: [160, 200, 255], c3: [200, 160, 255] },
  uplift:        { c1: [255, 220, 140], c2: [255, 160, 200], c3: [180, 200, 255] },
  sleep:         { c1: [120, 140, 255], c2: [160, 120, 220], c3: [100, 160, 200] },
  reading:       { c1: [160, 200, 180], c2: [180, 180, 220], c3: [140, 200, 200] },
  meditate:      { c1: [180, 140, 255], c2: [140, 220, 200], c3: [200, 180, 255] },
  introspection: { c1: [200, 140, 255], c2: [140, 160, 255], c3: [220, 180, 255] },
  reset:         { c1: [140, 240, 200], c2: [160, 200, 255], c3: [180, 255, 200] },
  clarity:       { c1: [180, 220, 255], c2: [200, 255, 220], c3: [160, 200, 240] },
  gratitude:     { c1: [255, 180, 200], c2: [200, 160, 255], c3: [255, 200, 160] },
  creative:      { c1: [255, 160, 220], c2: [160, 255, 200], c3: [220, 200, 255] },
  work:           { c1: [160, 200, 180], c2: [180, 180, 220], c3: [140, 200, 200] },
  pain:           { c1: [180, 160, 255], c2: [140, 200, 220], c3: [200, 180, 255] }
};

// Default: soft green / blue / purple (same as hover halo)
let curC1 = [150, 255, 160];
let curC2 = [160, 200, 255];
let curC3 = [200, 160, 255];
let tgtC1 = [...curC1];
let tgtC2 = [...curC2];
let tgtC3 = [...curC3];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpRGB(c, tgt, t) { return c.map((v, i) => lerp(v, tgt[i], t)); }
function rgba(rgb, a) { return 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + a + ')'; }

// Large soft glowing orbs that drift slowly
const orbs = [
  { x: 0.25, y: 0.30, r: 0.35, driftX: 0.08, driftY: 0.06, sX: 0.00015, sY: 0.0001,  ph: 0,   ci: 0 },
  { x: 0.70, y: 0.55, r: 0.30, driftX: 0.06, driftY: 0.08, sX: 0.00012, sY: 0.00014, ph: 2.1, ci: 1 },
  { x: 0.50, y: 0.75, r: 0.32, driftX: 0.07, driftY: 0.05, sX: 0.00013, sY: 0.00011, ph: 4.2, ci: 2 },
  { x: 0.15, y: 0.65, r: 0.25, driftX: 0.05, driftY: 0.07, sX: 0.00011, sY: 0.00013, ph: 1.3, ci: 0 },
  { x: 0.80, y: 0.25, r: 0.28, driftX: 0.06, driftY: 0.04, sX: 0.00014, sY: 0.00009, ph: 3.5, ci: 1 },
  { x: 0.45, y: 0.40, r: 0.22, driftX: 0.04, driftY: 0.06, sX: 0.0001,  sY: 0.00012, ph: 5.0, ci: 2 },
];

// Smaller brighter highlights
const highlights = [
  { x: 0.35, y: 0.45, r: 0.08, speed: 0.0002,  ph: 0.5, ci: 1 },
  { x: 0.60, y: 0.35, r: 0.06, speed: 0.00025, ph: 2.8, ci: 2 },
  { x: 0.55, y: 0.65, r: 0.07, speed: 0.00018, ph: 4.1, ci: 0 },
];

function drawAura(time) {
  const w = canvas.width;
  const h = canvas.height;

  // Dark base
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, w, h);

  // Transition colors smoothly
  curC1 = lerpRGB(curC1, tgtC1, 0.003);
  curC2 = lerpRGB(curC2, tgtC2, 0.003);
  curC3 = lerpRGB(curC3, tgtC3, 0.003);
  const colors = [curC1, curC2, curC3];

  // Draw orbs — strong presence
  orbs.forEach(orb => {
    const ox = (orb.x + Math.sin(time * orb.sX + orb.ph) * orb.driftX) * w;
    const oy = (orb.y + Math.cos(time * orb.sY + orb.ph) * orb.driftY) * h;
    const breathe = 0.85 + 0.15 * Math.sin(time * 0.0003 + orb.ph);
    const r = orb.r * Math.min(w, h) * breathe;
    const opBreath = 0.7 + 0.3 * Math.sin(time * 0.0004 + orb.ph + 1);
    const c = colors[orb.ci];

    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    grad.addColorStop(0,   rgba(c, 0.45 * opBreath));
    grad.addColorStop(0.15, rgba(c, 0.35 * opBreath));
    grad.addColorStop(0.35, rgba(c, 0.20 * opBreath));
    grad.addColorStop(0.6, rgba(c, 0.08 * opBreath));
    grad.addColorStop(1,   rgba(c, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  // Draw highlights — brighter accents
  highlights.forEach(hl => {
    const hx = (hl.x + Math.sin(time * hl.speed + hl.ph) * 0.12) * w;
    const hy = (hl.y + Math.cos(time * hl.speed * 0.8 + hl.ph) * 0.10) * h;
    const hr = hl.r * Math.min(w, h) * 1.5;
    const hop = 0.6 + 0.4 * Math.sin(time * 0.0005 + hl.ph);
    const c = colors[hl.ci];
    const bc = c.map(v => Math.min(255, v + 60));

    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    grad.addColorStop(0,   rgba(bc, 0.30 * hop));
    grad.addColorStop(0.3, rgba(c, 0.15 * hop));
    grad.addColorStop(0.7, rgba(c, 0.05 * hop));
    grad.addColorStop(1,   rgba(c, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  requestAnimationFrame(drawAura);
}

requestAnimationFrame(drawAura);

function updateBackgroundMood(intent) {
  const mc = moodPalettes[intent];
  if (mc) {
    tgtC1 = [...mc.c1];
    tgtC2 = [...mc.c2];
    tgtC3 = [...mc.c3];
  }
}
