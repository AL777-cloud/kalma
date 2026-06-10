/* Kálma — Voice Script Generator
   Uses NihalGazi/Text-To-Speech-Unlimited HuggingFace Space (edge-tts)
   Free, unlimited, no API key needed */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SPACE = 'https://nihalgazi-text-to-speech-unlimited.hf.space';
const VOICE = 'alloy';
const EMOTION = 'calm';
const OUTPUT_DIR = path.join(__dirname, 'app', 'audio', 'voice');

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function streamGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function generateAudio(text, outputFile) {
  // Truncate to 200 char limit per request
  const chunks = splitText(text, 195);
  const buffers = [];

  for (const chunk of chunks) {
    console.log(`  Generating chunk (${chunk.length} chars)...`);

    // Submit job
    const submit = await httpsPost(
      `${SPACE}/gradio_api/call/text_to_speech_app`,
      { data: [chunk, VOICE, EMOTION, true, 12345, ''] }
    );

    if (!submit.event_id) {
      console.log('  ✗ No event_id:', JSON.stringify(submit).slice(0, 200));
      continue;
    }

    // Poll for result
    const result = await streamGet(
      `${SPACE}/gradio_api/call/text_to_speech_app/${submit.event_id}`
    );

    // Parse SSE response
    const completeLine = result.split('\n').find(l => l.startsWith('data: ['));
    if (!completeLine) {
      console.log('  ✗ No complete event');
      continue;
    }

    const parsed = JSON.parse(completeLine.replace('data: ', ''));
    if (parsed[0] && parsed[0].url) {
      const audio = await httpsGet(parsed[0].url);
      buffers.push(audio);
      console.log(`  ✓ Got ${audio.length} bytes`);
    }

    // Delay between chunks
    await new Promise(r => setTimeout(r, 1500));
  }

  if (buffers.length > 0) {
    // Concatenate all MP3 buffers (simple concat works for MP3)
    const combined = Buffer.concat(buffers);
    fs.writeFileSync(outputFile, combined);
    console.log(`  ✓ Saved: ${outputFile} (${combined.length} bytes)`);
    return true;
  }
  return false;
}

// Split text into chunks under maxLen, breaking at sentence boundaries
function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    if (current.length + s.length + 1 > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function processScript(scriptFile) {
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  const name = path.basename(scriptFile, '.json');
  const dir = path.join(OUTPUT_DIR, name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log(`\n=== Processing: ${name} ===\n`);

  // Intro
  console.log('Generating intro...');
  await generateAudio(script.intro.join('. '), path.join(dir, 'intro.mp3'));
  await new Promise(r => setTimeout(r, 2000));

  // Body segments
  for (let i = 0; i < script.body.length; i++) {
    console.log(`Generating body segment ${i + 1}/${script.body.length}...`);
    await generateAudio(script.body[i].join('. '), path.join(dir, `body-${i}.mp3`));
    await new Promise(r => setTimeout(r, 2000));
  }

  // Closing
  console.log('Generating closing...');
  await generateAudio(script.closing.join('. '), path.join(dir, 'closing.mp3'));

  console.log(`\n✓ Finished: ${name}\n`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const scriptsDir = path.join(__dirname, 'app', 'scripts');

  // Priority scripts first
  const priority = ['gentle-meditation.json', 'breathwork.json', 'reflective.json'];

  for (const file of priority) {
    const fp = path.join(scriptsDir, file);
    if (fs.existsSync(fp)) await processScript(fp);
  }

  console.log('\n=== Priority scripts done ===');

  if (process.argv.includes('--all')) {
    const all = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.json'));
    for (const file of all) {
      if (!priority.includes(file)) {
        await processScript(path.join(scriptsDir, file));
      }
    }
    console.log('\n=== All scripts done ===');
  }
}

main().catch(console.error);
