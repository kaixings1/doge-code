/** Browser management assets and same-origin protection. No filesystem paths are accepted from URLs. */
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/theme.js', ['theme.js', 'text/javascript; charset=utf-8']],
  ['/web-api.js', ['web-api.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/logs-panel.js', ['logs-panel.js', 'text/javascript; charset=utf-8']],
  ['/desensitize-panel.js', ['desensitize-panel.js', 'text/javascript; charset=utf-8']],
  ['/web.css', ['web.css', 'text/css; charset=utf-8']],
]);
const ROOT = new URL('../desktop/renderer/', import.meta.url);

export function isLoopback(host) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(String(host).toLowerCase());
}

export function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Prevent foreign websites / DNS rebinding from controlling an unauthenticated local gateway. */
export function allowManagementRequest(req, { host = '127.0.0.1', apiKey } = {}) {
  let target;
  try { target = new URL(`http://${req.headers.host}`); } catch { return false; }
  const configured = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const local = String(req.socket?.localAddress || '').replace(/^::ffff:/, '');
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  // A wildcard listener only accepts IP hosts, not arbitrary DNS names without authentication.
  if (!apiKey && !isLoopback(hostname) && hostname !== configured
    && !(isIP(hostname) && hostname === local)) return false;
  if (isLoopback(configured) && !isLoopback(hostname)) return false;
  if (!apiKey && !isLoopback(remote)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const source = new URL(origin);
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== target.host) return false;
    } catch { return false; }
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}

export async function serveManagementAsset(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  if (pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return true; }
  const asset = ASSETS.get(pathname);
  if (!asset) return false;
  const [filename, contentType] = asset;
  const body = await readFile(new URL(filename, ROOT));
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
