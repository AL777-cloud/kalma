const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 12002;
const APP_DIR = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};

/* ── OpenRouter LLM proxy for mood interpretation ── */
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const LLM_MODEL = 'openrouter/auto';

const MOOD_SYSTEM_PROMPT = `You are the Music Brain of Kálma Player, an adaptive generative music engine.
Given a user's mood text, return ONLY a JSON object with musical parameters. No explanation, no markdown.

The JSON must have these fields:
- scale: array of semitone offsets from root (e.g. [0,2,4,5,7,9,11] for major, [0,2,3,5,7,8,10] for natural minor, [0,2,3,5,7,9,10] for dorian)
- chords: array of chord arrays, each chord is semitone offsets (e.g. [[0,4,7,11],[5,9,0,4]] for Imaj7-IVmaj7)
- baseFreq: root frequency 100-400 Hz (220=A3, 261=C4, 196=G3)
- filterFreq: lowpass filter 200-2000 Hz (lower=darker, higher=brighter)
- reverbMix: 0.1-0.7 (more=spacier)
- density: 1-4 (1=sparse, 4=full)
- detune: 5-35 cents (more=dreamier)
- attack: 1-10 seconds (longer=more ambient)
- release: 1-10 seconds
- bpm: 45-130 (slower=calmer)
- mood: one of: happy, calm, sad, melancholy, despair, anxious, energetic, dark, bright, tense, neutral, sleepy, nostalgic, mysterious
- melodyTimbre: one of: piano, keys, bells, pluck, flute, harp, or null
- vaPreset: one of: "Ambient Drone", "Warm Pad", "Ethereal Strings", "Soft Keys"
- fmPreset: one of: "Evolving Texture", "Metallic Drone", "Harmonic Shimmer"
- wtPreset: one of: "Cinematic Pad", "Glass Cathedral", "Dark Atmosphere"

Musical rules:
- Sad/melancholy: use minor scales, lower filterFreq, more reverb, slower BPM, falling chord progressions
- Happy/energetic: major scales, higher filterFreq, less reverb, faster BPM
- Calm/sleepy: pentatonic or simple scales, low density, slow attack
- Tense/anxious: diminished or altered scales, moderate filter, dissonant chords
- Use extended chords (7ths, 9ths) for sophistication
- Consider voice leading in chord progressions (small intervallic movement between chords)

Return ONLY valid JSON, nothing else.`;

async function handleMoodInterpret(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { text, preferences } = JSON.parse(body);
      if (!text) { res.writeHead(400); res.end('{"error":"no text"}'); return; }

      // Build user message with optional preference context
      let userMsg = `User mood: "${text}"`;
      if (preferences && preferences.length > 0) {
        userMsg += `\n\nUser preference history (recent likes/dislikes):\n${JSON.stringify(preferences.slice(-10))}`;
        userMsg += `\nBias toward parameters similar to liked states. Avoid parameters similar to disliked states.`;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://kalma-player.app',
          'X-Title': 'Kalma Player Music Brain'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: MOOD_SYSTEM_PROMPT },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      const rawText = await response.text();
      let data;
      try { data = JSON.parse(rawText); } catch (e) {
        console.error('[Kálma AI] Failed to parse OpenRouter response:', rawText.slice(0, 500));
        throw new Error('OpenRouter response not JSON');
      }

      if (data.error) {
        console.error('[Kálma AI] OpenRouter error:', data.error);
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      const content = data.choices?.[0]?.message?.content || '';
      console.log('[Kálma AI] Raw LLM output:', content.slice(0, 300));

      // Extract JSON from response (handle potential markdown wrapping)
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const musical = JSON.parse(jsonStr);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ source: 'llm', params: musical }));
    } catch (err) {
      console.error('[Kálma AI] LLM interpret error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ source: 'fallback', error: err.message }));
    }
  });
}

http.createServer((req, res) => {
  // Strip reverse proxy prefix (e.g. /12002/) so all routes work behind proxy
  req.url = req.url.replace(/^\/\d{4,5}/, '') || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // LLM mood interpretation endpoint
  if (req.method === 'POST' && req.url === '/api/interpret-mood') {
    handleMoodInterpret(req, res);
    return;
  }

  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  const full = path.join(APP_DIR, filePath);

  // Security: no path traversal
  if (!full.startsWith(APP_DIR)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`Kalma Player server running on port ${PORT}`);
});
