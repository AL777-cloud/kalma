// Vercel Serverless Function: POST /api/interpret-mood
// Proxies mood text to OpenRouter LLM and returns musical parameters

const OPENROUTER_KEY = process.env.OPENROUTER_KEY || '';
const LLM_MODEL = 'google/gemini-2.5-flash-lite';

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

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OPENROUTER_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_KEY not configured' });
  }

  try {
    const { text, preferences } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'no text' });
    }

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
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: MOOD_SYSTEM_PROMPT },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('[Kálma AI] OpenRouter error:', data.error);
      return res.status(502).json({ error: 'LLM error', detail: data.error.message || 'unknown' });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'No LLM response' });
    }

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'LLM returned non-JSON' });
    }

    const params = JSON.parse(jsonMatch[0]);
    return res.status(200).json(params);
  } catch (err) {
    console.error('[Kálma AI] Error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
