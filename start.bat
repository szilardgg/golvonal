@echo off
chcp 65001 >nul
title Golvonal
cd /d "%~dp0"

set "PHP=php"
where php >nul 2>nul
if errorlevel 1 (
  if exist "C:\xampp\php\php.exe" (
    set "PHP=C:\xampp\php\php.exe"
  ) else (
    echo Nem talalhato PHP. Telepitsd az XAMPP-ot, vagy add hozza a php.exe-t a PATH-hoz.
    pause
    exit /b 1
  )
)

echo Golvonal indul: http://localhost:8080
echo Bezarashoz zard be ezt az ablakot.
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8080/"
"%PHP%" -S localhost:8080 -t "%~dp0."
