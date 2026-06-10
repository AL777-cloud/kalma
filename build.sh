#!/bin/sh
# Build script for Vercel: assemble all apps into dist/
set -e

rm -rf dist
mkdir -p dist

# Main app: kalma-player at root /
cp -r kalma-player/app/* dist/

# Sub-apps
cp -r kalma/app dist/original
cp -r kalma-chat/app dist/chat
cp -r kalma-hub/app dist/hub
cp -r kalma-audiolab/app dist/audiolab

# Chat app needs shared engine files from kalma-player
for f in engine-state.js engine-composer.js engine-core.js engine-context.js \
         va-synth.js fm-synth.js wavetable-synth.js engine-journal.js \
         engine-music-brain.js engine-melody.js engine-phrase.js \
         engine-movement-textures.js engine-adaptive.js engine-layers.js \
         engine-beats.js engine-learning.js engine-visualizer.js \
         engine-piano-sampler.js engine-mic.js engine-camera.js style.css; do
  if [ -f "kalma-player/app/$f" ] && [ ! -f "dist/chat/$f" ]; then
    cp "kalma-player/app/$f" "dist/chat/$f"
  fi
done

# Audiolab may also need shared files
for f in engine-core.js va-synth.js fm-synth.js wavetable-synth.js \
         engine-music-brain.js engine-phrase.js engine-melody.js \
         engine-adaptive.js engine-layers.js engine-beats.js \
         engine-learning.js engine-visualizer.js engine-context.js; do
  if [ -f "kalma-player/app/$f" ] && [ ! -f "dist/audiolab/$f" ]; then
    cp "kalma-player/app/$f" "dist/audiolab/$f"
  fi
done

echo "Build complete: dist/"
ls -la dist/
