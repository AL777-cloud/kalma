# Kálma — Product Design Document

## 1. Welcome Screen

**Prompt:** *"Welcome. What are you seeking right now?"*

### Mood / Intent Options:
1. 🌊 **Unwind & Relax** — Let go of the day
2. 🌅 **Uplift My Mood** — Nostalgic reflection, gentle positivity
3. 🌙 **Help Me Sleep** — Drift off peacefully
4. 📖 **Reading Mood** — Soft background for focus
5. 🧘 **Meditate** — Guided or Sound Journey
6. 🪞 **Introspection** — Voice-guided or music-only
7. 🔄 **Reset & Start Fresh** — Clear the mental noise
8. 💎 **Find Clarity** — Cut through the fog
9. 🙏 **Practice Gratitude** — Reflect on what's good
10. 🎨 **Unlock Creative Flow** — Get into the zone

> Each option maps to a set of default musical parameters (key, tempo, texture density, harmonic mood) that the AI engine uses as a starting point. The user then customizes from there.

---

## 2. Customization Screen — Two Categories

After selecting intent, users fine-tune their experience with two layer categories.

### Category A: Meditation Layers
Auditory elements that support meditative/altered states. **Multi-select** (can combine).

| Layer | Description |
|---|---|
| Isochronic Tones | Rhythmic pulses at specific frequencies (alpha, theta, delta) |
| Binaural Beats | Stereo frequency offset — requires headphones |
| Whale Sounds | Deep, oceanic, expansive |
| Dolphin Calls | Playful, lighter aquatic texture |
| Heartbeat Pulse | Grounding, primal rhythm |
| Tibetan Singing Bowls | Resonant overtones, centering |
| Wind Chimes | Delicate, random, airy |
| Chanting Mantras | Repetitive, sacred, hypnotic |
| Deep Gong Resonance | Powerful, clearing, vibrational |
| Soft Flute Melody | Gentle melodic thread |
| **None** | Pure music only |

**Frequency presets for Isochronic/Binaural:**
- **Delta (0.5–4 Hz)** — Deep sleep, healing
- **Theta (4–8 Hz)** — Meditation, creativity, dreams
- **Alpha (8–13 Hz)** — Relaxation, calm focus
- **Beta (13–30 Hz)** — Alertness, focus (for reading/creative modes)

> Auto-suggest: System recommends frequency based on selected intent (e.g., "Help Me Sleep" → Delta, "Creative Flow" → Theta/Alpha)

### Category B: Ambience
Environmental soundscapes. **Multi-select** with individual volume sliders.

| Ambience | Description |
|---|---|
| Calm Forest | Birds, rustling leaves, soft wind |
| Gentle Stream | Flowing water, stones |
| Light Rain | Soft patter, distant |
| Heavy Downpour | Immersive, enveloping rain |
| Fireplace Crackle | Warm, close, cozy |
| Ocean Waves | Rhythmic surf, beach |
| Windy Meadow | Open, spacious, breezy |
| Nighttime Crickets | Dark, peaceful, summer night |
| Mountain Breeze | Cool, high altitude, clean |
| Thunderstorm | Distant rumbles, powerful but safe |
| Café Murmur | Soft human presence, non-distracting |
| **None** | No ambience, just music + layers |

> Each ambience is a seamless loop. Volume per layer is adjustable so users can blend (e.g., Light Rain at 30% + Fireplace at 70%).

---

## 3. The Music Engine

### How It Works
The core musical layer is AI-generated based on:
- Selected **intent** (mood/goal)
- Selected **meditation layers** and **ambience**
- Optional **text prompt** from the user (e.g., "I'm feeling lonely tonight")

### Real-Time Prompt Shifting
At any point during playback, the user can type a new prompt or adjust settings, and the music **evolves** — it doesn't restart. Crossfade between states.

### Seamless Looping — The Technical Challenge ⚠️
This is one of the hardest problems to solve well:

**For ambience/nature sounds:**
- Use long recordings (2–5 min) with crossfade overlap looping
- Multiple random layers offset in time to avoid repetition
- Procedural variation (randomize bird timing, rain intensity micro-shifts)

**For AI-generated music:**
- Option A: **Generative/synthesized** — Web Audio API creates evolving textures in real time (no loop boundary problem because it's never repeating)
- Option B: **AI-generated stems** — Use a music generation API to produce segments, then smart-crossfade between them
- Option C: **Hybrid** — Synthesized base layer + AI-generated melodic/harmonic elements layered on top

**Recommendation for MVP:** Start with Option A (generative synthesis) for the base, with pre-recorded ambience loops. This avoids the "how do you seamlessly loop AI-generated music" problem entirely for Phase 1. The music is *always generating*, never looping.

### Instrument / Texture Palette
Users could optionally select preferred textures:
- Warm pads (analog synth feel)
- Piano / keys
- Acoustic guitar (fingerpicked)
- Strings (orchestral)
- Crystal / glass textures
- Ethnic instruments (sitar, kalimba, hang drum)
- Electronic / ambient

---

## 4. Voice Guidance System

### Toggle: AI Voice — ON / OFF
Always user-controlled. Default: OFF (let them discover it).

### When ON:
- AI generates a **personalized script** based on:
  - Selected intent
  - User prompt ("I'm feeling sad today")
  - Selected introspection theme (if applicable)
- **Text-to-speech** renders it with a warm, natural voice
- Voice is **ducked into the music** — music volume dips slightly when voice speaks, swells in pauses
- Pacing matches the music tempo/energy

### Guidance Styles (user-selectable):
1. **Gentle Meditation** — Calm, spacious, lots of silence between phrases
2. **Motivational** — Encouraging, warm energy, "you've got this"
3. **Cognitive Reframing** — Therapeutic approach, gently challenging negative patterns
4. **Reflective / Introspective** — Questions and prompts to look inward
5. **Gratitude Practice** — Structured thankfulness exercise
6. **Body Scan** — Progressive physical relaxation
7. **Breathwork** — Guided breathing patterns synced with music tempo

### Voice Options (future):
- Male / Female / Neutral
- Tone: Warm, Professional, Ethereal
- Language selection

---

## 5. Introspection Themes (Advanced)

When **Introspection** is selected as intent, users can choose a focus:

- **Calm Reflection** — Peaceful self-observation
- **Cognitive Reframing** — Shift perspective on negative thoughts
- **Emotional Release** — Permission to feel and let go
- **Self-Compassion** — Kindness toward yourself
- **Future Visioning** — Imagine where you're going
- **Inner Dialogue** — Explore your inner voices
- **Letting Go** — Release what no longer serves you

The system adapts BOTH music and voice to support the chosen theme. Transitions between themes (if the user switches mid-session) are smooth.

---

## 6. Session Flow Summary

```
Welcome → Select Intent → Customize Layers → Experience Begins
                                                    ↓
                                          [Music plays, evolving]
                                                    ↓
                                    [Optional: Type prompt to shift mood]
                                    [Optional: Toggle voice guidance ON]
                                    [Optional: Adjust layers in real time]
                                                    ↓
                                          [Session ends naturally]
                                                    ↓
                                      [Optional: Save session / Share]
```

---

## 7. Technical Considerations

### Seamless Looping Strategy
| Content Type | Strategy |
|---|---|
| Nature ambience | Pre-recorded long loops with crossfade + randomized micro-layers |
| Meditation layers (bowls, chimes, etc.) | Triggered samples with randomized timing + procedural generation |
| Binaural/Isochronic | Real-time oscillator generation (Web Audio API) — no looping needed |
| Core music | Real-time generative synthesis (MVP) / AI-generated stems with smart crossfade (v2) |
| Voice guidance | Generated on-demand, streamed, ducked into music mix |

### Headphone Detection
- Binaural beats REQUIRE stereo headphones to work
- Show a gentle reminder when binaural is selected: "🎧 For the full effect, use headphones"

### Session Length
- Default: infinite / until user stops
- Optional timer: 10, 20, 30, 45, 60 min
- Sleep mode: Gradually fade to silence over final 10 minutes

---

## 8. Future Features (Post-MVP)
- User accounts & saved presets
- Session history ("What helped you last time")
- Mood tracking over time
- Community presets ("What others found helpful for anxiety")
- Wearable integration (heart rate → adapts music)
- Offline mode (native app)
- Collaborative sessions (meditate with a friend)
