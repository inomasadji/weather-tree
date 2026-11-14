// Минимальный статический сервер для локальной разработки и e2e-проверок.
// Без зависимостей: только node:http / node:fs / node:path.
// Использование: node tools/dev-server.mjs [--port 5173]

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Превращает URL в безопасный путь внутри ROOT. */
function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(clean).replace(/^([/\\])+/, '');
  if (relative.startsWith('..') || relative.includes(`..${sep}`)) return null;
  return join(ROOT, relative || 'index.html');
}

/** @returns {import('node:http').Server} */
export function createStaticServer() {
  return createServer(async (req, res) => {
    let filePath = resolvePath(req.url || '/');
    if (!filePath) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
      await stat(filePath);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 — файл не найден');
      return;
    }

    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const portArg = process.argv.indexOf('--port');
  const port = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT) || 5173;
  createStaticServer().listen(port, () => {
    console.log(`Weather Tree → http://localhost:${port}`);
  });
}
