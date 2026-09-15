import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Serves the styled 403 page with a real 403 status.
 *
 * vercel.json rewrites the URLs of disabled pages (currently the Services page,
 * which stays in the repo but is excluded from deploys by .vercelignore) to this
 * function. A static file can't choose its own status code on Vercel, so without
 * this those URLs would fall through to the 404 page instead.
 */

const FALLBACK_PAGE = '<!doctype html><meta charset="utf-8"><title>403 — Access Denied</title><h1>403 — Access Denied</h1>';

let cachedPage = null;

function forbiddenPage() {
  if (cachedPage === null) {
    try {
      // 403.html is bundled with this function via "includeFiles" in vercel.json.
      cachedPage = readFileSync(join(process.cwd(), '403.html'), 'utf8');
    } catch (err) {
      cachedPage = FALLBACK_PAGE;
    }
  }
  return cachedPage;
}

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(403).send(forbiddenPage());
}
