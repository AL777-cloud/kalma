const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 12005;
const APP_DIR = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.webm': 'audio/webm'
};

http.createServer((req, res) => {
  req.url = req.url.replace(/^\/\d{4,5}/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  const full = path.join(APP_DIR, filePath);

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
  console.log(`Kálma Audio Lab running on port ${PORT}`);
});
