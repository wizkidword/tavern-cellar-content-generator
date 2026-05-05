@echo off
setlocal

set "APP_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:3000"
set "APP_PORT=3000"

cd /d "%APP_DIR%"
title Tavern Cellar Foundry Launcher

echo.
echo Tavern Cellar Foundry
echo =====================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found on PATH.
  echo Install Node.js with npm, then run this launcher again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort %APP_PORT% -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 0 } exit 1"
if not errorlevel 1 (
  echo Found an existing server on %APP_URL%.
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules\@prisma\client" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo.
  echo WARNING: .env was not found.
  echo Create .env from .env.example before generating or publishing articles.
  echo.
)

echo Preparing local database...
call npx prisma db push
if errorlevel 1 (
  echo Prisma setup failed.
  pause
  exit /b 1
)

echo Starting local server...
start "Tavern Cellar Foundry Server" cmd /k "cd /d ""%APP_DIR%"" && npm run dev -- --hostname 127.0.0.1 --port %APP_PORT%"

echo Waiting for %APP_URL%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = '%APP_URL%'; for ($i = 0; $i -lt 45; $i++) { try { $response = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch { Start-Sleep -Seconds 1 } }; exit 1"
if errorlevel 1 (
  echo The server did not answer yet. Check the server window for details.
  pause
  exit /b 1
)

start "" "%APP_URL%"
echo Foundry is open at %APP_URL%.
exit /b 0
