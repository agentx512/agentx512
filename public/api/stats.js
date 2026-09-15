/**
 * Live bug-bounty stats endpoint (Node port of the old stats.php, which
 * doesn't run on Vercel).
 *
 * Pulls public, unauthenticated JSON from Bugcrowd's profile-service API and
 * scrapes CyberTalents' server-side DataTables leaderboard for Egypt rank
 * (world rank + points come straight from the profile page widget instead —
 * see parseCybertalentsAndSearch() for why). All four independent GETs run
 * concurrently instead of one after another — CyberTalents alone is a slow,
 * uncached, server-rendered DataTables backend (multi-second per request),
 * so running things in parallel is what keeps total latency reasonable.
 *
 * No caching — every request hits Bugcrowd/CyberTalents fresh. Traffic is low
 * enough that this is fine, and it means numbers are never stale.
 */

const BUGCROWD_USERNAME = 'agentx512';
const CYBERTALENTS_USERNAME = 'agentx512';
const WANTED_BUGCROWD_BADGES = ['BOUNTY_BEE', 'SUBMISSION_SHOGUN', 'P1_WARRIOR'];
const USER_AGENT = 'Mozilla/5.0 (compatible; agentx512-portfolio/1.0; +https://www.agentx512.tech/)';

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    });
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Node's fetch has no cookie jar (unlike curl's CURLOPT_COOKIEJAR) — pull the
// Set-Cookie values off the /worldrank GET so they can be replayed manually
// on the DataTables POST that needs that same session.
function cookieHeaderFrom(res) {
  if (!res) return '';
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

function parseBugcrowd(perf, badgesData) {
  if (!perf && !badgesData) return null;
  const out = {};
  if (perf) {
    out.vulnerabilities = perf.validFindingsCount ?? null;
    out.accuracy = perf.accuracy ?? null;
    out.points = perf.allTimePoints ?? null;
  }
  if (badgesData && Array.isArray(badgesData.awardedBadges)) {
    const bySet = {};
    for (const b of badgesData.awardedBadges) {
      if (!b?.badgeAttainment?.awarded) continue;
      const slug = b.badgeSetSlug;
      if (!slug) continue;
      if (!bySet[slug] || b.badgeLevel > bySet[slug].badgeLevel) bySet[slug] = b;
    }
    const badges = [];
    for (const slug of WANTED_BUGCROWD_BADGES) {
      const b = bySet[slug];
      if (!b) continue;
      badges.push({ slug, name: b.badgeName, level: b.badgeLevel, description: b.badgeThresholdDescription });
    }
    out.badges = badges;
  }
  return Object.keys(out).length ? out : null;
}

// Capped pagination — real rank was found on page 1 in testing; this just
// gives headroom if it ever climbs past 500 within a country/world list.
async function ctFindRank(cookie, csrf, countryCode, username) {
  const columns = ['DT_RowIndex', 'user.username', 'points', 'country', 'won_at'];
  const length = 500;
  let start = 0;
  for (let page = 0; page < 6; page++) {
    const payload = new URLSearchParams();
    payload.set('draw', '1');
    payload.set('start', String(start));
    payload.set('length', String(length));
    payload.set('search[value]', '');
    payload.set('search[regex]', 'false');
    payload.set('order[0][column]', '1');
    payload.set('order[0][dir]', 'asc');
    payload.set('country_code', countryCode);
    payload.set('_token', csrf);
    columns.forEach((name, i) => {
      payload.set(`columns[${i}][data]`, name);
      payload.set(`columns[${i}][name]`, name);
      payload.set(`columns[${i}][searchable]`, 'true');
      payload.set(`columns[${i}][orderable]`, 'false');
      payload.set(`columns[${i}][search][value]`, '');
      payload.set(`columns[${i}][search][regex]`, 'false');
    });

    const res = await fetchWithTimeout('https://cybertalents.com/worldrank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'X-HTTP-Method-Override': 'GET',
        Accept: 'application/json',
        Referer: 'https://cybertalents.com/worldrank',
        Cookie: cookie,
      },
      body: payload.toString(),
    });
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.data) || !data.data.length) return null;
    const row = data.data.find((r) => (r?.user?.username || '').toLowerCase() === username.toLowerCase());
    if (row) return row;
    start += length;
    if (data.recordsFiltered === undefined || start > data.recordsFiltered) break;
  }
  return null;
}

/**
 * Parses the CyberTalents profile page (world rank + points — the exact
 * numbers the profile itself displays) and the /worldrank page (CSRF token +
 * primed session cookie, both already fetched in the concurrent batch), then
 * issues the one remaining request that has to happen after: the
 * country-filtered leaderboard search for Egypt rank, which isn't shown
 * anywhere on the profile page.
 *
 * World rank deliberately does NOT come from the /worldrank leaderboard
 * table: that table breaks ties in points by achievement date, which can
 * bury a recently-earned score at the bottom of a tie group even though the
 * profile page (and everyone else in that tie group) shows a better rank.
 */
async function parseCybertalentsAndSearch(username, profileHtml, worldrankHtml, cookie) {
  let worldRank = null;
  let points = null;
  if (profileHtml) {
    const rankMatch = profileHtml.match(/World Rank\s*<span[^>]*>([\d,]+)<\/span>/);
    if (rankMatch) worldRank = parseInt(rankMatch[1].replace(/,/g, ''), 10);
    const pointsMatch = profileHtml.match(/World Rank Score\s*<span[^>]*>([\d,]+)<\/span>/);
    if (pointsMatch) points = parseInt(pointsMatch[1].replace(/,/g, ''), 10);
  }

  let egyptRank = null;
  if (worldrankHtml) {
    const csrfMatch = worldrankHtml.match(/name="csrf-token" content="([^"]*)"/);
    if (csrfMatch) {
      const csrf = csrfMatch[1];
      const egyptRow = await ctFindRank(cookie, csrf, 'eg', username);
      egyptRank = egyptRow?.DT_RowIndex ?? null;

      // Fallback only: if the profile-page scrape above failed, fall back
      // to the leaderboard table for world rank/points too.
      if (worldRank === null || points === null) {
        const worldRow = await ctFindRank(cookie, csrf, '', username);
        if (worldRow) {
          if (worldRank === null) worldRank = worldRow.DT_RowIndex ?? null;
          if (points === null) {
            const p = worldRow.points;
            points = p !== undefined && p !== null ? parseInt(String(p).replace(/,/g, ''), 10) : null;
          }
        }
      }
    }
  }

  if (egyptRank === null && worldRank === null) return null;
  return { egyptRank, worldRank, points };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

  const bcUser = BUGCROWD_USERNAME;
  const ctUser = CYBERTALENTS_USERNAME;

  try {
    const [bcPerfRes, bcBadgesRes, ctProfileRes, ctWorldrankRes] = await Promise.all([
      fetchWithTimeout(`https://bugcrowd.com/profile-service/v1/profiles/${bcUser}/performanceStatistics`),
      fetchWithTimeout(`https://bugcrowd.com/profile-service/v1/profiles/${bcUser}/badgeAttainments`),
      fetchWithTimeout(`https://cybertalents.com/members/${ctUser}/profile`),
      fetchWithTimeout('https://cybertalents.com/worldrank'),
    ]);

    const bcPerf = bcPerfRes && bcPerfRes.ok ? await bcPerfRes.json().catch(() => null) : null;
    const bcBadges = bcBadgesRes && bcBadgesRes.ok ? await bcBadgesRes.json().catch(() => null) : null;
    const ctProfileHtml = ctProfileRes && ctProfileRes.ok ? await ctProfileRes.text().catch(() => null) : null;
    const ctWorldrankHtml = ctWorldrankRes && ctWorldrankRes.ok ? await ctWorldrankRes.text().catch(() => null) : null;
    const ctCookie = cookieHeaderFrom(ctWorldrankRes);

    const result = {
      bugcrowd: parseBugcrowd(bcPerf, bcBadges),
      cybertalents: await parseCybertalentsAndSearch(ctUser, ctProfileHtml, ctWorldrankHtml, ctCookie),
      generatedAt: new Date().toISOString(),
    };

    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ bugcrowd: null, cybertalents: null, generatedAt: new Date().toISOString() });
  }
}
