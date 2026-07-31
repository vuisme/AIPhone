@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
echo Opening AIPhone Studio at http://127.0.0.1:4173
start "" http://127.0.0.1:4173
node desktop-host\server.mjs
if errorlevel 1 pause
