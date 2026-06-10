const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 12003;
const APP_DIR = path.join(__dirname, 'app');
const KALMA_DIR = path.join(__dirname, '..', 'kalma', 'app');
const PLAYER_DIR = path.join(__dirname, '..', 'kalma-player', 'app');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.ico': 'image/x-icon'
};

// API: scan assets from both projects
function scanAssets(dir, prefix) {
  const assets = [];
  try {
    const walk = (d, rel) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        const rp = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) {
          walk(full, rp);
        } else {
          const ext = path.extname(e.name).toLowerCase();
          const stat = fs.statSync(full);
          assets.push({
            name: e.name,
            path: prefix + '/' + rp,
            type: ext.replace('.', ''),
            size: stat.size,
            modified: stat.mtime.toISOString()
          });
        }
      }
    };
    walk(dir, '');
  } catch (e) {}
  return assets;
}

function serveFile(fullPath, res) {
  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // API endpoint: list all assets
  if (url === '/api/assets' || url.endsWith('/api/assets')) {
    const assets = [
      ...scanAssets(KALMA_DIR, 'kalma').filter(a => ['mp3','wav','ogg','webm','png','jpg','svg','json'].includes(a.type)),
      ...scanAssets(PLAYER_DIR, 'kalma-player').filter(a => ['mp3','wav','ogg','webm','png','jpg','svg','json'].includes(a.type))
    ];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(assets));
    return;
  }

  // Serve asset files from kalma/ and kalma-player/ projects
  if (url.startsWith('/assets/kalma/')) {
    const assetPath = path.join(KALMA_DIR, url.replace('/assets/kalma/', ''));
    if (!assetPath.startsWith(KALMA_DIR)) { res.writeHead(403); res.end(); return; }
    return serveFile(assetPath, res);
  }
  if (url.startsWith('/assets/kalma-player/')) {
    const assetPath = path.join(PLAYER_DIR, url.replace('/assets/kalma-player/', ''));
    if (!assetPath.startsWith(PLAYER_DIR)) { res.writeHead(403); res.end(); return; }
    return serveFile(assetPath, res);
  }

  // Serve static files
  let filePath = url === '/' ? '/index.html' : url;
  const full = path.join(APP_DIR, filePath);
  if (!full.startsWith(APP_DIR)) { res.writeHead(403); res.end(); return; }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`Kalma Hub running on port ${PORT}`);
});
