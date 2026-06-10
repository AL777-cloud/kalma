/* Kálma — Ambience Engine
   Synthesized environmental soundscapes using noise + filters */

class EngineAmbience {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.ambienceBus;
    this.layers = {};
    this._noiseBuffer = null;
    this._audioCache = {};
  }

  // Real audio file mappings with start offset and volume normalization
  static AUDIO_FILES = {
    'ocean': { url: './audio/ambience/ocean-waves.mp3', startAt: 5, volume: 0.45 },
    'stream': { url: './audio/ambience/mountain-stream.mp3', startAt: 3, volume: 0.25 },
    'heavy-rain': { url: './audio/ambience/rain-tokyo.mp3', startAt: 4, volume: 0.4 },
    'fireplace': { url: './audio/ambience/fire-campfire.mp3', startAt: 5, volume: 0.4 }
  };

  // Shared noise buffer (reused across layers)
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

  _makeNoise(loop) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(4);
    src.loop = loop !== false;
    return src;
  }

  async toggle(name) {
    if (this.layers[name]) {
      this.layers[name].stop();
      delete this.layers[name];
    } else {
      // Try real audio file first
      const audioFile = EngineAmbience.AUDIO_FILES[name];
      if (audioFile) {
        const layer = await this._createAudioLayer(name, audioFile.url, audioFile.startAt || 0, audioFile.volume || 0.4);
        if (layer) {
          layer.start();
          this.layers[name] = layer;
          return;
        }
      }
      // Fall back to synth
      const factory = EngineAmbience.FACTORIES[name];
      if (!factory) return;
      const layer = factory(this);
      layer.start();
      this.layers[name] = layer;
    }
  }

  // Create a layer from a real audio file (looped)
  async _createAudioLayer(name, url, startOffset, fileVolume) {
    try {
      let buffer = this._audioCache[name];
      if (!buffer) {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const arrayBuf = await resp.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arrayBuf);
        this._audioCache[name] = buffer;
      }

      // Crossfade looping: two sources overlap at loop boundaries
      const masterGain = this.ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.gain.setTargetAtTime(fileVolume, this.ctx.currentTime, 1.5);
      masterGain.connect(this.output);

      let alive = true;
      let currentSource = null;
      let loopTimer = null;
      const crossfadeDuration = 3; // seconds of overlap
      const ctx = this.ctx;
      const offset = startOffset || 0;

      function playInstance(isFirst) {
        if (!alive) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const fadeGain = ctx.createGain();
        fadeGain.gain.value = 0;

        src.connect(fadeGain);
        fadeGain.connect(masterGain);

        const now = ctx.currentTime;
        // Fade in
        fadeGain.gain.setTargetAtTime(1, now, 0.8);

        // Start from offset on first play to skip silence
        const playOffset = isFirst ? offset : offset;
        src.start(0, playOffset);
        currentSource = src;

        // Schedule next instance to start before this one ends (crossfade)
        const effectiveDuration = buffer.duration - playOffset;
        const loopTime = (effectiveDuration - crossfadeDuration) * 1000;
        loopTimer = setTimeout(() => {
          // Fade out current
          fadeGain.gain.setTargetAtTime(0, ctx.currentTime, 1.0);
          setTimeout(() => {
            try { src.stop(); src.disconnect(); } catch(e) {}
            try { fadeGain.disconnect(); } catch(e) {}
          }, 3000);
          // Start next
          playInstance(false);
        }, Math.max(loopTime, 5000));
      }

      playInstance(true);
      console.log('[K\u00e1lma Ambience] Playing real audio (crossfade loop):', name);

      return {
        start() {},
        stop() {
          alive = false;
          if (loopTimer) clearTimeout(loopTimer);
          masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
          setTimeout(() => {
            try { currentSource.stop(); currentSource.disconnect(); } catch(e) {}
            try { masterGain.disconnect(); } catch(e) {}
          }, 2000);
        }
      };
    } catch (e) {
      console.warn('[K\u00e1lma Ambience] Failed to load audio:', name, e);
      return null;
    }
  }

  stopAll() {
    Object.values(this.layers).forEach(l => l.stop());
    this.layers = {};
  }

  static FACTORIES = {

    // Calm Forest — filtered noise + random bird chirps
    'forest': (eng) => {
      let alive = true;
      let nodes = [];
      let timer;
      const ctx = eng.ctx, out = eng.output;

      function birds() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = 2500 + Math.random() * 2000;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.frequency.setTargetAtTime(freq * (0.9 + Math.random() * 0.3), now + 0.05, 0.03);
        osc.frequency.setTargetAtTime(freq * (0.85 + Math.random() * 0.2), now + 0.12, 0.02);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(0.015, now, 0.01);
        g.gain.setTargetAtTime(0, now + 0.15, 0.05);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 0.6);
        timer = setTimeout(birds, 3000 + Math.random() * 8000);
      }

      return {
        start() {
          const noise = eng._makeNoise();
          const filt = ctx.createBiquadFilter();
          filt.type = 'bandpass'; filt.frequency.value = 400; filt.Q.value = 0.3;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.04, ctx.currentTime, 2);
          noise.connect(filt); filt.connect(g); g.connect(out);
          noise.start(); nodes.push(noise, filt, g);
          birds();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          nodes.forEach(n => {
            if (n.gain) n.gain.setTargetAtTime(0, now, 0.5);
          });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Gentle Stream — modulated filtered noise
    'stream': (eng) => {
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;
      return {
        start() {
          const noise = eng._makeNoise();
          const filt = ctx.createBiquadFilter();
          filt.type = 'bandpass'; filt.frequency.value = 2000; filt.Q.value = 0.5;
          const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.15;
          const lfoG = ctx.createGain(); lfoG.gain.value = 500;
          lfo.connect(lfoG); lfoG.connect(filt.frequency);
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
          noise.connect(filt); filt.connect(g); g.connect(out);
          noise.start(); lfo.start();
          nodes.push(noise, filt, lfo, lfoG, g);
        },
        stop() {
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Light Rain — pink-ish noise, gentle
    'light-rain': (eng) => {
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;
      return {
        start() {
          const noise = eng._makeNoise();
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.06, ctx.currentTime, 2);
          noise.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
          noise.start();
          nodes.push(noise, hp, lp, g);
        },
        stop() {
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Heavy Downpour — louder broadband noise with occasional rumble
    'heavy-rain': (eng) => {
      let nodes = [];
      let alive = true, timer;
      const ctx = eng.ctx, out = eng.output;

      function rumble() {
        if (!alive) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = 30 + Math.random() * 30;
        const g = ctx.createGain(); g.gain.value = 0;
        g.gain.setTargetAtTime(0.06, now, 0.3);
        g.gain.setTargetAtTime(0, now + 0.5, 1);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 4);
        timer = setTimeout(rumble, 6000 + Math.random() * 12000);
      }

      return {
        start() {
          const noise = eng._makeNoise();
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
          noise.connect(hp); hp.connect(g); g.connect(out);
          noise.start(); nodes.push(noise, hp, g);
          rumble();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Fireplace — random filtered bursts (crackle)
    'fireplace': (eng) => {
      let alive = true, timer;
      const ctx = eng.ctx, out = eng.output;
      let baseNodes = [];

      function crackle() {
        if (!alive) return;
        const now = ctx.currentTime;
        const len = ctx.sampleRate * 0.04;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass';
        filt.frequency.value = 1000 + Math.random() * 3000; filt.Q.value = 1;
        const g = ctx.createGain(); g.gain.value = 0.04 + Math.random() * 0.04;
        src.connect(filt); filt.connect(g); g.connect(out);
        src.start(now);
        timer = setTimeout(crackle, 50 + Math.random() * 200);
      }

      return {
        start() {
          // Base low rumble
          const noise = eng._makeNoise();
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.04, ctx.currentTime, 1);
          noise.connect(lp); lp.connect(g); g.connect(out);
          noise.start(); baseNodes.push(noise, lp, g);
          crackle();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          baseNodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => baseNodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Ocean Waves — rhythmic filtered noise sweep
    'ocean': (eng) => {
      let alive = true;
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;

      return {
        start() {
          const noise = eng._makeNoise();
          const filt = ctx.createBiquadFilter();
          filt.type = 'lowpass'; filt.frequency.value = 400; filt.Q.value = 0.5;

          // LFO sweeps filter to simulate wave rhythm
          const lfo = ctx.createOscillator(); lfo.type = 'sine';
          lfo.frequency.value = 0.08; // ~5 sec per wave
          const lfoG = ctx.createGain(); lfoG.gain.value = 350;
          lfo.connect(lfoG); lfoG.connect(filt.frequency);

          // Volume also swells with waves
          const volLfo = ctx.createOscillator(); volLfo.type = 'sine';
          volLfo.frequency.value = 0.08;
          const volLfoG = ctx.createGain(); volLfoG.gain.value = 0.03;

          const g = ctx.createGain(); g.gain.value = 0.04;
          volLfo.connect(volLfoG); volLfoG.connect(g.gain);

          noise.connect(filt); filt.connect(g); g.connect(out);
          noise.start(); lfo.start(); volLfo.start();
          nodes.push(noise, filt, lfo, lfoG, volLfo, volLfoG, g);
        },
        stop() {
          alive = false;
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Windy Meadow — modulated noise with gentle gusts
    'meadow': (eng) => {
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;
      return {
        start() {
          const noise = eng._makeNoise();
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
          bp.frequency.value = 600; bp.Q.value = 0.4;
          const lfo = ctx.createOscillator(); lfo.type = 'sine';
          lfo.frequency.value = 0.06;
          const lfoG = ctx.createGain(); lfoG.gain.value = 300;
          lfo.connect(lfoG); lfoG.connect(bp.frequency);
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.06, ctx.currentTime, 2);
          noise.connect(bp); bp.connect(g); g.connect(out);
          noise.start(); lfo.start();
          nodes.push(noise, bp, lfo, lfoG, g);
        },
        stop() {
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Nighttime Crickets — high-freq rhythmic chirps
    'crickets': (eng) => {
      let alive = true, timer;
      const ctx = eng.ctx, out = eng.output;

      function chirp() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = 4000 + Math.random() * 2000;
        const pulses = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < pulses; i++) {
          const t = now + i * 0.06;
          const osc = ctx.createOscillator(); osc.type = 'sine';
          osc.frequency.value = freq;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.02, t, 0.003);
          g.gain.setTargetAtTime(0, t + 0.02, 0.01);
          osc.connect(g); g.connect(out);
          osc.start(t); osc.stop(t + 0.08);
        }
        timer = setTimeout(chirp, 800 + Math.random() * 3000);
      }

      return {
        start() { chirp(); },
        stop() { alive = false; clearTimeout(timer); }
      };
    },

    // Mountain Breeze — very gentle filtered white noise
    'mountain': (eng) => {
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;
      return {
        start() {
          const noise = eng._makeNoise();
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
          bp.frequency.value = 800; bp.Q.value = 0.2;
          const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04;
          const lfoG = ctx.createGain(); lfoG.gain.value = 200;
          lfo.connect(lfoG); lfoG.connect(bp.frequency);
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.035, ctx.currentTime, 3);
          noise.connect(bp); bp.connect(g); g.connect(out);
          noise.start(); lfo.start();
          nodes.push(noise, bp, lfo, lfoG, g);
        },
        stop() {
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Thunderstorm — rain + distant rumbles
    'thunder': (eng) => {
      let alive = true, timer;
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;

      function rumble() {
        if (!alive) return;
        const now = ctx.currentTime;
        const noise = eng._makeNoise(false);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 100;
        const g = ctx.createGain(); g.gain.value = 0;
        g.gain.setTargetAtTime(0.15, now, 0.1);
        g.gain.setTargetAtTime(0, now + 0.4, 1.5);
        noise.connect(lp); lp.connect(g); g.connect(out);
        noise.start(now);
        timer = setTimeout(rumble, 8000 + Math.random() * 20000);
      }

      return {
        start() {
          // Rain base
          const noise = eng._makeNoise();
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.5);
          noise.connect(hp); hp.connect(g); g.connect(out);
          noise.start(); nodes.push(noise, hp, g);
          rumble();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    },

    // Café Murmur — low filtered noise + occasional clink
    'cafe': (eng) => {
      let alive = true, timer;
      let nodes = [];
      const ctx = eng.ctx, out = eng.output;

      function clink() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = 3000 + Math.random() * 2000;
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain(); g.gain.value = 0;
        g.gain.setTargetAtTime(0.01, now, 0.002);
        g.gain.setTargetAtTime(0, now + 0.02, 0.15);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 0.8);
        timer = setTimeout(clink, 4000 + Math.random() * 10000);
      }

      return {
        start() {
          const noise = eng._makeNoise();
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
          bp.frequency.value = 350; bp.Q.value = 0.3;
          const g = ctx.createGain(); g.gain.value = 0;
          g.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
          noise.connect(bp); bp.connect(g); g.connect(out);
          noise.start(); nodes.push(noise, bp, g);
          clink();
        },
        stop() {
          alive = false; clearTimeout(timer);
          const now = ctx.currentTime;
          nodes.forEach(n => { if (n.gain) n.gain.setTargetAtTime(0, now, 0.5); });
          setTimeout(() => nodes.forEach(n => { try { n.stop ? n.stop() : null; n.disconnect(); } catch(e){} }), 2000);
        }
      };
    }
  };
}
