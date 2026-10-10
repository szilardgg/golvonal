<?php
/**
 * Gólvonal – közös adatfüggvények (api.php és build.php használja)
 * Forrás: football-data.co.uk (eredmények, statisztikák, oddsok)
 * A letöltött CSV fájlokat a cache/ mappában tárolja.
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
set_time_limit(120);
date_default_timezone_set('Europe/Budapest');

const BASE_URL   = 'https://www.football-data.co.uk/';
const CACHE_DIR  = __DIR__ . '/cache';
const TTL_LIVE   = 3 * 3600;      // aktuális szezon
const TTL_FIX    = 1 * 3600;      // közelgő meccsek
const TTL_OLD    = 30 * 86400;    // lezárt szezonok

$LEAGUES = [
    // kód => [ország, név, ország rövid, típus, ország-csoport]
    'E0'  => ['Anglia', 'Premier League', 'ENG', 'main', 'ENG', 1],
    'E1'  => ['Anglia', 'Championship', 'ENG', 'main', 'ENG', 2],
    'E2'  => ['Anglia', 'League One', 'ENG', 'main', 'ENG', 3],
    'E3'  => ['Anglia', 'League Two', 'ENG', 'main', 'ENG', 4],
    'EC'  => ['Anglia', 'National League', 'ENG', 'main', 'ENG', 5],
    'SC0' => ['Skócia', 'Premiership', 'SCO', 'main', 'SCO', 1],
    'SC1' => ['Skócia', 'Championship', 'SCO', 'main', 'SCO', 2],
    'SC2' => ['Skócia', 'League One', 'SCO', 'main', 'SCO', 3],
    'SC3' => ['Skócia', 'League Two', 'SCO', 'main', 'SCO', 4],
    'D1'  => ['Németország', 'Bundesliga', 'GER', 'main', 'GER', 1],
    'D2'  => ['Németország', '2. Bundesliga', 'GER', 'main', 'GER', 2],
    'I1'  => ['Olaszország', 'Serie A', 'ITA', 'main', 'ITA', 1],
    'I2'  => ['Olaszország', 'Serie B', 'ITA', 'main', 'ITA', 2],
    'SP1' => ['Spanyolország', 'La Liga', 'ESP', 'main', 'ESP', 1],
    'SP2' => ['Spanyolország', 'Segunda División', 'ESP', 'main', 'ESP', 2],
    'F1'  => ['Franciaország', 'Ligue 1', 'FRA', 'main', 'FRA', 1],
    'F2'  => ['Franciaország', 'Ligue 2', 'FRA', 'main', 'FRA', 2],
    'N1'  => ['Hollandia', 'Eredivisie', 'NED', 'main', 'NED', 1],
    'B1'  => ['Belgium', 'Pro League', 'BEL', 'main', 'BEL', 1],
    'P1'  => ['Portugália', 'Liga Portugal', 'POR', 'main', 'POR', 1],
    'T1'  => ['Törökország', 'Süper Lig', 'TUR', 'main', 'TUR', 1],
    'G1'  => ['Görögország', 'Super League', 'GRE', 'main', 'GRE', 1],
    'AUT' => ['Ausztria', 'Bundesliga', 'AUT', 'extra', 'AUT', 1],
    'SWZ' => ['Svájc', 'Super League', 'SUI', 'extra', 'SUI', 1],
    'DNK' => ['Dánia', 'Superliga', 'DEN', 'extra', 'DEN', 1],
    'POL' => ['Lengyelország', 'Ekstraklasa', 'POL', 'extra', 'POL', 1],
    'ROU' => ['Románia', 'Superliga', 'ROU', 'extra', 'ROU', 1],
    'RUS' => ['Oroszország', 'Premier League', 'RUS', 'extra', 'RUS', 1],
    'NOR' => ['Norvégia', 'Eliteserien', 'NOR', 'extra', 'NOR', 1],
    'SWE' => ['Svédország', 'Allsvenskan', 'SWE', 'extra', 'SWE', 1],
    'FIN' => ['Finnország', 'Veikkausliiga', 'FIN', 'extra', 'FIN', 1],
    'IRL' => ['Írország', 'Premier Division', 'IRL', 'extra', 'IRL', 1],
    'ARG' => ['Argentína', 'Liga Profesional', 'ARG', 'extra', 'ARG', 1],
    'BRA' => ['Brazília', 'Série A', 'BRA', 'extra', 'BRA', 1],
    'MEX' => ['Mexikó', 'Liga MX', 'MEX', 'extra', 'MEX', 1],
    'USA' => ['USA', 'MLS', 'USA', 'extra', 'USA', 1],
    'JPN' => ['Japán', 'J1 League', 'JPN', 'extra', 'JPN', 1],
    'CHN' => ['Kína', 'Super League', 'CHN', 'extra', 'CHN', 1],
];

// new_league_fixtures.csv "Country" oszlop => kód
$EXTRA_BY_COUNTRY = [
    'Austria' => 'AUT', 'Switzerland' => 'SWZ', 'Denmark' => 'DNK', 'Poland' => 'POL',
    'Romania' => 'ROU', 'Russia' => 'RUS', 'Norway' => 'NOR', 'Sweden' => 'SWE',
    'Finland' => 'FIN', 'Ireland' => 'IRL', 'Argentina' => 'ARG', 'Brazil' => 'BRA',
    'Mexico' => 'MEX', 'USA' => 'USA', 'Japan' => 'JPN', 'China' => 'CHN',
];

/* ------------------------------------------------------------------ */
/* Segédfüggvények                                                     */
/* ------------------------------------------------------------------ */

function respond($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!headers_sent() && extension_loaded('zlib') && !ini_get('zlib.output_compression')
        && isset($_SERVER['HTTP_ACCEPT_ENCODING']) && str_contains($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip')) {
        ob_start('ob_gzhandler');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fail(string $msg, int $status = 400): void
{
    respond(['error' => $msg], $status);
}

function ensure_cache_dir(): void
{
    if (!is_dir(CACHE_DIR)) {
        @mkdir(CACHE_DIR, 0775, true);
        @file_put_contents(CACHE_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
    }
}

function cache_path(string $path): string
{
    return CACHE_DIR . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '_', $path);
}

function curl_handle(string $url)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 40,
        CURLOPT_ENCODING       => '',
        CURLOPT_USERAGENT      => 'Golvonal/1.0 (+local analysis tool)',
    ]);
    return $ch;
}

/**
 * Több fájl letöltése párhuzamosan, gyorsítótárazva.
 * @param array $items  [kulcs => [relatív útvonal, ttl]]
 * @return array        [kulcs => csv szöveg | null]
 */
function fetch_many(array $items): array
{
    ensure_cache_dir();
    $out = [];
    $need = [];
    foreach ($items as $key => [$path, $ttl]) {
        $file = cache_path($path);
        if (is_file($file) && (time() - filemtime($file)) < $ttl && filesize($file) > 0) {
            $out[$key] = file_get_contents($file);
        } else {
            $need[$key] = $path;
        }
    }
    if (!$need) return $out;

    $mh = curl_multi_init();
    $handles = [];
    foreach ($need as $key => $path) {
        $ch = curl_handle(BASE_URL . $path);
        curl_multi_add_handle($mh, $ch);
        $handles[$key] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $status === CURLM_OK);

    foreach ($handles as $key => $ch) {
        $path = $need[$key];
        $file = cache_path($path);
        $body = curl_multi_getcontent($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        $looksCsv = is_string($body) && strlen($body) > 20 && stripos(substr($body, 0, 400), '<html') === false;
        if ($code === 200 && $looksCsv) {
            @file_put_contents($file, $body, LOCK_EX);
            $out[$key] = $body;
        } elseif (is_file($file)) {
            // hálózati hiba esetén a régi példány is jobb a semminél
            $out[$key] = file_get_contents($file);
        } else {
            $out[$key] = null;
        }
    }
    curl_multi_close($mh);
    return $out;
}

function parse_csv(?string $text): array
{
    if ($text === null || $text === '') return [];
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    // néhány régi fájl Windows-1252 kódolású
    if (!mb_check_encoding($text, 'UTF-8')) {
        $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
    }
    $lines = preg_split('/\r\n|\n|\r/', trim($text));
    if (!$lines) return [];
    $head = str_getcsv(array_shift($lines));
    $head = array_map('trim', $head);
    $rows = [];
    foreach ($lines as $line) {
        if ($line === '' || trim($line, ", \t") === '') continue;
        $cells = str_getcsv($line);
        $row = [];
        foreach ($head as $i => $h) {
            if ($h === '') continue;
            $row[$h] = isset($cells[$i]) ? trim($cells[$i]) : '';
        }
        $rows[] = $row;
    }
    return $rows;
}

function num(array $r, string ...$keys): ?float
{
    foreach ($keys as $k) {
        if (isset($r[$k]) && $r[$k] !== '' && is_numeric($r[$k])) return (float)$r[$k];
    }
    return null;
}

function int_or_null(array $r, string ...$keys): ?int
{
    $v = num($r, ...$keys);
    return $v === null ? null : (int)round($v);
}

function parse_date(string $d): ?string
{
    $d = trim($d);
    if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2,4})$#', $d, $m)) {
        $y = (int)$m[3];
        if ($y < 100) $y += ($y > 70 ? 1900 : 2000);
        return sprintf('%04d-%02d-%02d', $y, (int)$m[2], (int)$m[1]);
    }
    return null;
}

function current_season_code(): string
{
    $y = (int)date('Y');
    $m = (int)date('n');
    $start = $m >= 7 ? $y : $y - 1;
    return sprintf('%02d%02d', $start % 100, ($start + 1) % 100);
}

function season_codes(int $count, ?string $from = null): array
{
    $from = $from ?? current_season_code();
    $start = 2000 + (int)substr($from, 0, 2);
    $out = [];
    for ($i = 0; $i < $count; $i++) {
        $s = $start - $i;
        if ($s < 1995) break;
        $out[] = sprintf('%02d%02d', $s % 100, ($s + 1) % 100);
    }
    return $out;
}

function season_label(string $code): string
{
    return '20' . substr($code, 0, 2) . '/' . substr($code, 2, 2);
}

/** Szorzók: elsőként a piaci átlag, majd a fogadóirodák. */
function odds_1x2(array $r, bool $closing = false): ?array
{
    $sets = $closing
        ? [['AvgCH', 'AvgCD', 'AvgCA'], ['PSCH', 'PSCD', 'PSCA'], ['B365CH', 'B365CD', 'B365CA'], ['MaxCH', 'MaxCD', 'MaxCA']]
        : [['AvgH', 'AvgD', 'AvgA'], ['BbAvH', 'BbAvD', 'BbAvA'], ['B365H', 'B365D', 'B365A'], ['PSH', 'PSD', 'PSA'], ['BWH', 'BWD', 'BWA'], ['WHH', 'WHD', 'WHA']];
    foreach ($sets as [$h, $d, $a]) {
        $oh = num($r, $h); $od = num($r, $d); $oa = num($r, $a);
        if ($oh && $od && $oa && $oh > 1 && $od > 1 && $oa > 1) return [$oh, $od, $oa];
    }
    return null;
}

function odds_max(array $r, bool $closing = false): ?array
{
    $sets = $closing ? [['MaxCH', 'MaxCD', 'MaxCA']] : [['MaxH', 'MaxD', 'MaxA'], ['BbMxH', 'BbMxD', 'BbMxA']];
    foreach ($sets as [$h, $d, $a]) {
        $oh = num($r, $h); $od = num($r, $d); $oa = num($r, $a);
        if ($oh && $od && $oa) return [$oh, $od, $oa];
    }
    return null;
}

function odds_ou(array $r, bool $closing = false): ?array
{
    $sets = $closing
        ? [['AvgC>2.5', 'AvgC<2.5'], ['PC>2.5', 'PC<2.5'], ['B365C>2.5', 'B365C<2.5']]
        : [['Avg>2.5', 'Avg<2.5'], ['BbAv>2.5', 'BbAv<2.5'], ['B365>2.5', 'B365<2.5'], ['P>2.5', 'P<2.5']];
    foreach ($sets as [$o, $u]) {
        $oo = num($r, $o); $ou = num($r, $u);
        if ($oo && $ou && $oo > 1 && $ou > 1) return [$oo, $ou];
    }
    return null;
}

function odds_ah(array $r): ?array
{
    $line = num($r, 'AHh', 'BbAHh');
    $h = num($r, 'AvgAHH', 'BbAvAHH', 'B365AHH');
    $a = num($r, 'AvgAHA', 'BbAvAHA', 'B365AHA');
    if ($line === null || !$h || !$a) return null;
    return [$line, $h, $a];
}

function strip_nulls(array $a): array
{
    return array_filter($a, fn($v) => $v !== null);
}

/** Fő bajnokságok sora => egységes meccs objektum */
function norm_main(array $r, string $season): ?array
{
    $date = parse_date($r['Date'] ?? '');
    $home = $r['HomeTeam'] ?? ($r['HT'] ?? '');
    $away = $r['AwayTeam'] ?? ($r['AT'] ?? '');
    if (!$date || $home === '' || $away === '') return null;
    $hg = int_or_null($r, 'FTHG', 'HG');
    $ag = int_or_null($r, 'FTAG', 'AG');
    if ($hg === null || $ag === null) return null;
    $m = [
        'd'   => $date,
        't'   => ($r['Time'] ?? '') ?: null,
        's'   => season_label($season),
        'h'   => $home,
        'a'   => $away,
        'hg'  => $hg,
        'ag'  => $ag,
        'hhg' => int_or_null($r, 'HTHG'),
        'hag' => int_or_null($r, 'HTAG'),
        'hxg' => num($r, 'HxG'),
        'axg' => num($r, 'AxG'),
        'hs'  => int_or_null($r, 'HS'),
        'as'  => int_or_null($r, 'AS'),
        'hst' => int_or_null($r, 'HST'),
        'ast' => int_or_null($r, 'AST'),
        'hf'  => int_or_null($r, 'HF'),
        'af'  => int_or_null($r, 'AF'),
        'hc'  => int_or_null($r, 'HC'),
        'ac'  => int_or_null($r, 'AC'),
        'hy'  => int_or_null($r, 'HY'),
        'ay'  => int_or_null($r, 'AY'),
        'hr'  => int_or_null($r, 'HR'),
        'ar'  => int_or_null($r, 'AR'),
        'ref' => ($r['Referee'] ?? '') ?: null,
        'o'   => odds_1x2($r),
        'oc'  => odds_1x2($r, true),
        'om'  => odds_max($r),
        'ou'  => odds_ou($r),
        'ouc' => odds_ou($r, true),
        'ah'  => odds_ah($r),
    ];
    return strip_nulls($m);
}

/** Extra bajnokságok sora */
function norm_extra(array $r): ?array
{
    $date = parse_date($r['Date'] ?? '');
    $home = $r['Home'] ?? '';
    $away = $r['Away'] ?? '';
    if (!$date || $home === '' || $away === '') return null;
    $hg = int_or_null($r, 'HG');
    $ag = int_or_null($r, 'AG');
    if ($hg === null || $ag === null) return null;
    $oc = odds_1x2($r, true);
    $m = [
        'd'  => $date,
        't'  => ($r['Time'] ?? '') ?: null,
        's'  => $r['Season'] ?? '',
        'h'  => $home,
        'a'  => $away,
        'hg' => $hg,
        'ag' => $ag,
        'oc' => $oc,
        'om' => odds_max($r, true),
    ];
    return strip_nulls($m);
}

/** Egy bajnokság meccsei (legfrissebb $count szezon). */
function league_matches(string $code, int $count, ?string $fromSeason = null): array
{
    global $LEAGUES;
    $info = $LEAGUES[$code];
    $matches = [];
    $seasons = [];
    if ($info[3] === 'main') {
        $codes = season_codes($count, $fromSeason);
        $cur = current_season_code();
        $items = [];
        foreach ($codes as $s) {
            $items[$s] = ["mmz4281/$s/$code.csv", $s === $cur ? TTL_LIVE : TTL_OLD];
        }
        $files = fetch_many($items);
        foreach ($codes as $s) {
            $rows = parse_csv($files[$s] ?? null);
            if (!$rows) continue;
            $seasons[] = season_label($s);
            foreach ($rows as $r) {
                $m = norm_main($r, $s);
                if ($m) $matches[] = $m;
            }
        }
    } else {
        $files = fetch_many(['x' => ["new/$code.csv", TTL_LIVE]]);
        $rows = parse_csv($files['x'] ?? null);
        $all = [];
        foreach ($rows as $r) {
            $m = norm_extra($r);
            if ($m) $all[] = $m;
        }
        $labels = array_values(array_unique(array_map(fn($m) => $m['s'], $all)));
        usort($labels, fn($a, $b) => strcmp($b, $a));
        $start = 0;
        if ($fromSeason) {
            $idx = array_search($fromSeason, $labels, true);
            if ($idx !== false) $start = $idx;
        }
        $keep = array_slice($labels, $start, $count);
        $seasons = $keep;
        $matches = array_values(array_filter($all, fn($m) => in_array($m['s'], $keep, true)));
    }
    usort($matches, fn($a, $b) => strcmp($a['d'] . ($a['t'] ?? ''), $b['d'] . ($b['t'] ?? '')));
    return ['matches' => $matches, 'seasons' => $seasons];
}

/** Elérhető szezonok listája egy bajnokságnál */
function league_seasons(string $code): array
{
    global $LEAGUES;
    if ($LEAGUES[$code][3] === 'main') {
        return array_map('season_label', season_codes(20));
    }
    $files = fetch_many(['x' => ["new/$code.csv", TTL_LIVE]]);
    $rows = parse_csv($files['x'] ?? null);
    $labels = array_values(array_unique(array_map(fn($r) => $r['Season'] ?? '', $rows)));
    $labels = array_filter($labels);
    usort($labels, fn($a, $b) => strcmp($b, $a));
    return array_values($labels);
}

function label_to_code(string $label): ?string
{
    if (preg_match('#^20(\d{2})/(\d{2})$#', $label, $m)) return $m[1] . $m[2];
    return null;
}


/* ------------------------------------------------------------------ */
/* Összetett adatok (API végpontok és statikus build)                  */
/* ------------------------------------------------------------------ */

function leagues_data(): array
{
    global $LEAGUES;
    $out = [];
    foreach ($LEAGUES as $code => $l) {
        $out[] = [
            'code' => $code, 'country' => $l[0], 'name' => $l[1], 'cc' => $l[2],
            'type' => $l[3], 'group' => $l[4], 'tier' => $l[5],
        ];
    }
    return ['leagues' => $out, 'season' => season_label(current_season_code()), 'today' => date('Y-m-d')];
}

function fixtures_data(): array
{
    global $LEAGUES, $EXTRA_BY_COUNTRY;
    $files = fetch_many([
        'main'  => ['fixtures.csv', TTL_FIX],
        'extra' => ['new_league_fixtures.csv', TTL_FIX],
    ]);
    $out = [];
    foreach (parse_csv($files['main'] ?? null) as $r) {
        $code = $r['Div'] ?? '';
        if (!isset($LEAGUES[$code])) continue;
        $date = parse_date($r['Date'] ?? '');
        if (!$date) continue;
        $out[] = strip_nulls([
            'l' => $code, 'd' => $date, 't' => ($r['Time'] ?? '') ?: null,
            'h' => $r['HomeTeam'] ?? '', 'a' => $r['AwayTeam'] ?? '',
            'ref' => ($r['Referee'] ?? '') ?: null,
            'o' => odds_1x2($r), 'om' => odds_max($r),
            'b365' => (num($r, 'B365H') ? [num($r, 'B365H'), num($r, 'B365D'), num($r, 'B365A')] : null),
            'ou' => odds_ou($r),
            'oum' => (num($r, 'Max>2.5') ? [num($r, 'Max>2.5'), num($r, 'Max<2.5')] : null),
            'ah' => odds_ah($r),
        ]);
    }
    foreach (parse_csv($files['extra'] ?? null) as $r) {
        $code = $EXTRA_BY_COUNTRY[$r['Country'] ?? ''] ?? null;
        if (!$code) continue;
        $date = parse_date($r['Date'] ?? '');
        if (!$date) continue;
        $out[] = strip_nulls([
            'l' => $code, 'd' => $date, 't' => ($r['Time'] ?? '') ?: null,
            'h' => $r['Home'] ?? '', 'a' => $r['Away'] ?? '',
            'o' => odds_1x2($r) ?? (num($r, 'PSH') ? [num($r, 'PSH'), num($r, 'PSD'), num($r, 'PSA')] : null),
            'om' => odds_max($r),
            'b365' => (num($r, 'B365H') ? [num($r, 'B365H'), num($r, 'B365D'), num($r, 'B365A')] : null),
        ]);
    }
    usort($out, fn($a, $b) => strcmp($a['d'] . ($a['t'] ?? '') . $a['l'], $b['d'] . ($b['t'] ?? '') . $b['l']));
    return ['fixtures' => $out, 'updated' => date('c')];
}

function teams_data(): array
{
    global $LEAGUES;
    $cur = current_season_code();
    $prev = season_codes(2)[1];
    $items = [];
    foreach ($LEAGUES as $code => $l) {
        if ($l[3] === 'main') {
            $items["$code|c"] = ["mmz4281/$cur/$code.csv", TTL_LIVE];
            $items["$code|p"] = ["mmz4281/$prev/$code.csv", TTL_OLD];
        } else {
            $items["$code|x"] = ["new/$code.csv", TTL_LIVE];
        }
    }
    $files = fetch_many($items);
    $teams = [];
    foreach ($LEAGUES as $code => $l) {
        $names = [];
        if ($l[3] === 'main') {
            $rows = parse_csv($files["$code|c"] ?? null);
            if (!$rows) $rows = parse_csv($files["$code|p"] ?? null);
            foreach ($rows as $r) {
                foreach (['HomeTeam', 'AwayTeam'] as $k) if (!empty($r[$k])) $names[$r[$k]] = true;
            }
        } else {
            $rows = parse_csv($files["$code|x"] ?? null);
            $last = '';
            foreach ($rows as $r) if (($r['Season'] ?? '') > $last) $last = $r['Season'];
            foreach ($rows as $r) {
                if (($r['Season'] ?? '') !== $last) continue;
                foreach (['Home', 'Away'] as $k) if (!empty($r[$k])) $names[$r[$k]] = true;
            }
        }
        foreach (array_keys($names) as $n) $teams[] = ['n' => (string)$n, 'l' => $code];
    }
    usort($teams, fn($a, $b) => strcasecmp($a['n'], $b['n']));
    return ['teams' => $teams];
}

function h2h_data(string $code, string $home, string $away, int $count): array
{
    global $LEAGUES;
    $group = $LEAGUES[$code][4];
    $out = [];
    foreach ($LEAGUES as $c => $l) {
        if ($l[4] !== $group) continue;
        $data = league_matches($c, $count);
        foreach ($data['matches'] as $m) {
            if (($m['h'] === $home && $m['a'] === $away) || ($m['h'] === $away && $m['a'] === $home)) {
                $m['l'] = $c;
                $out[] = $m;
            }
        }
    }
    usort($out, fn($a, $b) => strcmp($b['d'], $a['d']));
    return ['matches' => $out];
}