<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Csak parancssorból futtatható.');
}

require __DIR__ . '/lib.php';
set_time_limit(0);

$out = rtrim($argv[1] ?? (__DIR__ . '/_site'), "/\\");
$seasonCount = max(2, min(12, (int)($argv[2] ?? 6)));
$started = microtime(true);

function out_json(string $path, array $data): void
{
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0775, true);
    file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
}

function copy_dir(string $src, string $dst): void
{
    if (!is_dir($dst)) mkdir($dst, 0775, true);
    foreach (scandir($src) as $f) {
        if ($f === '.' || $f === '..') continue;
        $s = "$src/$f";
        $d = "$dst/$f";
        is_dir($s) ? copy_dir($s, $d) : copy($s, $d);
    }
}

function season_key(string $label): string
{
    return trim(preg_replace('/[^0-9]+/', '-', $label), '-');
}

function log_line(string $msg): void
{
    fwrite(STDOUT, $msg . PHP_EOL);
}

if (!is_dir($out)) mkdir($out, 0775, true);
copy_dir(__DIR__ . '/assets', "$out/assets");
$GV_STATIC = true;
ob_start();
include __DIR__ . '/index.php';
file_put_contents("$out/index.html", ob_get_clean());
file_put_contents("$out/.nojekyll", '');
log_line('Felület kész.');

$updated = date('c');
out_json("$out/data/leagues.json", leagues_data() + ['updated' => $updated, 'static' => true]);
$fx = fixtures_data();
out_json("$out/data/fixtures.json", $fx);
log_line('Közelgő meccsek: ' . count($fx['fixtures']));
$teams = teams_data();
out_json("$out/data/teams.json", $teams);
log_line('Csapatok: ' . count($teams['teams']));

$total = 0;
foreach ($LEAGUES as $code => $l) {
    $data = league_matches($code, $seasonCount);
    $by = [];
    foreach ($data['matches'] as $m) $by[$m['s']][] = $m;
    $index = [];
    foreach ($data['seasons'] as $label) {
        $key = season_key($label);
        $list = $by[$label] ?? [];
        out_json("$out/data/league/$code/$key.json", ['code' => $code, 'season' => $label, 'matches' => $list]);
        $index[] = ['s' => $label, 'k' => $key, 'n' => count($list)];
        $total += count($list);
    }
    out_json("$out/data/league/$code/index.json", ['code' => $code, 'seasons' => $index]);
    log_line(sprintf('%-4s %-28s %s', $code, $l[1], implode(', ', array_map(fn($x) => $x['s'] . ' (' . $x['n'] . ')', $index))));
}

log_line(sprintf('Kész: %d meccs, %.1f mp - %s', $total, microtime(true) - $started, $out));
