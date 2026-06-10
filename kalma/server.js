const http = require('http');
const fs = require('fs');
const path = require('path');
const LyriaProxy = require('./app/lyria-proxy');

const PORT = 12001;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

// Read API key from config
let apiKey = '';
try {
  const configSrc = fs.readFileSync(path.join(__dirname, 'app', 'config.js'), 'utf8');
  const match = configSrc.match(/lyriaApiKey:\s*'([^']+)'/);
  if (match) apiKey = match[1];
} catch (e) {}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  url = url.replace(/^\/12001/, '');
  if (url === '/' || url === '') url = '/index.html';

  const filePath = path.join(__dirname, 'app', url);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
});

// Attach Lyria WebSocket proxy
if (apiKey) {
  const lyria = new LyriaProxy(apiKey);
  lyria.attach(server);
  console.log('Lyria proxy enabled');
} else {
  console.log('No Lyria API key found, proxy disabled');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('Kalma server running on port ' + PORT);
});
