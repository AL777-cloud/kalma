# Kálma Player — Architecture & Design Document

*Last updated: April 30, 2026 (Session 2)*

---

## 💎 Market Position

> **The AI-generated meditation music market is $1.8B today → $7.4B by 2034 (17.1% CAGR).**
> Endel and Brain.fm lead. The space is exploding.
>
> **Kálma's unique angle: Conversational mood-to-music.** No one else does this.
> Endel is algorithmic (button presets). Brain.fm is pre-composed.
> **Kálma lets you *talk* to the music.**

---

## Vision

A mainstream adaptive music companion that generates infinite, personalized music in real time. Music transforms based on context (time, weather, movement), responds to natural language mood input, and learns from user preferences over time.

**Target**: Anyone who wants music that adapts to their life — anxiety relief, focus, sleep, meditation, or just background ambience.

**Revenue model**: Freemium + subscription (premium features: biometric, session planning, offline)

---

## Core Architecture

### File Structure
```
kalma-player/
  app/
    index.html                — Three screens (Splash → Begin → Player)
    style.css                 — Dark ethereal aesthetic
    app.js                    — Screen flow, player controls, UI interactions (~1023 lines)
    engine-core.js            — AudioContext, master bus, reverb, compressor
    engine-adaptive.js        — Conductor: drones, instruments, phrase events (~1272 lines)
    engine-phrase.js           — Musical time structure, tension arcs, memory
    engine-music-brain.js      — Semantic mood → musical parameters (rules + AI)
    engine-melody.js           — Piano/keys/bells generative performance (~1611 lines)
    engine-piano-sampler.js    — Real piano sample playback (NEW)
    engine-beats.js            — Beat types, song structure, drum synthesis
    engine-context.js          — Environmental signals (time, weather, motion)
    engine-layers.js           — Binaural, isochronic, ambience layers
    engine-learning.js         — Like/dislike → parameter bias (localStorage)
    engine-visualizer.js       — Audio-reactive visual display
    engine-journal.js          — Session logging
    va-synth.js                — Virtual Analog synthesizer (pads, drones, keys)
    fm-synth.js                — FM synthesis (textures, color tones)
    wavetable-synth.js         — Wavetable synthesis (pads)
    icons/                     — SVG icons (no emojis)
    audio/
      ambience/                — Recorded ambience (ocean, rain, fire, stream)
      piano/                   — 24 real piano WAV samples (11 pitches × 2 velocity layers)
  server.js                   — Express static server (port 12002)
  DESIGN.md                   — This file
  RESEARCH.md                 — Market research & improvement roadmap
```

**Total**: ~7,800 lines of JS across 15 files + 24 piano samples

### Audio Signal Chain
```
                    ┌─────────────────────────────────────┐
                    │         PHRASE ENGINE                │
                    │  (Musical conductor: tension,       │
                    │   tempo, chord timing, memory)      │
                    └──────────────┬──────────────────────┘
                                   │ events
              ┌────────────────────┼────────────────────────┐
              ▼                    ▼                        ▼
   ┌──────────────────┐  ┌────────────────┐  ┌─────────────────────┐
   │  ADAPTIVE ENGINE │  │ MELODY ENGINE  │  │   BEATS ENGINE      │
   │  (Drones + Pads  │  │ (Piano sampler │  │   (Drum synthesis,  │
   │   + VA/FM/WT)    │  │  + synthesis   │  │    beat types,      │
   │                  │  │  fallback)     │  │    song structure)  │
   └────────┬─────────┘  └───────┬────────┘  └──────────┬──────────┘
            │                     │                       │
            ▼                     ▼                       ▼
   ┌─────────────┐      ┌──────────────┐       ┌──────────────┐
   │  Music Bus  │      │  Melody Bus  │       │  Beats Bus   │
   └──────┬──────┘      └──────┬───────┘       └──────┬───────┘
          │                     │                       │
          └─────────────────────┼───────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │     DRY GAIN          │
                    └───────────┬───────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                                            ▼
  ┌────────────────┐                        ┌──────────────────┐
  │  Reverb Send   │                        │  Direct Signal   │
  │  (Convolver)   │                        │                  │
  └───────┬────────┘                        └────────┬─────────┘
          │                                          │
          └─────────────────────┬────────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │    COMPRESSOR/        │
                    │    LIMITER            │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │    MASTER GAIN (1.0)  │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │    DESTINATION        │
                    │    (speakers)         │
                    └───────────────────────┘
```

---

## Engine Details

### 1. Music Brain (engine-music-brain.js)
**Purpose**: Translates meaning → musical parameters

**Input sources**:
- Text prompts (user types mood/scene)
- Context engine (time, weather, season, movement)
- LLM interpretation (server-side, OpenRouter)
- Learning engine (accumulated user preferences)

**Output** (musical state):
```js
{
  scale: [0, 2, 4, 7, 9],
  chords: [[0,4,7], [5,9,0]],
  baseFreq: 220,
  filterFreq: 800,
  reverbMix: 0.35,
  density: 3,
  melodyTimbre: 'piano',
  // ... etc
}
```

**Mood families** (updated April 30):
- Happy / Grateful / Love / Hopeful
- Calm / Relaxed / **Dreamy (NEW)** / Mindful
- Sad / Lonely / Nostalgic / Heartbreak / Despair
- Anxious / Afraid
- Energetic / Focused

**Dreamy mood** (Debussy-inspired, new):
- Triggers: dream, ethereal, moonlight, impressionist, debussy, shimmer, luminous
- Db base frequency (139Hz), major scale, Maj7+add9 chords
- High reverb (0.38), slow attack, very low density

**AI Integration**:
- POST `/api/interpret-mood` → OpenRouter (gemini-2.5-flash-lite)
- Structured prompt → JSON parameters → rules fallback if LLM fails

### 2. Phrase Engine (engine-phrase.js)
**Purpose**: Musical conductor — shared sense of time, tension, structure

- Lookahead scheduler (25ms interval, 100ms lookahead) — sample-accurate
- 7 tension arc shapes (breathe, build, plateau, wave, sparse, descend, dramatic)
- Musical memory: themes, favorite chords, peak moments
- Context-aware BPM suggestions (50-130 range)

### 3. Adaptive Engine (engine-adaptive.js)
**Purpose**: Drone bed + instrument layers + coordination

**Beats integration (updated April 30)**:
- **Adaptive Mode** (default ON): Movement-triggered, tension-modulated
- **Manual Beat Mode** (`_manualBeatMode`): User-selected beat type, completely isolated from adaptive logic
- When manual active: no movement interference, no BPM override, no auto-stop
- `setBeatsEnabled()` / `startBeatsNow()` / `stopManualBeats()` API

### 4. Melody Engine (engine-melody.js)
**Purpose**: Generative piano/keys performance

**Piano sample playback (NEW April 30)**:
- `PianoSampler` class loaded on start (non-blocking)
- When loaded: `_pianoNote()` uses real WAV samples
- When not loaded: falls back to oscillator-based Debussy synthesis
- Output routes through melody reverb chain (concert hall convolution)

**Piano styles** (updated April 30):
| Style | Left Hand | Right Hand | Inspired By |
|-------|-----------|------------|-------------|
| Alberti | Alberti bass | Melody | Mozart, classical |
| Arpeggio | Ascending/desc | Melody | Chopin |
| Broken Chord | Root + chord | Melody | Einaudi |
| Ostinato | 2-note figure | Sparse | Paterlini |
| Pedal Point | Sustained root | Various | Satie |
| Waltz | 3/4 bass | Melody | Chopin |
| **Debussy Flow** | **Wide 9/8 arpeggios** | **Melody** | **Debussy (Clair de Lune)** |
| **Debussy Flow** | **Wide 9/8 arpeggios** | **Impressionist** | **Debussy (Clair de Lune)** |

**Debussy Flow left hand** (from Clair de Lune score analysis):
- Groups of 3 (compound triplet, 9/8 feel)
- Pattern: bass anchor → 5th→root→3rd→5th→root ascending across 2 octaves
- All notes sustain long (pedal-down simulation)
- Alternate pattern with 9th for color

**Impressionist right hand**:
- Descending parallel thirds (Clair de Lune opening)
- Suspensions held over barlines
- Appoggiatura grace notes
- Occasional sixths, ornamental turns
- Hairpin dynamics (pp→mp→pp)

### 5. Piano Sampler (engine-piano-sampler.js) — NEW
**Purpose**: Real piano sample playback

- **11 pitch zones**: B1, E2, D3, G#3, D4, F4, B4, E5, A5, D6, E6
- **2 velocity layers** per note (soft/hard) — 22 active samples
- Pitch-shifting via `playbackRate` (covers notes between samples)
- Velocity < 0.5 → soft layer, > 0.5 → hard layer
- Natural envelope: sample rings full tail, fades at note duration
- All 24 WAV files: stereo, 24-bit, 44100Hz

### 6. Beats Engine (engine-beats.js) — REWRITTEN
**Purpose**: Rhythmic patterns with song-like evolution

**Beat types** (selectable in Layers drawer):

| Type | BPM | Character | Reference |
|------|-----|-----------|-----------|
| **Upbeat** | 125 | Techno 4/4, kick every beat, relentless | Joseph Capriati |
| **Grounded** | 65-82 | Slow steady pulse, deep kick, swing | Lo-fi / downtempo |
| **Dreamy** | 72-92 | Soft minimal texture, high reverb | Ambient |
| **Energetic** | 125-145 | Fast syncopated, busy hats | Breaks / electro |

**Song structure evolution**:
- Upbeat/Energetic: kick only → +hats → full groove → peak → breakdown → peak
- Grounded/Dreamy: sparse intro → verse → build → chorus → breakdown → outro
- Complexity increases with each song cycle
- Song transitions: brief dip (no silence gap), seamless crossfade

**Manual Beat Mode**:
- `_manualBeatMode` flag isolates beats from all adaptive/movement logic
- `setBeatType()` clears external BPM → uses profile's own BPM
- Cannot be stopped by movement, tension, or context changes
- UI: selecting beat type auto-disables Adaptive toggle

**Drum synthesis** (all Web Audio, no samples):
- Kick: sine pitch sweep 150→30Hz + noise click transient
- Snare: triangle body + filtered noise (highpass 2000Hz)
- Hi-hat: noise burst through highpass 7000-9000Hz
- Open hat: longer noise + reverb/delay sends
- Perc/Clap: 3 micro-burst noise flam + bandpass

### 7. Context Engine (engine-context.js)
- Time (6 periods), Weather (Open-Meteo), Season, Movement (DeviceMotion), Holidays, Temperature

### 8. Learning Engine (engine-learning.js)
- Like/dislike → per-parameter bias (0% at 3 feedbacks → 30% max at 30+)
- Preference summary sent to LLM for personalized interpretation

### 9. Visualizer (engine-visualizer.js)
- Canvas 2D: third eye + radial frequency bars + glow orbs
- Mood-driven color palettes (7 palettes, smooth transitions)
- Sacred geometry morphing (circle → hexagon → flower of life → mandala, driven by tension)
- Web Audio AnalyserNode (FFT 256)

---

## UI Architecture

### Three Screens
1. **Splash** (4s) — Logo, dark + subtle animation
2. **Begin Journey** (user tap required) — Unlocks AudioContext
3. **Adaptive Player** — Auto-plays, full controls

### Player Controls
- **Play/Pause** (SVG icons)
- **Shift Mood** (text input → LLM/rule-based → musical transformation)
- **Feedback** (thumbs up/down for learning)
- **Controls row**: Layers | Beats: Adaptive/Off | Mix | Mute
- **Layer drawer** (3 sections):
  - **Ambience**: Ocean, Rain, Forest, Fireplace, Mountain
  - **Beat**: Upbeat, Grounded, Dreamy, Energetic (NEW)
  - **Meditation**: Binaural, Isochronic, Tibetan Bowls, Heartbeat, Wind Chimes, Gong
- **Mix panel**: Master, Music, Ambience, Layers, Beats sliders
- **Your Journey**: Stats, streak, weekly chart

### Beats Toggle vs Beat Layer
- **Beats: Adaptive** toggle in controls row = movement-triggered adaptive beats (OFF by default)
- **Beat layer** in drawer = manual selection of specific beat type
- Selecting a beat type auto-disables adaptive toggle
- Re-enabling adaptive clears any selected beat type
- Users who don't want any beats can turn off the toggle

### Design Principles
- No emojis — SVG symbolic art only
- Ethereal dark aesthetic (blur ≤ 2px)
- Everything fades, never abrupt
- Side panels > popups
- Yellow info, purple primary
- Mobile responsive

---

## Server Architecture

### Express Server (server.js, port 12002)
- Static file serving for `/app/*`
- API proxy: `POST /api/interpret-mood` → OpenRouter (gemini-2.5-flash-lite)

---

## Technology Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Audio synthesis | Web Audio API | Free |
| Piano samples | 24 WAV files (recorded) | Free |
| UI | Vanilla HTML/CSS/JS | Free |
| Server | Node.js + Express | Free |
| AI interpretation | OpenRouter API | Pay-per-use |
| Weather | Open-Meteo | Free |
| Motion | DeviceMotion API | Free |
| Storage | localStorage | Free |

---

## Changelog (Architecture Updates)

### April 30, 2026 (Session 2) — Beat Types + Clair de Lune + Piano Samples
- **Beat layer**: New section in Layers drawer (Upbeat/Grounded/Dreamy/Energetic)
- **Beat types**: Each has unique BPM, swing, velocity, pattern generators, song structure
- **Manual beat mode**: `_manualBeatMode` flag isolates beats from all adaptive logic
- **Upbeat = techno**: 125 BPM, 4-on-the-floor, evolves like a track (kick → +hats → full → peak)
- **Clair de Lune study**: New `debussyFlow` left-hand + `impressionist` right-hand patterns
- **Dreamy mood**: New emotion keyword in Music Brain (Db, Maj7+add9, high reverb)
- **Piano sampler**: 24 real WAV samples (11 pitches × 2 velocity), pitch-shifting playback
- **Dead code removed**: 6 unused files (~5,400 lines) — soundfont, granular, physical model
- **Master volume**: Raised from 0.7 to 1.0
- **Duplicate code fix**: Removed orphan `_generateGroovePiano` in melody engine

### April 30, 2026 (Session 1) — Musical Quality Overhaul
- Drone composition: consonant intervals only (root/5th/octave)
- Drone synthesis: pure sine, warmer filtering
- Piano isolation: all synths silenced when piano active
- Piano tone: Debussy-inspired soft synthesis
- Mood reactivity: crossfade, per-mood reverb, distinct BPM ranges
- Beats: adaptive ON default, movement-triggered only
- Chord progressions: warmer voicings for evening/night/lateNight
- Visualizer: mood palettes, sacred geometry morphing

### April 23, 2026 — AI Integration + Engine Upgrade
- LLM mood interpretation, learning engine, lookahead scheduling
- Compressor/limiter, chord-aware instruments, stereo image

### April 17, 2026 — Musicality Upgrade
- Phrase engine (conductor), tension arcs, musical memory, theme recall

### April 14, 2026 — Initial Build
- Three-screen flow, context engine, adaptive music, feedback, visualizer

---

## Next Steps
- Toto recording custom sounds (UI + meditation layers)
- PWA (Progressive Web App) for installable experience
- More piano samples (fill gaps in the 5-octave range)
- Sleep mode fade
- User accounts + deployment + custom domain
