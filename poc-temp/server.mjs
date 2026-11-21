import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'poc-picker.html');
const PORT = Number(process.env.PORT ?? 5173);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (
    url.pathname === '/' ||
    url.pathname === '/poc-picker.html' ||
    url.pathname === '/poc-oauth-callback'
  ) {
    try {
      const html = await fs.readFile(HTML_PATH, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Failed to read poc-picker.html: ${err.message}`);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found. Open http://localhost:5173/');
});

server.listen(PORT, 'localhost', () => {
  console.log(`Veyra PoC Picker harness running at http://localhost:${PORT}/`);
  console.log(`OAuth callback ready at http://localhost:${PORT}/poc-oauth-callback`);
});
