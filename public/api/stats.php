<?php
/**
 * Live bug-bounty stats endpoint.
 *
 * Pulls public, unauthenticated JSON from Bugcrowd's profile-service API and
 * scrapes CyberTalents' server-side DataTables leaderboard for Egypt rank
 * (world rank + points come straight from the profile page widget instead —
 * see fetch_cybertalents_batch() for why). Both are cheap plain HTTP calls
 * (no headless browser needed) — see memory for how these endpoints were
 * discovered.
 *
 * No caching — every request hits Bugcrowd/CyberTalents fresh. Traffic is low
 * enough that this is fine, and it means numbers are never stale.
 *
 * The four independent GETs (2x Bugcrowd, CyberTalents profile page,
 * CyberTalents /worldrank page) run concurrently via curl_multi instead of
 * one after another — CyberTalents alone is a slow, uncached, server-rendered
 * DataTables backend (multi-second per request), so running things in
 * parallel instead of in series is what keeps total latency reasonable.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));

const BUGCROWD_USERNAME = 'agentx512';
const CYBERTALENTS_USERNAME = 'agentx512';
const WANTED_BUGCROWD_BADGES = ['BOUNTY_BEE', 'SUBMISSION_SHOGUN', 'P1_WARRIOR'];
const USER_AGENT = 'Mozilla/5.0 (compatible; agentx512-portfolio/1.0; +https://agentx512.local/)';

/**
 * Runs several GET requests concurrently. $requests maps an arbitrary key to
 * ['url' => ..., 'cookieJar' => optional path to read/write cookies].
 * Returns the same keys mapped to response bodies (or null on failure).
 */
function http_get_multi(array $requests): array {
    $mh = curl_multi_init();
    $handles = [];
    foreach ($requests as $key => $req) {
        $ch = curl_init($req['url']);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_FOLLOWLOCATION => true,
        ];
        if (!empty($req['cookieJar'])) {
            $opts[CURLOPT_COOKIEJAR] = $req['cookieJar'];
            $opts[CURLOPT_COOKIEFILE] = $req['cookieJar'];
        }
        curl_setopt_array($ch, $opts);
        curl_multi_add_handle($mh, $ch);
        $handles[$key] = $ch;
    }

    $running = null;
    do {
        curl_multi_exec($mh, $running);
        if ($running > 0) curl_multi_select($mh);
    } while ($running > 0);

    $results = [];
    foreach ($handles as $key => $ch) {
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $body = curl_multi_getcontent($ch);
        $results[$key] = ($body !== false && $code === 200) ? $body : null;
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $results;
}

function http_post(string $url, array $fields, string $cookieFile, string $csrf): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($fields),
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_USERAGENT => USER_AGENT,
        CURLOPT_HTTPHEADER => [
            'X-CSRF-TOKEN: ' . $csrf,
            'X-Requested-With: XMLHttpRequest',
            'X-HTTP-Method-Override: GET',
            'Accept: application/json',
            'Referer: ' . $url,
        ],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body !== false && $code === 200) ? $body : null;
}

function parse_bugcrowd(?string $perfRaw, ?string $badgesRaw): ?array {
    if ($perfRaw === null && $badgesRaw === null) return null;

    $out = [];
    $perf = $perfRaw ? json_decode($perfRaw, true) : null;
    if (is_array($perf)) {
        $out['vulnerabilities'] = $perf['validFindingsCount'] ?? null;
        $out['accuracy'] = $perf['accuracy'] ?? null;
        $out['points'] = $perf['allTimePoints'] ?? null;
    }

    $badgesData = $badgesRaw ? json_decode($badgesRaw, true) : null;
    if (is_array($badgesData) && !empty($badgesData['awardedBadges'])) {
        $bySet = [];
        foreach ($badgesData['awardedBadges'] as $b) {
            if (empty($b['badgeAttainment']['awarded'])) continue;
            $slug = $b['badgeSetSlug'] ?? null;
            if ($slug === null) continue;
            if (!isset($bySet[$slug]) || $b['badgeLevel'] > $bySet[$slug]['badgeLevel']) {
                $bySet[$slug] = $b;
            }
        }
        $badges = [];
        foreach (WANTED_BUGCROWD_BADGES as $slug) {
            if (!isset($bySet[$slug])) continue;
            $b = $bySet[$slug];
            $badges[] = [
                'slug' => $slug,
                'name' => $b['badgeName'],
                'level' => $b['badgeLevel'],
                'description' => $b['badgeThresholdDescription'],
            ];
        }
        $out['badges'] = $badges;
    }

    return $out ?: null;
}

function ct_find_rank(string $cookieFile, string $csrf, string $countryCode, string $username): ?array {
    $columns = ['DT_RowIndex', 'user.username', 'points', 'country', 'won_at'];
    $start = 0;
    $length = 500;
    // Capped pagination — real rank was found on page 1 in testing; this just
    // gives headroom if it ever climbs past 500 within a country/world list.
    for ($page = 0; $page < 6; $page++) {
        $payload = [
            'draw' => 1,
            'start' => $start,
            'length' => $length,
            'search' => ['value' => '', 'regex' => 'false'],
            'order' => [['column' => 1, 'dir' => 'asc']],
            'country_code' => $countryCode,
            '_token' => $csrf,
        ];
        foreach ($columns as $i => $name) {
            $payload['columns'][$i] = [
                'data' => $name, 'name' => $name,
                'searchable' => 'true', 'orderable' => 'false',
                'search' => ['value' => '', 'regex' => 'false'],
            ];
        }
        $resp = http_post('https://cybertalents.com/worldrank', $payload, $cookieFile, $csrf);
        if ($resp === null) return null;
        $data = json_decode($resp, true);
        if (!is_array($data) || empty($data['data'])) return null;
        foreach ($data['data'] as $row) {
            if (strcasecmp($row['user']['username'] ?? '', $username) === 0) {
                return $row;
            }
        }
        $start += $length;
        if (!isset($data['recordsFiltered']) || $start > $data['recordsFiltered']) break;
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
function parse_cybertalents_and_search(string $user, ?string $profilePage, ?string $worldrankPage, string $cookieFile): ?array {
    $worldRank = null;
    $points = null;
    if ($profilePage !== null) {
        if (preg_match('/World Rank\s*<span[^>]*>([\d,]+)<\/span>/', $profilePage, $m)) {
            $worldRank = (int) str_replace(',', '', $m[1]);
        }
        if (preg_match('/World Rank Score\s*<span[^>]*>([\d,]+)<\/span>/', $profilePage, $m)) {
            $points = (int) str_replace(',', '', $m[1]);
        }
    }

    $egyptRank = null;
    if ($worldrankPage !== null && preg_match('/name="csrf-token" content="([^"]*)"/', $worldrankPage, $m)) {
        $csrf = $m[1];
        // Cookie jar was already primed by this same GET in the concurrent
        // batch (see http_get_multi), so no extra request needed here.
        $egyptRow = ct_find_rank($cookieFile, $csrf, 'eg', $user);
        $egyptRank = $egyptRow['DT_RowIndex'] ?? null;

        // Fallback only: if the profile-page scrape above failed, fall back
        // to the leaderboard table for world rank/points too.
        if ($worldRank === null || $points === null) {
            $worldRow = ct_find_rank($cookieFile, $csrf, '', $user);
            if ($worldRow) {
                $worldRank = $worldRank ?? ($worldRow['DT_RowIndex'] ?? null);
                if ($points === null) {
                    $pointsRaw = $worldRow['points'] ?? null;
                    $points = $pointsRaw !== null ? (int) str_replace(',', '', $pointsRaw) : null;
                }
            }
        }
    }

    if ($egyptRank === null && $worldRank === null) return null;

    return [
        'egyptRank' => $egyptRank,
        'worldRank' => $worldRank,
        'points' => $points,
    ];
}

$bcUser = BUGCROWD_USERNAME;
$ctUser = CYBERTALENTS_USERNAME;
$ctCookieFile = tempnam(sys_get_temp_dir(), 'ct_');

try {
    $batch = http_get_multi([
        'bc_perf' => ['url' => "https://bugcrowd.com/profile-service/v1/profiles/$bcUser/performanceStatistics"],
        'bc_badges' => ['url' => "https://bugcrowd.com/profile-service/v1/profiles/$bcUser/badgeAttainments"],
        'ct_profile' => ['url' => "https://cybertalents.com/members/$ctUser/profile"],
        'ct_worldrank' => ['url' => 'https://cybertalents.com/worldrank', 'cookieJar' => $ctCookieFile],
    ]);

    $result = [
        'bugcrowd' => parse_bugcrowd($batch['bc_perf'], $batch['bc_badges']),
        'cybertalents' => parse_cybertalents_and_search($ctUser, $batch['ct_profile'], $batch['ct_worldrank'], $ctCookieFile),
        'generatedAt' => gmdate('c'),
    ];
} finally {
    @unlink($ctCookieFile);
}

echo json_encode($result);
