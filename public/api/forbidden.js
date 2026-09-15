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

// 403.html is bundled with this function via "includeFiles" in vercel.json, but
// where it lands inside the bundle depends on how Vercel lays out a project with
// a Root Directory (the first deploy didn't find it at cwd/403.html), so look in
// every plausible spot.
const CANDIDATE_FILES = [
  typeof __dirname === 'string' ? join(__dirname, '..', '403.html') : null,
  join(process.cwd(), '403.html'),
  join(process.cwd(), 'public', '403.html'),
].filter(Boolean);

let cachedPage = null;

async function forbiddenPage(req) {
  if (cachedPage) return cachedPage;

  for (const file of CANDIDATE_FILES) {
    try {
      cachedPage = readFileSync(file, 'utf8');
      return cachedPage;
    } catch (err) {
      // Not at this path — try the next one.
    }
  }

  // Last resort: the same page is deployed as a static file too, so fetch it from
  // this deployment. This function only runs for hosts routed to this project, so
  // the Host header can't point the request anywhere else.
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (/^[a-z0-9.-]+$/i.test(host)) {
    try {
      const response = await fetch(`https://${host}/403.html`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        cachedPage = await response.text();
        return cachedPage;
      }
    } catch (err) {
      // Fall through to the minimal page.
    }
  }

  return FALLBACK_PAGE;
}

export default async function handler(req, res) {
  const page = await forbiddenPage(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(403).send(page);
}
