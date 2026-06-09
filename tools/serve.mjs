/* 로컬 정적 서버 (E2E 테스트용, 무의존). node tools/serve.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = 'C:/Users/9835h_ztn/veil';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = join(root, normalize(p).replace(/^(\.\.[\/\\])+/, ''));
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': types[extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(4599, () => console.log('serving veil on http://localhost:4599'));
