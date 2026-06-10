/* Kálma — Meditation Layers Engine
   Synthesized: bowls, whale, heartbeat, chimes, gong, flute, chanting */

class EngineMeditation {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.output = core.layersBus;
    this.layers = {};  // active layer instances
  }

  toggle(name) {
    if (this.layers[name]) {
      this.layers[name].stop();
      delete this.layers[name];
    } else {
      const factory = EngineMeditation.FACTORIES[name];
      if (!factory) return;
      const layer = factory(this.ctx, this.output);
      layer.start();
      this.layers[name] = layer;
    }
  }

  stopAll() {
    Object.values(this.layers).forEach(l => l.stop());
    this.layers = {};
  }

  // ── Layer Factories ──

  static FACTORIES = {

    // Tibetan Singing Bowls — resonant sine tones with slow beating
    'singing-bowls': (ctx, out) => {
      let alive = true;
      let nodes = [];
      let timer;

      function ring() {
        if (!alive) return;
        // Bowl frequencies — harmonic series with slight detuning
        const baseFreqs = [174, 262, 349, 523, 698];
        const freq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq + 1.5; // slow beating
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.06, now, 0.3);
        gain.gain.setTargetAtTime(0, now + 3, 2.5); // long decay

        osc1.connect(gain); osc2.connect(gain);
        gain.connect(out);
        osc1.start(now); osc2.start(now);
        nodes.push(osc1, osc2, gain);

        setTimeout(() => {
          try { osc1.stop(); osc1.disconnect(); } catch(e){}
          try { osc2.stop(); osc2.disconnect(); } catch(e){}
          try { gain.disconnect(); } catch(e){}
        }, 9000);

        timer = setTimeout(ring, 4000 + Math.random() * 6000);
      }

      return {
        start() { ring(); },
        stop() {
          alive = false;
          clearTimeout(timer);
          nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
        }
      };
    },

    // Whale Sounds — very low frequency sweeping tones
    'whale': (ctx, out) => {
      let alive = true;
      let nodes = [];
      let timer;

      function call() {
        if (!alive) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const startFreq = 30 + Math.random() * 40;
        const endFreq = 60 + Math.random() * 80;
        osc.frequency.value = startFreq;
        osc.frequency.setTargetAtTime(endFreq, now, 2);
        osc.frequency.setTargetAtTime(startFreq * 0.8, now + 4, 2);

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.1, now, 1);
        gain.gain.setTargetAtTime(0, now + 5, 2);

        // Add subtle harmonics
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = startFreq * 2.02;
        osc2.frequency.setTargetAtTime(endFreq * 2.02, now, 2);
        const gain2 = ctx.createGain();
        gain2.gain.value = 0;
        gain2.gain.setTargetAtTime(0.03, now, 1.5);
        gain2.gain.setTargetAtTime(0, now + 5, 2);

        osc.connect(gain); gain.connect(out);
        osc2.connect(gain2); gain2.connect(out);
        osc.start(now); osc2.start(now);
        nodes.push(osc, osc2, gain, gain2);

        setTimeout(() => {
          try { osc.stop(); osc.disconnect(); osc2.stop(); osc2.disconnect(); } catch(e){}
          try { gain.disconnect(); gain2.disconnect(); } catch(e){}
        }, 12000);

        timer = setTimeout(call, 8000 + Math.random() * 10000);
      }

      return {
        start() { call(); },
        stop() {
          alive = false;
          clearTimeout(timer);
          nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
        }
      };
    },

    // Heartbeat Pulse — ~60 BPM low thump
    'heartbeat': (ctx, out) => {
      let alive = true;
      let timer;

      function beat() {
        if (!alive) return;
        const now = ctx.currentTime;

        // Double thump: lub-dub
        for (let i = 0; i < 2; i++) {
          const offset = i * 0.15;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = i === 0 ? 50 : 40;

          const gain = ctx.createGain();
          gain.gain.value = 0;
          gain.gain.setTargetAtTime(i === 0 ? 0.15 : 0.1, now + offset, 0.02);
          gain.gain.setTargetAtTime(0, now + offset + 0.08, 0.1);

          osc.connect(gain); gain.connect(out);
          osc.start(now + offset);
          osc.stop(now + offset + 0.5);
        }

        timer = setTimeout(beat, 1000); // 60 BPM
      }

      return {
        start() { beat(); },
        stop() { alive = false; clearTimeout(timer); }
      };
    },

    // Wind Chimes — random high sparkly tones
    'wind-chimes': (ctx, out) => {
      let alive = true;
      let timer;

      const chimeFreqs = [1047, 1175, 1319, 1397, 1568, 1760, 2093, 2349];

      function chime() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        // Harmonic overtone
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2.76; // inharmonic = metallic

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.04, now, 0.005); // sharp attack
        gain.gain.setTargetAtTime(0, now + 0.1, 0.8); // gentle decay

        const gain2 = ctx.createGain();
        gain2.gain.value = 0;
        gain2.gain.setTargetAtTime(0.015, now, 0.005);
        gain2.gain.setTargetAtTime(0, now + 0.05, 0.4);

        osc.connect(gain); gain.connect(out);
        osc2.connect(gain2); gain2.connect(out);
        osc.start(now); osc2.start(now);
        osc.stop(now + 4); osc2.stop(now + 2);

        timer = setTimeout(chime, 2000 + Math.random() * 5000);
      }

      return {
        start() { chime(); },
        stop() { alive = false; clearTimeout(timer); }
      };
    },

    // Deep Gong — low resonant hit with long decay
    'gong': (ctx, out) => {
      let alive = true;
      let timer;

      function hit() {
        if (!alive) return;
        const now = ctx.currentTime;

        // Fundamental
        const partials = [65, 65 * 1.5, 65 * 2.08, 65 * 2.83, 65 * 3.5];
        const gains = [0.12, 0.06, 0.04, 0.03, 0.02];

        partials.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq + (Math.random() - 0.5) * 2;
          const g = ctx.createGain();
          g.gain.value = 0;
          g.gain.setTargetAtTime(gains[i], now, 0.01);
          g.gain.setTargetAtTime(0, now + 1, 3 + i * 0.5);
          osc.connect(g); g.connect(out);
          osc.start(now);
          osc.stop(now + 15);
        });

        // Noise burst for attack
        const bufLen = ctx.sampleRate * 0.1;
        const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 4);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const ng = ctx.createGain();
        ng.gain.value = 0.08;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 120;
        filt.Q.value = 2;
        noise.connect(filt); filt.connect(ng); ng.connect(out);
        noise.start(now);

        timer = setTimeout(hit, 12000 + Math.random() * 15000);
      }

      return {
        start() { hit(); },
        stop() { alive = false; clearTimeout(timer); }
      };
    },

    // Soft Flute — sine with gentle vibrato
    'flute': (ctx, out) => {
      let alive = true;
      let osc, vibrato, vGain, gain, filt;
      let timer;
      const fluteNotes = [523, 587, 659, 698, 784, 880];

      function play() {
        if (!alive) return;
        const now = ctx.currentTime;
        const freq = fluteNotes[Math.floor(Math.random() * fluteNotes.length)];

        osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        // Vibrato
        vibrato = ctx.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 4.5 + Math.random();
        vGain = ctx.createGain();
        vGain.gain.value = 3; // subtle pitch wobble
        vibrato.connect(vGain);
        vGain.connect(osc.frequency);

        // Gentle filter
        filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 2000;
        filt.Q.value = 0.5;

        gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.06, now, 0.3);
        gain.gain.setTargetAtTime(0, now + 2.5, 1.5);

        osc.connect(filt); filt.connect(gain); gain.connect(out);
        osc.start(now); vibrato.start(now);
        osc.stop(now + 7); vibrato.stop(now + 7);

        timer = setTimeout(play, 4000 + Math.random() * 5000);
      }

      return {
        start() { play(); },
        stop() {
          alive = false;
          clearTimeout(timer);
          try { osc.stop(); } catch(e){}
          try { vibrato.stop(); } catch(e){}
        }
      };
    },

    // Chanting — low drone with harmonics (Om-like)
    'chanting': (ctx, out) => {
      let alive = true;
      let oscs = [];
      let masterGain;

      return {
        start() {
          const now = ctx.currentTime;
          const fundamental = 136; // ~Om frequency

          masterGain = ctx.createGain();
          masterGain.gain.value = 0;
          masterGain.gain.setTargetAtTime(0.08, now, 2);
          masterGain.connect(out);

          // Fundamental + overtones
          const harmonics = [1, 2, 3, 4.02, 5.01];
          const volumes = [0.5, 0.3, 0.15, 0.08, 0.05];

          harmonics.forEach((h, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = fundamental * h;

            // Slow random drift for organic feel
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.03 + Math.random() * 0.05;
            const lfoG = ctx.createGain();
            lfoG.gain.value = 1.5;
            lfo.connect(lfoG);
            lfoG.connect(osc.frequency);
            lfo.start(now);

            const g = ctx.createGain();
            g.gain.value = volumes[i];
            osc.connect(g);
            g.connect(masterGain);
            osc.start(now);
            oscs.push(osc, lfo);
          });

          // Amplitude modulation for breathing effect
          const breathLfo = ctx.createOscillator();
          breathLfo.type = 'sine';
          breathLfo.frequency.value = 0.12; // slow breath cycle
          const breathGain = ctx.createGain();
          breathGain.gain.value = 0.03;
          breathLfo.connect(breathGain);
          breathGain.connect(masterGain.gain);
          breathLfo.start(now);
          oscs.push(breathLfo);
        },
        stop() {
          alive = false;
          const now = ctx.currentTime;
          if (masterGain) masterGain.gain.setTargetAtTime(0, now, 1.5);
          setTimeout(() => {
            oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e){} });
            try { masterGain.disconnect(); } catch(e){}
            oscs = [];
          }, 4000);
        }
      };
    }
  };
}
