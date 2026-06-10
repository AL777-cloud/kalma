/* Kálma — Voice Guidance Engine
   Browser SpeechSynthesis with pacing, ducking, and script assembly */

class EngineVoice {
  constructor(core) {
    this.core = core;
    this.synth = window.speechSynthesis;
    this.speaking = false;
    this.paused = false;
    this.queue = [];        // lines to speak
    this.currentUtterance = null;
    this.onDuckStart = null; // callback: music should duck
    this.onDuckEnd = null;   // callback: music should unduck
    this.voice = null;
    this.settings = { rate: 0.82, pitch: 0.95 };
    this._stopped = false;
    this._lineTimer = null;
  }

  // Find the best available voice — prefer neutral/US English, warm tones
  _pickVoice() {
    const voices = this.synth.getVoices();
    if (voices.length === 0) return null;

    // Log available voices for debugging
    console.log('[Kálma Voice] Available voices:', voices.map(v => v.name + ' (' + v.lang + ')').join(', '));

    // Priority: soft, neutral, female-sounding voices
    const preferred = [
      'Microsoft Zira',                                   // Windows — soft, calm
      'Google US English',                                // Chrome — neutral US
      'Samantha',                                         // Apple — warm, neutral
      'Microsoft Jenny',                                  // Windows — natural
      'Microsoft Aria',                                   // Windows — warm
      'Google UK English Female',                         // Chrome — UK fallback
    ];

    for (const name of preferred) {
      const found = voices.find(v => v.name.includes(name));
      if (found) {
        console.log('[Kálma Voice] Selected:', found.name);
        return found;
      }
    }

    // Fallback: any US English voice first
    const us = voices.find(v => v.lang === 'en-US');
    if (us) return us;

    // Then any English
    const english = voices.find(v => v.lang.startsWith('en'));
    if (english) return english;

    return voices[0];
  }

  // Load a script and assemble based on timer
  loadScript(script, timerMinutes) {
    this.settings = script.voiceSettings || this.settings;

    const lines = [];

    // Intro — always include
    lines.push(...script.intro);
    lines.push('__pause_long__'); // longer pause after intro

    // Body — select segments based on timer
    const bodySegments = script.body || [];
    let segmentsNeeded;

    if (timerMinutes === 0 || timerMinutes >= 45) {
      segmentsNeeded = bodySegments.length; // all segments
    } else if (timerMinutes >= 30) {
      segmentsNeeded = 4;
    } else if (timerMinutes >= 20) {
      segmentsNeeded = 3;
    } else {
      segmentsNeeded = 2; // 10 min — just intro + 2 body + closing
    }

    // Pick segments (in order, up to what we need)
    for (let i = 0; i < Math.min(segmentsNeeded, bodySegments.length); i++) {
      lines.push(...bodySegments[i]);
      lines.push('__pause_long__');
    }

    // Closing — always include
    lines.push(...script.closing);

    this.queue = lines;
  }

  // Personalize intro with user's prompt
  personalizeIntro(promptText) {
    if (!promptText || this.queue.length === 0) return;

    // Insert a personalized line after the first intro line
    const personal = this._generatePersonalLine(promptText);
    this.queue.splice(1, 0, personal);
  }

  _generatePersonalLine(text) {
    const t = text.toLowerCase();

    if (/lonely|alone|isolated/.test(t)) {
      return "You mentioned feeling lonely. Know that right here, right now, you are not alone. This moment is yours, and I'm here with you.";
    }
    if (/anxious|anxiety|worried|nervous|panic/.test(t)) {
      return "You shared that you're feeling anxious. That's okay. Anxiety is just energy without a direction. Let's give it somewhere gentle to go.";
    }
    if (/sad|down|depress|unhappy|grief|loss/.test(t)) {
      return "You mentioned feeling sad. Sadness is not weakness. It's proof that you care deeply. Let's sit with it together, without trying to rush past it.";
    }
    if (/stress|overwhelm|exhaust|tired|burn/.test(t)) {
      return "You're feeling overwhelmed. You've been carrying a lot. For the next few minutes, you don't have to carry any of it. Set it all down.";
    }
    if (/angry|frustrat|irritat|annoyed/.test(t)) {
      return "There's some frustration in you right now. That's valid. Let's not fight it. Let's breathe through it and see what's underneath.";
    }
    if (/sleep|insomnia|can't sleep|restless/.test(t)) {
      return "You're having trouble sleeping. Your mind is busy. Let's slowly quiet it, one breath at a time, until rest finds you.";
    }
    if (/happy|grateful|good|great|peaceful/.test(t)) {
      return "You're in a good place right now. Beautiful. Let's deepen that feeling and plant it somewhere you can return to.";
    }
    if (/focus|concentrate|distract|scattered/.test(t)) {
      return "Your mind feels scattered. That's okay. We're going to gently gather your attention, like picking up petals, one by one.";
    }

    // Default
    return "Thank you for sharing how you feel. Whatever you're carrying, you're welcome to set it down here. This time is just for you.";
  }

  // Start speaking the assembled script
  async start() {
    if (this.queue.length === 0) return;
    this._stopped = false;
    this.speaking = true;

    // Pick voice (may need to wait for voices to load)
    if (!this.voice) {
      this.voice = this._pickVoice();
      if (!this.voice) {
        // Voices not loaded yet — wait and retry
        await new Promise(resolve => {
          this.synth.onvoiceschanged = () => {
            this.voice = this._pickVoice();
            resolve();
          };
          setTimeout(resolve, 2000); // timeout fallback
        });
      }
    }

    this._speakNext();
  }

  _speakNext() {
    if (this._stopped || this.queue.length === 0) {
      this.speaking = false;
      if (this.onDuckEnd) this.onDuckEnd();
      return;
    }

    const line = this.queue.shift();

    // Handle pause markers
    if (line === '__pause_long__') {
      this._lineTimer = setTimeout(() => this._speakNext(), 8000); // 8s pause between sections — let the music breathe
      if (this.onDuckEnd) this.onDuckEnd(); // unduck during long pauses
      return;
    }

    // Duck the music
    if (this.onDuckStart) this.onDuckStart();

    const utterance = new SpeechSynthesisUtterance(line);
    if (this.voice) utterance.voice = this.voice;
    // Whisper-like: very slow, low pitch, soft volume
    utterance.rate = Math.min(this.settings.rate * 0.85, 0.75); // slow and deliberate
    utterance.pitch = this.settings.pitch * 0.85; // noticeably deeper
    utterance.volume = 0.6; // soft, like a whisper

    this.currentUtterance = utterance;

    utterance.onend = () => {
      this.currentUtterance = null;
      // Long pauses between lines — meditative, spacious
      const pause = 3500 + Math.random() * 3000;
      if (this.onDuckEnd) this.onDuckEnd();
      this._lineTimer = setTimeout(() => this._speakNext(), pause);
    };

    utterance.onerror = (e) => {
      console.warn('[Kálma Voice] Utterance error:', e);
      this._lineTimer = setTimeout(() => this._speakNext(), 1000);
    };

    this.synth.speak(utterance);
  }

  pause() {
    this.paused = true;
    this.synth.pause();
    if (this._lineTimer) clearTimeout(this._lineTimer);
  }

  resume() {
    this.paused = false;
    this.synth.resume();
  }

  stop() {
    this._stopped = true;
    this.speaking = false;
    this.paused = false;
    this.queue = [];
    if (this._lineTimer) clearTimeout(this._lineTimer);
    this.synth.cancel();
    this.currentUtterance = null;
    if (this.onDuckEnd) this.onDuckEnd();
  }

  // Get available voices for user selection (future)
  getVoices() {
    return this.synth.getVoices().filter(v => v.lang.startsWith('en'));
  }
}
