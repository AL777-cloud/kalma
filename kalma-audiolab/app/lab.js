/* ── Kálma Audio Lab — Controller ──
   Properly instantiates the Kálma Player engine classes
   and provides a minimal harness for A/B testing upgrades. */

(function() {
  'use strict';

  // ── Engine instances ──
  let core = null;
  let learning = null;
  let adaptive = null;
  let visualizer = null;
  let isPlaying = false;
  let currentEngine = 'current';
  let monitorInterval = null;

  // ── DOM refs ──
  const playBtn     = document.getElementById('play-btn');
  const statusEl    = document.getElementById('status');
  const engineLabel = document.getElementById('engine-label');
  const moodInput   = document.getElementById('mood-input');
  const moodGrid    = document.getElementById('mood-grid');
  const vizCanvas   = document.getElementById('visualizer-canvas');

  // Monitor elements
  const mon = {
    state:    document.getElementById('mon-state'),
    engine:   document.getElementById('mon-engine'),
    mood:     document.getElementById('mon-mood'),
    chord:    document.getElementById('mon-chord'),
    phrase:   document.getElementById('mon-phrase'),
    tension:  document.getElementById('mon-tension'),
    bpm:      document.getElementById('mon-bpm'),
    scale:    document.getElementById('mon-scale'),
    baseFreq: document.getElementById('mon-baseFreq'),
    filter:   document.getElementById('mon-filter'),
    reverb:   document.getElementById('mon-reverb'),
    density:  document.getElementById('mon-density'),
  };

  // ── Mood presets ──
  const moods = [
    'calm', 'dreamy', 'melancholy', 'energetic',
    'dark', 'anxious', 'happy', 'mysterious',
    'sleepy', 'nostalgic', 'tense', 'bright'
  ];

  moods.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-mood';
    btn.textContent = m;
    btn.addEventListener('click', () => applyMood(m));
    moodGrid.appendChild(btn);
  });

  moodInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && moodInput.value.trim()) {
      applyMood(moodInput.value.trim());
    }
  });

  // ── Parameter sliders ──
  const paramNames = ['baseFreq', 'filterFreq', 'reverbMix', 'density', 'detune', 'bpm', 'attack', 'release'];
  paramNames.forEach(p => {
    const slider = document.getElementById('param-' + p);
    const valEl  = document.getElementById('val-' + p);
    if (!slider || !valEl) return;
    slider.addEventListener('input', () => {
      let v = parseFloat(slider.value);
      if (p === 'reverbMix') valEl.textContent = (v / 100).toFixed(2);
      else if (['density','attack','release'].includes(p)) valEl.textContent = v.toFixed(1);
      else valEl.textContent = Math.round(v);
      if (isPlaying) pushParam(p, v);
    });
  });

  ['vaPreset', 'fmPreset', 'wtPreset'].forEach(id => {
    const sel = document.getElementById('param-' + id);
    if (sel) sel.addEventListener('change', () => {
      if (isPlaying) pushParam(id, sel.value);
    });
  });

  // ── Engine tabs ──
  document.querySelectorAll('.engine-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.engine-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentEngine = tab.dataset.engine;
      engineLabel.textContent = currentEngine === 'current'
        ? 'Engine: Current (Kálma Player v1)'
        : 'Engine: Upgraded (experimental)';
      mon.engine.textContent = currentEngine;
      if (currentEngine === 'upgraded') {
        statusEl.textContent = 'Upgraded engine not yet loaded — using current';
      }
    });
  });

  // ── Play / Stop ──
  playBtn.addEventListener('click', () => {
    if (!isPlaying) startEngine();
    else stopEngine();
  });

  function startEngine() {
    try {
      // 1. Core — creates AudioContext, master gain, reverb, buses
      if (!core) {
        core = new KalmaCore();
        core.init();
        console.log('[AudioLab] KalmaCore initialized, ctx:', core.ctx.state);
      }

      // Resume if suspended
      if (core.ctx.state === 'suspended') {
        core.ctx.resume().then(() => console.log('[AudioLab] AudioContext resumed'));
      }

      // 2. Learning engine
      if (!learning) {
        learning = new KalmaLearning();
      }

      // 3. Adaptive engine — creates MusicBrain, MelodyEngine, KalmaBeats internally
      if (!adaptive) {
        adaptive = new AdaptiveEngine(core);
        adaptive.brain.setLearning(learning);
        console.log('[AudioLab] AdaptiveEngine created');
      }

      // 4. Set an initial mood so there's something to play
      adaptive.applyPromptMood('calm ambient dreamy');

      // 5. Start the engine (begins drone voices, chord progression)
      adaptive.start();

      // 6. Fade in master — this is what actually makes sound audible
      core.setMasterVolume(1.0);
      core.fadeIn(3);

      // 7. Visualizer
      if (!visualizer) {
        visualizer = new KalmaVisualizer();
      }
      if (vizCanvas) {
        vizCanvas.width = vizCanvas.parentElement.clientWidth;
        vizCanvas.height = vizCanvas.parentElement.clientHeight;
        // The visualizer needs an analyser node connected to the audio graph
        if (!core._labAnalyser) {
          core._labAnalyser = core.ctx.createAnalyser();
          core._labAnalyser.fftSize = 256;
          core.master.connect(core._labAnalyser);
        }
        startLabVisualizer();
      }

      isPlaying = true;
      playBtn.textContent = 'Stop';
      playBtn.classList.add('active');
      statusEl.textContent = 'Engine running — sound fading in...';
      mon.state.textContent = 'playing';
      startMonitor();

      // Update status after fade
      setTimeout(() => {
        if (isPlaying) statusEl.textContent = 'Engine running';
      }, 3500);

    } catch (err) {
      console.error('[AudioLab] Start failed:', err);
      statusEl.textContent = 'Error: ' + err.message;
    }
  }

  function stopEngine() {
    try {
      // Fade out then stop
      if (core) core.fadeOut(2);

      setTimeout(() => {
        if (adaptive) {
          adaptive.stop();
        }
        stopLabVisualizer();
      }, 2500);

    } catch (e) {
      console.warn('[AudioLab] Stop error:', e);
    }

    isPlaying = false;
    playBtn.textContent = 'Play';
    playBtn.classList.remove('active');
    statusEl.textContent = 'Stopped';
    mon.state.textContent = 'stopped';
    stopMonitor();
  }

  // ── Mood application ──
  function applyMood(mood) {
    document.querySelectorAll('.btn-mood').forEach(b => {
      b.classList.toggle('active', b.textContent === mood);
    });
    moodInput.value = mood;
    mon.mood.textContent = mood;

    if (adaptive) {
      // Use the brain's rule-based interpretation (no LLM needed in lab)
      adaptive.applyPromptMood(mood);
      // Sync sliders from the adaptive engine's current params
      syncSlidersFromEngine();
    }
    statusEl.textContent = 'Mood: ' + mood;
  }

  function syncSlidersFromEngine() {
    if (!adaptive) return;
    const p = adaptive.params;
    if (p.baseFreq) setSlider('baseFreq', p.baseFreq);
    if (p.filterFreq) setSlider('filterFreq', p.filterFreq);
    if (p.reverbMix != null) setSlider('reverbMix', p.reverbMix * 100);
    if (p.density) setSlider('density', p.density);
    if (p.detune) setSlider('detune', p.detune);
    if (p.bpm) setSlider('bpm', p.bpm || 72);
    if (p.attack) setSlider('attack', p.attack);
    if (p.release) setSlider('release', p.release);
  }

  function setSlider(name, value) {
    const slider = document.getElementById('param-' + name);
    const valEl  = document.getElementById('val-' + name);
    if (!slider) return;
    slider.value = value;
    if (name === 'reverbMix') valEl.textContent = (value / 100).toFixed(2);
    else if (['density','attack','release'].includes(name)) valEl.textContent = parseFloat(value).toFixed(1);
    else valEl.textContent = Math.round(value);
  }

  function pushParam(param, value) {
    if (!adaptive) return;
    // Map slider values to engine params
    const map = {
      baseFreq:  v => { adaptive.params.baseFreq = v; },
      filterFreq:v => { adaptive.params.filterFreq = v; },
      reverbMix: v => { core.setReverbAmount(v / 100); adaptive.params.reverbMix = v / 100; },
      density:   v => { adaptive.params.density = v; },
      detune:    v => { adaptive.params.detune = v; },
      bpm:       v => { adaptive.params.bpm = v; if (adaptive.beats) adaptive.beats.setBPM(v); },
      attack:    v => { adaptive.params.attack = v; },
      release:   v => { adaptive.params.release = v; },
      vaPreset:  v => { if (adaptive.vaSynth) adaptive.vaSynth.setPreset(v); },
      fmPreset:  v => { if (adaptive.fmSynth) adaptive.fmSynth.setPreset(v); },
      wtPreset:  v => { if (adaptive.wavetable) adaptive.wavetable.setPreset(v); },
    };
    if (map[param]) map[param](value);
  }

  // ── Simple visualizer (frequency bars) ──
  let vizAnimId = null;

  function startLabVisualizer() {
    if (!core || !core._labAnalyser) return;
    const ctx2d = vizCanvas.getContext('2d');
    const analyser = core._labAnalyser;
    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);

    function draw() {
      vizAnimId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArr);

      const w = vizCanvas.width;
      const h = vizCanvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const barW = (w / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (dataArr[i] / 255) * h * 0.8;
        const hue = 260 + (i / bufLen) * 40; // purple range
        ctx2d.fillStyle = `hsla(${hue}, 60%, 60%, 0.6)`;
        ctx2d.fillRect(x, h - barH, barW - 1, barH);
        x += barW;
        if (x > w) break;
      }
    }
    draw();
  }

  function stopLabVisualizer() {
    if (vizAnimId) {
      cancelAnimationFrame(vizAnimId);
      vizAnimId = null;
    }
  }

  // ── Monitor updates ──
  function startMonitor() {
    stopMonitor();
    monitorInterval = setInterval(updateMonitor, 500);
  }

  function stopMonitor() {
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = null;
  }

  function updateMonitor() {
    if (!adaptive) return;
    try {
      const p = adaptive.params;
      mon.baseFreq.textContent = Math.round(p.baseFreq || 0) + ' Hz';
      mon.filter.textContent = Math.round(p.filterFreq || 0) + ' Hz';
      mon.reverb.textContent = (p.reverbMix || 0).toFixed(2);
      mon.density.textContent = (p.density || 0).toFixed(1);
      mon.bpm.textContent = Math.round(p.bpm || 0);
      mon.scale.textContent = JSON.stringify(p.scale || []);

      if (p.chords && p.chords.length > 0) {
        mon.chord.textContent = JSON.stringify(p.chords[0]);
      }

      // Phrase/tension from melody engine if available
      if (adaptive.melody && adaptive.melody._phraseEngine) {
        const pe = adaptive.melody._phraseEngine;
        mon.phrase.textContent = pe.phase || '—';
        mon.tension.textContent = pe.tension != null ? pe.tension.toFixed(2) : '—';
      }
    } catch (e) { /* silent */ }
  }

  // ── Canvas resize ──
  function resizeCanvas() {
    if (vizCanvas && vizCanvas.parentElement) {
      vizCanvas.width = vizCanvas.parentElement.clientWidth;
      vizCanvas.height = vizCanvas.parentElement.clientHeight;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ── Init ──
  statusEl.textContent = 'Ready — tap Play to start engine';
  mon.engine.textContent = currentEngine;

  // Log available classes
  console.log('[AudioLab] Classes available:', {
    KalmaCore: typeof KalmaCore,
    AdaptiveEngine: typeof AdaptiveEngine,
    MusicBrain: typeof MusicBrain,
    MelodyEngine: typeof MelodyEngine,
    KalmaBeats: typeof KalmaBeats,
    KalmaLayers: typeof KalmaLayers,
    KalmaLearning: typeof KalmaLearning,
    KalmaVisualizer: typeof KalmaVisualizer,
    VASynth: typeof VASynth,
    FMSynth: typeof FMSynth,
    WavetableSynth: typeof WavetableSynth,
  });

})();
