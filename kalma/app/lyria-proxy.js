/* Kálma — Lyria RealTime Backend Proxy
   Correct protocol for Lyria RealTime experimental model */

const WebSocket = require('ws');

class LyriaProxy {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.clients = new Map();
  }

  attach(server) {
    const wss = new WebSocket.Server({ server, path: '/lyria' });

    wss.on('connection', (clientWs) => {
      const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2);
      console.log('[Lyria Proxy] Client connected:', clientId);

      const client = { ws: clientWs, lyria: null, setupDone: false };
      this.clients.set(clientId, client);

      clientWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this._handleClientMessage(clientId, msg);
        } catch (e) {
          console.warn('[Lyria Proxy] Bad message:', e.message);
        }
      });

      clientWs.on('close', () => {
        console.log('[Lyria Proxy] Client disconnected:', clientId);
        this._disconnectLyria(clientId);
        this.clients.delete(clientId);
      });
    });

    console.log('[Lyria Proxy] WebSocket endpoint ready at /lyria');
  }

  _handleClientMessage(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.action) {
      case 'connect':
        this._connectLyria(clientId);
        break;
      case 'set_prompts':
        if (client.lyria && client.setupDone) {
          // Lyria uses setWeightedPrompts in clientContent
          this._sendLyria(clientId, {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: JSON.stringify({ setWeightedPrompts: { prompts: msg.prompts } }) }]
              }],
              turnComplete: true
            }
          });
        }
        break;
      case 'set_config':
        if (client.lyria && client.setupDone) {
          this._sendLyria(clientId, {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: JSON.stringify({ setMusicGenerationConfig: { config: msg.config } }) }]
              }],
              turnComplete: true
            }
          });
        }
        break;
      case 'play':
        if (client.lyria && client.setupDone) {
          this._sendLyria(clientId, {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: JSON.stringify({ play: {} }) }]
              }],
              turnComplete: true
            }
          });
        }
        break;
      case 'pause':
        if (client.lyria && client.setupDone) {
          this._sendLyria(clientId, {
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: JSON.stringify({ pause: {} }) }]
              }],
              turnComplete: true
            }
          });
        }
        break;
      case 'stop':
        this._disconnectLyria(clientId);
        break;
    }
  }

  _connectLyria(clientId) {
    const client = this.clients.get(clientId);
    if (!client || client.lyria) return;

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    try {
      const lyria = new WebSocket(url);
      client.lyria = lyria;

      lyria.on('open', () => {
        console.log('[Lyria Proxy] Connected to Google API');

        // Send setup as the FIRST message — must be setup only, nothing else
        const setup = {
          setup: {
            model: 'models/lyria-realtime-exp'
          }
        };
        lyria.send(JSON.stringify(setup));
        console.log('[Lyria Proxy] Setup sent');
      });

      lyria.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log('[Lyria Proxy] Received:', JSON.stringify(msg).slice(0, 300));

          // Check for setup complete
          if (msg.setupComplete) {
            client.setupDone = true;
            console.log('[Lyria Proxy] Setup complete!');
            client.ws.send(JSON.stringify({ type: 'ready' }));
            return;
          }

          // Forward audio data
          if (msg.serverContent) {
            const turn = msg.serverContent.modelTurn;
            if (turn && turn.parts) {
              for (const part of turn.parts) {
                if (part.inlineData) {
                  client.ws.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                    mime: part.inlineData.mimeType || 'audio/pcm'
                  }));
                }
              }
            }
            // Also check for direct audio chunks
            if (msg.serverContent.audioChunks) {
              client.ws.send(JSON.stringify({
                type: 'audio',
                data: msg.serverContent.audioChunks.data || msg.serverContent.audioChunks,
                mime: 'audio/pcm'
              }));
            }
          }
        } catch (e) {
          // Binary data — could be raw audio
          if (Buffer.isBuffer(data)) {
            client.ws.send(data);
          }
        }
      });

      lyria.on('error', (err) => {
        console.warn('[Lyria Proxy] Lyria error:', err.message);
        client.ws.send(JSON.stringify({ type: 'error', message: err.message }));
      });

      lyria.on('close', (code, reason) => {
        console.log('[Lyria Proxy] Lyria closed:', code, reason ? reason.toString() : '');
        client.lyria = null;
        client.setupDone = false;
        client.ws.send(JSON.stringify({ type: 'disconnected', code }));
      });

    } catch (e) {
      console.warn('[Lyria Proxy] Connection failed:', e.message);
      client.ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  }

  _sendLyria(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client || !client.lyria || client.lyria.readyState !== WebSocket.OPEN) return;
    const str = JSON.stringify(msg);
    console.log('[Lyria Proxy] Sending to Lyria:', str.slice(0, 200));
    client.lyria.send(str);
  }

  _disconnectLyria(clientId) {
    const client = this.clients.get(clientId);
    if (!client || !client.lyria) return;
    try { client.lyria.close(); } catch (e) {}
    client.lyria = null;
    client.setupDone = false;
  }
}

module.exports = LyriaProxy;
