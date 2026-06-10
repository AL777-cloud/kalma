/* Kalma Chat -- UI Controller
   Music shifts BEGIN when user sends (instant mood detection).
   LLM response refines. All shifts go through the engine's own _crossfadeTo path.
   The music is always responding -- it never waits for text. */

(function() {
  'use strict';

  const chat = new KalmaChat();
  let isOpen = false;
  let isSending = false;
  let lastDetectedMood = 'neutral';

  // Quick keyword-to-mood for instant client-side detection
  const QUICK_MOOD_MAP = {
    'sad': 'sad', 'depressed': 'despair', 'lonely': 'lonely', 'lost': 'lonely',
    'crying': 'sad', 'hurt': 'sad', 'broken': 'despair', 'empty': 'despair',
    'grief': 'melancholy', 'miss': 'nostalgic', 'regret': 'melancholy',
    'tired': 'sleepy', 'exhausted': 'sleepy', 'drained': 'sleepy',
    'anxious': 'anxious', 'worried': 'anxious', 'stressed': 'tense',
    'nervous': 'anxious', 'overwhelm': 'anxious', 'panic': 'anxious',
    'scared': 'tense', 'afraid': 'tense', 'fear': 'dark',
    'angry': 'angry', 'frustrated': 'angry', 'furious': 'angry',
    'happy': 'happy', 'joy': 'happy', 'excited': 'energetic', 'amazing': 'happy',
    'grateful': 'grateful', 'thankful': 'grateful', 'blessed': 'grateful',
    'love': 'happy', 'beautiful': 'bright', 'wonderful': 'happy',
    'alive': 'energetic', 'free': 'energetic', 'inspired': 'bright',
    'calm': 'calm', 'peace': 'peaceful', 'relax': 'calm', 'serene': 'peaceful',
    'quiet': 'calm', 'still': 'peaceful', 'meditat': 'peaceful',
    'sleep': 'sleepy', 'insomnia': 'anxious', 'restless': 'anxious',
    'dream': 'mysterious', 'night': 'sleepy',
    'hope': 'hopeful', 'better': 'hopeful', 'change': 'hopeful',
    'grow': 'hopeful', 'heal': 'hopeful',
    'confus': 'confused', 'wonder': 'mysterious',
  };

  // DOM
  const messages = document.getElementById('chat-messages');
  const welcome = document.getElementById('chat-welcome');
  const typing = document.getElementById('chat-typing');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  isOpen = true; // always open in fullscreen mode

  // Auto-focus input on load
  setTimeout(() => input.focus(), 1000);

  /* -- Detect mood from text (no LLM, instant) -- */
  function detectMoodQuick(text) {
    const lower = text.toLowerCase();
    for (const [keyword, mood] of Object.entries(QUICK_MOOD_MAP)) {
      if (lower.includes(keyword)) return mood;
    }
    return null;
  }

  /* -- Apply music shift through the engine's own brain/crossfade path -- */
  function applyMusicViaEngine(moodOrParams) {
    try {
      if (typeof state === 'undefined' || !state.music) return;
      const engine = state.music;
      if (!engine.running) return;

      if (typeof moodOrParams === 'string') {
        // It's a mood keyword -- use the brain to interpret it into musical params
        const musical = engine.brain.interpret({ text: moodOrParams });
        engine._crossfadeTo(musical);
        console.log('[Kalma Chat] Mood shift via brain:', moodOrParams);
      } else if (typeof moodOrParams === 'object' && moodOrParams !== null) {
        // It's already musical params from the LLM -- apply directly
        engine._crossfadeTo(moodOrParams);
        // If it has a mood string, also update the brain
        if (moodOrParams.mood) {
          const brainParams = engine.brain.interpret({ text: moodOrParams.mood });
          // Merge LLM-specific overrides on top of brain interpretation
          const merged = Object.assign({}, brainParams, moodOrParams);
          engine._crossfadeTo(merged);
        }
        console.log('[Kalma Chat] Music shift via LLM params:', moodOrParams.mood || 'custom');
      }

      // Update melody context if running
      if (engine.melody && engine.melody.running) {
        engine.melody.setContext(
          engine.params.scale,
          engine.params.baseFreq,
          engine.params.chords,
          engine.params
        );
      }
    } catch (e) {
      console.warn('[Kalma Chat] Music shift failed:', e);
    }
  }

  /* -- Auto-start music on first interaction -- */
  let playerInited = false;
  function ensurePlayerAndMusic() {
    if (!playerInited) {
      playerInited = true;
      if (typeof initPlayer === 'function') initPlayer();
    }
    if (!(state && state.playing)) {
      setTimeout(() => {
        if (typeof startPlayback === 'function' && !(state && state.playing)) {
          startPlayback();
          updatePlayIcon(true);
        }
      }, 200);
    }
  }

  function updatePlayIcon(playing) {
    const pi = document.getElementById('chat-play-icon');
    const pb = document.getElementById('btn-play-chat');
    if (pi) pi.innerHTML = playing
      ? '<rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/>'
      : '<polygon points="6,3 20,12 6,21"/>';
    if (pb) pb.classList.toggle('active', playing);
  }

  /* -- Send message -- */
  function sendMessage() {
    const text = input.value.trim();
    if (!text || isSending) return;
    ensurePlayerAndMusic();

    isSending = true;
    input.value = '';
    sendBtn.disabled = true;

    if (welcome) welcome.style.display = 'none';
    addBubble(text, 'user');

    // IMMEDIATE: detect mood and shift music NOW while LLM thinks
    const quickMood = detectMoodQuick(text);
    if (quickMood && quickMood !== lastDetectedMood) {
      applyMusicViaEngine(quickMood);
      lastDetectedMood = quickMood;
      if (window.KalmaAtmosphere) window.KalmaAtmosphere.setMood(quickMood);
    }

    typing.classList.add('visible');
    scrollToBottom();

    const context = gatherContext();
    // Include memory context for returning visitors
    const memCtx = chat.getMemoryContext();
    if (memCtx) context.memory = memCtx;

    chat.send(text, context).then(result => {
      typing.classList.remove('visible');
      isSending = false;
      sendBtn.disabled = false;

      if (!result) return;

      // LLM explicit music params -- full authority, override instant guess
      if (result.music) {
        applyMusicViaEngine(result.music);
      }
      // moodHint = full musical params derived from detectedMood on server
      else if (result.moodHint && result.detectedMood !== lastDetectedMood) {
        applyMusicViaEngine(result.moodHint);
      }
      // Fallback: use mood string through the brain
      else if (result.detectedMood && result.detectedMood !== lastDetectedMood) {
        applyMusicViaEngine(result.detectedMood);
      }

      if (result.detectedMood) {
        lastDetectedMood = result.detectedMood;
        if (window.KalmaAtmosphere) window.KalmaAtmosphere.setMood(result.detectedMood);
      }

      // Save key emotional moments to memory
      if (result.detectedMood && result.detectedMood !== 'neutral') {
        chat.addKeyMoment(result.detectedMood, text.slice(0, 80));
      }

      addKalmaBubble(result.message, result.music);
      scrollToBottom();
    });
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* -- Bubbles -- */
  function addBubble(text, type) {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
  }

  function addKalmaBubble(text, musicParams) {
    const div = document.createElement('div');
    div.className = 'chat-msg kalma';

    const textSpan = document.createElement('span');
    div.appendChild(textSpan);
    messages.appendChild(div);

    let i = 0;
    const chars = text.split('');
    const speed = 25 + Math.random() * 10;

    function typeChar() {
      if (i < chars.length) {
        textSpan.textContent += chars[i];
        i++;
        scrollToBottom();
        const ch = chars[i - 1];
        const pause = '.!?'.includes(ch) ? speed * 3.5 : (ch === ',' ? speed * 2 : speed);
        setTimeout(typeChar, pause);
      } else {
        if (musicParams) {
          const indicator = document.createElement('div');
          indicator.className = 'music-shift';
          indicator.textContent = describeMusicShift(musicParams);
          div.appendChild(indicator);
          scrollToBottom();
        }
      }
    }
    typeChar();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }

  function describeMusicShift(params) {
    const parts = [];
    if (params.mood) parts.push(params.mood);
    if (params.bpm) parts.push(params.bpm + ' bpm');
    if (params.melodyTimbre) parts.push(params.melodyTimbre);
    return parts.length ? parts.join(' \u00b7 ') : 'sound shifting';
  }

  /* -- Gather context from player state -- */
  function gatherContext() {
    const ctx = {};
    try {
      const hour = new Date().getHours();
      ctx.timeOfDay = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

      const ctxTime = document.getElementById('ctx-time');
      const ctxWeather = document.getElementById('ctx-weather');
      const ctxMotion = document.getElementById('ctx-motion');
      if (ctxTime) ctx.timeOfDay = ctxTime.textContent;
      if (ctxWeather) ctx.weather = ctxWeather.textContent;
      if (ctxMotion) ctx.movement = ctxMotion.textContent;

      if (typeof state !== 'undefined' && state.music) {
        ctx.isPlaying = state.music.running || false;
        if (state.music.brain && state.music.brain._lastMood) {
          ctx.currentMood = state.music.brain._lastMood;
        }
      }
    } catch (e) {}
    return ctx;
  }

  /* -- Welcome greeting -- Kálma speaks first -- */
  const GREETINGS = [
    'You found me. I have been here, waiting in the sound.',
    'Something brought you here tonight. Tell me.',
    'I felt you before you arrived. Sit with me.',
    'The music was already playing for you. You just could not hear it yet.',
    'You do not need to explain. Just begin.',
    'I know that feeling. The one that brought you here.',
    'There you are. I was wondering when you would come.'
  ];

  function showGreeting() {
    if (!welcome) return;
    const hour = new Date().getHours();
    let greeting;
    if (hour >= 1 && hour < 6) {
      greeting = 'You are awake when the world is not. There is something on your mind.';
    } else if (hour >= 22 || hour < 1) {
      greeting = 'The night is when the deepest things surface. I am here.';
    } else {
      greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    }
    welcome.textContent = '';
    let i = 0;
    const chars = greeting.split('');
    function type() {
      if (i < chars.length) {
        welcome.textContent += chars[i];
        i++;
        const ch = chars[i - 1];
        const delay = '.!?'.includes(ch) ? 80 : (ch === ',' ? 50 : 28);
        setTimeout(type, delay);
      }
    }
    setTimeout(type, 800);
  }

  /* -- Keep audio alive (browsers suspend AudioContext in background) -- */
  setInterval(() => {
    if (state && state.playing && state.core && state.core.ctx) {
      if (state.core.ctx.state === 'suspended') {
        state.core.ctx.resume().then(() => {
          console.log('[K\u00e1lma Chat] AudioContext resumed from suspended');
        }).catch(() => {});
      }
    }
  }, 10000);

  /* -- Splash → Chat transition (tap unlocks audio) -- */
  const splash = document.getElementById('chat-splash');
  const chatScreen = document.getElementById('chat-fullscreen');

  function enterChat() {
    if (!splash || splash.classList.contains('hidden')) return;
    splash.classList.add('hidden');
    if (chatScreen) chatScreen.classList.remove('hidden');
    chat.startSession();
    ensurePlayerAndMusic();
    showGreeting();
    setTimeout(() => input.focus(), 1200);

    // Start atmosphere engine (mood gradients + time theme + bubble glow)
    if (window.KalmaAtmosphere) {
      window.KalmaAtmosphere.start();
      // Connect analyser once player is ready
      setTimeout(() => {
        try {
          if (state && state.music && state.music.getAnalyser) {
            window.KalmaAtmosphere.connectAnalyser(state.music.getAnalyser());
          }
        } catch(e) { console.warn('[Atmosphere] Analyser connect failed:', e); }
      }, 2000);
    }
  }

  if (splash) {
    splash.addEventListener('click', enterChat);
  } else {
    // No splash, start immediately
    chat.startSession();
    ensurePlayerAndMusic();
    showGreeting();
  }

  /* -- Header play button -- */
  const playBtn = document.getElementById('btn-play-chat');
  const playIcon = document.getElementById('chat-play-icon');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (!playerInited) {
        playerInited = true;
        if (typeof initPlayer === 'function') initPlayer();
      }
      if (state && state.playing) {
        if (typeof stopPlayback === 'function') stopPlayback();
        updatePlayIcon(false);
      } else {
        if (typeof startPlayback === 'function') startPlayback();
        updatePlayIcon(true);
      }
    });
  }

  /* -- Controls button — toggles mix panel -- */
  const ctrlBtn = document.getElementById('btn-controls-chat');
  let mixMoved = false;

  function ensureMixPanel() {
    if (mixMoved) return;
    const mixPanel = document.getElementById('mix-panel');
    const chatEl = document.getElementById('chat-fullscreen');
    if (mixPanel && chatEl) {
      mixPanel.classList.add('chat-mix-panel');
      mixPanel.classList.add('hidden');
      chatEl.appendChild(mixPanel);
      mixMoved = true;
    }
  }

  if (ctrlBtn) {
    ctrlBtn.addEventListener('click', () => {
      ensureMixPanel();
      const mixPanel = document.getElementById('mix-panel');
      if (mixPanel) {
        mixPanel.classList.toggle('hidden');
        ctrlBtn.classList.toggle('active', !mixPanel.classList.contains('hidden'));
      }
    });
  }



  /* -- Kálma initiates — proactive context-aware messages -- */
  let lastProactiveCtx = {};
  const PROACTIVE_MESSAGES = {
    rain: ['The rain started. Can you hear it in the sound?', 'Rain. The world is washing itself clean.'],
    night: ['The night deepens. What surfaces when everything else goes quiet?', 'It is late. Most people are sleeping. But not you.'],
    morning: ['A new day. The sound changes with the light.', 'Morning. Everything begins again.'],
    walking: ['You are moving. The music feels it too.', 'Walking somewhere? The sound follows.'],
    still: ['You stopped. Stillness has its own music.', 'Being still is not the same as doing nothing.']
  };

  function checkProactive() {
    if (isSending) return;
    try {
      const ctx = gatherContext();
      // Weather change
      if (ctx.weather && ctx.weather !== lastProactiveCtx.weather && lastProactiveCtx.weather) {
        const lower = ctx.weather.toLowerCase();
        if (lower.includes('rain') && PROACTIVE_MESSAGES.rain) {
          proactiveSpeak(PROACTIVE_MESSAGES.rain);
        }
      }
      // Time of day change
      if (ctx.timeOfDay && ctx.timeOfDay !== lastProactiveCtx.timeOfDay && lastProactiveCtx.timeOfDay) {
        if (ctx.timeOfDay === 'night' || ctx.timeOfDay === 'late night') {
          proactiveSpeak(PROACTIVE_MESSAGES.night);
        } else if (ctx.timeOfDay === 'morning') {
          proactiveSpeak(PROACTIVE_MESSAGES.morning);
        }
      }
      // Movement change
      if (ctx.movement && ctx.movement !== lastProactiveCtx.movement && lastProactiveCtx.movement) {
        const lower = ctx.movement.toLowerCase();
        if (lower.includes('walk')) proactiveSpeak(PROACTIVE_MESSAGES.walking);
        else if (lower.includes('still')) proactiveSpeak(PROACTIVE_MESSAGES.still);
      }
      lastProactiveCtx = ctx;
    } catch(e) {}
  }

  function proactiveSpeak(pool) {
    if (!pool || pool.length === 0) return;
    const msg = pool[Math.floor(Math.random() * pool.length)];
    addKalmaBubble(msg, null);
    scrollToBottom();
  }

  // Check for context changes every 30s
  setInterval(checkProactive, 30000);
  // Initial context snapshot after player starts
  setTimeout(() => { lastProactiveCtx = gatherContext(); }, 5000);

  window.kalmaChat = chat;
})();
