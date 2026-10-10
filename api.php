<?php
/**
 * Gólvonal – adat API (helyi / PHP-s futtatáshoz)
 * GitHub Pages-en a build.php által előállított statikus JSON fájlok helyettesítik.
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        case 'leagues':
            respond(leagues_data());

        case 'league':
            $code = strtoupper($_GET['code'] ?? '');
            if (!isset($LEAGUES[$code])) fail('Ismeretlen bajnokság');
            $count = max(1, min(12, (int)($_GET['seasons'] ?? 2)));
            $from = $_GET['from'] ?? null;
            if ($from !== null && $LEAGUES[$code][3] === 'main') $from = label_to_code($from);
            $data = league_matches($code, $count, $from ?: null);
            respond(['code' => $code] + $data);

        case 'seasons':
            $code = strtoupper($_GET['code'] ?? '');
            if (!isset($LEAGUES[$code])) fail('Ismeretlen bajnokság');
            respond(['code' => $code, 'seasons' => league_seasons($code)]);

        case 'fixtures':
            respond(fixtures_data());

        case 'teams':
            ensure_cache_dir();
            $idxFile = CACHE_DIR . '/teams_index.json';
            if (is_file($idxFile) && time() - filemtime($idxFile) < 6 * 3600) {
                header('Content-Type: application/json; charset=utf-8');
                readfile($idxFile);
                exit;
            }
            $json = json_encode(teams_data(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            @file_put_contents($idxFile, $json, LOCK_EX);
            header('Content-Type: application/json; charset=utf-8');
            echo $json;
            exit;

        case 'h2h':
            $code = strtoupper($_GET['code'] ?? '');
            $home = (string)($_GET['home'] ?? '');
            $away = (string)($_GET['away'] ?? '');
            if (!isset($LEAGUES[$code]) || $home === '' || $away === '') fail('Hiányzó paraméter');
            $count = max(2, min(15, (int)($_GET['seasons'] ?? 10)));
            respond(h2h_data($code, $home, $away, $count));

        case 'clearcache':
            ensure_cache_dir();
            $n = 0;
            foreach (glob(CACHE_DIR . '/*') ?: [] as $f) {
                if (!is_file($f) || basename($f) === '.htaccess') continue;
                // csak a frissülő fájlokat töröljük, a lezárt szezonokat megtartjuk
                if (str_contains($f, current_season_code()) || str_contains($f, 'fixtures') || str_contains($f, 'new_') || str_contains($f, 'teams_index')) {
                    @unlink($f);
                    $n++;
                }
            }
            respond(['cleared' => $n]);

        default:
            fail('Ismeretlen művelet');
    }
} catch (Throwable $e) {
    fail('Szerverhiba: ' . $e->getMessage(), 500);
}
