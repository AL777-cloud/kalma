# Kálma Chat — Design Document

**Status:** In Development (Experimental)
**Port:** 12004
**Started:** May 12, 2026

## Concept

Kálma as a living conversational presence inside the player. Not a chatbot — an entity. The music IS Kálma; the chat is Kálma becoming language.

When a user speaks, the music shifts BEFORE the text response finishes appearing. The simultaneity is the core experience.

## Architecture

```
kalma-chat/
├── server.js              — Port 12004, /api/chat + /api/interpret-mood
├── DESIGN.md              — This file
└── app/
    ├── index.html          — Player + chat UI (copied from player, modified)
    ├── chat-style.css      — Chat panel styles
    ├── chat-app.js         — Chat UI controller (wires chat to music engine)
    ├── engine-chat.js      — Chat engine (LLM conversation management)
    ├── engine-*.js → symlinks to kalma-player/app/  (all shared engines)
    ├── *-synth.js → symlinks to kalma-player/app/    (all shared synths)
    ├── style.css → symlink to kalma-player/app/style.css
    ├── audio/ → symlink to kalma-player/app/audio/
    └── icons/ → symlink to kalma-player/app/icons/
```

**Symlinked files** stay in sync with the Player automatically.
**Own files** (chat-specific): index.html, chat-style.css, chat-app.js, engine-chat.js.

## Kálma Entity Persona

- Not an assistant, not a therapist, not a chatbot
- The voice of the music becoming language
- Short, present-tense, intimate, poetic but not flowery
- Never explains itself or its features
- Reflects what it senses from the user
- No emojis, ever
- Warm, curious, sometimes mysterious

## Chat → Music Flow

```
User types message
  → chat-app.js sends to /api/chat with context (time, weather, movement, current mood)
  → server.js forwards to LLM with Kálma persona prompt
  → LLM returns { message: string, music: object|null }
  → Music params applied IMMEDIATELY via _crossfadeTo() / _morphTo()
  → Text appears with typewriter effect (music already shifting)
  → Small indicator shows what changed (mood · bpm · timbre)
```

## API

### POST /api/chat
Request:
```json
{
  "message": "I can't sleep, my mind won't stop",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "context": { "timeOfDay": "night", "weather": "Clear", "movement": "Still", "currentMood": "calm", "isPlaying": true }
}
```

Response:
```json
{
  "message": "The weight you carry — I can feel it in the stillness. Let the low tones hold it for a while.",
  "music": { "filterFreq": 300, "reverbMix": 0.6, "density": 1, "bpm": 55, "mood": "melancholy" }
}
```

### POST /api/interpret-mood
Same as Player (for Shift Mood feature compatibility).

## Migration Plan

When chat is proven and polished:
1. Copy chat-specific files (engine-chat.js, chat-app.js, chat-style.css) into kalma-player/app/
2. Merge index.html changes into player's index.html
3. Add /api/chat to player's server.js
4. Chat becomes a native feature of Kálma Player

## Next Steps
- [ ] Test conversation flow and persona tuning
- [ ] Toto to shape Kálma's voice/personality
- [ ] Explore: greeting based on context (time, weather) when chat opens
- [ ] Explore: Kálma initiates — subtle message after sensing state change
- [ ] Voice input (speech-to-text → chat)
- [ ] Voice output (Kálma speaks its responses via TTS)
