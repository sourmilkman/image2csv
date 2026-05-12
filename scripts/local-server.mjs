import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const siteRoot = path.resolve(process.env.SITE_ROOT || path.join(appRoot, '..', 'tommulliner.com'));
const distRoot = path.join(appRoot, 'dist');
const csvPath = path.join(siteRoot, 'public', 'data', 'artworks.csv');
const artworkRoot = path.join(siteRoot, 'public', 'images', 'artwork');
const port = Number(process.env.IMAGE2CSV_PORT || 4177);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeArtworkPath(url) {
  const raw = url.searchParams.get('path') || '';
  const clean = decodeURIComponent(raw)
    .replace(/^\/+/, '')
    .replace(/^images\/artwork\//i, '');
  const resolved = path.resolve(artworkRoot, clean);
  if (!resolved.startsWith(artworkRoot + path.sep)) {
    throw new Error('Invalid image path');
  }
  return resolved;
}

async function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const resolved = path.resolve(distRoot, requested.replace(/^\/+/, ''));
  const fallback = path.join(distRoot, 'index.html');
  const filePath = resolved.startsWith(distRoot + path.sep) ? resolved : fallback;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(filePath)) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    createReadStream(fallback).pipe(res);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, siteRoot }), 'application/json; charset=utf-8');
    }

    if (url.pathname === '/api/csv') {
      if (req.method === 'GET') {
        return send(res, 200, await readFile(csvPath, 'utf8'), 'text/csv; charset=utf-8');
      }
      if (req.method === 'PUT') {
        await mkdir(path.dirname(csvPath), { recursive: true });
        await writeFile(csvPath, await readBody(req));
        return send(res, 200, 'OK');
      }
    }

    if (url.pathname === '/api/image') {
      const imagePath = safeArtworkPath(url);
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
        return createReadStream(imagePath).pipe(res);
      }
      if (req.method === 'PUT') {
        await mkdir(path.dirname(imagePath), { recursive: true });
        await writeFile(imagePath, await readBody(req));
        return send(res, 200, 'OK');
      }
      if (req.method === 'DELETE') {
        await rm(imagePath, { force: true });
        return send(res, 200, 'OK');
      }
    }

    return serveStatic(req, res, url);
  } catch (error) {
    return send(res, 500, error?.message || String(error));
  }
});

server.listen(port, () => {
  console.log(`Image2CSV local writer running at http://localhost:${port}`);
  console.log(`Writing to: ${siteRoot}`);
});
