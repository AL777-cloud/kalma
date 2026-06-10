# Kálma Player — Adaptive Music Engine Specification
## By Toto (May 1, 2026)

This is the definitive design document for how the music engine should work.

## Core Rule
Music = Mood → musical rules → composition → performance → sound design
NOT: Mood → random parameter tweaks

## Music State Model (5 parameters)
- Mood: calm, focused, dreamy, sad, tense, excited, sleepy
- Energy: 0–100
- Tension: 0–100
- Density: 0–100
- Brightness: 0–100

### Mood Presets
| Mood | Energy | Tension | Density | Brightness |
|------|--------|---------|---------|------------|
| Calm | 25 | 10 | 25 | 45 |
| Excited | 80 | 35 | 70 | 75 |
| Sleepy | 10 | 5 | 10 | 25 |
| Focused | 40 | 20 | 35 | 55 |
| Dreamy | 20 | 15 | 20 | 40 |
| Sad | 20 | 30 | 20 | 30 |
| Tense | 50 | 70 | 50 | 50 |

## Composition Hierarchy (8 layers)
1. Key / scale
2. Chord progression
3. Bass/root movement
4. Main motif
5. Counter motif
6. Rhythm/pulse
7. Texture/pad
8. FX/transitions

Each layer follows the same musical state.

## Harmony Rules
### Calm/Meditation
- Use: I, IV, vi, V, Imaj7, IVmaj7, vi7, sus2, add9, 6 chords
- Avoid: diminished, harsh tritones, random chromatic
- Example: Cmaj9 → Fmaj7 → Am7 → Gsus4

### Dark/Tense
- Use: i, ♭VI, ♭VII, iv, minor add9, Phrygian/Aeolian
- Example: Cm → A♭maj7 → B♭sus4 → Fm

### Dreamy
- Use: Lydian mode, maj7, add9, slow unresolved movement
- Example: Cmaj9 → Dadd9 → Gmaj7 → Em7

## Motif Rules
- Length: 2–6 notes
- Behavior: repeat → vary → expand → rest → return
- Variations: change rhythm, transpose, invert, add passing notes, remove notes, stretch timing
- BAD: random notes forever
- GOOD: recognizable phrase that slowly transforms

## Section Structure
Intro → A → A' → B → A return → transition → new mood
- Intro: 8 bars
- A section: 16 bars
- A' variation: 16 bars
- B section: 8–16 bars
- Transition: 4–8 bars

## Mood Shift Behavior (6 steps)
1. Reduce current density
2. Keep shared tones
3. Introduce new chord color
4. Morph rhythm
5. Introduce new motif variation
6. Change synth texture
Transition over 4–16 bars, NOT instant.

## Layer Behavior
- Pad: follows chords, slow attack, minimal movement
- Piano/lead: carries motif, responds to mood
- Bass: simple in calm, rhythmic in energetic
- Beat: only when energy passes threshold, evolves in phrases
- Ambience: supports, never covers

## Beat Rules (energy-driven)
- Low energy: no kick, soft pulse, occasional texture
- Medium energy: simple kick/2 beats, light hi-hat
- High energy: 4-on-the-floor, syncopated hats, bass pulse, fills/8-16 bars

## "New World" Effect
Mood shift affects ALL levels simultaneously:
Harmony + Scale + Motif + Texture + Reverb + Rhythm + Density

## Most Important Principle
**The system must remember what it played before.**
Every new mood should be RELATED to previous material, but TRANSFORMED enough to feel new.
