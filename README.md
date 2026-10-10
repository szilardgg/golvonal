# Gólvonal

Labdarúgó-mérkőzések esélyei az eddigi eredmények alapján, 38 bajnokságból.

- **Meccsek** – a közelgő mérkőzések: hazai győzelem, döntetlen, vendég győzelem, 3+ gól, mindkét csapat lő
- **Elemzés** – bármely két csapat párosítása: legvalószínűbb kimenetek, gólok, félidő, szögletek, lapok, pontos eredmény, forma, egymás elleni meccsek
- **Bajnokságok** – tabella, eredmények, csapatstatisztika
- **Csapatok** és **Összevetés**

Az esélyeket súlyozott Poisson-modell (Dixon–Coles korrekcióval) számolja a lejátszott meccsek góljaiból, várható góljaiból (xG) és záró szorzóiból.
Adatforrás: [football-data.co.uk](https://www.football-data.co.uk).

## Futtatás saját gépen

PHP 8 kell (pl. XAMPP). Indítás: `start.bat`, majd <http://localhost:8080>.

## GitHub Pages

A `.github/workflows/pages.yml` 3 óránként letölti a friss adatokat, a `build.php`
statikus JSON fájlokat készít belőlük, és közzéteszi az oldalt. Első beállítás:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
