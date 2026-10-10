@echo off
chcp 65001 >nul
title Golvonal frissites
cd /d "%~dp0"

set "PHP=php"
where php >nul 2>nul
if errorlevel 1 set "PHP=C:\xampp\php\php.exe"

set "GIT="
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
where git >nul 2>nul
if not errorlevel 1 set "GIT=git"
if not defined GIT (
  echo Nem talalhato git. Telepitsd a GitHub Desktopot.
  pause
  exit /b 1
)

echo Adatok letoltese...
if exist _site rmdir /s /q _site
"%PHP%" build.php _site 6
if errorlevel 1 (
  echo Hiba az adatok letoltesekor.
  pause
  exit /b 1
)

echo Feltoltes...
cd _site
"%GIT%" init -q -b gh-pages
"%GIT%" -c core.autocrlf=false add -A
"%GIT%" commit -q -m "Adatok"
"%GIT%" -c credential.helper= -c "credential.https://github.com.helper=!'C:/Program Files/GitHub CLI/gh.exe' auth git-credential" push -q --force https://github.com/szilardgg/golvonal.git gh-pages
if errorlevel 1 (
  echo Hiba a feltolteskor.
  cd ..
  pause
  exit /b 1
)
cd ..

echo.
echo Kesz. Par perc mulva frissul: https://szilardgg.github.io/golvonal/
pause
