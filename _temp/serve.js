const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname);

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let filePath = path.join(dir, req.url === '/' ? '/nav-redesign-mockup.html' : req.url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(4444, () => console.log('Server running on port 4444'));
