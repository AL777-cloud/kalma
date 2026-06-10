/* Kálma Player — Layers Engine
   Binaural beats, isochronic tones, meditation layers, synthesized ambience */

class KalmaLayers {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.layersBus = core.layersBus;
    this.ambienceBus = core.ambienceBus;
    this.active = {};        // active layer instances
    this.binauralFreq = 'delta';
    this.isochronicFreq = 'theta';
    this._noiseBuffer = null;
  }

  toggle(name) {
    if (this.active[name]) {
      this.active[name].stop();
      delete this.active[name];
    } else {
      const layer = this._create(name);
      if (layer) {
        layer.start();
        this.active[name] = layer;
      }
    }
  }

  isActive(name) { return !!this.active[name]; }

  stopAll() {
    Object.values(this.active).forEach(l => l.stop());
    this.active = {};
  }

  setBinauralFreq(preset) {
    this.binauralFreq = preset;
    if (this.active.binaural) {
      this.active.binaural.setFreq(preset);
    }
  }

  setIsochronicFreq(preset) {
    this.isochronicFreq = preset;
    if (this.active.isochronic) {
      this.active.isochronic.setFreq(preset);
    }
  }

  _create(name) {
    const ctx = this.ctx;
    const F = KalmaLayers.FACTORIES;
    if (name === 'binaural') return F.binaural(ctx, this.layersBus, this.binauralFreq);
    if (name === 'isochronic') return F.isochronic(ctx, this.layersBus, this.isochronicFreq);
    // Beats are now controlled via the dedicated beats toggle + adaptive engine
    // (no longer a selectable meditation layer)
    if (F[name]) return F[name](ctx, this.layersBus);
    // Ambience layers
    const AF = KalmaLayers.AMBIENCE;
    if (AF[name]) return AF[name](ctx, this.ambienceBus, this);
    return null;
  }

  _getNoiseBuffer(seconds) {
    if (this._noiseBuffer && this._noiseBuffer.duration >= seconds) return this._noiseBuffer;
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this._noiseBuffer = buf;
    return buf;
  }

  _makeNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(4);
    src.loop = true;
    return src;
  }

  /* ═══ FACTORIES ═══ */
  static FACTORIES = {

    // ── Binaural Beats ──
    binaural: (ctx, out, freqPreset) => {
      const PRESETS = { delta: { beat: 2, base: 150 }, theta: { beat: 6, base: 200 }, alpha: { beat: 10, base: 220 }, beta: { beat: 20, base: 250 } };
      let p = PRESETS[freqPreset] || PRESETS.delta;
      let oscL, oscR, gainL, gainR, panL, panR;
      return {
        start() {
          const now = ctx.currentTime;
          oscL = ctx.createOscillator(); oscL.type = 'sine'; oscL.frequency.value = p.base;
          oscR = ctx.createOscillator(); oscR.type = 'sine'; oscR.frequency.value = p.base + p.beat;
          gainL = ctx.createGain(); gainL.gain.value = 0;
          gainR = ctx.createGain(); gainR.gain.value = 0;
          panL = ctx.createStereoPanner(); panL.pan.value = -1;
          panR = ctx.createStereoPanner(); panR.pan.value = 1;
          oscL.connect(gainL); gainL.connect(panL); panL.connect(out);
          oscR.connect(gainR); gainR.connect(panR); panR.connect(out);
          oscL.start(now); oscR.start(now);
          gainL.gain.setTargetAtTime(0.12, now, 3);
          gainR.gain.setTargetAtTime(0.12, now, 3);
        },
        stop() {
          const now = ctx.currentTime;
          if (gainL) gainL.gain.setTargetAtTime(0, now, 2);
          if (gainR) gainR.gain.setTargetAtTime(0, now, 2);
          setTimeout(() => {
            [oscL, oscR].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
            [gainL, gainR, panL, panR].forEach(n => { try { n.disconnect(); } catch(e){} });
          }, 7000);
        },
        setFreq(preset) {
          p = PRESETS[preset] || p;
          const now = ctx.currentTime;
          if (oscL) oscL.frequency.setTargetAtTime(p.base, now, 0.5);
          if (oscR) oscR.frequency.setTargetAtTime(p.base + p.beat, now, 0.5);
        }
      };
    },

    // ── Isochronic Tones ──
    isochronic: (ctx, out, freqPreset) => {
      const PRESETS = { delta: { pulse: 2, carrier: 200 }, theta: { pulse: 6, carrier: 300 }, alpha: { pulse: 10, carrier: 350 }, beta: { pulse: 20, carrier: 400 } };
      let p = PRESETS[freqPreset] || PRESETS.theta;
      let carrier, modulator, modGain, outputGain, shaper;
      return {
        start() {
          const now = ctx.currentTime;
          carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = p.carrier;
          outputGain = ctx.createGain(); outputGain.gain.value = 0.1;
          modulator = ctx.createOscillator(); modulator.type = 'sine'; modulator.frequency.value = p.pulse;
          shaper = ctx.createWaveShaper();
          const curve = new Float32Array(256);
          for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128) - 1) * 3);
          shaper.curve = curve;
          modGain = ctx.createGain(); modGain.gain.value = 0;
          modulator.connect(shaper); shaper.connect(modGain); modGain.connect(outputGain.gain);
          carrier.connect(outputGain); outputGain.connect(out);
          carrier.start(now); modulator.start(now);
          modGain.gain.setTargetAtTime(0.1, now, 3);
        },
        stop() {
          const now = ctx.currentTime;
          if (modGain) modGain.gain.setTargetAtTime(0, now, 2);
          if (outputGain) outputGain.gain.setTargetAtTime(0, now, 2);
          setTimeout(() => {
            [carrier, modulator].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
            [shaper, modGain, outputGain].forEach(n => { try { n.disconnect(); } catch(e){} });
          }, 7000);
        },
        setFreq(preset) {
          p = PRESETS[preset] || p;
          const now = ctx.currentTime;
          if (carrier) carrier.frequency.setTargetAtTime(p.carrier, now, 0.3);
          if (modulator) modulator.frequency.setTargetAtTime(p.pulse, now, 0.3);
        }
      };
    },

    // ── Tibetan Singing Bowls ──
    'singing-bowls': (ctx, out) => {
      let alive = true, timer, nodes = [];
      let masterGain;
      const baseFreqs = [174, 262, 349, 523, 698];
      function ring() {
        if (!alive) return;
        const freq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = freq;
        const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = freq + 1.5;
        const gain = ctx.createGain(); gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.06, now, 1.5);
        gain.gain.setTargetAtTime(0, now + 4, 3);
        const dest = masterGain || out;
        osc1.connect(gain); osc2.connect(gain); gain.connect(dest);
        osc1.start(now); osc2.start(now);
        nodes.push(osc1, osc2, gain);
        setTimeout(() => { [osc1, osc2].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} }); try { gain.disconnect(); } catch(e){} }, 12000);
        timer = setTimeout(ring, 5000 + Math.random() * 7000);
      }
      return {
        start() {
          masterGain = ctx.createGain(); masterGain.gain.value = 0; masterGain.connect(out);
          masterGain.gain.setTargetAtTime(1, ctx.currentTime, 3);
          ring();
        },
        stop() {
          alive = false; clearTimeout(timer);
          if (masterGain) masterGain.gain.setTargetAtTime(0, ctx.currentTime, 2);
          setTimeout(() => { nodes.forEach(n => { try { n.disconnect(); } catch(e){} }); try { masterGain.disconnect(); } catch(e){} }, 7000);
        }
      };
    },

    // ── Heartbeat (louder) ──
    'heartbeat': (ctx, out) => {
      let alive = true, timer, masterGain;
      function beat() {
        if (!alive) return;
        const now = ctx.currentTime;
        // Double-thump: lub-dub like a real heart
        for (let i = 0; i < 2; i++) {
          const off = i * 0.15;
          // Sub bass (felt)
          const osc = ctx.createOscillator(); osc.type = 'sine';
          osc.frequency.value = i === 0 ? 55 : 42;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(i === 0 ? 0.7 : 0.5, now + off, 0.015);
          g.gain.setTargetAtTime(0, now + off + 0.1, 0.15);
          osc.connect(g); g.connect(masterGain);
          osc.start(now + off); osc.stop(now + off + 0.8);
          // Mid thump (heard on laptop/phone speakers)
          const osc2 = ctx.createOscillator(); osc2.type = 'sine';
          osc2.frequency.value = i === 0 ? 110 : 85;
          const g2 = ctx.createGain(); g2.gain.value = 0;
          g2.gain.setTargetAtTime(i === 0 ? 0.35 : 0.2, now + off, 0.01);
          g2.gain.setTargetAtTime(0, now + off + 0.06, 0.1);
          osc2.connect(g2); g2.connect(masterGain);
          osc2.start(now + off); osc2.stop(now + off + 0.6);
        }
        timer = setTimeout(beat, 1000);
      }
      return {
        start() {
          masterGain = ctx.createGain(); masterGain.gain.value = 0; masterGain.connect(out);
          masterGain.gain.setTargetAtTime(1, ctx.currentTime, 3);
          beat();
        },
        stop() {
          alive = false; clearTimeout(timer);
          if (masterGain) masterGain.gain.setTargetAtTime(0, ctx.currentTime, 2);
          setTimeout(() => { try { masterGain.disconnect(); } catch(e){} }, 7000);
        }
      };
    },

    // ── Wind Chimes ──
    'wind-chimes': (ctx, out) => {
      let alive = true, timer, masterGain;
      const freqs = [1047, 1175, 1319, 1397, 1568, 1760, 2093];
      function chime() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = freqs[Math.floor(Math.random() * freqs.length)];
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
        const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = freq * 2.76;
        const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.04, now, 0.005); g.gain.setTargetAtTime(0, now + 0.1, 0.8);
        const g2 = ctx.createGain(); g2.gain.value = 0; g2.gain.setTargetAtTime(0.015, now, 0.005); g2.gain.setTargetAtTime(0, now + 0.05, 0.4);
        osc.connect(g); g.connect(masterGain); osc2.connect(g2); g2.connect(masterGain);
        osc.start(now); osc2.start(now); osc.stop(now + 4); osc2.stop(now + 2);
        timer = setTimeout(chime, 2000 + Math.random() * 5000);
      }
      return {
        start() {
          masterGain = ctx.createGain(); masterGain.gain.value = 0; masterGain.connect(out);
          masterGain.gain.setTargetAtTime(1, ctx.currentTime, 3);
          chime();
        },
        stop() {
          alive = false; clearTimeout(timer);
          if (masterGain) masterGain.gain.setTargetAtTime(0, ctx.currentTime, 2);
          setTimeout(() => { try { masterGain.disconnect(); } catch(e){} }, 7000);
        }
      };
    },

    // ── Deep Gong ──
    'gong': (ctx, out) => {
      let alive = true, timer, masterGain;
      function hit() {
        if (!alive) return;
        const now = ctx.currentTime;
        const partials = [65, 97.5, 135, 184, 227.5];
        const vols = [0.12, 0.06, 0.04, 0.03, 0.02];
        partials.forEach((freq, i) => {
          const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq + (Math.random() - 0.5) * 2;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(vols[i], now, 0.01); g.gain.setTargetAtTime(0, now + 1, 3 + i * 0.5);
          osc.connect(g); g.connect(masterGain); osc.start(now); osc.stop(now + 15);
        });
        timer = setTimeout(hit, 12000 + Math.random() * 15000);
      }
      return {
        start() {
          masterGain = ctx.createGain(); masterGain.gain.value = 0; masterGain.connect(out);
          masterGain.gain.setTargetAtTime(1, ctx.currentTime, 3);
          hit();
        },
        stop() {
          alive = false; clearTimeout(timer);
          if (masterGain) masterGain.gain.setTargetAtTime(0, ctx.currentTime, 2);
          setTimeout(() => { try { masterGain.disconnect(); } catch(e){} }, 7000);
        }
      };
    }
  };

  /* ═══ AMBIENCE FACTORIES ═══ */
  static AMBIENCE = {

    // ── Ocean Waves ──
    'ocean': (ctx, out, engine) => {
      let alive = true, noise, gain, filter, lfo, lfoGain;
      return {
        start() {
          const now = ctx.currentTime;
          noise = engine._makeNoise();
          filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 0.5;
          lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
          lfoGain = ctx.createGain(); lfoGain.gain.value = 400;
          lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
          gain = ctx.createGain(); gain.gain.value = 0;
          noise.connect(filter); filter.connect(gain); gain.connect(out);
          noise.start(now); lfo.start(now);
          gain.gain.setTargetAtTime(0.15, now, 3);
        },
        stop() {
          alive = false; const now = ctx.currentTime;
          if (gain) gain.gain.setTargetAtTime(0, now, 2.5);
          setTimeout(() => { [noise, lfo].forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} }); [filter, gain, lfoGain].forEach(n => { try { n.disconnect(); } catch(e){} }); }, 8000);
        }
      };
    },

    // ── Light Rain ──
    'heavy-rain': (ctx, out, engine) => {
      let noise, gain, filter;
      return {
        start() {
          const now = ctx.currentTime;
          noise = engine._makeNoise();
          filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 0.3;
          gain = ctx.createGain(); gain.gain.value = 0;
          noise.connect(filter); filter.connect(gain); gain.connect(out);
          noise.start(now);
          gain.gain.setTargetAtTime(0.12, now, 3);
        },
        stop() {
          const now = ctx.currentTime;
          if (gain) gain.gain.setTargetAtTime(0, now, 2.5);
          setTimeout(() => { try { noise.stop(); noise.disconnect(); } catch(e){}; [filter, gain].forEach(n => { try { n.disconnect(); } catch(e){} }); }, 8000);
        }
      };
    },

    // ── Calm Forest ──
    'forest': (ctx, out, engine) => {
      let alive = true, noise, gain, filter, timer;
      function bird() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = 2000 + Math.random() * 2000;
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
        osc.frequency.setTargetAtTime(freq * (0.8 + Math.random() * 0.4), now + 0.1, 0.1);
        const g = ctx.createGain(); g.gain.value = 0;
        g.gain.setTargetAtTime(0.02, now, 0.01); g.gain.setTargetAtTime(0, now + 0.2, 0.15);
        osc.connect(g); g.connect(out); osc.start(now); osc.stop(now + 1);
        timer = setTimeout(bird, 3000 + Math.random() * 8000);
      }
      return {
        start() {
          const now = ctx.currentTime;
          noise = engine._makeNoise();
          filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 0.2;
          gain = ctx.createGain(); gain.gain.value = 0;
          noise.connect(filter); filter.connect(gain); gain.connect(out);
          noise.start(now); gain.gain.setTargetAtTime(0.04, now, 3);
          bird();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          if (gain) gain.gain.setTargetAtTime(0, now, 2.5);
          setTimeout(() => { try { noise.stop(); noise.disconnect(); } catch(e){}; [filter, gain].forEach(n => { try { n.disconnect(); } catch(e){} }); }, 8000);
        }
      };
    },



    // ── Fireplace (real audio) ──
    'fireplace': (ctx, out) => {
      let audio, source, gain;
      return {
        start() {
          audio = new Audio('./audio/ambience/fire-campfire.mp3');
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          gain = ctx.createGain();
          gain.gain.value = 0;
          try {
            source = ctx.createMediaElementSource(audio);
            source.connect(gain);
            gain.connect(out);
          } catch(e) {
            // Fallback: just play through default output
            audio.volume = 0;
          }
          audio.currentTime = 5; // skip intro
          audio.play().catch(() => {});
          const now = ctx.currentTime;
          gain.gain.setTargetAtTime(0.4, now, 3);
        },
        stop() {
          const now = ctx.currentTime;
          if (gain) gain.gain.setTargetAtTime(0, now, 2.5);
          setTimeout(() => {
            if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
            try { source.disconnect(); } catch(e){}
            try { gain.disconnect(); } catch(e){}
          }, 4000);
        }
      };
    },



    // ── Mountain Breeze ──
    'mountain': (ctx, out, engine) => {
      let noise, gain, filter;
      return {
        start() {
          const now = ctx.currentTime;
          noise = engine._makeNoise();
          filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 0.2;
          gain = ctx.createGain(); gain.gain.value = 0;
          noise.connect(filter); filter.connect(gain); gain.connect(out);
          noise.start(now); gain.gain.setTargetAtTime(0.06, now, 3);
        },
        stop() {
          const now = ctx.currentTime;
          if (gain) gain.gain.setTargetAtTime(0, now, 2.5);
          setTimeout(() => { try { noise.stop(); noise.disconnect(); } catch(e){}; [filter, gain].forEach(n => { try { n.disconnect(); } catch(e){} }); }, 8000);
        }
      };
    }
  };
}
