const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 12002;
const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]).replace(/^\/12002/, '');
  if (url === '/' || url === '') url = '/index.html';
  const fp = path.join(__dirname, url);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('Lyria test server on port ' + PORT));
