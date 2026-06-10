# Kálma Audio Lab 🔬

Isolated audio engine sandbox for testing sound quality upgrades without touching production Kálma Player code.

## Port: 12005

## What's Here

Exact copy of Kálma Player's adaptive audio engine (13 JS files) with a minimal lab UI:
- **Play/Stop** — start the engine with one click
- **Mood selector** — 12 preset moods + custom text input
- **Live parameter sliders** — baseFreq, filter, reverb, density, detune, BPM, attack, release
- **Preset selectors** — VA, FM, WT synth presets
- **Live monitor** — real-time readout of engine state
- **A/B engine tabs** — switch between "Current" and "Upgraded" (upgraded = where experiments go)
- **Visualizer** — frequency analysis canvas

## Upgrade Roadmap

### Tier 1: Pure Web Audio (No Dependencies)
1. **Convolution reverb** — real impulse responses instead of algorithmic reverb
2. **Granular synthesis engine** — slice real audio samples into micro-grains
3. **Expanded wavetables** — real instrument wavetables (organ, strings, brass)
4. **Karplus-Strong** — physical modeling for plucked strings, bells, metallic textures

### Tier 2: Lightweight AI (Browser-Viable)
5. **ONNX Runtime + neural vocoder** — tiny neural texture synthesis in browser
6. **MusicVAE** — Magenta.js for more human-feeling melody patterns

### Tier 3: Server-Side AI (Future)
7. **MusicGen texture library** — pre-generate AI audio textures offline
8. **Magenta RealTime** — full AI real-time music (requires GPU server)

## Files

```
kalma-audiolab/
├── server.js          # Static file server (port 12005)
├── README.md
└── app/
    ├── index.html     # Lab UI
    ├── lab.js         # Lab controller (play/stop, mood, sliders, monitor)
    ├── engine-core.js          # ← copied from kalma-player
    ├── engine-adaptive.js      # ← copied from kalma-player
    ├── engine-beats.js         # ← copied from kalma-player
    ├── engine-context.js       # ← copied from kalma-player
    ├── engine-layers.js        # ← copied from kalma-player
    ├── engine-learning.js      # ← copied from kalma-player
    ├── engine-melody.js        # ← copied from kalma-player
    ├── engine-music-brain.js   # ← copied from kalma-player
    ├── engine-phrase.js        # ← copied from kalma-player
    ├── engine-visualizer.js    # ← copied from kalma-player
    ├── va-synth.js             # ← copied from kalma-player
    ├── fm-synth.js             # ← copied from kalma-player
    └── wavetable-synth.js      # ← copied from kalma-player
```

## Rules
- **Never** backport changes to kalma-player without explicit approval
- Experiment freely — this is a throwaway sandbox
- When an upgrade is proven, we cherry-pick it into production
