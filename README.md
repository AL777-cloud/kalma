# Kálma 🌊

Therapeutic & adaptive music web applications.

## Projects

| Folder | Description | Port |
|--------|-------------|------|
| `kalma/` | Original therapeutic app — conversational, mood-based generative music | 12001 |
| `kalma-player/` | Mainstream adaptive music companion — context-aware (time, weather, movement) | 12002 |
| `kalma-hub/` | Unified dashboard for both apps + asset library | 12003 |
| `kalma-chat/` | Chat-driven music experience | — |
| `kalma-audiolab/` | Audio experimentation tool | — |

## Tech

- Pure Web Audio API — real-time synthesis, no sample libraries required
- Binaural beats, isochronic tones, generative chord progressions
- Context engine: weather (Open-Meteo), device motion, time/season detection
- AI mood interpretation via OpenRouter LLM
- Learning engine with like/dislike feedback loop

## Quick Start

```bash
cd kalma          # or kalma-player, kalma-hub, etc.
npm install       # if package.json exists
node server.js
```

## License

All rights reserved © 2026 Alejandro
